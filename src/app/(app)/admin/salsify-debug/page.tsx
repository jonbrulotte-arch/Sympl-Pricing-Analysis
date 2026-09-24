import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPermissions } from "@/types";
import { SalsifyDebugClient } from "@/components/admin/salsify-debug-client";

export default async function SalsifyDebugPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const permissions = getPermissions(session.user.role);
  if (!permissions.has("admin:settings")) redirect("/dashboard");

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Salsify Debug</h1>
        <p className="text-sm text-gray-500 mt-1">
          Raw diagnostic tools for troubleshooting the Salsify integration. Uses your own saved API key and the
          admin-configured Org ID.
        </p>
      </div>

      <SalsifyDebugClient />
    </div>
  );
}
