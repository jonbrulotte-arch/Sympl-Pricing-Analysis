"use client";

import { useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CHANNEL_TEMPLATES,
  PRICE_FIELDS,
  SHIPPING_MODES,
  type ChannelTemplate,
} from "@/components/channels/channel-templates";
import { ROUND_OPTS } from "@/lib/pricing/constants";
import type { ChannelFlags, ChannelDefaults } from "@/lib/pricing/types";

const FLAG_INFO: { key: keyof ChannelFlags; label: string; hint?: string }[] = [
  { key: "coupon", label: "Coupon discount" },
  {
    key: "tax",
    label: "Sales tax collected (eBay-style)",
    hint: "When enabled, sales tax is charged on the post-coupon price. Commission and promoted listing fees are then billed on the sold price (including tax), creating real extra cost. This is how eBay works — it amplifies marketplace fees.",
  },
  { key: "comm", label: "Category commission" },
  { key: "tsd", label: "Top seller discount" },
  { key: "promo", label: "Promoted listing fee" },
  { key: "fvf", label: "Final value fee (fixed per unit)" },
  { key: "cc", label: "Credit card processing" },
  { key: "ppc", label: "PPC fee per unit" },
  { key: "ad", label: "Advertising (% of sale)" },
  { key: "commSku", label: "Per-SKU commission override", hint: "Uses the Amazon category commission column from the spreadsheet when available" },
  { key: "fb", label: "Fallback pricing", hint: "Use another channel's price when this channel has no price for a SKU" },
  { key: "asin", label: "Amazon ASIN tracking" },
];

type Step = "template" | "basics" | "flags" | "defaults" | "rules" | "review";
const STEPS: { id: Step; label: string }[] = [
  { id: "template", label: "Template" },
  { id: "basics", label: "Basics" },
  { id: "flags", label: "Fee Types" },
  { id: "defaults", label: "Defaults" },
  { id: "rules", label: "Rules" },
  { id: "review", label: "Review" },
];

