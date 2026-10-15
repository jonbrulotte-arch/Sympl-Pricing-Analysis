import { prisma } from "@/lib/prisma";
import { WRITE_SOURCE_LABELS, loadImportInfo, num, previousValues, withinLogWindow } from "@/lib/db/history-common";

export interface PriceRecordDetail {
  previousPrice: number | null;
  /** Customer that owns the channel; null for catalog-wide import prices. */
  customer: string | null;
  channel: string;
  changedBy: string | null;
  /** How the price was recorded, e.g. "Committed in analysis" or "Salsify sync (file.xlsx)". */
  how: string;
}

export interface PriceRecord {
  id: string;
  label: string;
  price: number;
  recordedAt: Date;
  source: "channel" | "product";
  detail: PriceRecordDetail;
}

const PRICE_FIELD_LABELS: Record<string, string> = {
  priceJSP: "eBay (JSP)",
  priceMCF: "eBay (MCF)",
  priceWM: "Walmart",
  priceShopify: "Shopify",
  priceFBM: "Amazon FBM",
  priceFBA: "Amazon FBA",
};

/**
 * A product's price history (newest first, up to `take` per source) with details for each record:
 * previous price, customer, channel, who changed it and how. Records written before these details
 * were stored are filled in from the record before them, the import that wrote them, or the
 * matching "price.commit" activity log entry.
 */
export async function loadPriceHistory(
  product: { id: string; sku: string },
  scope: { channelIds: string[] | null; priceFields: string[] | null },
  take = 100,
): Promise<PriceRecord[]> {
  const channelWhere = scope.channelIds ? { channelId: { in: scope.channelIds } } : {};
  const fieldWhere = scope.priceFields ? { priceField: { in: scope.priceFields } } : {};

  const [channelRows, allChannelPrices, productRows, commitLogs] = await Promise.all([
    prisma.priceHistory.findMany({
      where: { productId: product.id, ...channelWhere },
      orderBy: { recordedAt: "desc" },
      take,
      include: {
        channel: { select: { name: true, priceField: true, customer: { select: { name: true } } } },
        recordedBy: { select: { name: true } },
      },
    }),
    // Every channel price (not just the page shown), to find each record's predecessor.
    prisma.priceHistory.findMany({
      where: { productId: product.id, ...channelWhere },
      orderBy: { recordedAt: "desc" },
      select: { id: true, channelId: true, price: true, recordedAt: true },
    }),
    prisma.productPrice.findMany({
      where: { productId: product.id, ...fieldWhere },
      orderBy: { recordedAt: "desc" },
    }),
    prisma.activityLog.findMany({
      where: { action: "price.commit", detail: { path: ["sku"], equals: product.sku } },
      select: { createdAt: true, detail: true, user: { select: { name: true } } },
    }),
  ]);

  const imports = await loadImportInfo([...channelRows, ...productRows.slice(0, take)].map((r) => r.importId));
  const prevChannelPrice = previousValues(allChannelPrices, (r) => r.channelId, (r) => Number(r.price));
  const prevFieldPrice = previousValues(productRows, (r) => r.priceField, (r) => Number(r.price));

  /** The latest catalog price for a field recorded before a date — what the channel showed before its first record. */
  const fieldPriceBefore = (field: string, before: Date) =>
    productRows.find((p) => p.priceField === field && p.recordedAt < before);

  const findCommitLog = (channelId: string, price: number, at: Date) =>
    commitLogs.find((l) => {
      const d = (l.detail ?? {}) as Record<string, unknown>;
      return (
        d.channelId === channelId &&
        num(d.newPrice) != null &&
        Math.abs(num(d.newPrice)! - price) < 0.005 &&
        withinLogWindow(l.createdAt, at)
      );
    });

  const channelRecords: PriceRecord[] = channelRows.map((r) => {
    const price = Number(r.price);
    const log = !r.source && !r.importId ? findCommitLog(r.channelId, price, r.recordedAt) : undefined;
    const logOldPrice = log ? num(((log.detail ?? {}) as Record<string, unknown>).oldPrice) : null;
    const fieldBefore = r.channel.priceField ? fieldPriceBefore(r.channel.priceField, r.recordedAt) : undefined;
    return {
      id: r.id,
      label: r.channel.name,
      price,
      recordedAt: r.recordedAt,
      source: "channel",
      detail: {
        previousPrice:
          (r.previousPrice != null ? Number(r.previousPrice) : null) ??
          logOldPrice ??
          prevChannelPrice.get(r.id) ??
          (fieldBefore ? Number(fieldBefore.price) : null),
        customer: r.channel.customer.name,
        channel: r.channel.name,
        changedBy: r.recordedBy?.name ?? imports.uploader(r.importId) ?? log?.user?.name ?? null,
        how: (r.source && WRITE_SOURCE_LABELS[r.source]) || imports.how(r.importId) || (log ? WRITE_SOURCE_LABELS.commit : "Unknown"),
      },
    };
  });

  const productRecords: PriceRecord[] = productRows.slice(0, take).map((p) => {
    const label = PRICE_FIELD_LABELS[p.priceField] ?? p.priceField;
    return {
      id: p.id,
      label,
      price: Number(p.price),
      recordedAt: p.recordedAt,
      source: "product",
      detail: {
        previousPrice: prevFieldPrice.get(p.id) ?? null,
        customer: null,
        channel: label,
        changedBy: imports.uploader(p.importId),
        how: imports.how(p.importId) ?? "Import",
      },
    };
  });

  return [...channelRecords, ...productRecords].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
}
