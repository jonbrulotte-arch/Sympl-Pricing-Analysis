import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPermissions } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const permissions = getPermissions(session.user.role);
  if (!permissions.has("admin:settings")) redirect("/dashboard");

  const [userCount, customerCount, productCount, channelCount] = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.product.count(),
    prisma.salesChannel.count(),
  ]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Application configuration and status</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Application</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Name</span>
              <span className="text-sm font-medium text-gray-900">Sympl Pricing Analysis</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Version</span>
              <Badge variant="secondary" className="text-xs">0.1.0</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Environment</span>
              <Badge variant={process.env.NODE_ENV === "production" ? "default" : "secondary"} className="text-xs">
                {process.env.NODE_ENV}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Database</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Status</span>
              <Badge variant="default" className="text-xs bg-green-600">Connected</Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Users</span>
              <span className="text-sm font-medium text-gray-900">{userCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Customers</span>
              <span className="text-sm font-medium text-gray-900">{customerCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Products</span>
              <span className="text-sm font-medium text-gray-900">{productCount}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Sales Channels</span>
              <span className="text-sm font-medium text-gray-900">{channelCount}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Authentication</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Provider</span>
              <span className="text-sm font-medium text-gray-900">Credentials</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Session Strategy</span>
              <span className="text-sm font-medium text-gray-900">JWT</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Trust Host</span>
              <Badge variant="default" className="text-xs bg-green-600">Enabled</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
