import { NextResponse } from "next/server";
import { withdrawExcused } from "@/lib/courses/excused/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * WITHDRAW A REQUEST TO BE EXCUSED, or one week of it, while it waits: the
 * person who asked, and nobody else. The body is `{ sessionKey? }`: one week,
 * or, with none, every week still waiting. Changes nothing on a register, and
 * emails nobody (`src/lib/courses/excused/decide.ts`).
 *
 * View-as is refused first, then the session. A request that is missing, or
 * not the caller's, is one 403 for everybody but an admin, who is told it is
 * missing or that only the person who asked withdraws it. Only then is the
 * body checked.
 */
export async function POST(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { requestId } = await ctx.params;
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // A body that is not JSON reads as none: the gate answers first, then an
  // empty body withdraws every week still waiting.
  const raw: unknown = await req.json().catch(() => null);
  const outcome = await withdrawExcused(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
