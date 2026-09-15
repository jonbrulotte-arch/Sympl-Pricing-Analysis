import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { ProductRow } from "@/lib/pricing/types";

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId: session.user.id } },
  });
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { fileName, sheetName, headerSig, columnMap, rows } = body as {
    fileName: string;
    sheetName: string;
    headerSig: string;
    columnMap: Record<string, number>;
    rows: ProductRow[];
  };

  if (!rows?.length) return NextResponse.json({ error: "No rows to import" }, { status: 400 });

  const importId = randomUUID();
  await prisma.import.create({
    data: {
      id: importId,
      customerId,
      uploadedById: session.user.id,
      fileName: fileName || "import.xlsx",
      sheetName,
      rowCount: rows.length,
      columnMap: JSON.parse(JSON.stringify(columnMap)),
      headerSig,
      status: "processing",
    },
  });

  // Save mapping for future imports
  if (headerSig) {
    await prisma.savedMapping.upsert({
      where: { customerId_headerSignature: { customerId, headerSignature: headerSig } },
      update: { columnMap: JSON.parse(JSON.stringify(columnMap)) },
      create: {
        id: randomUUID(),
        customerId,
        headerSignature: headerSig,
        columnMap: JSON.parse(JSON.stringify(columnMap)),
      },
    });
  }

  const channels = await prisma.salesChannel.findMany({
    where: { customerId },
    select: { id: true, priceField: true },
  });

  let created = 0;
  let updated = 0;

  for (const row of rows) {
    const existing = await prisma.product.findUnique({
      where: { customerId_sku: { customerId, sku: row.sku } },
    });

    let productId: string;

    if (existing) {
      productId = existing.id;
      await prisma.product.update({
        where: { id: existing.id },
        data: {
          ...(row.name !== undefined && { name: row.name }),
          ...(row.brand !== undefined && { brand: row.brand }),
          ...(row.asin !== undefined && { asin: row.asin }),
          ...(row.fbaClass !== undefined && { fbaClass: row.fbaClass }),
          ...(row.amzCategory !== undefined && { amzCategory: row.amzCategory }),
          ...(row.amzItemType !== undefined && { amzItemType: row.amzItemType }),
        },
      });
      updated++;
    } else {
      productId = randomUUID();
      await prisma.product.create({
        data: {
          id: productId,
          customerId,
          sku: row.sku,
          name: row.name,
          brand: row.brand,
          asin: row.asin,
          fbaClass: row.fbaClass,
          amzCategory: row.amzCategory,
          amzItemType: row.amzItemType,
        },
      });
      created++;
    }

    // Record cost history
    if (row.cost != null) {
      const lastCost = await prisma.costHistory.findFirst({
        where: { productId },
        orderBy: { recordedAt: "desc" },
      });
      const costVal = typeof row.cost === "number" ? row.cost : 0;
      if (!lastCost || Number(lastCost.cost) !== costVal) {
        await prisma.costHistory.create({
          data: { id: randomUUID(), productId, cost: costVal, importId },
        });
      }
    }

    // Record price history per channel
    for (const ch of channels) {
      const priceVal = (row as Record<string, unknown>)[ch.priceField];
      if (priceVal != null && typeof priceVal === "number" && priceVal > 0) {
        const lastPrice = await prisma.priceHistory.findFirst({
          where: { productId, channelId: ch.id },
          orderBy: { recordedAt: "desc" },
        });
        if (!lastPrice || Number(lastPrice.price) !== priceVal) {
          await prisma.priceHistory.create({
            data: { id: randomUUID(), productId, channelId: ch.id, price: priceVal, importId },
          });
        }
      }
    }
  }

  await prisma.import.update({
    where: { id: importId },
    data: { status: "complete" },
  });

  return NextResponse.json({ created, updated, importId });
}
