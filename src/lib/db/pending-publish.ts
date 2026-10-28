import { prisma } from "@/lib/prisma";
import type { ProductRow } from "@/lib/pricing/types";
import { parseShippingChanges } from "@/lib/pricing/shipping";

/**
 * Applies commits that are waiting on Publish to Salsify. On channels that record prices at publish, a committed
 * price (and deferred shipping) isn't in the history yet, so it's laid over the loaded rows here; otherwise the
 * analysis would show the old price after a refresh. Returns the SKUs with a pending commit on each channel, so
 * the analysis can show them as committed.
 */
export async function applyPendingPublish(
  customerId: string,
  channels: { id: string; priceField: string; priceRecordTiming: string }[],
  products: ProductRow[],
): Promise<Record<string, string[]>> {
  const pending: Record<string, string[]> = {};
  if (channels.length === 0 || products.length === 0) return pending;

  const staged = await prisma.salsifyStaged.findMany({
    where: { customerId, channelId: { in: channels.map((c) => c.id) }, sku: { in: products.map((p) => p.sku) } },
    select: { sku: true, channelId: true, newPrice: true, shippingChanges: true },
  });
  const rowBySku = new Map(products.map((p) => [p.sku, p]));
  const channelById = new Map(channels.map((c) => [c.id, c]));

  for (const s of staged) {
    (pending[s.channelId] ??= []).push(s.sku);
    const ch = channelById.get(s.channelId);
    const row = rowBySku.get(s.sku);
    if (!ch || !row || ch.priceRecordTiming !== "at_publish") continue;
    if (s.newPrice != null) {
      const price = Number(s.newPrice);
      row.channelPrices = { ...row.channelPrices, [ch.id]: price };
      if (ch.priceField && ch.priceField !== "__none__") (row as Record<string, unknown>)[ch.priceField] = price;
    }
    const shipping = parseShippingChanges(s.shippingChanges);
    if (shipping) Object.assign(row, shipping);
  }
  return pending;
}
