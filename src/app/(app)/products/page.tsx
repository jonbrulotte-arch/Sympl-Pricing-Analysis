import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { q } = await searchParams;

  const customerIds = (
    await prisma.customerUser.findMany({
      where: { userId },
      select: { customerId: true },
    })
  ).map((cu) => cu.customerId);

  const products = await prisma.product.findMany({
    where: {
      customers: { some: { customerId: { in: customerIds } } },
      ...(q
        ? {
            OR: [
              { sku: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { brand: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { sku: "asc" },
    include: {
      _count: {
        select: { costHistories: true, priceHistories: true, shippingCostHistories: true },
      },
    },
  });

  const latestCosts = await prisma.costHistory.findMany({
    where: { productId: { in: products.map((p) => p.id) } },
    orderBy: { recordedAt: "desc" },
    distinct: ["productId"],
    select: { productId: true, cost: true },
  });
  const costMap = new Map(latestCosts.map((c) => [c.productId, Number(c.cost)]));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <p className="text-sm text-gray-600 mt-1">{products.length} products tracked</p>
        </div>
      </div>

      <form className="mb-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search SKU, name, or brand..."
            className="pl-9"
          />
        </div>
      </form>

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
                  <th className="text-right py-3 px-2 text-gray-600 font-medium">Records</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
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
                      {costMap.has(p.id) ? `$${costMap.get(p.id)!.toFixed(2)}` : "-"}
                    </td>
                    <td className="py-2 px-2 text-right text-gray-600">
                      {p._count.costHistories + p._count.priceHistories + p._count.shippingCostHistories}
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      {q ? "No products match your search." : "No products yet. Import data to get started."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
