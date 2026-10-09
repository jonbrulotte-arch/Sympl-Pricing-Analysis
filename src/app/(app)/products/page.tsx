import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { getPermissions, productVisibilityWhere } from "@/lib/permissions";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ProductsTable, type ProductTableRow } from "@/components/products/products-table";
import { Search, ChevronLeft, ChevronRight, Upload, FileSpreadsheet, RefreshCw, Package, DollarSign, AlertTriangle, Truck, X } from "lucide-react";
import { PageSizeSelect } from "@/components/products/page-size-select";
import { McfFreightImport } from "@/components/products/mcf-freight-import";

const PAGE_SIZES = [25, 50, 100];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; pageSize?: string; assigned?: string; missing?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { q, page: pageParam, pageSize: pageSizeParam, assigned, missing: missingParam } = await searchParams;
  const missing = missingParam === "cost" || missingParam === "freight" ? missingParam : null;

  const pageSize = PAGE_SIZES.includes(Number(pageSizeParam)) ? Number(pageSizeParam) : 25;
  const page = Math.max(1, Number(pageParam) || 1);

  const permissions = await getPermissions(session.user.role);
  const isAdmin = permissions.has("admin:settings");
  const unassignedOnly = isAdmin && assigned === "unassigned";

  const baseWhere = await productVisibilityWhere(userId, session.user.role);

  const where = {
    ...baseWhere,
    ...(unassignedOnly ? { customers: { none: {} } } : {}),
    ...(missing === "cost" ? { costHistories: { none: {} } } : {}),
    ...(missing === "freight" ? { shippingCostHistories: { none: { shippingType: "mcf_freight" } } } : {}),
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

  const rows: ProductTableRow[] = products.map((p) => {
    const costEntry = costMap.get(p.id);
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      brand: p.brand,
      inventoryStatus: p.inventoryStatus,
      cost: costEntry?.cost ?? null,
      costDate: costEntry ? costEntry.at.toLocaleDateString() : null,
      freight: freightMap.get(p.id) ?? null,
      records: p._count.costHistories + p._count.priceHistories + p._count.productPrices + p._count.shippingCostHistories,
      customerCount: p._count.customers,
    };
  });

  const assignCustomers = isAdmin && permissions.has("customers:edit")
    ? await prisma.customer.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } })
    : null;

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, totalCount);

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (unassignedOnly) params.set("assigned", "unassigned");
    if (missing) params.set("missing", missing);
    params.set("page", String(p));
    params.set("pageSize", String(pageSize));
    return `/products?${params.toString()}`;
  }

  function missingHref(kind: "cost" | "freight") {
    const params = new URLSearchParams();
    if (unassignedOnly) params.set("assigned", "unassigned");
    if (missing !== kind) params.set("missing", kind);
    params.set("pageSize", String(pageSize));
    return `/products?${params.toString()}`;
  }

  function filterHref(unassigned: boolean) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (unassigned) params.set("assigned", "unassigned");
    if (missing) params.set("missing", missing);
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
        <Link href={missingHref("cost")} className="block">
        <Card className={cn("h-full transition-colors hover:border-blue-300", missing === "cost" && "border-blue-500 ring-1 ring-blue-500")}>
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
        </Link>
        <Link href={missingHref("freight")} className="block">
        <Card className={cn("h-full transition-colors hover:border-blue-300", missing === "freight" && "border-blue-500 ring-1 ring-blue-500")}>
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
        </Link>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <form className="max-w-sm w-full">
            {unassignedOnly && <input type="hidden" name="assigned" value="unassigned" />}
            {missing && <input type="hidden" name="missing" value={missing} />}
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
          {missing && (
            <Link
              href={missingHref(missing)}
              className="inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 shrink-0"
              title="Clear filter"
            >
              {missing === "cost" ? "Missing cost" : "Missing MCF freight"}
              <X className="h-3 w-3" />
            </Link>
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

      <ProductsTable
        rows={rows}
        emptyMessage={
          q
            ? "No products match your search."
            : missing
              ? `Every product has ${missing === "cost" ? "cost data" : "MCF freight"}.`
              : unassignedOnly
              ? "Every product is assigned to a customer."
              : "No products yet. Import data to get started."
        }
        assign={assignCustomers ? { customers: assignCustomers, unassignedOnly, totalCount, q } : undefined}
      />

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
