import { cache } from "react";
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ANONYMOUS_BRANDING, DEFAULT_BRANDING, DEFAULT_LONG_NAME, DEFAULT_PLATFORM_NAME, type Branding } from "@/lib/branding-shared";

export * from "@/lib/branding-shared";

/** Per-request cached branding. Falls back to defaults if settings can't be read (e.g. before a schema push). */
export const getBranding = cache(async (): Promise<Branding> => {
  await connection(); // read at request time, never baked in at build
  try {
    const s = await prisma.appSettings.findUnique({
      where: { id: "singleton" },
      select: { platformName: true, logoMimeType: true, logoUpdatedAt: true, hideLoginBranding: true },
    });
    const custom = s?.platformName?.trim();
    return {
      name: custom || DEFAULT_PLATFORM_NAME,
      longName: custom || DEFAULT_LONG_NAME,
      isCustom: !!custom,
      logoUrl: s?.logoMimeType && s.logoUpdatedAt ? `/api/branding/logo?v=${s.logoUpdatedAt.getTime()}` : null,
      hideLoginBranding: s?.hideLoginBranding ?? false,
      tagline: DEFAULT_BRANDING.tagline,
    };
  } catch {
    return DEFAULT_BRANDING;
  }
});

/**
 * Branding for pages: the real branding for signed-in users, and no identity at all for signed-out visitors
 * when "Hide logo and name on the sign-in pages" is on. Emails use getBranding() and are unaffected.
 */
export const getPageBranding = cache(async (): Promise<{ branding: Branding; anonymous: boolean }> => {
  const branding = await getBranding();
  if (!branding.hideLoginBranding) return { branding, anonymous: false };
  const session = await auth();
  return session?.user?.id ? { branding, anonymous: false } : { branding: ANONYMOUS_BRANDING, anonymous: true };
});
