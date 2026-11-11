/** Customer and promotional margins for Commercial / Retail channels in Single SKU Analysis (shared with the browser). */

export interface RetailInputs {
  /** What the customer sells the SKU for, per unit. */
  sellingPrice?: number | null;
  /** The customer's own cost to fulfill an order, per unit (optional). */
  fulfillment?: number | null;
  /**
   * Promotional discount tiers off our list price, in percent (5 = 5%), up to MAX_PROMO_TIERS. In each, the customer's
   * selling price drops by the same %.
   */
  promoPcts?: number[];
}

export const MAX_PROMO_TIERS = 2;

/** Margins for one scenario (regular or promotional), per unit. */
export interface RetailScenario {
  /** Our price to the customer, which is the customer's cost. */
  ourPrice: number;
  ourNetMargin: number | null;
  ourNet: number | null;
  /** The customer's figures, when their selling price is entered. */
  customer: {
    sellingPrice: number;
    grossMargin: number;
    gross: number;
    fulfillment: number;
    netMargin: number;
    net: number;
  } | null;
}

export interface RetailComparison {
  regular: RetailScenario | null;
  /** One per discount tier, smallest discount first. `promo` is a fraction (0.05). */
  promotions: { promo: number; scenario: RetailScenario }[];
}
