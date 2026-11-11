import { Fragment } from "react";
import { cn } from "@/lib/utils";
import type { RetailComparison, RetailScenario } from "@/lib/single-sku";

const money = (v: number | null | undefined) => (v == null ? "-" : `${v < 0 ? "-" : ""}$${Math.abs(v).toFixed(2)}`);
const pct = (v: number | null | undefined) => (v == null ? "-" : `${(v * 100).toFixed(1)}%`);
const tone = (v: number | null | undefined) => (v == null ? "text-gray-400" : v < 0 ? "text-red-600" : "text-gray-900");

/**
 * Commercial / Retail channels: our net margin and the customer's gross and estimated net margin, at our list price
 * and (with a promotional discount) during the promotion, side by side. Per unit.
 */
export function RetailComparisonCard({ comparison, customerName }: { comparison: RetailComparison; customerName: string }) {
  const { regular, promotion, promo } = comparison;
  if (!regular) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-4 text-sm text-gray-500">
        Enter a list price to compare our margins with {customerName}&apos;s.
      </div>
    );
  }
  const columns: { label: string; s: RetailScenario }[] = [
    { label: "Regular", s: regular },
    ...(promotion && promo != null ? [{ label: `Promotion (−${+(promo * 100).toFixed(2)}%)`, s: promotion }] : []),
  ];
  const hasCustomer = !!regular.customer;
  const fulfillment = regular.customer?.fulfillment ?? 0;

  const rows: { label: string; hint?: string; group: "ours" | "customer"; cell: (s: RetailScenario) => React.ReactNode }[] = [
    { label: "Our price", hint: "the customer's cost", group: "ours", cell: (s) => <span className="font-mono">{money(s.ourPrice)}</span> },
    {
      label: "Our net margin",
      group: "ours",
      cell: (s) => (
        <span className={cn("font-mono font-semibold", tone(s.ourNetMargin))}>
          {pct(s.ourNetMargin)}
          <span className="block text-[11px] font-normal text-gray-500">{money(s.ourNet)} / unit</span>
        </span>
      ),
    },
    ...(hasCustomer
      ? ([
          {
            label: "Customer selling price",
            group: "customer",
            cell: (s: RetailScenario) => <span className="font-mono">{money(s.customer?.sellingPrice)}</span>,
          },
          {
            label: "Customer gross margin",
            hint: "selling price − our price",
            group: "customer",
            cell: (s: RetailScenario) => (
              <span className={cn("font-mono font-semibold", tone(s.customer?.grossMargin))}>
                {pct(s.customer?.grossMargin)}
                <span className="block text-[11px] font-normal text-gray-500">{money(s.customer?.gross)} / unit</span>
              </span>
            ),
          },
          {
            label: "Customer est. net margin",
            hint: fulfillment > 0 ? `after ${money(fulfillment)} fulfillment` : "no fulfillment cost entered",
            group: "customer",
            cell: (s: RetailScenario) => (
              <span className={cn("font-mono font-semibold", tone(s.customer?.netMargin))}>
                {pct(s.customer?.netMargin)}
                <span className="block text-[11px] font-normal text-gray-500">{money(s.customer?.net)} / unit</span>
              </span>
            ),
          },
        ] as const)
      : []),
  ];

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="px-4 pt-3 pb-2">
        <p className="text-sm font-semibold text-gray-900">Our margins vs {customerName}&apos;s</p>
        <p className="text-xs text-gray-500">Per unit.{promotion ? " During the promotion the customer's selling price drops by the same %." : ""}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-y border-gray-200 bg-gray-50 text-xs text-gray-600">
            <th className="text-left py-2 px-4 font-medium" />
            {columns.map((c) => (
              <th key={c.label} className={cn("text-right py-2 px-4 font-medium", c.label !== "Regular" && "text-blue-700")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <Fragment key={r.label}>
              {r.group !== rows[i - 1]?.group && (
                <tr>
                  <td colSpan={columns.length + 1} className="pt-3 pb-1 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    {r.group === "ours" ? "Us" : customerName}
                  </td>
                </tr>
              )}
              <tr className="border-b border-gray-50 align-top">
                <td className="py-2 px-4 text-gray-700">
                  {r.label}
                  {r.hint && <span className="block text-[11px] text-gray-400">{r.hint}</span>}
                </td>
                {columns.map((c) => (
                  <td key={c.label} className={cn("py-2 px-4 text-right", c.label !== "Regular" && "bg-blue-50/40")}>
                    {r.cell(c.s)}
                  </td>
                ))}
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
      {!hasCustomer && (
        <p className="px-4 py-2 text-xs text-gray-500">Enter the customer&apos;s selling price to see their margins.</p>
      )}
    </div>
  );
}
