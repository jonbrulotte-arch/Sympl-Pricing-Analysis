"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

export interface CustomerProductRow {
  id: string;
  sku: string;
  name: string | null;
  brand: string | null;
  inventoryStatus: string | null;
  cost: number | null;
  projectCount: number;
  channels: string[];
}

interface Props {
  customerId: string;
  rows: CustomerProductRow[];
  canEdit: boolean;
  canViewCost: boolean;
  unassignedCount: number;
  showChannels: boolean;
  emptyMessage: string;
}

interface AddResult {
  added: number;
  alreadyLinked: number;
  missing: string[];
}

export function CustomerProducts({ customerId, rows, canEdit, canViewCost, unassignedCount, showChannels, emptyMessage }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addOpen, setAddOpen] = useState(false);
  const [skuInput, setSkuInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<AddResult | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const selectedRows = rows.filter((r) => selected.has(r.id));
  const selectedInProjects = selectedRows.filter((r) => r.projectCount > 0).length;
  const skuCount = skuInput.split(/[\n,]+/).filter((s) => s.trim()).length;
  const colCount = 5 + (canEdit ? 1 : 0) + (canViewCost ? 1 : 0) + (showChannels ? 1 : 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function openAdd() {
    setSkuInput("");
    setAddResult(null);
    setAddError(null);
    setAddOpen(true);
  }

  async function postAdd(body: Record<string, unknown>) {
    setAdding(true);
    setAddError(null);
    setAddResult(null);
    const res = await fetch(`/api/customers/${customerId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setAdding(false);
    if (!res.ok) {
      setAddError(data.error || "Failed to add products");
      return;
    }
    setAddResult(data);
    router.refresh();
  }

  function handleAddSkus() {
    const skus = skuInput.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
    if (skus.length > 0) postAdd({ skus });
  }

  async function handleRemove() {
    setRemoving(true);
    const res = await fetch(`/api/customers/${customerId}/products`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [...selected] }),
    });
    setRemoving(false);
    if (res.ok) {
      setRemoveOpen(false);
      setSelected(new Set());
      router.refresh();
    }
  }

  return (
    <>
      {canEdit && (
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-600">
            {selected.size > 0 && `${selected.size} selected`}
          </div>
          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                onClick={() => setRemoveOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Remove ({selected.size})
              </Button>
            )}
            <Button size="sm" onClick={openAdd}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Products
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {canEdit && (
                    <th className="py-3 px-2 w-8">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={toggleAll}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                        aria-label="Select all on this page"
                      />
                    </th>
                  )}
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">SKU</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Name</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Brand</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Status</th>
                  {canViewCost && <th className="text-right py-3 px-2 text-gray-600 font-medium">Cost</th>}
                  {showChannels && <th className="text-left py-3 px-2 text-gray-600 font-medium">Channels</th>}
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Projects</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    {canEdit && (
                      <td className="py-2 px-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                          className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                          aria-label={`Select ${r.sku}`}
                        />
                      </td>
                    )}
                    <td className="py-2 px-2">
                      <Link href={`/products/${r.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                        {r.sku}
                      </Link>
                    </td>
                    <td className="py-2 px-2 text-gray-700 max-w-xs truncate">{r.name || "-"}</td>
                    <td className="py-2 px-2 text-gray-600">{r.brand || "-"}</td>
                    <td className="py-2 px-2 text-gray-600 text-xs">{r.inventoryStatus || "-"}</td>
                    {canViewCost && (
                      <td className="py-2 px-2 text-right font-mono text-gray-900">
                        {r.cost != null ? `$${r.cost.toFixed(2)}` : "-"}
                      </td>
                    )}
                    {showChannels && (
                      <td className="py-2 px-2">
                        {r.channels.length === 0 ? (
                          <span className="text-gray-400 text-xs">-</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.channels.map((c) => (
                              <Badge key={c} variant="secondary" className="text-[10px] px-1.5 py-0">{c}</Badge>
                            ))}
                          </div>
                        )}
                      </td>
                    )}
                    <td className="py-2 px-2 text-right text-gray-600">{r.projectCount || "-"}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={colCount} className="py-8 text-center text-gray-500">
                      {emptyMessage}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add Products */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Products</DialogTitle>
            <DialogDescription>
              Enter SKUs to assign to this customer, one per line or comma-separated. Products must already exist in the catalog.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Textarea
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              placeholder={"SKU-001\nSKU-002\nSKU-003"}
              rows={6}
              className="font-mono"
              autoFocus
            />
            <p className="text-xs text-gray-500">{skuCount} SKUs entered</p>

            {unassignedCount > 0 && (
              <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 flex items-center justify-between gap-3">
                <p className="text-xs text-gray-600">
                  {unassignedCount} products in the catalog aren&apos;t assigned to any customer.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={adding}
                  onClick={() => postAdd({ allUnassigned: true })}
                >
                  Add all unassigned
                </Button>
              </div>
            )}

            {addError && <p className="text-sm text-red-600">{addError}</p>}

            {addResult && (
              <div className="rounded-md border border-gray-200 px-3 py-2 text-sm space-y-1">
                <p className="text-green-700">{addResult.added} product(s) added</p>
                {addResult.alreadyLinked > 0 && (
                  <p className="text-gray-600">{addResult.alreadyLinked} already assigned</p>
                )}
                {addResult.missing.length > 0 && (
                  <div className="text-amber-700">
                    <p>
                      {addResult.missing.length} SKU(s) not in the catalog:{" "}
                      <span className="font-mono text-xs">
                        {addResult.missing.slice(0, 10).join(", ")}
                        {addResult.missing.length > 10 ? ` +${addResult.missing.length - 10} more` : ""}
                      </span>
                    </p>
                    <Link href="/products/import" className="text-xs text-blue-600 hover:underline">
                      Import them first
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              {addResult ? "Done" : "Cancel"}
            </Button>
            <Button onClick={handleAddSkus} disabled={adding || skuCount === 0}>
              {adding ? "Adding..." : "Add SKUs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove */}
      <Dialog open={removeOpen} onOpenChange={setRemoveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Products</DialogTitle>
            <DialogDescription>
              Remove {selected.size} product(s) from this customer? They stay in the product catalog with their
              price and cost history.
            </DialogDescription>
          </DialogHeader>
          {selectedInProjects > 0 && (
            <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                {selectedInProjects} of the selected product(s) are in this customer&apos;s projects and will be
                removed from those projects too.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoveOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleRemove} disabled={removing}>
              {removing ? "Removing..." : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
