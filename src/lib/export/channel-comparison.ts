import type { Borders, Cell, Fill, Font, Worksheet } from "exceljs";
import type { AnalysisResult, ChannelConfig } from "@/lib/pricing/types";
import { safeFileName } from "@/lib/export/change-report";

export interface ComparisonExportRow {
  sku: string;
  name: string | null;
  brand: string | null;
  disc: boolean;
  byChannel: Record<string, AnalysisResult>;
  /** Highest minus lowest net margin across the channels (fraction), or null with fewer than two. */
  spread: number | null;
}

export interface ComparisonExportInput {
  /** e.g. "Demo Company" or "Demo Company — Q4 Review". */
  reportName: string;
  configs: ChannelConfig[];
  /** The rows the Comparison tab shows, in its order. */
  rows: ComparisonExportRow[];
  totalRows: number;
  /** Plain-language filters in effect, e.g. "Search: acme". */
  filters: string[];
  /** False without data:viewCost: cost and the fee columns are left out. */
  includeCost: boolean;
}

// Sympl UI palette
const C = {
  title: "FF111827",
  text: "FF374151",
  muted: "FF6B7280",
  border: "FFE5E7EB",
  headFill: "FFF3F4F6",
  groupFill: "FFDBEAFE",
  groupText: "FF1E3A8A",
  primary: "FF2563EB",
  white: "FFFFFFFF",
  zebra: "FFF9FAFB",
  green: "FF15803D",
  greenFill: "FFDCFCE7",
  amber: "FFB45309",
  amberFill: "FFFEF3C7",
  red: "FFB91C1C",
  redFill: "FFFEE2E2",
  gray: "FF9CA3AF",
};
const MONEY = '"$"#,##0.00;[Red]-"$"#,##0.00';
const PCT = "0.0%;[Red]-0.0%";
const PTS = '0.0" pts"';
const FONT = "Calibri";

const STATUS: Record<string, string> = {
  pass: "At goal",
  below: "Below goal",
  loss: "Losing money",
  unpriced: "Unpriced",
  invalid: "No cost",
};

const fill = (argb: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const thin = { style: "thin" as const, color: { argb: C.border } };
const box: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const font = (f: Partial<Font> = {}): Partial<Font> => ({ name: FONT, size: 10, color: { argb: C.text }, ...f });

const priced = (r: AnalysisResult | undefined): boolean => !!r && r.price > 0 && !r.invalid;

/** Font color (and fill, for the cell that matters) for a margin against the channel's goal. */
function marginStyle(r: AnalysisResult): { color: string; fill: string } {
  if (r.gm >= r.goalUsed) return { color: C.green, fill: C.greenFill };
  if (r.gm >= 0) return { color: C.amber, fill: C.amberFill };
  return { color: C.red, fill: C.redFill };
}

function titleBlock(ws: Worksheet, input: ComparisonExportInput, title: string, width: number) {
  ws.mergeCells(1, 1, 1, width);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = font({ size: 16, bold: true, color: { argb: C.title } });
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, width);
  const s = ws.getCell(2, 1);
  const generated = new Date().toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  s.value = `${input.reportName}  ·  ${input.configs.map((c) => c.name).join(" vs ")}  ·  Generated ${generated}`;
  s.font = font({ color: { argb: C.muted } });

  ws.mergeCells(3, 1, 3, width);
  const f = ws.getCell(3, 1);
  f.value =
    input.filters.length > 0
      ? `Filters: ${input.filters.join("; ")} (${input.rows.length} of ${input.totalRows} SKUs)`
      : `All ${input.totalRows} SKUs`;
  f.font = font({ italic: true, color: { argb: C.muted } });
}

function headerCell(cell: Cell, value: string, align: "left" | "center" | "right" = "left") {
  cell.value = value;
  cell.font = font({ bold: true, color: { argb: C.text } });
  cell.fill = fill(C.headFill);
  cell.border = { ...box, bottom: { style: "medium", color: { argb: C.gray } } };
  cell.alignment = { horizontal: align, vertical: "middle", wrapText: true };
}

