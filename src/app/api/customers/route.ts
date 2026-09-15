import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customers = await prisma.customer.findMany({
    where: { users: { some: { userId: session.user.id } } },
    include: {
      channels: { select: { id: true, name: true, tabLabel: true, sortOrder: true }, orderBy: { sortOrder: "asc" } },
      _count: { select: { customerProducts: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(customers);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const slug = slugify(name);
  const existing = await prisma.customer.findUnique({ where: { slug } });
  if (existing) return NextResponse.json({ error: "A customer with that name already exists" }, { status: 409 });

  const customer = await prisma.customer.create({
    data: {
      id: randomUUID(),
      name,
      slug,
      users: { create: { userId: session.user.id, role: "OWNER" } },
    },
  });

  return NextResponse.json(customer, { status: 201 });
}
