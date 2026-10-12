import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer, getPermissions } from "@/lib/permissions";

const CHUNK = 1000;

type Params = { params: Promise<{ customerId: string }> };

async function authorize(customerId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const { id: userId, role } = session.user;

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true } });
  if (!customer || !(await canAccessCustomer(customerId, userId, role)))
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };

  const permissions = await getPermissions(role);
  if (!permissions.has("customers:edit"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };

  return { userId, customer, isAdmin: permissions.has("admin:settings") };
}

function stringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && s.trim() !== "").map((s) => s.trim()) : [];
}

export async function POST(req: NextRequest, { params }: Params) {
  const { customerId } = await params;
  const ctx = await authorize(customerId);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const skus = stringArray(body.skus);
  const productIds = stringArray(body.productIds);
  const allUnassigned = body.allUnassigned === true;

  let ids: string[] = [];
  let missing: string[] = [];

  if (allUnassigned) {
    if (!ctx.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const q = typeof body.q === "string" ? body.q.trim() : "";
    const products = await prisma.product.findMany({
      where: {
        customers: { none: {} },
        ...(q
          ? {
              OR: [
                { sku: { contains: q, mode: "insensitive" as const } },
                { name: { contains: q, mode: "insensitive" as const } },
                { brand: { contains: q, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: { id: true },
    });
    ids = products.map((p) => p.id);
  } else if (skus.length > 0) {
    const unique = [...new Set(skus)];
    const products = await prisma.product.findMany({ where: { sku: { in: unique } }, select: { id: true, sku: true } });
    const found = new Set(products.map((p) => p.sku));
    missing = unique.filter((s) => !found.has(s));
    ids = products.map((p) => p.id);
  } else if (productIds.length > 0) {
    const products = await prisma.product.findMany({ where: { id: { in: [...new Set(productIds)] } }, select: { id: true } });
    ids = products.map((p) => p.id);
  } else {
    return NextResponse.json({ error: "Provide skus, productIds, or allUnassigned" }, { status: 400 });
  }

  let added = 0;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const res = await prisma.customerProduct.createMany({
      data: ids.slice(i, i + CHUNK).map((productId) => ({ customerId, productId })),
      skipDuplicates: true,
    });
    added += res.count;
  }
  const alreadyLinked = ids.length - added;

  if (added > 0) {
    logActivity({
      action: "customer.addProducts",
      category: "customer",
      summary: `Assigned ${added} product(s) to "${ctx.customer.name}"`,
      detail: { added, alreadyLinked, missingCount: missing.length, allUnassigned },
      customerId,
      userId: ctx.userId,
    });
  }

  return NextResponse.json({ added, alreadyLinked, missing });
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { customerId } = await params;
  const ctx = await authorize(customerId);
  if ("error" in ctx) return ctx.error;

  const body = await req.json().catch(() => ({}));
  const productIds = [...new Set(stringArray(body.productIds))];
  if (productIds.length === 0) return NextResponse.json({ error: "Provide productIds" }, { status: 400 });

  const [fromProjects, fromCustomer] = await prisma.$transaction([
    prisma.projectProduct.deleteMany({
      where: { productId: { in: productIds }, project: { customerId } },
    }),
    prisma.customerProduct.deleteMany({
      where: { customerId, productId: { in: productIds } },
    }),
  ]);

  logActivity({
    action: "customer.removeProducts",
    category: "customer",
    summary: `Removed ${fromCustomer.count} product(s) from "${ctx.customer.name}"`,
    detail: { removed: fromCustomer.count, removedFromProjects: fromProjects.count },
    customerId,
    userId: ctx.userId,
  });

  return NextResponse.json({ removed: fromCustomer.count, removedFromProjects: fromProjects.count });
}