function summarySheet(ws: Worksheet, input: ComparisonExportInput) {
  const cols = ["Channel", "SKUs", "Priced", "At goal", "Below goal", "Losing money", "Unpriced / no cost", "Avg net margin", "Total net $", "Goal"];
  titleBlock(ws, input, "Channel Comparison: Summary", cols.length);

  const head = ws.getRow(5);
  cols.forEach((c, i) => headerCell(head.getCell(i + 1), c, i === 0 ? "left" : "right"));
  head.height = 20;

  input.configs.forEach((cfg, i) => {
    const results = input.rows.map((r) => r.byChannel[cfg.id]).filter((r): r is AnalysisResult => !!r);
    const withMargin = results.filter(priced);
    // The channel's goal; discontinued SKUs use its sell-through goal instead, so they're left out here.
    const goals = [...new Set(results.filter((r) => !r.disc).map((r) => r.goalUsed))];
    const row = ws.getRow(6 + i);
    const values: (string | number | null)[] = [
      cfg.name,
      results.length,
      withMargin.length,
      withMargin.filter((r) => r.status === "pass").length,
      withMargin.filter((r) => r.status === "below").length,
      withMargin.filter((r) => r.status === "loss").length,
      results.length - withMargin.length,
      withMargin.length ? withMargin.reduce((s, r) => s + r.gm, 0) / withMargin.length : null,
      withMargin.reduce((s, r) => s + r.net, 0),
      goals.length === 1 ? goals[0] : null,
    ];
    values.forEach((v, c) => {
      const cell = row.getCell(c + 1);
      cell.value = v;
      cell.font = font(c === 0 ? { bold: true, color: { argb: C.title } } : {});
      cell.border = box;
      cell.alignment = { horizontal: c === 0 ? "left" : "right", vertical: "middle" };
      if (c === 3) cell.font = font({ color: { argb: C.green }, bold: true });
      if (c === 5 && (v as number) > 0) cell.font = font({ color: { argb: C.red }, bold: true });
      if (c === 7 || c === 9) cell.numFmt = PCT;
      if (c === 8) cell.numFmt = MONEY;
      if (i % 2 === 1) cell.fill = fill(C.zebra);
    });
    row.height = 18;
  });

  const legendRow = 7 + input.configs.length;
  const legend: [string, string, string][] = [
    ["At or above the channel's goal", C.green, C.greenFill],
    ["Profitable, below goal", C.amber, C.amberFill],
    ["Losing money", C.red, C.redFill],
  ];
  ws.getCell(legendRow, 1).value = "Net margin colors";
  ws.getCell(legendRow, 1).font = font({ bold: true });
  legend.forEach(([label, color, bg], i) => {
    const cell = ws.getCell(legendRow + 1 + i, 1);
    cell.value = label;
    cell.font = font({ color: { argb: color }, bold: true });
    cell.fill = fill(bg);
    cell.border = box;
  });
  const note = ws.getCell(legendRow + 5, 1);
  note.value =
    "Net margin is after fees, allocations, shipping and cost. Net $ is per order. Spread is the highest minus the lowest net margin across the channels, in percentage points.";
  note.font = font({ italic: true, color: { argb: C.muted } });
  ws.mergeCells(legendRow + 5, 1, legendRow + 5, cols.length);
  note.alignment = { wrapText: true, vertical: "top" };
  ws.getRow(legendRow + 5).height = 30;

  ws.columns = cols.map((_, i) => ({ width: i === 0 ? 30 : i === 6 ? 18 : 14 }));
  ws.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
}

