import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

  const mappings = await prisma.salsifyFieldMapping.findMany({ where: { customerId } });

  return NextResponse.json(mappings.map((m) => ({
    importFieldKey: m.importFieldKey,
    salsifyPropertyId: m.salsifyPropertyId,
  })));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { customerId } = await params;
  if (!(await verifyAccess(customerId, session.user.id)))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const mappings = body.mappings as { importFieldKey: string; salsifyPropertyId: string }[];
  if (!Array.isArray(mappings)) return NextResponse.json({ error: "mappings array is required" }, { status: 400 });

  for (const m of mappings) {
    const propertyId = (m.salsifyPropertyId ?? "").trim();
    if (!propertyId) {
      await prisma.salsifyFieldMapping.deleteMany({
        where: { customerId, importFieldKey: m.importFieldKey },
      });
      continue;
    }
    await prisma.salsifyFieldMapping.upsert({
      where: { customerId_importFieldKey: { customerId, importFieldKey: m.importFieldKey } },
      update: { salsifyPropertyId: propertyId },
      create: { customerId, importFieldKey: m.importFieldKey, salsifyPropertyId: propertyId },
    });
  }

  const updated = await prisma.salsifyFieldMapping.findMany({ where: { customerId } });
  return NextResponse.json(updated.map((m) => ({
    importFieldKey: m.importFieldKey,
    salsifyPropertyId: m.salsifyPropertyId,
  })));
}
