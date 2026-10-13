import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer } from "@/lib/permissions";
import { parseShippingChanges } from "@/lib/pricing/shipping";
import { commitChannelPrice } from "@/lib/db/commit-price";

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

  const result = await commitChannelPrice({
    customerId,
    channel,
    productId: product.id,
    sku,
    price,
    oldPrice,
    oldNetMargin,
    newNetMargin,
    shipping,
    userId: session.user.id,
  });
  if (!result) return NextResponse.json({ error: "Nothing to commit" }, { status: 400 });

  return NextResponse.json({ ok: true, priceChanged: result.priceChanged, shippingRecorded: result.shippingRecorded });
}
