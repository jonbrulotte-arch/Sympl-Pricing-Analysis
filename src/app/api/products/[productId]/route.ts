import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { productId } = await params;

  const customerIds = (
    await prisma.customerUser.findMany({
      where: { userId: session.user.id },
      select: { customerId: true },
    })
  ).map((cu) => cu.customerId);

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

  return NextResponse.json({ ok: true });
}
