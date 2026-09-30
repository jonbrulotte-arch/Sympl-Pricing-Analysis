import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { compare, hash } from "bcryptjs";
import { logActivity } from "@/lib/activity-log";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, email, currentPassword, newPassword } = body as {
    name?: string;
    email?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const data: Record<string, string> = {};

  if (name !== undefined) {
    const trimmed = name.trim();
    if (!trimmed) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    data.name = trimmed;
  }

  if (email !== undefined) {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return NextResponse.json({ error: "Email is required" }, { status: 400 });
    if (trimmed !== user.email) {
      const existing = await prisma.user.findUnique({ where: { email: trimmed } });
      if (existing) return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });
      data.email = trimmed;
    }
  }

  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Current password is required to change password" }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    }
    const valid = await compare(currentPassword, user.passwordHash);
    if (!valid) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 403 });
    }
    data.passwordHash = await hash(newPassword, 12);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No changes provided" }, { status: 400 });
  }

  const updated = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { id: true, name: true, email: true, role: true },
  });

  const changes = Object.keys(data).filter((k) => k !== "passwordHash");
  if (data.passwordHash) changes.push("password");
  logActivity({
    action: "profile.update",
    category: "admin",
    summary: `Updated profile: ${changes.join(", ")}`,
    detail: { changes },
    userId: session.user.id,
  });

  return NextResponse.json(updated);
}
