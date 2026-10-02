"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function PurgeProductsButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [purging, setPurging] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");

  const confirmed = confirmation === "PURGE";

  async function handlePurge() {
    setPurging(true);
    setError("");
    try {
      const res = await fetch("/api/admin/settings/purge-products", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Purge failed");
        return;
      }
      setResult(body.purged);
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setPurging(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setConfirmation("");
    setResult(null);
    setError("");
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 className="h-4 w-4 mr-2" />
          Purge Products Database
        </Button>
      </DialogTrigger>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Purge Complete</DialogTitle>
              <DialogDescription>
                The products database has been reset. A data resync will be required to rebuild.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-600">Products deleted</span><span className="font-medium">{result.products}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Cost records</span><span className="font-medium">{result.costHistory}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Price records</span><span className="font-medium">{result.priceHistory}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Shipping records</span><span className="font-medium">{result.shippingCostHistory}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Customer–product links</span><span className="font-medium">{result.customerProducts}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Analysis results</span><span className="font-medium">{result.analysisResults}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Staged Salsify prices</span><span className="font-medium">{result.salsifyStaged}</span></div>
            </div>
            <DialogFooter>
              <Button onClick={handleClose}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Purge Products Database
              </DialogTitle>
              <DialogDescription>
                This will permanently delete <strong>all products</strong> and their associated data
                including cost history, price history, shipping costs, analysis results, and
                customer–product links. A full data resync will be required to rebuild.
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
              <p className="font-medium mb-1">This action cannot be undone.</p>
              <p>Type <strong>PURGE</strong> below to confirm.</p>
            </div>
            <Input
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              placeholder="Type PURGE to confirm"
              className="font-mono"
              disabled={purging}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={purging}>Cancel</Button>
              <Button variant="destructive" onClick={handlePurge} disabled={!confirmed || purging}>
                {purging ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Purging...
                  </>
                ) : (
                  "Purge All Products"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
