"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface ProductTableRow {
  id: string;
  sku: string;
  name: string | null;
  brand: string | null;
  inventoryStatus: string | null;
  cost: number | null;
  costDate: string | null;
  freight: number | null;
  records: number;
  customerCount: number;
}

interface Props {
  rows: ProductTableRow[];
  emptyMessage: string;
  /** Present for admins: enables selection and the assign bar. */
  assign?: {
    customers: { id: string; name: string }[];
    unassignedOnly: boolean;
    totalCount: number;
    q?: string;
  };
}

export function ProductsTable({ rows, emptyMessage, assign }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const selectable = !!assign;
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const customerName = assign?.customers.find((c) => c.id === customerId)?.name;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function assignProducts(body: Record<string, unknown>) {
    if (!customerId) return;
    setBusy(true);
    setMessage(null);
    const res = await fetch(`/api/customers/${customerId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMessage({ ok: false, text: data.error || "Failed to assign products" });
      return;
    }
    setMessage({ ok: true, text: `${data.added} product(s) assigned to ${customerName}` });
    setSelected(new Set());
    router.refresh();
  }

  const showBar = selectable && (selected.size > 0 || (assign.unassignedOnly && assign.totalCount > 0));

  return (
    <>
      {showBar && (
        <div className="flex flex-wrap items-center gap-3 mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <UserPlus className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="text-sm text-gray-700">
            {selected.size > 0 ? `${selected.size} selected` : "Assign products"}
          </span>
          <span className="text-sm text-gray-500">to</span>
          <Select value={customerId} onValueChange={setCustomerId}>
            <SelectTrigger className="w-56 h-8 text-sm bg-white">
              <SelectValue placeholder="Choose a customer..." />
            </SelectTrigger>
            <SelectContent>
              {assign.customers.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected.size > 0 && (
            <Button size="sm" disabled={!customerId || busy} onClick={() => assignProducts({ productIds: [...selected] })}>
              Assign {selected.size}
            </Button>
          )}
          {assign.unassignedOnly && assign.totalCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="bg-white"
              disabled={!customerId || busy}
              onClick={() => assignProducts({ allUnassigned: true, q: assign.q ?? "" })}
            >
              Assign all {assign.totalCount}{assign.q ? " matching" : ""}
            </Button>
          )}
          {message && (
            <span className={message.ok ? "text-sm text-green-700" : "text-sm text-red-600"}>{message.text}</span>
          )}
        </div>
      )}
      {!showBar && message && (
        <p className={message.ok ? "text-sm text-green-700 mb-3" : "text-sm text-red-600 mb-3"}>{message.text}</p>
      )}

      <Card>
        <CardContent className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  {selectable && (
                    <th className="py-3 px-2 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                        aria-label="Select all on this page"
                      />
                    </th>
                  )}
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">SKU</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Name</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Brand</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Status</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Cost</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">MCF Freight</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Last Updated</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Records</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    {selectable && (
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggle(p.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                          aria-label={`Select ${p.sku}`}
                        />
                      </td>
                    )}
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-1.5">
                        <Link href={`/products/${p.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {p.sku}
                        </Link>
                        {p.customerCount === 0 && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Unassigned</Badge>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-gray-700 max-w-xs truncate">{p.name || "-"}</td>
                    <td className="py-2 px-2 text-gray-600">{p.brand || "-"}</td>
                    <td className="py-2 px-2">
                      {p.inventoryStatus?.toLowerCase() === "discontinued" ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                          <AlertTriangle className="h-3 w-3" />
                          DC&apos;d
                        </span>
                      ) : p.inventoryStatus?.toLowerCase() === "sales inventory" ? (
                        <span className="inline-flex items-center text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                          Active
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-gray-900">
                      {p.cost != null ? `$${p.cost.toFixed(2)}` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right font-mono text-gray-900">
                      {p.freight != null ? `$${p.freight.toFixed(2)}` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-500 text-xs">{p.costDate ?? "-"}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{p.records}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={selectable ? 9 : 8} className="py-8 text-center text-gray-500">
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
