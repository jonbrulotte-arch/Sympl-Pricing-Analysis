import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions, productVisibilityWhere } from "@/lib/permissions";
import { brandKey } from "@/lib/pricing/helpers";
import { loadAccessibleRules } from "@/lib/royalty/load";
import { matchRoyaltyRule } from "@/lib/royalty/rules";

/**
 * GET ?sku= — the royalty rules that pertain to a SKU: SKU rules that list it and brand rules for its brand, plus the
 * rule that applies on each channel of each customer that carries the SKU or has a matching override.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("module:royalties"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const query = (req.nextUrl.searchParams.get("sku") ?? "").trim();
  if (!query) return NextResponse.json({ error: "Enter a SKU" }, { status: 400 });

  const product = await prisma.product.findFirst({
    where: {
      sku: { equals: query, mode: "insensitive" },
      ...(await productVisibilityWhere(session.user.id, session.user.role)),
    },
    select: { id: true, sku: true, name: true, brand: true },
  });
  const sku = product?.sku ?? query;
  const bk = brandKey(product?.brand);
  const lower = sku.toLowerCase();

  const { customers, rules } = await loadAccessibleRules(session.user.id, session.user.role);

  const matching = rules
    .map((r) => {
      if (r.scope === "sku") {
        if (r.skus.includes(sku)) return { ...r, matchedBy: "sku" as const, listedAs: sku };
        // Listed with different letter case: the analysis compares SKUs exactly, so this rule won't apply.
        const variant = r.skus.find((s) => s.toLowerCase() === lower);
        if (variant) return { ...r, matchedBy: "sku" as const, listedAs: variant };
        return null;
      }
      if (bk && r.brandKey === bk) return { ...r, matchedBy: "brand" as const, listedAs: null };
      return null;
    })
    .filter((r): r is NonNullable<typeof r> => r != null);

  const carriers = product
    ? new Set(
        (
          await prisma.customerProduct.findMany({
            where: { productId: product.id, customerId: { in: customers.map((c) => c.id) } },
            select: { customerId: true },
          })
        ).map((c) => c.customerId),
      )
    : new Set<string>();
  const withOverride = new Set(matching.map((r) => r.customerId).filter((id): id is string => id != null));

  const globalRules = rules.filter((r) => r.customerId == null);
  const effective = customers
    .filter((c) => carriers.has(c.id) || withOverride.has(c.id))
    .flatMap((c) => {
      const pool = [...globalRules, ...rules.filter((r) => r.customerId === c.id)];
      return c.channels.map((ch) => {
        const m = matchRoyaltyRule(pool, sku, bk, ch.id);
        return {
          customerId: c.id,
          customerName: c.name,
          carriesSku: carriers.has(c.id),
          channelId: ch.id,
          channelName: ch.name,
          rule: m ? { id: m.rule.id, value: m.rule.value, mode: m.rule.mode } : null,
          level: m?.level ?? null,
          matchedBy: m?.matchedBy ?? null,
          tieCount: m?.ties.length ?? 0,
        };
      });
    });

  return NextResponse.json({
    query,
    product,
    sku,
    rules: matching,
    effective,
  });
}
