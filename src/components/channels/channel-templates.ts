import type { ChannelFlags, ChannelDefaults } from "@/lib/pricing/types";

export interface ChannelTemplate {
  id: string;
  label: string;
  description: string;
  shippingMode: "std" | "mcf" | "fba";
  flags: ChannelFlags;
  defaults: Partial<ChannelDefaults>;
}

export const CHANNEL_TEMPLATES: ChannelTemplate[] = [
  {
    id: "ebay",
    label: "eBay-style",
    description: "Coupon, sales tax on fees, commission, top seller discount, promoted listings, FVF fixed fee, PPC",
    shippingMode: "std",
    flags: { coupon: true, tax: true, comm: true, tsd: true, promo: true, fvf: true, cc: false, ppc: true, ad: false, commSku: false, fb: false, asin: false },
    defaults: { goal: 25, coupon: 8, tax: 6.44, comm: 11.5, tsd: 10, promo: 8, fvf: 0.20, ppc: 0.62, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", round: "99", target: 20 },
  },
  {
    id: "amazon",
    label: "Amazon-style",
    description: "Coupon, commission with per-SKU override, advertising percentage",
    shippingMode: "std",
    flags: { coupon: true, tax: false, comm: true, tsd: false, promo: false, fvf: false, cc: false, ppc: false, ad: true, commSku: true, fb: false, asin: true },
    defaults: { goal: 25, coupon: 0, comm: 15, advertising: 5, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", round: "99", target: 20 },
  },
  {
    id: "marketplace",
    label: "Marketplace (commission)",
    description: "Commission-based marketplace without tax amplification",
    shippingMode: "std",
    flags: { coupon: false, tax: false, comm: true, tsd: false, promo: false, fvf: false, cc: false, ppc: true, ad: false, commSku: false, fb: false, asin: false },
    defaults: { goal: 25, comm: 15, ppc: 0.62, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", round: "99", target: 20 },
  },
  {
    id: "dtc",
    label: "DTC (card processing)",
    description: "Direct-to-consumer with credit card processing fees",
    shippingMode: "std",
    flags: { coupon: true, tax: false, comm: false, tsd: false, promo: false, fvf: false, cc: true, ppc: true, ad: false, commSku: false, fb: false, asin: false },
    defaults: { goal: 25, coupon: 8, ccPct: 2.9, ccFlat: 0.30, ppc: 0.62, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", round: "99", target: 20 },
  },
  {
    id: "custom",
    label: "Custom",
    description: "Start from scratch and choose which fee types apply",
    shippingMode: "std",
    flags: { coupon: false, tax: false, comm: false, tsd: false, promo: false, fvf: false, cc: false, ppc: false, ad: false, commSku: false, fb: false, asin: false },
    defaults: { goal: 25, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", round: "99", target: 20 },
  },
];

export const PRICE_FIELDS = [
  { value: "priceJSP", label: "eBay List Price" },
  { value: "priceMCF", label: "eBay MCF Price" },
  { value: "priceWM", label: "Walmart Price" },
  { value: "priceShopify", label: "Shopify Price" },
  { value: "priceFBM", label: "Amazon FBM Price" },
  { value: "priceFBA", label: "Amazon FBA Price" },
];

export const SHIPPING_MODES = [
  { value: "std", label: "Standard", description: "Shipping cost per unit from the spreadsheet" },
  { value: "mcf", label: "MCF (Multi-Channel Fulfillment)", description: "MCF shipping + inbound freight costs" },
  { value: "fba", label: "FBA (Fulfilled by Amazon)", description: "FBA fulfillment cost from spreadsheet or Amazon" },
];
