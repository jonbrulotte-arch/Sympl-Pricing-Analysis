import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { computeSingleSku, loadSingleSkuSetup, parseInputs, parseSettings } from "@/lib/single-sku";

/**
 * POST { customerId, channelId, productId?, inputs, settings } — prices one SKU with the user's inputs.
 * Runs on the server so an existing SKU's cost never reaches users without data:viewCost.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body.customerId !== "string" || typeof body.channelId !== "string")
    return NextResponse.json({ error: "customerId and channelId required" }, { status: 400 });

  const setup = await loadSingleSkuSetup(
    session.user,
    body.customerId,
    body.channelId,
    typeof body.productId === "string" ? body.productId : null,
  );
  if ("error" in setup) return NextResponse.json({ error: setup.error }, { status: setup.status });

  const { result, warnings } = computeSingleSku(setup, parseInputs(body.inputs), parseSettings(body.settings));
  return NextResponse.json({ result, warnings });
}
