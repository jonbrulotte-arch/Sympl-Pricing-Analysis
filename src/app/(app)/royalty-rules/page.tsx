"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface Customer {
  id: string;
  name: string;
}

interface RoyaltyRule {
  id: string;
  scope: "brand" | "sku";
  brandKey?: string;
  brandName?: string;
  skus: string[];
  value: number;
  mode: "pct" | "usd";
}

export default function RoyaltyRulesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [rules, setRules] = useState<RoyaltyRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RoyaltyRule | null>(null);

  const [scope, setScope] = useState<"brand" | "sku">("brand");
  const [brandName, setBrandName] = useState("");
  const [skusText, setSkusText] = useState("");
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<"pct" | "usd">("pct");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/customers")
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : data.customers ?? [];
        setCustomers(list);
      })
      .catch(() => {});
  }, []);

  const loadRules = useCallback(async (custId: string) => {
    if (!custId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${custId}/royalty-rules`);
      if (res.ok) setRules(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCustomerId) loadRules(selectedCustomerId);
  }, [selectedCustomerId, loadRules]);

  function openAdd() {
    setEditingRule(null);
    setScope("brand");
    setBrandName("");
    setSkusText("");
    setValue("");
    setMode("pct");
    setDialogOpen(true);
  }

  function openEdit(rule: RoyaltyRule) {
    setEditingRule(rule);
    setScope(rule.scope);
    setBrandName(rule.brandName ?? "");
    setSkusText(rule.skus.join(", "));
    setValue(String(rule.value));
    setMode(rule.mode);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!selectedCustomerId) return;
    setSaving(true);
    try {
      const payload = {
        scope,
        brandName: scope === "brand" ? brandName : undefined,
        skus: scope === "sku" ? skusText.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) : [],
        value: parseFloat(value),
        mode,
      };

      if (editingRule) {
        await fetch(`/api/customers/${selectedCustomerId}/royalty-rules/${editingRule.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`/api/customers/${selectedCustomerId}/royalty-rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      setDialogOpen(false);
      await loadRules(selectedCustomerId);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ruleId: string) {
    if (!selectedCustomerId) return;
    await fetch(`/api/customers/${selectedCustomerId}/royalty-rules/${ruleId}`, {
      method: "DELETE",
    });
    await loadRules(selectedCustomerId);
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Royalty Rules</h1>
          <p className="text-sm text-gray-500">
            Manage royalty configurations by brand or SKU
          </p>
        </div>
        {selectedCustomerId && (
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Rule
          </Button>
        )}
      </div>

      {/* Customer selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
        <select
          value={selectedCustomerId}
          onChange={(e) => setSelectedCustomerId(e.target.value)}
          className="flex h-9 w-full max-w-xs items-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Select a customer...</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {!selectedCustomerId && (
        <div className="text-center py-16 text-gray-500 text-sm">
          Select a customer to manage their royalty rules.
        </div>
      )}

      {selectedCustomerId && loading && (
        <div className="text-center py-16 text-gray-500 text-sm">Loading...</div>
      )}

      {selectedCustomerId && !loading && rules.length === 0 && (
        <div className="text-center py-16 text-gray-500 text-sm">
          No royalty rules configured. Click &quot;Add Rule&quot; to create one.
        </div>
      )}

      {selectedCustomerId && !loading && rules.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left py-2.5 px-4 text-gray-600 font-medium">Scope</th>
                <th className="text-left py-2.5 px-4 text-gray-600 font-medium">Brand / SKUs</th>
                <th className="text-right py-2.5 px-4 text-gray-600 font-medium">Value</th>
                <th className="text-center py-2.5 px-4 text-gray-600 font-medium">Mode</th>
                <th className="text-right py-2.5 px-4 text-gray-600 font-medium w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2 px-4">
                    <Badge variant={rule.scope === "brand" ? "default" : "secondary"} className="text-xs">
                      {rule.scope === "brand" ? "Brand" : "SKU"}
                    </Badge>
                  </td>
                  <td className="py-2 px-4 text-gray-700">
                    {rule.scope === "brand" ? (
                      rule.brandName ?? rule.brandKey ?? "-"
                    ) : (
                      <span className="font-mono text-xs">
                        {rule.skus.length <= 3
                          ? rule.skus.join(", ")
                          : `${rule.skus.slice(0, 3).join(", ")} +${rule.skus.length - 3} more`}
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right font-medium">
                    {rule.mode === "pct" ? `${rule.value}%` : `$${rule.value.toFixed(2)}`}
                  </td>
                  <td className="py-2 px-4 text-center text-gray-500 text-xs">
                    {rule.mode === "pct" ? "% of price" : "$ per unit"}
                  </td>
                  <td className="py-2 px-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => openEdit(rule)}
                        className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(rule.id)}
                        className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRule ? "Edit Rule" : "Add Royalty Rule"}</DialogTitle>
            <DialogDescription>
              {editingRule
                ? "Update the royalty rule configuration."
                : "Create a new royalty rule for this customer."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Scope */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setScope("brand")}
                  className={`px-3 py-1.5 text-sm rounded-md border ${
                    scope === "brand"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  Brand
                </button>
                <button
                  onClick={() => setScope("sku")}
                  className={`px-3 py-1.5 text-sm rounded-md border ${
                    scope === "sku"
                      ? "border-blue-600 bg-blue-50 text-blue-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  SKU(s)
                </button>
              </div>
            </div>

            {/* Brand name or SKU list */}
            {scope === "brand" ? (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
                <Input
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="e.g. Acme Corp"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">SKUs</label>
                <Textarea
                  value={skusText}
                  onChange={(e) => setSkusText(e.target.value)}
                  placeholder="Enter SKUs separated by commas or new lines"
                  rows={3}
                />
              </div>
            )}

            {/* Value + Mode */}
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700 mb-1">Value</label>
                <Input
                  type="number"
                  step="0.01"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={mode === "pct" ? "e.g. 6.9" : "e.g. 1.50"}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mode</label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setMode("pct")}
                    className={`px-3 py-2 text-sm rounded-md border ${
                      mode === "pct"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    %
                  </button>
                  <button
                    onClick={() => setMode("usd")}
                    className={`px-3 py-2 text-sm rounded-md border ${
                      mode === "usd"
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-gray-300 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    $
                  </button>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingRule ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
