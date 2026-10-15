"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface ProjectOption {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  /** The SKU is already in this project. */
  contains: boolean;
  /** The SKU is already on the project's customer. */
  onCustomer: boolean;
}

interface Props {
  productId: string;
  sku: string;
  projects: ProjectOption[];
}

export function AddToProject({ productId, sku, projects }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<ProjectOption | null>(null);

  const selected = projects.find((p) => p.id === projectId);
  const available = projects.filter((p) => !p.contains);
  const inProjects = projects.filter((p) => p.contains);

  const byCustomer = new Map<string, ProjectOption[]>();
  for (const p of projects) {
    const list = byCustomer.get(p.customerName) ?? [];
    list.push(p);
    byCustomer.set(p.customerName, list);
  }

  function reset() {
    setProjectId(available.length === 1 ? available[0].id : "");
    setError(null);
    setAdded(null);
  }

  async function handleAdd() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/projects/${selected.id}/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: [productId] }),
    });
    setLoading(false);
    if (res.ok) {
      setAdded(selected);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Couldn't add the SKU to the project");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(true); }}>
        <FolderPlus className="h-3.5 w-3.5 mr-1.5" />
        Add to Project
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {sku} to a project</DialogTitle>
            <DialogDescription>Pick one of your active projects.</DialogDescription>
          </DialogHeader>

          {added ? (
            <p className="text-sm text-gray-700">
              Added to{" "}
              <Link href={`/projects/${added.id}`} className="text-blue-600 hover:underline">
                {added.name}
              </Link>{" "}
              ({added.customerName}).
            </p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-gray-500">There are no active projects you have access to.</p>
          ) : (
            <div className="space-y-3">
              {available.length === 0 ? (
                <p className="text-sm text-gray-500">This SKU is already in every project you have access to.</p>
              ) : (
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...byCustomer.entries()].map(([customerName, list]) => (
                      <SelectGroup key={customerName}>
                        <SelectLabel>{customerName}</SelectLabel>
                        {list.map((p) => (
                          <SelectItem key={p.id} value={p.id} disabled={p.contains}>
                            {p.name}
                            {p.contains ? " (already added)" : ""}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {selected && !selected.onCustomer && (
                <p className="text-xs text-amber-700">
                  {sku} isn&apos;t on {selected.customerName} yet. Adding it to this project also adds it to the customer&apos;s products.
                </p>
              )}
              {inProjects.length > 0 && (
                <p className="text-xs text-gray-500">
                  Already in:{" "}
                  {inProjects.map((p, i) => (
                    <span key={p.id}>
                      {i > 0 && ", "}
                      <Link href={`/projects/${p.id}`} className="text-blue-600 hover:underline">
                        {p.name}
                      </Link>
                    </span>
                  ))}
                </p>
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          )}

          <DialogFooter>
            {added ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={handleAdd} disabled={!selected || selected.contains || loading}>
                  {loading ? "Adding..." : "Add to Project"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
