import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { ProductRow } from "@/lib/pricing/types";
import { upsertImportRows } from "@/lib/db/upsert-import-rows";

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

  const { created, updated } = await upsertImportRows(customerId, importId, rows, channels);

  await prisma.import.update({
    where: { id: importId },
    data: { status: "complete" },
  });

  return NextResponse.json({ created, updated, importId });
}
