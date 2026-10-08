import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPermissions, productVisibilityWhere } from "@/lib/permissions";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Search, ChevronLeft, ChevronRight, Upload, FileSpreadsheet, RefreshCw, Package, DollarSign, AlertTriangle, Truck } from "lucide-react";
import { PageSizeSelect } from "@/components/products/page-size-select";
import { McfFreightImport } from "@/components/products/mcf-freight-import";

const PAGE_SIZES = [25, 50, 100];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string; assigned?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { q, page: pageParam, pageSize: pageSizeParam, assigned } = await searchParams;

  const pageSize = PAGE_SIZES.includes(Number(pageSizeParam)) ? Number(pageSizeParam) : 25;
  const page = Math.max(1, Number(pageParam) || 1);

  const permissions = await getPermissions(session.user.role);
  const isAdmin = permissions.has("admin:settings");
  const unassignedOnly = isAdmin && assigned === "unassigned";

  const baseWhere = await productVisibilityWhere(userId, session.user.role);

  const where = {
    ...baseWhere,
    ...(unassignedOnly ? { customers: { none: {} } } : {}),
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

  const [products, totalCount, totalProducts, withCost, withMcfFreight, unassignedCount] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { sku: "asc" },
      include: {
        _count: {
          select: { costHistories: true, priceHistories: true, shippingCostHistories: true, productPrices: true, customers: true },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.product.count({ where }),
    prisma.product.count({ where: baseWhere }),
    prisma.product.count({
      where: { ...baseWhere, costHistories: { some: {} } },
    }),
    prisma.product.count({
      where: { ...baseWhere, shippingCostHistories: { some: { shippingType: "mcf_freight" } } },
    }),
    isAdmin ? prisma.product.count({ where: { customers: { none: {} } } }) : Promise.resolve(0),
  ]);

  const missingCost = totalProducts - withCost;
  const missingFreight = totalProducts - withMcfFreight;

  const productIds = products.map((p) => p.id);
  const [latestCosts, latestMcfFreight] = await Promise.all([
    prisma.costHistory.findMany({
      where: { productId: { in: productIds } },
      orderBy: { recordedAt: "desc" },
      distinct: ["productId"],
      select: { productId: true, cost: true, recordedAt: true },
    }),
    prisma.shippingCostHistory.findMany({
      where: { productId: { in: productIds }, shippingType: "mcf_freight" },
      orderBy: { recordedAt: "desc" },
      distinct: ["productId"],
      select: { productId: true, amount: true },
    }),
  ]);

  const costMap = new Map(latestCosts.map((c) => [c.productId, { cost: Number(c.cost), at: c.recordedAt }]));
  const freightMap = new Map(latestMcfFreight.map((f) => [f.productId, Number(f.amount)]));

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (unassignedOnly) params.set("assigned", "unassigned");
    params.set("page", String(p));
    params.set("pageSize", String(pageSize));
    return `/products?${params.toString()}`;
  }

  function filterHref(unassigned: boolean) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (unassigned) params.set("assigned", "unassigned");
    params.set("pageSize", String(pageSize));
    return `/products?${params.toString()}`;
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Product Database</h1>
          <p className="text-sm text-gray-500 mt-1">Central hub for all product data</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/products/import/salsify">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Salsify Sync
            </Button>
          </Link>
          <Link href="/products/import/spreadsheet">
            <Button variant="outline" size="sm">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Import Spreadsheet
            </Button>
          </Link>
          <Link href="/products/import/supplemental">
            <Button variant="outline" size="sm">
              <Upload className="h-4 w-4 mr-2" />
              Supplemental Data
            </Button>
          </Link>
          <McfFreightImport />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{totalProducts}</p>
                <p className="text-sm text-gray-500">Total Products</p>
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
                <p className="text-2xl font-bold text-gray-900">{withCost}</p>
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
                <p className="text-2xl font-bold text-gray-900">{missingCost}</p>
                <p className="text-sm text-gray-500">Missing Cost</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-purple-50 flex items-center justify-center">
                <Truck className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">{missingFreight}</p>
                <p className="text-sm text-gray-500">Missing MCF Freight</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <form className="max-w-sm w-full">
            {unassignedOnly && <input type="hidden" name="assigned" value="unassigned" />}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                name="q"
                defaultValue={q ?? ""}
                placeholder="Search SKU, name, or brand..."
                className="pl-9"
              />
            </div>
          </form>
          {isAdmin && (
            <div className="inline-flex rounded-md border border-gray-300 overflow-hidden text-xs shrink-0">
              <Link
                href={filterHref(false)}
                className={cn(
                  "px-3 py-1.5",
                  !unassignedOnly ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                All
              </Link>
              <Link
                href={filterHref(true)}
                className={cn(
                  "px-3 py-1.5 border-l border-gray-300",
                  unassignedOnly ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50",
                )}
              >
                Unassigned ({unassignedCount})
              </Link>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-600">
            {totalCount === 0
              ? "0 products"
              : `${rangeStart}–${rangeEnd} of ${totalCount}`}
          </p>
          <PageSizeSelect pageSize={pageSize} />
        </div>
      </div>

      <Card>
        <CardContent className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">SKU</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Name</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Brand</th>
                  <th className="text-left py-3 px-2 text-gray-600 font-medium">Status</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Cost</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">MCF Freight</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Last Updated</th>
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Records</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const costEntry = costMap.get(p.id);
                  const freight = freightMap.get(p.id);
                  return (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/products/${p.id}`}
                            className="font-mono text-xs text-blue-600 hover:underline"
                          >
                            {p.sku}
                          </Link>
                          {p._count.customers === 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Unassigned</Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-gray-700 max-w-xs truncate">{p.name || "-"}</td>
                      <td className="py-2 px-2 text-gray-600">{p.brand || "-"}</td>
                      <td className="py-2 px-2">
                        {p.inventoryStatus?.toLowerCase() === "discontinued" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                            <AlertTriangle className="h-3 w-3" />
                            DC&apos;d
                          </span>
                        ) : p.inventoryStatus?.toLowerCase() === "sales inventory" ? (
                          <span className="inline-flex items-center text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
                            Active
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-gray-900">
                        {costEntry ? `$${costEntry.cost.toFixed(2)}` : "-"}
                      </td>
                      <td className="py-2 px-2 text-right font-mono text-gray-900">
                        {freight != null ? `$${freight.toFixed(2)}` : "-"}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-500 text-xs">
                        {costEntry ? costEntry.at.toLocaleDateString() : "-"}
                      </td>
                      <td className="py-2 px-2 text-right text-gray-600">
                        {p._count.costHistories + p._count.priceHistories + p._count.productPrices + p._count.shippingCostHistories}
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-gray-500">
                      {q
                        ? "No products match your search."
                        : unassignedOnly
                          ? "Every product is assigned to a customer."
                          : "No products yet. Import data to get started."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {totalCount > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex items-center gap-2">
            {page > 1 ? (
              <Link
                href={pageHref(page - 1)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-400 cursor-not-allowed">
                <ChevronLeft className="h-3.5 w-3.5" />
                Prev
              </span>
            )}
            {page < totalPages ? (
              <Link
                href={pageHref(page + 1)}
                className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-400 cursor-not-allowed">
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
