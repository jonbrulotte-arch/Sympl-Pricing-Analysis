import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function verifyProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, customerId: true },
  });
  if (!project) return null;

  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId: project.customerId, userId } },
  });
  if (!link) return null;
  return project;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await verifyProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const skus: string[] = body.skus ?? [];
  const productIds: string[] = body.productIds ?? [];

  if (skus.length === 0 && productIds.length === 0) {
    return NextResponse.json({ error: "Provide skus or productIds" }, { status: 400 });
  }

  let resolvedIds = [...productIds];

  if (skus.length > 0) {
    const products = await prisma.product.findMany({
      where: {
        sku: { in: skus },
        customers: { some: { customerId: project.customerId } },
      },
      select: { id: true, sku: true },
    });
    resolvedIds.push(...products.map((p) => p.id));

    const foundSkus = new Set(products.map((p) => p.sku));
    const missing = skus.filter((s) => !foundSkus.has(s));
    if (missing.length > 0) {
      return NextResponse.json({
        error: `SKUs not found: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? ` (+${missing.length - 10} more)` : ""}`,
        missing,
      }, { status: 400 });
    }
  }

  const unique = [...new Set(resolvedIds)];

  let added = 0;
  for (const productId of unique) {
    try {
      await prisma.projectProduct.create({
        data: { projectId, productId },
      });
      added++;
    } catch {
      // already linked
    }
  }

  return NextResponse.json({ added, total: unique.length });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await verifyProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const productIds: string[] = body.productIds ?? [];

  if (productIds.length === 0) {
    return NextResponse.json({ error: "Provide productIds to remove" }, { status: 400 });
  }

  const result = await prisma.projectProduct.deleteMany({
    where: {
      projectId,
      productId: { in: productIds },
    },
  });

  return NextResponse.json({ removed: result.count });
}
