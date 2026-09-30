import { prisma } from "@/lib/prisma";
import type { Permission } from "@/types";
import { DEFAULT_ADMIN_PERMISSIONS, DEFAULT_ANALYST_PERMISSIONS } from "@/types";

const roleCache = new Map<string, { permissions: Permission[]; ts: number }>();
const CACHE_TTL = 60_000;

export async function getPermissions(role: string): Promise<Set<Permission>> {
  const cached = roleCache.get(role);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return new Set(cached.permissions);
  }

  const dbRole = await prisma.appRole.findUnique({ where: { name: role } });
  let permissions: Permission[];
  if (dbRole) {
    permissions = dbRole.permissions as Permission[];
  } else if (role === "ADMIN") {
    permissions = DEFAULT_ADMIN_PERMISSIONS;
  } else if (role === "ANALYST") {
    permissions = DEFAULT_ANALYST_PERMISSIONS;
  } else {
    permissions = [];
  }

  roleCache.set(role, { permissions, ts: Date.now() });
  return new Set(permissions);
}

export function invalidateRoleCache(roleName?: string) {
  if (roleName) {
    roleCache.delete(roleName);
  } else {
    roleCache.clear();
  }
}
