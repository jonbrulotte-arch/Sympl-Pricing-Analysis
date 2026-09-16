export interface ChannelFlags {
  coupon: boolean;
  tax: boolean;
  comm: boolean;
  tsd: boolean;
  promo: boolean;
  fvf: boolean;
  cc: boolean;
  ppc: boolean;
  ad: boolean;
  commSku: boolean;
  fb: boolean;
  asin: boolean;
}

export interface ChannelDefaults {
  goal: number;
  coupon?: number;
  tax?: number;
  comm?: number;
  tsd?: number;
  promo?: number;
  fvf?: number;
  ccPct?: number;
  ccFlat?: number;
  advertising?: number;
  ppc?: number;
  roymode: "pct" | "usd";
  roy: number;
  returns: number;
  royaltySource: "sheet" | "brand";
  hideDisc: boolean;
  sellGoal: number;
  excludeDisc: boolean;
  excludeOOS: boolean;
  lowStock: number;
  round: string;
  target: number;
  priceFallback?: boolean;
  netTerms?: number;
  alloc1?: number;
  alloc2?: number;
  alloc3?: number;
  alloc4?: number;
  alloc5?: number;
}

export interface ChannelConfig {
  id: string;
  name: string;
  tabLabel: string;
  shippingMode: "std" | "mcf" | "fba";
  priceField: string;
  fallbackPriceField?: string;
  channelType?: "online" | "commercial";
  flags: ChannelFlags;
  defaults: ChannelDefaults;
}

export interface ProductRow {
  sku: string;
  name?: string;
  cost: number | null;
  priceJSP?: number | null;
  priceMCF?: number | null;
  priceWM?: number | null;
  priceShopify?: number | null;
  priceFBM?: number | null;
  priceFBA?: number | null;
  shipping?: number | null;
  mcfShip?: number | null;
  mcfFreight?: number | null;
  fbaFee?: number | null;
  royalty?: number | null;
  units?: number | null;
  ppc?: number | null;
  fvfFixed?: number | null;
  brand?: string;
  asin?: string;
  fbaClass?: string;
  amzCategory?: string;
  amzItemType?: string;
  amzCommission?: number | null;
  invStatus?: string;
  invRaw?: string;
  available?: number | null;
  channelPrices?: Record<string, number>;
  [key: string]: unknown;
}

export interface RateTuple {
  c: number;     // coupon rate
  t: number;     // tax rate
  comm: number;  // commission rate
  tsd: number;   // top seller discount rate
  promo: number; // promoted listing rate
  ccPct: number; // card processing rate
  ccFlat: number; // card processing flat fee
  ad: number;    // advertising rate
  ret: number;   // returns rate
  netTerms: number;  // net terms rate
  otherAlloc: number; // sum of additional allocation rates
  goal: number;  // target GM%
  round: string; // rounding mode
  target: number; // target profit as % of cost
}

export interface ForwardPassResult {
  price: number;
  coupon: number;
  saleBase: number;
  tax: number;
  sold: number;
  comm: number;
  tsd: number;
  fvfRate: number;
  fvfFixed: number;
  promo: number;
  ccVar: number;
  ccFlat: number;
  ret: number;
  ad: number;
  netTerms: number;
  otherAlloc: number;
  roy: number;
  fees: number;
  ppc: number;
  alloc: number;
  allocPct: number;
  netRevenue: number;
  revenue: number;
  net: number;
  gm: number;
}

export type AnalysisStatus = "pass" | "below" | "loss" | "invalid" | "unpriced";

export interface AnalysisResult {
  sku: string;
  name?: string;
  cost: number | null;
  units: number;
  price: number;
  ship: number;
  basePrice: number | null;
  baseShip: number;
  edited: boolean;
  invalid: boolean;
  unpriced: boolean;
  disc: boolean;
  avail: number | null;
  oos: boolean;
  low: boolean;
  invRaw?: string;
  invStatus?: string;
  goalUsed: number;
  fellBack: boolean;
  brand?: string;
  royRate: number;
  royFlat: number;
  royFrom: "sku" | "brand" | "sheet" | "default";
  commR: number;
  commFrom: "channel" | "sheet";
  ppcUsed: number;
  asin?: string;
  fbaClass?: string;
  amzCategory?: string;
  amzItemType?: string;
  fbaFee?: number | null;
  fvfFixedUsed: number;
  feeRate: number;
  ch: string;
  cur: ForwardPassResult;
  status: AnalysisStatus;
  rec: number | null;
  recCalc: ForwardPassResult | null;
  achievable: boolean;
  targetProfit: number;
  hitsTarget: boolean;
  delta: number | null;
  deltaPct: number | null;
  gm: number;
  net: number;
  mcfShip?: number | null;
  mcfFreight?: number | null;
  shipping?: number | null;
  hasShippingData: boolean;
}

export interface VerificationCheck {
  what: string;
  routeA: string;
  a: number;
  routeB: string;
  b: number;
  ok: boolean;
  cmp?: string;
}

export interface Overrides {
  [channelId: string]: {
    [sku: string]: {
      price?: number;
      ship?: number;
    };
  };
}

export interface BrandRoyaltyTable {
  [brandKey: string]: number;
}

export interface RoyaltyRuleEntry {
  id: string;
  scope: "brand" | "sku";
  brandKey?: string;
  brandName?: string;
  skus: string[];
  value: number;
  mode: "pct" | "usd";
  customerId?: string | null;
}
