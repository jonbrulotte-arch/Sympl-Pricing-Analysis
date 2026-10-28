import { prisma } from "@/lib/prisma";
import { loadProductRows } from "@/lib/db/load-product-rows";
import { loadChannelProductIds } from "@/lib/db/channel-products";
import { loadItemTypeCommissions } from "@/lib/db/item-type-commissions";
import { projectChannels } from "@/lib/projects/settings";
import type { ChannelWithDb, AnalysisContext } from "@/lib/pricing/compute-results";
import type { BrandRoyaltyTable, ProductRow, RoyaltyRuleEntry } from "@/lib/pricing/types";

/** Which products an analysis covers: a project's products, some of the customer's channels, or the whole customer. */
export interface AnalysisScope {
  projectId?: string | null;
  /** Single-channel view: only this channel, and only its Salsify list's products when it has one. */
  channelId?: string | null;
  /**
   * Selected-channels view: only these channels. Products are the union of their Salsify lists when every one has a
   * list, otherwise all the customer's products; each channel still analyzes only its own list.
   */
  channelIds?: string[] | null;
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

  const project = scope.projectId
    ? await prisma.project.findFirst({
        where: { id: scope.projectId, customerId },
        select: { settings: true, products: { select: { productId: true } } },
      })
    : null;
  if (scope.projectId && !project) return null;

  const wanted = scope.projectId ? [] : scope.channelIds?.length ? scope.channelIds : scope.channelId ? [scope.channelId] : [];
  const selectedChannels = customer.channels.filter((c) => wanted.includes(c.id));
  const singleChannel = selectedChannels.length === 1 ? selectedChannels[0] : null;
  // A project analyzes the channels enabled for it.
  let channels = project
    ? projectChannels(customer.channels, project.settings)
    : selectedChannels.length > 0
      ? selectedChannels
      : customer.channels;
  if (only.channelId) channels = channels.filter((c) => c.id === only.channelId);
  const channelProductIds = await loadChannelProductIds(channels);

  let productIds: string[];
  if (project) {
    productIds = project.products.map((pp) => pp.productId);
  } else if (selectedChannels.length > 0 && selectedChannels.every((c) => channelProductIds[c.id])) {
    productIds = [...new Set(selectedChannels.flatMap((c) => channelProductIds[c.id]!))];
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

  return { customer, singleChannel, selectedChannels, channels: channelsData, products, context };
}

/** Product rows safe to send to a user without data:viewCost. */
export function withoutCost(products: ProductRow[]): ProductRow[] {
  return products.map((p) => ({ ...p, cost: null }));
}
