"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Shield, Lock } from "lucide-react";
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
import { PERMISSION_GROUPS, ALL_PERMISSIONS } from "@/types";
import type { Permission } from "@/types";

interface AppRole {
  id: string;
  name: string;
  description: string | null;
  permissions: Permission[];
  isSystem: boolean;
  userCount: number;
}

export function RolesClient() {
  const router = useRouter();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/roles");
    if (res.ok) setRoles(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const [editRole, setEditRole] = useState<AppRole | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
          <p className="text-sm text-gray-500 mt-1">Manage access control roles and permissions</p>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          New Role
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No roles configured. Run the seed to create default roles.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {roles.map((role) => (
            <Card key={role.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle className="text-base">{role.name}</CardTitle>
                    {role.isSystem && (
                      <Badge variant="secondary" className="text-xs">
                        <Lock className="h-3 w-3 mr-1" />
                        System
                      </Badge>
                    )}
                    <span className="text-xs text-gray-500">
                      {role.userCount} user{role.userCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setEditRole(role)}
                      className="p-1.5 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      title="Edit role"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    {!role.isSystem && (
                      <DeleteRoleButton role={role} onDeleted={load} />
                    )}
                  </div>
                </div>
                {role.description && (
                  <p className="text-sm text-gray-500 mt-1">{role.description}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {(role.permissions as Permission[]).map((p) => (
                    <Badge key={p} variant="secondary" className="text-xs font-mono">
                      {p}
                    </Badge>
                  ))}
                  {role.permissions.length === 0 && (
                    <span className="text-xs text-gray-400">No permissions</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateRoleDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
      {editRole && (
        <EditRoleDialog role={editRole} onOpenChange={(open) => { if (!open) setEditRole(null); }} onSaved={load} />
      )}
    </div>
  );
}

function PermissionCheckboxes({
  selected,
  onChange,
}: {
  selected: Permission[];
  onChange: (perms: Permission[]) => void;
}) {
  const set = new Set(selected);

  function toggle(p: Permission) {
    const next = new Set(set);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    onChange([...next]);
  }

  function toggleAll() {
    if (set.size === ALL_PERMISSIONS.length) {
      onChange([]);
    } else {
      onChange([...ALL_PERMISSIONS]);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={set.size === ALL_PERMISSIONS.length}
          onChange={toggleAll}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Select All
      </label>
      {PERMISSION_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">{group.label}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {group.permissions.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer py-0.5">
                <input
                  type="checkbox"
                  checked={set.has(key)}
                  onChange={() => toggle(key)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CreateRoleDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setName("");
    setDescription("");
    setPermissions([]);
    setError(null);
  }

  async function handleCreate() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description, permissions }),
    });
    setLoading(false);
    if (res.ok) {
      reset();
      onOpenChange(false);
      onCreated();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to create role");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Role</DialogTitle>
          <DialogDescription>Define a new role with specific permissions.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. VIEWER, MANAGER"
              autoFocus
            />
            <p className="text-xs text-gray-500 mt-1">Will be converted to uppercase</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
            <PermissionCheckboxes selected={permissions} onChange={setPermissions} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false); }}>Cancel</Button>
          <Button onClick={handleCreate} disabled={loading || !name.trim()}>
            {loading ? "Creating..." : "Create Role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditRoleDialog({
  role,
  onOpenChange,
  onSaved,
}: {
  role: AppRole;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [description, setDescription] = useState(role.description ?? "");
  const [permissions, setPermissions] = useState<Permission[]>(role.permissions);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setLoading(true);
    setError(null);
    setSuccess(false);
    const res = await fetch(`/api/admin/roles/${role.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, permissions }),
    });
    setLoading(false);
    if (res.ok) {
      setSuccess(true);
      setTimeout(() => {
        onOpenChange(false);
        onSaved();
      }, 600);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to update role");
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit Role — {role.name}
            {role.isSystem && <Badge variant="secondary" className="ml-2 text-xs">System</Badge>}
          </DialogTitle>
          <DialogDescription>
            {role.isSystem
              ? "System role name cannot be changed. You can update its permissions."
              : "Update this role's description and permissions."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Permissions</label>
            <PermissionCheckboxes selected={permissions} onChange={setPermissions} />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {success && <p className="text-sm text-green-600">Role updated successfully</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteRoleButton({ role, onDeleted }: { role: AppRole; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/roles/${role.id}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      setOpen(false);
      onDeleted();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to delete role");
    }
  }

  return (
    <>
      <button
        onClick={() => { setError(null); setOpen(true); }}
        className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
        title="Delete role"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Role</DialogTitle>
            <DialogDescription>
              Permanently delete the <strong>{role.name}</strong> role? Users assigned to it must be reassigned first.
            </DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? "Deleting..." : "Delete Role"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
