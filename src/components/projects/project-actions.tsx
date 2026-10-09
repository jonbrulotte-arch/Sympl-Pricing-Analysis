"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Search, Archive, RotateCcw, ChevronDown, ChevronUp, Package, Pencil } from "lucide-react";
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

function ProductTable({
  products,
  search,
  pageSize,
  onRemove,
}: {
  products: ProjectProduct[];
  search: string;
  pageSize: number;
  onRemove: (productId: string) => void;
}) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(products.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(
    () => products.slice((safePage - 1) * pageSize, safePage * pageSize),
    [products, safePage, pageSize],
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 text-gray-600 font-medium text-xs">SKU</th>
              <th className="text-left py-2 px-2 text-gray-600 font-medium text-xs">Name</th>
              <th className="text-left py-2 px-2 text-gray-600 font-medium text-xs">Brand</th>
              <th className="py-2 px-2"></th>
            </tr>
          </thead>
          <tbody>
            {paged.map((pp) => (
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
                    onClick={() => onRemove(pp.productId)}
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
        {products.length === 0 && search && (
          <p className="text-sm text-gray-500 text-center py-4">No products match &ldquo;{search}&rdquo;</p>
        )}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-3 text-xs text-gray-500">
          <span>
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, products.length)} of {products.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Prev
            </Button>
            <span className="px-2">
              {safePage} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
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
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState(projectName);
  const [renaming, setRenaming] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);
  const PREVIEW_COUNT = 5;
  const PAGE_SIZE = 25;

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

  async function handleRename() {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === projectName) {
      setRenameOpen(false);
      return;
    }
    setRenaming(true);
    const res = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setRenaming(false);
    if (res.ok) {
      setRenameOpen(false);
      router.refresh();
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
        <Button variant="outline" size="sm" onClick={() => { setNewName(projectName); setRenameOpen(true); }}>
          <Pencil className="h-3.5 w-3.5 mr-1.5" />
          Rename
        </Button>
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

      {/* Product list card — collapsible */}
      <Card>
        <div
          role="button"
          tabIndex={0}
          className="flex w-full items-center justify-between px-4 py-3 text-left cursor-pointer"
          onClick={() => { if (products.length > 0) { setExpanded((v) => !v); setSearch(""); } }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (products.length > 0) { setExpanded((v) => !v); setSearch(""); } } }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <Package className="h-4 w-4 text-gray-400 shrink-0" />
            <span className="text-sm font-semibold text-gray-900">Products ({products.length})</span>
            {!expanded && products.length > 0 && (
              <span className="text-xs text-gray-400 truncate hidden sm:inline">
                {products.slice(0, 3).map((pp) => pp.product.sku).join(", ")}
                {products.length > 3 ? ` +${products.length - 3} more` : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3" onClick={(e) => e.stopPropagation()}>
            <Button size="sm" onClick={() => { setSkuInput(""); setAddError(null); setAddOpen(true); }}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add
            </Button>
            {products.length > 0 && (
              <span className="text-gray-400">
                {expanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </span>
            )}
          </div>
        </div>
        {expanded && (
          <CardContent className="pt-0">
            {products.length > PREVIEW_COUNT && (
              <div className="relative mb-3">
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
              <ProductTable
                products={filtered}
                search={search}
                pageSize={PAGE_SIZE}
                onRemove={handleRemoveProduct}
              />
            )}
          </CardContent>
        )}
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

      {/* Rename Project Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Enter a new name for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Project name"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={renaming || !newName.trim()}>
              {renaming ? "Renaming..." : "Rename"}
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
