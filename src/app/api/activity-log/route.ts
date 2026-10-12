import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer, getAccessibleCustomerIds, getPermissions } from "@/lib/permissions";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getPermissions(session.user.role);
  const isAdmin = permissions.has("admin:settings");
  if (!isAdmin && !permissions.has("module:activityLog"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = req.nextUrl;
  const category = url.searchParams.get("category") || undefined;
  const customerId = url.searchParams.get("customerId") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  if (customerId && !(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const conditions: Record<string, unknown>[] = [];
  if (!isAdmin) {
    // Non-admins see activity for their customers, plus their own entries that aren't tied to a customer.
    // Admin-category entries (users, roles, settings) stay admin-only.
    const customerIds = await getAccessibleCustomerIds(session.user.id, session.user.role);
    conditions.push({ OR: [{ customerId: { in: customerIds } }, { customerId: null, userId: session.user.id }] });
    conditions.push({ category: { not: "admin" } });
  }
  if (category) conditions.push({ category });
  if (customerId) conditions.push({ customerId });
  if (search) {
    conditions.push({
      OR: [
        { summary: { contains: search, mode: "insensitive" } },
        { action: { contains: search, mode: "insensitive" } },
      ],
    });
  }
  const where = { AND: conditions };

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
