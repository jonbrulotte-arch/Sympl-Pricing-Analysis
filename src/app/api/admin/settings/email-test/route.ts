import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPermissions } from "@/types";
import { sendEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getPermissions(session.user.role).has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const to = ((body.to as string) ?? "").trim().toLowerCase();
  if (!to) return NextResponse.json({ error: "Recipient email is required" }, { status: 400 });

  const configured = !!(
    process.env.MS_GRAPH_TENANT_ID &&
    process.env.MS_GRAPH_CLIENT_ID &&
    process.env.MS_GRAPH_CLIENT_SECRET &&
    process.env.MS_GRAPH_SENDER_EMAIL
  );

  if (!configured) {
    return NextResponse.json({
      error: "MS Graph email credentials are not configured. Set MS_GRAPH_TENANT_ID, MS_GRAPH_CLIENT_ID, MS_GRAPH_CLIENT_SECRET, and MS_GRAPH_SENDER_EMAIL in .env",
    }, { status: 400 });
  }

  try {
    await sendEmail({
      to,
      subject: "Sympl PA — Test Email",
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
          <h2 style="color: #111827; margin-bottom: 16px;">Email Configuration Test</h2>
          <p style="color: #374151; line-height: 1.6;">
            This is a test email from the Sympl Pricing Analysis Platform.
          </p>
          <p style="color: #374151; line-height: 1.6;">
            If you're reading this, your MS Graph email configuration is working correctly.
          </p>
          <div style="margin-top: 24px; padding: 16px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
            <p style="color: #166534; margin: 0; font-size: 14px; font-weight: 600;">
              &#10003; Email delivery successful
            </p>
          </div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
          <p style="color: #9ca3af; font-size: 12px;">
            Sent from: ${process.env.MS_GRAPH_SENDER_EMAIL}<br/>
            Sympl Pricing Analysis Platform
          </p>
        </div>
      `,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  logActivity({
    action: "admin.email.test",
    category: "admin",
    summary: `Sent test email to ${to}`,
    detail: { to },
    userId: session.user.id,
  });

  return NextResponse.json({ ok: true });
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getPermissions(session.user.role).has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const configured = !!(
    process.env.MS_GRAPH_TENANT_ID &&
    process.env.MS_GRAPH_CLIENT_ID &&
    process.env.MS_GRAPH_CLIENT_SECRET &&
    process.env.MS_GRAPH_SENDER_EMAIL
  );

  return NextResponse.json({
    configured,
    senderEmail: configured ? process.env.MS_GRAPH_SENDER_EMAIL : null,
  });
}
