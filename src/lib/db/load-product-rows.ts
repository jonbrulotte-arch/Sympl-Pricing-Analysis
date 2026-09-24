import { prisma } from "@/lib/prisma";
import type { ProductRow } from "@/lib/pricing/types";

interface ChannelRef {
  id: string;
  priceField: string;
}

const SHIPPING_TYPES = ["std", "mcf_ship", "mcf_freight", "fba_fee"] as const;

const SHIPPING_FIELD_MAP: Record<string, keyof ProductRow> = {
  std: "shipping",
  mcf_ship: "mcfShip",
  mcf_freight: "mcfFreight",
  fba_fee: "fbaFee",
};

export async function loadProductRows(
  productIds: string[],
  channels: ChannelRef[],
): Promise<ProductRow[]> {
  if (productIds.length === 0) return [];

  const dbProducts = await prisma.product.findMany({
    where: { id: { in: productIds } },
    orderBy: { sku: "asc" },
  });

  const products: ProductRow[] = [];

  for (const p of dbProducts) {
    const latestCost = await prisma.costHistory.findFirst({
      where: { productId: p.id },
      orderBy: { recordedAt: "desc" },
    });

    const shippingValues: Partial<ProductRow> = {};
    for (const st of SHIPPING_TYPES) {
      const latest = await prisma.shippingCostHistory.findFirst({
        where: { productId: p.id, shippingType: st },
        orderBy: { recordedAt: "desc" },
      });
      if (latest) {
        shippingValues[SHIPPING_FIELD_MAP[st] as keyof ProductRow] = Number(latest.amount) as never;
      }
    }

    const row: ProductRow = {
      sku: p.sku,
      name: p.name ?? undefined,
      cost: latestCost ? Number(latestCost.cost) : null,
      brand: p.brand ?? undefined,
      asin: p.asin ?? undefined,
      fbaClass: p.fbaClass ?? undefined,
      amzCategory: p.amzCategory ?? undefined,
      amzItemType: p.amzItemType ?? undefined,
      channelPrices: {},
      ...shippingValues,
    };

    for (const ch of channels) {
      const latestPrice = await prisma.priceHistory.findFirst({
        where: { productId: p.id, channelId: ch.id },
        orderBy: { recordedAt: "desc" },
      });
      if (latestPrice) {
        const price = Number(latestPrice.price);
        if (ch.priceField && ch.priceField !== "__none__") {
          (row as Record<string, unknown>)[ch.priceField] = price;
        }
        row.channelPrices![ch.id] = price;
      } else if (ch.priceField && ch.priceField !== "__none__") {
        const productPrice = await prisma.productPrice.findFirst({
          where: { productId: p.id, priceField: ch.priceField },
          orderBy: { recordedAt: "desc" },
        });
        if (productPrice) {
          const price = Number(productPrice.price);
          (row as Record<string, unknown>)[ch.priceField] = price;
          row.channelPrices![ch.id] = price;
        }
      }
    }

    products.push(row);
  }

  return products;
}
