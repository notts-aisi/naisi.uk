import { NextResponse } from "next/server";
import { approveRequest } from "@/lib/courses/requests/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * APPROVE A REQUEST: an admin or somebody leading the programme, never the person who asked. Approving a register correction corrects the line in the same transaction as the decision, with the request's reason and its id; the request stays waiting when the line no longer says what the request says it did. Nobody is emailed.
 *
 * View-as is refused first, then the session. The request is read, and its
 * group's register gate decides who may act (`src/lib/courses/requests/decide.ts`):
 * a request that is missing, or about a group the caller has no part in,
 * is one 403 for everybody but an admin, who is told it is missing. It
 * takes no body.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await approveRequest(db, actor, requestId, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.detail }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
