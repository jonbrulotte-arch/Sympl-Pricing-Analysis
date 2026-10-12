import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public: the logo appears on the login page. URLs carry ?v=<updatedAt>, so responses are immutable.
export async function GET() {
  const s = await prisma.appSettings.findUnique({
    where: { id: "singleton" },
    select: { logoData: true, logoMimeType: true },
  });
  if (!s?.logoData || !s.logoMimeType) return new NextResponse(null, { status: 404 });

  return new NextResponse(new Uint8Array(s.logoData), {
    headers: {
      "Content-Type": s.logoMimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // Uploaded SVGs must never run script if opened directly.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    },
  });
}
