import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import type { ProductRow } from "@/lib/pricing/types";

const CHUNK_SIZE = 500;

const PRICE_FIELDS = [
  "priceJSP",
  "priceMCF",
  "priceWM",
  "priceShopify",
  "priceFBM",
  "priceFBA",
] as const;

const SHIPPING_FIELDS: [keyof ProductRow, string][] = [
  ["shipping", "std"],
  ["mcfShip", "mcf_ship"],
  ["mcfFreight", "mcf_freight"],
  ["fbaFee", "fba_fee"],
];

const TEXT_FIELDS: [keyof ProductRow, "name" | "brand" | "asin" | "fbaClass" | "amzCategory" | "amzItemType" | "inventoryStatus"][] = [
  ["name", "name"],
  ["brand", "brand"],
  ["asin", "asin"],
  ["fbaClass", "fbaClass"],
  ["amzCategory", "amzCategory"],
  ["amzItemType", "amzItemType"],
  ["invStatus", "inventoryStatus"],
];

export interface GlobalUpsertResult {
  created: number;
  updated: number;
  unchanged: number;
  duplicates: number;
  createdProducts: { sku: string; name: string | null }[];
}

const same = (a: number, b: number) => a.toFixed(4) === b.toFixed(4);

function positive(v: unknown): number | null {
  return typeof v === "number" && isFinite(v) && v > 0 ? v : null;
}

/**
 * Upserts rows into the global product catalog (no customer link) and appends
 * cost / ProductPrice / shipping history only where the value changed.
 */
export async function upsertGlobalProducts(
  importId: string,
  inputRows: ProductRow[],
  onProgress?: (processed: number) => void | Promise<void>,
): Promise<GlobalUpsertResult> {
  const bySku = new Map<string, ProductRow>();
  for (const row of inputRows) bySku.set(row.sku, row);
  const rows = [...bySku.values()];

  const result: GlobalUpsertResult = {
    created: 0,
    updated: 0,
    unchanged: 0,
    duplicates: inputRows.length - rows.length,
    createdProducts: [],
  };

  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const existing = await prisma.product.findMany({
      where: { sku: { in: chunk.map((r) => r.sku) } },
    });
    const existingBySku = new Map(existing.map((p) => [p.sku, p]));

    const newProducts: { id: string; sku: string; name?: string; brand?: string; asin?: string; fbaClass?: string; amzCategory?: string; amzItemType?: string; inventoryStatus?: string }[] = [];
    const productIdBySku = new Map<string, string>();

    for (const row of chunk) {
      const prev = existingBySku.get(row.sku);
      if (prev) {
        productIdBySku.set(row.sku, prev.id);
        const data: Record<string, string> = {};
        for (const [rowKey, col] of TEXT_FIELDS) {
          const v = row[rowKey];
          if (typeof v === "string" && v !== (prev[col] ?? undefined)) data[col] = v;
        }
        if (Object.keys(data).length > 0) {
          await prisma.product.update({ where: { id: prev.id }, data });
          result.updated++;
        } else {
          result.unchanged++;
        }
      } else {
        const id = randomUUID();
        productIdBySku.set(row.sku, id);
        newProducts.push({
          id,
          sku: row.sku,
          name: row.name,
          brand: row.brand,
          asin: row.asin,
          fbaClass: row.fbaClass,
          amzCategory: row.amzCategory,
          amzItemType: row.amzItemType,
          inventoryStatus: row.invStatus,
        });
      }
    }

    if (newProducts.length > 0) {
      await prisma.product.createMany({ data: newProducts });
      result.created += newProducts.length;
      for (const p of newProducts) result.createdProducts.push({ sku: p.sku, name: p.name ?? null });
    }

    const existingIds = existing.map((p) => p.id);
    const [lastCosts, lastPrices, lastShipping] = existingIds.length === 0
      ? [[], [], []]
      : await Promise.all([
          prisma.costHistory.findMany({
            where: { productId: { in: existingIds } },
            orderBy: { recordedAt: "desc" },
            distinct: ["productId"],
            select: { productId: true, cost: true },
          }),
          prisma.productPrice.findMany({
            where: { productId: { in: existingIds } },
            orderBy: { recordedAt: "desc" },
            distinct: ["productId", "priceField"],
            select: { productId: true, priceField: true, price: true },
          }),
          prisma.shippingCostHistory.findMany({
            where: { productId: { in: existingIds } },
            orderBy: { recordedAt: "desc" },
            distinct: ["productId", "shippingType"],
            select: { productId: true, shippingType: true, amount: true },
          }),
        ]);

    const costMap = new Map(lastCosts.map((c) => [c.productId, Number(c.cost)]));
    const priceMap = new Map(lastPrices.map((p) => [`${p.productId}|${p.priceField}`, Number(p.price)]));
    const shipMap = new Map(lastShipping.map((s) => [`${s.productId}|${s.shippingType}`, Number(s.amount)]));

    const costRows: { id: string; productId: string; cost: number; importId: string }[] = [];
    const priceRows: { id: string; productId: string; priceField: string; price: number; importId: string }[] = [];
    const shipRows: { id: string; productId: string; shippingType: string; amount: number; importId: string }[] = [];

    for (const row of chunk) {
      const productId = productIdBySku.get(row.sku)!;

      if (typeof row.cost === "number" && isFinite(row.cost)) {
        const last = costMap.get(productId);
        if (last == null || !same(last, row.cost)) {
          costRows.push({ id: randomUUID(), productId, cost: row.cost, importId });
        }
      }

      for (const pf of PRICE_FIELDS) {
        const val = positive(row[pf]);
        if (val == null) continue;
        const last = priceMap.get(`${productId}|${pf}`);
        if (last == null || !same(last, val)) {
          priceRows.push({ id: randomUUID(), productId, priceField: pf, price: val, importId });
        }
      }

      for (const [field, shippingType] of SHIPPING_FIELDS) {
        const val = positive(row[field]);
        if (val == null) continue;
        const last = shipMap.get(`${productId}|${shippingType}`);
        if (last == null || !same(last, val)) {
          shipRows.push({ id: randomUUID(), productId, shippingType, amount: val, importId });
        }
      }
    }

    await Promise.all([
      costRows.length > 0 ? prisma.costHistory.createMany({ data: costRows }) : null,
      priceRows.length > 0 ? prisma.productPrice.createMany({ data: priceRows }) : null,
      shipRows.length > 0 ? prisma.shippingCostHistory.createMany({ data: shipRows }) : null,
    ]);

    if (onProgress) await onProgress(Math.min(i + CHUNK_SIZE, rows.length));
  }

  return result;
}
