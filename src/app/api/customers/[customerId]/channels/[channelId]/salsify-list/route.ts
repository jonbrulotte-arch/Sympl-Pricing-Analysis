import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer, getPermissions } from "@/lib/permissions";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { fetchListProductsPage, normalizeListId, salsifyScalar } from "@/lib/salsify/client";
import { syncChannelList } from "@/lib/salsify/sync-channel-list";
import { parseNum } from "@/lib/pricing/helpers";
import { logActivity } from "@/lib/activity-log";

type Params = { params: Promise<{ customerId: string; channelId: string }> };

async function authorize(customerId: string, channelId: string, requireEdit: boolean) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { id: userId, role } = session.user;

  if (!(await canAccessCustomer(customerId, userId, role)))
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (requireEdit && !(await getPermissions(role)).has("customers:edit"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  const channel = await prisma.salesChannel.findFirst({
    where: { id: channelId, customerId },
    select: { id: true, name: true, salsifyListId: true, salsifyPriceProperty: true },
  });
  if (!channel) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  return { userId, channel };
}

const PRICE_LIKE = /price|msrp|cost/i;

export async function POST(req: NextRequest, { params }: Params) {
  const { customerId, channelId } = await params;
  const ctx = await authorize(customerId, channelId, true);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));

  const creds = await resolveSalsifyCredentials(ctx.userId);
  if (!creds.ok) return NextResponse.json({ error: creds.error }, { status: creds.status });
  const { apiKey, organizationId } = creds.credentials;

  if (body.action === "test") {
    const listId = normalizeListId(String(body.listId ?? ""));
    if (!listId) {
      return NextResponse.json({ error: "Enter a Salsify list ID (s-…) or the list's URL" }, { status: 400 });
    }
    const priceProperty = typeof body.priceProperty === "string" ? body.priceProperty.trim() : "";
    try {
      const { products, total } = await fetchListProductsPage(organizationId, apiKey, listId, 1, 25);
      const numericProperties = new Set<string>();
      for (const p of products) {
        for (const [k, v] of Object.entries(p)) {
          if (k.startsWith("salsify:") || !PRICE_LIKE.test(k)) continue;
          const s = salsifyScalar(v);
          if (s != null && parseNum(s) > 0) numericProperties.add(k);
        }
      }
      const withPrice = priceProperty
        ? products.filter((p) => parseNum(salsifyScalar(p[priceProperty]) ?? "") > 0)
        : [];
      return NextResponse.json({
        listId,
        total,
        sampleSkus: products.slice(0, 5).map((p) => salsifyScalar(p["salsify:id"])),
        sampled: products.length,
        priceProperty: priceProperty
          ? {
              name: priceProperty,
              found: withPrice.length,
              sample: withPrice.slice(0, 3).map((p) => ({
                sku: salsifyScalar(p["salsify:id"]),
                price: parseNum(salsifyScalar(p[priceProperty]) ?? ""),
              })),
            }
          : null,
        numericProperties: [...numericProperties].sort(),
      });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
    }
  }

  if (body.action === "sync") {
    if (!ctx.channel.salsifyListId) {
      return NextResponse.json({ error: "Save a Salsify list ID for this channel first" }, { status: 400 });
    }
    const importId = randomUUID();
    await prisma.import.create({
      data: {
        id: importId,
        customerId,
        uploadedById: ctx.userId,
        fileName: `salsify-list ${ctx.channel.salsifyListId}`,
        source: "salsify-list",
        status: "processing",
      },
    });

    runSync(importId, channelId, customerId, ctx.channel.name, ctx.userId, organizationId, apiKey).catch((err) =>
      console.error("[salsify-list] background task failed:", err),
    );
    return NextResponse.json({ importId, status: "processing" }, { status: 202 });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

async function runSync(
  importId: string,
  channelId: string,
  customerId: string,
  channelName: string,
  userId: string,
  orgId: string,
  apiKey: string,
) {
  try {
    const result = await syncChannelList({
      channelId,
      orgId,
      apiKey,
      importId,
      onProgress: (fetched, total) =>
        prisma.import
          .update({ where: { id: importId }, data: { rowCount: fetched, errors: { fetched, total } } })
          .then(() => {}),
    });
    await prisma.import.update({
      where: { id: importId },
      data: { status: "complete", rowCount: result.skus, errors: { ...result } },
    });
    logActivity({
      action: "channel.salsifyListSync",
      category: "channel",
      summary: `Synced "${channelName}" from Salsify list: ${result.skus} SKUs, +${result.addedToChannel} / -${result.removedFromChannel}, ${result.pricesRecorded} prices`,
      detail: { importId, channelId, ...result },
      customerId,
      userId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.import
      .update({ where: { id: importId }, data: { status: "failed", errors: { message } } })
      .catch(() => {});
  }
}

export async function GET(req: NextRequest, { params }: Params) {
  const { customerId, channelId } = await params;
  const ctx = await authorize(customerId, channelId, false);
  if ("error" in ctx) return ctx.error;

  const importId = req.nextUrl.searchParams.get("importId");
  if (!importId) return NextResponse.json({ error: "importId required" }, { status: 400 });

  const imp = await prisma.import.findFirst({ where: { id: importId, customerId, source: "salsify-list" } });
  if (!imp) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ status: imp.status, rowCount: imp.rowCount, errors: imp.errors });
}
