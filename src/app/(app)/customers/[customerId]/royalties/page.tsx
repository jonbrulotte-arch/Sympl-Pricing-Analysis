"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Plus } from "lucide-react";

interface RoyaltyEntry {
  id?: string;
  brandKey: string;
  brandName: string;
  value: number;
}

export default function RoyaltiesPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [entries, setEntries] = useState<RoyaltyEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [newValue, setNewValue] = useState<number>(6.9);

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/royalties`);
    if (res.ok) setEntries(await res.json());
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/customers/${customerId}/royalties`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: entries.map((e) => ({ brandName: e.brandName, value: e.value })) }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function addEntry() {
    if (!newBrand.trim()) return;
    setEntries((prev) => [
      ...prev,
      { brandKey: newBrand.toLowerCase().replace(/[^a-z0-9]/g, ""), brandName: newBrand.trim(), value: newValue },
    ]);
    setNewBrand("");
    setNewValue(6.9);
  }

  async function removeEntry(bk: string) {
    await fetch(`/api/customers/${customerId}/royalties`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandKey: bk }),
    });
    setEntries((prev) => prev.filter((e) => e.brandKey !== bk));
  }

  function updateValue(idx: number, value: number) {
    setEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, value } : e)));
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brand Royalties</h1>
          <p className="text-sm text-gray-500 mt-1">
            Royalty rates shared across all channels. The engine resolves royalty by priority:
            brand table, sheet column, or channel default.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-sm text-green-600">Saved</span>}
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save All"}
          </Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">Add Brand</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
              <Input
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                placeholder="e.g. Acme Widgets"
                onKeyDown={(e) => e.key === "Enter" && addEntry()}
              />
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700 mb-1">Rate %</label>
              <Input
                type="number"
                step="0.1"
                value={newValue}
                onChange={(e) => setNewValue(parseFloat(e.target.value) || 0)}
              />
            </div>
            <Button onClick={addEntry} disabled={!newBrand.trim()}>
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Royalty Table ({entries.length} brands)</CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No brand royalties configured. The channel default will be used.</p>
          ) : (
            <div className="space-y-2">
              {entries.map((entry, i) => (
                <div key={entry.brandKey} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-sm text-gray-900 flex-1">{entry.brandName}</span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      step="0.1"
                      value={entry.value}
                      onChange={(e) => updateValue(i, parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-sm"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                  <button
                    onClick={() => removeEntry(entry.brandKey)}
                    className="text-gray-400 hover:text-red-600 p-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Resolution Priority</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal list-inside text-sm text-gray-600 space-y-1">
            <li>If channel prefers &ldquo;Brand table&rdquo; and this table has a value, use it</li>
            <li>Otherwise, if the sheet has a royalty value for this SKU, use the sheet</li>
            <li>Otherwise, if this table has a value (fallback), use it</li>
            <li>Otherwise, use the channel&apos;s default royalty rate</li>
            <li>Values greater than 1 are auto-divided by 100 (treated as percent)</li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
