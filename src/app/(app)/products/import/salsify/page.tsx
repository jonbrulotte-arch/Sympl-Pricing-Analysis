"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Check, ArrowLeft, AlertCircle, Settings, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { SUPPLEMENTAL_IMPORT_FIELDS } from "@/lib/pricing/constants";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface SyncResult {
  created: number;
  updated: number;
  unchanged: number;
  skipped: number;
  duplicates: number;
  totalRows: number;
  createdProducts: { sku: string; name: string | null }[];
}

function downloadSupplementalSheet(products: { sku: string; name: string | null }[]) {
  const headers = [...SUPPLEMENTAL_IMPORT_FIELDS.map((f) => f.label), "Item name"];
  const rows = products.map((p) => [p.sku, null, null, p.name ?? ""]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map((h, i) => ({ wch: i === headers.length - 1 ? 40 : Math.max(h.length + 2, 16) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Supplemental");
  XLSX.writeFile(wb, `supplemental-new-skus-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SalsifySyncPage() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [result, setResult] = useState<SyncResult | null>(null);

  async function handleSync() {
    setSyncing(true);
    setSyncError(null);
    setSyncProgress(0);
    setResult(null);

    try {
      const res = await fetch("/api/products/salsify-sync", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Salsify sync failed");
        setSyncing(false);
        return;
      }

      const { importId } = data;

      while (true) {
        await sleep(2000);
        const statusRes = await fetch(`/api/products/salsify-sync/${importId}`);
        const statusData = await statusRes.json();
        if (!statusRes.ok) {
          setSyncError(statusData.error || "Lost track of the sync status");
          break;
        }

        setSyncProgress(statusData.rowCount ?? 0);

        if (statusData.status === "complete") {
          const e = statusData.errors ?? {};
          setResult({
            created: e.created ?? 0,
            updated: e.updated ?? 0,
            unchanged: e.unchanged ?? 0,
            skipped: e.skipped ?? 0,
            duplicates: e.duplicates ?? 0,
            totalRows: e.totalRows ?? 0,
            createdProducts: Array.isArray(e.createdProducts) ? e.createdProducts : [],
          });
          break;
        }
        if (statusData.status === "failed") {
          setSyncError(statusData.errors?.message || "Salsify sync failed");
          break;
        }
      }
    } catch {
      setSyncError("Network error during Salsify sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/products/import">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Salsify Sync</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Pull product data from your Salsify channel export into the product database.
          </p>
        </div>
      </div>

      {result ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Sync Complete</h2>
            {result.totalRows > 0 && (
              <p className="text-sm text-gray-500 mb-3">{result.totalRows} rows in the channel export</p>
            )}
            <p className="text-gray-600 mb-1">{result.created} new products created</p>
            <p className="text-gray-600 mb-1">{result.updated} existing products updated</p>
            <p className="text-gray-600 mb-1">{result.unchanged} products unchanged</p>
            {result.skipped > 0 && (
              <p className="text-amber-700 mb-1">{result.skipped} rows skipped (blank SKU)</p>
            )}
            {result.duplicates > 0 && (
              <p className="text-amber-700 mb-1">{result.duplicates} duplicate SKU rows merged</p>
            )}
            {result.createdProducts.length > 0 && (
              <div className="mt-6 mx-auto max-w-md rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left">
                <p className="text-sm text-gray-700">
                  {result.createdProducts.length} new product(s) need cost and MCF freight data. Download a
                  Supplemental Data sheet pre-filled with their SKUs, fill it in, then upload it on the{" "}
                  <Link href="/products/import/supplemental" className="text-blue-600 hover:underline">
                    Supplemental Data
                  </Link>{" "}
                  page.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 bg-white"
                  onClick={() => downloadSupplementalSheet(result.createdProducts)}
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download Supplemental Sheet ({result.createdProducts.length} SKUs)
                </Button>
              </div>
            )}
            <div className="flex gap-3 justify-center mt-6">
              <Button onClick={() => router.push("/products")}>
                View Products
              </Button>
              <Button variant="outline" onClick={() => router.push("/products?assigned=unassigned")}>
                View Unassigned
              </Button>
              <Button variant="outline" onClick={() => { setResult(null); setSyncProgress(0); }}>
                Sync Again
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : syncing ? (
        <div className="text-center py-16">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Syncing from Salsify...</p>
          <p className="text-sm text-gray-500 mt-1">
            {syncProgress > 0 ? `${syncProgress} products processed so far` : "Triggering channel export..."}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            This can take several minutes depending on the size of your catalog.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardContent className="py-6">
              <p className="text-sm text-gray-700 mb-4">
                This will trigger the configured Salsify channel export, download the file, and import
                all product data (attributes, costs, prices, and shipping) into the product database.
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Every SKU in the export is imported into the product catalog, whether or not it is
                assigned to a customer. Column headers are matched to product fields automatically.
                Prices are stored per price field and apply to any customer channel using that field
                once the product is added to one of the customer&apos;s projects.
              </p>
              <div className="flex items-center gap-3">
                <Button onClick={handleSync}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync from Salsify
                </Button>
              </div>
            </CardContent>
          </Card>

          {syncError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 inline mr-1" />
              {syncError}
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-gray-700 space-y-1">
            <p>
              Uses your personal Salsify API key. Configure it in{" "}
              <Link href="/profile" className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
                <Settings className="h-3 w-3" /> Profile settings
              </Link>.
            </p>
            <p>
              The Salsify Channel ID is configured by an admin in{" "}
              <span className="font-medium">Admin &gt; Settings</span>.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
