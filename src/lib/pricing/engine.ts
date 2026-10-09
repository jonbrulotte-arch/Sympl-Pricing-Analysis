import type {
  ChannelConfig,
  ChannelDefaults,
  ProductRow,
  RateTuple,
  ForwardPassResult,
  AnalysisResult,
  AnalysisStatus,
  BrandRoyaltyTable,
  Overrides,
  RoyaltyRuleEntry,
  ItemTypeCommissionTable,
} from "./types";
import { parseNum, parseStatus, roundUp, roundStep, brandKey } from "./helpers";

/** Amazon's applicable minimum referral fee per unit (USD). */
export const DEFAULT_REFERRAL_MIN = 0.3;

/** Display name for the marketplace commission: Amazon-style channels call it a referral fee. */
export function commissionName(cfg: Pick<ChannelConfig, "flags">): string {
  return cfg.flags.commSku ? "Referral fee" : "Category commission";
}

export function computeRates(cfg: ChannelConfig, s: ChannelDefaults): RateTuple {
  const f = cfg.flags;
  return {
    c: f.coupon ? (s.coupon ?? 0) / 100 : 0,
    t: f.tax ? (s.tax ?? 0) / 100 : 0,
    comm: f.comm ? (s.comm ?? 0) / 100 : 0,
    refMin: f.comm && f.commSku ? Math.max(0, s.refMin ?? DEFAULT_REFERRAL_MIN) : 0,
    tsd: f.tsd ? (s.tsd ?? 0) / 100 : 0,
    promo: f.promo ? (s.promo ?? 0) / 100 : 0,
    ccPct: f.cc ? (s.ccPct ?? 0) / 100 : 0,
    ccFlat: f.cc ? (s.ccFlat ?? 0) : 0,
    ad: f.ad ? (s.advertising ?? 0) / 100 : 0,
    ret: (s.returns ?? 0) / 100,
    netTerms: (s.netTerms ?? 0) / 100,
    otherAlloc: ((s.alloc1 ?? 0) + (s.alloc2 ?? 0) + (s.alloc3 ?? 0) + (s.alloc4 ?? 0) + (s.alloc5 ?? 0)) / 100,
    goal: (s.goal ?? 25) / 100,
    round: s.round ?? "99",
    target: (s.target ?? 20) / 100,
  };
}

export function forwardPass(
  P: number,
  r: RateTuple,
  commR: number,
  royRate: number,
  royFlat: number,
  fvfFixed: number,
  ppc: number,
  units: number,
  shipping: number,
  cost: number,
): ForwardPassResult {
  const coupon = P * r.c;
  const saleBase = P - coupon;
  const tax = saleBase * r.t;
  const sold = saleBase + tax;
  // Amazon charges the greater of the referral fee % or the per-unit minimum.
  const pctComm = sold * commR;
  const commMinApplied = r.refMin > 0 && r.refMin > pctComm;
  const comm = commMinApplied ? r.refMin : pctComm;
  const tsd = comm * r.tsd;
  const fvfRate = comm - tsd;
  const promo = sold * r.promo;
  const ccVar = saleBase * r.ccPct;
  const ccFlat = r.ccFlat;
  const ret = saleBase * r.ret;
  const ad = saleBase * r.ad;
  const netTerms = saleBase * r.netTerms;
  const otherAlloc = saleBase * r.otherAlloc;
  const roy = royRate * saleBase + royFlat;
  const fees = (coupon + fvfRate + fvfFixed + promo + roy + ccVar + ret + ad + netTerms + otherAlloc) * units + ccFlat;
  const alloc = fees + ppc;
  const allocPct = P > 0 ? alloc / (P * units) : 0;
  const revenue = P * units;
  const netRevenue = saleBase * units - alloc + coupon * units;
  const net = revenue - alloc - shipping - cost * units;
  const gm = revenue > 0 ? net / revenue : 0;

  return {
    price: P,
    coupon,
    saleBase,
    tax,
    sold,
    comm,
    commMinApplied,
    tsd,
    fvfRate,
    fvfFixed,
    promo,
    ccVar,
    ccFlat,
    ret,
    ad,
    netTerms,
    otherAlloc,
    roy,
    fees,
    ppc,
    alloc,
    allocPct,
    netRevenue,
    revenue,
    net,
    gm,
  };
}

