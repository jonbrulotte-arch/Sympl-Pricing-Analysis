"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Loader2, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SkuDetailPanel } from "@/components/analysis/sku-detail-panel";
import { FIELDS_UI, SECTIONS, type FieldUiDef } from "@/lib/pricing/constants";
import { toChannelConfig, type ChannelWithDb } from "@/lib/pricing/compute-results";
import { shipComponentsFor, type ShipComponentKey } from "@/lib/pricing/shipping";
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
}

interface Setup {
  channel: ChannelWithDb;
  costHidden: boolean;
  canCommit: boolean;
  product: SetupProduct | null;
}

interface Form {
  sku: string;
  name: string;
  brand: string;
  amzItemType: string;
  cost: string;
  units: string;
  price: string;
  shipping: Record<ShipComponentKey, string>;
}

type SettingValue = string | boolean;

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
const toNum = (v: string) => {
  if (v.trim() === "") return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
};

function formFrom(p: SetupProduct | null): Form {
  return {
    sku: p?.sku ?? "",
    name: p?.name ?? "",
    brand: p?.brand ?? "",
    amzItemType: p?.amzItemType ?? "",
    cost: str(p?.cost),
    units: "1",
    price: str(p?.price),
    shipping: {
      shipping: str(p?.shipping.shipping),
      mcfShip: str(p?.shipping.mcfShip),
      mcfFreight: str(p?.shipping.mcfFreight),
      fbaFee: str(p?.shipping.fbaFee),
    },
  };
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
  channelId,
  productId,
  onBack,
  onDiscard,
}: {
  customerId: string;
  customerName: string;
  channelId: string;
  productId: string | null;
  onBack: () => void;
  onDiscard: () => void;
}) {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => formFrom(null));
  const [settings, setSettings] = useState<Record<string, SettingValue>>({});
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [computing, setComputing] = useState(false);
  const [computeError, setComputeError] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [commitError, setCommitError] = useState<{ text: string; productId?: string } | null>(null);
  const [committed, setCommitted] = useState<{ productId: string; sku: string } | null>(null);

  const cfg = useMemo(() => (setup ? toChannelConfig(setup.channel) : null), [setup]);
  const fields = useMemo(() => {
    if (!setup || !cfg) return [];
    return FIELDS_UI.filter(
      (f) =>
        CALC_SECTIONS.includes(f.sec) &&
        !HIDDEN_FIELDS.has(f.key) &&
        (!f.flag || cfg.flags[f.flag as keyof ChannelFlags]) &&
        (!f.commercialOnly || setup.channel.channelType === "commercial"),
    ).map((f) => (setup.channel.hasPerSkuCommission && f.amazonLabel ? { ...f, label: f.amazonLabel } : f));
  }, [setup, cfg]);
  const shipComponents = cfg ? shipComponentsFor(cfg) : [];
  const isNew = !productId;

  useEffect(() => {
    const params = new URLSearchParams({ customerId, channelId, ...(productId ? { productId } : {}) });
    fetch(`/api/single-sku/setup?${params}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't load this channel");
        return data as Setup;
      })
      .then((data) => {
        setSetup(data);
        setForm(formFrom(data.product));
      })
      .catch((err: Error) => setLoadError(err.message));
  }, [customerId, channelId, productId]);

  useEffect(() => {
    if (setup) setSettings(settingsFrom(setup.channel, fields));
  }, [setup, fields]);

  const payload = useMemo(() => {
    if (!setup) return null;
    return {
      customerId,
      channelId,
      productId,
      inputs: {
        ...(isNew ? { sku: form.sku, name: form.name, brand: form.brand, amzItemType: form.amzItemType } : {}),
        ...(setup.costHidden ? {} : { cost: toNum(form.cost) }),
        units: toNum(form.units),
        price: toNum(form.price),
        shipping: Object.fromEntries(shipComponents.map((c) => [c.key, toNum(form.shipping[c.key])])),
      },
      settings: settingsPayload(settings, fields),
    };
    // shipComponents is derived from setup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, form, settings, fields, customerId, channelId, productId, isNew]);

  // Recalculate on the server whenever an input changes.
  useEffect(() => {
    if (!payload || Object.keys(settings).length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setComputing(true);
      try {
        const res = await fetch("/api/single-sku/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Couldn't calculate");
        setResult(data.result);
        setWarnings(data.warnings ?? []);
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
  }, [payload, settings]);

  const dirty = useMemo(() => {
    if (!setup) return false;
    return JSON.stringify(form) !== JSON.stringify(formFrom(setup.product)) ||
      JSON.stringify(settings) !== JSON.stringify(settingsFrom(setup.channel, fields));
  }, [setup, form, settings, fields]);

  function setField<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function discard() {
    if (dirty && !committed && !confirm(isNew ? "Discard this SKU?" : "Discard your changes?")) return;
    onDiscard();
  }

  async function commit() {
    if (!payload) return;
    setCommitting(true);
    setCommitError(null);
    try {
      const res = await fetch("/api/single-sku/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerId, channelId, inputs: payload.inputs }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCommitError({ text: data.error || "Couldn't add the SKU", productId: data.productId });
        return;
      }
      setCommitted({ productId: data.productId, sku: form.sku.trim() });
    } finally {
      setCommitting(false);
    }
  }

  if (loadError) {
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
  if (!setup || !cfg) return <p className="text-sm text-gray-500">Loading...</p>;

  const numericSettings = { ...setup.channel.defaults, ...settingsPayload(settings, fields) } as unknown as ChannelDefaults;
  const status = result ? (STATUS[result.status] ?? STATUS.invalid) : null;
  const locked = !!committed;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          {customerName} · <span className="font-medium text-gray-900">{setup.channel.name}</span> ·{" "}
          {isNew ? "New SKU" : <span className="font-mono">{setup.product?.sku}</span>}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <Button variant="outline" size="sm" onClick={discard}>
            <Trash2 className="h-4 w-4 mr-1.5" />
            {committed ? "Start over" : "Discard"}
          </Button>
          {isNew && setup.canCommit && !committed && (
            <Button size="sm" onClick={commit} disabled={committing || !form.sku.trim()}>
              {committing ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Commit to Product Database
            </Button>
          )}
        </div>
      </div>

      {committed && (
        <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
          <Check className="h-4 w-4 shrink-0" />
          Added {committed.sku} to the Product Database for {customerName}.
          <Link href={`/products/${committed.productId}`} className="font-medium underline">
            View product
          </Link>
        </div>
      )}
      {commitError && (
        <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {commitError.text}
          {commitError.productId && (
            <>
              {" "}
              <Link href={`/products/${commitError.productId}`} className="font-medium underline">
                View it
              </Link>
            </>
          )}
        </div>
      )}
      {isNew && !setup.canCommit && (
        <p className="mb-4 text-xs text-gray-500">You can price this SKU, but adding products needs the Products: Update permission.</p>
      )}

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
                    <Input value={form.sku} onChange={(e) => setField("sku", e.target.value)} disabled={locked} placeholder="Required to commit" />
                  </Row>
                  <Row label="Name">
                    <Input value={form.name} onChange={(e) => setField("name", e.target.value)} disabled={locked} />
                  </Row>
                  <Row label="Brand" hint="Drives brand royalty rules">
                    <Input value={form.brand} onChange={(e) => setField("brand", e.target.value)} disabled={locked} />
                  </Row>
                  {setup.channel.hasPerSkuCommission && (
                    <Row label="Amazon item type" hint="Drives item type referral fees">
                      <Input value={form.amzItemType} onChange={(e) => setField("amzItemType", e.target.value)} disabled={locked} />
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
            </CardHeader>
            <CardContent className="space-y-3">
              <Row label="Unit cost">
                {setup.costHidden ? (
                  <p className="text-sm text-gray-500 py-2">Hidden (uses the stored cost)</p>
                ) : (
                  <Money value={form.cost} onChange={(v) => setField("cost", v)} disabled={locked} />
                )}
              </Row>
              <Row label="List price">
                <Money value={form.price} onChange={(v) => setField("price", v)} disabled={locked} />
              </Row>
              <Row label="Units per order">
                <Input type="number" min="1" step="1" value={form.units} onChange={(e) => setField("units", e.target.value)} disabled={locked} />
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
                      value={form.shipping[c.key]}
                      onChange={(v) => setForm((f) => ({ ...f, shipping: { ...f.shipping, [c.key]: v } }))}
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
                      onClick={() => setSettings(settingsFrom(setup.channel, fields))}
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
                      onChange={(v) => setSettings((s) => ({ ...s, [f.key]: v }))}
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
                result?.rec != null && !locked && Math.abs(result.rec - (toNum(form.price) ?? 0)) >= 0.005 ? (
                  <button onClick={() => setField("price", result.rec!.toFixed(2))} className="text-xs text-blue-600 hover:underline">
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
          {result && !result.invalid ? (
            <SkuDetailPanel result={result} cfg={cfg} settings={numericSettings} canViewCost={!setup.costHidden} />
          ) : (
            <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
              {setup.costHidden ? "This SKU has no cost on file, so it can't be analyzed." : "Enter a unit cost to see the margin breakdown."}
            </div>
          )}
        </div>
      </div>
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
