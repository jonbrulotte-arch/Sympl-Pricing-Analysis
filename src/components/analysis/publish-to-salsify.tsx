"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, Loader2, CheckCircle, AlertTriangle, Undo2, Download, ArrowLeft, ArrowRight } from "lucide-react";
import * as XLSX from "xlsx";
import { SHIP_COMPONENTS } from "@/lib/pricing/shipping";

interface StagedEntry {
  id: string;
  sku: string;
  channelId: string;
  newPrice: string | null;
  oldPrice: string | null;
  shippingChanges: Record<string, number> | null;
  oldNetMargin: string | null;
  newNetMargin: string | null;
  stagedAt: string;
  brand: string | null;
  inventoryStatus: string | null;
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

interface PreviewChange {
  id: string;
  sku: string;
  channelLabel: string;
  priceField: string;
  salsifyProperty: string | null;
  currentValue: number | null;
  newValue: number;
}

interface Props {
  customerId: string;
  onRevert?: (channelId: string, sku: string, oldPrice: number | null) => void;
}

type ViewState =
  | { step: "list" }
  | {
      step: "preview";
      ids: string[];
      changes: PreviewChange[];
      unmappedFields: string[];
      shippingChanges: { sku: string; channelLabel: string; changes: Record<string, number> }[];
    }
  | { step: "success"; publishedCount: number; failedCount: number };

export function PublishToSalsify({ customerId, onRevert }: Props) {
  const [staged, setStaged] = useState<StagedEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState<Set<string>>(new Set());
  const [undoing, setUndoing] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [brandFilter, setBrandFilter] = useState<string>("all");
  const [view, setView] = useState<ViewState>({ step: "list" });
  const [previewing, setPreviewing] = useState(false);

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

  const channels = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of staged) map.set(e.channelId, e.channel.tabLabel);
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [staged]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const e of staged) {
      if (e.brand) set.add(e.brand);
    }
    return Array.from(set).sort();
  }, [staged]);

  const filtered = useMemo(() => {
    return staged.filter((e) => {
      if (channelFilter !== "all" && e.channelId !== channelFilter) return false;
      if (brandFilter !== "all" && (e.brand ?? "") !== brandFilter) return false;
      return true;
    });
  }, [staged, channelFilter, brandFilter]);

  const groups: SkuGroup[] = [];
  const seen = new Map<string, SkuGroup>();
  for (const entry of filtered) {
    let group = seen.get(entry.sku);
    if (!group) {
      group = { sku: entry.sku, entries: [] };
      seen.set(entry.sku, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }

  const filteredIds = filtered.map((e) => e.id);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));

  function toggleAll() {
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of filteredIds) next.delete(id);
        return next;
      });
    } else {
      setSelectedIds((prev) => new Set([...prev, ...filteredIds]));
    }
  }

  function toggleSku(sku: string) {
    const skuIds = filtered.filter((e) => e.sku === sku).map((e) => e.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allIn = skuIds.every((id) => next.has(id));
      for (const id of skuIds) {
        if (allIn) next.delete(id); else next.add(id);
      }
      return next;
    });
  }

  async function fetchPreview(ids: string[]) {
    setPreviewing(true);
    setFeedback(null);
    try {
      const res = await fetch(`/api/customers/${customerId}/salsify-publish/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error ?? "Failed to load preview" });
        return;
      }
      setView({
        step: "preview",
        ids,
        changes: data.changes ?? [],
        unmappedFields: data.unmappedFields ?? [],
        shippingChanges: data.shippingChanges ?? [],
      });
    } finally {
      setPreviewing(false);
    }
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
        setView({ step: "list" });
        return;
      }

      const removedIds: string[] = data.removedIds ?? [];
      if (removedIds.length > 0) {
        setStaged((prev) => prev.filter((e) => !removedIds.includes(e.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of removedIds) next.delete(id);
          return next;
        });
      }

      setView({
        step: "success",
        publishedCount: data.published ?? 0,
        failedCount: data.failed?.length ?? 0,
      });

      if (data.failed?.length > 0) {
        const errors = data.failed.map((f: { sku: string; error: string }) => `${f.sku}: ${f.error}`);
        setFeedback({ type: "error", message: `${data.failed.length} SKU(s) failed: ${errors.join("; ")}` });
      }
    } finally {
      setPublishing((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }

  async function publishSku(sku: string) {
    const ids = filtered.filter((e) => e.sku === sku).map((e) => e.id);
    await fetchPreview(ids);
  }

  async function publishSelected() {
    const visibleSelected = filteredIds.filter((id) => selectedIds.has(id));
    await fetchPreview(visibleSelected);
  }

  async function undoEntries(ids: string[]) {
    setUndoing((prev) => new Set([...prev, ...ids]));
    try {
      const res = await fetch(`/api/customers/${customerId}/salsify-staged`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: ids.map((id) => ({ id })), revert: true }),
      });
      if (res.ok) {
        const data = await res.json();
        const removed = staged.filter((e) => ids.includes(e.id));
        for (const entry of removed) {
          const oldPrice = entry.oldPrice != null ? Number(entry.oldPrice) : null;
          onRevert?.(entry.channelId, entry.sku, oldPrice);
        }
        setStaged((prev) => prev.filter((e) => !ids.includes(e.id)));
        setSelectedIds((prev) => {
          const next = new Set(prev);
          for (const id of ids) next.delete(id);
          return next;
        });
        setFeedback({
          type: "success",
          message: `Reverted ${data.reverted ?? ids.length} price(s) to previous values.`,
        });
      }
    } finally {
      setUndoing((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
    }
  }

  function downloadChangeReport(changes: PreviewChange[]) {
    const rows = changes.map((c) => ({
      SKU: c.sku,
      Channel: c.channelLabel,
      "Salsify Property": c.salsifyProperty ?? "(unmapped)",
      "Current Value (Salsify)": c.currentValue != null ? c.currentValue : "",
      "New Value": c.newValue,
      "Change": c.currentValue != null ? +(c.newValue - c.currentValue).toFixed(2) : "",
      "Change %": c.currentValue != null && c.currentValue > 0
        ? `${(((c.newValue - c.currentValue) / c.currentValue) * 100).toFixed(1)}%`
        : "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [
      { wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Change Report");
    XLSX.writeFile(wb, `salsify-change-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function formatShipping(changes: Record<string, number>): string {
    return SHIP_COMPONENTS.filter((c) => changes[c.key] != null)
      .map((c) => `${c.label} $${changes[c.key].toFixed(2)}`)
      .join(", ");
  }

  function fmt(val: string | number | null | undefined): string {
    if (val == null) return "-";
    const n = Number(val);
    return isNaN(n) ? "-" : `$${n.toFixed(2)}`;
  }

  function fmtPct(val: string | null | undefined): string {
    if (val == null) return "-";
    const n = Number(val);
    if (isNaN(n)) return "-";
    if (Math.abs(n) > 1) return "-";
    return `${(n * 100).toFixed(1)}%`;
  }

  function deltaColor(oldVal: string | null, newVal: string): string {
    if (oldVal == null) return "text-gray-700";
    const o = Number(oldVal);
    const n = Number(newVal);
    if (isNaN(o) || isNaN(n) || Math.abs(o) > 1 || Math.abs(n) > 1) return "text-gray-700";
    const diff = n - o;
    if (diff > 0) return "text-green-600";
    if (diff < 0) return "text-red-600";
    return "text-gray-500";
  }

  const visibleSelectedCount = filteredIds.filter((id) => selectedIds.has(id)).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading staged prices...
      </div>
    );
  }

  if (staged.length === 0 && view.step !== "success") {
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

  if (view.step === "success") {
    return (
      <div className="text-center py-16">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <CheckCircle className="h-8 w-8 text-green-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mb-2">
          Published to Salsify
        </h3>
        <p className="text-gray-600 mb-1">
          {view.publishedCount} SKU{view.publishedCount !== 1 ? "s" : ""} updated successfully.
        </p>
        {view.failedCount > 0 && (
          <p className="text-red-600 text-sm mb-1">
            {view.failedCount} SKU{view.failedCount !== 1 ? "s" : ""} failed to publish.
          </p>
        )}
        {feedback?.type === "error" && (
          <div className="max-w-lg mx-auto mt-3 flex items-start gap-2 px-4 py-3 rounded-md text-sm bg-red-50 text-red-700 border border-red-200 text-left">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{feedback.message}</span>
          </div>
        )}
        <div className="mt-6">
          <Button
            variant="outline"
            onClick={() => { setView({ step: "list" }); setFeedback(null); }}
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Staged Prices
          </Button>
        </div>
      </div>
    );
  }

  if (view.step === "preview") {
    const isPublishing = publishing.size > 0;
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setView({ step: "list" })}
              className="text-xs"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1" />
              Back
            </Button>
            <h3 className="text-sm font-medium text-gray-900">
              Change Report — {view.changes.length} price{view.changes.length !== 1 ? "s" : ""} to update
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => downloadChangeReport(view.changes)}
              className="text-xs"
            >
              <Download className="h-3.5 w-3.5 mr-1" />
              Download Report
            </Button>
            <Button
              size="sm"
              onClick={() => publishEntries(view.ids)}
              disabled={isPublishing}
              className="text-xs"
            >
              {isPublishing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Upload className="h-3.5 w-3.5 mr-1" />
              )}
              {isPublishing ? "Publishing..." : "Confirm Publish"}
            </Button>
          </div>
        </div>

        {view.unmappedFields.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-md mb-4 text-sm bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Unmapped fields will be skipped: {view.unmappedFields.join(", ")}. Configure mappings in Admin &gt; Salsify Field Mapping.
          </div>
        )}

        {feedback?.type === "error" && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-md mb-4 text-sm bg-red-50 text-red-700 border border-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {feedback.message}
          </div>
        )}

        {view.shippingChanges.length > 0 && (
          <div className="px-4 py-3 rounded-md mb-4 text-sm bg-blue-50 text-gray-700 border border-blue-200">
            <p className="font-medium mb-1">
              {view.shippingChanges.length} shipping cost change(s) will be recorded in the product database (not sent to Salsify):
            </p>
            <ul className="text-xs space-y-0.5">
              {view.shippingChanges.map((s) => (
                <li key={`${s.sku}-${s.channelLabel}`}>
                  <span className="font-mono">{s.sku}</span> ({s.channelLabel}): {formatShipping(s.changes)}
                </li>
              ))}
            </ul>
          </div>
        )}

        {view.changes.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No price changes to send to Salsify.</p>
        ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs">SKU</th>
                <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs">Channel</th>
                <th className="py-2 px-3 text-left text-gray-600 font-medium text-xs">Salsify Property</th>
                <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">Current (Salsify)</th>
                <th className="py-2 px-3 text-center text-gray-600 font-medium text-xs w-8"></th>
                <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">New Value</th>
                <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">Change</th>
              </tr>
            </thead>
            <tbody>
              {view.changes.map((c) => {
                const diff = c.currentValue != null ? c.newValue - c.currentValue : null;
                const diffPct = c.currentValue != null && c.currentValue > 0
                  ? ((c.newValue - c.currentValue) / c.currentValue) * 100
                  : null;
                const diffColor = diff != null
                  ? diff > 0 ? "text-green-600" : diff < 0 ? "text-red-600" : "text-gray-500"
                  : "text-gray-400";

                return (
                  <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 px-3 font-mono text-xs text-gray-900">{c.sku}</td>
                    <td className="py-2 px-3">
                      <Badge variant="secondary" className="text-xs">{c.channelLabel}</Badge>
                    </td>
                    <td className="py-2 px-3 text-xs text-gray-600">{c.salsifyProperty ?? "-"}</td>
                    <td className="py-2 px-3 text-right font-mono text-gray-500">
                      {c.currentValue != null ? fmt(c.currentValue) : <span className="text-gray-400 italic">not set</span>}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <ArrowRight className="h-3 w-3 text-gray-400 mx-auto" />
                    </td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-blue-600">
                      {fmt(c.newValue)}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono text-xs ${diffColor}`}>
                      {diff != null ? (
                        <span>
                          {diff > 0 ? "+" : ""}{fmt(diff)}
                          {diffPct != null && (
                            <span className="ml-1 text-gray-400">
                              ({diffPct > 0 ? "+" : ""}{diffPct.toFixed(1)}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400">new</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}

        <div className="flex items-center justify-end mt-4 gap-2">
          <Button
            variant="outline"
            onClick={() => setView({ step: "list" })}
          >
            Cancel
          </Button>
          <Button
            onClick={() => publishEntries(view.ids)}
            disabled={isPublishing}
          >
            {isPublishing ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Upload className="h-4 w-4 mr-1" />
            )}
            {isPublishing ? "Publishing..." : `Publish ${view.changes.length} Price${view.changes.length !== 1 ? "s" : ""} to Salsify`}
          </Button>
        </div>
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
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600">
            {filtered.length} price change{filtered.length !== 1 ? "s" : ""} across {groups.length} SKU{groups.length !== 1 ? "s" : ""} staged
          </p>
          {channels.length > 0 && (
            <select
              value={channelFilter}
              onChange={(e) => { setChannelFilter(e.target.value); setSelectedIds(new Set()); }}
              className="border rounded px-2 py-1 text-sm text-gray-700"
            >
              <option value="all">All channels</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>{ch.label}</option>
              ))}
            </select>
          )}
          {brands.length > 0 && (
            <select
              value={brandFilter}
              onChange={(e) => { setBrandFilter(e.target.value); setSelectedIds(new Set()); }}
              className="border rounded px-2 py-1 text-sm text-gray-700"
            >
              <option value="all">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          {visibleSelectedCount > 0 && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => undoEntries(filteredIds.filter((id) => selectedIds.has(id)))}
                disabled={undoing.size > 0}
                className="text-xs"
              >
                {undoing.size > 0 ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Undo2 className="h-3.5 w-3.5 mr-1" />
                )}
                Undo ({visibleSelectedCount})
              </Button>
              <Button
                size="sm"
                onClick={publishSelected}
                disabled={previewing || publishing.size > 0}
                className="text-xs"
              >
                {previewing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                ) : (
                  <Upload className="h-3.5 w-3.5 mr-1" />
                )}
                {previewing ? "Loading preview..." : `Publish Selected (${visibleSelectedCount})`}
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
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">Old Net Margin%</th>
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">New Price</th>
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs">New Net Margin%</th>
              <th className="py-2 px-3 text-right text-gray-600 font-medium text-xs w-24"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const skuIds = group.entries.map((e) => e.id);
              const skuSelected = skuIds.every((id) => selectedIds.has(id));
              const skuPublishing = skuIds.some((id) => publishing.has(id));
              const skuUndoing = skuIds.some((id) => undoing.has(id));

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
                    {i === 0 && (
                      <span className="inline-flex items-center gap-1">
                        {group.sku}
                        {entry.inventoryStatus?.toLowerCase() === "discontinued" && (
                          <span title="Discontinued — selling through remaining stock">
                            <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                          </span>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">
                    <div className="flex flex-wrap items-center gap-1">
                      <Badge variant="secondary" className="text-xs">
                        {entry.channel.tabLabel}
                      </Badge>
                      {entry.shippingChanges && (
                        <Badge variant="warning" className="text-[10px]" title={formatShipping(entry.shippingChanges)}>
                          Shipping
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-500">
                    {fmt(entry.oldPrice)}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-gray-500">
                    {fmtPct(entry.oldNetMargin)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono font-medium ${entry.newPrice == null ? "text-gray-400" : deltaColor(entry.oldPrice, entry.newPrice)}`}>
                    {entry.newPrice == null ? <span className="text-xs font-sans">shipping only</span> : fmt(entry.newPrice)}
                  </td>
                  <td className={`py-2 px-3 text-right font-mono font-medium ${deltaColor(entry.oldNetMargin, entry.newNetMargin ?? "")}`}>
                    {fmtPct(entry.newNetMargin)}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {i === 0 && (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => undoEntries(skuIds)}
                          disabled={skuUndoing}
                          className="h-7 text-xs text-gray-500 hover:text-red-600"
                          title="Undo — revert to previous price"
                        >
                          {skuUndoing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Undo2 className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => publishSku(group.sku)}
                          disabled={skuPublishing || previewing}
                          className="h-7 text-xs"
                        >
                          {skuPublishing || previewing ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Publish"
                          )}
                        </Button>
                      </div>
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
