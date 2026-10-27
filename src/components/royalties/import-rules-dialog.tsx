"use client";

import { useRef, useState } from "react";
import { AlertTriangle, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readRulesWorkbook, type ImportRow } from "@/lib/royalty/spreadsheet";

interface RowResult {
  row: number;
  op: "create" | "update" | "delete" | "unchanged" | null;
  label: string;
  changes: string[];
  error: string | null;
}

interface Preview {
  applied: boolean;
  summary: { create: number; update: number; delete: number; unchanged: number; errors: number };
  duplicatesAfter: number;
  rows: RowResult[];
}

const OP_BADGE = {
  create: { label: "Add", variant: "success" },
  update: { label: "Update", variant: "default" },
  delete: { label: "Delete", variant: "destructive" },
} as const;

export function ImportRulesDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setFileName("");
    setRows(null);
    setPreview(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function send(data: ImportRow[], apply: boolean): Promise<Preview | null> {
    const res = await fetch("/api/royalty-rules/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: data, apply }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(body.error || "The import failed");
      return null;
    }
    return body;
  }

  async function handleFile(file: File) {
    reset();
    setFileName(file.name);
    setBusy(true);
    try {
      let parsed: ImportRow[];
      try {
        parsed = readRulesWorkbook(await file.arrayBuffer());
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't read the file");
        return;
      }
      if (parsed.length === 0) {
        setError("The file has no rule rows.");
        return;
      }
      setRows(parsed);
      setPreview(await send(parsed, false));
    } finally {
      setBusy(false);
    }
  }

  async function handleImport() {
    if (!rows) return;
    setBusy(true);
    try {
      const result = await send(rows, true);
      if (result) {
        setPreview(result);
        if (result.applied) onImported();
      }
    } finally {
      setBusy(false);
    }
  }

  const s = preview?.summary;
  const changing = s ? s.create + s.update + s.delete : 0;
  const listed = preview?.rows.filter((r) => r.error || (r.op && r.op !== "unchanged")) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Royalty Rules</DialogTitle>
          <DialogDescription>
            Upload a file made with Export, after editing it. Rows with a Rule ID update that rule, rows without one add a
            rule, and rows marked Delete remove theirs. Rules left out of the file aren&apos;t changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="h-4 w-4 mr-2" />
              {fileName ? "Choose another file" : "Choose file"}
            </Button>
            {fileName && <span className="text-sm text-gray-600 truncate">{fileName}</span>}
          </div>

          {busy && !preview && <p className="text-sm text-gray-500">Checking the file...</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}

          {preview && s && (
            <>
              {preview.applied ? (
                <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
                  Imported: {s.create} added, {s.update} updated, {s.delete} deleted.
                </div>
              ) : s.errors > 0 ? (
                <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {s.errors} row{s.errors !== 1 ? "s have" : " has"} a problem. Fix {s.errors !== 1 ? "them" : "it"} in the file
                  and upload it again; nothing is imported until every row is valid.
                </div>
              ) : (
                <p className="text-sm text-gray-700">
                  {changing === 0
                    ? "Nothing to change: every rule in the file matches what's saved."
                    : `Ready to import: ${s.create} to add, ${s.update} to update, ${s.delete} to delete.`}
                  {s.unchanged > 0 && <span className="text-gray-500"> {s.unchanged} unchanged.</span>}
                </p>
              )}

              {preview.duplicatesAfter > 0 && !preview.applied && s.errors === 0 && changing > 0 && (
                <p className="text-xs text-amber-700 flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  After this import there will be {preview.duplicatesAfter} duplicate group
                  {preview.duplicatesAfter !== 1 ? "s" : ""}. You can review them on the Duplicates tab.
                </p>
              )}

              {listed.length > 0 && (
                <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0">
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="text-left py-1.5 px-3 text-gray-600 font-medium w-14">Row</th>
                        <th className="text-left py-1.5 px-3 text-gray-600 font-medium w-20"></th>
                        <th className="text-left py-1.5 px-3 text-gray-600 font-medium">Rule</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listed.map((r) => (
                        <tr key={r.row} className="border-b border-gray-50 align-top">
                          <td className="py-1.5 px-3 text-gray-500">{r.row}</td>
                          <td className="py-1.5 px-3">
                            {r.error ? (
                              <Badge variant="destructive" className="text-[10px]">Problem</Badge>
                            ) : r.op && r.op !== "unchanged" ? (
                              <Badge variant={OP_BADGE[r.op].variant} className="text-[10px]">
                                {OP_BADGE[r.op].label}
                              </Badge>
                            ) : null}
                          </td>
                          <td className="py-1.5 px-3 text-gray-700">
                            {r.error ? <span className="text-red-700">{r.error}</span> : r.label}
                            {r.changes.map((c) => (
                              <p key={c} className="text-gray-500">{c}</p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              reset();
              onOpenChange(false);
            }}
          >
            {preview?.applied ? "Done" : "Cancel"}
          </Button>
          {preview && !preview.applied && (
            <Button onClick={handleImport} disabled={busy || s!.errors > 0 || changing === 0}>
              {busy ? "Importing..." : "Import"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
