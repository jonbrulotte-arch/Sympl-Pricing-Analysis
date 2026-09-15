"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Trash2, Plus, Upload, Search } from "lucide-react";
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

interface ProductInProject {
  productId: string;
  product: {
    id: string;
    sku: string;
    name: string | null;
    brand: string | null;
    costHistories: { cost: string }[];
    shippingCostHistories: { shippingType: string; amount: string }[];
  };
}

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  customer: { id: string; name: string };
  createdBy: { name: string };
  products: ProductInProject[];
}

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [skuInput, setSkuInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");

  function fetchProject() {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        setLoading(false);
      });
  }

  useEffect(fetchProject, [projectId]);

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
      fetchProject();
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
    fetchProject();
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
    if (!project) return;
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: project.status === "active" ? "archived" : "active" }),
    });
    fetchProject();
  }

  if (loading) return <div className="p-6"><p className="text-sm text-gray-500">Loading...</p></div>;
  if (!project) return <div className="p-6"><p className="text-sm text-red-600">Project not found.</p></div>;

  const filtered = project.products.filter((pp) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      pp.product.sku.toLowerCase().includes(q) ||
      (pp.product.name?.toLowerCase().includes(q)) ||
      (pp.product.brand?.toLowerCase().includes(q))
    );
  });

  const totalCost = filtered.reduce((sum, pp) => {
    const cost = pp.product.costHistories[0] ? Number(pp.product.costHistories[0].cost) : 0;
    return sum + cost;
  }, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.description && <p className="text-sm text-gray-600 mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={toggleArchive}>
            {project.status === "active" ? "Archive" : "Restore"}
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
      </div>
      <p className="text-xs text-gray-500 mb-6">
        {project.customer.name} &middot; {project.products.length} products
      </p>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-600">Products</p>
            <p className="text-xl font-bold text-gray-900">{project.products.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-600">Total Cost (latest)</p>
            <p className="text-xl font-bold text-gray-900">${totalCost.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-600">Status</p>
            <Badge variant={project.status === "active" ? "default" : "secondary"} className="mt-1">
              {project.status}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Product list */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Products</CardTitle>
          <Button size="sm" onClick={() => { setSkuInput(""); setAddError(null); setAddOpen(true); }}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Add Products
          </Button>
        </CardHeader>
        <CardContent>
          {project.products.length > 5 && (
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

          {project.products.length === 0 ? (
            <p className="text-sm text-gray-500 py-4 text-center">No products added yet. Add products by SKU.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 text-gray-600 font-medium">SKU</th>
                    <th className="text-left py-2 px-2 text-gray-600 font-medium">Name</th>
                    <th className="text-left py-2 px-2 text-gray-600 font-medium">Brand</th>
                    <th className="text-right py-2 px-2 text-gray-600 font-medium">Cost</th>
                    <th className="text-right py-2 px-2 text-gray-600 font-medium">Shipping</th>
                    <th className="py-2 px-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pp) => {
                    const cost = pp.product.costHistories[0]
                      ? Number(pp.product.costHistories[0].cost)
                      : null;
                    const stdShip = pp.product.shippingCostHistories.find(
                      (s) => s.shippingType === "std"
                    );
                    return (
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
                        <td className="py-1.5 px-2 text-right text-xs">
                          {cost != null ? `$${cost.toFixed(2)}` : "-"}
                        </td>
                        <td className="py-1.5 px-2 text-right text-xs text-gray-600">
                          {stdShip ? `$${Number(stdShip.amount).toFixed(2)}` : "-"}
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && search && (
                <p className="text-sm text-gray-500 text-center py-4">No products match "{search}"</p>
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
            {addError && <p className="text-sm text-red-600 mt-2">{addError}</p>}
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
              Are you sure you want to delete "{project.name}"? This will remove the project and all its product associations. The products themselves will not be deleted.
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
    </div>
  );
}
