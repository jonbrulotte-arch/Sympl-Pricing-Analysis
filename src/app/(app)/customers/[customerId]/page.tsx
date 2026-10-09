import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { BarChart3, Upload, Settings, Plus, Store, Package, Plug, AlertTriangle, Send, FolderKanban, CheckCircle2, ChevronRight } from "lucide-react";
import { NavigatingButton } from "@/components/ui/navigating-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPermissions } from "@/lib/permissions";
import { CustomerActions } from "@/components/customers/customer-actions";
import { ChannelDeleteButton } from "@/components/channels/channel-delete-button";
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
          <Link href={`/customers/${customerId}/import`}>
            <Button>
              <Upload className="h-4 w-4 mr-2" />
              Import Data
            </Button>
          </Link>
          <Link href={`/customers/${customerId}/salsify-mapping`}>
            <Button variant="outline">
              <Plug className="h-4 w-4 mr-2" />
              Salsify Mapping
            </Button>
          </Link>
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
                    <div
                      key={ch.id}
                      className="flex items-center justify-between py-3 hover:bg-gray-50 -mx-4 px-4 rounded transition-colors"
                    >
                      <Link
                        href={`/customers/${customerId}/channels/${ch.id}`}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <Store className="h-4 w-4 text-gray-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{ch.name}</p>
                          <p className="text-xs text-gray-500">
                            {ch.channelType === "commercial" ? "Commercial" : "Online"}{" · "}
                            {ch.freightMode === "collect" ? "Collect" : "Prepaid"}
                          </p>
                        </div>
                      </Link>
                      <div className="flex items-center gap-2 shrink-0">
                        <NavigatingButton
                          href={`/customers/${customerId}/analysis?channel=${ch.id}`}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-2.5"
                          loadingText="Loading..."
                        >
                          <BarChart3 className="h-3.5 w-3.5 mr-1" />
                          Analysis
                        </NavigatingButton>
                        {ch.isDefault && (
                          <Badge variant="secondary" className="text-xs">
                            Default
                          </Badge>
                        )}
                        <Link
                          href={`/customers/${customerId}/channels/${ch.id}`}
                          className="p-1 rounded hover:bg-gray-100"
                        >
                          <Settings className="h-3.5 w-3.5 text-gray-400" />
                        </Link>
                        {!ch.isDefault && (
                          <ChannelDeleteButton
                            customerId={customerId}
                            channelId={ch.id}
                            channelName={ch.name}
                            iconOnly
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
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
                href={`/customers/${customerId}/analysis?tab=publish`}
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
