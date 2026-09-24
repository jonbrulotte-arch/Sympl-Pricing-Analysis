"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

interface StagedEntry {
  id: string;
  sku: string;
  channelId: string;
  newPrice: string;
  oldPrice: string | null;
  oldNetMargin: string | null;
  newNetMargin: string | null;
  stagedAt: string;
  channel: {
    name: string;
    tabLabel: string;
    priceField: string;
  };
}

interface SkuGroup {
  sku: string;
  entries: StagedEntry[];
}

interface Props {
  customerId: string;
}

export function PublishToSalsify({ customerId }: Props) {
  const [staged, setStaged] = useState<StagedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const fetchStaged = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/salsify-staged`);
    if (res.ok) {
      const data = await res.json();
      setStaged(data.staged ?? []);
    }
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    fetchStaged();
  }, [fetchStaged]);

  const groups: SkuGroup[] = [];
  const seen = new Map<string, SkuGroup>();
  for (const entry of staged) {
    let group = seen.get(entry.sku);
    if (!group) {
      group = { sku: entry.sku, entries: [] };
      seen.set(entry.sku, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }

  const allIds = staged.map((e) => e.id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }

  function toggleSku(sku: string) {
    const skuIds = staged.filter((e) => e.sku === sku).map((e) => e.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allIn = skuIds.every((id) => next.has(id));
      for (const id of skuIds) {
        if (allIn) next.delete(id); else next.add(id);
      }
      return next;
    });
  }

  async function publishEntries(ids: string[]) {
    setPublishing((prev) => new Set([...prev, ...ids]));
    setFeedback(null);

    try {
      const res = await fetch(`/api/customers/${customerId}/salsify-publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: "error", message: data.error ?? "Publish failed" });
        return;
      }

      const msg = [`Published ${data.published} SKU(s) to Salsify.`];
      if (data.failed?.length > 0) {
        msg.push(`${data.failed.length} failed.`);
      }
      if (data.unmappedFields?.length > 0) {
        msg.push(`Unmapped fields: ${data.unmappedFields.join(", ")}`);
      }
      setFeedback({ type: data.failed?.length > 0 ? "error" : "success", message: msg.join(" ") });

      setStaged((prev) => prev.filter((e) => !ids.includes(e.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    } finally {
      setPublishing((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }

  async function publishSku(sku: string) {
    const ids = staged.filter((e) => e.sku === sku).map((e) => e.id);
    await publishEntries(ids);
  }

  async function publishSelected() {
    await publishEntries([...selectedIds]);
  }

  async function removeEntries(ids: string[]) {
    const res = await fetch(`/api/customers/${customerId}/salsify-staged`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: ids.map((id) => ({ id })) }),
    });
    if (res.ok) {
      setStaged((prev) => prev.filter((e) => !ids.includes(e.id)));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }

  function fmt(val: string | null | undefined): string {
    if (val == null) return "-";
    const n = Number(val);
    return isNaN(n) ? "-" : `$${n.toFixed(2)}`;
  }

  function fmtPct(val: string | null | undefined): string {
    if (val == null) return "-";
    const n = Number(val);
    return isNaN(n) ? "-" : `$${n.toFixed(2)}`;
  }

  function deltaColor(oldVal: string | null, newVal: string): string {
    if (oldVal == null) return "text-gray-700";
    const diff = Number(newVal) - Number(oldVal);
    if (diff > 0) return "text-green-600";
    if (diff < 0) return "text-red-600";
    return "text-gray-500";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading staged prices...
      </div>
    );
  }

  if (staged.length === 0) {
    return (
      <div className="text-center py-16">
        <Upload className="h-8 w-8 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500">No prices staged for publishing.</p>
        <p className="text-sm text-gray-400 mt-1">
          Commit prices on any channel tab to stage them here.
        </p>
      </div>
    );
  }

  return (
    <div>
      {feedback && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-md mb-4 text-sm ${
          feedback.type === "success"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {feedback.type === "success"
            ? <CheckCircle className="h-4 w-4 shrink-0" />
            : <AlertTriangle className="h-4 w-4 shrink-0" />}
          {feedback.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-600">
          {staged.length} price change{staged.length !== 1 ? "s" : ""} across {groups.length} SKU{groups.length !== 1 ? "s" : ""} staged
        </p>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => removeEntries([...selectedIds])}
                className="text-xs"
              >
                Remove ({selectedIds.size})
              </Button>
              <Button
                size="sm"
                onClick={publishSelected}
                disabled={publishing.size > 0}
                className="text-xs"
              >
                {publishing.size > 0 ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                Publish Selected ({selectedIds.size})
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="py-2 px-3 text-left w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                />
              </th>
              <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs">SKU</th>
              <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs">Channel</th>
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">Old Price</th>
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">New Price</th>
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">Old Net $</th>
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">New Net $</th>
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs w-24"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const skuIds = group.entries.map((e) => e.id);
              const skuSelected = skuIds.every((id) => selectedIds.has(id));
              const skuPublishing = skuIds.some((id) => publishing.has(id));

              return group.entries.map((entry, i) => (
                <tr
                  key={entry.id}
                  className={`border-b border-gray-50 hover:bg-gray-50/50 ${
                    i === 0 && groups.indexOf(group) > 0 ? "border-t border-gray-200" : ""
                  }`}
                >
                  <td className="py-2 px-3">
                    {i === 0 && (
                      <input
                        type="checkbox"
                        checked={skuSelected}
                        onChange={() => toggleSku(group.sku)}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
                      />
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-xs text-gray-900">
                    {i === 0 ? group.sku : ""}
                  </td>
                  <td className="py-2 px-3">
                    <Badge variant="secondary" className="text-xs">
                      {entry.channel.tabLabel}
                    </Badge>
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-500">
                    {fmt(entry.oldPrice)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono font-medium ${deltaColor(entry.oldPrice, entry.newPrice)}`}>
                    {fmt(entry.newPrice)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-500">
                    {fmtPct(entry.oldNetMargin)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono font-medium ${deltaColor(entry.oldNetMargin, entry.newNetMargin ?? "")}`}>
                    {fmtPct(entry.newNetMargin)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {i === 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => publishSku(group.sku)}
                        disabled={skuPublishing}
                        className="h-7 text-xs"
                      >
                        {skuPublishing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          "Publish"
                        )}
                      </Button>
                    )}
                  </td>
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
