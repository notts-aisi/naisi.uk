import { NextResponse } from "next/server";
import { declineMoveRequest } from "@/lib/courses/moveRequest/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * DECLINE A REQUEST TO CHANGE GROUP FOR GOOD: admins only, never the person
 * who asked. The body is `{ reply }`, needed. Writes the decision, moves
 * nobody, and emails the person the reply. Anybody but an admin is one 403
 * before anything is read; an admin is told a missing request is missing.
 *
 * View-as is refused first, then the session. The work is
 * `src/lib/courses/moveRequest/decide.ts`.
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
  const outcome = await declineMoveRequest(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...(outcome.extra ?? {}) }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
