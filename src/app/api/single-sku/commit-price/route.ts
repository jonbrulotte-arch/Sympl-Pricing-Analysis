import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeSingleSku, loadSingleSkuSetup, parseInputs, parseSettings } from "@/lib/single-sku";
import { commitChannelPrice } from "@/lib/db/commit-price";
import { toChannelConfig } from "@/lib/pricing/compute-results";
import { shipComponentsFor, type ShippingChanges } from "@/lib/pricing/shipping";

/**
 * POST { customerId, channelId, productId, inputs, settings } — commits an existing SKU's list price (and any
 * shipping that differs from what's stored) on the channel, exactly like committing from the analysis: recorded
 * per the channel's timing and staged for Salsify publish. Cost isn't changed. Margins are computed here, so
 * they're right even for users who can't see cost.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.customerId !== "string" || typeof body.channelId !== "string" || typeof body.productId !== "string")
    return NextResponse.json({ error: "customerId, channelId and productId required" }, { status: 400 });
  const { customerId, channelId, productId } = body as { customerId: string; channelId: string; productId: string };

  const setup = await loadSingleSkuSetup(session.user, customerId, channelId, productId);
  if ("error" in setup) return NextResponse.json({ error: setup.error }, { status: setup.status });
  const row = setup.row!;

  const onCustomer = await prisma.customerProduct.findFirst({ where: { customerId, productId }, select: { productId: true } });
  if (!onCustomer)
    return NextResponse.json({ error: `${row.sku} isn't one of this customer's products, so its price can't be committed here.` }, { status: 400 });

  const channel = await prisma.salesChannel.findUnique({
    where: { id: channelId },
    select: { id: true, name: true, priceRecordTiming: true },
  });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const inputs = parseInputs(body.inputs);
  const settings = parseSettings(body.settings);
  const price = inputs.price != null && inputs.price > 0 ? inputs.price : null;
  const oldPrice = row.channelPrices?.[channelId] ?? null;

  // Margins at the new price and at the stored price, with the same inputs otherwise.
  const next = computeSingleSku(setup, inputs, settings).result;
  const before = computeSingleSku(setup, { ...inputs, price: undefined }, settings).result;
  const margin = (r: typeof next) => (r.price > 0 && !r.invalid ? r.gm : null);

  const shipping: ShippingChanges = {};
  for (const c of shipComponentsFor(toChannelConfig(setup.channel))) {
    const v = inputs.shipping?.[c.key];
    const stored = row[c.key] as number | null | undefined;
    if (v != null && v >= 0 && !(stored != null && Math.abs(stored - v) < 0.00005)) shipping[c.key] = v;
  }

  const result = await commitChannelPrice({
    customerId,
    channel,
    productId,
    sku: row.sku,
    price,
    oldPrice,
    oldNetMargin: margin(before),
    newNetMargin: price != null ? margin(next) : null,
    shipping: Object.keys(shipping).length > 0 ? shipping : null,
    userId: session.user.id,
  });
  if (!result) return NextResponse.json({ error: "Nothing to commit: the price and shipping match what's saved." }, { status: 400 });

  return NextResponse.json({ ok: true, ...result, price, shipping });
}
