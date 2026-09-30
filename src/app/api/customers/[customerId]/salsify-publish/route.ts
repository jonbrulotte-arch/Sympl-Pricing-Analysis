import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { updateSalsifyProducts, type SalsifyProductUpdate } from "@/lib/salsify/client";
import { logActivity } from "@/lib/activity-log";

async function verifyAccess(customerId: string, userId: string) {
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return !!link;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { ids } = await req.json();
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const credResult = await resolveSalsifyCredentials(session.user.id);
  if (!credResult.ok) {
    return NextResponse.json({ error: credResult.error }, { status: credResult.status });
  }
  const { apiKey, organizationId } = credResult.credentials;

  const staged = await prisma.salsifyStaged.findMany({
    where: { id: { in: ids }, customerId },
    include: {
      channel: { select: { priceField: true } },
    },
  });

  if (staged.length === 0) {
    return NextResponse.json({ error: "No staged entries found" }, { status: 404 });
  }

  const fieldMappings = await prisma.salsifyFieldMapping.findMany({
    where: { customerId },
  });
  const fieldMap = new Map(fieldMappings.map((m) => [m.importFieldKey, m.salsifyPropertyId]));

  const skuPropertyId = fieldMap.get("sku");
  if (!skuPropertyId) {
    return NextResponse.json({
      error: "No Salsify field mapping found for 'sku'. Configure the SKU mapping in Admin > Salsify Field Mapping.",
    }, { status: 400 });
  }

  const updatesBySku = new Map<string, Record<string, unknown>>();
  const unmapped: string[] = [];

  for (const entry of staged) {
    const priceField = entry.channel.priceField;
    const salsifyPropId = fieldMap.get(priceField);

    if (!salsifyPropId) {
      unmapped.push(priceField);
      continue;
    }

    const existing = updatesBySku.get(entry.sku) ?? {};
    existing[salsifyPropId] = Number(entry.newPrice);
    updatesBySku.set(entry.sku, existing);
  }

  if (updatesBySku.size === 0) {
    return NextResponse.json({
      error: `No Salsify field mappings found for: ${[...new Set(unmapped)].join(", ")}. Configure mappings in Admin > Salsify Field Mapping.`,
    }, { status: 400 });
  }

  const updates: SalsifyProductUpdate[] = [];
  for (const [sku, properties] of updatesBySku) {
    updates.push({ sku, skuPropertyId, properties });
  }

  const result = await updateSalsifyProducts(organizationId, apiKey, updates);

  const publishedSkus = new Set(result.succeeded);
  const publishedIds = staged
    .filter((e) => publishedSkus.has(e.sku))
    .map((e) => e.id);

  if (publishedIds.length > 0) {
    const publishedEntries = staged.filter((e) => publishedSkus.has(e.sku));
    const channelIds = [...new Set(publishedEntries.map((e) => e.channelId))];
    const channelRows = await prisma.salesChannel.findMany({
      where: { id: { in: channelIds } },
    });
    const channelTimingMap = new Map(
      channelRows.map((ch) => [ch.id, ((ch as Record<string, unknown>).priceRecordTiming as string) ?? "at_commit"]),
    );

    for (const entry of publishedEntries) {
      if (channelTimingMap.get(entry.channelId) !== "at_publish") continue;
      const product = await prisma.product.findFirst({
        where: { sku: entry.sku, customers: { some: { customerId } } },
        select: { id: true },
      });
      if (product) {
        await prisma.priceHistory.create({
          data: {
            id: randomUUID(),
            productId: product.id,
            channelId: entry.channelId,
            price: entry.newPrice,
          },
        });
      }
    }

    await prisma.salsifyStaged.deleteMany({
      where: { id: { in: publishedIds } },
    });
  }

  logActivity({
    action: "salsify.publish",
    category: "publish",
    summary: `Published ${result.succeeded.length} SKU(s) to Salsify${result.failed.length > 0 ? `, ${result.failed.length} failed` : ""}`,
    detail: {
      publishedSkus: result.succeeded,
      failedSkus: result.failed.map((f: { sku: string; error: string }) => f.sku),
      unmappedFields: [...new Set(unmapped)],
    },
    customerId,
    userId: session.user.id,
  });

  return NextResponse.json({
    published: result.succeeded.length,
    failed: result.failed,
    unmappedFields: [...new Set(unmapped)],
    removedIds: publishedIds,
  });
}
