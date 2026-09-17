import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { decrypt } from "@/lib/crypto";
import { fetchAllSalsifyProducts, firstDelimited } from "@/lib/salsify/client";
import { upsertImportRows } from "@/lib/db/upsert-import-rows";
import type { ProductRow } from "@/lib/pricing/types";

const STRING_FIELDS = new Set(["sku", "name", "brand", "asin", "fbaClass", "amzCategory", "amzItemType", "invStatus"]);
const UNITS_CONSTANT_FIELD = "units";

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

  const appSettings = await prisma.appSettings.findUnique({ where: { id: "singleton" } });
  if (!appSettings?.salsifySyncEnabled) {
    return NextResponse.json({ error: "Salsify sync is not enabled. Ask an admin to enable it in Admin Settings." }, { status: 400 });
  }
  if (!appSettings.salsifyOrgId) {
    return NextResponse.json({ error: "No Salsify Org ID is configured. Ask an admin to set it in Admin Settings." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user?.salsifyApiKeyEncrypted) {
    return NextResponse.json({ error: "Add your Salsify API Key in My Profile before running a sync." }, { status: 400 });
  }
  const apiKey = decrypt(user.salsifyApiKeyEncrypted);

  const [mappings, channels] = await Promise.all([
    prisma.salsifyFieldMapping.findMany({ where: { customerId } }),
    prisma.salesChannel.findMany({ where: { customerId }, select: { id: true, priceField: true } }),
  ]);

  if (mappings.length === 0) {
    return NextResponse.json({ error: "No Salsify field mapping is configured for this customer yet." }, { status: 400 });
  }

  const propertyIdByField = new Map(mappings.map((m) => [m.importFieldKey, m.salsifyPropertyId]));

  let salsifyProducts;
  try {
    salsifyProducts = await fetchAllSalsifyProducts(appSettings.salsifyOrgId, apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error contacting Salsify";
    return NextResponse.json({ error: `Salsify sync failed: ${message}` }, { status: 502 });
  }

  const rows: ProductRow[] = [];
  for (const product of salsifyProducts) {
    const row: Record<string, unknown> = {};
    for (const [importFieldKey, propertyId] of propertyIdByField) {
      if (importFieldKey === UNITS_CONSTANT_FIELD) {
        row[importFieldKey] = 1;
        continue;
      }
      const raw = product[propertyId];
      if (raw == null) continue;
      if (importFieldKey === "mcfShip") {
        row[importFieldKey] = firstDelimited(raw);
        continue;
      }
      row[importFieldKey] = STRING_FIELDS.has(importFieldKey) ? String(raw) : Number(raw);
    }
    if (!row.sku) continue;
    if (row.units == null) row.units = 1;
    rows.push(row as ProductRow);
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: "Salsify returned no products matching the configured mapping." }, { status: 400 });
  }

  const importId = randomUUID();
  await prisma.import.create({
    data: {
      id: importId,
      customerId,
      uploadedById: session.user.id,
      fileName: "Salsify sync",
      sheetName: null,
      rowCount: rows.length,
      columnMap: {},
      headerSig: "",
      status: "processing",
      source: "salsify",
    },
  });

  try {
    const { created, updated } = await upsertImportRows(customerId, importId, rows, channels);
    await prisma.import.update({ where: { id: importId }, data: { status: "complete" } });
    return NextResponse.json({ created, updated, importId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.import.update({ where: { id: importId }, data: { status: "failed", errors: { message } } });
    return NextResponse.json({ error: `Salsify sync failed while saving: ${message}` }, { status: 500 });
  }
}
