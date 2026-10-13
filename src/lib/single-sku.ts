import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer, canPublishToSalsify, getPermissions, productVisibilityWhere } from "@/lib/permissions";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { updateSalsifyProducts } from "@/lib/salsify/client";
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

export type SalsifyPublishStatus =
  | { ok: true; skuPropertyId: string; pricePropertyId: string }
  | { ok: false; reason: string };

/**
 * Whether this user can publish this channel's price to Salsify: they have the Salsify Publish permission and an
 * API key, Salsify is enabled with an org, and the customer's field mapping covers the SKU and this channel's price.
 */
export async function salsifyPublishStatus(
  user: { id: string; role: string },
  customerId: string,
  channel: ChannelWithDb,
): Promise<SalsifyPublishStatus> {
  if (!(await canPublishToSalsify(user.role))) return { ok: false, reason: "You don't have the Salsify Publish permission." };
  const [appSettings, dbUser, mappings] = await Promise.all([
    prisma.appSettings.findUnique({ where: { id: "singleton" }, select: { salsifySyncEnabled: true, salsifyOrgId: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { salsifyApiKeyEncrypted: true } }),
    prisma.salsifyFieldMapping.findMany({ where: { customerId }, select: { importFieldKey: true, salsifyPropertyId: true } }),
  ]);
  if (!appSettings?.salsifySyncEnabled || !appSettings.salsifyOrgId) return { ok: false, reason: "Salsify isn't enabled in Admin Settings." };
  if (!dbUser?.salsifyApiKeyEncrypted) return { ok: false, reason: "Add your Salsify API key in My Profile." };
  const map = new Map(mappings.map((m) => [m.importFieldKey, m.salsifyPropertyId]));
  const skuPropertyId = map.get("sku");
  const pricePropertyId = channel.priceField && channel.priceField !== "__none__" ? map.get(channel.priceField) : undefined;
  if (!skuPropertyId || !pricePropertyId) {
    return { ok: false, reason: "This customer's Salsify Field Mapping doesn't cover the SKU and this channel's price." };
  }
  return { ok: true, skuPropertyId, pricePropertyId };
}

/**
 * Adds a new SKU to the Product database: creates the product, links it to the customer, and records its cost,
 * shipping and channel price as created in Single SKU Analysis.
 */
export async function createSingleSkuProduct(
  setup: SingleSkuSetup,
  userId: string,
  customerId: string,
  inputs: SingleSkuInputs,
): Promise<{ productId: string; sku: string; price: number | null } | (Fail & { productId?: string })> {
  if (!setup.canCommit) return { error: "You don't have permission to add products", status: 403 };
  const sku = inputs.sku?.trim();
  if (!sku) return { error: "SKU is required", status: 400 };
  if (inputs.cost != null && inputs.cost < 0) return { error: "Cost can't be negative", status: 400 };

  const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (existing) return { error: `SKU ${sku} already exists in the Product database`, status: 409, productId: existing.id };

  const { channel } = setup;
  const productId = randomUUID();
  const meta = { recordedById: userId, source: "single-sku" };
  const shipping = SHIP_COMPONENTS.flatMap((c) => {
    const v = inputs.shipping?.[c.key];
    return v != null && v >= 0 ? [{ shippingType: c.shippingType, key: c.key, amount: v }] : [];
  });
  const price = inputs.price != null && inputs.price > 0 ? inputs.price : null;

  await prisma.$transaction([
    prisma.product.create({
      data: { id: productId, sku, name: inputs.name || null, brand: inputs.brand || null, amzItemType: inputs.amzItemType || null },
    }),
    prisma.customerProduct.create({ data: { customerId, productId } }),
    ...(inputs.cost != null ? [prisma.costHistory.create({ data: { id: randomUUID(), productId, cost: inputs.cost, ...meta } })] : []),
    ...shipping.map((x) =>
      prisma.shippingCostHistory.create({
        data: { id: randomUUID(), productId, shippingType: x.shippingType, amount: x.amount, channelId: channel.id, ...meta },
      }),
    ),
    ...(price != null ? [prisma.priceHistory.create({ data: { id: randomUUID(), productId, channelId: channel.id, price, ...meta } })] : []),
  ]);

  logActivity({
    action: "product.create",
    category: "product",
    summary: `Added SKU ${sku} from Single SKU Analysis${price != null ? ` at $${price.toFixed(2)} on ${channel.name}` : ""}`,
    detail: {
      productId,
      sku,
      name: inputs.name || null,
      brand: inputs.brand || null,
      channelId: channel.id,
      channelName: channel.name,
      cost: inputs.cost ?? null,
      newPrice: price,
      shipping: Object.fromEntries(shipping.map((x) => [x.key, x.amount])),
    },
    customerId,
    userId,
  });

  return { productId, sku, price };
}

/**
 * Publishes a SKU's list price on the channel to Salsify. For an existing SKU the price is then recorded like any
 * publish (price history with the previous price, and any staged price for this SKU and channel is cleared, since
 * it's superseded). A new SKU's price was already recorded when it was added, so only the publish is logged.
 */
export async function publishSingleSkuPrice(opts: {
  setup: SingleSkuSetup;
  user: { id: string; role: string };
  customerId: string;
  sku: string;
  productId: string;
  price: number;
  isNew: boolean;
  status: Extract<SalsifyPublishStatus, { ok: true }>;
}): Promise<{ ok: true } | Fail> {
  const { setup, user, customerId, sku, productId, price, isNew, status } = opts;
  const { channel } = setup;
  const creds = await resolveSalsifyCredentials(user.id);
  if (!creds.ok) return { error: creds.error, status: creds.status };

  let failure: string | null = null;
  try {
    const result = await updateSalsifyProducts(creds.credentials.organizationId, creds.credentials.apiKey, [
      { sku, skuPropertyId: status.skuPropertyId, properties: { [status.pricePropertyId]: price } },
    ]);
    if (!result.succeeded.includes(sku)) failure = result.failed[0]?.error ?? "Salsify didn't accept the update";
  } catch (err) {
    failure = err instanceof Error ? err.message : "Couldn't reach Salsify";
  }
  if (failure) return { error: `Publish to Salsify failed: ${failure}`, status: 502 };

  const oldPrice = isNew ? null : (setup.row?.channelPrices?.[channel.id] ?? null);
  if (!isNew) {
    if (oldPrice == null || Math.abs(oldPrice - price) >= 0.005) {
      await prisma.priceHistory.create({
        data: { id: randomUUID(), productId, channelId: channel.id, price, previousPrice: oldPrice, recordedById: user.id, source: "publish" },
      });
    }
    const staged = await prisma.salsifyStaged.findUnique({
      where: { customerId_sku_channelId: { customerId, sku, channelId: channel.id } },
    });
    if (staged?.newPrice != null) {
      if (staged.shippingChanges == null) await prisma.salsifyStaged.delete({ where: { id: staged.id } });
      else await prisma.salsifyStaged.update({ where: { id: staged.id }, data: { newPrice: null, oldPrice: null, oldNetMargin: null, newNetMargin: null } });
    }
  }

  logActivity({
    action: "salsify.publish",
    category: "publish",
    summary: `Published ${sku} at $${price.toFixed(2)} on ${channel.name} to Salsify from Single SKU Analysis${isNew ? " (new SKU)" : ""}`,
    detail: { sku, productId, channelId: channel.id, channelName: channel.name, oldPrice, newPrice: price, source: "single-sku", newSku: isNew },
    customerId,
    userId: user.id,
  });
  return { ok: true };
}