export function computeFeeRate(r: RateTuple, commR: number, royRate: number): number {
  const saleRate = 1 - r.c;
  const grossUp = saleRate * (1 + r.t);
  return (
    r.c +
    grossUp * commR * (1 - r.tsd) +
    grossUp * r.promo +
    saleRate * royRate +
    saleRate * r.ccPct +
    saleRate * r.ret +
    saleRate * r.ad +
    saleRate * r.netTerms +
    saleRate * r.otherAlloc
  );
}

/**
 * Goal price accounting for the minimum referral fee. Net margin with a max() fee is the lower of the
 * percentage-fee and minimum-fee cases, so the goal is met at the higher of the two solved prices.
 */
export function solveRecommendedPrice(
  cost: number,
  units: number,
  shipping: number,
  r: RateTuple,
  commR: number,
  royRate: number,
  goal: number,
  flatUnit: number,
  flatOrder: number,
): { price: number; achievable: boolean } {
  const pct = solveGoalPrice(cost, units, shipping, computeFeeRate(r, commR, royRate), goal, flatUnit, flatOrder);
  if (!pct.achievable || r.refMin <= 0) return pct;
  const minFee = r.refMin * (1 - r.tsd);
  const flat = solveGoalPrice(cost, units, shipping, computeFeeRate(r, 0, royRate), goal, flatUnit + minFee, flatOrder);
  if (!flat.achievable) return pct;
  return { price: Math.max(pct.price, flat.price), achievable: true };
}

export function solveGoalPrice(
  cost: number,
  units: number,
  shipping: number,
  k: number,
  goal: number,
  flatUnit: number,
  flatOrder: number,
): { price: number; achievable: boolean } {
  const denom = 1 - k - goal;
  if (denom <= 0.0001) return { price: 0, achievable: false };
  const raw = (cost * units + shipping + flatUnit * units + flatOrder) / (units * denom);
  return { price: raw, achievable: true };
}

function resolveRoyalty(
  row: ProductRow,
  cfg: ChannelConfig,
  settings: ChannelDefaults,
  brandRoyalty?: BrandRoyaltyTable,
  royaltyRules?: RoyaltyRuleEntry[],
): { royRate: number; royFlat: number; royFrom: "sku" | "brand" | "sheet" | "default" } {
  if (royaltyRules && royaltyRules.length > 0) {
    // Most specific wins: this channel's overrides, then customer-wide overrides, then global rules.
    const channelRules = royaltyRules.filter((r) => r.customerId != null && r.channelId === cfg.id);
    const customerRules = royaltyRules.filter((r) => r.customerId != null && !r.channelId);
    const globalRules = royaltyRules.filter((r) => r.customerId == null);
    const bk = brandKey(row.brand);

    const chanSkuRule = channelRules.find((r) => r.scope === "sku" && r.skus.includes(row.sku));
    if (chanSkuRule) return applyRuleValue(chanSkuRule.value, chanSkuRule.mode, "sku");
    if (bk) {
      const chanBrandRule = channelRules.find((r) => r.scope === "brand" && r.brandKey === bk);
      if (chanBrandRule) return applyRuleValue(chanBrandRule.value, chanBrandRule.mode, "brand");
    }

    const custSkuRule = customerRules.find((r) => r.scope === "sku" && r.skus.includes(row.sku));
    if (custSkuRule) return applyRuleValue(custSkuRule.value, custSkuRule.mode, "sku");

    if (bk) {
      const custBrandRule = customerRules.find((r) => r.scope === "brand" && r.brandKey === bk);
      if (custBrandRule) return applyRuleValue(custBrandRule.value, custBrandRule.mode, "brand");
    }

    const globalSkuRule = globalRules.find((r) => r.scope === "sku" && r.skus.includes(row.sku));
    if (globalSkuRule) return applyRuleValue(globalSkuRule.value, globalSkuRule.mode, "sku");

    if (bk) {
      const globalBrandRule = globalRules.find((r) => r.scope === "brand" && r.brandKey === bk);
      if (globalBrandRule) return applyRuleValue(globalBrandRule.value, globalBrandRule.mode, "brand");
    }
  }

  const roymode = settings.roymode ?? "pct";
  const defaultRoy = (settings.roy ?? 6.9) / 100;
  const bk = brandKey(row.brand);
  const brandVal = bk && brandRoyalty?.[bk] != null ? brandRoyalty[bk] : null;
  const sheetVal = row.royalty != null ? parseNum(row.royalty) : null;

  const prefer = settings.royaltySource ?? "sheet";

  let raw: number | null = null;
  let from: "sku" | "brand" | "sheet" | "default" = "default";

  if (prefer === "brand" && brandVal != null) {
    raw = brandVal;
    from = "brand";
  } else if (sheetVal != null && sheetVal !== 0) {
    raw = sheetVal;
    from = "sheet";
  } else if (brandVal != null) {
    raw = brandVal;
    from = "brand";
  }

  if (raw == null) {
    return roymode === "usd"
      ? { royRate: 0, royFlat: defaultRoy, royFrom: "default" }
      : { royRate: defaultRoy, royFlat: 0, royFrom: "default" };
  }

  let val = raw > 1 && roymode === "pct" ? raw / 100 : raw;
  if (roymode === "usd") {
    return { royRate: 0, royFlat: val, royFrom: from };
  }
  return { royRate: val, royFlat: 0, royFrom: from };
}

