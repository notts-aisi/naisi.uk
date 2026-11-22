import { NextResponse } from "next/server";
import { declineVisitRequest } from "@/lib/courses/visitRequest/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * DECLINE A REQUEST TO GO TO ANOTHER SESSION: admins only, never the person
 * who asked. The body is `{ reply }`, needed. Writes the decision and no
 * visit, then emails the person with the reply. Anybody but an admin is one
 * 403 before anything is read; an admin is told a missing request is
 * missing, before the reply is checked.
 *
 * View-as is refused first, then the session. The work is
 * `src/lib/courses/visitRequest/decide.ts`.
 */
export async function POST(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // A body that is not JSON reads as an empty one: the gate answers first.
  const raw: unknown = await req.json().catch(() => null);
  const outcome = await declineVisitRequest(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...(outcome.extra ?? {}) }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
