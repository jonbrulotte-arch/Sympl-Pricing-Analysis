import * as XLSX from "xlsx";
import type { CustomerWithChannels, RuleRecord } from "./load";

/** Royalty rules spreadsheet: one row per rule. Export writes it; import reads it back. */
export const RULE_SHEET = "Royalty Rules";
export const COLUMNS = ["Rule ID", "Customer", "Channel", "Scope", "Brand", "SKUs", "Value", "Mode", "Delete"] as const;
export const GLOBAL_LABEL = "Global";
export const ALL_CHANNELS_LABEL = "All channels";

/** One spreadsheet row as text, with its 1-based row number in the sheet. */
export interface ImportRow {
  row: number;
  ruleId: string;
  customer: string;
  channel: string;
  scope: string;
  brand: string;
  skus: string;
  value: string;
  mode: string;
  delete: string;
}

const FIELD_BY_HEADER: Record<string, keyof Omit<ImportRow, "row">> = {
  ruleid: "ruleId",
  id: "ruleId",
  customer: "customer",
  channel: "channel",
  scope: "scope",
  brand: "brand",
  skus: "skus",
  sku: "skus",
  value: "value",
  mode: "mode",
  delete: "delete",
};

const normHeader = (h: unknown) => String(h ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function buildRulesWorkbook(rules: RuleRecord[], customers: CustomerWithChannels[]): XLSX.WorkBook {
  const sorted = [...rules].sort(
    (a, b) =>
      (a.customerName ?? "").localeCompare(b.customerName ?? "") ||
      (a.channelName ?? "").localeCompare(b.channelName ?? "") ||
      a.scope.localeCompare(b.scope) ||
      (a.brandName ?? a.skus[0] ?? "").localeCompare(b.brandName ?? b.skus[0] ?? ""),
  );
  const rows = sorted.map((r) => [
    r.id,
    r.customerName ?? GLOBAL_LABEL,
    r.customerId ? (r.channelName ?? ALL_CHANNELS_LABEL) : "",
    r.scope === "brand" ? "Brand" : "SKU",
    r.scope === "brand" ? (r.brandName ?? r.brandKey ?? "") : "",
    r.scope === "sku" ? r.skus.join(", ") : "",
    r.value,
    r.mode === "pct" ? "%" : "$",
    "",
  ]);
  const ws = XLSX.utils.aoa_to_sheet([[...COLUMNS], ...rows]);
  ws["!cols"] = [{ wch: 38 }, { wch: 24 }, { wch: 22 }, { wch: 8 }, { wch: 22 }, { wch: 60 }, { wch: 8 }, { wch: 6 }, { wch: 8 }];
  ws["!autofilter"] = { ref: `A1:I${rows.length + 1}` };

  const help = XLSX.utils.aoa_to_sheet([
    ["How to edit this file"],
    [],
    ["Change a rule", "Edit its row. Keep the Rule ID so the import updates that rule."],
    ["Add a rule", "Add a row and leave Rule ID blank."],
    ["Delete a rule", "Put Yes in the Delete column. Removing a row from the file does not delete the rule."],
    [],
    ["Rule ID", "Filled in by the export. Don't change it."],
    ["Customer", `${GLOBAL_LABEL} for a rule that applies to every customer, or a customer's name for an override.`],
    ["Channel", `${ALL_CHANNELS_LABEL} (or blank), or one of the customer's channel names. Global rules can't be limited to a channel.`],
    ["Scope", "Brand or SKU."],
    ["Brand", "The brand name, for Brand rules."],
    ["SKUs", "For SKU rules: SKUs separated by commas, semicolons or new lines. SKUs must match the Product Database exactly, including letter case."],
    ["Value", "The royalty: a percentage like 6.9, or a dollar amount per unit like 1.50."],
    ["Mode", "% (percent of the price) or $ (dollars per unit)."],
    ["Delete", "Yes to delete the rule; otherwise leave blank."],
    [],
    ["Valid customer and channel names are on the Customers & Channels sheet. Only rules you can edit are imported."],
  ]);
  help["!cols"] = [{ wch: 16 }, { wch: 110 }];

  const names = XLSX.utils.aoa_to_sheet([
    ["Customer", "Channel"],
    [GLOBAL_LABEL, ""],
    ...customers.flatMap((c) => [[c.name, ALL_CHANNELS_LABEL], ...c.channels.map((ch) => [c.name, ch.name])]),
  ]);
  names["!cols"] = [{ wch: 30 }, { wch: 30 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, RULE_SHEET);
  XLSX.utils.book_append_sheet(wb, help, "How to edit");
  XLSX.utils.book_append_sheet(wb, names, "Customers & Channels");
  return wb;
}

/** Reads the rules sheet (or the first sheet) into text rows. Throws when the headers aren't recognized. */
export function readRulesWorkbook(data: ArrayBuffer): ImportRow[] {
  const wb = XLSX.read(data);
  const name = wb.SheetNames.find((n) => n.toLowerCase() === RULE_SHEET.toLowerCase()) ?? wb.SheetNames[0];
  if (!name) throw new Error("The file has no sheets.");
  const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: "", raw: true });
  if (grid.length === 0) throw new Error("The sheet is empty.");

  const colFor = new Map<number, keyof Omit<ImportRow, "row">>();
  grid[0].forEach((h, i) => {
    const field = FIELD_BY_HEADER[normHeader(h)];
    if (field && ![...colFor.values()].includes(field)) colFor.set(i, field);
  });
  const missing = ["scope", "value"].filter((f) => ![...colFor.values()].includes(f as keyof Omit<ImportRow, "row">));
  if (missing.length > 0)
    throw new Error(`Couldn't find the ${missing.map((m) => (m === "scope" ? "Scope" : "Value")).join(" and ")} column. Start from an exported file.`);

  const rows: ImportRow[] = [];
  grid.slice(1).forEach((cells, i) => {
    const row: ImportRow = { row: i + 2, ruleId: "", customer: "", channel: "", scope: "", brand: "", skus: "", value: "", mode: "", delete: "" };
    for (const [col, field] of colFor) row[field] = String(cells[col] ?? "").trim();
    if (Object.entries(row).some(([k, v]) => k !== "row" && v !== "")) rows.push(row);
  });
  return rows;
}
