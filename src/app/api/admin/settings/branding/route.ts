import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { getBranding, DEFAULT_PLATFORM_NAME, LOGO_MAX_BYTES, PLATFORM_NAME_MAX } from "@/lib/branding";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!(await getPermissions(session.user.role)).has("admin:settings"))
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { userId: session.user.id };
}

/** Detects the image type from its bytes rather than trusting the browser-supplied type. */
function sniffImage(buf: Buffer): string | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.length >= 6 && /^GIF8[79]a/.test(buf.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  const head = buf.subarray(0, 1024).toString("utf8").replace(/^﻿/, "").trimStart();
  if ((head.startsWith("<svg") || head.startsWith("<?xml")) && /<svg[\s>]/i.test(buf.toString("utf8"))) return "image/svg+xml";
  return null;
}

async function current() {
  const b = await getBranding();
  return { platformName: b.isCustom ? b.name : "", defaultName: DEFAULT_PLATFORM_NAME, logoUrl: b.logoUrl };
}

export async function GET() {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;
  return NextResponse.json(await current());
}

/** multipart/form-data: platformName (string, blank = default), logo (file, optional), removeLogo ("true"). */
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin();
  if ("error" in ctx) return ctx.error;

  const form = await req.formData();
  const data: { platformName?: string | null; logoData?: Uint8Array<ArrayBuffer> | null; logoMimeType?: string | null; logoUpdatedAt?: Date | null } = {};

  const name = form.get("platformName");
  if (typeof name === "string") {
    const trimmed = name.trim().replace(/\s+/g, " ");
    if (trimmed.length > PLATFORM_NAME_MAX)
      return NextResponse.json({ error: `Name must be ${PLATFORM_NAME_MAX} characters or fewer` }, { status: 400 });
    data.platformName = trimmed || null;
  }

  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > LOGO_MAX_BYTES)
      return NextResponse.json({ error: `Logo must be ${Math.round(LOGO_MAX_BYTES / 1024)} KB or smaller` }, { status: 400 });
    const buf = Buffer.from(await logo.arrayBuffer());
    const mime = sniffImage(buf);
    if (!mime) return NextResponse.json({ error: "Logo must be a PNG, JPEG, WebP, GIF or SVG image" }, { status: 400 });
    data.logoData = new Uint8Array(buf);
    data.logoMimeType = mime;
    data.logoUpdatedAt = new Date();
  } else if (form.get("removeLogo") === "true") {
    data.logoData = null;
    data.logoMimeType = null;
    data.logoUpdatedAt = null;
  }

  await prisma.appSettings.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  logActivity({
    action: "admin.branding",
    category: "admin",
    summary: `Updated platform branding${data.platformName !== undefined ? ` (name: ${data.platformName ?? "default"})` : ""}${
      data.logoMimeType ? ", logo uploaded" : data.logoMimeType === null ? ", logo removed" : ""
    }`,
    userId: ctx.userId,
  });

  return NextResponse.json(await current());
}
