"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Truck } from "lucide-react";

type State = "idle" | "importing" | "done" | "error";

interface Result {
  updated: number;
  total: number;
  notFoundCount: number;
}

export function McfFreightImport() {
  const [state, setState] = useState<State>("idle");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setState("importing");
    setError(null);
    try {
      const res = await fetch("/api/products/import/mcf-freight", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import failed");
        setState("error");
        return;
      }
      setResult(data);
      setState("done");
    } catch {
      setError("Network error");
      setState("error");
    }
  }

  if (state === "done" && result) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-md px-2 py-1">
          MCF Freight updated: {result.updated} of {result.total} SKUs
          {result.notFoundCount > 0 && ` (${result.notFoundCount} not in DB)`}
        </span>
        <Button variant="ghost" size="sm" onClick={() => { setState("idle"); setResult(null); }} className="text-xs h-7 px-2">
          Dismiss
        </Button>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1">
          {error}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setState("idle")} className="text-xs h-7 px-2">
          Dismiss
        </Button>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleImport}
      disabled={state === "importing"}
    >
      {state === "importing" ? (
        <>
          <div className="h-4 w-4 mr-2 animate-spin border-2 border-purple-600 border-t-transparent rounded-full" />
          Importing...
        </>
      ) : (
        <>
          <Truck className="h-4 w-4 mr-2" />
          Import MCF Freight
        </>
      )}
    </Button>
  );
}
