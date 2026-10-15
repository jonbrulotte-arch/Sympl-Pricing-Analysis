import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSingleSkuProduct, parseChannelPrices, loadSingleSkuSetup, parseInputs } from "@/lib/single-sku";

/**
 * POST { customerId, channelId, inputs } — adds a new SKU from Single SKU Analysis to the Product database:
 * creates the product, links it to the customer, and records its cost, shipping and price on the channel.
 * Requires products:update. Nothing goes to Salsify (see the publish route for that).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.customerId !== "string" || typeof body.channelId !== "string")
    return NextResponse.json({ error: "customerId and channelId required" }, { status: 400 });

  const setup = await loadSingleSkuSetup(session.user, body.customerId, body.channelId, null);
  if ("error" in setup) return NextResponse.json({ error: setup.error }, { status: setup.status });

  const created = await createSingleSkuProduct(setup, session.user.id, body.customerId, parseInputs(body.inputs), parseChannelPrices(body.channelPrices));
  if ("error" in created) {
    return NextResponse.json({ error: created.error, productId: created.productId }, { status: created.status });
  }
  return NextResponse.json({ ok: true, productId: created.productId }, { status: 201 });
}