function applyRuleValue(
  value: number,
  mode: "pct" | "usd",
  from: "sku" | "brand",
): { royRate: number; royFlat: number; royFrom: "sku" | "brand" | "sheet" | "default" } {
  let val = value;
  if (mode === "pct" && val > 1) val = val / 100;
  if (mode === "usd") {
    return { royRate: 0, royFlat: val, royFrom: from };
  }
  return { royRate: val, royFlat: 0, royFrom: from };
}

function resolveCommission(
  row: ProductRow,
  cfg: ChannelConfig,
  r: RateTuple,
  itemTypeCommissions?: ItemTypeCommissionTable,
): { commR: number; commFrom: AnalysisResult["commFrom"] } {
  if (cfg.flags.commSku && row.amzCommission != null) {
    let v = parseNum(row.amzCommission);
    if (v > 1) v /= 100;
    return { commR: v, commFrom: "sheet" };
  }
  if (cfg.flags.commSku && itemTypeCommissions && row.amzItemType) {
    const pct = itemTypeCommissions[itemTypeKey(row.amzItemType)];
    if (pct != null) return { commR: pct / 100, commFrom: "itemType" };
  }
  return { commR: r.comm, commFrom: "channel" };
}

/** Normalized key used to match a product's Amazon Item Type to an override. */
export function itemTypeKey(itemType: string): string {
  return itemType.trim().toLowerCase();
}

