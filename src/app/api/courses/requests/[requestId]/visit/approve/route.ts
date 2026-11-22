import { NextResponse } from "next/server";
import { approveVisitRequest } from "@/lib/courses/visitRequest/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * APPROVE A REQUEST TO GO TO ANOTHER SESSION: admins only, never the person
 * who asked. The body is `{ emailCount, overLimit?, reply? }`: the count of
 * emails the button showed, and whether the page showed the session full.
 * Arranges the visit through the staff visit's own writer, the decision
 * written in the same transaction; then emails the person (the approved
 * words, with the reply) and both groups' facilitators. Anybody but an admin
 * is one 403 before anything is read; an admin is told a missing request is
 * missing, before the body is read. A 409 from the visit's own check carries
 * the count and the full flag as they now are.
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
  const outcome = await approveVisitRequest(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...(outcome.extra ?? {}) }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
