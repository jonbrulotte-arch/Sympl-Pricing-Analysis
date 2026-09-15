"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
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
  customerId: string;
  customerName: string;
  channelCount: number;
}

export function CustomerActions({ customerId, customerName, channelCount }: Props) {
  const router = useRouter();
  const [renameOpen, setRenameOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [newName, setNewName] = useState(customerName);
  const [confirmText, setConfirmText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRename() {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/customers/${customerId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });

    setLoading(false);

    if (res.ok) {
      setRenameOpen(false);
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to rename");
    }
  }

  async function handleDelete() {
    setLoading(true);
    setError(null);

    const res = await fetch(`/api/customers/${customerId}`, {
      method: "DELETE",
    });

    setLoading(false);

    if (res.ok) {
      setDeleteOpen(false);
      router.push("/customers");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete");
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => { setNewName(customerName); setError(null); setRenameOpen(true); }}>
        <Pencil className="h-3.5 w-3.5 mr-1.5" />
        Rename
      </Button>
      <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => { setConfirmText(""); setError(null); setDeleteOpen(true); }}>
        <Trash2 className="h-3.5 w-3.5 mr-1.5" />
        Delete
      </Button>

      {/* Rename Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Customer</DialogTitle>
            <DialogDescription>Enter a new name for this customer.</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Customer name"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>Cancel</Button>
            <Button onClick={handleRename} disabled={loading || !newName.trim()}>
              {loading ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Customer</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Deleting this customer will permanently remove:
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-1 mb-4">
              {channelCount > 0 && (
                <li><strong>{channelCount}</strong> sales channel{channelCount !== 1 ? "s" : ""} and their configurations</li>
              )}
              <li>All analysis results for this customer</li>
              <li>All import history for this customer</li>
              <li>All brand royalty configurations</li>
            </ul>
            <p className="text-sm text-gray-700 mb-3">
              Products will <strong>not</strong> be deleted, only their association with this customer.
            </p>
            <p className="text-sm text-gray-700 mb-2">
              Type <strong>{customerName}</strong> to confirm:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={customerName}
              autoFocus
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={loading || confirmText !== customerName}
            >
              {loading ? "Deleting..." : "Delete Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
