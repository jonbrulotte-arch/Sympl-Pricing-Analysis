import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

async function verifyAccess(customerId: string, userId: string) {
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return !!link;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
        select: { sku: true, brand: true, inventoryStatus: true },
      })
    : [];
  const brandBySku = new Map(products.map((p) => [p.sku, p.brand]));
  const statusBySku = new Map(products.map((p) => [p.sku, p.inventoryStatus]));

  const staged = raw.map((s) => ({
    ...s,
    brand: brandBySku.get(s.sku) ?? null,
    inventoryStatus: statusBySku.get(s.sku) ?? null,
  }));

  return NextResponse.json({ staged });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { entries } = await req.json();
  if (!Array.isArray(entries) || entries.length === 0) {
    return NextResponse.json({ error: "entries required" }, { status: 400 });
  }

  const ids = entries
    .map((e: { id?: string }) => e.id)
    .filter((id): id is string => typeof id === "string");

  if (ids.length > 0) {
    await prisma.salsifyStaged.deleteMany({
      where: { id: { in: ids }, customerId },
    });
  }

  logActivity({
    action: "salsify.staged.remove",
    category: "publish",
    summary: `Removed ${ids.length} staged price(s)`,
    detail: { customerId, removedCount: ids.length },
    customerId,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true, removed: ids.length });
}
