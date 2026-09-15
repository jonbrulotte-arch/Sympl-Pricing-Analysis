import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { randomUUID } from "crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const customerIds = (
    await prisma.customerUser.findMany({
      where: { userId: session.user.id },
      select: { customerId: true },
    })
  ).map((cu) => cu.customerId);

  const projects = await prisma.project.findMany({
    where: { customerId: { in: customerIds } },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      _count: { select: { products: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const name = (body.name ?? "").trim();
  const customerId = body.customerId;
  const description = (body.description ?? "").trim() || null;

  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (!customerId) return NextResponse.json({ error: "Customer is required" }, { status: 400 });

  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId: session.user.id } },
  });
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const slug = slugify(name);
  const existing = await prisma.project.findUnique({
    where: { customerId_slug: { customerId, slug } },
  });
  if (existing) return NextResponse.json({ error: "A project with that name already exists for this customer" }, { status: 409 });

  const project = await prisma.project.create({
    data: {
      id: randomUUID(),
      name,
      slug,
      description,
      customerId,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
