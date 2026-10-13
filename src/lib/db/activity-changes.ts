import { prisma } from "@/lib/prisma";
import { WRITE_SOURCE_LABELS, num } from "@/lib/db/history-common";
import { SHIP_COMPONENTS } from "@/lib/pricing/shipping";

/** One value changed by a logged action. */
export interface LoggedChange {
  label: string;
  previous: number | null;
  next: number | null;
  /** "money" values show as $, "percent" as % (net margins are stored as fractions). */
  format: "money" | "percent";
  /** For money changes: true when an increase is bad (costs), false when it's good (prices). */
  increaseIsCost?: boolean;
}

/** The same details the product page shows for a history record, for one activity log entry. */
export interface ActivityChangeDetail {
  customer: string | null;
  channel: string | null;
  changedBy: string | null;
  source: string;
  sku: string | null;
  changes: LoggedChange[];
}

interface LogLike {
  id: string;
  action: string;
  createdAt: Date;
  detail: unknown;
  user: { name: string } | null;
  customer: { name: string } | null;
}

/** Product page edit fields (product.update detail) and the shipping types they write. */
const MANUAL_SHIP_FIELDS: [field: string, shippingType: string][] = [
  ["shipping", "std"],
  ["mcfShip", "mcf_ship"],
  ["mcfFreight", "mcf_freight"],
  ["fbaFee", "fba_fee"],
];

const SHIP_LABEL: Record<string, string> = {
  std: "Shipping",
  mcf_ship: "MCF Shipping",
  mcf_freight: "MCF Freight",
  fba_fee: "FBA Fee",
};

/** History rows are written just before their log entry; allow for clock skew and slow requests. */
const WRITE_LAG_MS = 2 * 60 * 1000;

type HistoryPoint = { recordedAt: Date; value: number };

/**
 * The value in effect before a logged change: the latest history point before the one this change wrote.
 * The change's own point is the newest one at or just before the log time with the new value.
 */
function previousFrom(points: HistoryPoint[] | undefined, loggedAt: Date, next: number): number | null {
  if (!points) return null;
  const upTo = loggedAt.getTime() + 5000;
  const candidates = points.filter((p) => p.recordedAt.getTime() <= upTo); // newest first
  const own = candidates[0];
  if (own && Math.abs(own.value - next) < 0.00005 && loggedAt.getTime() - own.recordedAt.getTime() < WRITE_LAG_MS) {
    return candidates[1]?.value ?? null;
  }
  return own?.value ?? null;
}

/**
 * Structured change details for price commits and product page edits in an activity log page.
 * Previous values come from the log itself (price commits record the old price) or from cost and
 * shipping history. Cost is omitted unless the viewer has data:viewCost.
 */
export async function loadActivityChanges(logs: LogLike[], opts: { canViewCost: boolean }) {
  const relevant = logs.filter((l) => l.action === "price.commit" || l.action === "product.update");
  const out = new Map<string, ActivityChangeDetail>();
  if (relevant.length === 0) return out;

  const d = (l: LogLike) => (l.detail ?? {}) as Record<string, unknown>;
  const skus = relevant.map((l) => d(l).sku).filter((s): s is string => typeof s === "string");
  const products = await prisma.product.findMany({ where: { sku: { in: [...new Set(skus)] } }, select: { id: true, sku: true } });
  const productIdBySku = new Map(products.map((p) => [p.sku, p.id]));
  const productIdOf = (l: LogLike) =>
    (typeof d(l).productId === "string" ? (d(l).productId as string) : null) ?? productIdBySku.get(d(l).sku as string) ?? null;
  const productIds = [...new Set(relevant.map(productIdOf).filter((id): id is string => !!id))];

  const [costRows, shipRows] = await Promise.all([
    opts.canViewCost
      ? prisma.costHistory.findMany({
          where: { productId: { in: productIds } },
          orderBy: { recordedAt: "desc" },
          select: { productId: true, cost: true, recordedAt: true },
        })
      : Promise.resolve([]),
    prisma.shippingCostHistory.findMany({
      where: { productId: { in: productIds } },
      orderBy: { recordedAt: "desc" },
      select: { productId: true, shippingType: true, amount: true, recordedAt: true },
    }),
  ]);
  const costBy = new Map<string, HistoryPoint[]>();
  for (const r of costRows) {
    const list = costBy.get(r.productId) ?? [];
    list.push({ recordedAt: r.recordedAt, value: Number(r.cost) });
    costBy.set(r.productId, list);
  }
  const shipBy = new Map<string, HistoryPoint[]>();
  for (const r of shipRows) {
    const k = `${r.productId}|${r.shippingType}`;
    const list = shipBy.get(k) ?? [];
    list.push({ recordedAt: r.recordedAt, value: Number(r.amount) });
    shipBy.set(k, list);
  }

  for (const log of relevant) {
    const detail = d(log);
    const productId = productIdOf(log);
    const changes: LoggedChange[] = [];

    if (log.action === "price.commit") {
      if (num(detail.newPrice) != null) {
        changes.push({ label: "Price", previous: num(detail.oldPrice), next: num(detail.newPrice), format: "money" });
        if (num(detail.oldNetMargin) != null || num(detail.newNetMargin) != null) {
          changes.push({ label: "Net Margin", previous: num(detail.oldNetMargin), next: num(detail.newNetMargin), format: "percent" });
        }
      }
      const shipping = (detail.shipping ?? {}) as Record<string, unknown>;
      for (const c of SHIP_COMPONENTS) {
        const next = num(shipping[c.key]);
        if (next == null) continue;
        changes.push({
          label: SHIP_LABEL[c.shippingType],
          previous: productId ? previousFrom(shipBy.get(`${productId}|${c.shippingType}`), log.createdAt, next) : null,
          next,
          format: "money",
          increaseIsCost: true,
        });
      }
      out.set(log.id, {
        customer: log.customer?.name ?? null,
        channel: typeof detail.channelName === "string" ? detail.channelName : null,
        changedBy: log.user?.name ?? null,
        source: WRITE_SOURCE_LABELS.commit,
        sku: typeof detail.sku === "string" ? detail.sku : null,
        changes,
      });
    } else {
      const cost = num(detail.cost);
      if (cost != null && opts.canViewCost) {
        changes.push({
          label: "Cost",
          previous: productId ? previousFrom(costBy.get(productId), log.createdAt, cost) : null,
          next: cost,
          format: "money",
          increaseIsCost: true,
        });
      }
      for (const [field, type] of MANUAL_SHIP_FIELDS) {
        const next = num(detail[field]);
        if (next == null) continue;
        changes.push({
          label: SHIP_LABEL[type],
          previous: productId ? previousFrom(shipBy.get(`${productId}|${type}`), log.createdAt, next) : null,
          next,
          format: "money",
          increaseIsCost: true,
        });
      }
      out.set(log.id, {
        customer: null,
        channel: null,
        changedBy: log.user?.name ?? null,
        source: WRITE_SOURCE_LABELS.manual,
        sku: typeof detail.sku === "string" ? detail.sku : null,
        changes,
      });
    }
  }
  return out;
}

/** Removes cost values from a log entry's raw detail for viewers without data:viewCost. */
export function redactCost(action: string, detail: unknown): unknown {
  if (action !== "product.update" || !detail || typeof detail !== "object") return detail;
  const { cost: _cost, ...rest } = detail as Record<string, unknown>;
  return rest;
}
