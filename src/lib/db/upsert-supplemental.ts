import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

interface SupplementalRow {
  sku: string;
  cost?: number | null;
  mcfFreight?: number | null;
}

export async function upsertSupplementalData(
  importId: string,
  rows: SupplementalRow[],
): Promise<{ updated: number; notFound: string[] }> {
  let updated = 0;
  const notFound: string[] = [];

  for (const row of rows) {
    const product = await prisma.product.findUnique({
      where: { sku: row.sku },
      select: { id: true },
    });

    if (!product) {
      notFound.push(row.sku);
      continue;
    }

    const productId = product.id;
    let changed = false;

    if (row.cost != null) {
      const lastCost = await prisma.costHistory.findFirst({
        where: { productId },
        orderBy: { recordedAt: "desc" },
      });
      if (!lastCost || Number(lastCost.cost) !== row.cost) {
        await prisma.costHistory.create({
          data: { id: randomUUID(), productId, cost: row.cost, importId },
        });
        changed = true;
      }
    }

    if (row.mcfFreight != null && row.mcfFreight > 0) {
      const last = await prisma.shippingCostHistory.findFirst({
        where: { productId, shippingType: "mcf_freight" },
        orderBy: { recordedAt: "desc" },
      });
      if (!last || Number(last.amount) !== row.mcfFreight) {
        await prisma.shippingCostHistory.create({
          data: { id: randomUUID(), productId, shippingType: "mcf_freight", amount: row.mcfFreight, importId },
        });
        changed = true;
      }
    }

    if (changed) updated++;
  }

  return { updated, notFound };
}
