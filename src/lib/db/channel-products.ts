import { prisma } from "@/lib/prisma";

/**
 * Product ids allowed on each channel. Channels backed by a Salsify product list
 * get their list's product ids; channels without a list map to null (no restriction).
 */
export async function loadChannelProductIds(
  channels: { id: string; salsifyListId: string | null }[],
): Promise<Record<string, string[] | null>> {
  const listed = channels.filter((c) => c.salsifyListId).map((c) => c.id);
  const rows = listed.length
    ? await prisma.channelProduct.findMany({
        where: { channelId: { in: listed } },
        select: { channelId: true, productId: true },
      })
    : [];

  const out: Record<string, string[] | null> = {};
  for (const c of channels) out[c.id] = c.salsifyListId ? [] : null;
  for (const r of rows) out[r.channelId]!.push(r.productId);
  return out;
}
