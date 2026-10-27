import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPermissions } from "@/lib/permissions";
import { loadAccessibleRules } from "@/lib/royalty/load";

/** GET — every royalty rule the user can see (global plus their customers' overrides), for export and the duplicate check. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await getPermissions(session.user.role)).has("module:royalties"))
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(await loadAccessibleRules(session.user.id, session.user.role));
}
