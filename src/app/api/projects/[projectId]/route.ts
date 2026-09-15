import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function verifyProjectAccess(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, customerId: true },
  });
  if (!project) return null;

  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId: project.customerId, userId } },
  });
  if (!link) return null;
  return project;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await verifyProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const full = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      products: {
        include: {
          product: {
            include: {
              costHistories: { orderBy: { recordedAt: "desc" }, take: 1 },
              shippingCostHistories: { orderBy: { recordedAt: "desc" }, take: 4 },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(full);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await verifyProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.status !== undefined) data.status = body.status;

  const updated = await prisma.project.update({
    where: { id: projectId },
    data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await verifyProjectAccess(projectId, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.project.delete({ where: { id: projectId } });

  return NextResponse.json({ ok: true });
}
