import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { updateSalsifyProducts } from "@/lib/salsify/client";
import {
  computeSingleSku,
  loadSingleSkuSetup,
  parseInputs,
  parseSettings,
  recordSingleSkuPublish,
  salsifyPublishStatus,
  type SingleSkuSetup,
} from "@/lib/single-sku";
import type { PublishAllRow } from "@/lib/export/single-sku-change-report";

const MAX_CHANNELS = 50;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * POST { customerId, productId, channels: [{ channelId, inputs, settings }], apply }
 *
 * Publish All from Single SKU Analysis (existing SKUs). Without `apply` it returns the change report: each channel
 * whose calculator price differs from the saved one, with old and new price and net margin (worked out here with the
 * calculator's inputs, so only the price differs). With `apply` it sends every ready channel's price to Salsify in one
 * update and records each one like a normal publish; channels that can't be published are skipped and say why.
 * Shipping and cost aren't published.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!isRecord(body) || typeof body.customerId !== "string" || typeof body.productId !== "string" || !Array.isArray(body.channels))
    return NextResponse.json({ error: "customerId, productId and channels required" }, { status: 400 });
  if (body.channels.length === 0 || body.channels.length > MAX_CHANNELS)
    return NextResponse.json({ error: "No channels to publish" }, { status: 400 });
  const customerId: string = body.customerId;
  const productId: string = body.productId;
  const apply = body.apply === true;

  const rows: PublishAllRow[] = [];
  const ready: { row: PublishAllRow; setup: SingleSkuSetup; skuPropertyId: string; pricePropertyId: string }[] = [];
  let sku: string | null = null;
  const seen = new Set<string>();

  for (const entry of body.channels) {
    if (!isRecord(entry) || typeof entry.channelId !== "string" || seen.has(entry.channelId)) continue;
    seen.add(entry.channelId);

    const setup = await loadSingleSkuSetup(session.user, customerId, entry.channelId, productId);
    if ("error" in setup) return NextResponse.json({ error: setup.error }, { status: setup.status });
    const row = setup.row!;
    sku = row.sku;

    const inputs = parseInputs(entry.inputs);
    const settings = parseSettings(entry.settings);
    const newPrice = inputs.price != null && inputs.price > 0 ? inputs.price : null;
    const oldPrice = row.channelPrices?.[setup.channel.id] ?? null;
    // Only channels whose price is changing.
    if (newPrice == null || (oldPrice != null && Math.abs(newPrice - oldPrice) < 0.005)) continue;

    const next = computeSingleSku(setup, inputs, settings).result;
    const before = computeSingleSku(setup, { ...inputs, price: undefined }, settings).result;
    const priced = (r: typeof next) => r.price > 0 && !r.invalid;

    const status = await salsifyPublishStatus(session.user, customerId, setup.channel);
    const out: PublishAllRow = {
      channelId: setup.channel.id,
      channelName: setup.channel.name,
      salsifyProperty: status.ok ? status.pricePropertyId : null,
      oldPrice,
      newPrice,
      oldNetMargin: priced(before) ? before.gm : null,
      newNetMargin: priced(next) ? next.gm : null,
      oldNet: priced(before) ? before.net : null,
      newNet: priced(next) ? next.net : null,
      problem: status.ok ? null : status.reason,
    };
    rows.push(out);
    if (status.ok) ready.push({ row: out, setup, skuPropertyId: status.skuPropertyId, pricePropertyId: status.pricePropertyId });
  }

  // Two channels writing the same Salsify property must agree on the price.
  for (const a of ready) {
    const clash = ready.find((b) => b !== a && b.pricePropertyId === a.pricePropertyId && Math.abs(b.row.newPrice - a.row.newPrice) >= 0.005);
    if (clash)
      a.row.problem = `Shares the Salsify property "${a.pricePropertyId}" with ${clash.row.channelName}, which has a different price.`;
  }
  const publishable = ready.filter((r) => !r.row.problem);

  if (!apply) return NextResponse.json({ sku, rows });

  if (publishable.length === 0 || !sku) return NextResponse.json({ error: "No price changes to publish", sku, rows }, { status: 400 });

  const creds = await resolveSalsifyCredentials(session.user.id);
  if (!creds.ok) return NextResponse.json({ error: creds.error }, { status: creds.status });

  const properties = Object.fromEntries(publishable.map((r) => [r.pricePropertyId, r.row.newPrice]));
  let failure: string | null = null;
  try {
    const result = await updateSalsifyProducts(creds.credentials.organizationId, creds.credentials.apiKey, [
      { sku, skuPropertyId: publishable[0].skuPropertyId, properties },
    ]);
    if (!result.succeeded.includes(sku)) failure = result.failed[0]?.error ?? "Salsify didn't accept the update";
  } catch (err) {
    failure = err instanceof Error ? err.message : "Couldn't reach Salsify";
  }
  if (failure) return NextResponse.json({ error: `Publish to Salsify failed: ${failure}`, sku, rows }, { status: 502 });

  for (const r of publishable) {
    await recordSingleSkuPublish({
      setup: r.setup,
      userId: session.user.id,
      customerId,
      sku,
      productId,
      price: r.row.newPrice,
      isNew: false,
      detail: { publishAll: true, oldNetMargin: r.row.oldNetMargin, newNetMargin: r.row.newNetMargin },
    });
    r.row.published = true;
  }

  return NextResponse.json({ ok: true, sku, rows });
}
