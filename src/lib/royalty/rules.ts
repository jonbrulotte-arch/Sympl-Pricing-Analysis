/** Rule matching and duplicate detection shared by the pricing engine and the Royalty Rules page. */

export interface RuleForMatch {
  id: string;
  scope: "brand" | "sku";
  brandKey?: string | null;
  skus: string[];
  customerId?: string | null;
  channelId?: string | null;
}

export type RuleLevel = "channel" | "customer" | "global";

export interface RuleMatch<R extends RuleForMatch> {
  rule: R;
  level: RuleLevel;
  matchedBy: "sku" | "brand";
  /** Other rules at the same level that also match the same way. The analysis uses `rule`, but which one comes first isn't defined. */
  ties: R[];
}

/**
 * The royalty rule that applies to a SKU on a channel. Most specific wins: this channel's overrides, then the
 * customer's overrides for all channels, then global rules; at each level a SKU rule beats a brand rule.
 * `rules` holds the global rules plus one customer's overrides.
 */
export function matchRoyaltyRule<R extends RuleForMatch>(
  rules: R[],
  sku: string,
  brandKey: string,
  channelId: string,
): RuleMatch<R> | null {
  const levels: [RuleLevel, R[]][] = [
    ["channel", rules.filter((r) => r.customerId != null && r.channelId === channelId)],
    ["customer", rules.filter((r) => r.customerId != null && !r.channelId)],
    ["global", rules.filter((r) => r.customerId == null)],
  ];
  for (const [level, list] of levels) {
    const bySku = list.filter((r) => r.scope === "sku" && r.skus.includes(sku));
    if (bySku.length > 0) return { rule: bySku[0], level, matchedBy: "sku", ties: bySku.slice(1) };
    if (brandKey) {
      const byBrand = list.filter((r) => r.scope === "brand" && r.brandKey === brandKey);
      if (byBrand.length > 0) return { rule: byBrand[0], level, matchedBy: "brand", ties: byBrand.slice(1) };
    }
  }
  return null;
}

/** Rules apply at the same level when they share a customer (or are both global) and a channel (or both cover all channels). */
export function ruleLevelKey(r: { customerId?: string | null; channelId?: string | null }): string {
  return `${r.customerId ?? "global"}|${r.channelId ?? "all"}`;
}

export interface DuplicateGroup<R extends RuleForMatch> {
  /** "sku": the rules share SKUs; "brand": they're brand rules for the same brand; "within": one rule lists a SKU twice. */
  kind: "sku" | "brand" | "within";
  levelKey: string;
  rules: R[];
  /** Shared SKUs (kind "sku" and "within"). */
  skus: string[];
  brandKey?: string;
}

/**
 * Rules that cover the same SKU or brand at the same level. Overrides at different levels aren't duplicates: they're
 * how a customer or channel replaces a global rule. SKUs are compared exactly, as the analysis compares them.
 */
export function findDuplicateRules<R extends RuleForMatch>(rules: R[]): DuplicateGroup<R>[] {
  const groups: DuplicateGroup<R>[] = [];
  const byLevel = new Map<string, R[]>();
  for (const r of rules) {
    const key = ruleLevelKey(r);
    byLevel.set(key, [...(byLevel.get(key) ?? []), r]);
  }

  for (const [levelKey, list] of byLevel) {
    // SKUs listed by more than one rule, grouped by the exact set of rules that share them.
    const rulesBySku = new Map<string, R[]>();
    for (const r of list) {
      if (r.scope !== "sku") continue;
      for (const sku of new Set(r.skus)) rulesBySku.set(sku, [...(rulesBySku.get(sku) ?? []), r]);
    }
    const shared = new Map<string, { rules: R[]; skus: string[] }>();
    for (const [sku, owners] of rulesBySku) {
      if (owners.length < 2) continue;
      const key = owners.map((r) => r.id).sort().join("|");
      const entry = shared.get(key) ?? { rules: owners, skus: [] };
      entry.skus.push(sku);
      shared.set(key, entry);
    }
    for (const { rules: owners, skus } of shared.values()) {
      groups.push({ kind: "sku", levelKey, rules: owners, skus: skus.sort() });
    }

    const brandRules = new Map<string, R[]>();
    for (const r of list) {
      if (r.scope !== "brand" || !r.brandKey) continue;
      brandRules.set(r.brandKey, [...(brandRules.get(r.brandKey) ?? []), r]);
    }
    for (const [bk, owners] of brandRules) {
      if (owners.length > 1) groups.push({ kind: "brand", levelKey, rules: owners, skus: [], brandKey: bk });
    }

    for (const r of list) {
      if (r.scope !== "sku") continue;
      const seen = new Set<string>();
      const repeated = new Set<string>();
      for (const sku of r.skus) (seen.has(sku) ? repeated : seen).add(sku);
      if (repeated.size > 0) groups.push({ kind: "within", levelKey, rules: [r], skus: [...repeated].sort() });
    }
  }
  return groups;
}
