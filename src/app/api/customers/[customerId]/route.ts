import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

async function verifyAccess(customerId: string, userId: string) {
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return link;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  const link = await verifyAccess(customerId, session.user.id);
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const slug = slugify(name);
  const existing = await prisma.customer.findFirst({
    where: { slug, id: { not: customerId } },
  });
  if (existing) return NextResponse.json({ error: "A customer with that name already exists" }, { status: 409 });

  const customer = await prisma.customer.update({
    where: { id: customerId },
    data: { name, slug },
  });

  return NextResponse.json(customer);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  const link = await verifyAccess(customerId, session.user.id);
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await prisma.customer.delete({ where: { id: customerId } });

  return NextResponse.json({ ok: true });
}
