import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ customerId: string; channelId: string }> };

async function verifyAccess(customerId: string, userId: string) {
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return !!link;
}

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, channelId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channel = await prisma.salesChannel.findFirst({
    where: { id: channelId, customerId },
  });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(channel);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, channelId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  const channel = await prisma.salesChannel.update({
    where: { id: channelId },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.tabLabel !== undefined && { tabLabel: body.tabLabel }),
      ...(body.shippingMode !== undefined && { shippingMode: body.shippingMode }),
      ...(body.priceField !== undefined && { priceField: body.priceField }),
      ...(body.fallbackPriceField !== undefined && { fallbackPriceField: body.fallbackPriceField }),
      ...(body.flags !== undefined && {
        hasCoupon: body.flags.coupon,
        hasTax: body.flags.tax,
        hasCommission: body.flags.comm,
        hasTopSellerDisc: body.flags.tsd,
        hasPromotedListing: body.flags.promo,
        hasFvfFixed: body.flags.fvf,
        hasCardProcessing: body.flags.cc,
        hasPpc: body.flags.ppc,
        hasAdvertising: body.flags.ad,
        hasPerSkuCommission: body.flags.commSku,
        hasFallback: body.flags.fb,
        hasAsin: body.flags.asin,
      }),
      ...(body.defaults !== undefined && { defaults: body.defaults }),
      ...(body.blockedBrands !== undefined && { blockedBrands: body.blockedBrands }),
    },
  });

  return NextResponse.json(channel);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, channelId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channel = await prisma.salesChannel.findFirst({
    where: { id: channelId, customerId },
  });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (channel.isDefault) return NextResponse.json({ error: "Cannot delete default channels" }, { status: 400 });

  await prisma.salesChannel.delete({ where: { id: channelId } });
  return NextResponse.json({ ok: true });
}
