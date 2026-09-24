"use client";

import { useState, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Upload, FileSpreadsheet, Check, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { parseWorkbook, type ParsedSheet } from "@/lib/import/parse";
import { autoMapColumns, headerSignature } from "@/lib/import/auto-map";
import { buildRows } from "@/lib/import/build-rows";
import { IMPORT_FIELDS } from "@/lib/pricing/constants";
import type { ProductRow } from "@/lib/pricing/types";

type Step = "upload" | "map" | "preview" | "importing" | "syncing" | "done";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default function ImportPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplementalMode = searchParams.get("mode") === "supplemental";
  const SUPPLEMENTAL_FIELDS = new Set(["sku", "cost", "mcfFreight", "royalty", "amzCommission"]);
  const visibleImportFields = supplementalMode
    ? IMPORT_FIELDS.filter((f) => SUPPLEMENTAL_FIELDS.has(f.key))
    : IMPORT_FIELDS;

  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [sheets, setSheets] = useState<ParsedSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState(0);
  const [columnMap, setColumnMap] = useState<Record<string, number>>({});
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState(0);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = parseWorkbook(e.target!.result as ArrayBuffer);
        setSheets(parsed);
        if (parsed.length > 0) {
          const sheet = parsed[0];
          const map = autoMapColumns(sheet.headers);
          setColumnMap(map);
          setSelectedSheet(0);
          setStep("map");
        }
      } catch {
        setError("Failed to parse file. Please upload a valid .xlsx, .xls, or .csv file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleSheetChange(idx: number) {
    setSelectedSheet(idx);
    const sheet = sheets[idx];
    const map = autoMapColumns(sheet.headers);
    setColumnMap(map);
  }

  function setMapping(fieldKey: string, colIdx: number | undefined) {
    setColumnMap((prev) => {
      const next = { ...prev };
      if (colIdx === undefined) {
        delete next[fieldKey];
      } else {
        next[fieldKey] = colIdx;
      }
      return next;
    });
  }

  function handlePreview() {
    const sheet = sheets[selectedSheet];
    const built = buildRows(sheet.data, columnMap);
    setRows(built);
    setStep("preview");
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setStep("importing");

    try {
      const res = await fetch(`/api/customers/${customerId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName,
          sheetName: sheets[selectedSheet].name,
          headerSig: headerSignature(sheets[selectedSheet].headers),
          columnMap,
          rows,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Import failed");
        setStep("preview");
      } else {
        const data = await res.json();
        setResult(data);
        setStep("done");
      }
    } catch {
      setError("Network error during import");
      setStep("preview");
    } finally {
      setImporting(false);
    }
  }

  const sheet = sheets[selectedSheet];
  const missingRequired = visibleImportFields.filter((f) => f.req && columnMap[f.key] === undefined);

  async function handleSalsifySync() {
    setSyncing(true);
    setSyncError(null);
    setSyncProgress(0);
    try {
      const res = await fetch(`/api/customers/${customerId}/salsify-sync`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setSyncError(data.error || "Salsify sync failed");
        setSyncing(false);
        return;
      }

      const { importId } = data;
      setStep("syncing");

      while (true) {
        await sleep(2000);
        const statusRes = await fetch(`/api/customers/${customerId}/imports/${importId}`);
        const statusData = await statusRes.json();
        if (!statusRes.ok) {
          setSyncError(statusData.error || "Lost track of the sync status");
          setStep("upload");
          break;
        }

        setSyncProgress(statusData.rowCount ?? 0);

        if (statusData.status === "complete") {
          const { created, updated } = statusData.errors ?? {};
          setResult({ created: created ?? 0, updated: updated ?? 0 });
          setStep("done");
          break;
        }
        if (statusData.status === "failed") {
          setSyncError(statusData.errors?.message || "Salsify sync failed");
          setStep("upload");
          break;
        }
      }
    } catch {
      setSyncError("Network error during Salsify sync");
      setStep("upload");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {supplementalMode ? "Supplemental Data Import" : "Import Product Data"}
      </h1>
      {supplementalMode && (
        <p className="text-sm text-gray-500 -mt-4 mb-6">
          Bring in the fields Salsify doesn&apos;t carry (SKU cost, MCF freight, royalty, category commission) via a small spreadsheet.
        </p>
      )}
      {!supplementalMode && step === "upload" && (
        <div className="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700 mb-4">
          Just updating cost or freight data?{" "}
          <a href="/products/import/supplemental" className="font-medium underline">Use Supplemental Data Import</a> in the Products hub.
        </div>
      )}

      {/* Upload */}
      {step === "upload" && (
        <>
          {!supplementalMode && (
            <Card className="mb-4">
              <CardContent className="py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Sync from Salsify</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Pull product data directly using this customer&apos;s field mapping and your personal Salsify API key.
                  </p>
                </div>
                <Button onClick={handleSalsifySync} disabled={syncing} variant="outline">
                  <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
                  {syncing ? "Syncing..." : "Sync from Salsify"}
                </Button>
              </CardContent>
            </Card>
          )}
          {syncError && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{syncError}</div>
          )}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-16 text-center transition-colors ${
              dragOver ? "border-blue-400 bg-blue-50" : "border-gray-300"
            }`}
          >
            <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-2">Drag and drop a spreadsheet file here</p>
            <p className="text-sm text-gray-500 mb-4">.xlsx, .xls, or .csv</p>
            <label>
              <Button variant="outline" asChild>
                <span>Browse Files</span>
              </Button>
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} className="hidden" />
            </label>
          </div>
        </>
      )}

      {/* Column mapping */}
      {step === "map" && sheet && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm text-gray-500">
                <FileSpreadsheet className="h-4 w-4 inline mr-1" />
                {fileName}
                {sheets.length > 1 && (
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(Number(e.target.value))}
                    className="ml-2 text-sm border rounded px-2 py-0.5"
                  >
                    {sheets.map((s, i) => (
                      <option key={i} value={i}>{s.name}</option>
                    ))}
                  </select>
                )}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                {sheet.headers.length} columns, {sheet.data.length} rows
              </p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Map Columns</CardTitle>
              <p className="text-sm text-gray-500">Match spreadsheet columns to data fields. Required fields are marked.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {visibleImportFields.map((field) => (
                  <div key={field.key} className="flex items-center gap-3 py-1.5 border-b border-gray-50 last:border-0">
                    <div className="w-56 shrink-0 flex items-center gap-2">
                      <span className="text-sm text-gray-900">{field.label}</span>
                      {field.req && <Badge variant="destructive" className="text-[10px] px-1 py-0">Required</Badge>}
                    </div>
                    <select
                      value={columnMap[field.key] ?? ""}
                      onChange={(e) => setMapping(field.key, e.target.value === "" ? undefined : Number(e.target.value))}
                      className={`flex-1 text-sm border rounded px-2 py-1.5 ${
                        field.req && columnMap[field.key] === undefined ? "border-red-300 bg-red-50" : ""
                      }`}
                    >
                      <option value="">-- Not mapped --</option>
                      {sheet.headers.map((h, i) => (
                        <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
                      ))}
                    </select>
                    {columnMap[field.key] !== undefined && (
                      <Check className="h-4 w-4 text-green-500 shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between mt-6">
            <Button variant="outline" onClick={() => setStep("upload")}>
              Back
            </Button>
            <div className="flex items-center gap-3">
              {missingRequired.length > 0 && (
                <span className="text-sm text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
                  {missingRequired.length} required field(s) unmapped
                </span>
              )}
              <Button onClick={handlePreview} disabled={missingRequired.length > 0}>
                Preview
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      {step === "preview" && (
        <div>
          <Card className="mb-4">
            <CardHeader>
              <CardTitle>Import Preview</CardTitle>
              <p className="text-sm text-gray-500">{rows.length} products found</p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-2 px-2 text-gray-600 font-medium">SKU</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-medium">Name</th>
                      <th className="text-right py-2 px-2 text-gray-600 font-medium">Cost</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-medium">Brand</th>
                      <th className="text-left py-2 px-2 text-gray-600 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 px-2 font-mono text-xs">{r.sku}</td>
                        <td className="py-1.5 px-2 text-gray-700 max-w-xs truncate">{r.name || "-"}</td>
                        <td className="py-1.5 px-2 text-right">{r.cost != null ? `$${r.cost.toFixed(2)}` : "-"}</td>
                        <td className="py-1.5 px-2 text-gray-600">{r.brand || "-"}</td>
                        <td className="py-1.5 px-2 text-gray-600">{r.invStatus || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 50 && (
                  <p className="text-sm text-gray-500 text-center py-2">
                    Showing 50 of {rows.length} rows
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 mb-4">{error}</div>
          )}

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep("map")}>
              Back to Mapping
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              Import {rows.length} Products
            </Button>
          </div>
        </div>
      )}

      {/* Importing */}
      {step === "importing" && (
        <div className="text-center py-16">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Importing {rows.length} products...</p>
        </div>
      )}

      {/* Syncing from Salsify */}
      {step === "syncing" && (
        <div className="text-center py-16">
          <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600">Syncing from Salsify...</p>
          <p className="text-sm text-gray-500 mt-1">
            {syncProgress > 0 ? `${syncProgress} products found so far` : "Starting..."}
          </p>
          <p className="text-xs text-gray-400 mt-2">
            This can take several minutes for a large catalog. Feel free to leave this page — the sync continues in the background.
          </p>
        </div>
      )}

      {/* Done */}
      {step === "done" && result && (
        <Card>
          <CardContent className="py-12 text-center">
            <Check className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Import Complete</h2>
            <p className="text-gray-600 mb-1">{result.created} new products created</p>
            <p className="text-gray-600 mb-6">{result.updated} existing products updated</p>
            <div className="flex gap-3 justify-center">
              <Button onClick={() => router.push(`/customers/${customerId}/analysis`)}>
                Run Analysis
              </Button>
              <Button variant="outline" onClick={() => { setStep("upload"); setRows([]); }}>
                Import More
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
