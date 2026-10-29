import type { Borders, Fill, Font } from "exceljs";
import { safeFileName } from "@/lib/export/change-report";

/** One channel in Single SKU Analysis's Publish All change report. */
export interface PublishAllRow {
  channelId: string;
  channelName: string;
  /** The Salsify property the price is written to, when the channel can be published. */
  salsifyProperty: string | null;
  oldPrice: number | null;
  newPrice: number;
  oldNetMargin: number | null;
  newNetMargin: number | null;
  oldNet: number | null;
  newNet: number | null;
  /** Why this channel can't be published (it's skipped), or null when it's ready. */
  problem: string | null;
  /** After submitting: Salsify took this channel's price. */
  published?: boolean;
}

export interface ChangeReportInput {
  customerName: string;
  sku: string;
  productName: string;
  rows: PublishAllRow[];
  /** True once the prices have been sent to Salsify. */
  published: boolean;
}

const C = {
  title: "FF111827",
  text: "FF374151",
  muted: "FF6B7280",
  border: "FFE5E7EB",
  headFill: "FFF3F4F6",
  oldFill: "FFF9FAFB",
  newFill: "FFEFF6FF",
  primary: "FF2563EB",
  green: "FF15803D",
  red: "FFB91C1C",
  amber: "FFB45309",
  gray: "FF9CA3AF",
};
const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const SIGNED_MONEY = '+"$"#,##0.00;[Red]-"$"#,##0.00;"$"0.00';
const PCT = "0.0%;[Red]-0.0%";
const SIGNED_PCT = "+0.0%;[Red]-0.0%;0.0%";

const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin" as const, color: { argb: C.border } };
const box: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const font = (f: Partial<Font> = {}): Partial<Font> => ({ name: "Calibri", size: 10, color: { argb: C.text }, ...f });

export function rowStatus(r: PublishAllRow, published: boolean): string {
  if (r.problem) return `Skipped: ${r.problem}`;
  if (published) return r.published ? "Published" : "Not published";
  return "Ready to publish";
}

/**
 * Downloads the change report as a formatted workbook: each channel's old and new price and net margin, and the
 * Salsify property written, so the old prices can be restored if needed.
 */
export async function exportSingleSkuChangeReport(input: ChangeReportInput) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sympl Pricing Analysis";
  wb.created = new Date();
  const ws = wb.addWorksheet("Price Change Report", {
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "6:6" },
    properties: { tabColor: { argb: C.primary } },
  });

  const cols: { label: string; width: number; align: "left" | "right" }[] = [
    { label: "Channel", width: 24, align: "left" },
    { label: "Salsify property", width: 24, align: "left" },
    { label: "Old price", width: 11, align: "right" },
    { label: "New price", width: 11, align: "right" },
    { label: "Change", width: 11, align: "right" },
    { label: "Change %", width: 10, align: "right" },
    { label: "Old net margin", width: 13, align: "right" },
    { label: "New net margin", width: 13, align: "right" },
    { label: "Old net $", width: 11, align: "right" },
    { label: "New net $", width: 11, align: "right" },
    { label: "Status", width: 44, align: "left" },
  ];
  const width = cols.length;
  const generated = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  const line = (r: number, value: string, f: Partial<Font>, height?: number) => {
    ws.mergeCells(r, 1, r, width);
    const cell = ws.getCell(r, 1);
    cell.value = value;
    cell.font = font(f);
    cell.alignment = { wrapText: true, vertical: "top" };
    if (height) ws.getRow(r).height = height;
  };
  line(1, "Single SKU Price Change Report", { size: 16, bold: true, color: { argb: C.title } }, 26);
  line(2, `${input.sku}${input.productName ? `  ·  ${input.productName}` : ""}  ·  ${input.customerName}  ·  Generated ${generated}`, {
    color: { argb: C.muted },
  });
  line(
    3,
    input.published
      ? "Prices as published to Salsify. Old prices are what each channel had before; use them to roll back if needed."
      : "Backup before publishing: Old price is each channel's current price. To roll back after publishing, set each Salsify property back to its Old price.",
    { italic: true, color: { argb: C.muted } },
    28,
  );
  line(4, "Net margins use the same cost, shipping, units and allocations for old and new, so the difference is the price change.", {
    italic: true,
    color: { argb: C.muted },
  });

  const head = ws.getRow(6);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.font = font({ bold: true });
    cell.fill = fill(i >= 2 && i <= 9 ? (c.label.startsWith("New") || c.label.startsWith("Change") ? C.newFill : C.oldFill) : C.headFill);
    cell.border = { ...box, bottom: { style: "medium", color: { argb: C.gray } } };
    cell.alignment = { horizontal: c.align, vertical: "middle", wrapText: true };
  });
  head.height = 20;

  input.rows.forEach((r, i) => {
    const row = ws.getRow(7 + i);
    // Room for a skipped channel's reason, which wraps.
    row.height = r.problem ? 30 : 18;
    const change = r.oldPrice != null ? r.newPrice - r.oldPrice : null;
    const values: (string | number | null)[] = [
      r.channelName,
      r.salsifyProperty,
      r.oldPrice,
      r.newPrice,
      change,
      change != null && r.oldPrice ? change / r.oldPrice : null,
      r.oldNetMargin,
      r.newNetMargin,
      r.oldNet,
      r.newNet,
      rowStatus(r, input.published),
    ];
    const formats = [null, null, MONEY, MONEY, SIGNED_MONEY, SIGNED_PCT, PCT, PCT, MONEY, MONEY, null];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      cell.border = box;
      cell.font = font(c === 0 ? { bold: true, color: { argb: C.title } } : c === 3 ? { bold: true } : {});
      cell.alignment = { horizontal: cols[c].align, vertical: "middle", wrapText: c === 10, indent: c === 10 || c === 1 ? 1 : 0 };
      if (formats[c]) cell.numFmt = formats[c]!;
      if (c === 1 && !v) {
        cell.value = "-";
        cell.font = font({ color: { argb: C.gray } });
      }
      if ((c === 6 || c === 7) && typeof v === "number") cell.font = font({ bold: c === 7, color: { argb: v < 0 ? C.red : C.text } });
      if (c === 10) {
        const color = r.problem ? C.amber : input.published ? (r.published ? C.green : C.red) : C.primary;
        cell.font = font({ bold: true, color: { argb: color } });
      }
    });
  });

  ws.columns = cols.map((c) => ({ width: c.width }));
  ws.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  a.download = `${safeFileName(input.sku)}_price-change-report_${input.published ? "published" : "backup"}_${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
