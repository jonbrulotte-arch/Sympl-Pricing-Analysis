import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type ActivityCategory =
  | "price"
  | "import"
  | "publish"
  | "project"
  | "channel"
  | "product"
  | "royalty"
  | "customer"
  | "admin";

interface LogInput {
  action: string;
  category: ActivityCategory;
  summary: string;
  detail?: Record<string, unknown>;
  customerId?: string | null;
  userId?: string | null;
}

export async function logActivity(input: LogInput): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action: input.action,
        category: input.category,
        summary: input.summary,
        detail: (input.detail as Prisma.InputJsonValue) ?? undefined,
        customerId: input.customerId ?? undefined,
        userId: input.userId ?? undefined,
      },
    });
  } catch {
    // never let logging failures break the main flow
  }
}
