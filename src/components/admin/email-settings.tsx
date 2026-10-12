"use client";

import { useState, useEffect, useCallback } from "react";
import { Mail, Send, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function EmailSettings() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [senderEmail, setSenderEmail] = useState<string | null>(null);
  const [testTo, setTestTo] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/settings/email-test");
    if (res.ok) {
      const data = await res.json();
      setConfigured(data.configured);
      setSenderEmail(data.senderEmail);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleSendTest() {
    setSending(true);
    setResult(null);
    const res = await fetch("/api/admin/settings/email-test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: testTo }),
    });
    setSending(false);
    if (res.ok) {
      setResult({ type: "success", text: `Test email sent to ${testTo}` });
    } else {
      const data = await res.json().catch(() => ({}));
      setResult({ type: "error", text: data.error || "Failed to send test email" });
    }
  }

  if (configured === null) {
    return <p className="text-sm text-gray-500">Loading...</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">Status</span>
        {configured ? (
          <Badge variant="default" className="text-xs bg-green-600">Configured</Badge>
        ) : (
          <Badge variant="destructive" className="text-xs">Not Configured</Badge>
        )}
      </div>

      {configured && senderEmail && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Sender</span>
          <span className="text-sm font-medium text-gray-900">{senderEmail}</span>
        </div>
      )}

      {!configured && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
          <div className="flex gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">MS Graph credentials not set</p>
              <p className="mt-1 text-amber-700">
                Password reset emails require the following environment variables:
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-700 font-mono">
                <li>MS_GRAPH_TENANT_ID</li>
                <li>MS_GRAPH_CLIENT_ID</li>
                <li>MS_GRAPH_CLIENT_SECRET</li>
                <li>MS_GRAPH_SENDER_EMAIL</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4">
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Send Test Email</label>
        <div className="flex gap-2">
          <Input
            type="email"
            value={testTo}
            onChange={(e) => setTestTo(e.target.value)}
            placeholder="recipient@company.com"
            className="flex-1"
            disabled={!configured}
          />
          <Button
            onClick={handleSendTest}
            disabled={sending || !testTo.trim() || !configured}
            size="sm"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            {sending ? "Sending..." : "Send Test"}
          </Button>
        </div>
      </div>

      {result && (
        <div className={`rounded-lg px-4 py-3 text-sm flex items-start gap-2 ${
          result.type === "success"
            ? "bg-green-50 border border-green-200 text-green-700"
            : "bg-red-50 border border-red-200 text-red-700"
        }`}>
          {result.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <span>{result.text}</span>
        </div>
      )}
    </div>
  );
}
