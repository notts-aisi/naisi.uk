import { NextResponse } from "next/server";
import { approveExcusedWeek } from "@/lib/courses/excused/decide";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * APPROVE ONE WEEK OF A REQUEST TO BE EXCUSED: admins only, never the person
 * who asked. The body is `{ sessionKey, reply? }`. In the same transaction as
 * the decision the register follows: before the session the line says
 * excused exactly as "Can't make it" writes it, set by the approval; on a
 * register still being taken an empty or Absent line says excused; on a
 * finished register Absent becomes Excused as a correction made by the
 * approval, in the group's history and the figures, never with the reason. A
 * line that says they came, or already says excused, is left alone. Emails
 * the person, with the reply, and, while the register says excused, the
 * group's facilitators, without the reason
 * (`src/lib/courses/excused/decide.ts`).
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
  const outcome = await approveExcusedWeek(db, actor, requestId, raw, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  return NextResponse.json({ ok: true, ...outcome.value });
}
