"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, Archive } from "lucide-react";
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

interface Project {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  customer: { id: string; name: string };
  createdBy: { name: string };
  _count: { products: number };
}

interface CustomerOption {
  id: string;
  name: string;
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/customers").then((r) => r.json()),
    ]).then(([p, c]) => {
      setProjects(p);
      setCustomers(c);
      if (c.length > 0 && !selectedCustomer) setSelectedCustomer(c[0].id);
      setLoading(false);
    });
  }, []);

  async function handleCreate() {
    if (!newName.trim() || !selectedCustomer) return;
    setCreating(true);
    setError(null);

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        description: newDescription.trim() || null,
        customerId: selectedCustomer,
      }),
    });

    setCreating(false);

    if (res.ok) {
      const project = await res.json();
      setCreateOpen(false);
      router.push(`/projects/${project.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create project");
    }
  }

  const active = projects.filter((p) => p.status === "active");
  const archived = projects.filter((p) => p.status === "archived");

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
          <p className="text-sm text-gray-500 mt-1">Profitability analysis for selected product groups</p>
        </div>
        <Button onClick={() => { setNewName(""); setNewDescription(""); setError(null); setCreateOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 text-center py-8">Loading...</p>
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FolderKanban className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No projects yet. Create one to start analyzing a group of products.</p>
            <Button onClick={() => { setNewName(""); setNewDescription(""); setError(null); setCreateOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Create Project
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {active.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <Card className="hover:border-blue-300 transition-colors cursor-pointer h-full">
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base">{p.name}</CardTitle>
                        <Badge variant="secondary" className="text-xs shrink-0 ml-2">{p._count.products} products</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {p.description && <p className="text-sm text-gray-600 mb-2">{p.description}</p>}
                      <p className="text-xs text-gray-500">
                        {p.customer.name} &middot; by {p.createdBy.name}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {archived.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Archive className="h-3.5 w-3.5" />
                Archived
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {archived.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`}>
                    <Card className="hover:border-gray-300 transition-colors cursor-pointer opacity-60 h-full">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{p.name}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <p className="text-xs text-gray-500">
                          {p.customer.name} &middot; {p._count.products} products
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
            <DialogDescription>Create a project to analyze profitability for a group of products.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Customer</label>
              <select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Project Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Q4 2026 Price Review"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Description (optional)</label>
              <Input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Brief description of the analysis goal"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim() || !selectedCustomer}>
              {creating ? "Creating..." : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
