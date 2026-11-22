import { NextResponse } from "next/server";
import { dismissMoveRequest } from "@/lib/courses/moveRequest/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * DISMISS THE MESSAGE THAT A REQUEST TO CHANGE GROUP FOR GOOD WAS DECLINED:
 * the person who asked. Takes no body. Emails nobody. A missing request, or
 * somebody else's, is one 403 for everybody but an admin, who is told it is
 * missing or not theirs.
 *
 * View-as is refused first, then the session. The work is
 * `src/lib/courses/moveRequest/decide.ts`.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await dismissMoveRequest(db, actor, requestId, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...(outcome.extra ?? {}) }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
