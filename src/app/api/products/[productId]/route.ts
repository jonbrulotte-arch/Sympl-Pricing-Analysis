import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-log";
import { getPermissions, getAccessibleCustomerIds } from "@/lib/permissions";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getPermissions(session.user.role);
  if (!permissions.has("products:delete"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { productId } = await params;

  const customerIds = await getAccessibleCustomerIds(session.user.id, session.user.role);

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      customers: { some: { customerId: { in: customerIds } } },
    },
  });

  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.product.delete({ where: { id: productId } });

  logActivity({
    action: "product.delete",
    category: "product",
    summary: `Deleted product "${product.sku}"`,
    detail: { productId, sku: product.sku },
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getPermissions(session.user.role);
  if (!permissions.has("products:update"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { productId } = await params;

  const customerIds = await getAccessibleCustomerIds(session.user.id, session.user.role);

  const product = await prisma.product.findFirst({
    where: {
      id: productId,
      customers: { some: { customerId: { in: customerIds } } },
    },
  });

  if (!product) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const { cost, shipping, mcfShip, mcfFreight, fbaFee } = body as {
    cost?: number;
    shipping?: number;
    mcfShip?: number;
    mcfFreight?: number;
    fbaFee?: number;
  };

  if (cost != null && isFinite(cost) && cost >= 0) {
    await prisma.costHistory.create({
      data: { id: randomUUID(), productId, cost },
    });
  }

  const shippingUpdates: [string, number | undefined][] = [
    ["std", shipping],
    ["mcf_ship", mcfShip],
    ["mcf_freight", mcfFreight],
    ["fba_fee", fbaFee],
  ];

  for (const [shippingType, amount] of shippingUpdates) {
    if (amount != null && isFinite(amount) && amount >= 0) {
      await prisma.shippingCostHistory.create({
        data: { id: randomUUID(), productId, shippingType, amount },
      });
    }
  }

  logActivity({
    action: "product.update",
    category: "product",
    summary: `Updated product "${product.sku}" costs`,
    detail: { productId, sku: product.sku, cost, shipping, mcfShip, mcfFreight, fbaFee },
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
