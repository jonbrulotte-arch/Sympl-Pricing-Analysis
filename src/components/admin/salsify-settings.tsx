"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface Settings {
  salsifyOrgId: string;
  salsifyChannelId: string;
  salsifySyncEnabled: boolean;
  salsifyDebugEnabled: boolean;
  upsWeightBreakpoint: number | null;
}

export function SalsifySettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [breakpoint, setBreakpoint] = useState("");
  const [error, setError] = useState("");

  function apply(data: Settings) {
    setSettings(data);
    setBreakpoint(data.upsWeightBreakpoint == null ? "" : String(data.upsWeightBreakpoint));
  }

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings/salsify");
    if (res.ok) apply(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/admin/settings/salsify", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...settings, upsWeightBreakpoint: breakpoint.trim() === "" ? null : breakpoint.trim() }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => null))?.error ?? "Couldn't save the settings");
    } else {
      apply(await res.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  if (!settings) return <p className="text-sm text-gray-500">Loading...</p>;

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-md p-3 space-y-2">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.salsifySyncEnabled}
            onChange={(e) => setSettings({ ...settings, salsifySyncEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-900">Enable Salsify Sync</span>
          {settings.salsifySyncEnabled && (
            <Badge variant="success" className="text-[10px]">Active</Badge>
          )}
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.salsifyDebugEnabled}
            onChange={(e) => setSettings({ ...settings, salsifyDebugEnabled: e.target.checked })}
            className="h-4 w-4 rounded border-gray-300 text-blue-600"
          />
          <span className="text-sm text-gray-900">Enable Salsify Debug</span>
          <span className="text-xs text-gray-500">— shows Salsify Log &amp; Debug in the sidebar</span>
        </label>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Organization ID</label>
        <Input
          value={settings.salsifyOrgId}
          onChange={(e) => setSettings({ ...settings, salsifyOrgId: e.target.value })}
          placeholder="s-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
        />
        <p className="text-xs text-gray-500 mt-1">Your Salsify organization identifier (slug)</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Channel Export ID</label>
        <Input
          value={settings.salsifyChannelId}
          onChange={(e) => setSettings({ ...settings, salsifyChannelId: e.target.value })}
          placeholder="e.g. abc123-def456"
        />
        <p className="text-xs text-gray-500 mt-1">
          The ID of the pre-configured Salsify channel export. Found in Salsify under Channel &gt; Settings.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">UPS Weight Break Point</label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="0"
            step="0.1"
            value={breakpoint}
            onChange={(e) => setBreakpoint(e.target.value)}
            placeholder="Off"
            className="w-32"
          />
          <span className="text-sm text-gray-500">lb</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          When an import has a <strong>Shipping Weight</strong> at or above this weight, the SKU&apos;s shipping cost
          comes from <strong>UPS Shipping Cost</strong>; lighter SKUs use <strong>Shipping Cost</strong>. Leave blank
          to always use Shipping Cost.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Settings"}
        </Button>
        {saved && <span className="text-sm text-green-600">Saved</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-gray-700">
        Salsify API keys are set per user, not here. Each person adds their own key under{" "}
        <strong>My Profile → Salsify API Key</strong>, and every sync authenticates as the user who ran it.
        Users without a key will be prompted to add one.
      </div>
    </div>
  );
}
