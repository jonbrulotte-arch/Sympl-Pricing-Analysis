import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer } from "@/lib/permissions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string; importId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, importId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const imp = await prisma.import.findUnique({
    where: { id: importId },
    select: { id: true, customerId: true, status: true, rowCount: true, errors: true },
  });

  if (!imp || imp.customerId !== customerId) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  return NextResponse.json({ status: imp.status, rowCount: imp.rowCount, errors: imp.errors });
}
