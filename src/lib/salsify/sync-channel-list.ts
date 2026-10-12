import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseNum } from "@/lib/pricing/helpers";
import { fetchSalsifyListProducts, salsifyScalar, type SalsifyProduct } from "./client";

const CHUNK = 1000;
const NAME_KEYS = ["Item Name", "Product Name", "Name"];

export interface ChannelListSyncResult {
  listTotal: number;
  skus: number;
  createdProducts: number;
  addedToChannel: number;
  removedFromChannel: number;
  linkedToCustomer: number;
  pricesRecorded: number;
  priceMissing: number;
}

type FetchList = (
  orgId: string,
  apiKey: string,
  listId: string,
  onPage?: (fetched: number, total: number) => void | Promise<void>,
) => Promise<{ products: SalsifyProduct[]; total: number }>;

function firstKey(p: SalsifyProduct, keys: string[]): string | null {
  for (const k of keys) {
    const v = salsifyScalar(p[k]);
    if (v) return v;
  }
  return null;
}

/**
 * Makes a channel's product set mirror a Salsify product list. Creates catalog
 * products for unknown SKUs (sku/name/brand only), links them to the channel's
 * customer, and optionally records the channel price from a list property.
 */
export async function syncChannelList(opts: {
  channelId: string;
  orgId: string;
  apiKey: string;
  importId: string;
  fetchList?: FetchList;
  onProgress?: (fetched: number, total: number) => void | Promise<void>;
}): Promise<ChannelListSyncResult> {
  const { channelId, orgId, apiKey, importId, fetchList = fetchSalsifyListProducts } = opts;

  const channel = await prisma.salesChannel.findUniqueOrThrow({
    where: { id: channelId },
    select: { id: true, customerId: true, salsifyListId: true, salsifyPriceProperty: true },
  });
  if (!channel.salsifyListId) throw new Error("This channel has no Salsify Product List configured");

  const { products, total } = await fetchList(orgId, apiKey, channel.salsifyListId, opts.onProgress);

  const bySku = new Map<string, SalsifyProduct>();
  for (const p of products) {
    const sku = salsifyScalar(p["salsify:id"]);
    if (sku) bySku.set(sku, p);
  }
  const skus = [...bySku.keys()];

  // 1. Ensure every SKU exists in the catalog.
  const productIdBySku = new Map<string, string>();
  for (let i = 0; i < skus.length; i += CHUNK) {
    const found = await prisma.product.findMany({
      where: { sku: { in: skus.slice(i, i + CHUNK) } },
      select: { id: true, sku: true },
    });
    for (const p of found) productIdBySku.set(p.sku, p.id);
  }
  const missing = skus.filter((s) => !productIdBySku.has(s));
  const newProducts = missing.map((sku) => {
    const p = bySku.get(sku)!;
    const id = randomUUID();
    productIdBySku.set(sku, id);
    return { id, sku, name: firstKey(p, NAME_KEYS), brand: firstKey(p, ["Brand"]) };
  });
  for (let i = 0; i < newProducts.length; i += CHUNK) {
    await prisma.product.createMany({ data: newProducts.slice(i, i + CHUNK), skipDuplicates: true });
  }

  const listProductIds = skus.map((s) => productIdBySku.get(s)!);

  // 2. Link to the channel's customer.
  let linkedToCustomer = 0;
  for (let i = 0; i < listProductIds.length; i += CHUNK) {
    const res = await prisma.customerProduct.createMany({
      data: listProductIds.slice(i, i + CHUNK).map((productId) => ({ customerId: channel.customerId, productId })),
      skipDuplicates: true,
    });
    linkedToCustomer += res.count;
  }

  // 3. Mirror channel membership.
  const current = await prisma.channelProduct.findMany({ where: { channelId }, select: { productId: true } });
  const currentIds = new Set(current.map((c) => c.productId));
  const listIds = new Set(listProductIds);
  const toRemove = [...currentIds].filter((id) => !listIds.has(id));
  const toAdd = listProductIds.filter((id) => !currentIds.has(id));

  await prisma.$transaction([
    prisma.channelProduct.deleteMany({ where: { channelId, productId: { in: toRemove } } }),
    prisma.channelProduct.createMany({
      data: toAdd.map((productId) => ({ channelId, productId })),
      skipDuplicates: true,
    }),
  ]);

  // 4. Optional channel price from a list property.
  let pricesRecorded = 0;
  let priceMissing = 0;
  if (channel.salsifyPriceProperty) {
    const prop = channel.salsifyPriceProperty;
    const latest = new Map<string, number>();
    for (let i = 0; i < listProductIds.length; i += CHUNK) {
      const rows = await prisma.priceHistory.findMany({
        where: { channelId, productId: { in: listProductIds.slice(i, i + CHUNK) } },
        orderBy: { recordedAt: "desc" },
        distinct: ["productId"],
        select: { productId: true, price: true },
      });
      for (const r of rows) latest.set(r.productId, Number(r.price));
    }

    const priceRows: { id: string; productId: string; channelId: string; price: number; importId: string }[] = [];
    for (const sku of skus) {
      const raw = salsifyScalar(bySku.get(sku)![prop]);
      const price = raw != null ? parseNum(raw) : 0;
      if (!(price > 0)) {
        priceMissing++;
        continue;
      }
      const productId = productIdBySku.get(sku)!;
      const last = latest.get(productId);
      if (last == null || last.toFixed(4) !== price.toFixed(4)) {
        priceRows.push({ id: randomUUID(), productId, channelId, price, importId });
      }
    }
    for (let i = 0; i < priceRows.length; i += CHUNK) {
      await prisma.priceHistory.createMany({ data: priceRows.slice(i, i + CHUNK) });
    }
    pricesRecorded = priceRows.length;
  }

  await prisma.salesChannel.update({ where: { id: channelId }, data: { salsifyListSyncedAt: new Date() } });

  return {
    listTotal: total,
    skus: skus.length,
    createdProducts: newProducts.length,
    addedToChannel: toAdd.length,
    removedFromChannel: toRemove.length,
    linkedToCustomer,
    pricesRecorded,
    priceMissing,
  };
}
