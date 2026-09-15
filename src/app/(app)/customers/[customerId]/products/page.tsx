import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function ProductsPage({ params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  const userId = session!.user!.id!;
  const { customerId } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, users: { some: { userId } } },
  });
  if (!customer) notFound();

  const products = await prisma.product.findMany({
    where: { customerId },
    orderBy: { sku: "asc" },
    include: {
      _count: { select: { costHistories: true, priceHistories: true } },
    },
  });

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{customer.name} — Products</h1>
      <p className="text-sm text-gray-500 mb-6">{products.length} products tracked</p>

      <Card>
        <CardContent className="py-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">SKU</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Name</th>
                  <th className="text-left py-3 px-2 text-gray-500 font-medium">Brand</th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">Cost Records</th>
                  <th className="text-right py-3 px-2 text-gray-500 font-medium">Price Records</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="py-2 px-2">
                      <Link
                        href={`/customers/${customerId}/products/${p.id}`}
                        className="font-mono text-xs text-blue-600 hover:underline"
                      >
                        {p.sku}
                      </Link>
                    </td>
                    <td className="py-2 px-2 text-gray-700 max-w-xs truncate">{p.name || "-"}</td>
                    <td className="py-2 px-2 text-gray-600">{p.brand || "-"}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{p._count.costHistories}</td>
                    <td className="py-2 px-2 text-right text-gray-600">{p._count.priceHistories}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
