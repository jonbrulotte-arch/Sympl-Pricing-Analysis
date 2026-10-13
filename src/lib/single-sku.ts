import { prisma } from "@/lib/prisma";
import { canAccessCustomer, getPermissions, productVisibilityWhere } from "@/lib/permissions";
import { loadAnalysisInputs } from "@/lib/db/analysis-inputs";
import { loadProductRows } from "@/lib/db/load-product-rows";
import { computeChannelResults, toChannelConfig, type AnalysisContext, type ChannelWithDb } from "@/lib/pricing/compute-results";
import { FIELDS_UI } from "@/lib/pricing/constants";
import { brandKey } from "@/lib/pricing/helpers";
import { SHIP_COMPONENTS, type ShipComponentKey } from "@/lib/pricing/shipping";
import type { AnalysisResult, ProductRow } from "@/lib/pricing/types";

/** What the calculator lets the user set. Product fields (sku, name, brand, item type) only apply to new SKUs. */
export interface SingleSkuInputs {
  sku?: string;
  name?: string;
  brand?: string;
  amzItemType?: string;
  cost?: number | null;
  units?: number | null;
  price?: number | null;
  shipping?: Partial<Record<ShipComponentKey, number | null>>;
}

export interface SingleSkuSetup {
  channel: ChannelWithDb;
  context: AnalysisContext;
  /** Existing product row (with cost, server side only), or null for a new SKU. */
  row: ProductRow | null;
  /** True when an existing SKU's cost must stay on the server (viewer lacks data:viewCost). */
  costHidden: boolean;
  canCommit: boolean;
}

type Fail = { error: string; status: number };

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

/** Checks access and loads the channel, its pricing context and (for an existing SKU) the product. */
export async function loadSingleSkuSetup(
  user: { id: string; role: string },
  customerId: string,
  channelId: string,
  productId: string | null,
): Promise<SingleSkuSetup | Fail> {
  const permissions = await getPermissions(user.role);
  if (!permissions.has("module:singleSku")) return { error: "You don't have access to Single SKU Analysis", status: 403 };
  if (!(await canAccessCustomer(customerId, user.id, user.role))) return { error: "Forbidden", status: 403 };

  const inputs = await loadAnalysisInputs(customerId, {}, { channelId, productIds: [] });
  const channel = inputs?.channels[0];
  if (!inputs || !channel) return { error: "Channel not found", status: 404 };

  let row: ProductRow | null = null;
  if (productId) {
    const visible = await prisma.product.findFirst({
      where: { id: productId, ...(await productVisibilityWhere(user.id, user.role)) },
      select: { id: true },
    });
    if (!visible) return { error: "Product not found", status: 404 };
    [row] = await loadProductRows([productId], [channel]);
  }

  return {
    channel,
    context: inputs.context,
    row,
    costHidden: !!row && !permissions.has("data:viewCost"),
    canCommit: permissions.has("products:update"),
  };
}

/** Allocation and goal overrides, limited to known channel settings with scalar values. */
export function parseSettings(input: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!isRecord(input)) return out;
  const known = new Set(FIELDS_UI.map((f) => f.key));
  for (const [k, v] of Object.entries(input)) {
    if (!known.has(k)) continue;
    if ((typeof v === "number" && isFinite(v)) || typeof v === "string" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function parseInputs(input: unknown): SingleSkuInputs {
  const i = isRecord(input) ? input : {};
  const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : undefined);
  const shipping: SingleSkuInputs["shipping"] = {};
  if (isRecord(i.shipping)) {
    for (const c of SHIP_COMPONENTS) {
      const v = i.shipping[c.key];
      shipping[c.key] = v === null ? null : (finite(v) ?? undefined);
    }
  }
  return {
    sku: str(i.sku),
    name: str(i.name),
    brand: str(i.brand),
    amzItemType: str(i.amzItemType),
    cost: i.cost === null ? null : (finite(i.cost) ?? undefined),
    units: finite(i.units),
    price: i.price === null ? null : (finite(i.price) ?? undefined),
    shipping,
  };
}

/** Why the result may not match the full analysis for this channel. */
function warningsFor(channel: ChannelWithDb, row: ProductRow): string[] {
  const out: string[] = [];
  if ((channel.blockedBrands ?? []).some((b) => brandKey(b) === brandKey(row.brand))) {
    out.push(`${row.brand} is blocked on this channel, so it's left out of the channel's analysis.`);
  }
  if (row.productId && channel.channelProductIds && !channel.channelProductIds.includes(row.productId)) {
    out.push("This SKU isn't on the channel's Salsify product list, so it's left out of the channel's analysis.");
  }
  return out;
}

/**
 * Runs the pricing engine for one SKU on one channel with the user's inputs and allocation overrides.
 * The channel's brand blocks and product list are ignored (and reported as warnings) so any SKU can be priced.
 */
export function computeSingleSku(setup: SingleSkuSetup, inputs: SingleSkuInputs, settingsOverrides: Record<string, unknown>) {
  const { channel, context, costHidden } = setup;
  const cfg = toChannelConfig(channel);
  const base = setup.row;
  const row: ProductRow = base
    ? { ...base, channelPrices: { ...base.channelPrices } }
    : {
        sku: inputs.sku || "NEW SKU",
        name: inputs.name || undefined,
        brand: inputs.brand || undefined,
        amzItemType: inputs.amzItemType || undefined,
        cost: null,
        channelPrices: {},
      };

  if (!costHidden && inputs.cost !== undefined) row.cost = inputs.cost;
  if (inputs.units != null && inputs.units >= 1) row.units = Math.round(inputs.units);
  for (const c of SHIP_COMPONENTS) {
    const v = inputs.shipping?.[c.key];
    if (v !== undefined) (row as Record<string, unknown>)[c.key] = v;
  }
  if (inputs.price !== undefined) {
    const hasField = !!cfg.priceField && cfg.priceField !== "__none__";
    if (inputs.price != null && inputs.price > 0) {
      row.channelPrices![channel.id] = inputs.price;
      if (hasField) (row as Record<string, unknown>)[cfg.priceField] = inputs.price;
    } else {
      delete row.channelPrices![channel.id];
      if (hasField) (row as Record<string, unknown>)[cfg.priceField] = null;
    }
  }

  const settings = { ...channel.defaults, ...settingsOverrides };
  const [result] = computeChannelResults(
    { ...channel, blockedBrands: [], channelProductIds: null },
    [row],
    context,
    { settings, overrides: {}, shipEdits: {}, committedShip: {} },
  );
  const safe: AnalysisResult = costHidden ? { ...result, cost: null } : result;
  return { result: safe, settings, warnings: warningsFor(channel, row) };
}
