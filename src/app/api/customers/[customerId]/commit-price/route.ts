import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer } from "@/lib/permissions";
import { parseShippingChanges } from "@/lib/pricing/shipping";
import { commitChannelPrice } from "@/lib/db/commit-price";
import { loadAnalysisInputs } from "@/lib/db/analysis-inputs";
import { computeChannelResults, type ChannelEdits } from "@/lib/pricing/compute-results";

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * POST { sku, channelId, price?, shipping?, settings? } — commits a SKU's price and/or shipping on a channel from the
 * analysis. The old price and both net margins are worked out here from saved data (with the channel settings the
 * user is viewing), so the Publish to Salsify page shows the margin at the committed price.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { sku, channelId } = body;
  const price = num(body.price);
  const shipping = parseShippingChanges(body.shipping);

  if (typeof sku !== "string" || !sku || typeof channelId !== "string" || !channelId)
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const channel = await prisma.salesChannel.findFirst({
    where: { id: channelId, customerId },
  });
  if (!channel) return NextResponse.json({ error: "Channel not found" }, { status: 404 });

  const product = await prisma.product.findFirst({
    where: { sku, customers: { some: { customerId } } },
  });
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

  // The SKU on this channel as saved, before and after the commit. The channel's product list and blocked brands
  // don't matter for one SKU's margin, so they're not applied.
  const inputs = await loadAnalysisInputs(customerId, {}, { channelId, productIds: [product.id] });
  const ch = inputs?.channels[0];
  if (!inputs || !ch) return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  // The channel's saved settings with any the user is trying out on top. Hide discontinued would drop the SKU from
  // the results, so it's off for this calculation.
  const settings = { ...ch.defaults, ...(isRecord(body.settings) ? body.settings : {}), hideDisc: false };
  const run = (edits: Partial<ChannelEdits>) =>
    computeChannelResults(
      ch,
      inputs.products,
      inputs.context,
      { settings, overrides: {}, shipEdits: {}, committedShip: {}, committedPrices: {}, ...edits },
      { blocked: new Set(), allowed: null },
    ).find((r) => r.sku === product.sku);
  const margin = (r: ReturnType<typeof run>) => (r && r.price > 0 && !r.invalid ? r.gm : null);

  const before = run({});
  const oldPrice = before && before.price > 0 ? before.price : null;
  const priceChanged = price != null && price > 0 && !(oldPrice != null && Math.abs(price - oldPrice) < 0.005);
  if (!priceChanged && !shipping) {
    return NextResponse.json({ error: "Nothing to commit" }, { status: 400 });
  }
  const after = priceChanged
    ? run({ overrides: { [channelId]: { [product.sku]: { price: price! } } }, shipEdits: shipping ? { [product.sku]: shipping } : {} })
    : undefined;
  const oldNetMargin = margin(before);
  const newNetMargin = priceChanged ? margin(after) : null;

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
