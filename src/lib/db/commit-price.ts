import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { mergeShippingChanges, type ShippingChanges } from "@/lib/pricing/shipping";
import { recordShippingChanges } from "@/lib/db/record-shipping";

export interface CommitPriceInput {
  customerId: string;
  channel: { id: string; name: string; priceRecordTiming: string };
  productId: string;
  sku: string;
  /** New list price, or null for a shipping-only commit. */
  price: number | null;
  oldPrice: number | null;
  oldNetMargin: number | null;
  newNetMargin: number | null;
  shipping: ShippingChanges | null;
  userId: string;
}

/**
 * Commits a price (and/or shipping) change for one SKU on one channel, the same way from the analysis and from
 * Single SKU Analysis: records it now or at publish (per the channel's timing), stages it for Salsify publish,
 * and logs it. Returns null when there's nothing to commit.
 */
export async function commitChannelPrice(input: CommitPriceInput) {
  const { customerId, channel, productId, sku, price, oldPrice, oldNetMargin, newNetMargin, shipping, userId } = input;
  const channelId = channel.id;
  const priceChanged = price != null && price > 0 && !(oldPrice != null && Math.abs(price - oldPrice) < 0.005);
  if (!priceChanged && !shipping) return null;

  const atPublish = channel.priceRecordTiming === "at_publish";

  if (!atPublish) {
    if (priceChanged) {
      await prisma.priceHistory.create({
        data: {
          id: randomUUID(),
          productId: productId,
          channelId,
          price: price!,
          previousPrice: oldPrice,
          recordedById: userId,
          source: "commit",
        },
      });
    }
    if (shipping) {
      await recordShippingChanges(productId, shipping, { recordedById: userId, source: "commit", channelId });
    }
  }

  // Stage for Salsify publish: price changes always; shipping only when it's deferred until publish.
  const stagedShipping = atPublish ? shipping : null;
  if (priceChanged || stagedShipping) {
    const existing = await prisma.salsifyStaged.findUnique({
      where: { customerId_sku_channelId: { customerId, sku, channelId } },
    });
    const shippingChanges = mergeShippingChanges(existing?.shippingChanges, stagedShipping);
    const priceFields = priceChanged
      ? { newPrice: price!, oldPrice, oldNetMargin, newNetMargin }
      : {};

    await prisma.salsifyStaged.upsert({
      where: { customerId_sku_channelId: { customerId, sku, channelId } },
      create: {
        id: randomUUID(),
        customerId,
        sku,
        channelId,
        newPrice: priceChanged ? price! : null,
        oldPrice: priceChanged ? oldPrice : null,
        oldNetMargin: priceChanged ? oldNetMargin : null,
        newNetMargin: priceChanged ? newNetMargin : null,
        shippingChanges: shippingChanges ?? undefined,
        stagedById: userId,
      },
      update: {
        ...priceFields,
        ...(shippingChanges ? { shippingChanges } : {}),
        stagedAt: new Date(),
      },
    });
  }

  const parts: string[] = [];
  if (priceChanged) parts.push(`price $${price!.toFixed(2)}`);
  if (shipping) parts.push(`shipping ${Object.entries(shipping).map(([k, v]) => `${k}=$${v.toFixed(2)}`).join(", ")}`);

  logActivity({
    action: "price.commit",
    category: "price",
    summary: `Committed ${parts.join(" and ")} for ${sku} on ${channel.name}${atPublish ? " (recorded at publish)" : ""}`,
    detail: {
      sku,
      channelId,
      channelName: channel.name,
      newPrice: priceChanged ? price : null,
      oldPrice,
      oldNetMargin,
      newNetMargin,
      shipping,
      recordTiming: channel.priceRecordTiming,
    },
    customerId,
    userId: userId,
  });

  return { priceChanged, shippingRecorded: !!shipping && !atPublish, atPublish };
}
