"use client";

import { useState } from "react";
import { AlertTriangle, Check, Download, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { PublishAllRow } from "@/lib/export/single-sku-change-report";

const money = (v: number | null) => (v == null ? "-" : `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`);
const pct = (v: number | null) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);

/** The change report for Publish All: review each channel's old and new price and margin, back it up, then submit. */
export function PublishAllDialog({
  open,
  onOpenChange,
  customerName,
  sku,
  productName,
  rows,
  error,
  submitting,
  published,
  canExport,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerName: string;
  sku: string;
  productName: string;
  rows: PublishAllRow[];
  error: string | null;
  submitting: boolean;
  /** True once Salsify accepted the prices. */
  published: boolean;
  canExport: boolean;
  onSubmit: () => void;
}) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const ready = rows.filter((r) => !r.problem);
  const skipped = rows.length - ready.length;

  async function exportReport() {
    setExporting(true);
    setExportError(null);
    try {
      const { exportSingleSkuChangeReport } = await import("@/lib/export/single-sku-change-report");
      await exportSingleSkuChangeReport({ customerName, sku, productName, rows, published });
    } catch (err) {
      setExportError(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{published ? "Published to Salsify" : "Publish all channels to Salsify"}</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{sku}</span>
            {productName && ` · ${productName}`} · {customerName}.{" "}
            {published
              ? "These prices are now in Salsify. Export the report to keep a record of the old prices."
              : "Review each channel's price change. Export the report first if you want a backup of the current prices."}
          </DialogDescription>
        </DialogHeader>

        {published ? (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            Published {rows.filter((r) => r.published).length} channel{rows.filter((r) => r.published).length !== 1 ? "s" : ""}
            {skipped > 0 && `; ${skipped} skipped`}.
          </div>
        ) : (
          skipped > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {skipped} channel{skipped !== 1 ? "s" : ""} can&apos;t be published and will be skipped.
            </div>
          )
        )}

        <div className="border border-gray-200 rounded-md overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs text-gray-600">
                <th className="text-left py-2 px-3 font-medium">Channel</th>
                <th className="text-right py-2 px-3 font-medium">Old price</th>
                <th className="text-right py-2 px-3 font-medium">New price</th>
                <th className="text-right py-2 px-3 font-medium">Change</th>
                <th className="text-right py-2 px-3 font-medium">Old net margin</th>
                <th className="text-right py-2 px-3 font-medium">New net margin</th>
                <th className="text-left py-2 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const change = r.oldPrice != null ? r.newPrice - r.oldPrice : null;
                return (
                  <tr key={r.channelId} className="border-b border-gray-50 align-top">
                    <td className="py-2 px-3">
                      <p className="font-medium text-gray-900">{r.channelName}</p>
                      {r.salsifyProperty && <p className="text-[11px] text-gray-500">{r.salsifyProperty}</p>}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-gray-600">{money(r.oldPrice)}</td>
                    <td className="py-2 px-3 text-right font-mono font-medium text-gray-900">{money(r.newPrice)}</td>
                    <td className={cn("py-2 px-3 text-right font-mono text-xs", change != null && change < 0 ? "text-red-600" : "text-green-700")}>
                      {change == null ? "-" : `${change >= 0 ? "+" : "-"}$${Math.abs(change).toFixed(2)}`}
                      {change != null && r.oldPrice ? (
                        <span className="block text-gray-400">{`${change >= 0 ? "+" : ""}${((change / r.oldPrice) * 100).toFixed(1)}%`}</span>
                      ) : null}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className={cn("font-mono", r.oldNetMargin != null && r.oldNetMargin < 0 ? "text-red-600" : "text-gray-600")}>
                        {pct(r.oldNetMargin)}
                      </span>
                      <span className="block text-[11px] text-gray-400 font-mono">{money(r.oldNet)}</span>
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className={cn("font-mono font-medium", r.newNetMargin != null && r.newNetMargin < 0 ? "text-red-600" : "text-gray-900")}>
                        {pct(r.newNetMargin)}
                      </span>
                      <span className="block text-[11px] text-gray-400 font-mono">{money(r.newNet)}</span>
                    </td>
                    <td className="py-2 px-3 text-xs">
                      {r.problem ? (
                        <span className="text-amber-700">Skipped: {r.problem}</span>
                      ) : published ? (
                        r.published ? (
                          <Badge variant="success" className="text-[10px]">Published</Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">Not published</Badge>
                        )
                      ) : (
                        <Badge variant="default" className="text-[10px]">Ready</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-500">
          Only list prices are published. Net margins use the calculator&apos;s cost, shipping and allocations for both old and
          new, so the difference is the price change. Shipping changes aren&apos;t published; use Commit Price for those.
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {exportError && <p className="text-sm text-red-600">{exportError}</p>}

        <DialogFooter className="sm:justify-between">
          {canExport ? (
            <Button variant="outline" onClick={exportReport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
              Export to Excel
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              {published ? "Done" : "Cancel"}
            </Button>
            {!published && (
              <Button onClick={onSubmit} disabled={submitting || ready.length === 0}>
                {submitting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                Submit to Salsify ({ready.length})
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
