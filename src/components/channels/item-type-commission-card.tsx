"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Download, Upload, Plus, Trash2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Override {
  itemType: string;
  commission: number;
  productCount: number;
}
interface ItemTypeInfo {
  itemType: string;
  productCount: number;
}

const ITEM_TYPE_HEADER = "Item Type";
const COMMISSION_HEADER = "Referral Fee %";

const norm = (s: string) => s.trim().toLowerCase();

export function ItemTypeCommissionCard({ customerId }: { customerId: string }) {
  const base = `/api/customers/${customerId}/item-type-commissions`;
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [itemTypes, setItemTypes] = useState<ItemTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newType, setNewType] = useState("");
  const [newPct, setNewPct] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = useCallback((data: { overrides: Override[]; itemTypes: ItemTypeInfo[] }) => {
    setOverrides(data.overrides);
    setItemTypes(data.itemTypes);
    setDrafts({});
  }, []);

  useEffect(() => {
    fetch(base)
      .then((r) => r.json())
      .then((d) => apply(d))
      .finally(() => setLoading(false));
  }, [base, apply]);

  async function save(entries: { itemType: string; commission: number | string | null }[], successText?: string) {
    setBusy(true);
    setMessage(null);
    const res = await fetch(base, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Failed to save" });
      return false;
    }
    apply(data);
    if (successText) setMessage({ ok: true, text: successText.replace("{saved}", data.saved).replace("{removed}", data.removed) });
    return true;
  }

  async function addOverride() {
    if (!newType || newPct.trim() === "") return;
    if (await save([{ itemType: newType, commission: newPct }])) {
      setNewType("");
      setNewPct("");
    }
  }

  function commitDraft(o: Override) {
    const d = drafts[o.itemType];
    if (d == null) return;
    const n = parseFloat(d);
    if (d.trim() === "" || !isFinite(n) || Math.abs(n - o.commission) < 0.0005) {
      setDrafts(({ [o.itemType]: _, ...rest }) => rest);
      return;
    }
    save([{ itemType: o.itemType, commission: n }]);
  }

  function exportSheet() {
    const byKey = new Map<string, { itemType: string; productCount: number; commission: number | null }>();
    for (const t of itemTypes) byKey.set(norm(t.itemType), { ...t, commission: null });
    for (const o of overrides) {
      const k = norm(o.itemType);
      byKey.set(k, { itemType: byKey.get(k)?.itemType ?? o.itemType, productCount: o.productCount, commission: o.commission });
    }
    const rows = [...byKey.values()].sort((a, b) => a.itemType.localeCompare(b.itemType));
    const ws = XLSX.utils.aoa_to_sheet([
      [ITEM_TYPE_HEADER, "Products", COMMISSION_HEADER],
      ...rows.map((r) => [r.itemType, r.productCount, r.commission]),
    ]);
    ws["!cols"] = [{ wch: 48 }, { wch: 10 }, { wch: 14 }];
    const help = XLSX.utils.aoa_to_sheet([
      ["How to use"],
      ["Fill in Referral Fee % (e.g. 8 for 8%) for item types that need an override."],
      ["Leave Referral Fee % blank to use the channel's default referral fee (clears an existing override)."],
      ["The per-unit minimum referral fee still applies when it is greater than the percentage."],
      ["Do not rename the column headers. The Products column is for reference and is ignored on import."],
    ]);
    help["!cols"] = [{ wch: 100 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Item Type Referral Fees");
    XLSX.utils.book_append_sheet(wb, help, "Instructions");
    XLSX.writeFile(wb, `item-type-referral-fees-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function importSheet(file: File) {
    setMessage(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false, defval: null });
      const header = (rows[0] ?? []).map((h) => norm(String(h ?? "")));
      const typeIdx = header.findIndex((h) => h === norm(ITEM_TYPE_HEADER) || h === "itemtype");
      const pctIdx = header.findIndex((h) => h.startsWith("referral") || h.startsWith("commission"));
      if (typeIdx < 0 || pctIdx < 0) {
        setMessage({ ok: false, text: `The sheet needs "${ITEM_TYPE_HEADER}" and "${COMMISSION_HEADER}" columns. Export a template to start from.` });
        return;
      }
      const existing = new Set(overrides.map((o) => norm(o.itemType)));
      const entries: { itemType: string; commission: number | string | null }[] = [];
      for (const r of rows.slice(1)) {
        const itemType = String(r[typeIdx] ?? "").trim();
        if (!itemType) continue;
        const cell = r[pctIdx];
        const blank = cell == null || String(cell).trim() === "";
        // Blank only matters for item types that currently have an override (it clears it).
        if (blank && !existing.has(norm(itemType))) continue;
        entries.push({ itemType, commission: blank ? null : (cell as number | string) });
      }
      if (entries.length === 0) {
        setMessage({ ok: true, text: "No referral fee values found in the sheet. Nothing changed." });
        return;
      }
      await save(entries, "Import complete: {saved} override(s) set, {removed} removed.");
    } catch {
      setMessage({ ok: false, text: "Couldn't read that file. Upload the .xlsx or .csv exported from here." });
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const overridden = new Set(overrides.map((o) => norm(o.itemType)));
  const available = itemTypes.filter((t) => !overridden.has(norm(t.itemType)));

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Item Type Referral Fee Overrides</CardTitle>
            <p className="text-xs text-gray-500 mt-1">
              Shared by all of this customer&apos;s Amazon-style channels. Products with a matching Amazon Item Type use
              this referral fee instead of the channel&apos;s default. A per-SKU referral fee from an import still takes
              priority.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={exportSheet} disabled={loading}>
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export
            </Button>
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={loading || busy}>
              <Upload className="h-3.5 w-3.5 mr-1.5" />
              Import
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importSheet(f);
              }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {message && (
          <div
            className={`rounded-md px-3 py-2 text-sm border ${
              message.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {message.ok ? <Check className="h-4 w-4 inline mr-1" /> : <AlertCircle className="h-4 w-4 inline mr-1" />}
            {message.text}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <>
            {overrides.length === 0 ? (
              <p className="text-sm text-gray-500">No overrides yet. Every product uses the channel&apos;s default referral fee.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-2 px-2 text-gray-600 font-medium text-xs">Item Type</th>
                    <th className="text-right py-2 px-2 text-gray-600 font-medium text-xs">Products</th>
                    <th className="text-right py-2 px-2 text-gray-600 font-medium text-xs">Referral Fee</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o) => (
                    <tr key={o.itemType} className="border-b border-gray-50">
                      <td className="py-1.5 px-2 text-gray-900 text-xs">{o.itemType}</td>
                      <td className="py-1.5 px-2 text-right text-gray-500 text-xs">{o.productCount}</td>
                      <td className="py-1.5 px-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={drafts[o.itemType] ?? String(o.commission)}
                            onChange={(e) => setDrafts((d) => ({ ...d, [o.itemType]: e.target.value }))}
                            onBlur={() => commitDraft(o)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                            }}
                            className="w-20 h-7 text-xs text-right"
                            disabled={busy}
                          />
                          <span className="text-xs text-gray-500">%</span>
                        </div>
                      </td>
                      <td className="py-1.5 px-2 text-right">
                        <button
                          onClick={() => save([{ itemType: o.itemType, commission: null }])}
                          className="text-gray-400 hover:text-red-600"
                          title="Remove override"
                          disabled={busy}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder={available.length ? "Add an item type..." : "No more item types available"} />
                </SelectTrigger>
                <SelectContent>
                  {available.map((t) => (
                    <SelectItem key={t.itemType} value={t.itemType}>
                      {t.itemType} ({t.productCount})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                placeholder="%"
                value={newPct}
                onChange={(e) => setNewPct(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addOverride();
                }}
                className="w-20 h-8 text-xs"
              />
              <Button size="sm" onClick={addOverride} disabled={busy || !newType || newPct.trim() === ""}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add
              </Button>
            </div>
            {itemTypes.length === 0 && (
              <p className="text-xs text-gray-500">
                None of this customer&apos;s products have an Amazon Item Type yet. Item types come from the Salsify Sync.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
