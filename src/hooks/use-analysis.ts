"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type {
  ProductRow,
  AnalysisResult,
  BrandRoyaltyTable,
  Overrides,
  RoyaltyRuleEntry,
  ItemTypeCommissionTable,
} from "@/lib/pricing/types";
import { brandKey } from "@/lib/pricing/helpers";
import type { ShipComponentKey, ShippingChanges } from "@/lib/pricing/shipping";
import { computeChannelResults, toChannelConfig, type ChannelWithDb, type ChannelEdits } from "@/lib/pricing/compute-results";

/** "disc" shows only discontinued SKUs, whatever their status. */
export type StatusFilter = "all" | "pass" | "below" | "loss" | "unpriced" | "disc";

/**
 * Set for users without data:viewCost: products arrive without cost, and results are computed by
 * POST /api/customers/[customerId]/analysis instead of in the browser.
 */
/** The Comparison tab: every channel side by side. */
export const COMPARE_TAB = "__compare__";

export interface ServerComputeScope {
  projectId?: string;
  /** The page's channel selection (single-channel or selected-channels views). */
  channelIds?: string[];
}

type SentEdits = Required<Omit<ChannelEdits, "overrides">> & { overrides: Overrides[string] };

/** SKUs whose entry differs between two per-SKU maps. */
function changedKeys(a: Record<string, unknown>, b: Record<string, unknown>, into: Set<string>) {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) into.add(k);
  }
}

