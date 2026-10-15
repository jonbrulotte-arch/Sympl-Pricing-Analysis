import * as XLSX from "xlsx";
import type { AnalysisResult, ChannelConfig, ChannelDefaults } from "@/lib/pricing/types";
import type { FieldUiDef } from "@/lib/pricing/constants";
import { feeLedger } from "@/lib/pricing/ledger";
import { safeFileName, safeSheetName } from "@/lib/export/change-report";

export interface SingleSkuChannelReport {
  cfg: ChannelConfig;
  result: AnalysisResult;
  /** Settings the result was calculated with (numeric, as the engine reads them). */
  settings: ChannelDefaults;
  /** Allocation fields shown for the channel, with the value used and the channel's own setting. */
  allocations: { field: FieldUiDef; value: unknown; channelValue: unknown }[];
  shipping: { label: string; value: number | null }[];
  warnings: string[];
}

export interface SingleSkuReportInput {
  customerName: string;
  product: { sku: string; name: string; brand: string; itemType: string; isNew: boolean };
  cost: number | null;
  /** False when the viewer lacks data:viewCost: cost and the fee breakdown are left out. */
  includeCost: boolean;
  units: number;
  channels: SingleSkuChannelReport[];
}

type Cell = string | number | null | { v: number; t: "n"; z: string };
const MONEY = "$#,##0.00";
const PCT = "0.0%";
const money = (v: number | null | undefined): Cell => (v == null ? null : { v, t: "n", z: MONEY });
const pct = (v: number | null | undefined): Cell => (v == null ? null : { v, t: "n", z: PCT });

const STATUS: Record<string, string> = {
  pass: "At goal",
  below: "Below goal",
  loss: "Losing money",
  unpriced: "No list price",
  invalid: "Missing cost",
};

function show(field: FieldUiDef, v: unknown): Cell {
  if (field.type === "check") return v ? "Yes" : "No";
  if (field.type === "select") return field.opts?.find(([k]) => k === v)?.[1] ?? String(v ?? "");
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!isFinite(n)) return null;
  return field.unit === "$" ? money(n) : field.unit === "%" ? { v: n / 100, t: "n", z: "0.00%" } : n;
}

function channelSheet(input: SingleSkuReportInput, ch: SingleSkuChannelReport): XLSX.WorkSheet {
  const r = ch.result;
  const priced = r.price > 0 && !r.invalid;
  const rows: Cell[][] = [
    [`Single SKU Analysis: ${ch.cfg.name}`],
    ["Customer", input.customerName],
    ["SKU", input.product.sku + (input.product.isNew ? " (new)" : "")],
    ["Name", input.product.name || null],
    ["Brand", input.product.brand || null],
    ...(input.product.itemType ? [["Amazon item type", input.product.itemType] as Cell[]] : []),
    ["Generated", new Date().toLocaleString()],
    [],
    ["INPUTS"],
    ["Unit cost", input.includeCost ? money(input.cost) : "Hidden"],
    ["List price", money(r.price > 0 ? r.price : null)],
    ["Units per order", input.units],
    ...ch.shipping.map((s) => [`${s.label} (per unit)`, money(s.value)] as Cell[]),
    [],
    ["ALLOCATIONS", "Used", "Channel setting", "Edited"],
    ...ch.allocations.map(({ field, value, channelValue }) => {
      const edited = String(value ?? "") !== String(channelValue ?? "");
      return [field.label, show(field, value), show(field, channelValue), edited ? "Yes" : ""] as Cell[];
    }),
    [],
    ["RESULTS", "At list price", "At recommended price"],
    ["Price", money(r.price > 0 ? r.price : null), money(r.rec)],
    ["Net margin %", priced ? pct(r.gm) : null, pct(r.recCalc?.gm)],
    ["Net $ per order", priced ? money(r.net) : null, money(r.recCalc?.net)],
    ...(input.includeCost
      ? [["Total fees and allocations", priced ? money(r.cur.alloc) : null, money(r.recCalc?.alloc)] as Cell[]]
      : []),
    ["Shipping per order", money(r.ship)],
    ["Status", STATUS[r.status] ?? r.status],
    ["Goal net margin", pct(r.goalUsed)],
    ["Change to recommended", r.delta != null && r.price > 0 ? money(r.delta) : null, r.deltaPct != null ? pct(r.deltaPct) : null],
    ["Target profit per unit", money(r.targetProfit), r.price > 0 ? (r.hitsTarget ? "Met" : "Not met") : null],
    ["Royalty source", r.royFrom],
    [`${ch.cfg.flags.commSku ? "Referral fee" : "Commission"} rate`, pct(r.commR), r.commFrom === "itemType" ? "Item type override" : r.commFrom === "sheet" ? "Per-SKU (import)" : "Channel"],
  ];

  if (input.includeCost) {
    if (priced) {
      rows.push([], ["FEE LEDGER AT LIST PRICE", "Amount"]);
      for (const l of feeLedger(r, ch.cfg, ch.settings, { includeCost: true })) rows.push([l.label, money(l.value)]);
    }
    if (r.rec != null && r.recCalc) {
      const atRec: AnalysisResult = { ...r, price: r.rec, cur: r.recCalc };
      rows.push([], ["FEE LEDGER AT RECOMMENDED PRICE", "Amount"]);
      for (const l of feeLedger(atRec, ch.cfg, ch.settings, { includeCost: true })) rows.push([l.label, money(l.value)]);
    }
  } else {
    rows.push([], ["The fee breakdown is left out because your role can't see unit cost."]);
  }

  if (ch.warnings.length) {
    rows.push([], ["NOTES"]);
    for (const w of ch.warnings) rows.push([w]);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 62 }, { wch: 18 }, { wch: 22 }, { wch: 10 }];
  return ws;
}

