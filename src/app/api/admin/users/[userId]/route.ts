import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/types";
import { Prisma } from "@prisma/client";
import { hash } from "bcryptjs";
import { logActivity } from "@/lib/activity-log";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getPermissions(session.user.role).has("admin:users"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const body = await req.json();
  const data: Record<string, string> = {};

  if (body.name !== undefined) {
    const trimmed = (body.name as string).trim();
    if (!trimmed) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    data.name = trimmed;
  }

  if (body.email !== undefined) {
    const trimmed = (body.email as string).trim().toLowerCase();
    if (!trimmed) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (trimmed !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: trimmed } });
      if (existing) return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
      data.email = trimmed;
    }
  }

  if (body.role !== undefined) {
    const role = body.role === "ADMIN" ? "ADMIN" : "ANALYST";
    data.role = role;
  }

  if (body.newPassword) {
    if ((body.newPassword as string).length < 8) {
      return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
    }
    data.passwordHash = await hash(body.newPassword as string, 12);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, name: true, email: true, role: true },
  });

  const changes = Object.keys(data).filter((k) => k !== "passwordHash");
  if (data.passwordHash) changes.push("password");
  logActivity({
    action: "admin.updateUser",
    category: "admin",
    summary: `Admin updated user "${updated.name}": ${changes.join(", ")}`,
    detail: { targetUserId: userId, changes },
    userId: session.user.id,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getPermissions(session.user.role).has("admin:users"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;
  if (userId === session.user.id)
    return NextResponse.json({ error: "You cannot remove your own account" }, { status: 400 });

  try {
    await prisma.user.delete({ where: { id: userId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json({
        error: "This user has created analyses, imports, or projects and can't be removed until those are reassigned or deleted",
      }, { status: 400 });
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    throw err;
  }

  return NextResponse.json({ ok: true });
}
