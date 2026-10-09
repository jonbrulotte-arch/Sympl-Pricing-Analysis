import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPermissions } from "@/lib/permissions";
import { RolesClient } from "@/components/admin/roles-client";

export default async function AdminRolesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const permissions = await getPermissions(session.user.role);
  if (!permissions.has("admin:roles")) redirect("/dashboard");

  return <RolesClient />;
}
