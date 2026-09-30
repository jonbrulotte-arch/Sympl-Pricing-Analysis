import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions, invalidateRoleCache } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { ALL_PERMISSIONS } from "@/types";
import type { Permission } from "@/types";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const roles = await prisma.appRole.findMany({
    orderBy: { createdAt: "asc" },
  });

  const userCounts = await prisma.user.groupBy({
    by: ["role"],
    _count: { id: true },
  });
  const countMap = new Map(userCounts.map((u) => [u.role, u._count.id]));

  return NextResponse.json(
    roles.map((r) => ({
      ...r,
      userCount: countMap.get(r.name) ?? 0,
    })),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = ((body.name as string) ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
  const description = ((body.description as string) ?? "").trim() || null;
  const permissions = Array.isArray(body.permissions)
    ? (body.permissions as string[]).filter((p): p is Permission => ALL_PERMISSIONS.includes(p as Permission))
    : [];

  if (!name) return NextResponse.json({ error: "Role name is required" }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ error: "Role name must be at least 2 characters" }, { status: 400 });

  const existing = await prisma.appRole.findUnique({ where: { name } });
  if (existing) return NextResponse.json({ error: `A role named "${name}" already exists` }, { status: 409 });

  const role = await prisma.appRole.create({
    data: { name, description, permissions, isSystem: false },
  });

  invalidateRoleCache(name);

  logActivity({
    action: "admin.createRole",
    category: "admin",
    summary: `Created role "${name}" with ${permissions.length} permissions`,
    detail: { roleId: role.id, name, permissions },
    userId: session.user.id,
  });

  return NextResponse.json(role, { status: 201 });
}
