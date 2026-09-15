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
} from "./types";
import { parseNum, parseStatus, roundUp, brandKey } from "./helpers";

export function computeRates(cfg: ChannelConfig, s: ChannelDefaults): RateTuple {
  const f = cfg.flags;
  return {
    c: f.coupon ? (s.coupon ?? 0) / 100 : 0,
    t: f.tax ? (s.tax ?? 0) / 100 : 0,
    comm: f.comm ? (s.comm ?? 0) / 100 : 0,
    tsd: f.tsd ? (s.tsd ?? 0) / 100 : 0,
    promo: f.promo ? (s.promo ?? 0) / 100 : 0,
    ccPct: f.cc ? (s.ccPct ?? 0) / 100 : 0,
    ccFlat: f.cc ? (s.ccFlat ?? 0) : 0,
    ad: f.ad ? (s.advertising ?? 0) / 100 : 0,
    ret: (s.returns ?? 0) / 100,
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
  const comm = sold * commR;
  const tsd = comm * r.tsd;
  const fvfRate = comm - tsd;
  const promo = sold * r.promo;
  const ccVar = saleBase * r.ccPct;
  const ccFlat = r.ccFlat;
  const ret = saleBase * r.ret;
  const ad = saleBase * r.ad;
  const roy = royRate * saleBase + royFlat;
  const fees = (coupon + fvfRate + fvfFixed + promo + roy + ccVar + ret + ad) * units + ccFlat;
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
    tsd,
    fvfRate,
    fvfFixed,
    promo,
    ccVar,
    ccFlat,
    ret,
    ad,
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
    saleRate * r.ad
  );
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
): { royRate: number; royFlat: number; royFrom: "brand" | "sheet" | "default" } {
  const roymode = settings.roymode ?? "pct";
  const defaultRoy = (settings.roy ?? 6.9) / 100;
  const bk = brandKey(row.brand);
  const brandVal = bk && brandRoyalty?.[bk] != null ? brandRoyalty[bk] : null;
  const sheetVal = row.royalty != null ? parseNum(row.royalty) : null;

  const prefer = settings.royaltySource ?? "sheet";

  let raw: number | null = null;
  let from: "brand" | "sheet" | "default" = "default";

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

function resolveCommission(
  row: ProductRow,
  cfg: ChannelConfig,
  r: RateTuple,
): { commR: number; commFrom: "channel" | "sheet" } {
  if (cfg.flags.commSku && row.amzCommission != null) {
    let v = parseNum(row.amzCommission);
    if (v > 1) v /= 100;
    return { commR: v, commFrom: "sheet" };
  }
  return { commR: r.comm, commFrom: "channel" };
}

export function analyzeProduct(
  row: ProductRow,
  cfg: ChannelConfig,
  settings: ChannelDefaults,
  overrides?: Overrides,
  brandRoyalty?: BrandRoyaltyTable,
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
  let basePrice = row[priceField] != null ? parseNum(row[priceField]) : null;
  let fellBack = false;
  if ((basePrice == null || basePrice === 0) && fallbackField && settings.priceFallback) {
    basePrice = row[fallbackField] != null ? parseNum(row[fallbackField]) : null;
    fellBack = basePrice != null && basePrice > 0;
  }

  const ov = overrides?.[cfg.id]?.[row.sku];
  const price = ov?.price ?? (basePrice ?? 0);
  const edited = ov?.price != null;
  const ship = ov?.ship ?? computeShipping(row, cfg);
  const baseShip = computeShipping(row, cfg);
  const invalid = cost <= 0;
  const unpriced = price <= 0 && !invalid;

  const { royRate, royFlat, royFrom } = resolveRoyalty(row, cfg, settings, brandRoyalty);
  const { commR, commFrom } = resolveCommission(row, cfg, r);

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

  const flatUnit = fvfFixedUsed + royFlat;
  const flatOrder = r.ccFlat + ppcUsed;
  const { price: rawRec, achievable } = solveGoalPrice(cost, units, ship, k, goalUsed, flatUnit, flatOrder);

  let rec: number | null = null;
  let recCalc: ForwardPassResult | null = null;
  if (achievable && !invalid && rawRec > 0) {
    rec = roundUp(rawRec, r.round);
    let guard = 0;
    while (guard < 40) {
      recCalc = forwardPass(rec, r, commR, royRate, royFlat, fvfFixedUsed, ppcUsed, units, ship, cost);
      if (recCalc.gm >= goalUsed - 1e-9) break;
      rec = roundUp(rec + 0.01, r.round);
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
    hasShippingData: row.shipping != null || row.mcfShip != null || row.mcfFreight != null || row.fbaFee != null,
  };
}

function computeShipping(row: ProductRow, cfg: ChannelConfig): number {
  const units = Math.max(parseNum(row.units), 1);
  if (cfg.shippingMode === "fba") {
    return parseNum(row.fbaFee) * units;
  }
  if (cfg.shippingMode === "mcf") {
    return parseNum(row.mcfShip) * units + parseNum(row.mcfFreight);
  }
  return parseNum(row.shipping) * units;
}
