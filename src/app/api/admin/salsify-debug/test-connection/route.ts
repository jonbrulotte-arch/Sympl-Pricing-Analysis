import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPermissions } from "@/types";
import { resolveSalsifyCredentials } from "@/lib/salsify-auth";
import { fetchProductsPage } from "@/lib/salsify/client";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const permissions = getPermissions(session.user.role);
  if (!permissions.has("admin:settings")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const credentials = await resolveSalsifyCredentials(session.user.id);
  if (!credentials.ok) {
    return NextResponse.json({ ok: false, error: credentials.error });
  }

  const { apiKey, organizationId } = credentials.credentials;
  const startedAt = Date.now();

  try {
    const { batch, status } = await fetchProductsPage(organizationId, apiKey, 1, 1);
    const durationMs = Date.now() - startedAt;
    return NextResponse.json({
      ok: true,
      status,
      durationMs,
      organizationId,
      productCount: batch.length,
      sample: batch[0] ?? null,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message, durationMs, organizationId });
  }
}
