import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ customerId: string; productId: string }>;
}) {
  const session = await auth();
  const userId = session!.user!.id!;
  const { customerId, productId } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, users: { some: { userId } } },
    include: { channels: { select: { id: true, name: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!customer) notFound();

  const product = await prisma.product.findFirst({
    where: { id: productId, customerId },
  });
  if (!product) notFound();

  const costHistory = await prisma.costHistory.findMany({
    where: { productId },
    orderBy: { recordedAt: "desc" },
    take: 50,
  });

  const priceHistory = await prisma.priceHistory.findMany({
    where: { productId },
    orderBy: { recordedAt: "desc" },
    take: 100,
    include: { channel: { select: { name: true } } },
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{product.sku}</h1>
      <p className="text-sm text-gray-500 mb-6">{product.name || "Unnamed product"}</p>

      {/* Product info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500">Brand</p>
            <p className="text-sm font-medium">{product.brand || "-"}</p>
          </CardContent>
        </Card>
        {product.asin && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500">ASIN</p>
              <p className="text-sm font-mono">{product.asin}</p>
            </CardContent>
          </Card>
        )}
        {product.fbaClass && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-500">FBA Class</p>
              <p className="text-sm">{product.fbaClass}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Cost History */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Cost History ({costHistory.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {costHistory.length === 0 ? (
            <p className="text-sm text-gray-400">No cost records yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Cost</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {costHistory.map((ch, i) => {
                  const prev = costHistory[i + 1];
                  const change = prev ? Number(ch.cost) - Number(prev.cost) : 0;
                  return (
                    <tr key={ch.id} className="border-b border-gray-50">
                      <td className="py-1.5 text-gray-700">{formatDateTime(ch.recordedAt)}</td>
                      <td className="py-1.5 text-right font-mono">${Number(ch.cost).toFixed(2)}</td>
                      <td className={`py-1.5 text-right ${change > 0 ? "text-red-600" : change < 0 ? "text-green-600" : "text-gray-400"}`}>
                        {i < costHistory.length - 1
                          ? `${change > 0 ? "+" : ""}$${change.toFixed(2)}`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Price History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Price History ({priceHistory.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {priceHistory.length === 0 ? (
            <p className="text-sm text-gray-400">No price records yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-500 font-medium">Date</th>
                  <th className="text-left py-2 text-gray-500 font-medium">Channel</th>
                  <th className="text-right py-2 text-gray-500 font-medium">Price</th>
                </tr>
              </thead>
              <tbody>
                {priceHistory.map((ph) => (
                  <tr key={ph.id} className="border-b border-gray-50">
                    <td className="py-1.5 text-gray-700">{formatDateTime(ph.recordedAt)}</td>
                    <td className="py-1.5">
                      <Badge variant="secondary" className="text-xs">{ph.channel.name}</Badge>
                    </td>
                    <td className="py-1.5 text-right font-mono">${Number(ph.price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
