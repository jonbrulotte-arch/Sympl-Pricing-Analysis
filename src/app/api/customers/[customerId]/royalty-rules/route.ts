import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { randomUUID } from "crypto";
import { brandKey } from "@/lib/pricing/helpers";

async function verifyAccess(customerId: string, userId: string) {
  const link = await prisma.customerUser.findUnique({
    where: { customerId_userId: { customerId, userId } },
  });
  return !!link;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const rules = await prisma.royaltyRule.findMany({
    where: { customerId },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(rules.map((r) => ({
    id: r.id,
    scope: r.scope,
    brandKey: r.brandKey,
    brandName: r.brandName,
    skus: r.skus,
    value: Number(r.value),
    mode: r.mode,
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { scope, brandName, skus, value, mode } = body;

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
    },
  });

  return NextResponse.json({
    id: rule.id,
    scope: rule.scope,
    brandKey: rule.brandKey,
    brandName: rule.brandName,
    skus: rule.skus,
    value: Number(rule.value),
    mode: rule.mode,
  }, { status: 201 });
}
