import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const rows = await prisma.product.findMany({
    where: { customers: { some: { customerId } } },
    select: { brand: true },
    distinct: ["brand"],
  });

  const brands = rows
    .map((r) => r.brand?.trim())
    .filter((b): b is string => !!b)
    .sort((a, b) => a.localeCompare(b));

  return NextResponse.json(brands);
}
