import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/permissions";
import { hash } from "bcryptjs";
import { randomUUID } from "crypto";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:users"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : "ANALYST";
  const validRole = await prisma.appRole.findUnique({ where: { name: role } });
  if (!validRole) return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });

  if (!name || !email) return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });

  const passwordHash = await hash(password, 12);

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name,
      email,
      passwordHash,
      role,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  logActivity({
    action: "admin.createUser",
    category: "admin",
    summary: `Created user "${name}" (${email}) with role ${role}`,
    detail: { createdUserId: user.id, name, email, role },
    userId: session.user.id,
  });

  return NextResponse.json(user, { status: 201 });
}
