import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, Upload, Package, Plug, AlertTriangle, Send, FolderKanban, CheckCircle2, ChevronRight } from "lucide-react";
import { NavigatingButton } from "@/components/ui/navigating-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getPermissions } from "@/lib/permissions";
import { CustomerActions } from "@/components/customers/customer-actions";
import { SalesChannelsCard } from "@/components/channels/sales-channels-card";
import { CustomerCollaborators } from "@/components/customers/customer-collaborators";

export default async function CustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { customerId } = await params;

  const permissions = await getPermissions(session.user.role);
  const isAdmin = permissions.has("admin:settings");

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...(isAdmin ? {} : { users: { some: { userId } } }) },
    include: {
      channels: { orderBy: { sortOrder: "asc" } },
      _count: { select: { customerProducts: true } },
      projects: {
        where: { status: "active" },
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, name: true, _count: { select: { products: true } } },
      },
      users: { where: { userId }, select: { role: true } },
    },
  });

  if (!customer) notFound();

  const [missingCost, stagedCount, activeProjectCount] = await Promise.all([
    prisma.product.count({ where: { customers: { some: { customerId } }, costHistories: { none: {} } } }),
    prisma.salsifyStaged.count({ where: { customerId } }),
    prisma.project.count({ where: { customerId, status: "active" } }),
  ]);

  const isOwner = isAdmin || customer.users[0]?.role === "OWNER";

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {customer.channels.length} channels &middot;{" "}
            <Link href={`/customers/${customerId}/products`} className="hover:text-blue-600 hover:underline">
              {customer._count.customerProducts} products
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <CustomerActions
            customerId={customerId}
            customerName={customer.name}
            channelCount={customer.channels.length}
            isOwner={isOwner}
          />
          {permissions.has("import:upload") && (
            <Link href={`/customers/${customerId}/import`}>
              <Button>
                <Upload className="h-4 w-4 mr-2" />
                Import Data
              </Button>
            </Link>
          )}
          {(permissions.has("salsify:mapping") || isAdmin) && (
            <Link href={`/customers/${customerId}/salsify-mapping`}>
              <Button variant="outline">
                <Plug className="h-4 w-4 mr-2" />
                Salsify Mapping
              </Button>
            </Link>
          )}
          <Link href={`/customers/${customerId}/products`}>
            <Button variant="outline">
              <Package className="h-4 w-4 mr-2" />
              Products
            </Button>
          </Link>
          <NavigatingButton href={`/customers/${customerId}/analysis`} variant="outline" loadingText="Loading Analysis...">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analysis
          </NavigatingButton>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Channels */}
        <div className="lg:col-span-2">
          <SalesChannelsCard
            customerId={customerId}
            channels={customer.channels.map((ch) => ({
              id: ch.id,
              name: ch.name,
              channelType: ch.channelType,
              freightMode: ch.freightMode,
              isDefault: ch.isDefault,
            }))}
          />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Needs Attention</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <AttentionRow
                href={`/customers/${customerId}/products?missing=cost`}
                icon={<AlertTriangle className="h-4 w-4 text-amber-600" />}
                count={missingCost}
                label="products missing cost data"
                done="All products have cost data"
              />
              <AttentionRow
                href={
                  permissions.has("salsify:publish") || isAdmin
                    ? `/customers/${customerId}/analysis?tab=publish`
                    : `/customers/${customerId}/analysis`
                }
                icon={<Send className="h-4 w-4 text-blue-600" />}
                count={stagedCount}
                label="committed changes waiting to publish to Salsify"
                done="Nothing waiting to publish"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Projects</CardTitle>
              <Link href="/projects" className="text-xs text-blue-600 hover:underline">
                View all{activeProjectCount > customer.projects.length ? ` (${activeProjectCount})` : ""}
              </Link>
            </CardHeader>
            <CardContent>
              {customer.projects.length === 0 ? (
                <p className="text-sm text-gray-500 py-2 text-center">No active projects.</p>
              ) : (
                <div className="space-y-1">
                  {customer.projects.map((p) => (
                    <Link
                      key={p.id}
                      href={`/projects/${p.id}`}
                      className="flex items-center justify-between gap-2 -mx-2 px-2 py-1.5 rounded text-sm hover:bg-gray-50"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FolderKanban className="h-4 w-4 text-gray-400 shrink-0" />
                        <span className="font-medium text-gray-900 truncate">{p.name}</span>
                      </span>
                      <span className="text-xs text-gray-500 shrink-0">{p._count.products} SKUs</span>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <CustomerCollaborators customerId={customerId} isOwner={isOwner} />
        </div>
      </div>
    </div>
  );
}

function AttentionRow({
  href,
  icon,
  count,
  label,
  done,
}: {
  href: string;
  icon: React.ReactNode;
  count: number;
  label: string;
  done: string;
}) {
  if (count === 0) {
    return (
      <div className="flex items-center gap-2 py-1.5 text-sm text-gray-500">
        <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
        {done}
      </div>
    );
  }
  return (
    <Link href={href} className="flex items-center gap-2 -mx-2 px-2 py-1.5 rounded text-sm hover:bg-gray-50 group">
      <span className="shrink-0">{icon}</span>
      <span className="flex-1 text-gray-700">
        <span className="font-semibold text-gray-900">{count.toLocaleString()}</span> {label}
      </span>
      <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-gray-500 shrink-0" />
    </Link>
  );
}
