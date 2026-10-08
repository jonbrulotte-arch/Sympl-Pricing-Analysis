import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { ProductRow } from "@/lib/pricing/types";
import { upsertGlobalProducts } from "@/lib/db/upsert-global-products";
import { logActivity } from "@/lib/activity-log";
import { getPermissions } from "@/lib/permissions";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getPermissions(session.user.role);
  if (!permissions.has("import:upload"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { fileName, sheetName, headerSig, columnMap, rows: rawRows } = body as {
    fileName?: string;
    sheetName?: string;
    headerSig?: string;
    columnMap?: Record<string, number>;
    rows?: ProductRow[];
  };

  const rows = Array.isArray(rawRows)
    ? rawRows
        .filter((r) => r && typeof r.sku === "string" && r.sku.trim() !== "")
        .map((r) => ({ ...r, sku: r.sku.trim() }))
    : [];
  if (rows.length === 0) return NextResponse.json({ error: "No rows to import" }, { status: 400 });

  const importId = randomUUID();
  await prisma.import.create({
    data: {
      id: importId,
      customerId: null,
      uploadedById: session.user.id,
      fileName: fileName || "import.xlsx",
      sheetName: sheetName ?? null,
      rowCount: rows.length,
      columnMap: JSON.parse(JSON.stringify(columnMap ?? {})),
      headerSig: headerSig ?? "",
      status: "processing",
      source: "spreadsheet",
    },
  });

  try {
    const { created, updated, unchanged, duplicates } = await upsertGlobalProducts(importId, rows);

    await prisma.import.update({
      where: { id: importId },
      data: { status: "complete", errors: { created, updated, unchanged, duplicates } },
    });

    logActivity({
      action: "import.spreadsheet",
      category: "import",
      summary: `Imported spreadsheet to product catalog: ${created} created, ${updated} updated, ${unchanged} unchanged (${rows.length} rows)`,
      detail: { importId, fileName: fileName ?? null, rowCount: rows.length, created, updated, unchanged, duplicates },
      userId: session.user.id,
    });

    return NextResponse.json({ created, updated, unchanged, duplicates, importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.import.update({
      where: { id: importId },
      data: { status: "failed", errors: { message } },
    }).catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
