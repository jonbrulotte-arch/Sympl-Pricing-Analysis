import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { brandKey } from "@/lib/pricing/helpers";
import { canAccessCustomer } from "@/lib/permissions";
import { resolveChannelId, serializeRule } from "../shared";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string; ruleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, ruleId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.royaltyRule.findFirst({
    where: { id: ruleId, customerId },
  });
  if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  const body = await req.json();
  const update: Record<string, unknown> = {};

  if (body.value !== undefined) update.value = body.value;
  if (body.mode !== undefined) update.mode = body.mode;
  if (body.brandName !== undefined) {
    update.brandName = body.brandName;
    update.brandKey = brandKey(body.brandName) ?? null;
  }
  if (body.skus !== undefined) update.skus = body.skus;
  if (body.channelId !== undefined) {
    const channel = await resolveChannelId(customerId, body.channelId);
    if (channel === false) return NextResponse.json({ error: "Channel not found for this customer" }, { status: 400 });
    update.channelId = channel;
  }

  const rule = await prisma.royaltyRule.update({
    where: { id: ruleId },
    data: update,
    include: { channel: { select: { name: true } } },
  });

  return NextResponse.json(serializeRule(rule));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string; ruleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, ruleId } = await params;
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.royaltyRule.findFirst({
    where: { id: ruleId, customerId },
  });
  if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  await prisma.royaltyRule.delete({ where: { id: ruleId } });

  return NextResponse.json({ ok: true });
}
