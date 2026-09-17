"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";

interface Props {
  productId: string;
  currentCost: number | null;
  currentShipping: Record<string, number>;
}

const SHIPPING_LABELS: Record<string, string> = {
  std: "Standard Shipping",
  mcf_ship: "MCF Ship",
  mcf_freight: "MCF Freight",
  fba_fee: "FBA Fee",
};

export function ProductEditor({ productId, currentCost, currentShipping }: Props) {
  const router = useRouter();
  const [cost, setCost] = useState(currentCost?.toString() ?? "");
  const [shipping, setShipping] = useState<Record<string, string>>({
    std: currentShipping.std?.toString() ?? "",
    mcf_ship: currentShipping.mcf_ship?.toString() ?? "",
    mcf_freight: currentShipping.mcf_freight?.toString() ?? "",
    fba_fee: currentShipping.fba_fee?.toString() ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    const body: Record<string, number> = {};
    const costVal = parseFloat(cost);
    if (isFinite(costVal) && costVal >= 0 && costVal !== currentCost) {
      body.cost = costVal;
    }

    const fieldMap: Record<string, string> = {
      std: "shipping",
      mcf_ship: "mcfShip",
      mcf_freight: "mcfFreight",
      fba_fee: "fbaFee",
    };
    for (const [type, field] of Object.entries(fieldMap)) {
      const val = parseFloat(shipping[type]);
      if (isFinite(val) && val >= 0 && val !== currentShipping[type]) {
        body[field] = val;
      }
    }

    if (Object.keys(body).length === 0) {
      setSaving(false);
      return;
    }

    const res = await fetch(`/api/products/${productId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);

    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save");
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Cost & Shipping</CardTitle>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-green-600">Saved</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
          <Button size="sm" onClick={handleSave} disabled={saving}>
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Unit Cost</label>
            <div className="relative">
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-600">$</span>
              <Input
                type="number"
                step="0.01"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                className="pl-6"
              />
            </div>
          </div>
          {Object.entries(SHIPPING_LABELS).map(([type, label]) => (
            <div key={type}>
              <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-600">$</span>
                <Input
                  type="number"
                  step="0.01"
                  value={shipping[type]}
                  onChange={(e) => setShipping((prev) => ({ ...prev, [type]: e.target.value }))}
                  className="pl-6"
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
