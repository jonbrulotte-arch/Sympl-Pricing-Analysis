import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions, invalidateRoleCache } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { ALL_PERMISSIONS } from "@/types";
import type { Permission } from "@/types";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { roleId } = await params;
  const role = await prisma.appRole.findUnique({ where: { id: roleId } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};

  if (body.description !== undefined) {
    data.description = ((body.description as string) ?? "").trim() || null;
  }

  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions)) {
      return NextResponse.json({ error: "Permissions must be an array" }, { status: 400 });
    }
    data.permissions = (body.permissions as string[]).filter(
      (p): p is Permission => ALL_PERMISSIONS.includes(p as Permission),
    );
  }

  if (body.name !== undefined && !role.isSystem) {
    const newName = ((body.name as string) ?? "").trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!newName || newName.length < 2) {
      return NextResponse.json({ error: "Role name must be at least 2 characters" }, { status: 400 });
    }
    if (newName !== role.name) {
      const existing = await prisma.appRole.findUnique({ where: { name: newName } });
      if (existing) return NextResponse.json({ error: `A role named "${newName}" already exists` }, { status: 409 });
      await prisma.user.updateMany({ where: { role: role.name }, data: { role: newName } });
      data.name = newName;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.appRole.update({ where: { id: roleId }, data });

  invalidateRoleCache(role.name);
  if (data.name) invalidateRoleCache(data.name as string);

  logActivity({
    action: "admin.updateRole",
    category: "admin",
    summary: `Updated role "${updated.name}"`,
    detail: { roleId, changes: Object.keys(data) },
    userId: session.user.id,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ roleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:roles"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { roleId } = await params;
  const role = await prisma.appRole.findUnique({ where: { id: roleId } });
  if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
  if (role.isSystem) return NextResponse.json({ error: "System roles cannot be deleted" }, { status: 400 });

  const userCount = await prisma.user.count({ where: { role: role.name } });
  if (userCount > 0) {
    return NextResponse.json({
      error: `Cannot delete role "${role.name}" — ${userCount} user(s) still assigned to it. Reassign them first.`,
    }, { status: 400 });
  }

  await prisma.appRole.delete({ where: { id: roleId } });
  invalidateRoleCache(role.name);

  logActivity({
    action: "admin.deleteRole",
    category: "admin",
    summary: `Deleted role "${role.name}"`,
    detail: { roleId, name: role.name },
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
