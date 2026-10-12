import { prisma } from "@/lib/prisma";
import { loadProductRows } from "@/lib/db/load-product-rows";
import { loadChannelProductIds } from "@/lib/db/channel-products";
import { loadItemTypeCommissions } from "@/lib/db/item-type-commissions";
import type { ChannelWithDb, AnalysisContext } from "@/lib/pricing/compute-results";
import type { BrandRoyaltyTable, ProductRow, RoyaltyRuleEntry } from "@/lib/pricing/types";

/** Which products an analysis covers: a project's products, one channel, or the whole customer. */
export interface AnalysisScope {
  projectId?: string | null;
  /** Single-channel view: only this channel, and only its Salsify list's products when it has one. */
  channelId?: string | null;
}

/**
 * Loads everything an analysis needs for a customer. Callers must check the user can access the customer.
 * `only` narrows the result to one channel and/or some products (used by the server-side compute API).
 * Returns null when the customer, or the project within it, doesn't exist.
 */
export async function loadAnalysisInputs(
  customerId: string,
  scope: AnalysisScope,
  only: { channelId?: string; productIds?: string[] } = {},
) {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      channels: { orderBy: { sortOrder: "asc" } },
      brandRoyalties: true,
      royaltyRules: true,
    },
  });
  if (!customer) return null;

  const singleChannel = scope.projectId ? null : (customer.channels.find((c) => c.id === scope.channelId) ?? null);
  let channels = singleChannel ? [singleChannel] : customer.channels;
  if (only.channelId) channels = channels.filter((c) => c.id === only.channelId);
  const channelProductIds = await loadChannelProductIds(channels);

  let productIds: string[];
  if (scope.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: scope.projectId, customerId },
      select: { products: { select: { productId: true } } },
    });
    if (!project) return null;
    productIds = project.products.map((pp) => pp.productId);
  } else if (singleChannel && channelProductIds[singleChannel.id]) {
    productIds = channelProductIds[singleChannel.id]!;
  } else {
    productIds = (
      await prisma.product.findMany({ where: { customers: { some: { customerId } } }, select: { id: true } })
    ).map((p) => p.id);
  }
  if (only.productIds) {
    const wanted = new Set(only.productIds);
    productIds = productIds.filter((id) => wanted.has(id));
  }

  const [products, globalRules, itemTypeCommissions] = await Promise.all([
    loadProductRows(productIds, channels),
    prisma.royaltyRule.findMany({ where: { customerId: null } }),
    loadItemTypeCommissions(customerId),
  ]);

  const brandRoyalties: BrandRoyaltyTable = {};
  for (const br of customer.brandRoyalties) brandRoyalties[br.brandKey] = Number(br.value);

  const royaltyRules: RoyaltyRuleEntry[] = [
    ...globalRules.map((r) => ({
      id: r.id,
      scope: r.scope as "brand" | "sku",
      brandKey: r.brandKey ?? undefined,
      brandName: r.brandName ?? undefined,
      skus: r.skus,
      value: Number(r.value),
      mode: r.mode as "pct" | "usd",
      customerId: null as string | null,
    })),
    ...customer.royaltyRules.map((r) => ({
      id: r.id,
      scope: r.scope as "brand" | "sku",
      brandKey: r.brandKey ?? undefined,
      brandName: r.brandName ?? undefined,
      skus: r.skus,
      value: Number(r.value),
      mode: r.mode as "pct" | "usd",
      customerId: r.customerId,
      channelId: r.channelId,
    })),
  ];

  const channelsData: ChannelWithDb[] = channels.map((ch) => ({
    channelProductIds: channelProductIds[ch.id],
    id: ch.id,
    name: ch.name,
    tabLabel: ch.tabLabel,
    shippingMode: ch.shippingMode,
    priceField: ch.priceField,
    fallbackPriceField: ch.fallbackPriceField,
    channelType: ch.channelType,
    hasCoupon: ch.hasCoupon,
    hasTax: ch.hasTax,
    hasCommission: ch.hasCommission,
    hasTopSellerDisc: ch.hasTopSellerDisc,
    hasPromotedListing: ch.hasPromotedListing,
    hasFvfFixed: ch.hasFvfFixed,
    hasCardProcessing: ch.hasCardProcessing,
    hasPpc: ch.hasPpc,
    hasAdvertising: ch.hasAdvertising,
    hasPerSkuCommission: ch.hasPerSkuCommission,
    hasFallback: ch.hasFallback,
    hasAsin: ch.hasAsin,
    defaults: ch.defaults as Record<string, unknown>,
    blockedBrands: (ch.blockedBrands ?? []) as string[],
  }));

  const context: AnalysisContext = { brandRoyalties, royaltyRules, itemTypeCommissions };

  return { customer, singleChannel, channels: channelsData, products, context };
}

/** Product rows safe to send to a user without data:viewCost. */
export function withoutCost(products: ProductRow[]): ProductRow[] {
  return products.map((p) => ({ ...p, cost: null }));
}
