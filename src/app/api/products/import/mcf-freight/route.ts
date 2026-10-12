import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-log";
import * as XLSX from "xlsx";

const FBA_COST_URL =
  "http://mango.jsproducts.com/qc-dims/public/excel/Reader/php/FBACost?days=90";

interface SkuFreight {
  sku: string;
  avgCost: number;
}

function parseMethodTab(buffer: ArrayBuffer): SkuFreight[] {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets["Method"];
  if (!ws) throw new Error("Sheet 'Method' not found in the workbook");

  const data: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const results: SkuFreight[] = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0]) continue;
    const label = String(row[0]);
    if (label.startsWith(" ") || label === "Grand Total") continue;

    const avgCost = Number(row[1]);
    if (!isFinite(avgCost) || avgCost <= 0) continue;

    results.push({ sku: label.trim(), avgCost });
  }

  return results;
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const importId = randomUUID();

  try {
    const resp = await fetch(FBA_COST_URL);
    if (!resp.ok) {
      return NextResponse.json(
        { error: `Failed to fetch FBA cost data: ${resp.status} ${resp.statusText}` },
        { status: 502 },
      );
    }

    const buffer = await resp.arrayBuffer();
    const skuFreights = parseMethodTab(buffer);

    if (skuFreights.length === 0) {
      return NextResponse.json({ error: "No SKU data found in Method tab" }, { status: 422 });
    }

    await prisma.import.create({
      data: {
        id: importId,
        customerId: null,
        uploadedById: session.user.id,
        fileName: "FBA Landed Costs (remote)",
        sheetName: "Method",
        rowCount: skuFreights.length,
        columnMap: {},
        headerSig: "",
        status: "processing",
        source: "mcf_freight_remote",
      },
    });

    let updated = 0;
    const notFound: string[] = [];

    for (const { sku, avgCost } of skuFreights) {
      const product = await prisma.product.findUnique({
        where: { sku },
        select: { id: true },
      });

      if (!product) {
        notFound.push(sku);
        continue;
      }

      const last = await prisma.shippingCostHistory.findFirst({
        where: { productId: product.id, shippingType: "mcf_freight" },
        orderBy: { recordedAt: "desc" },
      });

      const rounded = Math.round(avgCost * 10000) / 10000;
      if (!last || Number(last.amount) !== rounded) {
        await prisma.shippingCostHistory.create({
          data: {
            id: randomUUID(),
            productId: product.id,
            shippingType: "mcf_freight",
            amount: rounded,
            importId,
          },
        });
        updated++;
      }
    }

    await prisma.import.update({
      where: { id: importId },
      data: {
        status: "complete",
        rowCount: updated,
        errors: notFound.length > 0 ? { notFound } : undefined,
      },
    });

    logActivity({
      action: "import.mcf_freight",
      category: "import",
      summary: `MCF freight import: ${updated} updated, ${notFound.length} not found (${skuFreights.length} SKUs from remote)`,
      detail: {
        importId,
        totalSkus: skuFreights.length,
        updated,
        notFoundCount: notFound.length,
      },
      userId: session.user.id,
    });

    return NextResponse.json({
      updated,
      total: skuFreights.length,
      notFoundCount: notFound.length,
      importId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.import
      .update({
        where: { id: importId },
        data: { status: "failed", errors: { message } },
      })
      .catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
