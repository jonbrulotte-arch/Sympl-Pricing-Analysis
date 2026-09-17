import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { fetchAllSalsifyProducts, firstDelimited, type SalsifyProduct } from "@/lib/salsify/client";
import { upsertImportRows } from "@/lib/db/upsert-import-rows";
import type { ProductRow } from "@/lib/pricing/types";

const STRING_FIELDS = new Set(["sku", "name", "brand", "asin", "fbaClass", "amzCategory", "amzItemType", "invStatus"]);
const UNITS_CONSTANT_FIELD = "units";
const PROGRESS_UPDATE_EVERY_N_PAGES = 3;

async function verifyAccess(customerId: string, userId: string) {
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return !!link;
}

function transformRows(salsifyProducts: SalsifyProduct[], propertyIdByField: Map<string, string>): ProductRow[] {
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
  return rows;
}

/** Runs after the HTTP response has already been sent — updates the Import row as it progresses. */
async function runSalsifySyncInBackground(
  customerId: string,
  importId: string,
  organizationId: string,
  apiKey: string,
  propertyIdByField: Map<string, string>,
  channels: { id: string; priceField: string }[]
) {
  try {
    const salsifyProducts = await fetchAllSalsifyProducts(organizationId, apiKey, async (pagesFetched, productsFetched) => {
      if (pagesFetched % PROGRESS_UPDATE_EVERY_N_PAGES !== 0) return;
      await prisma.import.update({ where: { id: importId }, data: { rowCount: productsFetched } }).catch(() => {});
    });

    const rows = transformRows(salsifyProducts, propertyIdByField);

    if (rows.length === 0) {
      await prisma.import.update({
        where: { id: importId },
        data: { status: "failed", rowCount: 0, errors: { message: "Salsify returned no products matching the configured mapping." } },
      });
      return;
    }

    await prisma.import.update({ where: { id: importId }, data: { rowCount: rows.length } });

    const { created, updated } = await upsertImportRows(customerId, importId, rows, channels);
    await prisma.import.update({
      where: { id: importId },
      data: { status: "complete", rowCount: rows.length, errors: { created, updated } },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[salsify-sync] customer ${customerId} import ${importId} failed: ${message}`);
    await prisma.import.update({ where: { id: importId }, data: { status: "failed", errors: { message } } }).catch(() => {});
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const credentials = await resolveSalsifyCredentials(session.user.id);
  if (!credentials.ok) {
    return NextResponse.json({ error: credentials.error }, { status: credentials.status });
  }
  const { apiKey, organizationId } = credentials.credentials;

  const [mappings, channels] = await Promise.all([
    prisma.salsifyFieldMapping.findMany({ where: { customerId } }),
    prisma.salesChannel.findMany({ where: { customerId }, select: { id: true, priceField: true } }),
  ]);

  if (mappings.length === 0) {
    return NextResponse.json({ error: "No Salsify field mapping is configured for this customer yet." }, { status: 400 });
  }

  const propertyIdByField = new Map(mappings.map((m) => [m.importFieldKey, m.salsifyPropertyId]));

  const importId = randomUUID();
  await prisma.import.create({
    data: {
      id: importId,
      customerId,
      uploadedById: session.user.id,
      fileName: "Salsify sync",
      sheetName: null,
      rowCount: 0,
      columnMap: {},
      headerSig: "",
      status: "processing",
      source: "salsify",
    },
  });

  // Intentionally not awaited: this runs after the response below is sent, updating the
  // Import row as it progresses so the client can poll for status instead of blocking on
  // a request that can take several minutes for a large catalog.
  void runSalsifySyncInBackground(customerId, importId, organizationId, apiKey, propertyIdByField, channels);

  return NextResponse.json({ importId, status: "processing" }, { status: 202 });
}
