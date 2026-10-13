import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { loadSingleSkuSetup, parseInputs } from "@/lib/single-sku";
import { SHIP_COMPONENTS } from "@/lib/pricing/shipping";

/**
 * POST { customerId, channelId, inputs } — adds a new SKU from Single SKU Analysis to the Product database:
 * creates the product, links it to the customer, and records its cost, shipping and price on the channel.
 * Requires products:update. Nothing is staged for Salsify, since the SKU doesn't exist there yet.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.customerId !== "string" || typeof body.channelId !== "string")
    return NextResponse.json({ error: "customerId and channelId required" }, { status: 400 });
  const { customerId, channelId } = body as { customerId: string; channelId: string };

  const setup = await loadSingleSkuSetup(session.user, customerId, channelId, null);
  if ("error" in setup) return NextResponse.json({ error: setup.error }, { status: setup.status });
  if (!setup.canCommit)
    return NextResponse.json({ error: "You don't have permission to add products" }, { status: 403 });

  const inputs = parseInputs(body.inputs);
  const sku = inputs.sku?.trim();
  if (!sku) return NextResponse.json({ error: "SKU is required" }, { status: 400 });
  if (inputs.cost != null && inputs.cost < 0) return NextResponse.json({ error: "Cost can't be negative" }, { status: 400 });

  const existing = await prisma.product.findUnique({ where: { sku }, select: { id: true } });
  if (existing)
    return NextResponse.json({ error: `SKU ${sku} already exists in the Product database`, productId: existing.id }, { status: 409 });

  const productId = randomUUID();
  const meta = { recordedById: session.user.id, source: "single-sku" };
  const shipping = SHIP_COMPONENTS.flatMap((c) => {
    const v = inputs.shipping?.[c.key];
    return v != null && v >= 0 ? [{ shippingType: c.shippingType, key: c.key, amount: v }] : [];
  });
  const price = inputs.price != null && inputs.price > 0 ? inputs.price : null;

  await prisma.$transaction([
    prisma.product.create({
      data: {
        id: productId,
        sku,
        name: inputs.name || null,
        brand: inputs.brand || null,
        amzItemType: inputs.amzItemType || null,
      },
    }),
    prisma.customerProduct.create({ data: { customerId, productId } }),
    ...(inputs.cost != null ? [prisma.costHistory.create({ data: { id: randomUUID(), productId, cost: inputs.cost, ...meta } })] : []),
    ...shipping.map((s) =>
      prisma.shippingCostHistory.create({
        data: { id: randomUUID(), productId, shippingType: s.shippingType, amount: s.amount, channelId, ...meta },
      }),
    ),
    ...(price != null
      ? [prisma.priceHistory.create({ data: { id: randomUUID(), productId, channelId, price, ...meta } })]
      : []),
  ]);

  logActivity({
    action: "product.create",
    category: "product",
    summary: `Added SKU ${sku} from Single SKU Analysis${price != null ? ` at $${price.toFixed(2)} on ${setup.channel.name}` : ""}`,
    detail: {
      productId,
      sku,
      name: inputs.name || null,
      brand: inputs.brand || null,
      channelId,
      channelName: setup.channel.name,
      cost: inputs.cost ?? null,
      newPrice: price,
      shipping: Object.fromEntries(shipping.map((s) => [s.key, s.amount])),
    },
    customerId,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true, productId }, { status: 201 });
}
