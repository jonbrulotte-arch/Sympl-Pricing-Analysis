import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { canManageSalsifyMapping } from "@/lib/permissions";

export default async function SalsifyMappingLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ customerId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await canManageSalsifyMapping(session.user.role))) redirect(`/customers/${(await params).customerId}`);
  return children;
}
