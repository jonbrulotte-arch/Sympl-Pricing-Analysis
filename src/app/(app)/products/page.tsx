import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, ChevronLeft, ChevronRight, Upload, FileSpreadsheet, RefreshCw, Package, DollarSign, AlertTriangle, Truck } from "lucide-react";
import { PageSizeSelect } from "@/components/products/page-size-select";

const PAGE_SIZES = [25, 50, 100];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { q, page: pageParam, pageSize: pageSizeParam } = await searchParams;

  const pageSize = PAGE_SIZES.includes(Number(pageSizeParam)) ? Number(pageSizeParam) : 25;
  const page = Math.max(1, Number(pageParam) || 1);

  const customerIds = (
    await prisma.customerUser.findMany({
      where: { userId },
      select: { customerId: true },
    })
  ).map((cu) => cu.customerId);

  const where = {
    customers: { some: { customerId: { in: customerIds } } },
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

  const baseWhere = { customers: { some: { customerId: { in: customerIds } } } };

  const [products, totalCount, totalProducts, withCost, withMcfFreight] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { sku: "asc" },
      include: {
        _count: {
          select: { costHistories: true, priceHistories: true, shippingCostHistories: true },
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
    params.set("page", String(p));
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
        <form className="max-w-sm w-full">
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
                        <Link
                          href={`/products/${p.id}`}
                          className="font-mono text-xs text-blue-600 hover:underline"
                        >
                          {p.sku}
                        </Link>
                      </td>
                      <td className="py-2 px-2 text-gray-700 max-w-xs truncate">{p.name || "-"}</td>
                      <td className="py-2 px-2 text-gray-600">{p.brand || "-"}</td>
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
                        {p._count.costHistories + p._count.priceHistories + p._count.shippingCostHistories}
                      </td>
                    </tr>
                  );
                })}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-gray-500">
                      {q ? "No products match your search." : "No products yet. Import data to get started."}
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
