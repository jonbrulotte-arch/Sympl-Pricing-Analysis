import type { ChannelConfig } from "./types";

export const ROUND_OPTS: [string, string][] = [
  ["cent", "Nearest cent"],
  ["99", ".99 ending"],
  ["95", ".95 ending"],
  ["05", "$0.05 up"],
  ["25", "$0.25 up"],
  ["1", "Whole dollar up"],
];

export const SECTIONS = [
  { id: "goal", title: "Goal", note: "Any SKU on this channel landing under this gets a recommended list price that clears it." },
  { id: "market", title: "Marketplace assumptions", note: "Applied to every SKU on this channel." },
  { id: "royalty", title: "Royalty", note: "Charged on the sale after coupons, not on the list price. Used when the sheet has no royalty value for a SKU." },
  { id: "returns", title: "Returns and warranty", note: "Allowance for returns and defects, taken as a share of the sale after discounts." },
  { id: "brands", title: "Brand availability", note: "Turn off any brand this channel cannot sell. Blocked brands leave this analysis entirely." },
  { id: "life", title: "Inventory and lifecycle", note: "Discontinued SKUs are in sell down or liquidation, so they are judged against their own goal." },
  { id: "rules", title: "Repricing rules", note: "How recommended prices are rounded and judged." },
];

export interface FieldUiDef {
  sec: string;
  key: string;
  label: string;
  hint?: string;
  unit?: string;
  type?: string;
  flag?: string;
  opts?: [string, string][];
}

export const FIELDS_UI: FieldUiDef[] = [
  { sec: "goal", key: "goal", label: "Goal net GM%", unit: "%" },
  { sec: "market", key: "coupon", label: "Coupon discount", unit: "%", flag: "coupon" },
  { sec: "market", key: "tax", label: "Sales tax collected", hint: "(on the post-coupon price)", unit: "%", flag: "tax" },
  { sec: "market", key: "comm", label: "Category commission", unit: "%", flag: "comm" },
  { sec: "market", key: "tsd", label: "Top seller discount", hint: "(off the final value fee)", unit: "%", flag: "tsd" },
  { sec: "market", key: "promo", label: "Promoted listing fee", unit: "%", flag: "promo" },
  { sec: "market", key: "fvf", label: "Final value fee, fixed", unit: "$", flag: "fvf" },
  { sec: "market", key: "ccPct", label: "CC processing rate", unit: "%", flag: "cc" },
  { sec: "market", key: "ccFlat", label: "CC fee per order", unit: "$", flag: "cc" },
  { sec: "market", key: "advertising", label: "Advertising", unit: "%", flag: "ad" },
  { sec: "market", key: "ppc", label: "PPC fee per unit", unit: "$", flag: "ppc" },
  { sec: "royalty", key: "roymode", label: "Royalty column reads as", type: "select", opts: [["pct", "% of list price"], ["usd", "$ per unit"]] },
  { sec: "royalty", key: "roy", label: "Default royalty", hint: "(of the post-coupon sale)", unit: "%" },
  { sec: "royalty", key: "royaltySource", label: "When both exist, prefer", type: "select", opts: [["sheet", "Royalty column"], ["brand", "Brand table"]] },
  { sec: "returns", key: "returns", label: "Returns and warranty allocation", unit: "%" },
  { sec: "life", key: "hideDisc", label: "Hide discontinued SKUs from this analysis", type: "check" },
  { sec: "life", key: "sellGoal", label: "Sell-down goal net GM%", hint: "(discontinued)", unit: "%" },
  { sec: "life", key: "excludeDisc", label: "Keep discontinued out of the change report", type: "check" },
  { sec: "life", key: "excludeOOS", label: "Keep zero-stock SKUs out of the change report", type: "check" },
  { sec: "life", key: "lowStock", label: "Flag stock at or below", hint: "(units)", unit: "" },
  { sec: "rules", key: "priceFallback", label: "Use fallback price when this channel is blank", type: "check", flag: "fb" },
  { sec: "rules", key: "round", label: "Round new price to", type: "select", opts: ROUND_OPTS },
  { sec: "rules", key: "target", label: "Target profit", hint: "(of cost)", unit: "%" },
];

