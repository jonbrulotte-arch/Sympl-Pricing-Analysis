import { prisma } from "@/lib/prisma";
import type { ItemTypeCommissionTable } from "@/lib/pricing/types";

/** A customer's Item Type commission overrides as { itemTypeKey: percent }. */
export async function loadItemTypeCommissions(customerId: string): Promise<ItemTypeCommissionTable> {
  const rows = await prisma.itemTypeCommission.findMany({
    where: { customerId },
    select: { itemTypeKey: true, commission: true },
  });
  return Object.fromEntries(rows.map((r) => [r.itemTypeKey, Number(r.commission)]));
}
