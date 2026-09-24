import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { ProductRow } from "@/lib/pricing/types";

const PRICE_FIELDS = [
  "priceJSP",
  "priceMCF",
  "priceWM",
  "priceShopify",
  "priceFBM",
  "priceFBA",
] as const;

const SHIPPING_FIELDS: [keyof ProductRow, string][] = [
  ["shipping", "std"],
  ["mcfShip", "mcf_ship"],
  ["mcfFreight", "mcf_freight"],
  ["fbaFee", "fba_fee"],
];

export async function upsertSalsifyProducts(
  importId: string,
  rows: ProductRow[],
): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.product.findUnique({
      where: { sku: row.sku },
    });

    let productId: string;

    if (existing) {
      productId = existing.id;
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          ...(row.name !== undefined && { name: row.name }),
          ...(row.brand !== undefined && { brand: row.brand }),
          ...(row.asin !== undefined && { asin: row.asin }),
          ...(row.fbaClass !== undefined && { fbaClass: row.fbaClass }),
          ...(row.amzCategory !== undefined && { amzCategory: row.amzCategory }),
          ...(row.amzItemType !== undefined && { amzItemType: row.amzItemType }),
        },
      });
      updated++;
    } else {
      productId = randomUUID();
      await prisma.product.create({
        data: {
          id: productId,
          sku: row.sku,
          name: row.name,
          brand: row.brand,
          asin: row.asin,
          fbaClass: row.fbaClass,
          amzCategory: row.amzCategory,
          amzItemType: row.amzItemType,
        },
      });
      created++;
    }

    if (row.cost != null) {
      const lastCost = await prisma.costHistory.findFirst({
        where: { productId },
        orderBy: { recordedAt: "desc" },
      });
      const costVal = typeof row.cost === "number" ? row.cost : 0;
      if (!lastCost || Number(lastCost.cost) !== costVal) {
        await prisma.costHistory.create({
          data: { id: randomUUID(), productId, cost: costVal, importId },
        });
      }
    }

    for (const pf of PRICE_FIELDS) {
      const val = (row as Record<string, unknown>)[pf];
      if (val != null && typeof val === "number" && val > 0) {
        const last = await prisma.productPrice.findFirst({
          where: { productId, priceField: pf },
          orderBy: { recordedAt: "desc" },
        });
        if (!last || Number(last.price) !== val) {
          await prisma.productPrice.create({
            data: { id: randomUUID(), productId, priceField: pf, price: val, importId },
          });
        }
      }
    }

    for (const [field, shippingType] of SHIPPING_FIELDS) {
      const val = row[field];
      if (val != null && typeof val === "number" && val > 0) {
        const last = await prisma.shippingCostHistory.findFirst({
          where: { productId, shippingType },
          orderBy: { recordedAt: "desc" },
        });
        if (!last || Number(last.amount) !== val) {
          await prisma.shippingCostHistory.create({
            data: { id: randomUUID(), productId, shippingType, amount: val, importId },
          });
        }
      }
    }
  }

  return { created, updated };
}
