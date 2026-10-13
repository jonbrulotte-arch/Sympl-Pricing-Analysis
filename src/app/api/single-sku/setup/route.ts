import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { loadSingleSkuSetup } from "@/lib/single-sku";
import { SHIP_COMPONENTS } from "@/lib/pricing/shipping";

/** GET ?customerId=&channelId=&productId= — the channel and starting inputs for the calculator. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const setup = await loadSingleSkuSetup(
    session.user,
    sp.get("customerId") ?? "",
    sp.get("channelId") ?? "",
    sp.get("productId") || null,
  );
  if ("error" in setup) return NextResponse.json({ error: setup.error }, { status: setup.status });

  const { channel, row, costHidden, canCommit } = setup;
  const price = row ? (row.channelPrices?.[channel.id] ?? null) : null;
  return NextResponse.json({
    channel,
    costHidden,
    canCommit,
    product: row
      ? {
          id: row.productId,
          sku: row.sku,
          name: row.name ?? "",
          brand: row.brand ?? "",
          amzItemType: row.amzItemType ?? "",
          // Never sent when hidden; the server keeps using the stored cost.
          cost: costHidden ? null : row.cost,
          price,
          shipping: Object.fromEntries(SHIP_COMPONENTS.map((c) => [c.key, (row[c.key] as number | null | undefined) ?? null])),
        }
      : null,
  });
}
