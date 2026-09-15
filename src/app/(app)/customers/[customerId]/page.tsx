import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, Upload, Settings, Plus, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { customerId } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, users: { some: { userId } } },
    include: {
      channels: { orderBy: { sortOrder: "asc" } },
      _count: { select: { products: true } },
      analyses: { orderBy: { createdAt: "desc" }, take: 5, select: { id: true, name: true, createdAt: true } },
    },
  });

  if (!customer) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {customer.channels.length} channels &middot; {customer._count.products} products
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/customers/${customerId}/import`}>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Import Data
            </Button>
          </Link>
          <Link href={`/customers/${customerId}/analysis`}>
            <Button variant="outline">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analysis
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Channels */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sales Channels</CardTitle>
              <Link href={`/customers/${customerId}/channels/new`}>
                <Button size="sm" variant="outline">
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add Channel
                </Button>
              </Link>
            </CardHeader>
            <CardContent>
              {customer.channels.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">No channels configured.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {customer.channels.map((ch) => (
                    <Link
                      key={ch.id}
                      href={`/customers/${customerId}/channels/${ch.id}`}
                      className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-4 px-4 rounded transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Store className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">{ch.name}</p>
                          <p className="text-xs text-gray-500">
                            {ch.shippingMode === "fba" ? "FBA" : ch.shippingMode === "mcf" ? "MCF" : "Standard"}{" "}
                            shipping
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {ch.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                        <Settings className="h-3.5 w-3.5 text-gray-400" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Recent Analyses */}
        <div>
          <Card>
            <CardHeader>
              <CardTitle>Recent Analyses</CardTitle>
            </CardHeader>
            <CardContent>
              {customer.analyses.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">No analyses yet.</p>
              ) : (
                <div className="space-y-3">
                  {customer.analyses.map((a) => (
                    <Link
                      key={a.id}
                      href={`/customers/${customerId}/analysis/${a.id}`}
                      className="block text-sm hover:text-blue-600 transition-colors"
                    >
                      <p className="font-medium text-gray-900">{a.name || "Untitled"}</p>
                      <p className="text-xs text-gray-400">{formatDate(a.createdAt)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
