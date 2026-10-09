import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions, invalidateRoleCache } from "@/lib/permissions";
import { DEFAULT_ADMIN_PERMISSIONS, DEFAULT_ANALYST_PERMISSIONS } from "@/types";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = await prisma.appRole.upsert({
    where: { name: "ADMIN" },
    update: {},
    create: {
      name: "ADMIN",
      description: "Full access to all modules and settings",
      permissions: DEFAULT_ADMIN_PERMISSIONS,
      isSystem: true,
    },
  });

  const analyst = await prisma.appRole.upsert({
    where: { name: "ANALYST" },
    update: {},
    create: {
      name: "ANALYST",
      description: "Standard analyst with access to core modules",
      permissions: DEFAULT_ANALYST_PERMISSIONS,
      isSystem: true,
    },
  });

  invalidateRoleCache();

  return NextResponse.json({
    bootstrapped: true,
    roles: [
      { name: admin.name, permissions: (admin.permissions as string[]).length },
      { name: analyst.name, permissions: (analyst.permissions as string[]).length },
    ],
  });
}
