import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { canAccessCustomer, getPermissions } from "@/lib/permissions";
import { loadAnalysisInputs } from "@/lib/db/analysis-inputs";
import { computeChannelResults, type ChannelEdits } from "@/lib/pricing/compute-results";
import { parseShippingChanges, type ShippingChanges } from "@/lib/pricing/shipping";
import type { Overrides } from "@/lib/pricing/types";

const MAX_PRODUCT_IDS = 5000;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : undefined);

function parseShipMap(input: unknown): Record<string, ShippingChanges> {
  const out: Record<string, ShippingChanges> = {};
  if (!isRecord(input)) return out;
  for (const [sku, changes] of Object.entries(input)) {
    const parsed = parseShippingChanges(changes);
    if (parsed) out[sku] = parsed;
  }
  return out;
}

function parseEdits(channelId: string, input: unknown): ChannelEdits {
  const e = isRecord(input) ? input : {};
  const overrides: Overrides = { [channelId]: {} };
  if (isRecord(e.overrides)) {
    for (const [sku, o] of Object.entries(e.overrides)) {
      if (!isRecord(o)) continue;
      const price = num(o.price);
      const ship = num(o.ship);
      if (price != null || ship != null) overrides[channelId][sku] = { ...(price != null && { price }), ...(ship != null && { ship }) };
    }
  }
  const committedPrices: Record<string, number> = {};
  if (isRecord(e.committedPrices)) {
    for (const [sku, p] of Object.entries(e.committedPrices)) {
      const price = num(p);
      if (price != null) committedPrices[sku] = price;
    }
  }
  return {
    settings: isRecord(e.settings) ? e.settings : {},
    overrides,
    shipEdits: parseShipMap(e.shipEdits),
    committedShip: parseShipMap(e.committedShip),
    committedPrices,
  };
}

/**
 * Runs the pricing analysis for one channel on the server, so users without data:viewCost get
 * results without product cost being sent to their browser.
 * Body: { channelId, projectId?, channelIds?, productIds?, edits: { settings, overrides, shipEdits, committedShip, committedPrices } }
 * `channelIds` is the page's channel selection, which decides the products loaded (see AnalysisScope).
 * `productIds` recomputes only those rows (after a per-SKU edit); omit it for the whole channel.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!isRecord(body) || typeof body.channelId !== "string")
    return NextResponse.json({ error: "channelId required" }, { status: 400 });
  const channelId = body.channelId;
  const projectId = typeof body.projectId === "string" ? body.projectId : null;
  let productIds: string[] | undefined;
  if (body.productIds !== undefined) {
    if (!Array.isArray(body.productIds) || body.productIds.length > MAX_PRODUCT_IDS || body.productIds.some((id) => typeof id !== "string"))
      return NextResponse.json({ error: "productIds must be an array of ids" }, { status: 400 });
    productIds = body.productIds as string[];
  }

  const channelIds = Array.isArray(body.channelIds)
    ? body.channelIds.filter((id): id is string => typeof id === "string")
    : body.singleChannel === true
      ? [channelId]
      : null;

  const inputs = await loadAnalysisInputs(customerId, { projectId, channelIds }, { channelId, productIds });
  const channel = inputs?.channels[0];
  if (!inputs || !channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const results = computeChannelResults(channel, inputs.products, inputs.context, parseEdits(channelId, body.edits));
  const canViewCost = (await getPermissions(session.user.role)).has("data:viewCost");

  return NextResponse.json({ results: canViewCost ? results : results.map((r) => ({ ...r, cost: null })) });
}
