import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function getLink(customerId: string, userId: string) {
  return prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  const link = await getLink(customerId, session.user.id);
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const members = await prisma.customerUser.findMany({
    where: { customerId },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { role: "asc" },
  });

  return NextResponse.json(members.map((m) => ({
    userId: m.userId,
    role: m.role,
    name: m.user.name,
    email: m.user.email,
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  const link = await getLink(customerId, session.user.id);
  if (!link) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (link.role !== "OWNER") return NextResponse.json({ error: "Only the customer owner can add collaborators" }, { status: 403 });

  const body = await req.json();
  const email = (body.email ?? "").trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return NextResponse.json({ error: "No user found with that email — an admin needs to create their account first" }, { status: 404 });
  }

  const member = await prisma.customerUser.upsert({
    where: { customerId_userId: { customerId, userId: user.id } },
    update: {},
    create: { customerId, userId: user.id, role: "COLLABORATOR" },
  });

  return NextResponse.json({ userId: member.userId, role: member.role, name: user.name, email: user.email }, { status: 201 });
}
