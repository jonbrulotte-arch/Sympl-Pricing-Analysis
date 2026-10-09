import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer, getPermissions } from "@/lib/permissions";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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

  logActivity({
    action: "customer.update",
    category: "customer",
    summary: `Updated customer "${name}"`,
    detail: { customerId, customerName: name },
    customerId,
    userId: session.user.id,
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
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const perms = await getPermissions(session.user.role);
  if (!perms.has("admin:settings")) {
    const link = await prisma.customerUser.findUnique({
      where: { customerId_userId: { customerId, userId: session.user.id } },
    });
    if (!link || link.role !== "OWNER") return NextResponse.json({ error: "Only the customer owner can delete this customer" }, { status: 403 });
  }

  await prisma.customer.delete({ where: { id: customerId } });

  logActivity({
    action: "customer.delete",
    category: "customer",
    summary: `Deleted customer`,
    detail: { customerId },
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
