import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getPermissions(session.user.role);
  if (!permissions.has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const productCount = await prisma.product.count();
  if (productCount === 0)
    return NextResponse.json({ error: "No products to purge" }, { status: 400 });

  const [costCount, priceHistoryCount, productPriceCount, shippingCount, customerProductCount, analysisResultCount, projectProductCount, salsifyStagedCount] = await Promise.all([
    prisma.costHistory.count(),
    prisma.priceHistory.count(),
    prisma.productPrice.count(),
    prisma.shippingCostHistory.count(),
    prisma.customerProduct.count(),
    prisma.analysisResult.count(),
    prisma.projectProduct.count(),
    prisma.salsifyStaged.count(),
  ]);

  await prisma.$transaction([
    prisma.salsifyStaged.deleteMany(),
    prisma.analysisResult.deleteMany(),
    prisma.projectProduct.deleteMany(),
    prisma.customerProduct.deleteMany(),
    prisma.costHistory.deleteMany(),
    prisma.priceHistory.deleteMany(),
    prisma.productPrice.deleteMany(),
    prisma.shippingCostHistory.deleteMany(),
    prisma.product.deleteMany(),
  ]);

  const summary = `Purged products database: ${productCount} products, ${costCount} cost records, ${priceHistoryCount + productPriceCount} price records, ${shippingCount} shipping records`;

  logActivity({
    action: "admin.purgeProducts",
    category: "admin",
    summary,
    detail: {
      products: productCount,
      costHistory: costCount,
      priceHistory: priceHistoryCount,
      productPrice: productPriceCount,
      shippingCostHistory: shippingCount,
      customerProducts: customerProductCount,
      analysisResults: analysisResultCount,
      projectProducts: projectProductCount,
      salsifyStaged: salsifyStagedCount,
    },
    userId: session.user.id,
  });

  return NextResponse.json({
    ok: true,
    purged: {
      products: productCount,
      costHistory: costCount,
      priceHistory: priceHistoryCount + productPriceCount,
      shippingCostHistory: shippingCount,
      customerProducts: customerProductCount,
      analysisResults: analysisResultCount,
      salsifyStaged: salsifyStagedCount,
    },
  });
}
