import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getPermissions } from "@/lib/permissions";

export default async function ImportLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await getPermissions(session.user.role)).has("import:upload")) redirect("/products");
  return children;
}
