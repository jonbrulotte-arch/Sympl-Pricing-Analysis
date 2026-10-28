import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer, canPublishToSalsify } from "@/lib/permissions";
import { loadAnalysisInputs } from "@/lib/db/analysis-inputs";
import { computeChannelResults } from "@/lib/pricing/compute-results";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canPublishToSalsify(session.user.role)))
    return NextResponse.json({ error: "You don't have permission to publish to Salsify" }, { status: 403 });

  const raw = await prisma.salsifyStaged.findMany({
    where: { customerId },
    include: {
      channel: { select: { name: true, tabLabel: true, priceField: true } },
    },
    orderBy: { stagedAt: "desc" },
  });

  const skus = [...new Set(raw.map((s) => s.sku))];
  const products = skus.length > 0
    ? await prisma.product.findMany({
        where: { sku: { in: skus } },
        select: { id: true, sku: true, brand: true, inventoryStatus: true },
      })
    : [];
  const brandBySku = new Map(products.map((p) => [p.sku, p.brand]));
  const statusBySku = new Map(products.map((p) => [p.sku, p.inventoryStatus]));
  const margins = await liveMargins(customerId, raw, products.map((p) => p.id));

  const staged = raw.map((s) => {
    const live = margins.get(s.id);
    return {
      ...s,
      // Worked out now from saved data, so they reflect current costs and are right for older commits too.
      ...(live && { oldNetMargin: live.old, newNetMargin: live.new }),
      brand: brandBySku.get(s.sku) ?? null,
      inventoryStatus: statusBySku.get(s.sku) ?? null,
    };
  });

  return NextResponse.json({ staged });
}

/**
 * Net margins at each staged price change's old and new price, with the channel's saved settings and current costs.
 * Entries that can't be worked out (a deleted product, no cost) are left out, and keep the margins stored at commit.
 */
async function liveMargins(
  customerId: string,
  staged: { id: string; sku: string; channelId: string; newPrice: unknown; oldPrice: unknown }[],
  productIds: string[],
): Promise<Map<string, { old: string | null; new: string }>> {
  const out = new Map<string, { old: string | null; new: string }>();
  const priced = staged.filter((s) => s.newPrice != null);
  if (priced.length === 0) return out;
  const inputs = await loadAnalysisInputs(customerId, {}, { productIds });
  if (!inputs) return out;
  const channelById = new Map(inputs.channels.map((c) => [c.id, c]));

  for (const s of priced) {
    const ch = channelById.get(s.channelId);
    if (!ch) continue;
    const settings = { ...ch.defaults, hideDisc: false };
    const at = (price: number) =>
      computeChannelResults(
        ch,
        inputs.products.filter((p) => p.sku === s.sku),
        inputs.context,
        { settings, overrides: { [ch.id]: { [s.sku]: { price } } }, shipEdits: {}, committedShip: {}, committedPrices: {} },
        { blocked: new Set(), allowed: null },
      )[0];
    const next = at(Number(s.newPrice));
    if (!next || next.invalid) continue;
    const prev = s.oldPrice != null && Number(s.oldPrice) > 0 ? at(Number(s.oldPrice)) : undefined;
    out.set(s.id, {
      old: prev && !prev.invalid ? String(prev.gm) : null,
      new: String(next.gm),
    });
  }
  return out;
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canPublishToSalsify(session.user.role)))
    return NextResponse.json({ error: "You don't have permission to publish to Salsify" }, { status: 403 });

  const { entries, revert } = await req.json();
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries required" }, { status: 400 });
  }

  const ids = entries
    .map((e: { id?: string }) => e.id)
    .filter((id): id is string => typeof id === "string");

  let reverted = 0;

  if (revert && ids.length > 0) {
    const stagedRows = await prisma.salsifyStaged.findMany({
      where: { id: { in: ids }, customerId },
      select: { id: true, sku: true, channelId: true, oldPrice: true, newPrice: true },
    });

    const channelIds = [...new Set(stagedRows.map((r) => r.channelId))];
    const revertChannels = await prisma.salesChannel.findMany({
      where: { id: { in: channelIds } },
    });
    const timingByChannel = new Map(
      revertChannels.map((ch) => [ch.id, ((ch as Record<string, unknown>).priceRecordTiming as string) ?? "at_commit"]),
    );

    for (const row of stagedRows) {
      if (row.oldPrice == null) continue;
      if (timingByChannel.get(row.channelId) === "at_publish") {
        reverted++;
        continue;
      }

      const product = await prisma.product.findUnique({
        where: { sku: row.sku },
        select: { id: true },
      });
      if (!product) continue;

      await prisma.priceHistory.create({
        data: {
          id: randomUUID(),
          productId: product.id,
          channelId: row.channelId,
          price: row.oldPrice,
          previousPrice: row.newPrice,
          recordedById: session.user.id,
          source: "undo",
        },
      });
      reverted++;
    }
  }

  if (ids.length > 0) {
    await prisma.salsifyStaged.deleteMany({
      where: { id: { in: ids }, customerId },
    });
  }

  logActivity({
    action: revert ? "salsify.staged.revert" : "salsify.staged.remove",
    category: "publish",
    summary: revert
      ? `Reverted ${reverted} staged price(s) to previous values`
      : `Removed ${ids.length} staged price(s)`,
    detail: { customerId, removedCount: ids.length, reverted: reverted || undefined },
    customerId,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true, removed: ids.length, reverted });
}
