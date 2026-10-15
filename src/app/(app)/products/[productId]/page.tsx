import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getPermissions, getAccessibleCustomerIds, productVisibilityWhere } from "@/lib/permissions";
import { ProductEditor } from "@/components/products/product-editor";
import { ProductDelete } from "@/components/products/product-delete";
import { CostHistoryChart, ShippingHistoryChart } from "@/components/products/cost-chart";
import { PriceHistorySection } from "@/components/products/price-history-section";
import { loadPriceHistory } from "@/lib/db/price-history";
import { loadCostAndShippingHistory, type CostRecordDetail } from "@/lib/db/cost-history";
import { ExpandableHistoryTable } from "@/components/products/expandable-history-table";
import { AlertTriangle, Calculator } from "lucide-react";
import { LocalDateTime } from "@/components/ui/local-date-time";
import { NavigatingButton } from "@/components/ui/navigating-link";
import { AddToProject, type ProjectOption } from "@/components/products/add-to-project";
import { getUpsWeightBreakpoint } from "@/lib/import/shipping-weight";
import { AsinLink } from "@/components/products/asin-link";

/** Change from the previous record; increases are red because these are costs. */
function ChangeAmount({ value, previous }: { value: number; previous: number | null }) {
  if (previous == null) return <span className="text-gray-500">-</span>;
  const change = value - previous;
  return (
    <span className={change > 0 ? "text-red-600" : change < 0 ? "text-green-600" : "text-gray-500"}>
      {change > 0 ? "+" : change < 0 ? "-" : ""}${Math.abs(change).toFixed(2)}
    </span>
  );
}

/** Detail panel items for a cost or shipping cost record. */
function historyDetails(label: string, value: number, d: CostRecordDetail) {
  const change = d.previous != null ? value - d.previous : null;
  const pct = change != null && d.previous! > 0 ? (change / d.previous!) * 100 : null;
  return [
    { label: `Previous ${label}`, value: d.previous != null ? <span className="font-mono">${d.previous.toFixed(2)}</span> : "None recorded" },
    {
      label: `New ${label}`,
      value: (
        <span className="font-mono">
          ${value.toFixed(2)}
          {change != null && Math.abs(change) >= 0.005 && (
            <span className={`ml-2 text-xs ${change > 0 ? "text-red-600" : "text-green-600"}`}>
              {change > 0 ? "+" : "-"}${Math.abs(change).toFixed(2)}
              {pct != null && ` (${change > 0 ? "+" : ""}${pct.toFixed(1)}%)`}
            </span>
          )}
        </span>
      ),
    },
    { label: "Customer", value: d.customer ?? "All customers" },
    { label: "Channel", value: d.channel ?? "All channels" },
    { label: "Changed By", value: d.changedBy ?? "Unknown" },
    { label: "Source", value: d.how },
  ];
}

