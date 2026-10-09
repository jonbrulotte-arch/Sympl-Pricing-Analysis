"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type {
  ChannelConfig,
  ChannelDefaults,
  ProductRow,
  AnalysisResult,
  BrandRoyaltyTable,
  Overrides,
  ChannelFlags,
  RoyaltyRuleEntry,
  ItemTypeCommissionTable,
} from "@/lib/pricing/types";
import { analyzeProduct } from "@/lib/pricing/engine";
import { brandKey } from "@/lib/pricing/helpers";
import { shipComponentsFor, type ShipComponentKey, type ShippingChanges } from "@/lib/pricing/shipping";

export type StatusFilter = "all" | "pass" | "below" | "loss" | "unpriced";

interface ChannelWithDb {
  id: string;
  name: string;
  tabLabel: string;
  shippingMode: string;
  priceField: string;
  fallbackPriceField?: string | null;
  channelType?: string;
  hasCoupon: boolean;
  hasTax: boolean;
  hasCommission: boolean;
  hasTopSellerDisc: boolean;
  hasPromotedListing: boolean;
  hasFvfFixed: boolean;
  hasCardProcessing: boolean;
  hasPpc: boolean;
  hasAdvertising: boolean;
  hasPerSkuCommission: boolean;
  hasFallback: boolean;
  hasAsin: boolean;
  defaults: Record<string, unknown>;
  blockedBrands: string[];
  /** Product ids sold on this channel (from its Salsify list); null = no restriction. */
  channelProductIds?: string[] | null;
}

function toChannelConfig(ch: ChannelWithDb): ChannelConfig {
  return {
    id: ch.id,
    name: ch.name,
    tabLabel: ch.tabLabel,
    shippingMode: ch.shippingMode as "std" | "mcf" | "fba",
    priceField: ch.priceField,
    fallbackPriceField: ch.fallbackPriceField ?? undefined,
    channelType: ch.channelType === "commercial" ? "commercial" : "online",
    flags: {
      coupon: ch.hasCoupon,
      tax: ch.hasTax,
      comm: ch.hasCommission,
      tsd: ch.hasTopSellerDisc,
      promo: ch.hasPromotedListing,
      fvf: ch.hasFvfFixed,
      cc: ch.hasCardProcessing,
      ppc: ch.hasPpc,
      ad: ch.hasAdvertising,
      commSku: ch.hasPerSkuCommission,
      fb: ch.hasFallback,
      asin: ch.hasAsin,
    },
    defaults: ch.defaults as unknown as ChannelDefaults,
  };
}

export function useAnalysis(
  channels: ChannelWithDb[],
  products: ProductRow[],
  brandRoyalties: BrandRoyaltyTable,
  customerId: string,
  royaltyRules: RoyaltyRuleEntry[] = [],
  itemTypeCommissions?: ItemTypeCommissionTable,
  initialTab?: string,
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [brandFilter, setBrandFilter] = useState<string[]>([]);
  const [sortKey, setSortKey] = useState<string>("sku");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [pageSize, setPageSize] = useState<number | "all">(25);
  const [page, setPage] = useState(1);

  const configs = useMemo(() => channels.map(toChannelConfig), [channels]);

  const blockedBrands = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    for (const ch of channels) {
      m[ch.id] = new Set((ch.blockedBrands ?? []).map((b: string) => brandKey(b)));
    }
    return m;
  }, [channels]);

  const allowedProducts = useMemo(() => {
    const m: Record<string, Set<string> | null> = {};
    for (const ch of channels) m[ch.id] = ch.channelProductIds ? new Set(ch.channelProductIds) : null;
    return m;
  }, [channels]);

  const results = useMemo(() => {
    const all: Record<string, AnalysisResult[]> = {};
    for (const cfg of configs) {
      const settings = settingsMap[cfg.id] as unknown as ChannelDefaults;
      const blocked = blockedBrands[cfg.id];
      const allowed = allowedProducts[cfg.id];
      const committed = committedPrices[cfg.id];
      all[cfg.id] = products
        .filter((p) => !blocked?.has(brandKey(p.brand)))
        .filter((p) => !allowed || (p.productId != null && allowed.has(p.productId)))
        .map((p) => {
          let row: ProductRow = { ...p, ...committedShip[p.sku], ...shipEdits[p.sku] };
          if (committed?.[p.sku] != null) {
            row = {
              ...row,
              [cfg.priceField]: committed[p.sku],
              channelPrices: { ...p.channelPrices, [cfg.id]: committed[p.sku] },
            };
          }
          const result = analyzeProduct(row, cfg, settings, overrides, brandRoyalties, royaltyRules, itemTypeCommissions);
          const edits = shipEdits[p.sku];
          result.shipEdited = !!edits && shipComponentsFor(cfg).some((c) => edits[c.key] != null);
          return result;
        });
    }
    return all;
  }, [configs, products, settingsMap, overrides, brandRoyalties, blockedBrands, allowedProducts, committedPrices, royaltyRules, itemTypeCommissions, shipEdits, committedShip]);

  const allBrands = useMemo(() => {
    const set = new Set<string>();
    for (const r of results[activeTab] ?? []) {
      if (r.brand) set.add(r.brand);
    }
    return Array.from(set).sort();
  }, [results, activeTab]);

  const filteredResults = useMemo(() => {
    const channelResults = results[activeTab] ?? [];
    return channelResults.filter((r) => {
      if (statusFilter !== "all" && r.baseStatus !== statusFilter) return false;
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
  }, [results, activeTab, statusFilter, search, brandFilter]);

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
  }, [activeTab, statusFilter, search, brandFilter, sortKey, sortDir, pageSize]);

  const totalPages = pageSize === "all" ? 1 : Math.max(1, Math.ceil(sortedResults.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const pagedResults = useMemo(() => {
    if (pageSize === "all") return sortedResults;
    const start = (safePage - 1) * pageSize;
    return sortedResults.slice(start, start + pageSize);
  }, [sortedResults, pageSize, safePage]);

  const kpis = useMemo(() => {
    const channelResults = results[activeTab] ?? [];
    const valid = channelResults.filter((r) => !r.invalid);
    const atGoal = valid.filter((r) => r.baseStatus === "pass").length;
    const below = valid.filter((r) => r.baseStatus === "below").length;
    const loss = valid.filter((r) => r.baseStatus === "loss").length;
    const unpriced = valid.filter((r) => r.baseStatus === "unpriced").length;
    const priced = valid.filter((r) => r.price > 0);
    const avgGm = priced.length > 0 ? priced.reduce((s, r) => s + r.gm, 0) / priced.length : 0;
    const totalMargin = priced.reduce((s, r) => s + r.net, 0);
    const needRepricing = valid.filter((r) => r.rec != null && r.rec !== r.price).length;

    return { total: valid.length, atGoal, below, loss, unpriced, avgGm, totalMargin, needRepricing };
  }, [results, activeTab]);

  const setOverride = useCallback((channelId: string, sku: string, field: "price" | "ship", value: number | undefined) => {
    setOverrides((prev) => {
      const next = { ...prev };
      if (!next[channelId]) next[channelId] = {};
      if (!next[channelId][sku]) next[channelId][sku] = {};
      if (value === undefined) {
        delete next[channelId][sku][field];
        if (Object.keys(next[channelId][sku]).length === 0) delete next[channelId][sku];
      } else {
        next[channelId][sku][field] = value;
      }
      return next;
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
  };
}
