import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";

async function verifyAccess(customerId: string, userId: string) {
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return !!link;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const channels = await prisma.salesChannel.findMany({
    where: { customerId },
    orderBy: { sortOrder: "asc" },
  });

  return NextResponse.json(channels);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");

  const existing = await prisma.salesChannel.findUnique({
    where: { customerId_slug: { customerId, slug } },
  });
  if (existing) return NextResponse.json({ error: "A channel with that name already exists" }, { status: 409 });

  const count = await prisma.salesChannel.count({ where: { customerId } });

  const channel = await prisma.salesChannel.create({
    data: {
      id: randomUUID(),
      customerId,
      name,
      slug,
      tabLabel: body.tabLabel || name,
      sortOrder: count,
      shippingMode: body.shippingMode || "std",
      priceField: body.priceField || "priceJSP",
      fallbackPriceField: body.fallbackPriceField || null,
      hasCoupon: body.flags?.coupon ?? false,
      hasTax: body.flags?.tax ?? false,
      hasCommission: body.flags?.comm ?? false,
      hasTopSellerDisc: body.flags?.tsd ?? false,
      hasPromotedListing: body.flags?.promo ?? false,
      hasFvfFixed: body.flags?.fvf ?? false,
      hasCardProcessing: body.flags?.cc ?? false,
      hasPpc: body.flags?.ppc ?? false,
      hasAdvertising: body.flags?.ad ?? false,
      hasPerSkuCommission: body.flags?.commSku ?? false,
      hasFallback: body.flags?.fb ?? false,
      hasAsin: body.flags?.asin ?? false,
      defaults: body.defaults ?? {},
      blockedBrands: body.blockedBrands ?? [],
    },
  });

  return NextResponse.json(channel, { status: 201 });
}
