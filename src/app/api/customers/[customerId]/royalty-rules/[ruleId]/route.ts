import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { brandKey } from "@/lib/pricing/helpers";

async function verifyAccess(customerId: string, userId: string) {
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return !!link;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string; ruleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, ruleId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
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

  const rule = await prisma.royaltyRule.update({
    where: { id: ruleId },
    data: update,
  });

  return NextResponse.json({
    id: rule.id,
    scope: rule.scope,
    brandKey: rule.brandKey,
    brandName: rule.brandName,
    skus: rule.skus,
    value: Number(rule.value),
    mode: rule.mode,
  });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ customerId: string; ruleId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId, ruleId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const existing = await prisma.royaltyRule.findFirst({
    where: { id: ruleId, customerId },
  });
  if (!existing) return NextResponse.json({ error: "Rule not found" }, { status: 404 });

  await prisma.royaltyRule.delete({ where: { id: ruleId } });

  return NextResponse.json({ ok: true });
}
