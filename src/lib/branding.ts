import { cache } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { DEFAULT_BRANDING, DEFAULT_LONG_NAME, DEFAULT_PLATFORM_NAME, type Branding } from "@/lib/branding-shared";

export * from "@/lib/branding-shared";

/** Per-request cached branding. Falls back to defaults if settings can't be read (e.g. before a schema push). */
export const getBranding = cache(async (): Promise<Branding> => {
  await connection(); // read at request time, never baked in at build
  try {
    const s = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { platformName: true, logoMimeType: true, logoUpdatedAt: true },
    });
    const custom = s?.platformName?.trim();
    return {
      name: custom || DEFAULT_PLATFORM_NAME,
      longName: custom || DEFAULT_LONG_NAME,
      isCustom: !!custom,
      logoUrl: s?.logoMimeType && s.logoUpdatedAt ? `/api/branding/logo?v=${s.logoUpdatedAt.getTime()}` : null,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
});
