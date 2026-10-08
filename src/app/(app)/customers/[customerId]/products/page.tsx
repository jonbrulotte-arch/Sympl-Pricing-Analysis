import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPermissions } from "@/lib/permissions";
import { PageSizeSelect } from "@/components/products/page-size-select";
import { CustomerProducts } from "@/components/customers/customer-products";
import { ChannelFilterSelect } from "@/components/customers/channel-filter-select";

const PAGE_SIZES = [25, 50, 100];

export default async function CustomerProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string; channel?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { customerId } = await params;
  const { q, page: pageParam, pageSize: pageSizeParam, channel: channelParam } = await searchParams;

  const permissions = await getPermissions(session.user.role);
  const isAdmin = permissions.has("admin:settings");
  const canEdit = permissions.has("customers:edit");
  const canViewCost = permissions.has("data:viewCost");

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...(isAdmin ? {} : { users: { some: { userId } } }) },
    select: {
      id: true,
      name: true,
      channels: { orderBy: { sortOrder: "asc" }, select: { id: true, tabLabel: true, salsifyListId: true } },
    },
  });
  if (!customer) notFound();

  const pageSize = PAGE_SIZES.includes(Number(pageSizeParam)) ? Number(pageSizeParam) : 25;
  const page = Math.max(1, Number(pageParam) || 1);
  const channelFilter = customer.channels.find((c) => c.id === channelParam) ?? null;

  const linked = { customers: { some: { customerId } } };
  const where = {
    ...linked,
    ...(channelFilter ? { channels: { some: { channelId: channelFilter.id } } } : {}),
    ...(q
      ? {
          OR: [
            { sku: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
            { brand: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [products, totalCount, linkedCount, unassignedCount] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { sku: "asc" },
      select: { id: true, sku: true, name: true, brand: true, inventoryStatus: true },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
    prisma.product.count({ where: linked }),
    isAdmin && canEdit ? prisma.product.count({ where: { customers: { none: {} } } }) : Promise.resolve(0),
  ]);

  const productIds = products.map((p) => p.id);
  const listChannels = customer.channels.filter((c) => c.salsifyListId);
  const [projectCounts, latestCosts, memberships] = await Promise.all([
    prisma.projectProduct.groupBy({
      by: ["productId"],
      where: { productId: { in: productIds }, project: { customerId } },
      _count: { _all: true },
    }),
    canViewCost
      ? prisma.costHistory.findMany({
          where: { productId: { in: productIds } },
          orderBy: { recordedAt: "desc" },
          distinct: ["productId"],
          select: { productId: true, cost: true },
        })
      : Promise.resolve([]),
    listChannels.length > 0
      ? prisma.channelProduct.findMany({
          where: { productId: { in: productIds }, channelId: { in: listChannels.map((c) => c.id) } },
          select: { productId: true, channelId: true },
        })
      : Promise.resolve([]),
  ]);
  const projectMap = new Map(projectCounts.map((p) => [p.productId, p._count._all]));
  const costMap = new Map(latestCosts.map((c) => [c.productId, Number(c.cost)]));
  const channelLabel = new Map(customer.channels.map((c) => [c.id, c.tabLabel]));
  const channelsByProduct = new Map<string, string[]>();
  for (const m of memberships) {
    const list = channelsByProduct.get(m.productId) ?? [];
    list.push(channelLabel.get(m.channelId) ?? "");
    channelsByProduct.set(m.productId, list);
  }

  const rows = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    inventoryStatus: p.inventoryStatus,
    cost: costMap.get(p.id) ?? null,
    projectCount: projectMap.get(p.id) ?? 0,
    channels: channelsByProduct.get(p.id) ?? [],
  }));

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (channelFilter) sp.set("channel", channelFilter.id);
    sp.set("page", String(p));
    sp.set("pageSize", String(pageSize));
    return `/customers/${customerId}/products?${sp.toString()}`;
  }

  const navClass = "inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border";

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href={`/customers/${customerId}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{customer.name} — Products</h1>
          <p className="text-sm text-gray-500 mt-0.5">{linkedCount} products assigned to this customer</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <form className="max-w-sm w-full">
          {channelFilter && <input type="hidden" name="channel" value={channelFilter.id} />}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input name="q" defaultValue={q ?? ""} placeholder="Search SKU, name, or brand..." className="pl-9" />
          </div>
        </form>
        <div className="flex items-center gap-3">
          {listChannels.length > 0 && (
            <ChannelFilterSelect
              channels={listChannels.map((c) => ({ id: c.id, label: c.tabLabel }))}
              value={channelFilter?.id ?? null}
            />
          )}
          <p className="text-sm text-gray-600">
            {totalCount === 0 ? "0 products" : `${rangeStart}–${rangeEnd} of ${totalCount}`}
          </p>
          <PageSizeSelect pageSize={pageSize} />
        </div>
      </div>

      <CustomerProducts
        customerId={customerId}
        rows={rows}
        canEdit={canEdit}
        canViewCost={canViewCost}
        unassignedCount={unassignedCount}
        showChannels={listChannels.length > 0}
        emptyMessage={
          q
            ? "No products match your search."
            : channelFilter
              ? `No products on ${channelFilter.tabLabel} yet. Sync its Salsify list from the channel settings.`
              : "No products assigned yet."
        }
      />

      {totalCount > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className={`${navClass} border-gray-300 text-gray-700 hover:bg-gray-50`}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </Link>
            ) : (
              <span className={`${navClass} border-gray-200 text-gray-400 cursor-not-allowed`}>
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </span>
            )}
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className={`${navClass} border-gray-300 text-gray-700 hover:bg-gray-50`}>
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className={`${navClass} border-gray-200 text-gray-400 cursor-not-allowed`}>
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
