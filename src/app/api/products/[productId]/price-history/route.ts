import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPermissions } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = await getPermissions(session.user.role);
  if (!permissions.has("admin:settings"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { productId } = await params;
  const { id, source } = await req.json();

  if (!id || !source) return NextResponse.json({ error: "id and source required" }, { status: 400 });

  if (source === "channel") {
    const record = await prisma.priceHistory.findFirst({
      where: { id, productId },
      include: { channel: { select: { name: true } } },
    });
    if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    await prisma.priceHistory.delete({ where: { id } });

    logActivity({
      action: "priceHistory.delete",
      category: "admin",
      summary: `Deleted price history record: $${Number(record.price).toFixed(2)} on ${record.channel.name}`,
      detail: { productId, recordId: id, source, channel: record.channel.name, price: Number(record.price) },
      userId: session.user.id,
    });
  } else if (source === "product") {
    const record = await prisma.productPrice.findFirst({
      where: { id, productId },
    });
    if (!record) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    await prisma.productPrice.delete({ where: { id } });

    logActivity({
      action: "priceHistory.delete",
      category: "admin",
      summary: `Deleted product price record: $${Number(record.price).toFixed(2)} (${record.priceField})`,
      detail: { productId, recordId: id, source, priceField: record.priceField, price: Number(record.price) },
      userId: session.user.id,
    });
  } else {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