function comparisonSheet(ws: Worksheet, input: ComparisonExportInput) {
  const lead = input.includeCost ? ["SKU", "Name", "Brand", "Inventory", "Cost"] : ["SKU", "Name", "Brand", "Inventory"];
  const per = ["Price", "Rec. price", "Net margin", "Net $"];
  const width = lead.length + input.configs.length * per.length + 2;
  titleBlock(ws, input, "Channel Comparison", width);

  const groupRow = ws.getRow(5);
  const headRow = ws.getRow(6);
  lead.forEach((label, i) => {
    ws.mergeCells(5, i + 1, 6, i + 1);
    headerCell(groupRow.getCell(i + 1), label, i < 4 ? "left" : "right");
  });
  input.configs.forEach((cfg, ci) => {
    const start = lead.length + ci * per.length + 1;
    ws.mergeCells(5, start, 5, start + per.length - 1);
    const g = groupRow.getCell(start);
    g.value = cfg.name;
    g.font = font({ bold: true, size: 11, color: { argb: C.groupText } });
    g.fill = fill(C.groupFill);
    g.alignment = { horizontal: "center", vertical: "middle" };
    for (let k = 0; k < per.length; k++) {
      groupRow.getCell(start + k).border = { ...box, left: k === 0 ? { style: "medium", color: { argb: C.primary } } : thin };
      headerCell(headRow.getCell(start + k), per[k], "right");
      if (k === 0) headRow.getCell(start + k).border = { ...headRow.getCell(start + k).border, left: { style: "medium", color: { argb: C.primary } } };
    }
  });
  const tail = lead.length + input.configs.length * per.length + 1;
  ws.mergeCells(5, tail, 6, tail);
  headerCell(groupRow.getCell(tail), "Spread", "right");
  ws.mergeCells(5, tail + 1, 6, tail + 1);
  headerCell(groupRow.getCell(tail + 1), "Best margin", "left");
  groupRow.getCell(tail + 1).alignment = { horizontal: "left", vertical: "middle", indent: 1 };
  groupRow.height = 20;
  headRow.height = 20;

  input.rows.forEach((row, i) => {
    const r = ws.getRow(7 + i);
    const zebra = i % 2 === 1 ? fill(C.zebra) : undefined;
    const results = Object.values(row.byChannel);
    const cost = results.find((x) => x.cost != null)?.cost ?? null;
    const lead: (string | number | null)[] = [row.sku, row.name, row.brand, row.disc ? "Discontinued" : results[0]?.invRaw ?? null];
    if (input.includeCost) lead.push(cost);
    lead.forEach((v, c) => {
      const cell = r.getCell(c + 1);
      cell.value = v;
      cell.font = font(c === 0 ? { bold: true, color: { argb: C.title } } : c === 3 && row.disc ? { color: { argb: C.red } } : {});
      if (c === 4) cell.numFmt = MONEY;
      cell.border = box;
      if (zebra) cell.fill = zebra;
    });

    const comparable = results.filter(priced);
    const best = comparable.length >= 2 ? comparable.reduce((a, b) => (b.gm > a.gm ? b : a)) : null;

    input.configs.forEach((cfg, ci) => {
      const start = lead.length + ci * per.length + 1;
      const res = row.byChannel[cfg.id];
      const cells = per.map((_, k) => r.getCell(start + k));
      cells.forEach((cell, k) => {
        cell.border = { ...box, left: k === 0 ? { style: "medium", color: { argb: C.primary } } : thin };
        cell.alignment = { horizontal: "right" };
        cell.font = font();
        if (zebra) cell.fill = zebra;
      });
      if (!res) {
        cells[0].value = "Not on channel";
        cells[0].font = font({ italic: true, color: { argb: C.gray } });
        ws.mergeCells(7 + i, start, 7 + i, start + per.length - 1);
        cells[0].alignment = { horizontal: "center" };
        return;
      }
      cells[0].value = res.price > 0 ? res.price : null;
      cells[0].numFmt = MONEY;
      cells[1].value = res.rec;
      cells[1].numFmt = MONEY;
      cells[1].font = font({ color: { argb: C.primary } });
      if (priced(res)) {
        const style = marginStyle(res);
        cells[2].value = res.gm;
        cells[2].numFmt = PCT;
        cells[2].font = font({ bold: true, color: { argb: style.color } });
        cells[3].value = res.net;
        cells[3].numFmt = MONEY;
        if (best === res) {
          cells[2].fill = fill(C.greenFill);
          cells[3].fill = fill(C.greenFill);
        }
      } else {
        cells[2].value = STATUS[res.status] ?? "-";
        cells[2].font = font({ italic: true, color: { argb: C.gray } });
      }
    });

    const spread = r.getCell(tail);
    spread.value = row.spread != null ? row.spread * 100 : null;
    spread.numFmt = PTS;
    spread.border = box;
    spread.font = font({ bold: row.spread != null && row.spread >= 0.1 });
    if (zebra) spread.fill = zebra;
    const bestCell = r.getCell(tail + 1);
    bestCell.value = best ? input.configs.find((c) => row.byChannel[c.id] === best)?.name ?? null : null;
    bestCell.font = font({ color: { argb: C.green } });
    bestCell.alignment = { horizontal: "left", indent: 1 };
    bestCell.border = box;
    if (zebra) bestCell.fill = zebra;
  });

  ws.columns = [
    { width: 16 },
    { width: 40 },
    { width: 16 },
    { width: 14 },
    ...(input.includeCost ? [{ width: 10 }] : []),
    ...input.configs.flatMap(() => [{ width: 11 }, { width: 11 }, { width: 11 }, { width: 10 }]),
    { width: 11 },
    { width: 22 },
  ];
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 6, showGridLines: false }];
  ws.autoFilter = { from: { row: 6, column: 1 }, to: { row: 6 + input.rows.length, column: tail + 1 } };
}

