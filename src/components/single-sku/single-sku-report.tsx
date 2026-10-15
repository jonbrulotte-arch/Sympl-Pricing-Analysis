"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, FileSpreadsheet, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SkuDetailPanel } from "@/components/analysis/sku-detail-panel";
import { useBranding } from "@/components/branding/branding";
import { exportSingleSkuReport, type SingleSkuChannelReport, type SingleSkuReportInput } from "@/lib/export/single-sku-report";
import type { FieldUiDef } from "@/lib/pricing/constants";
import { cn } from "@/lib/utils";

const STATUS: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "secondary"; bar: string; text: string }> = {
  pass: { label: "At goal", variant: "success", bar: "bg-green-500", text: "text-green-600" },
  below: { label: "Below goal", variant: "warning", bar: "bg-amber-400", text: "text-amber-600" },
  loss: { label: "Losing money", variant: "destructive", bar: "bg-red-500", text: "text-red-600" },
  unpriced: { label: "No list price", variant: "secondary", bar: "bg-gray-300", text: "text-gray-500" },
  invalid: { label: "Missing cost", variant: "secondary", bar: "bg-gray-300", text: "text-gray-500" },
};

const money = (v: number | null | undefined) => (v == null ? "—" : `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`);
const pct = (v: number | null | undefined, digits = 1) => (v == null ? "—" : `${(v * 100).toFixed(digits)}%`);

function fieldValue(field: FieldUiDef, v: unknown): string {
  if (field.type === "check") return v ? "Yes" : "No";
  if (field.type === "select") return field.opts?.find(([k]) => k === v)?.[1] ?? String(v ?? "—");
  const n = typeof v === "number" ? v : parseFloat(String(v ?? ""));
  if (!isFinite(n)) return "—";
  return field.unit === "$" ? `$${n.toFixed(2)}` : field.unit === "%" ? `${n}%` : String(n);
}

/**
 * A print-ready, visual Single SKU Analysis report in a full-screen preview. "Save as PDF" uses the browser's
 * print dialog; while the preview is open only the report prints (see the print rules in globals.css).
 */
