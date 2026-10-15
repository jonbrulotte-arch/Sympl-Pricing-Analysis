import type { ProductRow } from "@/lib/pricing/types";
import { prisma } from "@/lib/prisma";

export const DEFAULT_UPS_WEIGHT_BREAKPOINT = 14;

export interface ShippingWeightResult {
  /** Break point used (lb), or null when the rule is off. */
  breakpoint: number | null;
  /** Rows whose shipping cost was replaced by the UPS shipping cost. */
  usedUps: number;
  /** Rows at or over the break point with no UPS shipping cost, which kept their Shipping Cost. */
  missingUps: number;
}

/** The admin-configured weight break point (lb), or null when the rule is turned off. */
export async function getUpsWeightBreakpoint(): Promise<number | null> {
  const settings = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
    select: { upsWeightBreakpoint: true },
  });
  if (!settings) return DEFAULT_UPS_WEIGHT_BREAKPOINT;
  return settings.upsWeightBreakpoint;
}

/**
 * Picks each row's per-unit shipping cost by weight: at or above the break point the UPS shipping cost is used,
 * below it the Shipping Cost column stays. Rows without a weight, or heavy rows without a UPS cost, keep their
 * Shipping Cost. Mutates the rows and strips the import-only fields.
 */
export function applyShippingWeightRule(rows: ProductRow[], breakpoint: number | null): ShippingWeightResult {
  let usedUps = 0;
  let missingUps = 0;
  for (const row of rows) {
    const weight = toNum(row.shippingWeight);
    const ups = toNum(row.upsShipping);
    delete row.shippingWeight;
    delete row.upsShipping;
    if (breakpoint == null || weight == null || weight < breakpoint) continue;
    if (ups != null && ups > 0) {
      row.shipping = ups;
      usedUps++;
    } else {
      missingUps++;
    }
  }
  return { breakpoint, usedUps, missingUps };
}

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : null;
}

/** Fields recorded on the import and activity log entry. */
export function weightRuleSummary(r: ShippingWeightResult) {
  return { upsWeightBreakpoint: r.breakpoint, usedUpsShipping: r.usedUps, missingUpsShipping: r.missingUps };
}

/** A short note for the activity log summary, empty when the rule changed nothing. */
export function weightRuleNote(r: ShippingWeightResult): string {
  if (r.breakpoint == null || (r.usedUps === 0 && r.missingUps === 0)) return "";
  const parts = [`UPS shipping used for ${r.usedUps} SKU${r.usedUps !== 1 ? "s" : ""} at ${r.breakpoint} lb or more`];
  if (r.missingUps) parts.push(`${r.missingUps} had no UPS cost and kept Shipping Cost`);
  return `; ${parts.join(", ")}`;
}
