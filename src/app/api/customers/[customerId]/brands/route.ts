import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
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
