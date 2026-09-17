import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPermissions } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { AddUserButton, DeleteUserButton } from "@/components/admin/user-actions";

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const permissions = getPermissions(session.user.role);
  if (!permissions.has("admin:users")) redirect("/dashboard");

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      customers: {
        select: { customer: { select: { id: true, name: true } } },
      },
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-1">{users.length} registered users</p>
        </div>
        <AddUserButton />
      </div>

      <Card>
        <CardContent className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Name</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Email</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Role</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Customers</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Created</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-50">
                    <td className="py-2 px-2 text-gray-900 font-medium">{u.name}</td>
                    <td className="py-2 px-2 text-gray-600">{u.email}</td>
                    <td className="py-2 px-2">
                      <Badge variant={u.role === "ADMIN" ? "default" : "secondary"} className="text-xs">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="py-2 px-2 text-gray-600">
                      {u.customers.length === 0
                        ? "-"
                        : u.customers.map((c) => c.customer.name).join(", ")}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-500">{formatDate(u.createdAt)}</td>
                    <td className="py-2 px-2 text-right">
                      {u.id !== session.user.id && <DeleteUserButton userId={u.id} userName={u.name} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
