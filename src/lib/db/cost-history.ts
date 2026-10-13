import { prisma } from "@/lib/prisma";
import { WRITE_SOURCE_LABELS, loadImportInfo, num, previousValues, withinLogWindow } from "@/lib/db/history-common";
import { SHIP_COMPONENTS } from "@/lib/pricing/shipping";

export interface CostRecordDetail {
  previous: number | null;
  /** Customer/channel the change was made from; null when it applies to the product everywhere. */
  customer: string | null;
  channel: string | null;
  changedBy: string | null;
  how: string;
}

export interface CostRecord {
  id: string;
  cost: number;
  recordedAt: Date;
  detail: CostRecordDetail;
}

export interface ShippingRecord {
  id: string;
  shippingType: string;
  amount: number;
  recordedAt: Date;
  detail: CostRecordDetail;
}

/** Product page edit fields (product.update log detail) by shipping type. */
const MANUAL_FIELD_BY_TYPE: Record<string, string> = {
  std: "shipping",
  mcf_ship: "mcfShip",
  mcf_freight: "mcfFreight",
  fba_fee: "fbaFee",
};

/** Analysis shipping keys (price.commit log detail.shipping) by shipping type. */
const COMMIT_KEY_BY_TYPE = Object.fromEntries(SHIP_COMPONENTS.map((c) => [c.shippingType, c.key]));

const sameAmount = (a: unknown, b: number) => num(a) != null && Math.abs(num(a)! - b) < 0.00005;
const detailOf = (l: { detail: unknown }) => (l.detail ?? {}) as Record<string, unknown>;

/**
 * A product's cost and shipping cost history (newest first, up to `take` each) with details for each record:
 * previous value, the customer/channel it came from, who changed it and how. Records written before these
 * details were stored are filled in from the import that wrote them or the matching activity log entry
 * ("product.update" for product page edits, "price.commit" for shipping committed in an analysis).
 */
export async function loadCostAndShippingHistory(
  product: { id: string; sku: string },
  opts: { includeCost: boolean; shippingTypes: string[]; take?: number },
): Promise<{ cost: CostRecord[]; shipping: ShippingRecord[] }> {
  const take = opts.take ?? 50;
  const [costRows, shipRows, manualLogs, commitLogs] = await Promise.all([
    opts.includeCost
      ? prisma.costHistory.findMany({
          where: { productId: product.id },
          orderBy: { recordedAt: "desc" },
          include: { recordedBy: { select: { name: true } } },
        })
      : Promise.resolve([]),
    opts.shippingTypes.length
      ? prisma.shippingCostHistory.findMany({
          where: { productId: product.id, shippingType: { in: opts.shippingTypes } },
          orderBy: { recordedAt: "desc" },
          include: {
            recordedBy: { select: { name: true } },
            channel: { select: { name: true, customer: { select: { name: true } } } },
          },
        })
      : Promise.resolve([]),
    prisma.activityLog.findMany({
      where: { action: "product.update", detail: { path: ["productId"], equals: product.id } },
      select: { createdAt: true, detail: true, user: { select: { name: true } } },
    }),
    opts.shippingTypes.length
      ? prisma.activityLog.findMany({
          where: { action: "price.commit", detail: { path: ["sku"], equals: product.sku } },
          select: { createdAt: true, detail: true, user: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  const shownCost = costRows.slice(0, take);
  const shownShip = shipRows.slice(0, take);
  const imports = await loadImportInfo([...shownCost, ...shownShip].map((r) => r.importId));
  const prevCost = previousValues(costRows, () => "cost", (r) => Number(r.cost));
  const prevShip = previousValues(shipRows, (r) => r.shippingType, (r) => Number(r.amount));

  // Channels named by matched commit logs, for rows that predate the stored channel.
  const logChannelIds = [
    ...new Set(commitLogs.map((l) => detailOf(l).channelId).filter((id): id is string => typeof id === "string")),
  ];
  const logChannels = new Map(
    (
      await prisma.salesChannel.findMany({
        where: { id: { in: logChannelIds } },
        select: { id: true, name: true, customer: { select: { name: true } } },
      })
    ).map((c) => [c.id, c]),
  );

  const cost: CostRecord[] = shownCost.map((r) => {
    const value = Number(r.cost);
    const log =
      !r.source && !r.importId
        ? manualLogs.find((l) => withinLogWindow(l.createdAt, r.recordedAt) && sameAmount(detailOf(l).cost, value))
        : undefined;
    return {
      id: r.id,
      cost: value,
      recordedAt: r.recordedAt,
      detail: {
        previous: prevCost.get(r.id) ?? null,
        customer: null,
        channel: null,
        changedBy: r.recordedBy?.name ?? imports.uploader(r.importId) ?? log?.user?.name ?? null,
        how: (r.source && WRITE_SOURCE_LABELS[r.source]) || imports.how(r.importId) || (log ? WRITE_SOURCE_LABELS.manual : "Unknown"),
      },
    };
  });

  const shipping: ShippingRecord[] = shownShip.map((r) => {
    const value = Number(r.amount);
    let changedBy = r.recordedBy?.name ?? imports.uploader(r.importId);
    let how = (r.source && WRITE_SOURCE_LABELS[r.source]) || imports.how(r.importId);
    let channel = r.channel;
    if (!r.source && !r.importId) {
      const field = MANUAL_FIELD_BY_TYPE[r.shippingType];
      const manual = manualLogs.find((l) => withinLogWindow(l.createdAt, r.recordedAt) && sameAmount(detailOf(l)[field], value));
      const key = COMMIT_KEY_BY_TYPE[r.shippingType];
      const commit = manual
        ? undefined
        : commitLogs.find((l) => {
            const ship = detailOf(l).shipping as Record<string, unknown> | undefined;
            return withinLogWindow(l.createdAt, r.recordedAt) && !!ship && sameAmount(ship[key], value);
          });
      const log = manual ?? commit;
      if (log) {
        changedBy ??= log.user?.name ?? null;
        how ||= manual ? WRITE_SOURCE_LABELS.manual : WRITE_SOURCE_LABELS.commit;
        if (commit) channel ??= logChannels.get(detailOf(commit).channelId as string) ?? null;
      }
    }
    return {
      id: r.id,
      shippingType: r.shippingType,
      amount: value,
      recordedAt: r.recordedAt,
      detail: {
        previous: prevShip.get(r.id) ?? null,
        customer: channel?.customer.name ?? null,
        channel: channel?.name ?? null,
        changedBy: changedBy ?? null,
        how: how || "Unknown",
      },
    };
  });

  return { cost, shipping };
}
