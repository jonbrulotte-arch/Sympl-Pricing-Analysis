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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ALL_CHANNELS = "__all__";

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
  customerId?: string | null;
  channelId?: string | null;
  channelName?: string | null;
}

interface Channel {
  id: string;
  name: string;
}

type RuleTarget = "global" | "customer";

export default function RoyaltyRulesPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [globalRules, setGlobalRules] = useState<RoyaltyRule[]>([]);
  const [customerRules, setCustomerRules] = useState<RoyaltyRule[]>([]);
  const [customerChannels, setCustomerChannels] = useState<Channel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [loadingGlobal, setLoadingGlobal] = useState(true);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RoyaltyRule | null>(null);
  const [ruleTarget, setRuleTarget] = useState<RuleTarget>("global");

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

  const loadGlobalRules = useCallback(async () => {
    setLoadingGlobal(true);
    try {
      const res = await fetch("/api/royalty-rules");
      if (res.ok) setGlobalRules(await res.json());
    } finally {
      setLoadingGlobal(false);
    }
  }, []);

  const loadCustomerRules = useCallback(async (custId: string) => {
    if (!custId) {
      setCustomerRules([]);
      setCustomerChannels([]);
      return;
    }
    setLoadingCustomer(true);
    try {
      const [res, chRes] = await Promise.all([
        fetch(`/api/customers/${custId}/royalty-rules`),
        fetch(`/api/customers/${custId}/channels`),
      ]);
      if (res.ok) setCustomerRules(await res.json());
      if (chRes.ok) setCustomerChannels((await chRes.json()).map((c: Channel) => ({ id: c.id, name: c.name })));
    } finally {
      setLoadingCustomer(false);
    }
  }, []);

  useEffect(() => {
    loadGlobalRules();
  }, [loadGlobalRules]);

  useEffect(() => {
    if (selectedCustomerId) loadCustomerRules(selectedCustomerId);
    else setCustomerRules([]);
  }, [selectedCustomerId, loadCustomerRules]);

  function openAdd(target: RuleTarget) {
    setEditingRule(null);
    setRuleTarget(target);
    setScope("brand");
    setBrandName("");
    setSkusText("");
    setValue("");
    setMode("pct");
    setChannelId("");
    setSaveError(null);
    setDialogOpen(true);
  }

  function openEdit(rule: RoyaltyRule, target: RuleTarget) {
    setEditingRule(rule);
    setRuleTarget(target);
    setScope(rule.scope);
    setBrandName(rule.brandName ?? "");
    setSkusText(rule.skus.join(", "));
    setValue(String(rule.value));
    setMode(rule.mode);
    setChannelId(rule.channelId ?? "");
    setSaveError(null);
    setDialogOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        scope,
        brandName: scope === "brand" ? brandName : undefined,
        skus: scope === "sku" ? skusText.split(/[,\n]+/).map((s) => s.trim()).filter(Boolean) : [],
        value: parseFloat(value),
        mode,
      };
      const customerPayload = { ...payload, channelId: channelId || null };

      if (ruleTarget === "global") {
        if (editingRule) {
          await fetch(`/api/royalty-rules/${editingRule.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        } else {
          await fetch("/api/royalty-rules", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
        }
        await loadGlobalRules();
      } else {
        if (!selectedCustomerId) return;
        const res = await fetch(
          editingRule
            ? `/api/customers/${selectedCustomerId}/royalty-rules/${editingRule.id}`
            : `/api/customers/${selectedCustomerId}/royalty-rules`,
          {
            method: editingRule ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(customerPayload),
          },
        );
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setSaveError(data.error || "Failed to save rule");
          return;
        }
        await loadCustomerRules(selectedCustomerId);
      }

      setDialogOpen(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(ruleId: string, target: RuleTarget) {
    if (target === "global") {
      await fetch(`/api/royalty-rules/${ruleId}`, { method: "DELETE" });
      await loadGlobalRules();
    } else {
      if (!selectedCustomerId) return;
      await fetch(`/api/customers/${selectedCustomerId}/royalty-rules/${ruleId}`, { method: "DELETE" });
      await loadCustomerRules(selectedCustomerId);
    }
  }

  return (
    <div className="p-6 max-w-[1000px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Royalty Rules</h1>
        <p className="text-sm text-gray-500">
          Global rules apply to all customers. Customer overrides replace them for one customer, and can be limited to
          a single sales channel. Most specific wins: channel override, then customer override, then global rule.
        </p>
      </div>

      {/* Global Rules Section */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Global Rules</h2>
          <Button onClick={() => openAdd("global")} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Global Rule
          </Button>
        </div>

        {loadingGlobal ? (
          <div className="text-center py-10 text-gray-500 text-sm">Loading...</div>
        ) : globalRules.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
            No global royalty rules configured.
          </div>
        ) : (
          <RulesTable
            rules={globalRules}
            onEdit={(r) => openEdit(r, "global")}
            onDelete={(id) => handleDelete(id, "global")}
          />
        )}
      </div>

      {/* Customer Override Section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-800">Customer Overrides</h2>
          {selectedCustomerId && (
            <Button onClick={() => openAdd("customer")} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add Override
            </Button>
          )}
        </div>

        <div className="mb-4">
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
          <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
            Select a customer to view or add overrides.
          </div>
        )}

        {selectedCustomerId && loadingCustomer && (
          <div className="text-center py-10 text-gray-500 text-sm">Loading...</div>
        )}

        {selectedCustomerId && !loadingCustomer && customerRules.length === 0 && (
          <div className="text-center py-10 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
            No customer-specific overrides. Global rules apply.
          </div>
        )}

        {selectedCustomerId && !loadingCustomer && customerRules.length > 0 && (
          <RulesTable
            rules={customerRules}
            showChannel
            onEdit={(r) => openEdit(r, "customer")}
            onDelete={(id) => handleDelete(id, "customer")}
          />
        )}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Edit Rule" : ruleTarget === "global" ? "Add Global Rule" : "Add Customer Override"}
            </DialogTitle>
            <DialogDescription>
              {ruleTarget === "global"
                ? "This rule applies to all customers unless overridden."
                : "This rule overrides the global setting for the selected customer, on all of its channels or just one."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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

            {ruleTarget === "customer" && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Applies to</label>
                <Select value={channelId || ALL_CHANNELS} onValueChange={(v) => setChannelId(v === ALL_CHANNELS ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_CHANNELS}>All channels</SelectItem>
                    {customerChannels.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} only</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

          {saveError && <p className="text-sm text-red-600">{saveError}</p>}

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

function RulesTable({
  rules,
  showChannel,
  onEdit,
  onDelete,
}: {
  rules: RoyaltyRule[];
  showChannel?: boolean;
  onEdit: (rule: RoyaltyRule) => void;
  onDelete: (ruleId: string) => void;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            <th className="text-left py-2.5 px-4 text-gray-600 font-medium">Scope</th>
            {showChannel && <th className="text-left py-2.5 px-4 text-gray-600 font-medium">Channel</th>}
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
              {showChannel && (
                <td className="py-2 px-4 text-gray-700 text-xs">
                  {rule.channelName ?? <span className="text-gray-400">All channels</span>}
                </td>
              )}
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
                    onClick={() => onEdit(rule)}
                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onDelete(rule.id)}
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
  );
}
