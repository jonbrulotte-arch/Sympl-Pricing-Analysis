import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createSingleSkuProduct,
  parseChannelPrices,
  loadSingleSkuSetup,
  parseInputs,
  publishSingleSkuPrice,
  salsifyPublishStatus,
} from "@/lib/single-sku";

/**
 * POST { customerId, channelId, productId?, inputs } — publishes the calculator's list price to Salsify.
 * Without productId this is "Commit & Publish": the new SKU is added to the Product database first (needs
 * products:update), then published, which creates it in Salsify with its SKU and this channel's price.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.customerId !== "string" || typeof body.channelId !== "string")
    return NextResponse.json({ error: "customerId and channelId required" }, { status: 400 });
  const customerId: string = body.customerId;
  const productId: string | null = typeof body.productId === "string" ? body.productId : null;

  const setup = await loadSingleSkuSetup(session.user, customerId, body.channelId, productId);
  if ("error" in setup) return NextResponse.json({ error: setup.error }, { status: setup.status });

  const status = await salsifyPublishStatus(session.user, customerId, setup.channel);
  if (!status.ok) return NextResponse.json({ error: status.reason }, { status: 403 });

  const inputs = parseInputs(body.inputs);
  const price = inputs.price != null && inputs.price > 0 ? inputs.price : null;
  if (price == null) return NextResponse.json({ error: "Enter a list price to publish" }, { status: 400 });

  let target: { productId: string; sku: string };
  if (productId) {
    target = { productId, sku: setup.row!.sku };
  } else {
    if (!setup.canCommit) return NextResponse.json({ error: "You don't have permission to add products" }, { status: 403 });
    const created = await createSingleSkuProduct(setup, session.user.id, customerId, inputs, parseChannelPrices(body.channelPrices));
    if ("error" in created) {
      return NextResponse.json({ error: created.error, productId: created.productId }, { status: created.status });
    }
    target = created;
  }

  const published = await publishSingleSkuPrice({
    setup,
    user: session.user,
    customerId,
    sku: target.sku,
    productId: target.productId,
    price,
    isNew: !productId,
    status,
  });
  if ("error" in published) {
    // A new SKU stays in the Product database even when the publish fails; say so.
    return NextResponse.json(
      { error: published.error, productId: target.productId, committed: !productId },
      { status: published.status },
    );
  }
  return NextResponse.json({ ok: true, productId: target.productId, committed: !productId });
}
