import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer, getPermissions } from "@/lib/permissions";

async function verifyProjectAccess(projectId: string, userId: string, role: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, customerId: true, settings: true },
  });
  if (!project) return null;
  if (!(await canAccessCustomer(project.customerId, userId, role))) return null;
  return project;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const project = await verifyProjectAccess(projectId, session.user.id, session.user.role);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const canViewCost = (await getPermissions(session.user.role)).has("data:viewCost");
  const full = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      customer: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
      products: {
        include: {
          product: {
            include: {
              ...(canViewCost ? { costHistories: { orderBy: { recordedAt: "desc" as const }, take: 1 } } : {}),
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
  const project = await verifyProjectAccess(projectId, session.user.id, session.user.role);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) data.name = body.name.trim();
  if (body.description !== undefined) data.description = body.description?.trim() || null;
  if (body.status !== undefined) data.status = body.status;

  // channelIds: the customer's channels this project analyzes; null for all of them (including future ones).
  let channelNames: string[] | null = null;
  if (body.channelIds !== undefined) {
    const settings =
      project.settings && typeof project.settings === "object" && !Array.isArray(project.settings)
        ? { ...(project.settings as Record<string, unknown>) }
        : {};
    if (body.channelIds === null) {
      delete settings.channelIds;
    } else {
      if (!Array.isArray(body.channelIds) || body.channelIds.some((id: unknown) => typeof id !== "string"))
        return NextResponse.json({ error: "channelIds must be a list of channel ids" }, { status: 400 });
      const channels = await prisma.salesChannel.findMany({
        where: { customerId: project.customerId, id: { in: body.channelIds } },
        select: { id: true, name: true },
        orderBy: { sortOrder: "asc" },
      });
      if (channels.length !== new Set(body.channelIds).size)
        return NextResponse.json({ error: "Every channel must belong to the project's customer" }, { status: 400 });
      if (channels.length === 0) return NextResponse.json({ error: "Choose at least one channel" }, { status: 400 });
      settings.channelIds = channels.map((c) => c.id);
      channelNames = channels.map((c) => c.name);
    }
    data.settings = settings;
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data,
  });

  const action = body.status === "archived" ? "project.archive" : body.status === "active" ? "project.restore" : "project.update";
  const channelNote =
    body.channelIds === undefined ? "" : channelNames ? `: channels set to ${channelNames.join(", ")}` : ": now uses all channels";
  logActivity({
    action,
    category: "project",
    summary: `${action === "project.archive" ? "Archived" : action === "project.restore" ? "Restored" : "Updated"} project "${updated.name}"${channelNote}`,
    detail: { projectId, changes: data },
    customerId: project.customerId,
    userId: session.user.id,
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
  const project = await verifyProjectAccess(projectId, session.user.id, session.user.role);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.project.delete({ where: { id: projectId } });

  logActivity({
    action: "project.delete",
    category: "project",
    summary: `Deleted project`,
    detail: { projectId },
    customerId: project.customerId,
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}
