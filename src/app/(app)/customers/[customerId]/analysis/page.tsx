import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { loadProductRows } from "@/lib/db/load-product-rows";
import type { BrandRoyaltyTable } from "@/lib/pricing/types";

export default async function AnalysisPage({ params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { customerId } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id: customerId, users: { some: { userId } } },
    include: {
      channels: { orderBy: { sortOrder: "asc" } },
      brandRoyalties: true,
    },
  });

  if (!customer) notFound();

  const dbProducts = await prisma.product.findMany({
    where: { customers: { some: { customerId } } },
    orderBy: { sku: "asc" },
    select: { id: true },
  });

  const products = await loadProductRows(
    dbProducts.map((p) => p.id),
    customer.channels,
  );

  const brandRoyalties: BrandRoyaltyTable = {};
  for (const br of customer.brandRoyalties) {
    brandRoyalties[br.brandKey] = Number(br.value);
  }

  const channelsData = customer.channels.map((ch) => ({
    id: ch.id,
    name: ch.name,
    tabLabel: ch.tabLabel,
    shippingMode: ch.shippingMode,
    priceField: ch.priceField,
    fallbackPriceField: ch.fallbackPriceField,
    hasCoupon: ch.hasCoupon,
    hasTax: ch.hasTax,
    hasCommission: ch.hasCommission,
    hasTopSellerDisc: ch.hasTopSellerDisc,
    hasPromotedListing: ch.hasPromotedListing,
    hasFvfFixed: ch.hasFvfFixed,
    hasCardProcessing: ch.hasCardProcessing,
    hasPpc: ch.hasPpc,
    hasAdvertising: ch.hasAdvertising,
    hasPerSkuCommission: ch.hasPerSkuCommission,
    hasFallback: ch.hasFallback,
    hasAsin: ch.hasAsin,
    defaults: ch.defaults as Record<string, unknown>,
    blockedBrands: (ch.blockedBrands ?? []) as string[],
  }));

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">{customer.name} — Analysis</h1>
        <p className="text-sm text-gray-500">
          {products.length} products across {customer.channels.length} channels
        </p>
      </div>

      <AnalysisWorkspace
        channels={channelsData}
        products={products}
        brandRoyalties={brandRoyalties}
        customerId={customerId}
      />
    </div>
  );
}
