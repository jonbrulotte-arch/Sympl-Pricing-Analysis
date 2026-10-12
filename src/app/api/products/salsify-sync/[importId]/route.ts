import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ importId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { importId } = await params;

  const imp = await prisma.import.findUnique({ where: { id: importId } });
  if (!imp) {
    return NextResponse.json({ error: "Import not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: imp.status,
    rowCount: imp.rowCount,
    errors: imp.errors,
  });
}
