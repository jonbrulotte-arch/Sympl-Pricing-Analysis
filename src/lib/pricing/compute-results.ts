import type {
  AnalysisResult,
  BrandRoyaltyTable,
  ChannelConfig,
  ChannelDefaults,
  ItemTypeCommissionTable,
  Overrides,
  ProductRow,
  RoyaltyRuleEntry,
} from "@/lib/pricing/types";
import { analyzeProduct } from "@/lib/pricing/engine";
import { brandKey } from "@/lib/pricing/helpers";
import { shipComponentsFor, type ShippingChanges } from "@/lib/pricing/shipping";

/** A sales channel as the analysis pages pass it to the browser. */
export interface ChannelWithDb {
  id: string;
  name: string;
  tabLabel: string;
  shippingMode: string;
  priceField: string;
  fallbackPriceField?: string | null;
  channelType?: string;
  hasCoupon: boolean;
  hasTax: boolean;
  hasCommission: boolean;
  hasTopSellerDisc: boolean;
  hasPromotedListing: boolean;
  hasFvfFixed: boolean;
  hasCardProcessing: boolean;
  hasPpc: boolean;
  hasAdvertising: boolean;
  hasPerSkuCommission: boolean;
  hasFallback: boolean;
  hasAsin: boolean;
  defaults: Record<string, unknown>;
  blockedBrands: string[];
  /** Product ids sold on this channel (from its Salsify list); null = no restriction. */
  channelProductIds?: string[] | null;
  /** SKUs committed on this channel and waiting on Publish to Salsify. */
  pendingPublishSkus?: string[];
}

export function toChannelConfig(ch: ChannelWithDb): ChannelConfig {
  return {
    id: ch.id,
    name: ch.name,
    tabLabel: ch.tabLabel,
    shippingMode: ch.shippingMode as "std" | "mcf" | "fba",
    priceField: ch.priceField,
    fallbackPriceField: ch.fallbackPriceField ?? undefined,
    channelType: ch.channelType === "commercial" ? "commercial" : "online",
    flags: {
      coupon: ch.hasCoupon,
      tax: ch.hasTax,
      comm: ch.hasCommission,
      tsd: ch.hasTopSellerDisc,
      promo: ch.hasPromotedListing,
      fvf: ch.hasFvfFixed,
      cc: ch.hasCardProcessing,
      ppc: ch.hasPpc,
      ad: ch.hasAdvertising,
      commSku: ch.hasPerSkuCommission,
      fb: ch.hasFallback,
      asin: ch.hasAsin,
    },
    defaults: ch.defaults as unknown as ChannelDefaults,
  };
}

/** Lookup tables shared by every channel of one customer. */
export interface AnalysisContext {
  brandRoyalties: BrandRoyaltyTable;
  royaltyRules: RoyaltyRuleEntry[];
  itemTypeCommissions?: ItemTypeCommissionTable;
}

/** The user's unsaved edits and session commits that feed one channel's results. */
export interface ChannelEdits {
  settings: Record<string, unknown>;
  overrides: Overrides;
  shipEdits: Record<string, ShippingChanges>;
  committedShip: Record<string, ShippingChanges>;
  /** Prices committed this session for this channel, by SKU. */
  committedPrices?: Record<string, number>;
}

/**
 * Runs the pricing engine for one channel. Used in the browser for users who can see cost and on the
 * server (POST /api/customers/[customerId]/analysis) for users who can't, so both get identical math.
 */
export function computeChannelResults(
  ch: ChannelWithDb,
  products: ProductRow[],
  ctx: AnalysisContext,
  edits: ChannelEdits,
  filter?: { blocked: Set<string>; allowed: Set<string> | null },
): AnalysisResult[] {
  const cfg = toChannelConfig(ch);
  const settings = edits.settings as unknown as ChannelDefaults;
  const blocked = filter?.blocked ?? new Set((ch.blockedBrands ?? []).map((b) => brandKey(b)));
  const allowed = filter ? filter.allowed : ch.channelProductIds ? new Set(ch.channelProductIds) : null;
  const committed = edits.committedPrices;

  return products
    .filter((p) => !blocked.has(brandKey(p.brand)))
    .filter((p) => !allowed || (p.productId != null && allowed.has(p.productId)))
    .map((p) => {
      let row: ProductRow = { ...p, ...edits.committedShip[p.sku], ...edits.shipEdits[p.sku] };
      if (committed?.[p.sku] != null) {
        row = {
          ...row,
          [cfg.priceField]: committed[p.sku],
          channelPrices: { ...p.channelPrices, [cfg.id]: committed[p.sku] },
        };
      }
      const result = analyzeProduct(
        row,
        cfg,
        settings,
        edits.overrides,
        ctx.brandRoyalties,
        ctx.royaltyRules,
        ctx.itemTypeCommissions,
      );
      const shipEdit = edits.shipEdits[p.sku];
      result.shipEdited = !!shipEdit && shipComponentsFor(cfg).some((c) => shipEdit[c.key] != null);
      return result;
    })
    // "Hide discontinued SKUs from this analysis" (Inventory and lifecycle).
    .filter((r) => !(settings.hideDisc && r.disc));
}
