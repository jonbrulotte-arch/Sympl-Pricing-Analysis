"use client";

import { useState, useEffect, useCallback } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SalsifyApiKeyCard() {
  const [hasKey, setHasKey] = useState(false);
  const [last4, setLast4] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/profile/salsify-key");
    if (res.ok) {
      const data = await res.json();
      setHasKey(data.hasKey);
      setLast4(data.last4);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/profile/salsify-key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: newKey }),
    });
    setSaving(false);
    if (res.ok) {
      setNewKey("");
      await load();
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Failed to save key");
    }
  }

  async function handleRemove() {
    setSaving(true);
    await fetch("/api/profile/salsify-key", { method: "DELETE" });
    setSaving(false);
    await load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-gray-500" />
          Salsify API Key
        </CardTitle>
        <p className="text-xs text-gray-500">
          Your personal Salsify key. Every sync and pull you run authenticates as you. Find it in Salsify → User Settings → API Access.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : (
          <>
            {hasKey && (
              <div className="flex items-center justify-between bg-gray-50 rounded-md px-3 py-2">
                <span className="font-mono text-sm text-gray-700">
                  {"•".repeat(6)}{last4}
                </span>
                <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleRemove} disabled={saving}>
                  Remove
                </Button>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {hasKey ? "Replace API Key" : "Add API Key"}
              </label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  value={newKey}
                  onChange={(e) => setNewKey(e.target.value)}
                  placeholder="Paste your Salsify API key"
                  className="flex-1"
                />
                <Button onClick={handleSave} disabled={saving || !newKey.trim()}>
                  {hasKey ? "Replace Key" : "Save Key"}
                </Button>
              </div>
              {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
