"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw, Check, ArrowLeft, AlertCircle, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CustomerOption {
  id: string;
  name: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function SalsifySyncPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((data) => {
        setCustomers(data.customers ?? data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSync() {
    if (!selectedCustomerId) return;
    setSyncing(true);
    setSyncError(null);
    setSyncProgress(0);
    setResult(null);

    try {
      const res = await fetch(`/api/customers/${selectedCustomerId}/salsify-sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Salsify sync failed");
        setSyncing(false);
        return;
      }

      const { importId } = data;

      while (true) {
        await sleep(2000);
        const statusRes = await fetch(`/api/customers/${selectedCustomerId}/imports/${importId}`);
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
            Pull product data from your Salsify catalog into the product database.
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
            {syncProgress > 0 ? `${syncProgress} products found so far` : "Starting..."}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            This can take several minutes for a large catalog.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Select Customer</CardTitle>
              <p className="text-sm text-gray-500">
                Salsify field mappings and channel prices are per-customer. Choose which customer to sync for.
              </p>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-gray-500">Loading customers...</p>
              ) : customers.length === 0 ? (
                <p className="text-sm text-gray-500">No customers found. Create a customer first.</p>
              ) : (
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="w-full text-sm border border-gray-300 rounded-md px-3 py-2"
                >
                  <option value="">Select a customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </CardContent>
          </Card>

          {selectedCustomerId && (
            <Card>
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Field Mapping</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Review or edit how Salsify properties map to product fields for this customer.
                  </p>
                </div>
                <Link href={`/customers/${selectedCustomerId}/salsify-mapping`}>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Edit Mapping
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )}

          {syncError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 inline mr-1" />
              {syncError}
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={handleSync} disabled={!selectedCustomerId}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Sync from Salsify
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
