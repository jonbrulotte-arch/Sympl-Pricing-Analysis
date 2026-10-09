import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = req.nextUrl;
  const category = url.searchParams.get("category") || undefined;
  const customerId = url.searchParams.get("customerId") || undefined;
  const search = url.searchParams.get("search") || undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));

  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (customerId) where.customerId = customerId;
  if (search) {
    where.OR = [
      { summary: { contains: search, mode: "insensitive" } },
      { action: { contains: search, mode: "insensitive" } },
    ];
  }

  const [logs, total] = await Promise.all([
    prisma.activityLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.activityLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
