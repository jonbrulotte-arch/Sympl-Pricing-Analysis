import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer } from "@/lib/permissions";
import { parseShippingChanges, mergeShippingChanges } from "@/lib/pricing/shipping";
import { recordShippingChanges } from "@/lib/db/record-shipping";

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { sku, channelId } = body;
  const price = num(body.price);
  const oldPrice = num(body.oldPrice);
  const oldNetMargin = num(body.oldNetMargin);
  const newNetMargin = num(body.newNetMargin);
  const shipping = parseShippingChanges(body.shipping);

  if (!sku || !channelId) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const priceChanged = price != null && price > 0 && !(oldPrice != null && Math.abs(price - oldPrice) < 0.005);
  if (!priceChanged && !shipping) {
    return NextResponse.json({ error: "Nothing to commit" }, { status: 400 });
  }

  const channel = await prisma.salesChannel.findFirst({
    where: { id: channelId, customerId },
  });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const product = await prisma.product.findFirst({
    where: { sku, customers: { some: { customerId } } },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  const atPublish = channel.priceRecordTiming === "at_publish";

  if (!atPublish) {
    if (priceChanged) {
      await prisma.priceHistory.create({
        data: { id: randomUUID(), productId: product.id, channelId, price: price! },
      });
    }
    if (shipping) await recordShippingChanges(product.id, shipping);
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
        stagedById: session.user.id,
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
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true, priceChanged, shippingRecorded: !!shipping && !atPublish });
}
