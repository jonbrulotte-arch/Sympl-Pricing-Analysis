import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canAccessCustomer, getPermissions, productVisibilityWhere } from "@/lib/permissions";

/** GET ?customerId=&q= — SKUs the user can see, matching q, with whether each belongs to the customer. */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("module:singleSku"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const customerId = req.nextUrl.searchParams.get("customerId") ?? "";
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (!(await canAccessCustomer(customerId, session.user.id, session.user.role)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (q.length < 2) return NextResponse.json({ products: [] });

  const products = await prisma.product.findMany({
    where: {
      ...(await productVisibilityWhere(session.user.id, session.user.role)),
      OR: [
        { sku: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    },
    select: { id: true, sku: true, name: true, brand: true, customers: { where: { customerId }, select: { customerId: true } } },
    orderBy: { sku: "asc" },
    take: 20,
  });

  return NextResponse.json({
    products: products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, brand: p.brand, onCustomer: p.customers.length > 0 })),
  });
}
