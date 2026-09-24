import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { brandKey } from "@/lib/pricing/helpers";

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

  const royalties = await prisma.brandRoyalty.findMany({
    where: { customerId },
    orderBy: { brandName: "asc" },
  });

  return NextResponse.json(royalties.map((r) => ({
    id: r.id,
    brandKey: r.brandKey,
    brandName: r.brandName,
    value: Number(r.value),
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const entries = body.entries as { brandName: string; value: number }[];

  if (!entries?.length) return NextResponse.json({ error: "No entries" }, { status: 400 });

  for (const entry of entries) {
    const bk = brandKey(entry.brandName);
    if (!bk) continue;

    await prisma.brandRoyalty.upsert({
      where: { customerId_brandKey: { customerId, brandKey: bk } },
      update: { brandName: entry.brandName, value: entry.value },
      create: {
        id: randomUUID(),
        customerId,
        brandKey: bk,
        brandName: entry.brandName,
        value: entry.value,
      },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { brandKey: bk } = body;

  if (!bk) return NextResponse.json({ error: "brandKey required" }, { status: 400 });

  await prisma.brandRoyalty.deleteMany({
    where: { customerId, brandKey: bk },
  });

  return NextResponse.json({ ok: true });
}
