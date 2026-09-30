import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ActivityLogView } from "@/components/activity-log/activity-log-view";

export default async function ActivityLogPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const customers = await prisma.customer.findMany({
    where: { users: { some: { userId: session.user.id } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Activity Log</h1>
        <p className="text-sm text-gray-500 mt-1">
          All changes, imports, and publishes across the platform.
        </p>
      </div>
      <ActivityLogView customers={customers} />
    </div>
  );
}
