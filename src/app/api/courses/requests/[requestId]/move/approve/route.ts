import { NextResponse } from "next/server";
import { approveMoveRequest } from "@/lib/courses/moveRequest/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * APPROVE A REQUEST TO CHANGE GROUP FOR GOOD: admins only, never the person
 * who asked; a programme's lead sees nothing of these. The body is
 * `{ weekNumber, emailCount, reply? }`: the week and the count of emails the
 * page showed. Makes the move through the staff move's own writer, the
 * decision written in the same transaction; then emails the person (the
 * staff move's email, with the approved first sentence and the reply) and
 * both groups' facilitators (exactly what a staff move sends). Anybody but an
 * admin is one 403 before anything is read; an admin is told a missing
 * request is missing, before the body is read. Everything the staff move
 * refuses is refused in its own sentence with nothing written; a 409 from its
 * own check carries the week and the count as they now are.
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
  const outcome = await approveMoveRequest(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...(outcome.extra ?? {}) }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