function shippingTypesForMode(mode: string): string[] {
  switch (mode) {
    case "fba": return ["fba_fee"];
    case "mcf": return ["mcf_ship", "mcf_freight"];
    default:    return ["std"];
  }
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { productId } = await params;

  const permissions = await getPermissions(session.user.role);
  const canViewCost = permissions.has("data:viewCost");
  const canUpdate = permissions.has("products:update");
  const canDelete = permissions.has("products:delete");
  const canViewAllPriceHistory = permissions.has("data:viewAllPriceHistory");

  const customerIds = await getAccessibleCustomerIds(userId, session.user.role);

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      ...(await productVisibilityWhere(userId, session.user.role)),
    },
  });
  if (!product) notFound();

  const userChannels = await prisma.salesChannel.findMany({
    where: { customerId: { in: customerIds } },
    select: { id: true, name: true, shippingMode: true, freightMode: true, priceField: true },
  });

  const userChannelIds = new Set(userChannels.map((ch) => ch.id));
  const userPriceFields = new Set(userChannels.map((ch) => ch.priceField));
  const prepaidChannels = userChannels.filter((ch) => ch.freightMode === "prepaid");
  const relevantShippingTypes = new Set(
    prepaidChannels.flatMap((ch) => shippingTypesForMode(ch.shippingMode)),
  );
  const hasShippingChannels = relevantShippingTypes.size > 0;

  const latestCost = await prisma.costHistory.findFirst({
    where: { productId },
    orderBy: { recordedAt: "desc" },
  });

  const latestShipping: Record<string, number> = {};
  if (hasShippingChannels) {
    for (const st of relevantShippingTypes) {
      const latest = await prisma.shippingCostHistory.findFirst({
        where: { productId, shippingType: st },
        orderBy: { recordedAt: "desc" },
      });
      if (latest) latestShipping[st] = Number(latest.amount);
    }
  }

  const { cost: costHistory, shipping: shippingHistory } = await loadCostAndShippingHistory(product, {
    includeCost: canViewCost,
    shippingTypes: hasShippingChannels ? [...relevantShippingTypes] : [],
  });

  const allPriceRecords = await loadPriceHistory(product, {
    channelIds: canViewAllPriceHistory ? null : [...userChannelIds],
    priceFields: canViewAllPriceHistory ? null : [...userPriceFields],
  });

  const canSingleSku = permissions.has("module:singleSku");
  const canProjects = permissions.has("module:projects");
  const upsBreakpoint = product.shippingWeight != null ? await getUpsWeightBreakpoint() : null;
  const usesUps = upsBreakpoint != null && product.shippingWeight != null && product.shippingWeight >= upsBreakpoint;

  let projectOptions: ProjectOption[] = [];
  if (canProjects) {
    const [projects, onCustomers] = await Promise.all([
      prisma.project.findMany({
        where: { customerId: { in: customerIds }, status: "active" },
        select: {
          id: true,
          name: true,
          customerId: true,
          customer: { select: { name: true } },
          products: { where: { productId }, select: { productId: true } },
        },
        orderBy: [{ customer: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.customerProduct.findMany({
        where: { productId, customerId: { in: customerIds } },
        select: { customerId: true },
      }),
    ]);
    const carried = new Set(onCustomers.map((c) => c.customerId));
    projectOptions = projects.map((p) => ({
      id: p.id,
      name: p.name,
      customerId: p.customerId,
      customerName: p.customer.name,
      contains: p.products.length > 0,
      onCustomer: carried.has(p.customerId),
    }));
  }

  const shippingTypeLabels: Record<string, string> = {
    std: "Standard",
    mcf_ship: "MCF Ship",
    mcf_freight: "MCF Freight",
    fba_fee: "FBA Fee",
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{product.sku}</h1>
          {product.inventoryStatus && (
            <Badge
              variant={product.inventoryStatus.toLowerCase() === "discontinued" ? "destructive" : "default"}
              className={`text-xs ${
                product.inventoryStatus.toLowerCase() === "discontinued"
                  ? "bg-red-100 text-red-800 border-red-200"
                  : product.inventoryStatus.toLowerCase() === "sales inventory"
                    ? "bg-green-100 text-green-800 border-green-200"
                    : "bg-gray-100 text-gray-800 border-gray-200"
              }`}
            >
              {product.inventoryStatus}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {canSingleSku && (
            <NavigatingButton
              href={`/single-sku?productId=${productId}`}
              variant="outline"
              size="sm"
              loadingText="Opening..."
            >
              <Calculator className="h-3.5 w-3.5 mr-1.5" />
              Single SKU Analysis
            </NavigatingButton>
          )}
          {canProjects && <AddToProject productId={productId} sku={product.sku} projects={projectOptions} />}
          {canDelete && (
            <ProductDelete
              productId={productId}
              sku={product.sku}
              costRecords={costHistory.length}
              priceRecords={allPriceRecords.length}
              shippingRecords={shippingHistory.length}
            />
          )}
        </div>
      </div>
      <p className="text-sm text-gray-600 mb-6">{product.name || "Unnamed product"}</p>

      {product.inventoryStatus?.toLowerCase() === "discontinued" && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 mb-6">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
            <div className="text-sm text-red-800">
              <p className="font-medium">Discontinued SKU</p>
              <p className="mt-0.5 text-red-700">
                This product is being sold through remaining on-hand stock and will not be reordered.
                Consider pricing strategy carefully before increasing prices on sell-through/liquidation items.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Product info */}
      <div className="grid grid-cols-2 md:grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-4 mb-6">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-600">Brand</p>
            <p className="text-sm font-medium">{product.brand || "-"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-600">Inventory Status</p>
            <p className={`text-sm font-medium ${
              product.inventoryStatus?.toLowerCase() === "discontinued" ? "text-red-700" :
              product.inventoryStatus?.toLowerCase() === "sales inventory" ? "text-green-700" :
              "text-gray-900"
            }`}>
              {product.inventoryStatus || "-"}
            </p>
          </CardContent>
        </Card>
        {product.asin && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-600">ASIN</p>
              <AsinLink asin={product.asin} className="text-sm" />
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
        {product.shippingWeight != null && (
          <Card>
            <CardContent className="py-4">
              <p className="text-xs text-gray-600">Shipping Weight</p>
              <p className="text-sm">{product.shippingWeight.toLocaleString(undefined, { maximumFractionDigits: 2 })} lb</p>
              {usesUps && (
                <p className="text-[11px] text-gray-500 mt-0.5">At or over {upsBreakpoint} lb: UPS rate</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Editable Cost & Shipping */}
      {canUpdate && (
        <ProductEditor
          productId={productId}
          currentCost={canViewCost ? (latestCost ? Number(latestCost.cost) : null) : null}
          currentShipping={latestShipping}
          hideCost={!canViewCost}
          shippingTypes={hasShippingChannels ? [...relevantShippingTypes] : []}
        />
      )}

      {/* Cost History */}
      {canViewCost && (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Cost History ({costHistory.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {costHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No cost records yet.</p>
          ) : (
            <>
              <CostHistoryChart data={costHistory.map((ch) => ({
                id: ch.id,
                cost: ch.cost,
                recordedAt: ch.recordedAt.toISOString(),
              }))} />
              <ExpandableHistoryTable
                columns={[{ label: "Date" }, { label: "Cost", align: "right" }, { label: "Change", align: "right" }]}
                rows={costHistory.map((ch) => ({
                  id: ch.id,
                  cells: [
                    <span key="d" className="text-gray-700"><LocalDateTime value={ch.recordedAt} /></span>,
                    <span key="v" className="font-mono">${ch.cost.toFixed(2)}</span>,
                    <ChangeAmount key="c" value={ch.cost} previous={ch.detail.previous} />,
                  ],
                  details: historyDetails("Cost", ch.cost, ch.detail),
                }))}
              />
            </>
          )}
        </CardContent>
      </Card>
      )}

      {/* Price History */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Price History ({allPriceRecords.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {allPriceRecords.length === 0 ? (
            <p className="text-sm text-gray-500">No price records yet. Run a Salsify Sync to populate.</p>
          ) : (
            <PriceHistorySection
              data={allPriceRecords.map((pr) => ({
                id: pr.id,
                label: pr.label,
                price: pr.price,
                recordedAt: pr.recordedAt.toISOString(),
                source: pr.source,
                detail: pr.detail,
              }))}
              canDelete={permissions.has("admin:settings")}
              productId={productId}
            />
          )}
        </CardContent>
      </Card>

      {/* Shipping Cost History */}
      {hasShippingChannels && (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Shipping Cost History ({shippingHistory.length} records)</CardTitle>
        </CardHeader>
        <CardContent>
          {shippingHistory.length === 0 ? (
            <p className="text-sm text-gray-500">No shipping cost records yet.</p>
          ) : (
            <>
              <ShippingHistoryChart data={shippingHistory.map((sh) => ({
                id: sh.id,
                shippingType: sh.shippingType,
                amount: sh.amount,
                recordedAt: sh.recordedAt.toISOString(),
              }))} />
              <ExpandableHistoryTable
                columns={[{ label: "Date" }, { label: "Type" }, { label: "Amount", align: "right" }, { label: "Change", align: "right" }]}
                rows={shippingHistory.map((sh) => ({
                  id: sh.id,
                  cells: [
                    <span key="d" className="text-gray-700"><LocalDateTime value={sh.recordedAt} /></span>,
                    <Badge key="t" variant="secondary" className="text-xs">
                      {shippingTypeLabels[sh.shippingType] || sh.shippingType}
                    </Badge>,
                    <span key="v" className="font-mono">${sh.amount.toFixed(2)}</span>,
                    <ChangeAmount key="c" value={sh.amount} previous={sh.detail.previous} />,
                  ],
                  details: historyDetails("Amount", sh.amount, sh.detail),
                }))}
              />
            </>
          )}
        </CardContent>
      </Card>
      )}
    </div>
  );
}
