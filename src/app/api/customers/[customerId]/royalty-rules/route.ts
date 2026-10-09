import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { brandKey } from "@/lib/pricing/helpers";
import { logActivity } from "@/lib/activity-log";
import { canAccessCustomer } from "@/lib/permissions";
import { resolveChannelId, serializeRule } from "./shared";

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rules = await prisma.royaltyRule.findMany({
    where: { customerId },
    include: { channel: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rules.map(serializeRule));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { scope, brandName, skus, value, mode } = body;
  const channel = await resolveChannelId(customerId, body.channelId);
  if (channel === false) return NextResponse.json({ error: "Channel not found for this customer" }, { status: 400 });

  if (!scope || !["brand", "sku"].includes(scope))
    return NextResponse.json({ error: "scope must be 'brand' or 'sku'" }, { status: 400 });
  if (typeof value !== "number" || value < 0)
    return NextResponse.json({ error: "value must be a non-negative number" }, { status: 400 });
  if (!mode || !["pct", "usd"].includes(mode))
    return NextResponse.json({ error: "mode must be 'pct' or 'usd'" }, { status: 400 });

  const bk = scope === "brand" && brandName ? brandKey(brandName) : undefined;
  const skuList = scope === "sku" && Array.isArray(skus) ? skus.filter((s: string) => s.trim()) : [];

  if (scope === "brand" && !bk)
    return NextResponse.json({ error: "brandName required for brand-scope rules" }, { status: 400 });
  if (scope === "sku" && skuList.length === 0)
    return NextResponse.json({ error: "At least one SKU required for sku-scope rules" }, { status: 400 });

  const rule = await prisma.royaltyRule.create({
    data: {
      id: randomUUID(),
      customerId,
      scope,
      brandKey: bk ?? null,
      brandName: scope === "brand" ? brandName : null,
      skus: scope === "sku" ? skuList : [],
      value,
      mode,
      channelId: channel,
    },
    include: { channel: { select: { name: true } } },
  });

  logActivity({
    action: "royaltyRule.create",
    category: "royalty",
    summary: `Created ${scope}-scope royalty rule (${mode} ${value})${scope === "brand" ? ` for "${brandName}"` : ` for ${skuList.length} SKU(s)`}`,
    detail: { customerId, ruleId: rule.id, scope, brandName, skuCount: skuList.length, value, mode, channelId: channel },
    customerId,
    userId: session.user.id,
  });

  return NextResponse.json(serializeRule(rule), { status: 201 });
}
