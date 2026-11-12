import { NextResponse } from "next/server";
import { takeRequest } from "@/lib/courses/requests/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * TAKE A REQUEST: an admin or somebody leading the programme says they are dealing with it. Nobody is emailed.
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

  const outcome = await takeRequest(db, actor, requestId, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.detail }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
