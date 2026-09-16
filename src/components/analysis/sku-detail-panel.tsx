import type { AnalysisResult, ChannelConfig, ChannelDefaults } from "@/lib/pricing/types";
import { computeRates } from "@/lib/pricing/engine";

interface Props {
  result: AnalysisResult;
  cfg: ChannelConfig;
  settings: ChannelDefaults;
  onShowMath: () => void;
}

export function SkuDetailPanel({ result: r, cfg, settings, onShowMath }: Props) {
  const rates = computeRates(cfg, settings);
  const revenue = r.price * r.units;
  const costTotal = (r.cost ?? 0) * r.units;
  const cur = r.cur;

  const segments = revenue > 0
    ? [
        { label: "Cost", value: costTotal, color: "bg-slate-600" },
        { label: "Fees + alloc", value: cur.alloc, color: "bg-slate-400" },
        { label: "Shipping", value: r.ship, color: "bg-slate-200" },
        { label: "Net", value: cur.net, color: cur.net >= 0 ? "bg-green-600" : "bg-red-600" },
      ]
    : [];

  const goalPct = r.goalUsed * 100;
  const gmPct = r.gm * 100;
  const spare = gmPct - goalPct;

  let goalMessage: string;
  if (r.invalid) {
    goalMessage = "Cost is missing or zero — this SKU cannot be analyzed.";
  } else if (r.unpriced) {
    goalMessage = "No price set for this channel yet.";
  } else if (r.status === "pass") {
    goalMessage = `Clears the ${goalPct.toFixed(0)}% goal with ${spare.toFixed(1)}% to spare.`;
  } else if (r.status === "below") {
    goalMessage = `Falls short of the ${goalPct.toFixed(0)}% goal by ${Math.abs(spare).toFixed(1)}%.`;
  } else {
    goalMessage = `Selling at a loss of $${Math.abs(r.net).toFixed(2)}.`;
  }

  const targetMessage = ` Target profit of $${r.targetProfit.toFixed(2)} is ${r.hitsTarget ? "met" : "not met"}.`;
  const stockMessage = r.avail != null ? ` ${r.avail} units on hand.` : "";

  const tags: { label: string; value?: string | null }[] = [
    { label: "Brand", value: r.brand },
    { label: "Item Type", value: r.amzItemType },
    { label: "FBA Class", value: r.fbaClass },
    { label: "ERP Status", value: r.invRaw },
  ];

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 grid md:grid-cols-2 gap-6">
      {/* Left: waterfall + message + tags */}
      <div>
        <p className="text-sm font-semibold text-gray-900 mb-3">
          Where the {cfg.tabLabel} list price goes
        </p>

        {segments.length > 0 && (
          <>
            <div className="flex h-6 rounded overflow-hidden">
              {segments.map((s) => (
                <div
                  key={s.label}
                  className={s.color}
                  style={{ width: `${Math.max(0, (s.value / revenue) * 100)}%` }}
                  title={`${s.label}: $${s.value.toFixed(2)}`}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-gray-600">
              {segments.map((s) => (
                <span key={s.label} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-sm ${s.color}`} />
                  {s.label} ${s.value.toFixed(2)}
                </span>
              ))}
            </div>
          </>
        )}

        <div className="mt-3 bg-blue-50 border border-blue-200 rounded p-3 text-xs text-gray-700">
          {goalMessage}
          {!r.invalid && !r.unpriced && targetMessage}
          {stockMessage}
        </div>

        {tags.some((t) => t.value) && (
          <div className="flex flex-wrap gap-2 mt-3">
            {tags.filter((t) => t.value).map((t) => (
              <div key={t.label} className="text-center px-2 py-1 rounded border border-gray-200 bg-white">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide">{t.label}</p>
                <p className="text-xs text-gray-900">{t.value}</p>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onShowMath}
          className="mt-3 text-xs px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-100"
        >
          Show the math for this SKU
        </button>
      </div>

      {/* Right: fee ledger */}
      <div>
        <p className="text-sm font-semibold text-gray-900 mb-3 text-right">
          Fee ledger, per order of {r.units} unit{r.units !== 1 ? "s" : ""}
        </p>
        <table className="w-full text-xs">
          <tbody>
            <LedgerRow label={`List price × ${r.units} unit${r.units !== 1 ? "s" : ""}`} value={r.price} bold />
            {cfg.flags.coupon && (
              <LedgerRow label={`Coupon discount (${(rates.c * 100).toFixed(1)}% of list)`} value={-cur.coupon} />
            )}
            {cfg.flags.tax && (
              <>
                <LedgerRow label={`Sales tax (${(rates.t * 100).toFixed(2)}%, passed through)`} value={cur.tax} />
                <LedgerRow label="Sold price (fee base, includes tax)" value={cur.sold} bold />
              </>
            )}
            <LedgerRow label={`Category commission (${(r.commR * 100).toFixed(2)}%)`} value={-cur.comm} />
            {cfg.flags.tsd && (
              <LedgerRow label={`Top seller discount (${(rates.tsd * 100).toFixed(1)}% of the fee, credited back)`} value={cur.tsd} />
            )}
            {cur.fvfFixed > 0 && <LedgerRow label="Final value fee, fixed" value={-cur.fvfFixed} />}
            {cfg.flags.promo && (
              <LedgerRow label={`Promoted listing fee (${(rates.promo * 100).toFixed(1)}%)`} value={-cur.promo} />
            )}
            {cfg.flags.cc && (
              <>
                <LedgerRow label={`CC processing (${(rates.ccPct * 100).toFixed(1)}%)`} value={-cur.ccVar} />
                {cur.ccFlat > 0 && <LedgerRow label="CC flat fee" value={-cur.ccFlat} />}
              </>
            )}
            <LedgerRow label={`Returns and warranty (${(rates.ret * 100).toFixed(1)}% of sale)`} value={-cur.ret} />
            {cfg.flags.ad && (
              <LedgerRow label={`Advertising (${(rates.ad * 100).toFixed(1)}%)`} value={-cur.ad} />
            )}
            {rates.netTerms > 0 && (
              <LedgerRow label={`Net Terms (${(rates.netTerms * 100).toFixed(1)}%)`} value={-cur.netTerms} />
            )}
            {rates.otherAlloc > 0 && (
              <LedgerRow label={`Additional allocations (${(rates.otherAlloc * 100).toFixed(1)}%)`} value={-cur.otherAlloc} />
            )}
            <LedgerRow label={`Royalty (${r.royFrom})`} value={-cur.roy} />
            {cfg.flags.ppc && <LedgerRow label="PPC fee" value={-r.ppcUsed} />}
            <LedgerRow label="Total fees and allocations" value={-cur.alloc} bold border />
            {r.hasShippingData && <LedgerRow label="Shipping cost" value={-r.ship} />}
            <LedgerRow label={`SKU cost × ${r.units}`} value={-costTotal} />
            <LedgerRow
              label="Net margin"
              value={cur.net}
              bold
              border
              valueClassName={cur.net >= 0 ? "text-green-600" : "text-red-600"}
              suffix={`${gmPct.toFixed(1)}%`}
            />
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LedgerRow({
  label,
  value,
  bold,
  border,
  valueClassName,
  suffix,
}: {
  label: string;
  value: number;
  bold?: boolean;
  border?: boolean;
  valueClassName?: string;
  suffix?: string;
}) {
  return (
    <tr className={`${border ? "border-t border-gray-200" : ""} ${bold ? "font-semibold" : ""}`}>
      <td className="py-1 text-gray-600">{label}</td>
      <td className={`py-1 text-right font-mono ${valueClassName ?? (value < 0 ? "text-red-600" : "text-gray-900")}`}>
        {value < 0 ? "-" : ""}${Math.abs(value).toFixed(2)}
      </td>
      {suffix && <td className="py-1 text-right text-gray-500 pl-2">{suffix}</td>}
    </tr>
  );
}
