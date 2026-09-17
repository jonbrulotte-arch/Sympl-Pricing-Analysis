import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPermissions } from "@/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function SalsifyLogPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const permissions = getPermissions(session.user.role);
  if (!permissions.has("admin:settings")) redirect("/dashboard");

  const imports = await prisma.import.findMany({
    where: { source: "salsify" },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      customer: { select: { name: true } },
      uploadedBy: { select: { name: true, email: true } },
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Salsify Log</h1>
        <p className="text-sm text-gray-500 mt-1">{imports.length} recent Salsify syncs</p>
      </div>

      <Card>
        <CardContent className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Customer</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Run by</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Status</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Rows</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {imports.map((imp) => (
                  <tr key={imp.id} className="border-b border-gray-50">
                    <td className="py-2 px-2 text-gray-900 font-medium">{imp.customer.name}</td>
                    <td className="py-2 px-2 text-gray-600">{imp.uploadedBy.name}</td>
                    <td className="py-2 px-2">
                      <Badge variant={imp.status === "complete" ? "success" : imp.status === "processing" ? "secondary" : "destructive"} className="text-xs">
                        {imp.status}
                      </Badge>
                      {imp.errors != null && (
                        <p className="text-xs text-red-600 mt-1 max-w-md truncate">{JSON.stringify(imp.errors)}</p>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-600">{imp.rowCount}</td>
                    <td className="py-2 px-2 text-right text-gray-500">{formatDate(imp.createdAt)}</td>
                  </tr>
                ))}
                {imports.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">No Salsify syncs yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
