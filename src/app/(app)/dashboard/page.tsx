import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Building2, Upload, BarChart3, Plus, FileSpreadsheet, ArrowRight, Package, DollarSign, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const customerIds = (
    await prisma.customerUser.findMany({
      where: { userId },
      select: { customerId: true },
    })
  ).map((cu) => cu.customerId);

  const baseProductWhere = { customers: { some: { customerId: { in: customerIds } } } };

  const [customers, totalProducts, productsWithCost, productsWithFreight] = await Promise.all([
    prisma.customer.findMany({
      where: { users: { some: { userId } } },
      select: {
        id: true,
        name: true,
        channels: { select: { id: true, name: true } },
        customerProducts: { select: { productId: true } },
        analyses: {
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, name: true, createdAt: true, createdBy: { select: { name: true } } },
        },
        imports: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, fileName: true, rowCount: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.product.count({ where: baseProductWhere }),
    prisma.product.count({ where: { ...baseProductWhere, costHistories: { some: {} } } }),
    prisma.product.count({ where: { ...baseProductWhere, shippingCostHistories: { some: { shippingType: "mcf_freight" } } } }),
  ]);

  const totalCustomers = customers.length;
  const totalChannels = customers.reduce((sum, c) => sum + c.channels.length, 0);
  const missingSupplemental = totalProducts - Math.min(productsWithCost, productsWithFreight);

  const recentAnalyses = customers
    .flatMap((c) => c.analyses.map((a) => ({ ...a, customerName: c.name, customerId: c.id })))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 5);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Multi-channel pricing analysis overview</p>
        </div>
        <Link href="/customers/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New Customer
          </Button>
        </Link>
      </div>

      {/* Product Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
                <p className="text-sm text-gray-500">Products in Database</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-green-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{productsWithCost}</p>
                <p className="text-sm text-gray-500">With Cost Data</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{missingSupplemental}</p>
                <p className="text-sm text-gray-500">Missing Supplemental</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalChannels}</p>
                <p className="text-sm text-gray-500">Sales Channels</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer/Channel stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalCustomers}</p>
                <p className="text-sm text-gray-500">Customers</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center">
                <Upload className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {customers.reduce((sum, c) => sum + c.customerProducts.length, 0)}
                </p>
                <p className="text-sm text-gray-500">Customer–Product Links</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer List */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Your Customers</CardTitle>
            </CardHeader>
            <CardContent>
              {customers.length === 0 ? (
                <div className="text-center py-12">
                  <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500 mb-4">No customers yet. Create your first customer to get started.</p>
                  <Link href="/customers/new">
                    <Button>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Customer
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-200">
                  {customers.map((customer) => (
                    <div key={customer.id} className="py-4">
                      <div className="flex items-center justify-between">
                        <Link
                          href={`/customers/${customer.id}`}
                          className="text-sm font-medium text-gray-900 hover:text-blue-600"
                        >
                          {customer.name}
                        </Link>
                        <div className="flex items-center gap-2">
                          <Link href={`/customers/${customer.id}/analysis`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                              <BarChart3 className="h-3 w-3 mr-1" />
                              Analyze
                            </Button>
                          </Link>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-500">{customer.channels.length} channels</span>
                        <span className="text-xs text-gray-500">&middot;</span>
                        <span className="text-xs text-gray-500">{customer.customerProducts.length} products</span>
                        {customer.imports[0] && (
                          <>
                            <span className="text-xs text-gray-500">&middot;</span>
                            <span className="text-xs text-gray-500">
                              Last import: {formatDate(customer.imports[0].createdAt)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
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
              <CardTitle className="text-base">Recent Analyses</CardTitle>
            </CardHeader>
            <CardContent>
              {recentAnalyses.length === 0 ? (
                <p className="text-sm text-gray-500 py-4 text-center">No analyses yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentAnalyses.map((a) => (
                    <Link
                      key={a.id}
                      href={`/customers/${a.customerId}/analysis`}
                      className="block p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{a.name || "Untitled"}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{a.customerName}</p>
                        </div>
                        <ArrowRight className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{formatDateTime(a.createdAt)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href="/products/import" className="block">
                <Button variant="outline" className="w-full justify-start h-9 text-sm">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Import Products
                </Button>
              </Link>
              <Link href="/customers/new" className="block">
                <Button variant="outline" className="w-full justify-start h-9 text-sm">
                  <Plus className="h-4 w-4 mr-2" />
                  New Customer
                </Button>
              </Link>
              {customers[0] && (
                <Link href={`/customers/${customers[0].id}/analysis`} className="block">
                  <Button variant="outline" className="w-full justify-start h-9 text-sm">
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Run Analysis
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
