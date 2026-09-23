"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Search, Archive, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface ProjectProduct {
  productId: string;
  product: {
    id: string;
    sku: string;
    name: string | null;
    brand: string | null;
  };
}

interface ProjectActionsProps {
  projectId: string;
  projectName: string;
  customerId: string;
  status: string;
  products: ProjectProduct[];
}

export function ProjectActions({
  projectId,
  projectName,
  customerId,
  status,
  products,
}: ProjectActionsProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [skuInput, setSkuInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

  async function handleAddSkus() {
    const skus = skuInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (skus.length === 0) return;

    setAdding(true);
    setAddError(null);

    const res = await fetch(`/api/projects/${projectId}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ skus }),
    });

    setAdding(false);

    if (res.ok) {
      setAddOpen(false);
      setSkuInput("");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setAddError(data.error || "Failed to add products");
    }
  }

  async function handleRemoveProduct(productId: string) {
    await fetch(`/api/projects/${projectId}/products`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [productId] }),
    });
    router.refresh();
  }

  async function handleDeleteProject() {
    setDeleting(true);
    const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
    setDeleting(false);
    if (res.ok) {
      router.push("/projects");
    }
  }

  async function toggleArchive() {
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: status === "active" ? "archived" : "active" }),
    });
    router.refresh();
  }

  const filtered = products.filter((pp) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      pp.product.sku.toLowerCase().includes(q) ||
      pp.product.name?.toLowerCase().includes(q) ||
      pp.product.brand?.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Action buttons */}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={toggleArchive}>
          {status === "active" ? (
            <>
              <Archive className="h-3.5 w-3.5 mr-1.5" />
              Archive
            </>
          ) : (
            <>
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              Restore
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => setDeleteOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
          Delete
        </Button>
      </div>

      {/* Product list card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Products ({products.length})</CardTitle>
          <Button size="sm" onClick={() => { setSkuInput(""); setAddError(null); setAddOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Products
          </Button>
        </CardHeader>
        <CardContent>
          {products.length > 5 && (
            <div className="relative mb-4">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by SKU, name, or brand..."
                className="pl-9"
              />
            </div>
          )}

          {products.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">No products added yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Add products from the Product Database. Products must be{" "}
                <a href="/products/import" className="text-blue-600 hover:underline">imported first</a> via Salsify sync or spreadsheet upload.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-gray-600 font-medium">SKU</th>
                    <th className="text-left py-2 px-2 text-gray-600 font-medium">Name</th>
                    <th className="text-left py-2 px-2 text-gray-600 font-medium">Brand</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pp) => (
                    <tr key={pp.productId} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-1.5 px-2 font-mono text-xs text-blue-600">
                        <a href={`/products/${pp.product.id}`} className="hover:underline">
                          {pp.product.sku}
                        </a>
                      </td>
                      <td className="py-1.5 px-2 text-gray-700 max-w-[200px] truncate text-xs">
                        {pp.product.name || "-"}
                      </td>
                      <td className="py-1.5 px-2 text-gray-600 text-xs">{pp.product.brand || "-"}</td>
                      <td className="py-1.5 px-2 text-right">
                        <button
                          onClick={() => handleRemoveProduct(pp.productId)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Remove from project"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && search && (
                <p className="text-sm text-gray-500 text-center py-4">No products match &ldquo;{search}&rdquo;</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Products Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Products</DialogTitle>
            <DialogDescription>
              Enter SKUs to add to this project. One SKU per line, or comma-separated. Products must already exist in the system.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <textarea
              value={skuInput}
              onChange={(e) => setSkuInput(e.target.value)}
              placeholder={"SKU-001\nSKU-002\nSKU-003"}
              rows={6}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">
              {skuInput.split(/[\n,]+/).filter((s) => s.trim()).length} SKUs entered
            </p>
            {addError && (
              <div className="mt-2">
                <p className="text-sm text-red-600">{addError}</p>
                {addError.toLowerCase().includes("not found") && (
                  <p className="text-xs text-gray-500 mt-1">
                    These SKUs are not in the product database.{" "}
                    <a href="/products/import" className="text-blue-600 hover:underline">Import them first</a> via Products &rarr; Import.
                  </p>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSkus} disabled={adding || !skuInput.trim()}>
              {adding ? "Adding..." : "Add Products"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Project Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete &ldquo;{projectName}&rdquo;? This will remove the project and all its product associations. The products themselves will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProject} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
