export interface SafeUser {
  id: string;
  email: string;
  name: string;
  role: string;
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
  | "admin:settings"
  | "admin:roles"
  | "module:products"
  | "module:customers"
  | "module:projects"
  | "module:royalties"
  | "module:activityLog";

export const ALL_PERMISSIONS: Permission[] = [
  "module:products",
  "module:customers",
  "module:projects",
  "module:royalties",
  "module:activityLog",
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
  "admin:roles",
];

export const PERMISSION_GROUPS: { label: string; permissions: { key: Permission; label: string }[] }[] = [
  {
    label: "Modules",
    permissions: [
      { key: "module:products", label: "Products" },
      { key: "module:customers", label: "Customers" },
      { key: "module:projects", label: "Projects" },
      { key: "module:royalties", label: "Royalty Rules" },
      { key: "module:activityLog", label: "Activity Log" },
    ],
  },
  {
    label: "Customers",
    permissions: [
      { key: "customers:create", label: "Create" },
      { key: "customers:edit", label: "Edit" },
      { key: "customers:delete", label: "Delete" },
    ],
  },
  {
    label: "Channels",
    permissions: [
      { key: "channels:create", label: "Create" },
      { key: "channels:edit", label: "Edit" },
      { key: "channels:delete", label: "Delete" },
    ],
  },
  {
    label: "Analysis",
    permissions: [
      { key: "analysis:create", label: "Create" },
      { key: "analysis:export", label: "Export" },
    ],
  },
  {
    label: "Data",
    permissions: [
      { key: "import:upload", label: "Import Products" },
      { key: "royalties:edit", label: "Edit Royalties" },
    ],
  },
  {
    label: "Administration",
    permissions: [
      { key: "admin:users", label: "Manage Users" },
      { key: "admin:settings", label: "Manage Settings" },
      { key: "admin:roles", label: "Manage Roles" },
    ],
  },
];

export const DEFAULT_ADMIN_PERMISSIONS: Permission[] = [...ALL_PERMISSIONS];

export const DEFAULT_ANALYST_PERMISSIONS: Permission[] = [
  "module:products",
  "module:customers",
  "module:projects",
  "module:royalties",
  "module:activityLog",
  "customers:edit",
  "channels:edit",
  "analysis:create",
  "analysis:export",
  "import:upload",
  "royalties:edit",
];
