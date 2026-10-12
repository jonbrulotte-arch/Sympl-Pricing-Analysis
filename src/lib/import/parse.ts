import * as XLSX from "xlsx";

export interface ParsedSheet {
  name: string;
  headers: string[];
  data: unknown[][];
}

export function parseWorkbook(buffer: ArrayBuffer): ParsedSheet[] {
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
    if (raw.length === 0) return { name, headers: [], data: [] };
    const headers = (raw[0] as unknown[]).map((h) => (h != null ? String(h).trim() : ""));
    const data = raw.slice(1).filter((r) => r.some((c) => c != null && c !== ""));
    return { name, headers, data };
  });
}
