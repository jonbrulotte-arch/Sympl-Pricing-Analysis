import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";
import { ProductEditor } from "@/components/products/product-editor";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { productId } = await params;

  const customerIds = (
    await prisma.customerUser.findMany({
      where: { userId },
      select: { customerId: true },
    })
  ).map((cu) => cu.customerId);

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      customers: { some: { customerId: { in: customerIds } } },
    },
  });
  if (!product) notFound();

  const latestCost = await prisma.costHistory.findFirst({
    where: { productId },
    orderBy: { recordedAt: "desc" },
  });

  const shippingTypes = ["std", "mcf_ship", "mcf_freight", "fba_fee"] as const;
  const latestShipping: Record<string, number> = {};
  for (const st of shippingTypes) {
    const latest = await prisma.shippingCostHistory.findFirst({
      where: { productId, shippingType: st },
      orderBy: { recordedAt: "desc" },
    });
    if (latest) latestShipping[st] = Number(latest.amount);
  }

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

  const shippingHistory = await prisma.shippingCostHistory.findMany({
    where: { productId },
    orderBy: { recordedAt: "desc" },
    take: 50,
  });

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{product.sku}</h1>
      <p className="text-sm text-gray-600 mb-6">{product.name || "Unnamed product"}</p>

      {/* Product info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-600">Brand</p>
            <p className="text-sm font-medium">{product.brand || "-"}</p>
          </CardContent>
        </Card>
        {product.asin && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-600">ASIN</p>
              <p className="text-sm font-mono">{product.asin}</p>
            </CardContent>
          </Card>
        )}
        {product.fbaClass && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-600">FBA Class</p>
              <p className="text-sm">{product.fbaClass}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Editable Cost & Shipping */}
      <ProductEditor
        productId={productId}
        currentCost={latestCost ? Number(latestCost.cost) : null}
        currentShipping={latestShipping}
      />

      {/* Cost History */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Cost History ({costHistory.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {costHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No cost records yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-600 font-medium">Date</th>
                  <th className="text-right py-2 text-gray-600 font-medium">Cost</th>
                  <th className="text-right py-2 text-gray-600 font-medium">Change</th>
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
                      <td className={`py-1.5 text-right ${change > 0 ? "text-red-600" : change < 0 ? "text-green-600" : "text-gray-500"}`}>
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
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Price History ({priceHistory.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {priceHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No price records yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-600 font-medium">Date</th>
                  <th className="text-left py-2 text-gray-600 font-medium">Channel</th>
                  <th className="text-right py-2 text-gray-600 font-medium">Price</th>
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

      {/* Shipping Cost History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping Cost History ({shippingHistory.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {shippingHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No shipping cost records yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 text-gray-600 font-medium">Date</th>
                  <th className="text-left py-2 text-gray-600 font-medium">Type</th>
                  <th className="text-right py-2 text-gray-600 font-medium">Amount</th>
                  <th className="text-right py-2 text-gray-600 font-medium">Change</th>
                </tr>
              </thead>
              <tbody>
                {shippingHistory.map((sh, i) => {
                  const sameType = shippingHistory.slice(i + 1).find((s) => s.shippingType === sh.shippingType);
                  const change = sameType ? Number(sh.amount) - Number(sameType.amount) : 0;
                  const hasComparison = !!sameType;
                  const typeLabels: Record<string, string> = {
                    std: "Standard",
                    mcf_ship: "MCF Ship",
                    mcf_freight: "MCF Freight",
                    fba_fee: "FBA Fee",
                  };
                  return (
                    <tr key={sh.id} className="border-b border-gray-50">
                      <td className="py-1.5 text-gray-700">{formatDateTime(sh.recordedAt)}</td>
                      <td className="py-1.5">
                        <Badge variant="secondary" className="text-xs">
                          {typeLabels[sh.shippingType] || sh.shippingType}
                        </Badge>
                      </td>
                      <td className="py-1.5 text-right font-mono">${Number(sh.amount).toFixed(2)}</td>
                      <td className={`py-1.5 text-right ${change > 0 ? "text-red-600" : change < 0 ? "text-green-600" : "text-gray-500"}`}>
                        {hasComparison
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
    </div>
  );
}
