import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer, getPermissions } from "@/lib/permissions";
import { itemTypeKey } from "@/lib/pricing/engine";
import { logActivity } from "@/lib/activity-log";

type Params = { params: Promise<{ customerId: string }> };

async function load(customerId: string) {
  const [overrides, grouped] = await Promise.all([
    prisma.itemTypeCommission.findMany({ where: { customerId }, orderBy: { itemType: "asc" } }),
    prisma.product.groupBy({
      by: ["amzItemType"],
      where: { customers: { some: { customerId } }, amzItemType: { not: null } },
      _count: { _all: true },
    }),
  ]);

  const types = new Map<string, { itemType: string; productCount: number }>();
  for (const g of grouped) {
    const name = g.amzItemType?.trim();
    if (!name) continue;
    const key = itemTypeKey(name);
    const prev = types.get(key);
    types.set(key, { itemType: prev?.itemType ?? name, productCount: (prev?.productCount ?? 0) + g._count._all });
  }

  return {
    overrides: overrides.map((o) => ({
      itemType: o.itemType,
      commission: Number(o.commission),
      productCount: types.get(o.itemTypeKey)?.productCount ?? 0,
    })),
    itemTypes: [...types.values()].sort((a, b) => a.itemType.localeCompare(b.itemType)),
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(await load(customerId));
}

/** Body: { entries: [{ itemType, commission }] }. commission is a percent; null or "" removes the override. */
export async function PUT(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await getPermissions(session.user.role)).has("customers:edit"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body.entries)) return NextResponse.json({ error: "entries required" }, { status: 400 });

  const upserts: { itemType: string; key: string; commission: number }[] = [];
  const removals: string[] = [];
  const invalid: string[] = [];

  for (const e of body.entries as { itemType?: unknown; commission?: unknown }[]) {
    const itemType = typeof e?.itemType === "string" ? e.itemType.trim() : "";
    if (!itemType) continue;
    const key = itemTypeKey(itemType);
    const raw = e.commission;
    if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
      removals.push(key);
      continue;
    }
    const n = typeof raw === "number" ? raw : parseFloat(String(raw).replace(/%/g, ""));
    if (!isFinite(n) || n < 0 || n > 100) {
      invalid.push(itemType);
      continue;
    }
    upserts.push({ itemType, key, commission: Math.round(n * 1000) / 1000 });
  }

  if (invalid.length > 0) {
    return NextResponse.json(
      { error: `Commission must be a percent between 0 and 100 for: ${invalid.slice(0, 10).join(", ")}${invalid.length > 10 ? "…" : ""}` },
      { status: 400 },
    );
  }

  const removed = removals.length
    ? await prisma.itemTypeCommission.deleteMany({ where: { customerId, itemTypeKey: { in: removals } } })
    : { count: 0 };
  await prisma.$transaction(
    upserts.map((u) =>
      prisma.itemTypeCommission.upsert({
        where: { customerId_itemTypeKey: { customerId, itemTypeKey: u.key } },
        create: { customerId, itemType: u.itemType, itemTypeKey: u.key, commission: u.commission },
        update: { itemType: u.itemType, commission: u.commission },
      }),
    ),
  );

  if (upserts.length > 0 || removed.count > 0) {
    logActivity({
      action: "customer.itemTypeCommissions",
      category: "customer",
      summary: `Updated Item Type commission overrides: ${upserts.length} set, ${removed.count} removed`,
      detail: { set: upserts.map((u) => [u.itemType, u.commission]), removed: removed.count },
      customerId,
      userId: session.user.id,
    });
  }

  return NextResponse.json({ ...(await load(customerId)), saved: upserts.length, removed: removed.count });
}
