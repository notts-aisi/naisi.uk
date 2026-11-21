import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isId } from "@/lib/applications/normalise";
import { parseVisitBody } from "@/lib/courses/visit/parse";
import { dbReader, planVisit, previewOf, readVisitFacts } from "@/lib/courses/visit/plan";
import { arrangeVisit, callOffVisit } from "@/lib/courses/visit/save";
import type { VisitPreviewView } from "@/lib/courses/visit/view";
import { visitLimitRefusal } from "@/lib/courses/visit/limits";
import { VISIT_REFUSAL } from "@/lib/courses/visit/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";

/**
 * ARRANGING A ONE-WEEK VISIT TO ANOTHER GROUP'S SESSION FOR ONE PERSON, and
 * calling one off, from their page under the programme
 * (`.../programmes/[programmeId]/people/[uid]/visit`).
 *
 *   POST { weekNumber, hostGroupId, preview: true }                   what it would do
 *   POST { weekNumber, hostGroupId, emailCount, overLimit, reason? }  the press
 *   POST { weekNumber, callOff: true, emailCount }                    call it off
 *
 * WHO MAY is the programme's lead or an admin, decided from the form once a
 * valid body has arrived and before the run is read (`loadProgrammeRun`). A
 * reviewer of the programme is told it is not theirs; anybody with no role on
 * it is told the programme is not there. A view-as session is turned away
 * first.
 *
 * WHAT IS REFUSED, one sentence each and nothing written
 * (`src/lib/courses/visit/plan.ts`): not an active learner's place told its
 * group; somebody who facilitates a group of the run; a run with one group,
 * or one over, archived or being destroyed (asked again inside the save); a
 * host missing, archived, of another run or the group they belong to that
 * week; a host session that week missing, called off, marked as not held or
 * started; somebody already marked as having come on their own group's
 * register that week; a week that already has a visit; a host register at
 * its limit of people. A session that is full that week MAY be chosen: the
 * preview carries a warning, and the press must say it was shown it.
 *
 * On save the person, the host group's facilitators and their own group's
 * are emailed after the visit commits; on calling off, both groups'
 * facilitators and the person. A failed send never fails the press, and the
 * answer says what went.
 */

type Ctx = { params: Promise<{ roundId: string; programmeId: string; uid: string }> };

/** What a visit would do, as the page draws it. Never an address. */
export type VisitPreviewAnswer = { ok: true; preview: VisitPreviewView };

export type VisitSavedAnswer = {
  ok: true;
  weekNumber: number;
  hostGroupId: string;
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
  const parsed = parseVisitBody(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  if (!isId(roundId) || !isId(programmeId)) return NextResponse.json({ error: VISIT_REFUSAL.noProgramme }, { status: 404 });
  if (!uid || !isAddressableId(uid)) return NextResponse.json({ error: VISIT_REFUSAL.noPlace }, { status: 404 });
  if (parsed.value.kind !== "call-off" && !isAddressableId(parsed.value.hostGroupId)) {
    return NextResponse.json({ error: VISIT_REFUSAL.noGroup }, { status: 404 });
  }

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const outcome = await loadProgrammeRun(db, user, roundId, programmeId);
  if (outcome.status === "none") return NextResponse.json({ error: VISIT_REFUSAL.noProgramme }, { status: 404 });
  if (outcome.status === "not-yours") return NextResponse.json({ error: VISIT_REFUSAL.notYours }, { status: 403 });
  const { view } = outcome;
  if (!view.run) {
    return NextResponse.json({ error: view.blank === "run-gone" ? VISIT_REFUSAL.runGone : VISIT_REFUSAL.noRun }, { status: 409 });
  }
  const runId = view.run.id;
  const now = new Date();
  const body = parsed.value;

  if (body.kind === "preview") {
    const read = await readVisitFacts(dbReader(db), db, runId, uid, [body.weekNumber], now);
    if (!read.ok) return NextResponse.json({ error: read.error }, { status: read.status });
    const planned = planVisit(read.facts, body.weekNumber, body.hostGroupId, user.uid, now);
    if (!planned.ok) return NextResponse.json({ error: planned.error }, { status: planned.status });
    // The page says before a press when the limit on these emails would refuse it.
    const answer: VisitPreviewAnswer = { ok: true, preview: previewOf(planned.plan, await visitLimitRefusal(db, runId, uid, user.uid)) };
    return NextResponse.json(answer);
  }

  const saved =
    body.kind === "arrange"
      ? await arrangeVisit(db, {
          runId,
          uid,
          weekNumber: body.weekNumber,
          hostGroupId: body.hostGroupId,
          emailCount: body.emailCount,
          overLimit: body.overLimit,
          reason: body.reason,
          actor: user,
          now,
        })
      : await callOffVisit(db, { runId, uid, weekNumber: body.weekNumber, byStaff: true, emailCount: body.emailCount, actor: user, now });
  if (!saved.ok) {
    const answer: Record<string, unknown> = { error: saved.error };
    if ("emails" in saved) answer.emails = saved.emails;
    if ("overLimit" in saved) answer.overLimit = saved.overLimit;
    return NextResponse.json(answer, { status: saved.status });
  }
  const answer: VisitSavedAnswer = {
    ok: true,
    weekNumber: saved.weekNumber,
    hostGroupId: saved.hostGroupId,
    message: saved.message,
    emails: { sent: saved.emails.sent, suppressed: saved.emails.suppressed, failed: saved.emails.failed },
  };
  return NextResponse.json(answer);
}
