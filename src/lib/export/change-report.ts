import * as XLSX from "xlsx";
import type { AnalysisResult, ChannelConfig, ChannelDefaults } from "@/lib/pricing/types";

export function exportChangeReport(
  results: AnalysisResult[],
  channelName: string,
  settings: ChannelDefaults,
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
      "Current Net GM%": r.gm,
      "Current Net Margin $": r.net,
      "Goal Applied": r.goalUsed,
      "Recommended List Price": r.rec,
      "New or Reprice": r.price > 0 ? "Reprice" : "New",
      "Price Change $": r.delta,
      "Price Change %": r.deltaPct,
      "New Net GM%": r.recCalc?.gm ?? null,
      "New Net Margin $": r.recCalc?.net ?? null,
      "Margin Gain $": r.recCalc ? r.recCalc.net - r.net : null,
      "Target Profit $": r.targetProfit,
      "Manually Adjusted": r.edited ? "Yes" : "",
    }));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Column widths
  ws["!cols"] = [
    { wch: 14 }, { wch: 16 }, { wch: 30 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 8 },
    { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 12 }, { wch: 12 }, { wch: 14 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Price Changes");
  return wb;
}

export function exportFullAnalysis(
  results: AnalysisResult[],
  channelName: string,
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
      "Net GM%": r.price > 0 ? r.gm : null,
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
      "Rec GM%": r.recCalc?.gm ?? null,
      "Price Change $": r.delta,
      "Price Change %": r.deltaPct,
      "Goal Used": r.goalUsed,
      "Inventory Status": r.invRaw ?? "",
      "Available": r.avail,
      ASIN: r.asin ?? "",
    }));

  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, channelName.slice(0, 31));
  return wb;
}
