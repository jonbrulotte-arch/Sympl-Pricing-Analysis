"use client";

import { useState, useEffect, useCallback } from "react";
import { UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface Member {
  userId: string;
  role: string;
  name: string;
  email: string;
}

export function CustomerCollaborators({ customerId, isOwner }: { customerId: string; isOwner: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/customers/${customerId}/users`);
    if (res.ok) setMembers(await res.json());
    setLoading(false);
  }, [customerId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/customers/${customerId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setSaving(false);
    if (res.ok) {
      setAddOpen(false);
      setEmail("");
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to add collaborator");
    }
  }

  async function handleRemove(userId: string) {
    await fetch(`/api/customers/${customerId}/users/${userId}`, { method: "DELETE" });
    await load();
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Collaborators</CardTitle>
        {isOwner && (
          <Button size="sm" variant="outline" onClick={() => { setEmail(""); setError(null); setAddOpen(true); }}>
            <UserPlus className="h-3.5 w-3.5 mr-1.5" />
            Add
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-gray-500 py-4 text-center">Loading...</p>
        ) : members.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">No collaborators yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between py-2.5">
                <div>
                  <p className="text-sm font-medium text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={m.role === "OWNER" ? "default" : "secondary"} className="text-xs">
                    {m.role === "OWNER" ? "Owner" : "Collaborator"}
                  </Badge>
                  {isOwner && m.role !== "OWNER" && (
                    <button
                      onClick={() => handleRemove(m.userId)}
                      className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                      title="Remove collaborator"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Collaborator</DialogTitle>
            <DialogDescription>
              Enter the email of an existing user to give them full access to this customer&apos;s channels, analysis, and projects.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            />
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving || !email.trim()}>
              {saving ? "Adding..." : "Add Collaborator"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