function summarySheet(input: SingleSkuReportInput): XLSX.WorkSheet {
  const rows: Cell[][] = [
    ["Single SKU Analysis: all channels"],
    ["Customer", input.customerName],
    ["SKU", input.product.sku + (input.product.isNew ? " (new)" : "")],
    ["Name", input.product.name || null],
    ["Unit cost", input.includeCost ? money(input.cost) : "Hidden"],
    ["Generated", new Date().toLocaleString()],
    [],
    ["Channel", "List price", "Net margin %", "Net $ per order", "Goal", "Status", "Recommended", "Rec. net margin %", "Change to rec. %"],
    ...input.channels.map(({ cfg, result: r }) => {
      const priced = r.price > 0 && !r.invalid;
      return [
        cfg.name,
        money(r.price > 0 ? r.price : null),
        priced ? pct(r.gm) : null,
        priced ? money(r.net) : null,
        pct(r.goalUsed),
        STATUS[r.status] ?? r.status,
        money(r.rec),
        pct(r.recCalc?.gm),
        r.deltaPct != null ? pct(r.deltaPct) : null,
      ] as Cell[];
    }),
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 15 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 17 }, { wch: 16 }];
  return ws;
}

/** Downloads the Single SKU Analysis report: one sheet per channel, plus a summary when there's more than one. */
export function exportSingleSkuReport(input: SingleSkuReportInput) {
  const wb = XLSX.utils.book_new();
  if (input.channels.length > 1) XLSX.utils.book_append_sheet(wb, summarySheet(input), "Summary");
  const used = new Set<string>();
  for (const ch of input.channels) {
    let name = safeSheetName(ch.cfg.tabLabel || ch.cfg.name, "Channel");
    for (let i = 2; used.has(name.toLowerCase()); i++) name = safeSheetName(`${ch.cfg.tabLabel || ch.cfg.name} ${i}`, "Channel");
    used.add(name.toLowerCase());
    XLSX.utils.book_append_sheet(wb, channelSheet(input, ch), name);
  }
  const scope = input.channels.length > 1 ? "all-channels" : input.channels[0]?.cfg.name ?? "channel";
  XLSX.writeFile(wb, `${safeFileName(input.product.sku || "new-sku")}_${safeFileName(scope)}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
