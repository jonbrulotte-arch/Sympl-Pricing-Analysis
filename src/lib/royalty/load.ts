import { prisma } from "@/lib/prisma";
import { getAccessibleCustomerIds } from "@/lib/permissions";

export interface RuleRecord {
  id: string;
  scope: "brand" | "sku";
  brandKey: string | null;
  brandName: string | null;
  skus: string[];
  value: number;
  mode: "pct" | "usd";
  customerId: string | null;
  customerName: string | null;
  channelId: string | null;
  channelName: string | null;
}

export interface CustomerWithChannels {
  id: string;
  name: string;
  channels: { id: string; name: string }[];
}

/** Global rules plus the overrides of every customer the user can access, with names for display and export. */
export async function loadAccessibleRules(
  userId: string,
  role: string,
): Promise<{ customers: CustomerWithChannels[]; rules: RuleRecord[] }> {
  const customerIds = await getAccessibleCustomerIds(userId, role);
  const [customers, rules] = await Promise.all([
    prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true, channels: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } } },
      orderBy: { name: "asc" },
    }),
    prisma.royaltyRule.findMany({
      where: { OR: [{ customerId: null }, { customerId: { in: customerIds } }] },
      include: { customer: { select: { name: true } }, channel: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    customers,
    rules: rules.map((r) => ({
      id: r.id,
      scope: r.scope as "brand" | "sku",
      brandKey: r.brandKey,
      brandName: r.brandName,
      skus: r.skus,
      value: Number(r.value),
      mode: r.mode as "pct" | "usd",
      customerId: r.customerId,
      customerName: r.customer?.name ?? null,
      channelId: r.channelId,
      channelName: r.channel?.name ?? null,
    })),
  };
}
