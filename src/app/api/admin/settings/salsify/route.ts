import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";
import { DEFAULT_UPS_WEIGHT_BREAKPOINT } from "@/lib/import/shipping-weight";

const SINGLETON_ID = "singleton";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const settings = await prisma.appSettings.findUnique({ where: { id: SINGLETON_ID } });

  return NextResponse.json({
    salsifyOrgId: settings?.salsifyOrgId ?? "",
    salsifyChannelId: settings?.salsifyChannelId ?? "",
    salsifySyncEnabled: settings?.salsifySyncEnabled ?? false,
    salsifyDebugEnabled: settings?.salsifyDebugEnabled ?? false,
    upsWeightBreakpoint: settings ? settings.upsWeightBreakpoint : DEFAULT_UPS_WEIGHT_BREAKPOINT,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();

  let breakpoint: number | null | undefined;
  if (body.upsWeightBreakpoint !== undefined) {
    if (body.upsWeightBreakpoint === null || body.upsWeightBreakpoint === "") {
      breakpoint = null;
    } else {
      const n = Number(body.upsWeightBreakpoint);
      if (!isFinite(n) || n <= 0)
        return NextResponse.json({ error: "The UPS weight break point must be a weight above 0 lb, or blank to turn it off" }, { status: 400 });
      breakpoint = n;
    }
  }

  const settings = await prisma.appSettings.upsert({
    where: { id: SINGLETON_ID },
    update: {
      ...(body.salsifyOrgId !== undefined && { salsifyOrgId: body.salsifyOrgId || null }),
      ...(body.salsifyChannelId !== undefined && { salsifyChannelId: body.salsifyChannelId || null }),
      ...(body.salsifySyncEnabled !== undefined && { salsifySyncEnabled: !!body.salsifySyncEnabled }),
      ...(body.salsifyDebugEnabled !== undefined && { salsifyDebugEnabled: !!body.salsifyDebugEnabled }),
      ...(breakpoint !== undefined && { upsWeightBreakpoint: breakpoint }),
    },
    create: {
      id: SINGLETON_ID,
      salsifyOrgId: body.salsifyOrgId || null,
      salsifyChannelId: body.salsifyChannelId || null,
      salsifySyncEnabled: !!body.salsifySyncEnabled,
      salsifyDebugEnabled: !!body.salsifyDebugEnabled,
      ...(breakpoint !== undefined && { upsWeightBreakpoint: breakpoint }),
    },
  });

  logActivity({
    action: "admin.settings.salsify",
    category: "admin",
    summary: `Updated Salsify settings`,
    detail: {
      salsifyOrgId: settings.salsifyOrgId ?? "",
      salsifyChannelId: settings.salsifyChannelId ?? "",
      salsifySyncEnabled: settings.salsifySyncEnabled,
      salsifyDebugEnabled: settings.salsifyDebugEnabled,
      upsWeightBreakpoint: settings.upsWeightBreakpoint,
    },
    userId: session.user.id,
  });

  return NextResponse.json({
    salsifyOrgId: settings.salsifyOrgId ?? "",
    salsifyChannelId: settings.salsifyChannelId ?? "",
    salsifySyncEnabled: settings.salsifySyncEnabled,
    salsifyDebugEnabled: settings.salsifyDebugEnabled,
    upsWeightBreakpoint: settings.upsWeightBreakpoint,
  });
}
