import { prisma } from "@/lib/prisma";

/** null/"" = all channels; a channel id must belong to the customer. Returns false when it doesn't. */
export async function resolveChannelId(customerId: string, input: unknown): Promise<string | null | false> {
  if (input == null || input === "") return null;
  if (typeof input !== "string") return false;
  const ch = await prisma.salesChannel.findFirst({ where: { id: input, customerId }, select: { id: true } });
  return ch ? ch.id : false;
}

export function serializeRule(r: {
  id: string;
  scope: string;
  brandKey: string | null;
  brandName: string | null;
  skus: string[];
  value: unknown;
  mode: string;
  channelId: string | null;
  channel?: { name: string } | null;
}) {
  return {
    id: r.id,
    scope: r.scope,
    brandKey: r.brandKey,
    brandName: r.brandName,
    skus: r.skus,
    value: Number(r.value),
    mode: r.mode,
    channelId: r.channelId,
    channelName: r.channel?.name ?? null,
  };
}
