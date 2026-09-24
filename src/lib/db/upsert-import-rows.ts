import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { ProductRow } from "@/lib/pricing/types";

interface ChannelRef {
  id: string;
  priceField: string;
}

export async function upsertImportRows(
  customerId: string,
  importId: string,
  rows: ProductRow[],
  channels: ChannelRef[],
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

    // Link product to customer
    await prisma.customerProduct.upsert({
      where: { customerId_productId: { customerId, productId } },
      update: {},
      create: { customerId, productId },
    });

    // Record cost history
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

    // Record price history per channel
    for (const ch of channels) {
      const priceVal = (row as Record<string, unknown>)[ch.priceField];
      if (priceVal != null && typeof priceVal === "number" && priceVal > 0) {
        const lastPrice = await prisma.priceHistory.findFirst({
          where: { productId, channelId: ch.id },
          orderBy: { recordedAt: "desc" },
        });
        if (!lastPrice || Number(lastPrice.price) !== priceVal) {
          await prisma.priceHistory.create({
            data: { id: randomUUID(), productId, channelId: ch.id, price: priceVal, importId },
          });
        }
      }
    }

    // Record shipping cost history
    const shippingFields: [keyof ProductRow, string][] = [
      ["shipping", "std"],
      ["mcfShip", "mcf_ship"],
      ["mcfFreight", "mcf_freight"],
      ["fbaFee", "fba_fee"],
    ];
    for (const [field, shippingType] of shippingFields) {
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
