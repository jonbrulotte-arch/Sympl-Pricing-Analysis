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

export async function getAccessibleCustomerIds(userId: string, role: string): Promise<string[]> {
  const permissions = await getPermissions(role);
  if (permissions.has("admin:settings")) {
    const all = await prisma.customer.findMany({ select: { id: true } });
    return all.map((c) => c.id);
  }
  const links = await prisma.customerUser.findMany({
    where: { userId },
    select: { customerId: true },
  });
  return links.map((l) => l.customerId);
}

/** Prisma `where` fragment for products a user may see: admins see the full catalog, others only customer-linked products. */
export async function productVisibilityWhere(userId: string, role: string) {
  const permissions = await getPermissions(role);
  if (permissions.has("admin:settings")) return {};
  const customerIds = await getAccessibleCustomerIds(userId, role);
  return { customers: { some: { customerId: { in: customerIds } } } };
}

export async function canAccessCustomer(customerId: string, userId: string, role: string): Promise<boolean> {
  const permissions = await getPermissions(role);
  if (permissions.has("admin:settings")) return true;
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return !!link;
}

export function invalidateRoleCache(roleName?: string) {
  if (roleName) {
    roleCache.delete(roleName);
  } else {
    roleCache.clear();
  }
}
