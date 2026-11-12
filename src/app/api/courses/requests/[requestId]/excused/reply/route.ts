import { NextResponse } from "next/server";
import { replyToExcused } from "@/lib/courses/excused/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * REPLY TO A REQUEST TO BE EXCUSED WITHOUT DECIDING IT: admins only, never
 * the person who asked. The body is `{ reply }`. The reply is kept on the
 * request and emailed to the person (`src/lib/courses/excused/decide.ts`).
 *
 * View-as is refused first, then the session. Anybody but an admin is one
 * 403 before anything is read; an admin is told a missing request is
 * missing. Only then is the body checked.
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
  const outcome = await replyToExcused(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
