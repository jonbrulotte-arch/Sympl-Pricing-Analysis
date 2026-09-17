"use client";

import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { ArrowLeft, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { IMPORT_FIELDS } from "@/lib/pricing/constants";

const SALSIFY_PLACEHOLDERS: Record<string, string> = {
  sku: "Part Number",
  name: "Item Name",
  priceJSP: "eBay Price",
  priceMCF: "eBay MCF Price",
  priceWM: "WM.com Marketplace Price",
  priceShopify: "JS Website Price",
  priceFBM: "AMZ-RAK Price",
  priceFBA: "AMZ-RAK FBA Price",
  shipping: "USPS Shipping Rate",
  mcfShip: "Amazon MCF Fulfillment Class (1st value of ' | ' array)",
  units: "1 (Always 1)",
  invStatus: "Inventory Status (ERP)",
  available: "Available Inventory",
  brand: "Brand",
  fbaFee: "FBA Fullfilment Cost",
  fbaClass: "FBA Fulfillment Class",
  asin: "Amazon ASIN",
  amzCategory: "Amazon Category - Seller Central",
  amzItemType: "Amazon Item Type",
};

const SUPPLEMENTAL_ONLY = new Set(["cost", "mcfFreight", "royalty", "amzCommission", "ppc", "fvfFixed"]);

interface Channel {
  id: string;
  name: string;
  tabLabel: string;
  priceField: string;
}

export default function SalsifyMappingPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = use(params);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [channelsRes, mappingRes] = await Promise.all([
      fetch(`/api/customers/${customerId}/channels`),
      fetch(`/api/customers/${customerId}/salsify-mapping`),
    ]);
    if (channelsRes.ok) {
      const data = await channelsRes.json();
      setChannels(Array.isArray(data) ? data : (data.channels ?? []));
    }
    if (mappingRes.ok) {
      const data = await mappingRes.json() as { importFieldKey: string; salsifyPropertyId: string }[];
      const m: Record<string, string> = {};
      for (const row of data) m[row.importFieldKey] = row.salsifyPropertyId;
      setMapping(m);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  function setValue(key: string, value: string) {
    setMapping((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    const mappings = Object.entries(mapping).map(([importFieldKey, salsifyPropertyId]) => ({ importFieldKey, salsifyPropertyId }));
    const res = await fetch(`/api/customers/${customerId}/salsify-mapping`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings }),
    });
    setSaving(false);
    if (res.ok) setSaved(true);
  }

  const universalFields = IMPORT_FIELDS.filter((f) => !SUPPLEMENTAL_ONLY.has(f.key));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link href={`/customers/${customerId}`} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-2">
            <ArrowLeft className="h-4 w-4" /> Back to Customer
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Salsify Field Mapping</h1>
          <p className="text-sm text-gray-500 mt-1">
            Map each field this app uses to the corresponding Salsify Property ID for this customer.
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1.5" />
          {saving ? "Saving..." : saved ? "Saved" : "Save Mapping"}
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Universal Fields</CardTitle>
              <p className="text-xs text-gray-500">
                Fields not tied to a specific sales channel — SKU identity, cost, inventory, and product attributes.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {universalFields.map((f) => (
                <div key={f.key} className="grid grid-cols-2 gap-3 items-center">
                  <label className="text-sm text-gray-700">{f.label}</label>
                  <Input
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setValue(f.key, e.target.value)}
                    placeholder={SALSIFY_PLACEHOLDERS[f.key] ?? "Salsify Property ID"}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Channel Pricing</CardTitle>
              <p className="text-xs text-gray-500">
                This customer&apos;s configured sales channels — map each channel&apos;s price field to its Salsify Property ID.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {channels.length === 0 && (
                <p className="text-sm text-gray-500">No sales channels configured yet.</p>
              )}
              {channels.map((ch) => (
                <div key={ch.id} className="grid grid-cols-2 gap-3 items-center">
                  <label className="text-sm text-gray-700">
                    {ch.tabLabel || ch.name}
                    <span className="block text-xs text-gray-400">{ch.priceField}</span>
                  </label>
                  <Input
                    value={mapping[ch.priceField] ?? ""}
                    onChange={(e) => setValue(ch.priceField, e.target.value)}
                    placeholder={SALSIFY_PLACEHOLDERS[ch.priceField] ?? "Salsify Property ID"}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
            Fields not carried by Salsify (SKU Cost, To MCF Freight Cost, Royalty, Amazon Category Commission, PPC Fee, FVF Fixed)
            are brought in separately via a Supplemental Data Import spreadsheet and aren&apos;t mapped here.
          </div>
        </div>
      )}
    </div>
  );
}