export const IMPORT_FIELDS = [
  { key: "sku", label: "SKU", req: true, cand: ["sku", "skuid", "itemid", "itemnumber", "mpn", "partnumber", "customlabel"] },
  { key: "name", label: "Item name", req: false, cand: ["itemname", "name", "title", "itemtitle", "productname", "description"] },
  { key: "cost", label: "SKU cost", req: true, cand: ["skucost", "landedcost", "cost", "unitcost", "itemcost", "cogs"] },
  { key: "priceJSP", label: "eBay list price", req: false, cand: ["ebaylistprice", "ebayprice", "ebayjspprice", "listingprice", "listprice", "price"] },
  { key: "priceMCF", label: "eBay MCF price", req: false, cand: ["ebaylistpricemcf", "mcflistprice", "ebaymcfprice", "mcfprice"] },
  { key: "priceWM", label: "Walmart price", req: false, cand: ["wmcommarketplaceprice", "walmartprice", "wmprice", "walmartmarketplaceprice", "wmcomprice"] },
  { key: "priceShopify", label: "Shopify price", req: false, cand: ["shopifywebsiteprice", "shopifyprice", "websiteprice", "dtcprice"] },
  { key: "priceFBM", label: "Amazon FBM price", req: false, cand: ["amzrakprice", "amazonfbmprice", "amzfbmprice", "fbmprice", "amazonlistprice", "amazonprice", "amzprice"] },
  { key: "priceFBA", label: "Amazon FBA price", req: false, cand: ["amzrakfbaprice", "amazonfbaprice", "amzfbaprice", "fbaprice", "fbalistprice"] },
  { key: "shipping", label: "Shipping cost", req: false, cand: ["shippingcost", "shipcost", "shipping", "freight", "outboundshipping"] },
  { key: "mcfShip", label: "MCF shipping cost", req: false, cand: ["mcfshippingcost", "mcfshipping", "mcffulfillmentfee", "mcffee"] },
  { key: "mcfFreight", label: "To MCF freight", req: false, cand: ["tomcffreightcost", "mcffreightcost", "tomcffreight", "inboundfreight", "freighttomcf"] },
  { key: "royalty", label: "Royalty", req: false, cand: ["royalty", "royaltyrate", "royaltyfee", "licensefee"] },
  { key: "units", label: "Total units", req: false, cand: ["totalunits", "units", "qty", "quantity", "packqty", "multipack"] },
  { key: "ppc", label: "PPC fee", req: false, cand: ["ppcfee", "ppc", "adfee", "adspend", "advertisingfee"] },
  { key: "fvfFixed", label: "FVF fixed", req: false, cand: ["finalvaluefeefixed", "fvffixed", "fixedfee", "perorderfee"] },
  { key: "fbaFee", label: "FBA fulfillment cost", req: false, cand: ["fbafulfillmentcost", "fbafullfilmentcost", "fbafullfillmentcost", "fbafulfilmentcost", "fbafulfillmentfee", "fbafee", "fbacost", "fulfillmentcost", "fullfilmentcost"] },
  { key: "fbaClass", label: "FBA fulfillment class", req: false, cand: ["fbafulfillmentclass", "fbafulfilmentclass", "fbaclass", "sizetier", "fbasizetier"] },
  { key: "asin", label: "Amazon ASIN", req: false, cand: ["amazonasin", "asin", "amznasin"] },
  { key: "amzCategory", label: "Amazon category", req: false, cand: ["amazoncategory", "amzcategory", "amazonbrowsenode"] },
  { key: "amzItemType", label: "Amazon item type", req: false, cand: ["amazonitemtype", "amzitemtype", "itemtype"] },
  { key: "amzCommission", label: "Amazon category commission", req: false, cand: ["amazoncategorycommission", "amazoncommission", "amzcommission", "referralfee", "referralfeerate", "categorycommission"] },
  { key: "brand", label: "Brand", req: false, cand: ["brand", "brandname", "manufacturer", "mfg", "mfr", "vendor", "supplier"] },
  { key: "invStatus", label: "Inventory status (ERP)", req: false, cand: ["inventorystatuserp", "inventorystatus", "erpstatus", "erpinventorystatus", "itemstatus", "lifecycle", "skustatus"] },
  { key: "available", label: "Available inventory", req: false, cand: ["availableinventory", "availableunits", "available", "onhandpickableunits", "pickableunits", "onhandunits", "onhand", "qtyavailable", "quantityavailable", "availableqty"] },
];

