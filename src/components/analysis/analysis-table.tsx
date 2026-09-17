"use client";

import { useState, Fragment } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import type { AnalysisResult, ChannelConfig, ChannelDefaults } from "@/lib/pricing/types";
import { ChevronDown, ChevronUp, ArrowUpDown, Check, BarChart3 } from "lucide-react";
import { SkuDetailPanel } from "./sku-detail-panel";

interface Props {
  results: AnalysisResult[];
  sortKey: string;
  sortDir: "asc" | "desc";
  onSort: (key: string) => void;
  onOverride: (sku: string, field: "price" | "ship", value: number | undefined) => void;
  channelId: string;
  onCommit?: (sku: string) => Promise<void>;
  cfg?: ChannelConfig;
  settings?: ChannelDefaults;
  onShowMath?: (sku: string) => void;
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pass: { label: "At Goal", variant: "default" },
  below: { label: "Below", variant: "secondary" },
  loss: { label: "Loss", variant: "destructive" },
  unpriced: { label: "Unpriced", variant: "outline" },
  invalid: { label: "Invalid", variant: "outline" },
};

export function AnalysisTable({ results, sortKey, sortDir, onSort, onOverride, channelId, onCommit, cfg, settings, onShowMath }: Props) {
  const [expandedSku, setExpandedSku] = useState<string | null>(null);
  const [committingSkus, setCommittingSkus] = useState<Set<string>>(new Set());
  const colCount = 11 + (onCommit ? 1 : 0) + (cfg ? 1 : 0);

  function SortHeader({ label, field }: { label: string; field: string }) {
    return (
      <th
        className="text-left py-2 px-2 text-gray-600 font-medium cursor-pointer select-none hover:text-gray-900 text-xs"
        onClick={() => onSort(field)}
      >
        <span className="flex items-center gap-1">
          {label}
          {sortKey === field ? (
            sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
          ) : (
            <ArrowUpDown className="h-3 w-3 opacity-30" />
          )}
        </span>
      </th>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200">
            <SortHeader label="SKU" field="sku" />
            <SortHeader label="Name" field="name" />
            <SortHeader label="Brand" field="brand" />
            <SortHeader label="Cost" field="cost" />
            <SortHeader label="Price" field="price" />
            <th className="text-right py-2 px-2 text-gray-600 font-medium text-xs">Ship</th>
            <SortHeader label="GM%" field="gm" />
            <SortHeader label="Net $" field="net" />
            <SortHeader label="Rec" field="rec" />
            <SortHeader label="+/-%" field="delta" />
            <th className="text-center py-2 px-2 text-gray-600 font-medium text-xs">Status</th>
            {onCommit && <th className="text-center py-2 px-2 text-gray-600 font-medium text-xs w-16"></th>}
            {cfg && <th className="text-center py-2 px-2 text-gray-600 font-medium text-xs w-16"></th>}
          </tr>
        </thead>
        <tbody>
          {results.map((r) => {
            const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.invalid;
            const expanded = expandedSku === r.sku;

            return (
              <Fragment key={r.sku}>
              <tr className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-1.5 px-2">
                  <button
                    onClick={() => setExpandedSku(expanded ? null : r.sku)}
                    className="font-mono text-xs text-blue-600 hover:underline"
                  >
                    {r.sku}
                  </button>
                </td>
                <td className="py-1.5 px-2 text-gray-700 max-w-[200px] truncate text-xs">{r.name ?? "-"}</td>
                <td className="py-1.5 px-2 text-gray-600 text-xs">{r.brand ?? "-"}</td>
                <td className="py-1.5 px-2 text-right text-xs">{r.cost != null ? `$${r.cost.toFixed(2)}` : "-"}</td>
                <td className="py-1.5 px-2 text-right">
                  <EditableCell
                    value={r.price}
                    edited={r.edited}
                    onChange={(v) => onOverride(r.sku, "price", v)}
                  />
                </td>
                <td className="py-1.5 px-2 text-right text-xs text-gray-600">{r.hasShippingData ? `$${r.ship.toFixed(2)}` : "-"}</td>
                <td className={`py-1.5 px-2 text-right text-xs font-medium ${gmColor(r.gm, r.goalUsed)}`}>
                  {r.price > 0 ? `${(r.gm * 100).toFixed(1)}%` : "-"}
                </td>
                <td className={`py-1.5 px-2 text-right text-xs ${r.net >= 0 ? "text-gray-900" : "text-red-600"}`}>
                  {r.price > 0 ? `$${r.net.toFixed(2)}` : "-"}
                </td>
                <td className="py-1.5 px-2 text-right text-xs text-blue-600">
                  {r.rec != null ? `$${r.rec.toFixed(2)}` : "-"}
                </td>
                <td className="py-1.5 px-2 text-right text-xs">
                  {r.deltaPct != null ? `${(r.deltaPct * 100).toFixed(1)}%` : "-"}
                </td>
                <td className="py-1.5 px-2 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                    {r.edited && (
                      <Badge variant="warning" className="text-[10px]" title="Price edited but not yet committed">
                        Edited
                      </Badge>
                    )}
                  </div>
                </td>
                {onCommit && (
                  <td className="py-1.5 px-2 text-center">
                    {(r.edited || (r.rec != null && r.rec !== r.price && !r.invalid && !r.unpriced)) && (
                      <button
                        disabled={committingSkus.has(r.sku)}
                        onClick={async () => {
                          setCommittingSkus((s) => new Set(s).add(r.sku));
                          try { await onCommit(r.sku); } finally {
                            setCommittingSkus((s) => { const n = new Set(s); n.delete(r.sku); return n; });
                          }
                        }}
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" />
                        {committingSkus.has(r.sku) ? "..." : "Commit"}
                      </button>
                    )}
                  </td>
                )}
                {cfg && (
                  <td className="py-1.5 px-2 text-center">
                    <button
                      onClick={() => setExpandedSku(expanded ? null : r.sku)}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border ${
                        expanded
                          ? "border-blue-600 text-blue-600 bg-blue-50"
                          : "border-gray-300 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      <BarChart3 className="h-3 w-3" />
                      Detail
                    </button>
                  </td>
                )}
              </tr>
              {expanded && cfg && settings && (
                <tr className="border-b border-gray-100">
                  <td colSpan={colCount} className="p-3 bg-white">
                    <SkuDetailPanel
                      result={r}
                      cfg={cfg}
                      settings={settings}
                      onShowMath={() => onShowMath?.(r.sku)}
                    />
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {results.length === 0 && (
        <p className="text-sm text-gray-500 text-center py-8">No products match the current filters.</p>
      )}
    </div>
  );
}

function gmColor(gm: number, goal: number): string {
  if (gm >= goal) return "text-green-600";
  if (gm >= 0) return "text-amber-600";
  return "text-red-600";
}

function EditableCell({
  value,
  edited,
  onChange,
}: {
  value: number;
  edited: boolean;
  onChange: (v: number | undefined) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (editing) {
    return (
      <Input
        type="number"
        step="0.01"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const v = parseFloat(draft);
          if (isFinite(v) && v > 0) onChange(v);
          else if (draft === "") onChange(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") setEditing(false);
        }}
        className="w-20 h-6 text-xs px-1 py-0"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={() => { setDraft(value > 0 ? value.toFixed(2) : ""); setEditing(true); }}
      className={`text-xs text-right ${edited ? "text-blue-600 font-medium" : "text-gray-900"} hover:underline`}
    >
      {value > 0 ? `$${value.toFixed(2)}` : "-"}
    </button>
  );
}
