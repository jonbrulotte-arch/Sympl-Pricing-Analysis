"use client";

import { useState } from "react";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SalsifyDebugClient() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  async function handleTestConnection() {
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/salsify-debug/test-connection", { method: "POST" });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Network error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Test Connection</CardTitle>
        <p className="text-xs text-gray-500">
          Makes a single request (1 product, page 1) directly to Salsify — isolated from any customer&apos;s field
          mapping or the full sync pipeline. Also check the server&apos;s console/terminal output during this
          request: every Salsify HTTP attempt is logged there with status and timing.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={handleTestConnection} disabled={running}>
          <Zap className="h-4 w-4 mr-2" />
          {running ? "Testing..." : "Test Connection"}
        </Button>

        {result && (
          <pre className="text-xs bg-gray-900 text-gray-100 rounded-lg p-4 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}