function detailSheet(ws: Worksheet, input: ComparisonExportInput) {
  const cols: { label: string; width: number; fmt?: string; value: (r: AnalysisResult, row: ComparisonExportRow, cfg: ChannelConfig) => unknown }[] = [
    { label: "Channel", width: 22, value: (_r, _row, cfg) => cfg.name },
    { label: "SKU", width: 16, value: (r) => r.sku },
    { label: "Name", width: 40, value: (r) => r.name ?? null },
    { label: "Brand", width: 16, value: (r) => r.brand ?? null },
    { label: "Inventory", width: 14, value: (r) => r.invRaw ?? null },
    ...(input.includeCost ? [{ label: "Cost", width: 10, fmt: MONEY, value: (r: AnalysisResult) => r.cost }] : []),
    { label: "Units", width: 7, value: (r) => r.units },
    { label: "List price", width: 11, fmt: MONEY, value: (r) => (r.price > 0 ? r.price : null) },
    { label: "Rec. price", width: 11, fmt: MONEY, value: (r) => r.rec },
    { label: "Change to rec.", width: 13, fmt: PCT, value: (r) => (r.price > 0 ? r.deltaPct : null) },
    { label: "Net margin", width: 11, fmt: PCT, value: (r) => (priced(r) ? r.gm : null) },
    { label: "Net $ / order", width: 12, fmt: MONEY, value: (r) => (priced(r) ? r.net : null) },
    { label: "Goal", width: 8, fmt: PCT, value: (r) => r.goalUsed },
    { label: "Rec. net margin", width: 14, fmt: PCT, value: (r) => r.recCalc?.gm ?? null },
    ...(input.includeCost
      ? [{ label: "Fees + allocations", width: 16, fmt: MONEY, value: (r: AnalysisResult) => (priced(r) ? r.cur.alloc : null) }]
      : []),
    { label: "Shipping / order", width: 14, fmt: MONEY, value: (r) => (r.hasShippingData ? r.ship : null) },
    { label: "Royalty from", width: 13, value: (r) => r.royFrom },
    { label: "Status", width: 14, value: (r) => STATUS[r.status] ?? r.status },
  ];

  const head = ws.getRow(1);
  cols.forEach((c, i) => headerCell(head.getCell(i + 1), c.label, i < 5 ? "left" : "right"));
  head.height = 22;

  let n = 2;
  for (const cfg of input.configs) {
    for (const row of input.rows) {
      const r = row.byChannel[cfg.id];
      if (!r) continue;
      const xr = ws.getRow(n);
      cols.forEach((c, i) => {
        const cell = xr.getCell(i + 1);
        cell.value = c.value(r, row, cfg) as never;
        cell.font = font();
        if (c.fmt) cell.numFmt = c.fmt;
        cell.border = box;
        if (n % 2 === 1) cell.fill = fill(C.zebra);
        if (c.label === "Net margin" && priced(r)) cell.font = font({ bold: true, color: { argb: marginStyle(r).color } });
        if (c.label === "Status") {
          const color = r.status === "pass" ? C.green : r.status === "loss" ? C.red : r.status === "below" ? C.amber : C.gray;
          cell.font = font({ color: { argb: color }, bold: true });
        }
      });
      n++;
    }
  }
  ws.columns = cols.map((c) => ({ width: c.width }));
  ws.views = [{ state: "frozen", xSplit: 2, ySplit: 1, showGridLines: false }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, n - 1), column: cols.length } };
}

/** Builds and downloads the Comparison tab as a formatted workbook: Summary, Comparison and Details sheets. */
export async function exportChannelComparison(input: ComparisonExportInput) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sympl Pricing Analysis";
  wb.created = new Date();

  const landscape = { orientation: "landscape" as const, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  summarySheet(wb.addWorksheet("Summary", { pageSetup: landscape, properties: { tabColor: { argb: C.primary } } }), input);
  comparisonSheet(wb.addWorksheet("Comparison", { pageSetup: { ...landscape, printTitlesRow: "5:6" } }), input);
  detailSheet(wb.addWorksheet("Details", { pageSetup: { ...landscape, printTitlesRow: "1:1" } }), input);

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeFileName(input.reportName)}_channel-comparison_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
