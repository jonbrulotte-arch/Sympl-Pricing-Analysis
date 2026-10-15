import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { SHIP_COMPONENTS, type ShippingChanges } from "@/lib/pricing/shipping";

/** Who recorded a shipping change and from where, stored on each ShippingCostHistory row. */
export interface ShippingChangeMeta {
  recordedById: string;
  source: "commit" | "publish";
  channelId: string;
}

/** Appends ShippingCostHistory rows for components whose value differs from the latest recorded amount. */
export async function recordShippingChanges(
  productId: string,
  changes: ShippingChanges,
  meta: ShippingChangeMeta,
): Promise<number> {
  let written = 0;
  for (const c of SHIP_COMPONENTS) {
    const amount = changes[c.key];
    if (amount == null) continue;
    const last = await prisma.shippingCostHistory.findFirst({
      where: { productId, shippingType: c.shippingType },
      orderBy: { recordedAt: "desc" },
      select: { amount: true },
    });
    if (last && Number(last.amount).toFixed(4) === amount.toFixed(4)) continue;
    await prisma.shippingCostHistory.create({
      data: { id: randomUUID(), productId, shippingType: c.shippingType, amount, ...meta },
    });
    written++;
  }
  return written;
}