export function useAnalysis(
  channels: ChannelWithDb[],
  products: ProductRow[],
  brandRoyalties: BrandRoyaltyTable,
  customerId: string,
  royaltyRules: RoyaltyRuleEntry[] = [],
  itemTypeCommissions?: ItemTypeCommissionTable,
  initialTab?: string,
  serverCompute?: ServerComputeScope | null,
) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>(initialTab ?? channels[0]?.id ?? "");
  const [overrides, setOverrides] = useState<Overrides>({});
  const [committedPrices, setCommittedPrices] = useState<Record<string, Record<string, number>>>({});
  const [committedSkus, setCommittedSkus] = useState<Record<string, Set<string>>>({});
  // Shipping costs are product-level, so edits apply to every channel tab.
  const [shipEdits, setShipEdits] = useState<Record<string, ShippingChanges>>({});
  const [committedShip, setCommittedShip] = useState<Record<string, ShippingChanges>>({});
  const [settingsMap, setSettingsMap] = useState<Record<string, Record<string, unknown>>>(() => {
    const m: Record<string, Record<string, unknown>> = {};
    for (const ch of channels) m[ch.id] = { ...(ch.defaults as Record<string, unknown>) };
    return m;
  });
  const [statusFilter, setStatusFilterState] = useState<StatusFilter>("all");
  // Hides discontinued SKUs from the table, KPIs and exports on every tab. Can't be on with the Discontinued filter.
  const [hideDiscontinued, setHideDiscontinuedState] = useState(false);
  const setStatusFilter = useCallback((f: StatusFilter) => {
    setStatusFilterState(f);
    if (f === "disc") setHideDiscontinuedState(false);
  }, []);
  const setHideDiscontinued = useCallback((hide: boolean) => {
    setHideDiscontinuedState(hide);
    if (hide) setStatusFilterState((f) => (f === "disc" ? "all" : f));
  }, []);

  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string>("sku");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<number | "all">(25);
  const [page, setPage] = useState(1);

  const configs = useMemo(() => channels.map(toChannelConfig), [channels]);

  const ctx = useMemo(
    () => ({ brandRoyalties, royaltyRules, itemTypeCommissions }),
    [brandRoyalties, royaltyRules, itemTypeCommissions],
  );

  const filters = useMemo(() => {
    const m: Record<string, { blocked: Set<string>; allowed: Set<string> | null }> = {};
    for (const ch of channels) {
      m[ch.id] = {
        blocked: new Set((ch.blockedBrands ?? []).map((b: string) => brandKey(b))),
        allowed: ch.channelProductIds ? new Set(ch.channelProductIds) : null,
      };
    }
    return m;
  }, [channels]);

  const localResults = useMemo(() => {
    const all: Record<string, AnalysisResult[]> = {};
    if (serverCompute) return all;
    for (const ch of channels) {
      all[ch.id] = computeChannelResults(
        ch,
        products,
        ctx,
        {
          settings: settingsMap[ch.id],
          overrides,
          shipEdits,
          committedShip,
          committedPrices: committedPrices[ch.id],
        },
        filters[ch.id],
      );
    }
    return all;
  }, [serverCompute, channels, products, ctx, filters, settingsMap, overrides, shipEdits, committedShip, committedPrices]);

  // Server-computed results (users without data:viewCost), fetched per channel tab.
  const [serverResults, setServerResults] = useState<Record<string, AnalysisResult[]>>({});
  const [computeError, setComputeError] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(0);
  const sentRef = useRef<Record<string, SentEdits>>({});
  const abortRef = useRef<Record<string, AbortController>>({});
  const productIdBySku = useMemo(() => new Map(products.map((p) => [p.sku, p.productId])), [products]);

  useEffect(() => {
    if (!serverCompute) return;
    // The active channel tab, or every channel while the Comparison tab is open.
    const targets = activeTab === COMPARE_TAB ? channels : channels.filter((c) => c.id === activeTab);
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const ch of targets) {
      const current: SentEdits = {
        settings: settingsMap[ch.id],
        overrides: overrides[ch.id] ?? {},
        shipEdits,
        committedShip,
        committedPrices: committedPrices[ch.id] ?? {},
      };
      const prev = sentRef.current[ch.id];
      const busy = !!abortRef.current[ch.id];

      // A whole channel on first view, after a settings change, or when superseding a request in flight;
      // otherwise only the SKUs whose edits changed since the last request.
      let productIds: string[] | undefined;
      if (prev && !busy && JSON.stringify(prev.settings) === JSON.stringify(current.settings)) {
        const skus = new Set<string>();
        changedKeys(prev.overrides, current.overrides, skus);
        changedKeys(prev.shipEdits, current.shipEdits, skus);
        changedKeys(prev.committedShip, current.committedShip, skus);
        changedKeys(prev.committedPrices, current.committedPrices, skus);
        if (skus.size === 0) continue;
        productIds = [...skus].map((sku) => productIdBySku.get(sku)).filter((id): id is string => !!id);
        if (productIds.length === 0) continue;
      }

      timers.push(setTimeout(async () => {
        abortRef.current[ch.id]?.abort();
        const controller = new AbortController();
        abortRef.current[ch.id] = controller;
        // A deep copy, so later edits can't change what we compare against.
        sentRef.current[ch.id] = structuredClone(current);
        setInFlight((n) => n + 1);
        try {
          const res = await fetch(`/api/customers/${customerId}/analysis`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              channelId: ch.id,
              projectId: serverCompute.projectId,
              channelIds: serverCompute.channelIds,
              productIds,
              edits: current,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Failed to calculate the analysis");
          const fresh = data.results as AnalysisResult[];
          setServerResults((prevResults) => {
            if (!productIds) return { ...prevResults, [ch.id]: fresh };
            const bySku = new Map(fresh.map((r) => [r.sku, r]));
            return { ...prevResults, [ch.id]: (prevResults[ch.id] ?? []).map((r) => bySku.get(r.sku) ?? r) };
          });
          setComputeError(null);
        } catch (err) {
          if (controller.signal.aborted) return;
          delete sentRef.current[ch.id]; // recompute the whole channel on the next attempt
          setComputeError(err instanceof Error ? err.message : "Failed to calculate the analysis");
        } finally {
          if (abortRef.current[ch.id] === controller) delete abortRef.current[ch.id];
          setInFlight((n) => n - 1);
        }
      }, productIds ? 150 : 0));
    }
    return () => timers.forEach(clearTimeout);
  }, [serverCompute, channels, activeTab, customerId, settingsMap, overrides, shipEdits, committedShip, committedPrices, productIdBySku]);

  useEffect(() => {
    const aborts = abortRef.current;
    return () => Object.values(aborts).forEach((c) => c.abort());
  }, []);

  const results = serverCompute ? serverResults : localResults;
  const computing =
    !!serverCompute &&
    (inFlight > 0 ||
      (activeTab === COMPARE_TAB
        ? channels.some((c) => !serverResults[c.id])
        : channels.some((c) => c.id === activeTab) && !serverResults[activeTab]));

  const allBrands = useMemo(() => {
    const set = new Set<string>();
    for (const r of results[activeTab] ?? []) {
      if (r.brand) set.add(r.brand);
    }
    return Array.from(set).sort();
  }, [results, activeTab]);

  // The active tab's results after the Hide discontinued toggle; everything else on the tab works from these.
  const scopedResults = useMemo(() => {
    const channelResults = results[activeTab] ?? [];
    return hideDiscontinued ? channelResults.filter((r) => !r.disc) : channelResults;
  }, [results, activeTab, hideDiscontinued]);

  const filteredResults = useMemo(() => {
    return scopedResults.filter((r) => {
      if (statusFilter === "disc") {
        if (!r.disc) return false;
      } else if (statusFilter !== "all" && r.baseStatus !== statusFilter) return false;
      if (brandFilter.length > 0 && !brandFilter.includes(r.brand ?? "")) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.sku.toLowerCase().includes(q) &&
          !(r.name ?? "").toLowerCase().includes(q) &&
          !(r.brand ?? "").toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [scopedResults, statusFilter, search, brandFilter]);

  const sortedResults = useMemo(() => {
    const sorted = [...filteredResults];
    sorted.sort((a, b) => {
      let av: number | string = "";
      let bv: number | string = "";
      switch (sortKey) {
        case "sku": av = a.sku; bv = b.sku; break;
        case "name": av = a.name ?? ""; bv = b.name ?? ""; break;
        case "cost": av = a.cost ?? 0; bv = b.cost ?? 0; break;
        case "price": av = a.price; bv = b.price; break;
        case "gm": av = a.gm; bv = b.gm; break;
        case "net": av = a.net; bv = b.net; break;
        case "rec": av = a.rec ?? 0; bv = b.rec ?? 0; break;
        case "delta": av = a.deltaPct ?? 0; bv = b.deltaPct ?? 0; break;
        case "brand": av = a.brand ?? ""; bv = b.brand ?? ""; break;
        default: av = a.sku; bv = b.sku;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return sorted;
  }, [filteredResults, sortKey, sortDir]);

  useEffect(() => {
    setPage(1);
  }, [activeTab, statusFilter, hideDiscontinued, search, brandFilter, sortKey, sortDir, pageSize]);

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(sortedResults.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedResults = useMemo(() => {
    if (pageSize === "all") return sortedResults;
    const start = (safePage - 1) * pageSize;
    return sortedResults.slice(start, start + pageSize);
  }, [sortedResults, pageSize, safePage]);

  const kpis = useMemo(() => {
    const valid = scopedResults.filter((r) => !r.invalid);
    const atGoal = valid.filter((r) => r.baseStatus === "pass").length;
    const below = valid.filter((r) => r.baseStatus === "below").length;
    const loss = valid.filter((r) => r.baseStatus === "loss").length;
    const unpriced = valid.filter((r) => r.baseStatus === "unpriced").length;
    const priced = valid.filter((r) => r.price > 0);
    const avgGm = priced.length > 0 ? priced.reduce((s, r) => s + r.gm, 0) / priced.length : 0;
    const totalMargin = priced.reduce((s, r) => s + r.net, 0);
    const needRepricing = valid.filter((r) => r.rec != null && r.rec !== r.price).length;

    return { total: valid.length, atGoal, below, loss, unpriced, avgGm, totalMargin, needRepricing };
  }, [scopedResults]);

  const setOverride = useCallback((channelId: string, sku: string, field: "price" | "ship", value: number | undefined) => {
    // Copy at every level: server-computed results diff the previous overrides against the new ones.
    setOverrides((prev) => {
      const channel = { ...prev[channelId] };
      const entry = { ...channel[sku] };
      if (value === undefined) delete entry[field];
      else entry[field] = value;
      if (Object.keys(entry).length === 0) delete channel[sku];
      else channel[sku] = entry;
      return { ...prev, [channelId]: channel };
    });
    if (field === "price" && value !== undefined) {
      setCommittedSkus((prev) => {
        if (!prev[channelId]?.has(sku)) return prev;
        const next = { ...prev, [channelId]: new Set(prev[channelId]) };
        next[channelId].delete(sku);
        return next;
      });
    }
  }, []);

  /** Edit one per-unit shipping cost component for a product; a value equal to the stored one clears the edit. */
  const setShipEdit = useCallback((sku: string, key: ShipComponentKey, value: number | undefined) => {
    const product = products.find((p) => p.sku === sku);
    const stored = committedShip[sku]?.[key] ?? (product?.[key] as number | null | undefined) ?? null;
    setShipEdits((prev) => {
      const next = { ...prev, [sku]: { ...prev[sku] } };
      if (value === undefined || (stored != null && Math.abs(value - stored) < 0.005)) delete next[sku][key];
      else next[sku][key] = value;
      if (Object.keys(next[sku]).length === 0) delete next[sku];
      return next;
    });
    if (value !== undefined) {
      setCommittedSkus((prev) => {
        let changed = false;
        const next: Record<string, Set<string>> = {};
        for (const [ch, set] of Object.entries(prev)) {
          if (set.has(sku)) {
            changed = true;
            next[ch] = new Set(set);
            next[ch].delete(sku);
          } else next[ch] = set;
        }
        return changed ? next : prev;
      });
    }
  }, [products, committedShip]);

  const updateSetting = useCallback((channelId: string, key: string, value: unknown) => {
    setSettingsMap((prev) => ({
      ...prev,
      [channelId]: { ...prev[channelId], [key]: value },
    }));
  }, []);

  const commitPrice = useCallback(async (sku: string) => {
    const channelId = activeTab;
    const channelResults = results[channelId] ?? [];
    const row = channelResults.find((r) => r.sku === sku);
    if (!row) return;

    const override = overrides[channelId]?.[sku]?.price;
    const shipping = shipEdits[sku];
    // A shipping-only edit commits just the shipping; otherwise commit the edited or recommended price.
    const priceToCommit = override ?? (row.shipEdited ? null : row.rec);
    const currentPrice = row.basePrice ?? row.price;
    const priceChanged =
      priceToCommit != null && priceToCommit > 0 && !(currentPrice > 0 && Math.abs(priceToCommit - currentPrice) < 0.005);
    if (!priceChanged && !shipping) return;

    const res = await fetch(`/api/customers/${customerId}/commit-price`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sku,
        channelId,
        ...(priceChanged && {
          price: priceToCommit,
          oldPrice: (row.basePrice ?? 0) > 0 ? row.basePrice! : undefined,
          oldNetMargin: row.price > 0 ? row.gm : undefined,
          newNetMargin: row.recCalc?.gm ?? undefined,
        }),
        ...(shipping && { shipping }),
      }),
    });

    if (!res.ok) return;

    if (shipping) {
      setCommittedShip((prev) => ({ ...prev, [sku]: { ...prev[sku], ...shipping } }));
      setShipEdits((prev) => {
        const next = { ...prev };
        delete next[sku];
        return next;
      });
    }
    if (!priceChanged) {
      setCommittedSkus((prev) => {
        const next = { ...prev, [channelId]: new Set(prev[channelId] ?? []) };
        next[channelId].add(sku);
        return next;
      });
      setOverride(channelId, sku, "price", undefined);
      router.refresh();
      return;
    }

    setCommittedPrices((prev) => ({
      ...prev,
      [channelId]: { ...prev[channelId], [sku]: priceToCommit! },
    }));
    setCommittedSkus((prev) => {
      const next = { ...prev };
      if (!next[channelId]) next[channelId] = new Set();
      else next[channelId] = new Set(next[channelId]);
      next[channelId].add(sku);
      return next;
    });
    setOverride(channelId, sku, "price", undefined);
    router.refresh();
  }, [activeTab, results, overrides, shipEdits, customerId, setOverride, router]);

  const revertCommittedPrice = useCallback((channelId: string, sku: string, oldPrice: number | null) => {
    setCommittedPrices((prev) => {
      if (oldPrice != null && oldPrice > 0) {
        return { ...prev, [channelId]: { ...prev[channelId], [sku]: oldPrice } };
      }
      const ch = prev[channelId];
      if (!ch || !(sku in ch)) return prev;
      const next = { ...prev, [channelId]: { ...ch } };
      delete next[channelId][sku];
      return next;
    });
    setCommittedShip((prev) => {
      if (!(sku in prev)) return prev;
      const next = { ...prev };
      delete next[sku];
      return next;
    });
  }, []);

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return {
    configs,
    activeTab,
    setActiveTab,
    results,
    filteredResults: sortedResults,
    pagedResults,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    kpis,
    statusFilter,
    setStatusFilter,
    hideDiscontinued,
    setHideDiscontinued,
    scopedResults,
    search,
    setSearch,
    brandFilter,
    setBrandFilter,
    allBrands,
    sortKey,
    sortDir,
    handleSort,
    overrides,
    setOverride,
    setShipEdit,
    settingsMap,
    updateSetting,
    commitPrice,
    revertCommittedPrice,
    committedSkus,
    computing,
    computeError,
  };
}
