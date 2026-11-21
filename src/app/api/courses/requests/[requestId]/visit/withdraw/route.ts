import { NextResponse } from "next/server";
import { withdrawVisitRequest } from "@/lib/courses/visitRequest/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * WITHDRAW A REQUEST TO GO TO ANOTHER SESSION: only the person who asked,
 * while it waits. Takes no body. Emails nobody. Anybody else is one 403,
 * an admin told it is not theirs; a missing request is one 403 for
 * everybody but an admin, who is told it is missing.
 *
 * View-as is refused first, then the session. The work is
 * `src/lib/courses/visitRequest/decide.ts`.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await withdrawVisitRequest(db, actor, requestId, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...(outcome.extra ?? {}) }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