export function analyzeProduct(
  row: ProductRow,
  cfg: ChannelConfig,
  settings: ChannelDefaults,
  overrides?: Overrides,
  brandRoyalty?: BrandRoyaltyTable,
  royaltyRules?: RoyaltyRuleEntry[],
  itemTypeCommissions?: ItemTypeCommissionTable,
): AnalysisResult {
  const r = computeRates(cfg, settings);
  const cost = parseNum(row.cost);
  const units = Math.max(parseNum(row.units), 1);
  const invRaw = row.invStatus ?? row.invRaw;
  const invStatus = parseStatus(invRaw);
  const disc = invStatus === "disc";
  const avail = row.available != null ? parseNum(row.available) : null;
  const oos = avail != null && avail <= 0;
  const low = avail != null && avail <= (settings.lowStock ?? 5);
  const goalUsed = disc ? (settings.sellGoal ?? 0) / 100 : r.goal;

  const priceField = cfg.priceField as keyof ProductRow;
  const fallbackField = cfg.fallbackPriceField as keyof ProductRow | undefined;
  const channelOwnPrice = row.channelPrices?.[cfg.id];
  let basePrice = channelOwnPrice != null
    ? channelOwnPrice
    : cfg.priceField !== "__none__" && row[priceField] != null ? parseNum(row[priceField]) : null;
  let fellBack = false;
  if ((basePrice == null || basePrice === 0) && fallbackField && settings.priceFallback) {
    basePrice = row[fallbackField] != null ? parseNum(row[fallbackField]) : null;
    fellBack = basePrice != null && basePrice > 0;
  }

  const ov = overrides?.[cfg.id]?.[row.sku];
  const price = ov?.price ?? (basePrice ?? 0);
  const edited = ov?.price != null && !(basePrice != null && Math.abs(ov.price - basePrice) < 0.005);
  const ship = ov?.ship ?? computeShipping(row, cfg);
  const baseShip = computeShipping(row, cfg);
  const invalid = cost <= 0;
  const unpriced = price <= 0 && !invalid;

  const { royRate, royFlat, royFrom } = resolveRoyalty(row, cfg, settings, brandRoyalty, royaltyRules);
  const { commR, commFrom } = resolveCommission(row, cfg, r, itemTypeCommissions);

  const ppcUsed = cfg.flags.ppc ? parseNum(row.ppc ?? settings.ppc ?? 0) : 0;
  const fvfFixedUsed = cfg.flags.fvf ? parseNum(row.fvfFixed ?? settings.fvf ?? 0) : 0;
  const fbaFee = row.fbaFee != null ? parseNum(row.fbaFee) : null;

  const k = computeFeeRate(r, commR, royRate);

  const cur = forwardPass(price, r, commR, royRate, royFlat, fvfFixedUsed, ppcUsed, units, ship, cost);

  let status: AnalysisStatus;
  if (invalid) status = "invalid";
  else if (unpriced) status = "unpriced";
  else if (cur.gm >= goalUsed) status = "pass";
  else if (cur.net >= 0) status = "below";
  else status = "loss";

  let baseStatus: AnalysisStatus = status;
  if (edited) {
    const basePriceUsed = basePrice ?? 0;
    const baseUnpriced = basePriceUsed <= 0 && !invalid;
    if (invalid) baseStatus = "invalid";
    else if (baseUnpriced) baseStatus = "unpriced";
    else {
      const baseCur = forwardPass(basePriceUsed, r, commR, royRate, royFlat, fvfFixedUsed, ppcUsed, units, baseShip, cost);
      if (baseCur.gm >= goalUsed) baseStatus = "pass";
      else if (baseCur.net >= 0) baseStatus = "below";
      else baseStatus = "loss";
    }
  }

  const flatUnit = fvfFixedUsed + royFlat;
  const flatOrder = r.ccFlat + ppcUsed;
  const { price: rawRec, achievable } = solveRecommendedPrice(cost, units, ship, r, commR, royRate, goalUsed, flatUnit, flatOrder);

  let rec: number | null = null;
  let recCalc: ForwardPassResult | null = null;
  if (achievable && !invalid && rawRec > 0) {
    rec = roundUp(rawRec, r.round);
    const step = roundStep(r.round);
    let guard = 0;
    while (guard < 40) {
      recCalc = forwardPass(rec, r, commR, royRate, royFlat, fvfFixedUsed, ppcUsed, units, ship, cost);
      if (recCalc.gm >= goalUsed - 1e-9) break;
      rec = roundUp(rec + step, r.round);
      guard++;
    }
    if (!recCalc) {
      recCalc = forwardPass(rec, r, commR, royRate, royFlat, fvfFixedUsed, ppcUsed, units, ship, cost);
    }
  }

  const targetProfit = cost * r.target;
  const hitsTarget = cur.net >= targetProfit * units - 0.005;

  const delta = rec != null ? rec - price : null;
  const deltaPct = rec != null && price > 0 ? (rec - price) / price : null;

  return {
    productId: row.productId,
    sku: row.sku,
    name: row.name,
    cost: row.cost != null ? cost : null,
    units,
    price,
    ship,
    basePrice,
    baseShip,
    edited,
    invalid,
    unpriced,
    disc,
    avail,
    oos,
    low,
    invRaw: invRaw ?? undefined,
    invStatus: invRaw ?? undefined,
    goalUsed,
    fellBack,
    brand: row.brand,
    royRate,
    royFlat,
    royFrom,
    commR,
    commFrom,
    ppcUsed,
    asin: row.asin,
    fbaClass: row.fbaClass,
    amzCategory: row.amzCategory,
    amzItemType: row.amzItemType,
    fbaFee,
    fvfFixedUsed,
    feeRate: k,
    ch: cfg.id,
    cur,
    status,
    baseStatus,
    rec,
    recCalc,
    achievable,
    targetProfit,
    hitsTarget,
    delta,
    deltaPct,
    gm: cur.gm,
    net: cur.net,
    mcfShip: row.mcfShip != null ? parseNum(row.mcfShip) : null,
    mcfFreight: row.mcfFreight != null ? parseNum(row.mcfFreight) : null,
    shipping: row.shipping != null ? parseNum(row.shipping) : null,
    hasShippingData: row.shipping != null || row.mcfShip != null || row.mcfFreight != null || row.fbaFee != null,
  };
}

function computeShipping(row: ProductRow, cfg: ChannelConfig): number {
  if (cfg.channelType === "commercial") return 0;
  const units = Math.max(parseNum(row.units), 1);
  // Inbound freight to Amazon fulfillment centers applies to both MCF and FBA, per unit.
  if (cfg.shippingMode === "fba") {
    return (parseNum(row.fbaFee) + parseNum(row.mcfFreight)) * units;
  }
  if (cfg.shippingMode === "mcf") {
    return (parseNum(row.mcfShip) + parseNum(row.mcfFreight)) * units;
  }
  return parseNum(row.shipping) * units;
}
