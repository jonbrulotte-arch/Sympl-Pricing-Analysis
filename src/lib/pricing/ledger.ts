import type { AnalysisResult, ChannelConfig, ChannelDefaults } from "@/lib/pricing/types";
import { computeRates, commissionName } from "@/lib/pricing/engine";

/** One line of a SKU's fee ledger for one order. `value` is null for a note with no amount. */
export interface LedgerLine {
  label: string;
  value: number | null;
  kind: "price" | "fee" | "subtotal" | "shipping" | "cost" | "net" | "note";
}

/**
 * The fee ledger for one order of a SKU on a channel, as shown in the analysis detail panel and exported in
 * reports: list price, each fee and allocation that applies, shipping, cost and net margin.
 */
export function feeLedger(
  r: AnalysisResult,
  cfg: ChannelConfig,
  settings: ChannelDefaults,
  opts: { includeCost: boolean },
): LedgerLine[] {
  const rates = computeRates(cfg, settings);
  const cur = r.cur;
  const u = `${r.units} unit${r.units !== 1 ? "s" : ""}`;
  const lines: LedgerLine[] = [];
  const add = (label: string, value: number | null, kind: LedgerLine["kind"] = "fee") => lines.push({ label, value, kind });

  add(`List price × ${u}`, r.price, "price");
  if (cfg.flags.coupon) add(`Coupon discount (${(rates.c * 100).toFixed(1)}% of list)`, -cur.coupon);
  if (cfg.flags.tax) {
    add(`Sales tax (${(rates.t * 100).toFixed(2)}%, passed through)`, cur.tax, "price");
    add("Sold price (fee base, includes tax)", cur.sold, "subtotal");
  }
  add(
    cur.commMinApplied
      ? `${commissionName(cfg)} (minimum $${rates.refMin.toFixed(2)}/unit; ${(r.commR * 100).toFixed(2)}% would be $${(cur.sold * r.commR).toFixed(2)})`
      : `${commissionName(cfg)} (${(r.commR * 100).toFixed(2)}%${r.commFrom === "itemType" ? ", item type override" : ""})`,
    -cur.comm,
  );
  if (cfg.flags.tsd) add(`Top seller discount (${(rates.tsd * 100).toFixed(1)}% of the fee, credited back)`, cur.tsd, "price");
  if (cur.fvfFixed > 0) add("Final value fee, fixed", -cur.fvfFixed);
  if (cfg.flags.promo) add(`Promoted listing fee (${(rates.promo * 100).toFixed(1)}%)`, -cur.promo);
  if (cfg.flags.cc) {
    add(`CC processing (${(rates.ccPct * 100).toFixed(1)}%)`, -cur.ccVar);
    if (cur.ccFlat > 0) add("CC flat fee", -cur.ccFlat);
  }
  add(`Returns and warranty (${(rates.ret * 100).toFixed(1)}% of sale)`, -cur.ret);
  if (cfg.flags.ad) add(`Advertising (${(rates.ad * 100).toFixed(1)}%)`, -cur.ad);
  if (rates.netTerms > 0) add(`Net Terms (${(rates.netTerms * 100).toFixed(1)}%)`, -cur.netTerms);
  if (rates.otherAlloc > 0) add(`Additional allocations (${(rates.otherAlloc * 100).toFixed(1)}%)`, -cur.otherAlloc);
  add(`Royalty (${r.royFrom})`, -cur.roy);
  if (cfg.flags.ppc) add("PPC fee", -r.ppcUsed);
  add("Total fees and allocations", -cur.alloc, "subtotal");

  if (cfg.channelType === "commercial") {
    add("Freight excluded — commercial channel", null, "note");
  } else if (r.hasShippingData) {
    if (cfg.shippingMode === "fba" || cfg.shippingMode === "mcf") {
      const fee = (cfg.shippingMode === "fba" ? r.fbaFee : r.mcfShip) ?? 0;
      const freight = r.mcfFreight ?? 0;
      add(`${cfg.shippingMode === "fba" ? "FBA fee" : "MCF fulfillment"} ($${fee.toFixed(2)} × ${r.units})`, -(fee * r.units), "shipping");
      if (freight > 0) add(`Inbound freight to Amazon ($${freight.toFixed(2)} × ${r.units})`, -(freight * r.units), "shipping");
    } else {
      const perUnit = r.shipping ?? (r.units > 0 ? r.ship / r.units : 0);
      add(`Shipping cost ($${perUnit.toFixed(2)} × ${r.units})`, -r.ship, "shipping");
    }
  }

  if (opts.includeCost) add(`SKU cost × ${r.units}`, -(r.cost ?? 0) * r.units, "cost");
  add("Net margin", cur.net, "net");
  return lines;
}
