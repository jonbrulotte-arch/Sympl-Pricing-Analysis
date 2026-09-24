"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Check, ArrowLeft, AlertCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SalsifySyncPage() {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

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
          const { created, updated } = statusData.errors ?? {};
          setResult({ created: created ?? 0, updated: updated ?? 0 });
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
            <p className="text-gray-600 mb-1">{result.created} new products created</p>
            <p className="text-gray-600 mb-6">{result.updated} existing products updated</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => router.push("/products")}>
                View Products
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
                Column headers from the export are automatically matched to product fields.
                Price data is stored at the product level and becomes available for analysis
                when products are assigned to a customer project.
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
