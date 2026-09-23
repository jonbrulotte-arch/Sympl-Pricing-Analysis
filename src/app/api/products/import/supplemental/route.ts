import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { upsertSupplementalData } from "@/lib/db/upsert-supplemental";

interface SupplementalRow {
  sku: string;
  cost?: number | null;
  mcfFreight?: number | null;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { fileName, rows } = body as { fileName: string; rows: SupplementalRow[] };

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "No rows provided" }, { status: 400 });
  }

  const importId = randomUUID();
  await prisma.import.create({
    data: {
      id: importId,
      customerId: null,
      uploadedById: session.user.id,
      fileName: fileName || "Supplemental import",
      sheetName: null,
      rowCount: rows.length,
      columnMap: {},
      headerSig: "",
      status: "processing",
      source: "supplemental",
    },
  });

  try {
    const { updated, notFound } = await upsertSupplementalData(importId, rows);

    await prisma.import.update({
      where: { id: importId },
      data: { status: "complete", rowCount: updated, errors: notFound.length > 0 ? { notFound } : undefined },
    });

    return NextResponse.json({ updated, notFound, importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.import.update({
      where: { id: importId },
      data: { status: "failed", errors: { message } },
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
