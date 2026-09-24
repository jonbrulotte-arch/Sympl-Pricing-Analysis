import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/types";

const SINGLETON_ID = "singleton";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getPermissions(session.user.role).has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await prisma.appSettings.findUnique({ where: { id: SINGLETON_ID } });

  return NextResponse.json({
    salsifyOrgId: settings?.salsifyOrgId ?? "",
    salsifyChannelId: settings?.salsifyChannelId ?? "",
    salsifySyncEnabled: settings?.salsifySyncEnabled ?? false,
    salsifyDebugEnabled: settings?.salsifyDebugEnabled ?? false,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getPermissions(session.user.role).has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  const settings = await prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {
      ...(body.salsifyOrgId !== undefined && { salsifyOrgId: body.salsifyOrgId || null }),
      ...(body.salsifyChannelId !== undefined && { salsifyChannelId: body.salsifyChannelId || null }),
      ...(body.salsifySyncEnabled !== undefined && { salsifySyncEnabled: !!body.salsifySyncEnabled }),
      ...(body.salsifyDebugEnabled !== undefined && { salsifyDebugEnabled: !!body.salsifyDebugEnabled }),
    },
    create: {
      id: SINGLETON_ID,
      salsifyOrgId: body.salsifyOrgId || null,
      salsifyChannelId: body.salsifyChannelId || null,
      salsifySyncEnabled: !!body.salsifySyncEnabled,
      salsifyDebugEnabled: !!body.salsifyDebugEnabled,
    },
  });

  return NextResponse.json({
    salsifyOrgId: settings.salsifyOrgId ?? "",
    salsifyChannelId: settings.salsifyChannelId ?? "",
    salsifySyncEnabled: settings.salsifySyncEnabled,
    salsifyDebugEnabled: settings.salsifyDebugEnabled,
  });
}
