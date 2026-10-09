import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer } from "@/lib/permissions";
import { normalizeListId } from "@/lib/salsify/client";

type Params = { params: Promise<{ customerId: string; channelId: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, channelId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channel = await prisma.salesChannel.findFirst({
    where: { id: channelId, customerId },
    include: { _count: { select: { channelProducts: true } } },
  });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { _count, ...rest } = channel;
  return NextResponse.json({ ...rest, channelProductCount: _count.channelProducts });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, channelId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const owned = await prisma.salesChannel.findFirst({ where: { id: channelId, customerId }, select: { id: true } });
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  let salsifyListId: string | null | undefined;
  if (body.salsifyListId !== undefined) {
    const raw = typeof body.salsifyListId === "string" ? body.salsifyListId.trim() : "";
    if (raw === "") {
      salsifyListId = null;
    } else {
      salsifyListId = normalizeListId(raw);
      if (!salsifyListId)
        return NextResponse.json({ error: "Invalid Salsify list ID. Paste the s-… ID or the list's URL." }, { status: 400 });
    }
  }
  const salsifyPriceProperty =
    body.salsifyPriceProperty === undefined
      ? undefined
      : typeof body.salsifyPriceProperty === "string" && body.salsifyPriceProperty.trim() !== ""
        ? body.salsifyPriceProperty.trim()
        : null;

  if (salsifyListId === null) {
    await prisma.channelProduct.deleteMany({ where: { channelId } });
  }

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
      ...(body.priceRecordTiming !== undefined && { priceRecordTiming: body.priceRecordTiming }),
      ...(body.defaults !== undefined && { defaults: body.defaults }),
      ...(body.blockedBrands !== undefined && { blockedBrands: body.blockedBrands }),
      ...(body.isDefault !== undefined && { isDefault: !!body.isDefault }),
      ...(salsifyListId !== undefined && { salsifyListId, ...(salsifyListId === null && { salsifyListSyncedAt: null }) }),
      ...(salsifyPriceProperty !== undefined && { salsifyPriceProperty }),
    },
  });

  logActivity({
    action: "channel.update",
    category: "channel",
    summary: `Updated channel "${channel.name}"`,
    detail: { channelId, channelName: channel.name },
    customerId,
    userId: session.user.id,
  });

  return NextResponse.json(channel);
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, channelId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channel = await prisma.salesChannel.findFirst({
    where: { id: channelId, customerId },
  });
  if (!channel) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (channel.isDefault) return NextResponse.json({ error: "Cannot delete default channels" }, { status: 400 });

  await prisma.salesChannel.delete({ where: { id: channelId } });

  logActivity({
    action: "channel.delete",
    category: "channel",
    summary: `Deleted channel "${channel.name}"`,
    detail: { channelId, channelName: channel.name },
    customerId,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