export function SingleSkuReport({ input, onClose }: { input: SingleSkuReportInput; onClose: () => void }) {
  useEffect(() => {
    document.body.classList.add("printing-report");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.classList.remove("printing-report");
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const multi = input.channels.length > 1;

  return createPortal(
    <div className="print-report-root fixed inset-0 z-50 overflow-y-auto bg-gray-100" role="dialog" aria-label="Report preview">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-6 py-3 print:hidden">
        <div>
          <p className="text-sm font-semibold text-gray-900">Report preview</p>
          <p className="text-xs text-gray-500">Choose &ldquo;Save as PDF&rdquo; as the destination in the print dialog to save a file.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => exportSingleSkuReport(input)}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            Download spreadsheet
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="h-4 w-4 mr-1.5" />
            Save as PDF / Print
          </Button>
          <Button variant="outline" size="sm" onClick={onClose} aria-label="Close preview">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="mx-auto max-w-[1060px] space-y-6 py-6 print:max-w-none print:space-y-0 print:py-0">
        {multi && (
          <Page>
            <ReportHeader input={input} title="All channels" />
            <Summary input={input} />
          </Page>
        )}
        {input.channels.map((ch, i) => (
          <Page key={ch.cfg.id} breakBefore={multi || i > 0}>
            <ChannelReport input={input} ch={ch} />
          </Page>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function Page({ children, breakBefore }: { children: React.ReactNode; breakBefore?: boolean }) {
  return (
    <section className={cn("bg-white p-8 shadow-sm print:p-0 print:shadow-none", breakBefore && "print-break")}>{children}</section>
  );
}

function ReportHeader({ input, title, status }: { input: SingleSkuReportInput; title: string; status?: string }) {
  const brand = useBranding();
  const s = status ? STATUS[status] : null;
  const { product } = input;
  return (
    <div className="mb-6 border-b border-gray-200 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{brand.name ? `${brand.name} · ` : ""}Single SKU Analysis</p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold text-gray-900">
            {title}
            {s && <Badge variant={s.variant}>{s.label}</Badge>}
          </h1>
          <p className="mt-1 text-sm text-gray-600">
            <span className="font-mono font-medium text-gray-900">{product.sku}</span>
            {product.isNew && <span className="ml-1 text-xs text-blue-600">(new SKU)</span>}
            {product.name && <> · {product.name}</>}
            {product.brand && <> · {product.brand}</>}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-0.5 text-right text-xs">
          <dt className="text-gray-500">Customer</dt>
          <dd className="font-medium text-gray-900">{input.customerName}</dd>
          <dt className="text-gray-500">Unit cost</dt>
          <dd className="font-medium text-gray-900">{input.includeCost ? money(input.cost) : "Hidden"}</dd>
          <dt className="text-gray-500">Units per order</dt>
          <dd className="font-medium text-gray-900">{input.units}</dd>
          <dt className="text-gray-500">Generated</dt>
          <dd className="font-medium text-gray-900">{new Date().toLocaleString()}</dd>
        </dl>
      </div>
    </div>
  );
}

function Summary({ input }: { input: SingleSkuReportInput }) {
  const maxGm = Math.max(0.0001, ...input.channels.map((c) => Math.abs(c.result.gm)));
  return (
    <div>
      <h2 className="mb-3 text-base font-semibold text-gray-900">Channel comparison</h2>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-600">
            <th className="px-3 py-2 text-left font-medium">Channel</th>
            <th className="px-3 py-2 text-right font-medium">List price</th>
            <th className="px-3 py-2 text-left font-medium w-[28%]">Net margin</th>
            <th className="px-3 py-2 text-right font-medium">Net $ / order</th>
            <th className="px-3 py-2 text-left font-medium">Status</th>
            <th className="px-3 py-2 text-right font-medium">Recommended</th>
            <th className="px-3 py-2 text-right font-medium">Change</th>
          </tr>
        </thead>
        <tbody>
          {input.channels.map(({ cfg, result: r }) => {
            const s = STATUS[r.status] ?? STATUS.invalid;
            const priced = r.price > 0 && !r.invalid;
            return (
              <tr key={cfg.id} className="border-b border-gray-100">
                <td className="px-3 py-2.5 font-medium text-gray-900">{cfg.name}</td>
                <td className="px-3 py-2.5 text-right font-mono">{r.price > 0 ? money(r.price) : "—"}</td>
                <td className="px-3 py-2.5">
                  {priced ? (
                    <div className="flex items-center gap-2">
                      <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                        <div className={cn("h-full rounded-full", s.bar)} style={{ width: `${Math.max(2, (Math.abs(r.gm) / maxGm) * 100)}%` }} />
                        <div className="absolute inset-y-0 w-px bg-gray-500" style={{ left: `${Math.min(100, (r.goalUsed / maxGm) * 100)}%` }} title="Goal" />
                      </div>
                      <span className={cn("w-12 text-right text-xs font-semibold", s.text)}>{pct(r.gm)}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                <td className={cn("px-3 py-2.5 text-right font-mono", priced && r.net < 0 && "text-red-600")}>{priced ? money(r.net) : "—"}</td>
                <td className="px-3 py-2.5"><Badge variant={s.variant}>{s.label}</Badge></td>
                <td className="px-3 py-2.5 text-right font-mono text-blue-600">{money(r.rec)}</td>
                <td className="px-3 py-2.5 text-right text-xs">{r.deltaPct != null ? `${r.deltaPct > 0 ? "+" : ""}${(r.deltaPct * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-500">The line on each margin bar marks the channel&apos;s goal. Each channel has its own page with the full breakdown.</p>
    </div>
  );
}

function ChannelReport({ input, ch }: { input: SingleSkuReportInput; ch: SingleSkuChannelReport }) {
  const r = ch.result;
  const priced = r.price > 0 && !r.invalid;
  const edited = ch.allocations.filter((a) => String(a.value ?? "") !== String(a.channelValue ?? ""));

  return (
    <div>
      <ReportHeader input={input} title={ch.cfg.name} status={r.status} />

      <div className="mb-4 grid grid-cols-5 gap-3">
        <Kpi label="List price" value={r.price > 0 ? money(r.price) : "—"} />
        <Kpi label="Net margin" value={priced ? pct(r.gm) : "—"} tone={r.status} />
        <Kpi label="Net $ per order" value={priced ? money(r.net) : "—"} tone={r.status} />
        <Kpi label={`Recommended (${pct(r.goalUsed, 0)} goal)`} value={money(r.rec)} accent />
        <Kpi
          label="Target profit / unit"
          value={money(r.targetProfit)}
          sub={r.price > 0 ? (r.hitsTarget ? "Met" : "Not met") : undefined}
          subTone={r.hitsTarget ? "text-green-600" : "text-red-600"}
        />
      </div>

      {ch.warnings.map((w) => (
        <div key={w} className="mb-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {w}
        </div>
      ))}

      <div className="print-avoid-break">
        {r.invalid ? (
          <Empty text="This SKU has no unit cost, so it can't be analyzed." />
        ) : input.includeCost ? (
          <SkuDetailPanel result={r} cfg={ch.cfg} settings={ch.settings} canViewCost />
        ) : (
          <Empty text="The fee breakdown is left out because your role can't see unit cost." />
        )}
      </div>

      {/* Details start on their own printed page, with a heading so the page stands on its own. */}
      <div className="print-break mt-6 mb-3 flex items-baseline justify-between gap-3 border-b border-gray-200 pb-2">
        <h2 className="text-base font-semibold text-gray-900">{ch.cfg.name}: details</h2>
        <p className="text-xs text-gray-500">
          <span className="font-mono">{input.product.sku}</span>
          {input.product.name && <> · {input.product.name}</>} · {input.customerName}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 print-avoid-break">
        <Table
          title="List price vs. recommended price"
          head={["", "List price", "Recommended"]}
          rows={[
            ["Price", r.price > 0 ? money(r.price) : "—", money(r.rec)],
            ["Net margin", priced ? pct(r.gm) : "—", pct(r.recCalc?.gm)],
            ["Net $ per order", priced ? money(r.net) : "—", money(r.recCalc?.net)],
            ...(input.includeCost ? [["Fees and allocations", priced ? money(-r.cur.alloc) : "—", r.recCalc ? money(-r.recCalc.alloc) : "—"]] : []),
            ["Change", "", r.delta != null && r.price > 0 ? `${money(r.delta)} (${r.deltaPct != null ? `${r.deltaPct > 0 ? "+" : ""}${(r.deltaPct * 100).toFixed(1)}%` : "—"})` : "—"],
          ]}
        />
        <Table
          title="Inputs"
          head={["", "Value"]}
          rows={[
            ["Unit cost", input.includeCost ? money(input.cost) : "Hidden"],
            ["List price", r.price > 0 ? money(r.price) : "—"],
            ["Units per order", String(input.units)],
            ...ch.shipping.map((s) => [`${s.label} (per unit)`, money(s.value)]),
            ...(ch.cfg.flags.comm
              ? [[`${ch.cfg.flags.commSku ? "Referral fee" : "Commission"} rate`, `${pct(r.commR, 2)}${r.commFrom === "itemType" ? " (item type)" : r.commFrom === "sheet" ? " (per SKU)" : ""}`]]
              : []),
            ["Royalty source", r.royFrom],
          ]}
        />
      </div>

      <div className="mt-4 print-avoid-break">
        <h3 className="mb-2 text-sm font-semibold text-gray-900">
          Allocations
          <span className="ml-2 text-xs font-normal text-gray-500">
            {edited.length ? `${edited.length} changed from the channel's settings` : "All at the channel's settings"}
          </span>
        </h3>
        <div className="grid grid-cols-2 gap-x-6 rounded-md border border-gray-200 px-3 py-1">
          {ch.allocations.map(({ field, value, channelValue }) => {
            const changed = String(value ?? "") !== String(channelValue ?? "");
            return (
              <div key={field.key} className="flex items-center justify-between gap-3 border-b border-gray-100 py-1.5 text-xs last:border-0">
                <span className="text-gray-600">{field.label}</span>
                <span className="text-right">
                  <span className={cn("font-medium", changed ? "text-blue-700" : "text-gray-900")}>{fieldValue(field, value)}</span>
                  {changed && <span className="ml-1.5 text-gray-400">(channel: {fieldValue(field, channelValue)})</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, accent, sub, subTone }: { label: string; value: string; tone?: string; accent?: boolean; sub?: string; subTone?: string }) {
  const color = accent ? "text-blue-600" : tone ? (STATUS[tone]?.text ?? "text-gray-900") : "text-gray-900";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={cn("text-xl font-bold", color)}>{value}</p>
      {sub && <p className={cn("text-xs font-medium", subTone)}>{sub}</p>}
    </div>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">{title}</h3>
      <table className="w-full overflow-hidden rounded-md border border-gray-200 text-xs">
        <thead>
          <tr className="bg-gray-50 text-gray-600">
            {head.map((h, i) => (
              <th key={i} className={cn("px-3 py-1.5 font-medium", i === 0 ? "text-left" : "text-right")}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100">
              {row.map((cell, j) => (
                <td key={j} className={cn("px-3 py-1.5", j === 0 ? "text-gray-600" : "text-right font-mono text-gray-900")}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-sm text-gray-500">{text}</div>;
}
