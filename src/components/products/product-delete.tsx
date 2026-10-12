"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Props {
  productId: string;
  sku: string;
  costRecords: number;
  priceRecords: number;
  shippingRecords: number;
}

export function ProductDelete({ productId, sku, costRecords, priceRecords, shippingRecords }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/products/${productId}`, { method: "DELETE" });
    setLoading(false);

    if (res.ok) {
      setOpen(false);
      router.push("/products");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete");
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 hover:text-red-700 hover:bg-red-50"
        onClick={() => { setConfirmText(""); setError(null); setOpen(true); }}
      >
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Delete Product
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Product</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Deleting this product will permanently remove:
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mb-4">
              {costRecords > 0 && <li><strong>{costRecords}</strong> cost history record{costRecords !== 1 ? "s" : ""}</li>}
              {priceRecords > 0 && <li><strong>{priceRecords}</strong> price history record{priceRecords !== 1 ? "s" : ""}</li>}
              {shippingRecords > 0 && <li><strong>{shippingRecords}</strong> shipping cost record{shippingRecords !== 1 ? "s" : ""}</li>}
              <li>All analysis results referencing this product</li>
              <li>Customer associations for this product</li>
            </ul>
            <p className="text-sm text-gray-700 mb-2">
              Type <strong>{sku}</strong> to confirm:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={sku}
              autoFocus
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || confirmText !== sku}
            >
              {loading ? "Deleting..." : "Delete Product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
