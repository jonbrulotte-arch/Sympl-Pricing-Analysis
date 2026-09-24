import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { salsifyApiKeyEncrypted: true },
  });

  if (!user?.salsifyApiKeyEncrypted) return NextResponse.json({ hasKey: false, last4: null });

  let last4: string | null = null;
  try {
    const raw = decrypt(user.salsifyApiKeyEncrypted);
    last4 = raw.slice(-4);
  } catch {
    last4 = null;
  }

  return NextResponse.json({ hasKey: true, last4 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const apiKey = (body.apiKey ?? "").trim();
  if (!apiKey) return NextResponse.json({ error: "API key is required" }, { status: 400 });

  let encrypted: string;
  try {
    encrypted = encrypt(apiKey);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Encryption failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { salsifyApiKeyEncrypted: encrypted },
  });

  return NextResponse.json({ hasKey: true, last4: apiKey.slice(-4) });
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await prisma.user.update({
    where: { id: session.user.id },
    data: { salsifyApiKeyEncrypted: null },
  });

  return NextResponse.json({ ok: true });
}
