export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "ANALYST";
}

export type Permission =
  | "customers:create"
  | "customers:edit"
  | "customers:delete"
  | "channels:create"
  | "channels:edit"
  | "channels:delete"
  | "analysis:create"
  | "analysis:export"
  | "import:upload"
  | "royalties:edit"
  | "admin:users"
  | "admin:settings";

export const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  ADMIN: [
    "customers:create",
    "customers:edit",
    "customers:delete",
    "channels:create",
    "channels:edit",
    "channels:delete",
    "analysis:create",
    "analysis:export",
    "import:upload",
    "royalties:edit",
    "admin:users",
    "admin:settings",
  ],
  ANALYST: [
    "customers:edit",
    "channels:edit",
    "analysis:create",
    "analysis:export",
    "import:upload",
    "royalties:edit",
  ],
};

export function getPermissions(role: string): Set<Permission> {
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}
