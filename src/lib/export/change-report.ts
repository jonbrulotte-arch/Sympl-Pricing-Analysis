import * as XLSX from "xlsx";
import type { AnalysisResult, ChannelConfig, ChannelDefaults } from "@/lib/pricing/types";

/** Excel sheet names can't contain : \ / ? * [ ] and are capped at 31 characters. */
export function safeSheetName(name: string, fallback = "Sheet1"): string {
  const cleaned = name.replace(/[:\\/?*[\]]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31);
  return cleaned || fallback;
}

/** File-name safe version of a channel name. */
export function safeFileName(name: string): string {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/\s+/g, "_");
}

/**
 * Columns removed from the Full Analysis export for users without data:viewCost.
 * Cost itself, plus the fee breakdown, since cost = price − fees − shipping − net.
 */
const FULL_ANALYSIS_COST_COLUMNS = [
  "SKU Cost",
  "Fee Rate k",
  "Coupon",
  "Commission",
  "FVF Fixed",
  "Promoted",
  "CC Variable",
  "CC Flat",
  "Returns",
  "Advertising",
  "Royalty",
  "PPC",
  "Total Fees",
];

function omit<T extends Record<string, unknown>>(row: T, keys: string[]): Partial<T> {
  const out: Record<string, unknown> = { ...row };
  for (const k of keys) delete out[k];
  return out as Partial<T>;
}

export function exportChangeReport(
  results: AnalysisResult[],
  channelName: string,
  settings: ChannelDefaults,
  canViewCost: boolean,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const rows = results
    .filter((r) => !r.invalid && !r.unpriced)
    .filter((r) => {
      if (settings.excludeDisc && r.disc) return false;
      if (settings.excludeOOS && r.oos) return false;
      return true;
    })
    .filter((r) => r.rec != null && Math.abs((r.rec ?? 0) - r.price) > 0.005)
    .map((r) => ({
      Channel: channelName,
      SKU: r.sku,
      "Item Name": r.name ?? "",
      Brand: r.brand ?? "",
      ASIN: r.asin ?? "",
      "Inventory Status": r.invRaw ?? "",
      "Available Units": r.avail ?? "",
      "SKU Cost": r.cost,
      "Shipping Cost": r.ship,
      Units: r.units,
      "Current List Price": r.price,
      "Current Net Margin %": r.gm,
      "Current Net Margin $": r.net,
      "Goal Applied": r.goalUsed,
      "Recommended List Price": r.rec,
      "New or Reprice": r.price > 0 ? "Reprice" : "New",
      "Price Change $": r.delta,
      "Price Change %": r.deltaPct,
      "New Net Margin %": r.recCalc?.gm ?? null,
      "New Net Margin $": r.recCalc?.net ?? null,
      "Margin Gain $": r.recCalc ? r.recCalc.net - r.net : null,
      "Target Profit $": r.targetProfit,
      "Manually Adjusted": r.edited ? "Yes" : "",
    }))
    .map((row) => (canViewCost ? row : omit(row, ["SKU Cost"])));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  const widths = [
    { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 14 },
  ];
  if (!canViewCost) widths.splice(7, 1); // "SKU Cost"
  ws["!cols"] = widths;

  XLSX.utils.book_append_sheet(wb, ws, "Price Changes");
  return wb;
}

export function exportFullAnalysis(
  results: AnalysisResult[],
  channelName: string,
  canViewCost: boolean,
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const rows = results
    .filter((r) => !r.invalid)
    .map((r) => ({
      SKU: r.sku,
      "Item Name": r.name ?? "",
      Brand: r.brand ?? "",
      "SKU Cost": r.cost,
      "List Price": r.price,
      "Shipping Cost": r.ship,
      Units: r.units,
      Status: r.status,
      "Net Margin %": r.price > 0 ? r.gm : null,
      "Net Margin $": r.price > 0 ? r.net : null,
      "Fee Rate k": r.feeRate,
      "Coupon": r.cur.coupon,
      "Sale Base": r.cur.saleBase,
      "Tax": r.cur.tax,
      "Sold Price": r.cur.sold,
      "Commission": r.cur.fvfRate,
      "FVF Fixed": r.fvfFixedUsed,
      "Promoted": r.cur.promo,
      "CC Variable": r.cur.ccVar,
      "CC Flat": r.cur.ccFlat,
      "Returns": r.cur.ret,
      "Advertising": r.cur.ad,
      "Royalty": r.cur.roy,
      "PPC": r.ppcUsed,
      "Total Fees": r.cur.fees,
      "Recommended Price": r.rec,
      "Rec Net Margin %": r.recCalc?.gm ?? null,
      "Price Change $": r.delta,
      "Price Change %": r.deltaPct,
      "Goal Used": r.goalUsed,
      "Inventory Status": r.invRaw ?? "",
      "Available": r.avail,
      ASIN: r.asin ?? "",
    }))
    .map((row) => (canViewCost ? row : omit(row, FULL_ANALYSIS_COST_COLUMNS)));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(channelName, "Full Analysis"));
  return wb;
}
