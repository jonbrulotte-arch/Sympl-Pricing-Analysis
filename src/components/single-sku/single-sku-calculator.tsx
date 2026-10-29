"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, Download, Loader2, RotateCcw, Save, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkuDetailPanel } from "@/components/analysis/sku-detail-panel";
import { FIELDS_UI, SECTIONS, type FieldUiDef } from "@/lib/pricing/constants";
import { toChannelConfig, type ChannelWithDb } from "@/lib/pricing/compute-results";
import { SHIP_COMPONENTS, shipComponentsFor, type ShipComponentKey } from "@/lib/pricing/shipping";
import type { SingleSkuChannelReport, SingleSkuReportInput } from "@/lib/export/single-sku-report";
import { SingleSkuReport } from "./single-sku-report";
import { PublishAllDialog } from "./publish-all-dialog";
import type { PublishAllRow } from "@/lib/export/single-sku-change-report";
import { cn } from "@/lib/utils";
import type { AnalysisResult, ChannelDefaults, ChannelFlags } from "@/lib/pricing/types";

interface SetupProduct {
  id: string;
  sku: string;
  name: string;
  brand: string;
  amzItemType: string;
  cost: number | null;
  price: number | null;
  shipping: Record<ShipComponentKey, number | null>;
  /** Whether the SKU is one of this customer's products (needed to commit its price). */
  onCustomer: boolean;
}

interface Setup {
  channel: ChannelWithDb;
  costHidden: boolean;
  canCommit: boolean;
  /** Salsify is set up for this channel and the user can publish with their own API key. */
  canPublish: boolean;
  product: SetupProduct | null;
}

/** Inputs that belong to the product, shared by every channel. */
interface Shared {
  sku: string;
  name: string;
  brand: string;
  amzItemType: string;
  cost: string;
  units: string;
  shipping: Record<ShipComponentKey, string>;
}

type SettingValue = string | boolean;
type Computed = { result: AnalysisResult; warnings: string[] };

/** Allocation sections shown in the calculator (brand availability and lifecycle don't apply to one SKU). */
const CALC_SECTIONS = ["goal", "market", "royalty", "returns", "commercial", "rules"];
const HIDDEN_FIELDS = new Set(["priceFallback"]);

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary" }> = {
  pass: { label: "At goal", variant: "success" },
  below: { label: "Below goal", variant: "warning" },
  loss: { label: "Losing money", variant: "destructive" },
  unpriced: { label: "Enter a list price", variant: "secondary" },
  invalid: { label: "Enter a cost", variant: "secondary" },
};

const str = (v: number | null | undefined) => (v != null ? String(Math.round(v * 10000) / 10000) : "");
const toNum = (v: string | undefined) => {
  if (v == null || v.trim() === "") return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
};

function sharedFrom(p: SetupProduct | null): Shared {
  return {
    sku: p?.sku ?? "",
    name: p?.name ?? "",
    brand: p?.brand ?? "",
    amzItemType: p?.amzItemType ?? "",
    cost: str(p?.cost),
    units: "1",
    shipping: Object.fromEntries(SHIP_COMPONENTS.map((c) => [c.key, str(p?.shipping[c.key])])) as Record<ShipComponentKey, string>,
  };
}

function fieldsFor(channel: ChannelWithDb): FieldUiDef[] {
  const cfg = toChannelConfig(channel);
  return FIELDS_UI.filter(
    (f) =>
      CALC_SECTIONS.includes(f.sec) &&
      !HIDDEN_FIELDS.has(f.key) &&
      (!f.flag || cfg.flags[f.flag as keyof ChannelFlags]) &&
      (!f.commercialOnly || channel.channelType === "commercial"),
  ).map((f) => (channel.hasPerSkuCommission && f.amazonLabel ? { ...f, label: f.amazonLabel } : f));
}

function settingsFrom(channel: ChannelWithDb, fields: FieldUiDef[]): Record<string, SettingValue> {
  const out: Record<string, SettingValue> = {};
  for (const f of fields) {
    const v = channel.defaults[f.key] ?? f.defaultValue;
    out[f.key] = f.type === "check" ? !!v : v == null ? "" : String(v);
  }
  return out;
}

