"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SECTIONS, FIELDS_UI, ROUND_OPTS } from "@/lib/pricing/constants";
import type { ChannelFlags, ChannelDefaults } from "@/lib/pricing/types";

interface ChannelData {
  id: string;
  name: string;
  tabLabel: string;
  shippingMode: string;
  priceField: string;
  fallbackPriceField: string | null;
  isDefault: boolean;
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
}

function toFlags(ch: ChannelData): ChannelFlags {
  return {
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
  };
}

export default function ChannelSettingsPage() {
  const { customerId, channelId } = useParams<{ customerId: string; channelId: string }>();
  const router = useRouter();
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [defaults, setDefaults] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/channels/${channelId}`);
    if (res.ok) {
      const data = await res.json();
      setChannel(data);
      setDefaults(data.defaults ?? {});
    }
  }, [customerId, channelId]);

  useEffect(() => { load(); }, [load]);

  if (!channel) return <div className="p-6 text-gray-500">Loading...</div>;

  const flags = toFlags(channel);

  async function handleSave() {
    setSaving(true);
    const res = await fetch(`/api/customers/${customerId}/channels/${channelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaults }),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  function setVal(key: string, value: unknown) {
    setDefaults((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{channel.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {channel.shippingMode === "fba" ? "FBA" : channel.shippingMode === "mcf" ? "MCF" : "Standard"} shipping
            {channel.isDefault && " · Default channel"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-green-600">Saved</span>}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {SECTIONS.map((sec) => {
        const fields = FIELDS_UI.filter((f) => f.sec === sec.id && (!f.flag || flags[f.flag as keyof ChannelFlags]));
        if (fields.length === 0 && sec.id !== "brands") return null;

        return (
          <Card key={sec.id} className="mb-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{sec.title}</CardTitle>
              {sec.note && <p className="text-xs text-gray-500">{sec.note}</p>}
            </CardHeader>
            <CardContent className="space-y-3">
              {fields.map((field) => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={defaults[field.key]}
                  onChange={(v) => setVal(field.key, v)}
                />
              ))}
            </CardContent>
          </Card>
        );
      })}

      <div className="flex justify-between mt-6">
        <Button variant="outline" onClick={() => router.push(`/customers/${customerId}`)}>
          Back to Customer
        </Button>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange,
}: {
  field: (typeof FIELDS_UI)[number];
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  if (field.type === "check") {
    return (
      <label className="flex items-center gap-3 cursor-pointer py-1">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-gray-300 text-blue-600"
        />
        <span className="text-sm text-gray-900">{field.label}</span>
        {field.hint && <span className="text-xs text-gray-400">{field.hint}</span>}
      </label>
    );
  }

  if (field.type === "select") {
    const opts = field.opts ?? (field.key === "round" ? ROUND_OPTS : []);
    return (
      <div className="flex items-center gap-3">
        <label className="text-sm text-gray-700 w-48 shrink-0">
          {field.label}
          {field.hint && <span className="text-xs text-gray-400 ml-1">{field.hint}</span>}
        </label>
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm flex-1"
        >
          {(opts as [string, string][]).map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <label className="text-sm text-gray-700 w-48 shrink-0">
        {field.label}
        {field.hint && <span className="text-xs text-gray-400 ml-1">{field.hint}</span>}
      </label>
      <div className="flex items-center gap-1.5">
        {field.unit === "$" && <span className="text-sm text-gray-500">$</span>}
        <Input
          type="number"
          step="any"
          value={value != null ? String(value) : ""}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-24"
        />
        {field.unit === "%" && <span className="text-sm text-gray-500">%</span>}
      </div>
    </div>
  );
}
