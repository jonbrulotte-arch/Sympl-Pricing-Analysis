import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hash } from "bcryptjs";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { token, password } = body as { token?: string; password?: string };

  if (!token || !password) {
    return NextResponse.json({ error: "Token and password are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  const resetToken = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: { select: { id: true, name: true } } },
  });

  if (!resetToken) {
    return NextResponse.json({ error: "Invalid or expired reset link" }, { status: 400 });
  }

  if (resetToken.usedAt) {
    return NextResponse.json({ error: "This reset link has already been used" }, { status: 400 });
  }

  if (resetToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "This reset link has expired. Please request a new one." }, { status: 400 });
  }

  const passwordHash = await hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: new Date() },
    }),
  ]);

  logActivity({
    action: "auth.passwordReset",
    category: "admin",
    summary: `Password reset completed for "${resetToken.user.name}"`,
    detail: { userId: resetToken.userId },
    userId: resetToken.userId,
  });

  return NextResponse.json({ ok: true });
}
