import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { fetchSalsifyProductsByIds } from "@/lib/salsify/client";
import { canAccessCustomer } from "@/lib/permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
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
      channel: { select: { name: true, tabLabel: true, priceField: true } },
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

  const uniqueSkus = [...new Set(staged.map((e) => e.sku))];

  let salsifyProducts;
  try {
    salsifyProducts = await fetchSalsifyProductsByIds(organizationId, apiKey, uniqueSkus);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch Salsify data: ${message}` }, { status: 502 });
  }

  const changes: {
    id: string;
    sku: string;
    channelLabel: string;
    priceField: string;
    salsifyProperty: string | null;
    currentValue: number | null;
    newValue: number;
  }[] = [];

  const unmapped: string[] = [];

  for (const entry of staged) {
    const priceField = entry.channel.priceField;
    const salsifyPropId = fieldMap.get(priceField);

    if (!salsifyPropId) {
      unmapped.push(priceField);
      continue;
    }

    const product = salsifyProducts.get(entry.sku);
    const currentRaw = product?.[salsifyPropId];
    const currentValue = currentRaw != null ? Number(currentRaw) : null;

    changes.push({
      id: entry.id,
      sku: entry.sku,
      channelLabel: entry.channel.tabLabel,
      priceField,
      salsifyProperty: salsifyPropId,
      currentValue: currentValue != null && !isNaN(currentValue) ? currentValue : null,
      newValue: Number(entry.newPrice),
    });
  }

  const debug: Record<string, unknown> = {
    skuPropertyId,
    queriedSkus: uniqueSkus,
    productsFound: salsifyProducts.size,
    foundSkus: [...salsifyProducts.keys()],
  };
  if (salsifyProducts.size > 0) {
    const [firstSku, firstProduct] = [...salsifyProducts.entries()][0];
    debug.sampleSku = firstSku;
    debug.sampleKeys = Object.keys(firstProduct);
  }

  return NextResponse.json({
    changes,
    unmappedFields: [...new Set(unmapped)],
    skuCount: uniqueSkus.length,
    _debug: debug,
  });
}
