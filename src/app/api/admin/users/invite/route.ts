import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/permissions";
import { hash } from "bcryptjs";
import { randomUUID, randomBytes } from "crypto";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:users"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const email = (body.email ?? "").trim().toLowerCase();
  const role = typeof body.role === "string" && body.role.trim() ? body.role.trim() : "ANALYST";

  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const validRole = await prisma.appRole.findUnique({ where: { name: role } });
  if (!validRole) return NextResponse.json({ error: `Invalid role: ${role}` }, { status: 400 });

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return NextResponse.json({ error: "A user with that email already exists" }, { status: 409 });

  const tempPassword = randomBytes(12).toString("base64url");
  const passwordHash = await hash(tempPassword, 12);

  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      name: email.split("@")[0],
      email,
      passwordHash,
      role,
    },
    select: { id: true, email: true, role: true },
  });

  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      id: randomUUID(),
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const baseUrl = process.env.NEXTAUTH_URL || process.env.APP_URL || "http://localhost:3000";
  const resetLink = `${baseUrl}/reset-password?token=${token}`;

  try {
    await sendEmail({
      to: email,
      subject: "You've been invited to Sympl Pricing Analysis",
      html: `
        <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #111827; margin-bottom: 16px;">Welcome to Sympl Pricing Analysis</h2>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            ${session.user.name} has invited you to join the Sympl Pricing Analysis platform.
          </p>
          <p style="color: #374151; font-size: 14px; line-height: 1.6;">
            Click the button below to set your password and get started:
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetLink}"
               style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; border-radius: 6px; font-size: 14px; font-weight: 600;">
              Set Your Password
            </a>
          </div>
          <p style="color: #6b7280; font-size: 12px; line-height: 1.5;">
            This link expires in 7 days. If the button doesn't work, copy and paste this URL into your browser:
          </p>
          <p style="color: #6b7280; font-size: 12px; word-break: break-all;">
            ${resetLink}
          </p>
        </div>
      `,
    });
  } catch (err) {
    await prisma.passwordResetToken.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to send invitation email: ${message}` }, { status: 500 });
  }

  logActivity({
    action: "admin.inviteUser",
    category: "admin",
    summary: `Invited ${email} with role ${role}`,
    detail: { invitedUserId: user.id, email, role },
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true, email, role }, { status: 201 });
}
