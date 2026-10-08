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

const PAGE_SIZES = [25, 50, 100];

export default async function CustomerProductsPage({
  params,
  searchParams,
}: {
  params: Promise<{ customerId: string }>;
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { customerId } = await params;
  const { q, page: pageParam, pageSize: pageSizeParam } = await searchParams;

  const permissions = await getPermissions(session.user.role);
  const isAdmin = permissions.has("admin:settings");
  const canEdit = permissions.has("customers:edit");
  const canViewCost = permissions.has("data:viewCost");

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, ...(isAdmin ? {} : { users: { some: { userId } } }) },
    select: { id: true, name: true },
  });
  if (!customer) notFound();

  const pageSize = PAGE_SIZES.includes(Number(pageSizeParam)) ? Number(pageSizeParam) : 25;
  const page = Math.max(1, Number(pageParam) || 1);

  const linked = { customers: { some: { customerId } } };
  const where = {
    ...linked,
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
  const [projectCounts, latestCosts] = await Promise.all([
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
  ]);
  const projectMap = new Map(projectCounts.map((p) => [p.productId, p._count._all]));
  const costMap = new Map(latestCosts.map((c) => [c.productId, Number(c.cost)]));

  const rows = products.map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand,
    inventoryStatus: p.inventoryStatus,
    cost: costMap.get(p.id) ?? null,
    projectCount: projectMap.get(p.id) ?? 0,
  }));

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  function pageHref(p: number) {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
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
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input name="q" defaultValue={q ?? ""} placeholder="Search SKU, name, or brand..." className="pl-9" />
          </div>
        </form>
        <div className="flex items-center gap-3">
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
        emptyMessage={q ? "No products match your search." : "No products assigned yet."}
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
