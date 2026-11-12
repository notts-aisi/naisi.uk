import { NextResponse } from "next/server";
import { declineRequest } from "@/lib/courses/requests/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * DECLINE A REQUEST, with a reply to the person who asked: an admin or
 * somebody leading the programme, never the person who asked. The reply is
 * shown to the asker beside the line on the register. Nobody is emailed.
 *
 * View-as is refused first, then the session. The request is read, and its
 * group's register gate decides who may decide it
 * (`src/lib/courses/requests/decide.ts`): a request that is missing, or
 * about a group the caller has no part in, is one 403 for everybody but an
 * admin, who is told it is missing. Only then is the reply checked (needed,
 * one line, no link).
 */
export async function POST(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // A body that is not JSON reads as no reply: the gate answers first.
  const raw: unknown = await req.json().catch(() => null);
  const outcome = await declineRequest(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error, ...outcome.detail }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
