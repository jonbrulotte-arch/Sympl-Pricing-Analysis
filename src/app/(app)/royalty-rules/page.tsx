import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPermissions } from "@/lib/permissions";
import { RoyaltyRulesManager } from "@/components/royalties/royalty-rules-manager";

export default async function RoyaltyRulesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const permissions = await getPermissions(session.user.role);
  if (!permissions.has("module:royalties")) redirect("/dashboard");
  const canEdit = permissions.has("royalties:edit");

  return <RoyaltyRulesManager canEditCustomer={canEdit} canEditGlobal={canEdit && permissions.has("admin:settings")} />;
}
