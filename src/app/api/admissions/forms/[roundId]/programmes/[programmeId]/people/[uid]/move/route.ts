import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { parseMoveBody } from "@/lib/courses/staffMove/parse";
import { planMove, previewOf, readMoveFacts } from "@/lib/courses/staffMove/plan";
import type { MovePreviewView } from "@/lib/courses/staffMove/view";
import { saveMove } from "@/lib/courses/staffMove/save";
import { MOVE_REFUSAL } from "@/lib/courses/staffMove/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * MOVING ONE PERSON TO ANOTHER GROUP FOR GOOD, MID-TERM, from their page
 * under the programme (`.../programmes/[programmeId]/people/[uid]/move`).
 *
 *   POST { toGroupId, preview: true }                    what it would do
 *   POST { toGroupId, weekNumber, emailCount, reason? }  the press
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`, the
 * gate of the programme's Groups and People tabs and of the room route). A
 * reviewer of the programme is told it is not theirs; anybody with no role on
 * it is told the programme is not there. A view-as session is turned away
 * first. A lead who facilitates one of the two groups may still move people.
 *
 * WHAT IS REFUSED, one sentence each and nothing written
 * (`src/lib/courses/staffMove/plan.ts`): not an active learner's place in a
 * group on the run; a place not told its group yet (that is Arrange's move,
 * told at Publish); somebody who facilitates a group of the run; a group that
 * is missing, of another run, archived, theirs already, or full (hard, as
 * the allocation board is); a run with one group (an incubator included), a
 * run that is over or being destroyed; and the week rule's three refusals
 * (`src/lib/courses/staffMove/week.ts`): the new group has met that week
 * already, the old group has no session left, the new group has no session
 * for that week.
 *
 * THE WEEK IS THE SERVER'S. The preview answers it and the lines the page
 * draws; the press sends back the week and the count of emails it was shown,
 * and the save works both out again inside its transaction: 409 with the new
 * facts when either differs. On save the person, the new group's
 * facilitators and the old group's are emailed after the move commits; a
 * failed send never fails the move, and the answer says what went.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; uid: string }> };

/** What a move would do, as the page draws it. Never an address. */
export type MovePreviewAnswer = { ok: true; preview: MovePreviewView };

export type MoveSavedAnswer = {
  ok: true;
  toGroupId: string;
  fromGroupId: string;
  weekNumber: number;
  message: string;
  emails: { sent: number; suppressed: number; failed: number };
};

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { roundId, programmeId, uid } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseMoveBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: MOVE_REFUSAL.noProgramme }, { status: 404 });
  if (!uid || !isAddressableId(uid)) return NextResponse.json({ error: MOVE_REFUSAL.noPlace }, { status: 404 });
  if (!isAddressableId(parsed.value.toGroupId)) return NextResponse.json({ error: MOVE_REFUSAL.noGroup }, { status: 404 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: MOVE_REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: MOVE_REFUSAL.notYours }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? MOVE_REFUSAL.runGone : MOVE_REFUSAL.noRun }, { status: 409 });
  }
  const runId = view.run.id;
  const now = new Date();

  if (parsed.value.preview) {
    const read = await readMoveFacts(db, runId, uid);
    if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
    const planned = await planMove(db, read.facts, parsed.value.toGroupId, user.uid, now);
    if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: planned.status });
    const answer: MovePreviewAnswer = { ok: true, preview: previewOf(planned.plan) };
    return NextResponse.json(answer);
  }

  const saved = await saveMove(db, {
    runId,
    uid,
    toGroupId: parsed.value.toGroupId,
    weekNumber: parsed.value.weekNumber,
    emailCount: parsed.value.emailCount,
    reason: parsed.value.reason,
    actor: user,
    now,
  });
  if (!saved.ok) {
    const body: Record<string, unknown> = { error: saved.error };
    if ("weekNumber" in saved) {
      body.weekNumber = saved.weekNumber;
      body.emails = saved.emails;
    }
    return NextResponse.json(body, { status: saved.status });
  }
  const answer: MoveSavedAnswer = {
    ok: true,
    toGroupId: saved.toGroupId,
    fromGroupId: saved.fromGroupId,
    weekNumber: saved.weekNumber,
    message: saved.message,
    emails: { sent: saved.emails.sent, suppressed: saved.emails.suppressed, failed: saved.emails.failed },
  };
  return NextResponse.json(answer);
}
