import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";

// Public while the logo shows on the sign-in pages; signed-in only when sign-in branding is hidden.
// URLs carry ?v=<updatedAt>, so responses are immutable.
export async function GET() {
  const s = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
    select: { logoData: true, logoMimeType: true, hideLoginBranding: true },
  });
  if (!s?.logoData || !s.logoMimeType) return new NextResponse(null, { status: 404 });
  if (s.hideLoginBranding && !(await auth())?.user?.id) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(s.logoData), {
    headers: {
      "Content-Type": s.logoMimeType,
      // Private when hidden, so shared caches never hand it to signed-out visitors.
      "Cache-Control": `${s.hideLoginBranding ? "private" : "public"}, max-age=31536000, immutable`,
      "X-Content-Type-Options": "nosniff",
      // Uploaded SVGs must never run script if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    },
  });
}