export const DEFAULT_CHANNELS: Omit<ChannelConfig, "id">[] = [
  {
    name: "eBay (JSP)", tabLabel: "eBay (JSP)", shippingMode: "std", priceField: "priceJSP",
    flags: { coupon: true, tax: true, comm: true, tsd: true, promo: true, fvf: true, cc: false, ppc: true, ad: false, commSku: false, fb: false, asin: false },
    defaults: { goal: 25, coupon: 8, tax: 6.44, comm: 11.5, tsd: 10, promo: 8, fvf: 0.20, ppc: 0.62, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", hideDisc: false, sellGoal: 0, excludeDisc: true, excludeOOS: true, lowStock: 5, round: "99", target: 20 },
  },
  {
    name: "eBay (MCF)", tabLabel: "eBay (MCF)", shippingMode: "mcf", priceField: "priceMCF", fallbackPriceField: "priceJSP",
    flags: { coupon: true, tax: true, comm: true, tsd: true, promo: true, fvf: true, cc: false, ppc: true, ad: false, commSku: false, fb: true, asin: false },
    defaults: { goal: 25, coupon: 8, tax: 6.44, comm: 11.5, tsd: 10, promo: 8, fvf: 0.20, ppc: 0.62, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", hideDisc: false, sellGoal: 0, excludeDisc: true, excludeOOS: true, lowStock: 5, priceFallback: true, round: "99", target: 20 },
  },
  {
    name: "Walmart Marketplace", tabLabel: "Walmart", shippingMode: "std", priceField: "priceWM", fallbackPriceField: "priceJSP",
    flags: { coupon: false, tax: false, comm: true, tsd: false, promo: false, fvf: false, cc: false, ppc: true, ad: false, commSku: false, fb: true, asin: false },
    defaults: { goal: 25, comm: 15, ppc: 0.62, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", hideDisc: false, sellGoal: 0, excludeDisc: true, excludeOOS: true, lowStock: 5, priceFallback: false, round: "99", target: 20 },
  },
  {
    name: "Amazon FBA", tabLabel: "Amazon FBA", shippingMode: "fba", priceField: "priceFBA", fallbackPriceField: "priceFBM",
    flags: { coupon: true, tax: false, comm: true, tsd: false, promo: false, fvf: false, cc: false, ppc: false, ad: true, commSku: true, fb: true, asin: true },
    defaults: { goal: 25, coupon: 0, comm: 15, advertising: 5, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", hideDisc: false, sellGoal: 0, excludeDisc: true, excludeOOS: true, lowStock: 5, priceFallback: true, round: "99", target: 20 },
  },
  {
    name: "Amazon FBM", tabLabel: "Amazon FBM", shippingMode: "std", priceField: "priceFBM",
    flags: { coupon: true, tax: false, comm: true, tsd: false, promo: false, fvf: false, cc: false, ppc: false, ad: true, commSku: true, fb: false, asin: true },
    defaults: { goal: 25, coupon: 0, comm: 15, advertising: 5, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", hideDisc: false, sellGoal: 0, excludeDisc: true, excludeOOS: true, lowStock: 5, round: "99", target: 20 },
  },
  {
    name: "Shopify Websites", tabLabel: "Shopify", shippingMode: "std", priceField: "priceShopify", fallbackPriceField: "priceJSP",
    flags: { coupon: true, tax: false, comm: false, tsd: false, promo: false, fvf: false, cc: true, ppc: true, ad: false, commSku: false, fb: true, asin: false },
    defaults: { goal: 25, coupon: 8, ccPct: 2.9, ccFlat: 0.30, ppc: 0.62, roymode: "pct", roy: 6.9, returns: 2, royaltySource: "sheet", hideDisc: false, sellGoal: 0, excludeDisc: true, excludeOOS: true, lowStock: 5, priceFallback: false, round: "99", target: 20 },
  },
];
