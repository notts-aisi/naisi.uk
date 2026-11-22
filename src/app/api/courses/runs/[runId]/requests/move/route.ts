import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { askToChangeGroup } from "@/lib/courses/moveRequest/ask";
import { parseMoveAsk } from "@/lib/courses/moveRequest/model";
import { MOVE_ASK_REFUSAL } from "@/lib/courses/moveRequest/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * ASK TO CHANGE GROUP FOR THE REST OF THE PROGRAMME, from the person's own
 * form (`/learn/[runId]/change-group`): `POST { toGroupId, reason }`, the
 * reason needed. The week is never sent: the staff move's rule decides it at
 * the approval (`src/lib/courses/moveRequest/ask.ts`).
 *
 * ONLY THEIR OWN: the place read is the caller's own on this run (`uid` is
 * the session's), held to the live bar. ORDER: a view-as session is refused
 * first, then somebody signed out, then the body is checked before anything
 * is read (an empty one is the same 400 for everybody), then the caller's
 * place and the run. Everybody who can ask nothing is answered the one
 * sentence "There's no other group you can ask to move to now.", never a
 * word about the run. Every refusal writes nothing. On success one request
 * is written, and the admins are emailed after the commit, under the daily
 * cap and their own switch. Nobody else is emailed.
 */

type Ctx = { params: Promise<{ runId: string }> };

export type MoveAskAnswer = { ok: true; request: { id: string; askedAt: string; toGroupId: string } };

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { runId } = await ctx.params;
  const raw: unknown = await req.json().catch(() => null);
  const parsed = parseMoveAsk(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isAddressableId(runId) || !isNamedWithStanding(user, "courseEnrolments.uid", user.uid)) {
    return NextResponse.json({ error: MOVE_ASK_REFUSAL.nothingToAsk }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await askToChangeGroup(db, user, runId, parsed.value, new Date());
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const answer: MoveAskAnswer = { ok: true, request: outcome.request };
  return NextResponse.json(answer);
}
