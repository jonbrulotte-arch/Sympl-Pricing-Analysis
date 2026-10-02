import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer, getPermissions } from "@/lib/permissions";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string; userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, userId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const perms = await getPermissions(session.user.role);
  if (!perms.has("admin:settings")) {
    const link = await prisma.customerUser.findUnique({
      where: { customerId_userId: { customerId, userId: session.user.id } },
    });
    if (!link || link.role !== "OWNER") return NextResponse.json({ error: "Only the customer owner can remove collaborators" }, { status: 403 });
  }

  const target = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "OWNER") return NextResponse.json({ error: "Cannot remove the customer owner" }, { status: 400 });

  await prisma.customerUser.delete({
    where: { customerId_userId: { customerId, userId } },
  });

  return NextResponse.json({ ok: true });
}
