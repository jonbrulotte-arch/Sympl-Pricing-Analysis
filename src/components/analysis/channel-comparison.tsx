"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { AnalysisResult, ChannelConfig } from "@/lib/pricing/types";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

interface Row {
  sku: string;
  name: string | null;
  brand: string | null;
  productId: string | null;
  disc: boolean;
  byChannel: Record<string, AnalysisResult>;
  spread: number | null;
}

/** A result with a margin to compare: priced and with a cost. */
const hasMargin = (r: AnalysisResult | undefined): r is AnalysisResult => !!r && r.price > 0 && !r.invalid;

function marginColor(r: AnalysisResult): string {
  if (r.gm >= r.goalUsed) return "text-green-600";
  if (r.gm >= 0) return "text-amber-600";
  return "text-red-600";
}

/** Price and margin for every SKU across the analysis's channels, side by side. */
export function ChannelComparison({
  configs,
  results,
  loading,
  hideDiscontinued,
  onHideDiscontinued,
  onOpen,
  canExport = false,
  includeCost = false,
  reportName = "Channel comparison",
}: {
  configs: ChannelConfig[];
  results: Record<string, AnalysisResult[]>;
  loading: boolean;
  hideDiscontinued: boolean;
  onHideDiscontinued: (hide: boolean) => void;
  /** Opens a SKU on one channel's tab. */
  onOpen: (channelId: string, sku: string) => void;
  /** analysis:export */
  canExport?: boolean;
  /** data:viewCost: cost and fee columns in the export. */
  includeCost?: boolean;
  /** Names the export, e.g. the customer or "Customer — Project". */
  reportName?: string;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [onEvery, setOnEvery] = useState(false);
  const [sortKey, setSortKey] = useState("sku");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  const rows = useMemo(() => {
    const bySku = new Map<string, Row>();
    for (const cfg of configs) {
      for (const r of results[cfg.id] ?? []) {
        const row =
          bySku.get(r.sku) ??
          { sku: r.sku, name: r.name ?? null, brand: r.brand ?? null, productId: r.productId ?? null, disc: false, byChannel: {}, spread: null };
        row.byChannel[cfg.id] = r;
        row.disc ||= r.disc;
        bySku.set(r.sku, row);
      }
    }
    for (const row of bySku.values()) {
      const gms = Object.values(row.byChannel).filter(hasMargin).map((r) => r.gm);
      row.spread = gms.length >= 2 ? Math.max(...gms) - Math.min(...gms) : null;
    }
    return [...bySku.values()];
  }, [configs, results]);

  const summaries = useMemo(
    () =>
      configs.map((cfg) => {
        const list = (results[cfg.id] ?? []).filter((r) => !(hideDiscontinued && r.disc));
        const priced = list.filter(hasMargin);
        return {
          cfg,
          skus: list.length,
          priced: priced.length,
          avgGm: priced.length ? priced.reduce((s, r) => s + r.gm, 0) / priced.length : null,
          atGoal: priced.filter((r) => r.gm >= r.goalUsed).length,
        };
      }),
    [configs, results, hideDiscontinued],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (hideDiscontinued && row.disc) return false;
      if (onEvery && configs.some((c) => !row.byChannel[c.id])) return false;
      if (q && !row.sku.toLowerCase().includes(q) && !(row.name ?? "").toLowerCase().includes(q) && !(row.brand ?? "").toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [rows, search, onEvery, hideDiscontinued, configs]);

  const sorted = useMemo(() => {
    const value = (row: Row): string | number | null => {
      if (sortKey === "sku") return row.sku;
      if (sortKey === "name") return row.name ?? "";
      if (sortKey === "spread") return row.spread;
      const [field, chId] = sortKey.split(":");
      const r = row.byChannel[chId];
      if (field === "price") return r && r.price > 0 ? r.price : null;
      return hasMargin(r) ? r.gm : null;
    };
    return [...filtered].sort((a, b) => {
      const av = value(a);
      const bv = value(b);
      // Blanks always last, whichever way the column is sorted.
      if (av == null || bv == null) return av == null ? (bv == null ? 0 : 1) : -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : av - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function handleExport() {
    setExporting(true);
    setExportError(null);
    try {
      const { exportChannelComparison } = await import("@/lib/export/channel-comparison");
      const filters = [
        search.trim() && `Search "${search.trim()}"`,
        onEvery && "Only SKUs on every channel",
        hideDiscontinued && "Discontinued SKUs hidden",
      ].filter((f): f is string => !!f);
      await exportChannelComparison({
        reportName,
        configs,
        rows: sorted,
        totalRows: rows.length,
        filters,
        includeCost,
      });
    } catch (err) {
      setExportError(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  function sortBy(key: string) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      // Numbers read best high to low.
      setSortDir(key === "sku" || key === "name" ? "asc" : "desc");
    }
    setPage(1);
  }

  function SortHead({ label, k, className, title }: { label: string; k: string; className?: string; title?: string }) {
    const Icon = sortKey !== k ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
    return (
      <th className={cn("py-2 px-2 text-xs font-medium text-gray-600", className)} title={title}>
        <button onClick={() => sortBy(k)} className="inline-flex items-center gap-1 hover:text-gray-900">
          {label}
          <Icon className={cn("h-3 w-3", sortKey === k ? "text-blue-600" : "text-gray-300")} />
        </button>
      </th>
    );
  }

  if (loading && rows.length === 0) {
    return <p className="text-center py-16 text-sm text-gray-500">Calculating every channel...</p>;
  }

  return (
    <div>
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: `repeat(${Math.min(configs.length, 4)}, minmax(0, 1fr))` }}>
        {summaries.map((s) => (
          <div key={s.cfg.id} className="bg-white border border-gray-200 rounded-lg px-4 py-3">
            <p className="text-sm font-semibold text-gray-900 truncate">{s.cfg.tabLabel}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{s.avgGm != null ? `${(s.avgGm * 100).toFixed(1)}%` : "-"}</p>
            <p className="text-xs text-gray-500">Avg net margin</p>
            <p className="text-xs text-gray-600 mt-1">
              {s.skus} SKUs · {s.atGoal} at goal{s.priced < s.skus ? ` · ${s.skus - s.priced} unpriced or no cost` : ""}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search SKU, name, or brand..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={onEvery}
            onChange={(e) => {
              setOnEvery(e.target.checked);
              setPage(1);
            }}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
          />
          Only SKUs on every channel
        </label>
        <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={hideDiscontinued}
            onChange={(e) => {
              onHideDiscontinued(e.target.checked);
              setPage(1);
            }}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600"
          />
          Hide discontinued
        </label>
        <span className="ml-auto text-xs text-gray-500">
          {loading ? "Calculating..." : `${sorted.length} of ${rows.length} SKUs`}
        </span>
        {canExport && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExport} disabled={exporting || loading || sorted.length === 0}>
            <Download className="h-3.5 w-3.5 mr-1" />
            {exporting ? "Exporting..." : "Export"}
          </Button>
        )}
      </div>
      {exportError && <p className="text-xs text-red-600 mb-2">{exportError}</p>}

      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th colSpan={2} />
              {configs.map((cfg) => (
                <th key={cfg.id} colSpan={2} className="pt-2 px-2 text-xs font-semibold text-gray-900 text-center border-l border-gray-200">
                  {cfg.tabLabel}
                </th>
              ))}
              <th className="border-l border-gray-200" />
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200">
              <SortHead label="SKU" k="sku" className="text-left" />
              <SortHead label="Name" k="name" className="text-left" />
              {configs.map((cfg) => (
                <Fragment key={cfg.id}>
                  <SortHead label="Price" k={`price:${cfg.id}`} className="text-right border-l border-gray-200" />
                  <SortHead label="Margin" k={`gm:${cfg.id}`} className="text-right" />
                </Fragment>
              ))}
              <SortHead label="Spread" k="spread" title="Highest minus lowest net margin across the channels" className="text-right border-l border-gray-200" />
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={3 + configs.length * 2} className="py-10 text-center text-sm text-gray-500">
                  No SKUs match.
                </td>
              </tr>
            )}
            {pageRows.map((row) => {
              const best = Math.max(...Object.values(row.byChannel).filter(hasMargin).map((r) => r.gm));
              const comparable = Object.values(row.byChannel).filter(hasMargin).length >= 2;
              return (
                <tr key={row.sku} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-1.5 px-2 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1">
                      {row.productId ? (
                        <Link href={`/products/${row.productId}`} className="font-mono text-xs text-blue-600 hover:underline">
                          {row.sku}
                        </Link>
                      ) : (
                        <span className="font-mono text-xs text-gray-700">{row.sku}</span>
                      )}
                      {row.disc && (
                        <span title="Discontinued — selling through remaining stock">
                          <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-1.5 px-2 text-xs text-gray-700 max-w-[220px] truncate" title={row.name ?? undefined}>
                    {row.name ?? "-"}
                  </td>
                  {configs.map((cfg) => {
                    const r = row.byChannel[cfg.id];
                    if (!r) {
                      return (
                        <td key={cfg.id} colSpan={2} className="py-1.5 px-2 text-center text-xs text-gray-300 border-l border-gray-100" title="Not on this channel">
                          —
                        </td>
                      );
                    }
                    const isBest = comparable && hasMargin(r) && r.gm === best;
                    return (
                      <Fragment key={cfg.id}>
                        <td className="py-1.5 px-2 text-right text-xs border-l border-gray-100 whitespace-nowrap">
                          {r.price > 0 ? (
                            <span className={r.edited ? "text-blue-600" : "text-gray-900"}>${r.price.toFixed(2)}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                          {r.rec != null && Math.abs(r.rec - r.price) >= 0.005 && (
                            <p className="text-[10px] text-gray-400">rec ${r.rec.toFixed(2)}</p>
                          )}
                        </td>
                        <td className="py-1.5 px-2 text-right text-xs whitespace-nowrap">
                          <button
                            onClick={() => onOpen(cfg.id, row.sku)}
                            className="text-right hover:underline"
                            title={`Open on the ${cfg.tabLabel} tab`}
                          >
                            {r.invalid ? (
                              <span className="text-gray-400">No cost</span>
                            ) : r.price > 0 ? (
                              <>
                                <span
                                  className={cn(
                                    marginColor(r),
                                    // The highest margin in the row (not necessarily a good one): bold and outlined.
                                    isBest ? "font-bold rounded px-1 ring-1 ring-gray-700" : "font-medium",
                                  )}
                                  title={isBest ? "Best margin in this row" : undefined}
                                >
                                  {(r.gm * 100).toFixed(1)}%
                                </span>
                                <span className="block text-[10px] text-gray-500">${r.net.toFixed(2)}</span>
                              </>
                            ) : (
                              <span className="text-gray-400">Unpriced</span>
                            )}
                          </button>
                        </td>
                      </Fragment>
                    );
                  })}
                  <td className="py-1.5 px-2 text-right text-xs text-gray-700 border-l border-gray-100">
                    {row.spread != null ? `${(row.spread * 100).toFixed(1)} pts` : "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-xs text-gray-500">
        <span>
          Margin is net margin, colored against the SKU&apos;s goal (discontinued SKUs use the channel&apos;s sell-through goal); the best margin in each row is bold and outlined. Click a
          margin to open that SKU on the channel&apos;s tab.
        </span>
        {totalPages > 1 && (
          <span className="flex items-center gap-2 shrink-0 ml-4">
            Page {safePage} of {totalPages}
            <button
              onClick={() => setPage(safePage - 1)}
              disabled={safePage <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Prev
            </button>
            <button
              onClick={() => setPage(safePage + 1)}
              disabled={safePage >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
