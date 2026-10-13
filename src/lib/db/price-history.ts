import { prisma } from "@/lib/prisma";

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

const IMPORT_SOURCE_LABELS: Record<string, string> = {
  spreadsheet: "Spreadsheet import",
  salsify: "Salsify sync",
  "salsify-list": "Salsify product list sync",
  supplemental: "Supplemental import",
  mcf_freight_remote: "MCF freight import",
};

const WRITE_SOURCE_LABELS: Record<string, string> = {
  commit: "Committed in analysis",
  publish: "Published to Salsify",
  undo: "Undo of a staged commit",
};

/** Commits logged within this window of a price record are treated as the same change. */
const LOG_MATCH_MS = 2 * 60 * 1000;

const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : null);

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

  const importIds = [
    ...new Set([...channelRows, ...productRows.slice(0, take)].map((r) => r.importId).filter((id): id is string => !!id)),
  ];
  const imports = new Map(
    (
      await prisma.import.findMany({
        where: { id: { in: importIds } },
        select: { id: true, source: true, fileName: true, uploadedBy: { select: { name: true } } },
      })
    ).map((i) => [i.id, i]),
  );
  const importHow = (id: string | null) => {
    const imp = id ? imports.get(id) : undefined;
    if (!imp) return null;
    const label = IMPORT_SOURCE_LABELS[imp.source] ?? "Import";
    const file = imp.fileName?.trim();
    return file && file.toLowerCase() !== label.toLowerCase() ? `${label} (${file})` : label;
  };

  // Rows are newest first, so the predecessor of a row is the next one with the same key.
  const previousBy = <T extends { id: string; price: unknown }>(rows: T[], key: (r: T) => string) => {
    const prev = new Map<string, number>();
    const lastSeen = new Map<string, string>();
    for (const r of rows) {
      const k = key(r);
      const newerId = lastSeen.get(k);
      if (newerId) prev.set(newerId, Number(r.price));
      lastSeen.set(k, r.id);
    }
    return prev;
  };
  const prevChannelPrice = previousBy(allChannelPrices, (r) => r.channelId);
  const prevFieldPrice = previousBy(productRows, (r) => r.priceField);

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
        Math.abs(l.createdAt.getTime() - at.getTime()) < LOG_MATCH_MS
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
        changedBy: r.recordedBy?.name ?? (r.importId ? imports.get(r.importId)?.uploadedBy.name : null) ?? log?.user?.name ?? null,
        how: (r.source && WRITE_SOURCE_LABELS[r.source]) ?? importHow(r.importId) ?? (log ? WRITE_SOURCE_LABELS.commit : "Unknown"),
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
        changedBy: (p.importId ? imports.get(p.importId)?.uploadedBy.name : null) ?? null,
        how: importHow(p.importId) ?? "Import",
      },
    };
  });

  return [...channelRecords, ...productRecords].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
}