export default function NewChannelPage() {
  const router = useRouter();
  const { customerId } = useParams<{ customerId: string }>();
  const [step, setStep] = useState<Step>("template");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [tabLabel, setTabLabel] = useState("");
  const [shippingMode, setShippingMode] = useState<"std" | "mcf" | "fba">("std");
  const [priceField, setPriceField] = useState("priceJSP");
  const [fallbackPriceField, setFallbackPriceField] = useState("");
  const [flags, setFlags] = useState<ChannelFlags>({
    coupon: false, tax: false, comm: false, tsd: false, promo: false,
    fvf: false, cc: false, ppc: false, ad: false, commSku: false, fb: false, asin: false,
  });
  const [defaults, setDefaults] = useState<Record<string, number | string | boolean>>({
    goal: 25, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet",
    hideDisc: false, sellGoal: 0, excludeDisc: true, excludeOOS: true, lowStock: 5,
    round: "99", target: 20,
  });

  function applyTemplate(t: ChannelTemplate) {
    setFlags({ ...t.flags });
    setShippingMode(t.shippingMode);
    setDefaults((prev) => ({ ...prev, ...t.defaults }));
    setStep("basics");
  }

  function setDefault(key: string, value: number | string | boolean) {
    setDefaults((prev) => ({ ...prev, [key]: value }));
  }

  function toggleFlag(key: keyof ChannelFlags) {
    setFlags((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/customers/${customerId}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        tabLabel: tabLabel || name,
        shippingMode,
        priceField,
        fallbackPriceField: flags.fb ? fallbackPriceField : null,
        flags,
        defaults,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create channel");
      setLoading(false);
      return;
    }

    router.push(`/customers/${customerId}`);
  }

  const stepIdx = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">New Sales Channel</h1>

      {/* Step indicator */}
      <div className="flex gap-1 mb-6">
        {STEPS.map((s, i) => (
          <div
            key={s.id}
            className={`h-1.5 flex-1 rounded-full ${i <= stepIdx ? "bg-blue-600" : "bg-gray-200"}`}
          />
        ))}
      </div>

      {/* Template selection */}
      {step === "template" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600 mb-4">Choose a template to start with, or create a custom channel.</p>
          {CHANNEL_TEMPLATES.map((t) => (
            <button
              key={t.id}
              onClick={() => applyTemplate(t)}
              className="w-full text-left border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50/50 transition-colors"
            >
              <p className="font-medium text-gray-900">{t.label}</p>
              <p className="text-sm text-gray-500 mt-0.5">{t.description}</p>
            </button>
          ))}
        </div>
      )}

      {/* Basics */}
      {step === "basics" && (
        <Card>
          <CardHeader>
            <CardTitle>Channel Basics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Channel Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. eBay (JSP)" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Tab Label</label>
              <Input
                value={tabLabel}
                onChange={(e) => setTabLabel(e.target.value)}
                placeholder={name || "Short label for tabs"}
              />
              <p className="text-xs text-gray-400 mt-1">Appears on analysis tabs. Defaults to channel name.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Shipping Mode</label>
              <div className="space-y-2">
                {SHIPPING_MODES.map((m) => (
                  <label key={m.value} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="shippingMode"
                      value={m.value}
                      checked={shippingMode === m.value}
                      onChange={() => setShippingMode(m.value as "std" | "mcf" | "fba")}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.label}</p>
                      <p className="text-xs text-gray-500">{m.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Price Column</label>
              <select
                value={priceField}
                onChange={(e) => setPriceField(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {PRICE_FIELDS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Fee type flags */}
      {step === "flags" && (
        <Card>
          <CardHeader>
            <CardTitle>Fee Types</CardTitle>
            <p className="text-sm text-gray-500">Toggle which fee types this channel charges.</p>
          </CardHeader>
          <CardContent className="space-y-1">
            {FLAG_INFO.map((f) => (
              <div key={f.key} className="py-2.5 border-b border-gray-100 last:border-0">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={flags[f.key]}
                    onChange={() => toggleFlag(f.key)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
                  />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{f.label}</p>
                    {f.hint && <p className="text-xs text-gray-500 mt-0.5">{f.hint}</p>}
                  </div>
                </label>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Default values */}
      {step === "defaults" && (
        <Card>
          <CardHeader>
            <CardTitle>Default Values</CardTitle>
            <p className="text-sm text-gray-500">Set the default rates for enabled fee types.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <NumberField label="Target GM%" value={defaults.goal as number} onChange={(v) => setDefault("goal", v)} suffix="%" />
            {flags.coupon && (
              <NumberField label="Coupon discount" value={(defaults.coupon as number) ?? 0} onChange={(v) => setDefault("coupon", v)} suffix="%" />
            )}
            {flags.tax && (
              <NumberField label="Sales tax rate" value={(defaults.tax as number) ?? 0} onChange={(v) => setDefault("tax", v)} suffix="%" />
            )}
            {flags.comm && (
              <NumberField label="Category commission" value={(defaults.comm as number) ?? 0} onChange={(v) => setDefault("comm", v)} suffix="%" />
            )}
            {flags.tsd && (
              <NumberField label="Top seller discount" value={(defaults.tsd as number) ?? 0} onChange={(v) => setDefault("tsd", v)} suffix="%" />
            )}
            {flags.promo && (
              <NumberField label="Promoted listing fee" value={(defaults.promo as number) ?? 0} onChange={(v) => setDefault("promo", v)} suffix="%" />
            )}
            {flags.fvf && (
              <NumberField label="Final value fee (fixed)" value={(defaults.fvf as number) ?? 0} onChange={(v) => setDefault("fvf", v)} prefix="$" />
            )}
            {flags.cc && (
              <>
                <NumberField label="CC processing rate" value={(defaults.ccPct as number) ?? 0} onChange={(v) => setDefault("ccPct", v)} suffix="%" />
                <NumberField label="CC fee per order" value={(defaults.ccFlat as number) ?? 0} onChange={(v) => setDefault("ccFlat", v)} prefix="$" />
              </>
            )}
            {flags.ppc && (
              <NumberField label="PPC fee per unit" value={(defaults.ppc as number) ?? 0} onChange={(v) => setDefault("ppc", v)} prefix="$" />
            )}
            {flags.ad && (
              <NumberField label="Advertising" value={(defaults.advertising as number) ?? 0} onChange={(v) => setDefault("advertising", v)} suffix="%" />
            )}
            <NumberField label="Default royalty" value={(defaults.roy as number) ?? 6.9} onChange={(v) => setDefault("roy", v)} suffix="%" />
            <NumberField label="Returns & warranty" value={(defaults.returns as number) ?? 2} onChange={(v) => setDefault("returns", v)} suffix="%" />
          </CardContent>
        </Card>
      )}

      {/* Repricing rules */}
      {step === "rules" && (
        <Card>
          <CardHeader>
            <CardTitle>Repricing Rules</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Round new price to</label>
              <select
                value={defaults.round as string}
                onChange={(e) => setDefault("round", e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {ROUND_OPTS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <NumberField label="Target profit (% of cost)" value={(defaults.target as number) ?? 20} onChange={(v) => setDefault("target", v)} suffix="%" />
            {flags.fb && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Fallback price column</label>
                <select
                  value={fallbackPriceField}
                  onChange={(e) => setFallbackPriceField(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                >
                  <option value="">None</option>
                  {PRICE_FIELDS.filter((f) => f.value !== priceField).map((f) => (
                    <option key={f.value} value={f.value}>{f.label}</option>
                  ))}
                </select>
              </div>
            )}
            <NumberField label="Low stock threshold" value={(defaults.lowStock as number) ?? 5} onChange={(v) => setDefault("lowStock", v)} suffix=" units" />
            <NumberField label="Sell-down goal GM%" value={(defaults.sellGoal as number) ?? 0} onChange={(v) => setDefault("sellGoal", v)} suffix="%" />
          </CardContent>
        </Card>
      )}

      {/* Review */}
      {step === "review" && (
        <Card>
          <CardHeader>
            <CardTitle>Review Channel</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-500">Name</p>
              <p className="text-gray-900">{name || "(not set)"}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Shipping</p>
              <p className="text-gray-900">{SHIPPING_MODES.find((m) => m.value === shippingMode)?.label}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Price Column</p>
              <p className="text-gray-900">{PRICE_FIELDS.find((f) => f.value === priceField)?.label}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">Enabled Fee Types</p>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {FLAG_INFO.filter((f) => flags[f.key]).map((f) => (
                  <Badge key={f.key} variant="secondary">{f.label}</Badge>
                ))}
                {FLAG_INFO.every((f) => !flags[f.key]) && <p className="text-gray-400 text-sm">None</p>}
              </div>
            </div>

            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      {step !== "template" && (
        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setStep(STEPS[stepIdx - 1]?.id ?? "template")}
          >
            Back
          </Button>
          {step === "review" ? (
            <Button onClick={handleCreate} disabled={loading || !name.trim()}>
              {loading ? "Creating..." : "Create Channel"}
            </Button>
          ) : (
            <Button
              onClick={() => setStep(STEPS[stepIdx + 1]?.id ?? "review")}
              disabled={step === "basics" && !name.trim()}
            >
              Next
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  prefix?: string;
  suffix?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-gray-500">{prefix}</span>}
        <Input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-32"
        />
        {suffix && <span className="text-sm text-gray-500">{suffix}</span>}
      </div>
    </div>
  );
}