/** Settings as the engine reads them: numbers for numeric fields, strings for selects. */
function settingsPayload(values: Record<string, SettingValue>, fields: FieldUiDef[]) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const v = values[f.key];
    if (f.type === "check") out[f.key] = !!v;
    else if (f.type === "select") out[f.key] = v;
    else out[f.key] = toNum(String(v ?? "")) ?? 0;
  }
  return out;
}

export function SingleSkuCalculator({
  customerId,
  customerName,
  channels,
  productId,
  canExport,
  onBack,
  onDiscard,
}: {
  customerId: string;
  customerName: string;
  channels: { id: string; name: string; isDefault: boolean }[];
  productId: string | null;
  canExport: boolean;
  onBack: () => void;
  onDiscard: () => void;
}) {
  const isNew = !productId;
  const [active, setActive] = useState(() => (channels.find((c) => c.isDefault) ?? channels[0]).id);
  const [setups, setSetups] = useState<Record<string, Setup>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, string>>({});
  const [shared, setShared] = useState<Shared | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [settingsBy, setSettingsBy] = useState<Record<string, Record<string, SettingValue>>>({});
  const [computed, setComputed] = useState<Record<string, Computed>>({});
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"commit" | "publish" | "price" | "export" | "publishAll" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string; productId?: string } | null>(null);
  const [committed, setCommitted] = useState<{ productId: string; sku: string } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [report, setReport] = useState<SingleSkuReportInput | null>(null);
  // Publish All: the change report, the channel inputs it was built from, and how the submit went.
  const [publishAll, setPublishAll] = useState<{
    rows: PublishAllRow[];
    channels: { channelId: string; inputs: unknown; settings: unknown }[];
    error: string | null;
    submitting: boolean;
    published: boolean;
  } | null>(null);
  const loading = useRef(new Set<string>());

  /** Loads a channel's setup once, and seeds its price and allocations (and, first time, the product inputs). */
  const loadSetup = useCallback(
    async (channelId: string): Promise<Setup | null> => {
      const params = new URLSearchParams({ customerId, channelId, ...(productId ? { productId } : {}) });
      const res = await fetch(`/api/single-sku/setup?${params}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLoadErrors((e) => ({ ...e, [channelId]: data.error || "Couldn't load this channel" }));
        return null;
      }
      const setup = data as Setup;
      setSetups((s) => ({ ...s, [channelId]: setup }));
      setShared((cur) => cur ?? sharedFrom(setup.product));
      setPrices((p) => (channelId in p ? p : { ...p, [channelId]: str(setup.product?.price) }));
      setSettingsBy((s) => (channelId in s ? s : { ...s, [channelId]: settingsFrom(setup.channel, fieldsFor(setup.channel)) }));
      return setup;
    },
    [customerId, productId],
  );

  useEffect(() => {
    if (setups[active] || loading.current.has(active)) return;
    loading.current.add(active);
    loadSetup(active).finally(() => loading.current.delete(active));
  }, [active, setups, loadSetup]);

  const setup = setups[active];
  const cfg = useMemo(() => (setup ? toChannelConfig(setup.channel) : null), [setup]);
  const fields = useMemo(() => (setup ? fieldsFor(setup.channel) : []), [setup]);
  const shipComponents = cfg ? shipComponentsFor(cfg) : [];
  const settings = settingsBy[active];
  const locked = !!committed;

  /** The compute request for a channel, from the shared inputs and that channel's price and allocations. */
  const payloadFor = useCallback(
    (channelId: string, s: Setup, chSettings: Record<string, SettingValue>, price: string | undefined) => {
      if (!shared) return null;
      const chCfg = toChannelConfig(s.channel);
      return {
        customerId,
        channelId,
        productId,
        inputs: {
          ...(isNew ? { sku: shared.sku, name: shared.name, brand: shared.brand, amzItemType: shared.amzItemType } : {}),
          ...(s.costHidden ? {} : { cost: toNum(shared.cost) }),
          units: toNum(shared.units),
          price: toNum(price),
          shipping: Object.fromEntries(shipComponentsFor(chCfg).map((c) => [c.key, toNum(shared.shipping[c.key])])),
        },
        settings: settingsPayload(chSettings, fieldsFor(s.channel)),
      };
    },
    [shared, customerId, productId, isNew],
  );

  const payload = useMemo(
    () => (setup && settings ? payloadFor(active, setup, settings, prices[active]) : null),
    [active, setup, settings, prices, payloadFor],
  );

  const compute = useCallback(async (body: NonNullable<typeof payload>, signal?: AbortSignal): Promise<Computed> => {
    const res = await fetch("/api/single-sku/compute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Couldn't calculate");
    return { result: data.result, warnings: data.warnings ?? [] };
  }, []);

  // Recalculate the active channel on the server whenever an input changes.
  useEffect(() => {
    if (!payload) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setComputing(true);
      try {
        const out = await compute(payload, controller.signal);
        setComputed((c) => ({ ...c, [active]: out }));
        setComputeError(null);
      } catch (err) {
        if (!controller.signal.aborted) setComputeError(err instanceof Error ? err.message : "Couldn't calculate");
      } finally {
        if (!controller.signal.aborted) setComputing(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [payload, active, compute]);

  const dirty = useMemo(() => {
    const anySetup = Object.values(setups)[0];
    if (!shared || !anySetup) return false;
    if (JSON.stringify(shared) !== JSON.stringify(sharedFrom(anySetup.product))) return true;
    return Object.entries(setups).some(
      ([id, s]) =>
        (prices[id] ?? "") !== str(s.product?.price) ||
        JSON.stringify(settingsBy[id]) !== JSON.stringify(settingsFrom(s.channel, fieldsFor(s.channel))),
    );
  }, [shared, setups, prices, settingsBy]);

  /** Existing SKU: the active channel's list price or one of its shipping costs differs from what's stored. */
  const hasSavableChange = useMemo(() => {
    if (isNew || !setup?.product || !shared) return false;
    const p = setup.product;
    const price = toNum(prices[active]);
    if (price != null && price > 0 && !(p.price != null && Math.abs(price - p.price) < 0.005)) return true;
    return shipComponents.some((c) => {
      const v = toNum(shared.shipping[c.key]);
      const stored = p.shipping[c.key];
      return v != null && v >= 0 && !(stored != null && Math.abs(stored - v) < 0.00005);
    });
  }, [isNew, setup, shared, prices, active, shipComponents]);

  /** Existing SKU: channels (of those opened) whose list price differs from what's saved. */
  const changedChannelIds = useMemo(() => {
    if (isNew) return [];
    return channels
      .map((c) => c.id)
      .filter((id) => {
        const s = setups[id];
        if (!s?.product) return false;
        const p = toNum(prices[id]);
        return p != null && p > 0 && !(s.product.price != null && Math.abs(p - s.product.price) < 0.005);
      });
  }, [isNew, channels, setups, prices]);
  const anyCanPublish = Object.values(setups).some((s) => s.canPublish);

  /** Builds the Publish All change report for every channel with a changed price, and opens it. */
  async function openPublishAll() {
    const list = changedChannelIds.flatMap((id) => {
      const s = setups[id];
      const body = s && payloadFor(id, s, settingsBy[id] ?? settingsFrom(s.channel, fieldsFor(s.channel)), prices[id]);
      return body ? [{ channelId: id, inputs: body.inputs, settings: body.settings }] : [];
    });
    if (list.length === 0 || !productId) return;
    setBusy("publishAll");
    setMessage(null);
    try {
      const { res, data } = await post("/api/single-sku/publish-all", { customerId, productId, channels: list });
      if (!res.ok) return setMessage({ ok: false, text: data.error || "Couldn't build the change report" });
      if (!data.rows?.length) return setMessage({ ok: false, text: "No channel prices have changed." });
      setPublishAll({ rows: data.rows, channels: list, error: null, submitting: false, published: false });
    } catch {
      setMessage({ ok: false, text: "Couldn't build the change report" });
    } finally {
      setBusy(null);
    }
  }

  async function submitPublishAll() {
    if (!publishAll || !productId) return;
    setPublishAll({ ...publishAll, submitting: true, error: null });
    let res: Response;
    let data: Record<string, unknown> & { rows?: PublishAllRow[]; error?: string; sku?: string };
    try {
      ({ res, data } = await post("/api/single-sku/publish-all", {
        customerId,
        productId,
        channels: publishAll.channels,
        apply: true,
      }));
    } catch {
      setPublishAll((cur) => cur && { ...cur, submitting: false, error: "Couldn't reach the server. Nothing was published." });
      return;
    }
    if (!res.ok) {
      setPublishAll((cur) => cur && { ...cur, submitting: false, error: data.error || "Couldn't publish", rows: data.rows ?? cur.rows });
      return;
    }
    const rows: PublishAllRow[] = data.rows ?? [];
    setPublishAll((cur) => cur && { ...cur, submitting: false, published: true, rows });
    // The published prices are now the saved ones.
    setSetups((all) => {
      const next = { ...all };
      for (const r of rows) {
        const s = next[r.channelId];
        if (r.published && s?.product) next[r.channelId] = { ...s, product: { ...s.product, price: r.newPrice } };
      }
      return next;
    });
    const n = rows.filter((r) => r.published).length;
    setMessage({ ok: true, text: `Published ${data.sku} on ${n} channel${n !== 1 ? "s" : ""} to Salsify.` });
  }

  /** New SKU: list prices entered on every channel, so committing records them all. */
  const channelPrices = () =>
    Object.fromEntries(
      Object.entries(prices)
        .map(([id, v]) => [id, toNum(v)] as const)
        .filter((e): e is readonly [string, number] => e[1] != null && e[1] > 0),
    );

  function discard() {
    if (dirty && !committed && !confirm(isNew ? "Discard this SKU?" : "Discard your changes?")) return;
    onDiscard();
  }

  async function post(url: string, body: unknown) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { res, data: await res.json().catch(() => ({})) };
  }

  async function commitNew() {
    if (!payload) return;
    setBusy("commit");
    setMessage(null);
    try {
      const { res, data } = await post("/api/single-sku/commit", {
        customerId,
        channelId: active,
        inputs: payload.inputs,
        channelPrices: channelPrices(),
      });
      if (!res.ok) return setMessage({ ok: false, text: data.error || "Couldn't add the SKU", productId: data.productId });
      setCommitted({ productId: data.productId, sku: shared!.sku.trim() });
      setMessage({ ok: true, text: `Added ${shared!.sku.trim()} to the Product Database for ${customerName}.`, productId: data.productId });
    } finally {
      setBusy(null);
    }
  }

  async function commitPrice() {
    if (!payload || !setup?.product) return;
    setBusy("price");
    setMessage(null);
    try {
      const { res, data } = await post("/api/single-sku/commit-price", payload);
      if (!res.ok) return setMessage({ ok: false, text: data.error || "Couldn't commit the price" });
      // What's stored now matches what was committed: the channel's price, and shipping on every channel.
      setSetups((all) =>
        Object.fromEntries(
          Object.entries(all).map(([id, s]) => [
            id,
            s.product
              ? {
                  ...s,
                  product: {
                    ...s.product,
                    price: id === active && data.priceChanged ? data.price : s.product.price,
                    shipping: { ...s.product.shipping, ...(data.shipping ?? {}) },
                  },
                }
              : s,
          ]),
        ),
      );
      const what = data.priceChanged ? `$${Number(data.price).toFixed(2)}` : "shipping";
      setMessage({
        ok: true,
        text: `Committed ${what} for ${setup.product.sku} on ${setup.channel.name}.${data.priceChanged ? " It's staged for Publish to Salsify" : ""}${
          data.priceChanged ? (data.atPublish ? " and will be recorded when it's published." : ".") : ""
        }`,
      });
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    if (!payload || !setup) return;
    const price = toNum(prices[active]);
    const sku = isNew ? shared!.sku.trim() : setup.product!.sku;
    if (price == null || price <= 0) return;
    const others = Object.keys(channelPrices()).filter((id) => id !== active).length;
    const ask = isNew
      ? `Add ${sku} to the Product Database${others ? ` (with its prices on ${others + 1} channels)` : ""} and publish it to Salsify at $${price.toFixed(2)} on ${setup.channel.name}?\n\nThis creates ${sku} in Salsify.`
      : `Publish ${sku} at $${price.toFixed(2)} on ${setup.channel.name} to Salsify?`;
    if (!confirm(ask)) return;
    setBusy("publish");
    setMessage(null);
    try {
      const { res, data } = await post("/api/single-sku/publish", { ...payload, channelPrices: isNew ? channelPrices() : undefined });
      // A new SKU is added before publishing, so it can be committed even when the publish fails.
      if (data.committed && data.productId) setCommitted({ productId: data.productId, sku });
      if (!res.ok) {
        return setMessage({
          ok: false,
          text: data.committed ? `Added ${sku} to the Product Database, but ${String(data.error).replace(/^Publish/, "the publish")}` : data.error || "Couldn't publish",
          productId: data.committed ? data.productId : undefined,
        });
      }
      setMessage({ ok: true, text: `Published ${sku} at $${price.toFixed(2)} on ${setup.channel.name} to Salsify.`, productId: isNew ? data.productId : undefined });
    } finally {
      setBusy(null);
    }
  }

  /** Builds the report for the active channel, or for every channel, and opens its preview. */
  async function exportReport(scope: "active" | "all") {
    setExportOpen(false);
    if (!shared) return;
    setBusy("export");
    setMessage(null);
    try {
      const ids = scope === "active" ? [active] : channels.map((c) => c.id);
      const reports: SingleSkuChannelReport[] = [];
      for (const id of ids) {
        const s = setups[id] ?? (await loadSetup(id));
        if (!s) continue;
        const chFields = fieldsFor(s.channel);
        const chSettings = settingsBy[id] ?? settingsFrom(s.channel, chFields);
        const price = id in prices ? prices[id] : str(s.product?.price);
        const body = payloadFor(id, s, chSettings, price);
        if (!body) continue;
        const out = id === active && computed[id] && !computing ? computed[id] : await compute(body);
        const chCfg = toChannelConfig(s.channel);
        const channelValues = settingsFrom(s.channel, chFields);
        reports.push({
          cfg: chCfg,
          result: out.result,
          settings: { ...s.channel.defaults, ...body.settings } as unknown as ChannelDefaults,
          allocations: chFields.map((f) => ({ field: f, value: chSettings[f.key], channelValue: channelValues[f.key] })),
          shipping: shipComponentsFor(chCfg).map((c) => ({ label: c.label, value: toNum(shared.shipping[c.key]) })),
          warnings: out.warnings,
        });
      }
      const first = setups[active] ?? Object.values(setups)[0];
      setReport({
        customerName,
        product: {
          sku: isNew ? shared.sku.trim() || "NEW SKU" : first?.product?.sku ?? "",
          name: shared.name,
          brand: shared.brand,
          itemType: shared.amzItemType,
          isNew: isNew && !committed,
        },
        cost: toNum(shared.cost),
        includeCost: !first?.costHidden,
        units: toNum(shared.units) ?? 1,
        channels: reports,
      });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Couldn't build the report" });
    } finally {
      setBusy(null);
    }
  }

  const loadError = loadErrors[active];
  const closeReport = useCallback(() => setReport(null), []);
  if (loadError && !setup) {
    return (
      <div>
        <p className="text-sm text-red-600 mb-4">{loadError}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
      </div>
    );
  }
  if (!shared) return <p className="text-sm text-gray-500">Loading...</p>;

  const result = computed[active]?.result ?? null;
  const warnings = computed[active]?.warnings ?? [];
  const numericSettings =
    setup && settings ? ({ ...setup.channel.defaults, ...settingsPayload(settings, fields) } as unknown as ChannelDefaults) : null;
  const status = result ? (STATUS[result.status] ?? STATUS.invalid) : null;
  const price = toNum(prices[active]);
  const costHidden = !!setup?.costHidden;
  const productLabel = isNew ? "New SKU" : setup?.product?.sku ?? Object.values(setups)[0]?.product?.sku;

  return (
    <div>
      {report && <SingleSkuReport input={report} onClose={closeReport} />}
      {publishAll && (
        <PublishAllDialog
          open
          onOpenChange={(o) => !o && setPublishAll(null)}
          customerName={customerName}
          sku={productLabel ?? ""}
          productName={shared.name}
          rows={publishAll.rows}
          error={publishAll.error}
          submitting={publishAll.submitting}
          published={publishAll.published}
          canExport={canExport}
          onSubmit={submitPublishAll}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-600">
          {customerName} · <span className={isNew ? "font-medium text-gray-900" : "font-mono font-medium text-gray-900"}>{productLabel}</span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <Button variant="outline" size="sm" onClick={discard}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            {committed ? "Start over" : "Discard"}
          </Button>
          {canExport && (
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setExportOpen((o) => !o)} disabled={busy === "export"}>
                {busy === "export" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
                Export Report
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-20 py-1 w-56">
                  <button onClick={() => exportReport("active")} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                    This channel ({setup?.channel.name ?? "…"})
                  </button>
                  {channels.length > 1 && (
                    <button onClick={() => exportReport("all")} className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      All {channels.length} channels
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          {isNew && setup?.canCommit && !committed && (
            <Button size="sm" onClick={commitNew} disabled={!!busy || !shared.sku.trim()}>
              {busy === "commit" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Commit to Product Database
            </Button>
          )}
          {!isNew && setup && (
            <Button
              size="sm"
              onClick={commitPrice}
              disabled={!!busy || !hasSavableChange || !setup.product?.onCustomer}
              title={
                !setup.product?.onCustomer
                  ? `${setup.product?.sku} isn't one of ${customerName}'s products`
                  : !hasSavableChange
                    ? "Change the list price or shipping to commit"
                    : "Save the list price and shipping for this channel and stage them for Publish to Salsify"
              }
            >
              {busy === "price" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Commit Price
            </Button>
          )}
          {setup?.canPublish && (isNew ? setup.canCommit && !committed : true) && (
            <Button
              size="sm"
              onClick={publish}
              disabled={!!busy || !(price! > 0) || (isNew && !shared.sku.trim())}
              title={!(price! > 0) ? "Enter a list price to publish" : undefined}
            >
              {busy === "publish" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              {isNew ? "Commit & Publish to Salsify" : "Publish to Salsify"}
            </Button>
          )}
          {!isNew && anyCanPublish && channels.length > 1 && (
            <Button
              size="sm"
              onClick={openPublishAll}
              disabled={!!busy || changedChannelIds.length === 0}
              title={
                changedChannelIds.length === 0
                  ? "Change a channel's list price to publish"
                  : "Review every channel's price change, then publish them to Salsify together"
              }
            >
              {busy === "publishAll" ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
              Publish All to Salsify{changedChannelIds.length > 0 ? ` (${changedChannelIds.length})` : ""}
            </Button>
          )}
        </div>
      </div>

      {message && (
        <div
          className={cn(
            "mb-4 rounded-md border px-3 py-2 text-sm flex items-center gap-2",
            message.ok ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {message.ok ? <Check className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span>{message.text}</span>
          {message.productId && (
            <Link href={`/products/${message.productId}`} className="font-medium underline">
              View product
            </Link>
          )}
        </div>
      )}
      {isNew && setup && !setup.canCommit && (
        <p className="mb-4 text-xs text-gray-500">You can price this SKU, but adding products needs the Products: Update permission.</p>
      )}
      {!isNew && setup && !setup.product?.onCustomer && (
        <p className="mb-4 text-xs text-gray-500">
          {setup.product?.sku} isn&apos;t one of {customerName}&apos;s products, so its price can be analyzed here but not committed.
        </p>
      )}

      {/* Channel switcher */}
      <div className="flex gap-1 border-b border-gray-200 mb-4 overflow-x-auto" role="tablist" aria-label="Sales channels">
        {channels.map((c) => {
          const out = computed[c.id]?.result;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={c.id === active}
              onClick={() => setActive(c.id)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors",
                c.id === active ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-700",
              )}
            >
              {c.name}
              {out && out.price > 0 && !out.invalid && (
                <span className={cn("ml-2 text-xs", out.status === "pass" ? "text-green-600" : out.status === "loss" ? "text-red-600" : "text-amber-600")}>
                  {(out.gm * 100).toFixed(1)}%
                </span>
              )}
            </button>
          );
        })}
      </div>

      {!setup || !settings || !cfg ? (
        <p className="text-sm text-gray-500">{loadError ?? "Loading channel..."}</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-6 items-start">
          {/* Inputs */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Product</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {isNew ? (
                  <>
                    <Row label="SKU">
                      <Input value={shared.sku} onChange={(e) => setShared({ ...shared, sku: e.target.value })} disabled={locked} placeholder="Required to commit" />
                    </Row>
                    <Row label="Name">
                      <Input value={shared.name} onChange={(e) => setShared({ ...shared, name: e.target.value })} disabled={locked} />
                    </Row>
                    <Row label="Brand" hint="Drives brand royalty rules">
                      <Input value={shared.brand} onChange={(e) => setShared({ ...shared, brand: e.target.value })} disabled={locked} />
                    </Row>
                    {setup.channel.hasPerSkuCommission && (
                      <Row label="Amazon item type" hint="Drives item type referral fees">
                        <Input value={shared.amzItemType} onChange={(e) => setShared({ ...shared, amzItemType: e.target.value })} disabled={locked} />
                      </Row>
                    )}
                  </>
                ) : (
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div><dt className="text-xs text-gray-500">SKU</dt><dd className="font-mono">{setup.product?.sku}</dd></div>
                    <div><dt className="text-xs text-gray-500">Brand</dt><dd>{setup.product?.brand || "-"}</dd></div>
                    <div className="col-span-2"><dt className="text-xs text-gray-500">Name</dt><dd>{setup.product?.name || "-"}</dd></div>
                  </dl>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Cost & Price</CardTitle>
                <p className="text-xs text-gray-500">Cost, units and shipping apply to every channel; the list price is for {setup.channel.name}.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Row label="Unit cost">
                  {costHidden ? (
                    <p className="text-sm text-gray-500 py-2">Hidden (uses the stored cost)</p>
                  ) : (
                    <Money value={shared.cost} onChange={(v) => setShared({ ...shared, cost: v })} disabled={locked} />
                  )}
                </Row>
                <Row label="List price" hint={setup.channel.name}>
                  <Money value={prices[active] ?? ""} onChange={(v) => setPrices((p) => ({ ...p, [active]: v }))} disabled={locked} />
                </Row>
                <Row label="Units per order">
                  <Input type="number" min="1" step="1" value={shared.units} onChange={(e) => setShared({ ...shared, units: e.target.value })} disabled={locked} />
                </Row>
              </CardContent>
            </Card>

            {shipComponents.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Shipping</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {shipComponents.map((c) => (
                    <Row key={c.key} label={c.label} hint="per unit">
                      <Money
                        value={shared.shipping[c.key]}
                        onChange={(v) => setShared({ ...shared, shipping: { ...shared.shipping, [c.key]: v } })}
                        disabled={locked}
                      />
                    </Row>
                  ))}
                </CardContent>
              </Card>
            )}

            {SECTIONS.filter((sec) => fields.some((f) => f.sec === sec.id)).map((sec) => (
              <Card key={sec.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{sec.title}</CardTitle>
                    {sec.id === "goal" && (
                      <button
                        onClick={() => setSettingsBy((s) => ({ ...s, [active]: settingsFrom(setup.channel, fields) }))}
                        className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1 shrink-0"
                        title="Reset every allocation to this channel's settings"
                      >
                        <RotateCcw className="h-3 w-3" />
                        Reset allocations to channel
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fields
                    .filter((f) => f.sec === sec.id)
                    .map((f) => (
                      <SettingRow
                        key={f.key}
                        field={f}
                        value={settings[f.key]}
                        changed={String(settings[f.key] ?? "") !== String(settingsFrom(setup.channel, [f])[f.key])}
                        onChange={(v) => setSettingsBy((s) => ({ ...s, [active]: { ...s[active], [f.key]: v } }))}
                        disabled={locked}
                      />
                    ))}
                </CardContent>
              </Card>
            ))}
            <p className="text-xs text-gray-500">Allocation changes here are only for this calculation; the channel isn&apos;t changed.</p>
          </div>

          {/* Results */}
          <div className="space-y-4 lg:sticky lg:top-4">
            {warnings.map((w) => (
              <div key={w} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {w}
              </div>
            ))}
            {computeError && <p className="text-sm text-red-600">{computeError}</p>}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Net margin" value={result && result.price > 0 && !result.invalid ? `${(result.gm * 100).toFixed(1)}%` : "-"} tone={result?.status} />
              <Stat label="Net $ per order" value={result && result.price > 0 && !result.invalid ? `$${result.net.toFixed(2)}` : "-"} tone={result?.status} />
              <Stat
                label={`Recommended (${((result?.goalUsed ?? 0) * 100).toFixed(0)}% goal)`}
                value={result?.rec != null ? `$${result.rec.toFixed(2)}` : "-"}
                action={
                  result?.rec != null && !locked && Math.abs(result.rec - (price ?? 0)) >= 0.005 ? (
                    <button onClick={() => setPrices((p) => ({ ...p, [active]: result.rec!.toFixed(2) }))} className="text-xs text-blue-600 hover:underline">
                      Use this price
                    </button>
                  ) : null
                }
              />
              <div className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="text-xs text-gray-500">Status</p>
                <div className="mt-1 flex items-center gap-2">
                  {status && <Badge variant={status.variant}>{status.label}</Badge>}
                  {computing && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
                </div>
              </div>
            </div>
            {result && !result.invalid && numericSettings ? (
              <SkuDetailPanel result={result} cfg={cfg} settings={numericSettings} canViewCost={!costHidden} />
            ) : (
              <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
                {costHidden ? "This SKU has no cost on file, so it can't be analyzed." : "Enter a unit cost to see the margin breakdown."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-3">
      <label className="text-sm text-gray-700">
        {label}
        {hint && <span className="block text-xs text-gray-400">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function Money({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <div className="relative">
      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>
      <Input type="number" step="0.01" min="0" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className="pl-6" />
    </div>
  );
}

function SettingRow({
  field,
  value,
  changed,
  onChange,
  disabled,
}: {
  field: FieldUiDef;
  value: SettingValue | undefined;
  changed: boolean;
  onChange: (v: SettingValue) => void;
  disabled?: boolean;
}) {
  const label = (
    <>
      {field.label}
      {changed && <span className="ml-1 text-xs text-blue-600">(edited)</span>}
      {field.hint && <span className="block text-xs text-gray-400">{field.hint}</span>}
    </>
  );
  if (field.type === "check") {
    return (
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} disabled={disabled} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
        <span>{label}</span>
      </label>
    );
  }
  return (
    <div className="grid grid-cols-[150px_1fr] items-center gap-3">
      <span className="text-sm text-gray-700">{label}</span>
      {field.type === "select" ? (
        <Select value={String(value ?? "")} onValueChange={onChange} disabled={disabled}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(field.opts ?? []).map(([v, l]) => (
              <SelectItem key={v} value={v}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="relative">
          {field.unit === "$" && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">$</span>}
          <Input
            type="number"
            step="0.01"
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={field.unit === "$" ? "pl-6" : field.unit === "%" ? "pr-7" : ""}
          />
          {field.unit === "%" && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, action }: { label: string; value: string; tone?: string; action?: React.ReactNode }) {
  const color = tone === "pass" ? "text-green-600" : tone === "below" ? "text-amber-600" : tone === "loss" ? "text-red-600" : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {action}
    </div>
  );
}
