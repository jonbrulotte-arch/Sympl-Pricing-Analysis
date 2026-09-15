import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";
import { ProjectActions } from "@/components/projects/project-actions";
import { loadProductRows } from "@/lib/db/load-product-rows";
import type { BrandRoyaltyTable, RoyaltyRuleEntry } from "@/lib/pricing/types";

export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;
  const { projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      customer: {
        include: {
          channels: { orderBy: { sortOrder: "asc" } },
          brandRoyalties: true,
          royaltyRules: true,
        },
      },
      createdBy: { select: { name: true } },
      products: {
        include: {
          product: { select: { id: true, sku: true, name: true, brand: true } },
        },
      },
    },
  });

  if (!project) notFound();

  const hasAccess = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId: project.customerId, userId } },
  });
  if (!hasAccess) notFound();

  const customer = project.customer;
  const productIds = project.products.map((pp) => pp.productId);

  const products = await loadProductRows(productIds, customer.channels);

  const brandRoyalties: BrandRoyaltyTable = {};
  for (const br of customer.brandRoyalties) {
    brandRoyalties[br.brandKey] = Number(br.value);
  }

  const royaltyRules: RoyaltyRuleEntry[] = (customer.royaltyRules ?? []).map((r) => ({
    id: r.id,
    scope: r.scope as "brand" | "sku",
    brandKey: r.brandKey ?? undefined,
    brandName: r.brandName ?? undefined,
    skus: r.skus,
    value: Number(r.value),
    mode: r.mode as "pct" | "usd",
  }));

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

  const projectProducts = project.products.map((pp) => ({
    productId: pp.productId,
    product: {
      id: pp.product.id,
      sku: pp.product.sku,
      name: pp.product.name,
      brand: pp.product.brand,
    },
  }));

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.description && <p className="text-sm text-gray-600 mt-1">{project.description}</p>}
        </div>
        <ProjectActions
          projectId={projectId}
          projectName={project.name}
          customerId={project.customerId}
          status={project.status}
          products={projectProducts}
        />
      </div>
      <p className="text-xs text-gray-500 mb-4">
        <Link href={`/customers/${project.customerId}`} className="hover:text-blue-600 transition-colors">
          {customer.name}
        </Link>
        {" · "}
        {products.length} products
        {" · "}
        {customer.channels.length} channels
        {" · "}
        <Badge variant={project.status === "active" ? "default" : "secondary"} className="text-xs">
          {project.status}
        </Badge>
      </p>

      {customer.channels.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No sales channels configured for {customer.name}.</p>
          <p className="text-xs mt-1">
            <Link href={`/customers/${project.customerId}/channels/new`} className="text-blue-600 hover:underline">
              Add a channel
            </Link>{" "}
            to start analyzing.
          </p>
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No products in this project yet.</p>
          <p className="text-xs mt-1">Add products above to begin analysis.</p>
        </div>
      ) : (
        <AnalysisWorkspace
          channels={channelsData}
          products={products}
          brandRoyalties={brandRoyalties}
          customerId={project.customerId}
          royaltyRules={royaltyRules}
        />
      )}
    </div>
  );
}
