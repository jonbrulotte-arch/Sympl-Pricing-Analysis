"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult, ChannelConfig, ChannelDefaults, RateTuple, VerificationCheck } from "@/lib/pricing/types";
import { computeRates, computeFeeRate, forwardPass, solveGoalPrice } from "@/lib/pricing/engine";
import { verifyAnalysis } from "@/lib/pricing/verify";
import { roundUp } from "@/lib/pricing/helpers";

interface Props {
  results: Record<string, AnalysisResult[]>;
  configs: ChannelConfig[];
  settingsMap: Record<string, Record<string, unknown>>;
  initialChannelId?: string;
  initialSku?: string;
}

export function CalculationCheck({ results, configs, settingsMap, initialChannelId, initialSku }: Props) {
  const [selectedChannel, setSelectedChannel] = useState(initialChannelId ?? configs[0]?.id ?? "");
  const [selectedSku, setSelectedSku] = useState(initialSku ?? "");

  const channelResults = results[selectedChannel] ?? [];
  const skus = channelResults.filter((r) => !r.invalid && r.price > 0);

  const selected = useMemo(() => {
    if (!selectedSku) return skus[0] ?? null;
    return skus.find((r) => r.sku === selectedSku) ?? skus[0] ?? null;
  }, [skus, selectedSku]);

  const cfg = configs.find((c) => c.id === selectedChannel);
  const settings = (settingsMap[selectedChannel] ?? {}) as unknown as ChannelDefaults;

  const rates = cfg ? computeRates(cfg, settings) : null;

  const checks = useMemo(() => {
    if (!selected || !rates) return [];
    return verifyAnalysis(
      selected.price, rates, selected.commR, selected.royRate, selected.royFlat,
      selected.fvfFixedUsed, selected.ppcUsed, selected.units, selected.ship,
      selected.cost ?? 0, selected.goalUsed, selected.cur,
      selected.rec, selected.recCalc,
    );
  }, [selected, rates]);

  const k = rates && selected ? computeFeeRate(rates, selected.commR, selected.royRate) : 0;

  if (!cfg || !selected || !rates) {
    return <div className="text-center py-8 text-gray-500">Select a channel with priced products to view calculations.</div>;
  }

  const P = selected.price;
  const cur = selected.cur;

  return (
    <div className="space-y-4">
      {/* Selectors */}
      <div className="flex gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Channel</label>
          <select
            value={selectedChannel}
            onChange={(e) => { setSelectedChannel(e.target.value); setSelectedSku(""); }}
            className="border rounded px-2 py-1.5 text-sm"
          >
            {configs.map((c) => <option key={c.id} value={c.id}>{c.tabLabel}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">SKU</label>
          <select
            value={selectedSku || selected.sku}
            onChange={(e) => setSelectedSku(e.target.value)}
            className="border rounded px-2 py-1.5 text-sm max-w-xs"
          >
            {skus.map((r) => <option key={r.sku} value={r.sku}>{r.sku} — {r.name ?? ""}</option>)}
          </select>
        </div>
      </div>

      {/* Inputs */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Inputs</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <InputRow label="List price" value={`$${P.toFixed(2)}`} />
            <InputRow label="Cost" value={`$${(selected.cost ?? 0).toFixed(2)}`} />
            <InputRow label="Units" value={selected.units.toString()} />
            <InputRow label="Shipping" value={`$${selected.ship.toFixed(2)}`} />
            <InputRow label="Commission" value={`${(selected.commR * 100).toFixed(2)}%`} from={selected.commFrom} />
            <InputRow label="Royalty rate" value={`${(selected.royRate * 100).toFixed(2)}%`} from={selected.royFrom} />
            <InputRow label="Royalty flat" value={`$${selected.royFlat.toFixed(2)}`} />
            <InputRow label="PPC" value={`$${selected.ppcUsed.toFixed(2)}`} />
            <InputRow label="FVF fixed" value={`$${selected.fvfFixedUsed.toFixed(2)}`} />
            <InputRow label="Goal" value={`${(selected.goalUsed * 100).toFixed(1)}%`} />
            <InputRow label="Fee rate k" value={k.toFixed(6)} />
          </div>
        </CardContent>
      </Card>

      {/* Forward Calculation Steps */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Forward Calculation at ${P.toFixed(2)}</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500 text-xs">
                <th className="text-left py-1">#</th>
                <th className="text-left py-1">Step</th>
                <th className="text-right py-1">Per unit</th>
                <th className="text-right py-1">Total</th>
              </tr>
            </thead>
            <tbody>
              <Step n={1} label="List price" per={P} units={selected.units} />
              <Step n={2} label={`Coupon (${(rates.c * 100).toFixed(1)}%)`} per={cur.coupon} units={selected.units} neg />
              <Step n={3} label="Sale base (post-coupon)" per={cur.saleBase} units={selected.units} bold />
              {rates.t > 0 && <Step n={4} label={`Sales tax (${(rates.t * 100).toFixed(2)}%)`} per={cur.tax} units={selected.units} />}
              {rates.t > 0 && <Step n={5} label="Sold price (incl. tax)" per={cur.sold} units={selected.units} bold />}
              <Step n={6} label={`Commission on ${rates.t > 0 ? "sold" : "sale"} (${(selected.commR * 100).toFixed(2)}%)`} per={cur.comm} units={selected.units} neg />
              {rates.tsd > 0 && <Step n={7} label={`Top seller disc (${(rates.tsd * 100).toFixed(1)}%)`} per={cur.tsd} units={selected.units} />}
              <Step n={8} label="FVF (net commission)" per={cur.fvfRate} units={selected.units} neg />
              {cur.fvfFixed > 0 && <Step n={9} label="FVF fixed" per={cur.fvfFixed} units={selected.units} neg />}
              {cur.promo > 0 && <Step n={10} label="Promoted listing" per={cur.promo} units={selected.units} neg />}
              {cur.ccVar > 0 && <Step n={11} label="CC processing" per={cur.ccVar} units={selected.units} neg />}
              {cur.ccFlat > 0 && <Step n={12} label="CC flat fee" per={cur.ccFlat} units={1} neg />}
              <Step n={13} label="Returns allocation" per={cur.ret} units={selected.units} neg />
              {cur.ad > 0 && <Step n={14} label="Advertising" per={cur.ad} units={selected.units} neg />}
              <Step n={15} label="Royalty" per={cur.roy} units={selected.units} neg />
              <Step n={16} label="PPC" per={selected.ppcUsed} units={1} neg />
              <tr className="border-t font-medium">
                <td className="py-1">17</td>
                <td>Total fees + allocations</td>
                <td className="text-right">${cur.alloc.toFixed(2)}</td>
                <td className="text-right">${cur.alloc.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1">18</td>
                <td>Revenue</td>
                <td colSpan={2} className="text-right">${cur.revenue.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1">19</td>
                <td>Cost ({selected.units}U)</td>
                <td colSpan={2} className="text-right text-red-600">-${((selected.cost ?? 0) * selected.units).toFixed(2)}</td>
              </tr>
              <tr className="border-t font-bold">
                <td className="py-1">20</td>
                <td>Net margin</td>
                <td colSpan={2} className={`text-right ${cur.net >= 0 ? "text-green-600" : "text-red-600"}`}>
                  ${cur.net.toFixed(2)}
                </td>
              </tr>
              <tr className="font-bold">
                <td className="py-1">21</td>
                <td>Net GM%</td>
                <td colSpan={2} className="text-right">{(cur.gm * 100).toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Fee rate k decomposition */}
      <Card>
        <CardHeader><CardTitle className="text-sm">Fee Rate k Decomposition</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500 text-xs">
                <th className="text-left py-1">Component</th>
                <th className="text-right py-1">Rate</th>
                <th className="text-right py-1">Per $1 of list</th>
              </tr>
            </thead>
            <tbody>
              <KRow label="Coupon" value={rates.c} />
              {rates.t > 0 && <KRow label="Tax amplification factor" value={null} note={`grossUp = ${((1 - rates.c) * (1 + rates.t)).toFixed(6)}`} />}
              <KRow label="Commission (net of TSD)" value={(1 - rates.c) * (1 + rates.t) * selected.commR * (1 - rates.tsd)} />
              {rates.promo > 0 && <KRow label="Promoted listing" value={(1 - rates.c) * (1 + rates.t) * rates.promo} />}
              {selected.royRate > 0 && <KRow label="Royalty %" value={(1 - rates.c) * selected.royRate} />}
              {rates.ccPct > 0 && <KRow label="CC processing" value={(1 - rates.c) * rates.ccPct} />}
              <KRow label="Returns" value={(1 - rates.c) * rates.ret} />
              {rates.ad > 0 && <KRow label="Advertising" value={(1 - rates.c) * rates.ad} />}
              <tr className="border-t font-medium">
                <td className="py-1">Total k</td>
                <td className="text-right">{(k * 100).toFixed(4)}%</td>
                <td className="text-right">${k.toFixed(6)}</td>
              </tr>
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Goal price solve */}
      {selected.rec != null && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Goal Price Solve</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-2">
            <p className="text-gray-600">
              Solve for price P where net GM% = {(selected.goalUsed * 100).toFixed(1)}%:
            </p>
            <div className="bg-gray-50 rounded p-3 font-mono text-xs space-y-1">
              <p>denom = 1 - k - goal = 1 - {k.toFixed(6)} - {selected.goalUsed.toFixed(4)} = {(1 - k - selected.goalUsed).toFixed(6)}</p>
              <p>flatUnit = fvfFixed + royFlat = {selected.fvfFixedUsed.toFixed(2)} + {selected.royFlat.toFixed(2)} = {(selected.fvfFixedUsed + selected.royFlat).toFixed(2)}</p>
              <p>flatOrder = ccFlat + ppc = {rates.ccFlat.toFixed(2)} + {selected.ppcUsed.toFixed(2)} = {(rates.ccFlat + selected.ppcUsed).toFixed(2)}</p>
              <p>P = (cost*U + ship + flatUnit*U + flatOrder) / (U * denom)</p>
              <p>P = ({((selected.cost ?? 0) * selected.units + selected.ship + (selected.fvfFixedUsed + selected.royFlat) * selected.units + rates.ccFlat + selected.ppcUsed).toFixed(4)}) / ({(selected.units * (1 - k - selected.goalUsed)).toFixed(6)})</p>
              {(() => {
                const { price: rawP } = solveGoalPrice(
                  selected.cost ?? 0, selected.units, selected.ship, k, selected.goalUsed,
                  selected.fvfFixedUsed + selected.royFlat, rates.ccFlat + selected.ppcUsed,
                );
                return (
                  <>
                    <p>P = ${rawP.toFixed(6)} (raw)</p>
                    <p>Rounded ({rates.round}): <strong>${selected.rec!.toFixed(2)}</strong></p>
                    {selected.recCalc && <p>GM% at rounded: <strong>{(selected.recCalc.gm * 100).toFixed(2)}%</strong></p>}
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tax pass-through cost (eBay only) */}
      {rates.t > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Tax Pass-Through Cost</CardTitle></CardHeader>
          <CardContent className="text-sm text-gray-600 space-y-2">
            <p>
              This channel collects sales tax at {(rates.t * 100).toFixed(2)}%. While the tax itself is passed
              through to the government, it amplifies marketplace fees because commission and promoted listing
              fees are billed on the &ldquo;sold price&rdquo; (sale + tax), not just the sale price.
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs font-mono">
              <p>Without tax: fees on ${cur.saleBase.toFixed(2)} sale</p>
              <p>With tax: fees on ${cur.sold.toFixed(2)} sold (${cur.tax.toFixed(2)} tax added)</p>
              <p>Extra fee cost per unit: ${((cur.sold - cur.saleBase) * (selected.commR * (1 - rates.tsd) + rates.promo)).toFixed(4)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verification cross-checks */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Verification Cross-Checks
            {checks.length > 0 && (
              <Badge
                variant={checks.every((c) => c.ok) ? "default" : "destructive"}
                className="ml-2 text-xs"
              >
                {checks.filter((c) => c.ok).length}/{checks.length} pass
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-gray-500">
                <th className="text-left py-1">Check</th>
                <th className="text-left py-1">Route A</th>
                <th className="text-right py-1">Value A</th>
                <th className="text-left py-1 pl-3">Route B</th>
                <th className="text-right py-1">Value B</th>
                <th className="text-center py-1">Result</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="py-1 font-medium">{c.what}</td>
                  <td className="py-1 text-gray-500">{c.routeA}</td>
                  <td className="py-1 text-right font-mono">{c.a.toFixed(6)}</td>
                  <td className="py-1 text-gray-500 pl-3">{c.routeB}</td>
                  <td className="py-1 text-right font-mono">{c.b.toFixed(6)}</td>
                  <td className="py-1 text-center">
                    {c.ok ? (
                      <span className="text-green-600 font-bold">AGREE</span>
                    ) : (
                      <span className="text-red-600 font-bold">MISMATCH</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function InputRow({ label, value, from }: { label: string; value: string; from?: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="font-mono text-sm">
        {value}
        {from && <span className="text-xs text-gray-500 ml-1">({from})</span>}
      </p>
    </div>
  );
}

function Step({ n, label, per, units, neg, bold }: { n: number; label: string; per: number; units: number; neg?: boolean; bold?: boolean }) {
  return (
    <tr className={bold ? "font-medium" : ""}>
      <td className="py-0.5 text-gray-500 w-8">{n}</td>
      <td className="py-0.5">{label}</td>
      <td className={`py-0.5 text-right font-mono ${neg ? "text-red-600" : ""}`}>
        {neg ? "-" : ""}${Math.abs(per).toFixed(4)}
      </td>
      <td className={`py-0.5 text-right font-mono ${neg ? "text-red-600" : ""}`}>
        {neg ? "-" : ""}${Math.abs(per * units).toFixed(4)}
      </td>
    </tr>
  );
}

function KRow({ label, value, note }: { label: string; value: number | null; note?: string }) {
  return (
    <tr>
      <td className="py-0.5">{label}</td>
      <td className="py-0.5 text-right font-mono">{value != null ? `${(value * 100).toFixed(4)}%` : ""}</td>
      <td className="py-0.5 text-right font-mono text-gray-500">{note ?? (value != null ? `$${value.toFixed(6)}` : "")}</td>
    </tr>
  );
}
