import { prisma } from "@/lib/prisma";
import type { ProductRow } from "@/lib/pricing/types";

interface ChannelRef {
  id: string;
  priceField: string;
}

const SHIPPING_FIELD_MAP: Record<string, keyof ProductRow> = {
  std: "shipping",
  mcf_ship: "mcfShip",
  mcf_freight: "mcfFreight",
  fba_fee: "fbaFee",
};

type Amount = { toString(): string };

/**
 * Loads analysis rows: each product with its latest cost, shipping components and per-channel price.
 * Each history table is read in one query (DISTINCT ON the latest row per key), so the query count
 * stays constant no matter how many products or channels are loaded.
 */
export async function loadProductRows(
  productIds: string[],
  channels: ChannelRef[],
): Promise<ProductRow[]> {
  if (productIds.length === 0) return [];

  const channelIds = channels.map((c) => c.id);
  const priceFields = [...new Set(channels.map((c) => c.priceField).filter((f) => f && f !== "__none__"))];

  const [dbProducts, costs, shipping, channelPrices, fieldPrices] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      orderBy: { sku: "asc" },
    }),
    prisma.$queryRaw<{ productId: string; cost: Amount }[]>`
      SELECT DISTINCT ON ("productId") "productId", "cost"
      FROM "CostHistory"
      WHERE "productId" = ANY(${productIds}::text[])
      ORDER BY "productId", "recordedAt" DESC`,
    prisma.$queryRaw<{ productId: string; shippingType: string; amount: Amount }[]>`
      SELECT DISTINCT ON ("productId", "shippingType") "productId", "shippingType", "amount"
      FROM "ShippingCostHistory"
      WHERE "productId" = ANY(${productIds}::text[])
        AND "shippingType" = ANY(${Object.keys(SHIPPING_FIELD_MAP)}::text[])
      ORDER BY "productId", "shippingType", "recordedAt" DESC`,
    channelIds.length
      ? prisma.$queryRaw<{ productId: string; channelId: string; price: Amount }[]>`
          SELECT DISTINCT ON ("productId", "channelId") "productId", "channelId", "price"
          FROM "PriceHistory"
          WHERE "productId" = ANY(${productIds}::text[]) AND "channelId" = ANY(${channelIds}::text[])
          ORDER BY "productId", "channelId", "recordedAt" DESC`
      : Promise.resolve([]),
    priceFields.length
      ? prisma.$queryRaw<{ productId: string; priceField: string; price: Amount }[]>`
          SELECT DISTINCT ON ("productId", "priceField") "productId", "priceField", "price"
          FROM "ProductPrice"
          WHERE "productId" = ANY(${productIds}::text[]) AND "priceField" = ANY(${priceFields}::text[])
          ORDER BY "productId", "priceField", "recordedAt" DESC`
      : Promise.resolve([]),
  ]);

  const costBy = new Map(costs.map((c) => [c.productId, Number(c.cost)]));
  const shippingBy = new Map<string, Partial<ProductRow>>();
  for (const s of shipping) {
    const values = shippingBy.get(s.productId) ?? {};
    (values as Record<string, unknown>)[SHIPPING_FIELD_MAP[s.shippingType]] = Number(s.amount);
    shippingBy.set(s.productId, values);
  }
  const channelPriceBy = new Map(channelPrices.map((p) => [`${p.productId}|${p.channelId}`, Number(p.price)]));
  const fieldPriceBy = new Map(fieldPrices.map((p) => [`${p.productId}|${p.priceField}`, Number(p.price)]));

  return dbProducts.map((p) => {
    const cost = costBy.get(p.id);
    const row: ProductRow = {
      productId: p.id,
      sku: p.sku,
      name: p.name ?? undefined,
      cost: cost ?? null,
      brand: p.brand ?? undefined,
      asin: p.asin ?? undefined,
      fbaClass: p.fbaClass ?? undefined,
      amzCategory: p.amzCategory ?? undefined,
      amzItemType: p.amzItemType ?? undefined,
      invStatus: p.inventoryStatus ?? undefined,
      channelPrices: {},
      ...shippingBy.get(p.id),
    };

    for (const ch of channels) {
      const hasField = !!ch.priceField && ch.priceField !== "__none__";
      // A price recorded for this channel wins; otherwise fall back to the product's imported price field.
      const price =
        channelPriceBy.get(`${p.id}|${ch.id}`) ?? (hasField ? fieldPriceBy.get(`${p.id}|${ch.priceField}`) : undefined);
      if (price == null) continue;
      if (hasField) (row as Record<string, unknown>)[ch.priceField] = price;
      row.channelPrices![ch.id] = price;
    }

    return row;
  });
}
