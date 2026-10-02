import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { sku, channelId, price, oldPrice, oldNetMargin, newNetMargin } = await req.json();

  if (!sku || !channelId || typeof price !== "number" || price <= 0) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (typeof oldPrice === "number" && Math.abs(price - oldPrice) < 0.005) {
    return NextResponse.json({ error: "Price unchanged" }, { status: 400 });
  }

  const channel = await prisma.salesChannel.findFirst({
    where: { id: channelId, customerId },
  });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const product = await prisma.product.findFirst({
    where: { sku, customers: { some: { customerId } } },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  if ((channel as Record<string, unknown>).priceRecordTiming !== "at_publish") {
    await prisma.priceHistory.create({
      data: {
        id: randomUUID(),
        productId: product.id,
        channelId,
        price,
      },
    });
  }

  await prisma.salsifyStaged.upsert({
    where: { customerId_sku_channelId: { customerId, sku, channelId } },
    create: {
      id: randomUUID(),
      customerId,
      sku,
      channelId,
      newPrice: price,
      oldPrice: typeof oldPrice === "number" ? oldPrice : null,
      oldNetMargin: typeof oldNetMargin === "number" ? oldNetMargin : null,
      newNetMargin: typeof newNetMargin === "number" ? newNetMargin : null,
      stagedById: session.user.id,
    },
    update: {
      newPrice: price,
      oldPrice: typeof oldPrice === "number" ? oldPrice : null,
      oldNetMargin: typeof oldNetMargin === "number" ? oldNetMargin : null,
      newNetMargin: typeof newNetMargin === "number" ? newNetMargin : null,
      stagedAt: new Date(),
    },
  });

  logActivity({
    action: "price.commit",
    category: "price",
    summary: `Committed price $${price.toFixed(2)} for ${sku} on ${channel.name}`,
    detail: { sku, channelId, channelName: channel.name, newPrice: price, oldPrice: oldPrice ?? null, oldNetMargin: oldNetMargin ?? null, newNetMargin: newNetMargin ?? null },
    customerId,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
