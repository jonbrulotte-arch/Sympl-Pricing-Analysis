"use client";

import { useState } from "react";
import { Check, AlertCircle, RefreshCw, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface TestResult {
  listId: string;
  total: number;
  sampleSkus: string[];
  sampled: number;
  priceProperty: { name: string; found: number; sample: { sku: string; price: number }[] } | null;
  numericProperties: string[];
}

interface SyncSummary {
  listTotal: number;
  skus: number;
  createdProducts: number;
  addedToChannel: number;
  removedFromChannel: number;
  linkedToCustomer: number;
  pricesRecorded: number;
  priceMissing: number;
}

interface Props {
  customerId: string;
  channelId: string;
  listId: string;
  onListIdChange: (v: string) => void;
  priceProperty: string;
  onPricePropertyChange: (v: string) => void;
  savedListId: string | null;
  savedPriceProperty: string | null;
  syncedAt: string | null;
  productCount: number;
  onSynced: () => void;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function SalsifyListCard({
  customerId,
  channelId,
  listId,
  onListIdChange,
  priceProperty,
  onPricePropertyChange,
  savedListId,
  savedPriceProperty,
  syncedAt,
  productCount,
  onSynced,
}: Props) {
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<{ fetched: number; total: number } | null>(null);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/customers/${customerId}/channels/${channelId}/salsify-list`;
  const unsaved =
    (listId.trim() || null) !== savedListId || (priceProperty.trim() || null) !== savedPriceProperty;

  async function runTest() {
    setTesting(true);
    setError(null);
    setTest(null);
    const res = await fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", listId, priceProperty }),
    });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    if (!res.ok) setError(data.error || "Test failed");
    else setTest(data);
  }

  async function runSync() {
    setSyncing(true);
    setError(null);
    setSummary(null);
    setProgress(null);
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Sync failed to start");
        return;
      }
      while (true) {
        await sleep(2000);
        const s = await fetch(`${base}?importId=${data.importId}`);
        const st = await s.json().catch(() => ({}));
        if (!s.ok) {
          setError(st.error || "Lost track of the sync");
          return;
        }
        if (st.status === "complete") {
          setSummary(st.errors as SyncSummary);
          onSynced();
          return;
        }
        if (st.status === "failed") {
          setError(st.errors?.message || "Sync failed");
          return;
        }
        if (st.errors?.total) setProgress({ fetched: st.errors.fetched, total: st.errors.total });
      }
    } catch {
      setError("Network error during sync");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Card className="mb-4">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Salsify Product List</CardTitle>
        <p className="text-xs text-gray-500">
          Limit this channel to the SKUs in a Salsify product list. Leave blank to include all of the customer&apos;s
          products.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700 w-48 shrink-0">List ID or URL</label>
          <Input
            value={listId}
            onChange={(e) => onListIdChange(e.target.value)}
            placeholder="s-60422a8c-… or https://app.salsify.com/…/product_lists/s-…"
            className="flex-1 font-mono text-xs"
          />
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-gray-700 w-48 shrink-0">
            Channel price property
            <span className="text-xs text-gray-500 ml-1">(optional)</span>
          </label>
          <Input
            value={priceProperty}
            onChange={(e) => onPricePropertyChange(e.target.value)}
            placeholder="e.g. eBay Price"
            list={`salsify-price-props-${channelId}`}
            className="flex-1"
          />
          <datalist id={`salsify-price-props-${channelId}`}>
            {test?.numericProperties.map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={runTest} disabled={testing || !listId.trim()}>
            <FlaskConical className="h-3.5 w-3.5 mr-1.5" />
            {testing ? "Testing..." : "Test"}
          </Button>
          <Button size="sm" onClick={runSync} disabled={syncing || !savedListId || unsaved}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing..." : "Sync now"}
          </Button>
          {unsaved && listId.trim() && (
            <span className="text-xs text-amber-700">Save changes before syncing</span>
          )}
          {!unsaved && savedListId && (
            <span className="text-xs text-gray-500">
              {productCount} SKUs on this channel
              {syncedAt ? ` · last synced ${new Date(syncedAt).toLocaleString()}` : " · not synced yet"}
            </span>
          )}
        </div>

        {syncing && progress && (
          <p className="text-xs text-gray-500">
            Reading list from Salsify… {progress.fetched.toLocaleString()} of {progress.total.toLocaleString()}
          </p>
        )}

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="h-4 w-4 inline mr-1" />
            {error}
          </div>
        )}

        {test && (
          <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700 space-y-1">
            <p>
              <Check className="h-4 w-4 inline mr-1 text-green-600" />
              <span className="font-medium">{test.total.toLocaleString()} products</span> in list{" "}
              <span className="font-mono text-xs">{test.listId}</span>
            </p>
            <p className="text-xs text-gray-500">e.g. {test.sampleSkus.join(", ")}</p>
            {test.priceProperty && (
              <p className="text-xs">
                &ldquo;{test.priceProperty.name}&rdquo; has a price on {test.priceProperty.found} of {test.sampled} sampled
                products
                {test.priceProperty.sample.length > 0 &&
                  ` (${test.priceProperty.sample.map((s) => `${s.sku}: $${s.price.toFixed(2)}`).join(", ")})`}
              </p>
            )}
            {!test.priceProperty && test.numericProperties.length > 0 && (
              <p className="text-xs text-gray-500">
                Price properties found: {test.numericProperties.join(", ")}
              </p>
            )}
          </div>
        )}

        {summary && (
          <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-gray-700 space-y-0.5">
            <p className="font-medium text-green-800">Sync complete: {summary.skus.toLocaleString()} SKUs in list</p>
            <p>
              +{summary.addedToChannel} added to channel · −{summary.removedFromChannel} removed from channel
            </p>
            {summary.createdProducts > 0 && <p>{summary.createdProducts} new products created in the catalog</p>}
            {summary.linkedToCustomer > 0 && <p>{summary.linkedToCustomer} products newly assigned to this customer</p>}
            {savedPriceProperty && (
              <p>
                {summary.pricesRecorded} channel prices recorded
                {summary.priceMissing > 0 && ` · ${summary.priceMissing} SKUs have no "${savedPriceProperty}" value`}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
