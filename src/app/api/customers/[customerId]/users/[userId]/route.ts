import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getLink(customerId: string, userId: string) {
  return prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string; userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, userId } = await params;
  const link = await getLink(customerId, session.user.id);
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (link.role !== "OWNER") return NextResponse.json({ error: "Only the customer owner can remove collaborators" }, { status: 403 });

  const target = await getLink(customerId, userId);
  if (!target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.role === "OWNER") return NextResponse.json({ error: "Cannot remove the customer owner" }, { status: 400 });

  await prisma.customerUser.delete({
    where: { customerId_userId: { customerId, userId } },
  });

  return NextResponse.json({ ok: true });
}
