import { NextResponse } from "next/server";
import { isAddressableId } from "@/lib/addressableId";
import { readsTimeAnswers, runStaffingOf } from "@/lib/courses/runStaffing";
import { parseSomeWeeks, type TimeAnswerView } from "@/lib/courses/timeAnswer/model";
import { recordSomeWeeks, someWeeksFor, type SomeWeeksSession } from "@/lib/courses/timeAnswer/someWeeks";
import { SOME_WEEKS_REFUSAL, SOME_WEEKS_SAVED } from "@/lib/courses/timeAnswer/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * "THEY MEANT SOME WEEKS", for one person on a run: an admin or the lead of
 * the programme that names the run reads the person's answer of "No, I need
 * a different time" as "Most weeks, not all", from where that answer shows
 * (the allocation board's card, and the person in Circles).
 *
 *   GET   their group's sessions still to come, each with whether they
 *         already told us they can't make it: `{ sessions }`.
 *   POST  `{ sessionKeys }`, the sessions they meant (none is allowed): the
 *         answer becomes `mostWeeks` with their words kept, each session is
 *         recorded as excused on its register on their word, and one audit
 *         row is written. Answers `{ ok, answer, message }`.
 *
 * WHO: an admin, or the lead of the programme that names the run
 * (`readsTimeAnswers`), the bar the board's rows are sent the answer
 * behind. A run's track lead is never sent the answer and is refused here.
 * What is checked and written is `src/lib/courses/timeAnswer/someWeeks.ts`'s.
 *
 * ORDER: on POST a view-as session is refused first; then somebody signed
 * out, an address that names nothing, and (POST) a body that is not a list
 * of sessions, before any document is read; then the run, and the gate.
 *
 * Nobody is emailed. The person sees their answer change on their own card.
 */

type Ctx = { params: Promise<{ runId: string; uid: string }> };

export type SomeWeeksOffer = { sessions: SomeWeeksSession[] };

export type SomeWeeksReply = {
  ok: true;
  answer: TimeAnswerView;
  /** The sentence the screen shows. */
  message: string;
};

export async function GET(_req: Request, ctx: Ctx) {
  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { runId, uid } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(uid)) {
    return NextResponse.json({ error: SOME_WEEKS_REFUSAL.noRun }, { status: 404 });
  }
  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists || runSnap.data()?.destroying === true) {
    return NextResponse.json({ error: SOME_WEEKS_REFUSAL.noRun }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const staffing = await runStaffingOf(db, actor, run);
  if (!readsTimeAnswers(staffing)) return NextResponse.json({ error: SOME_WEEKS_REFUSAL.notStaff }, { status: 403 });

  const outcome = await someWeeksFor(db, { run, uid, now: new Date() });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const offer: SomeWeeksOffer = {
    sessions: outcome.sessions.map((session) => ({
      sessionKey: session.sessionKey,
      weekNumber: session.weekNumber,
      day: session.day,
      excused: session.excused,
    })),
  };
  return NextResponse.json(offer, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request, ctx: Ctx) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { runId, uid } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(uid)) {
    return NextResponse.json({ error: SOME_WEEKS_REFUSAL.noRun }, { status: 404 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = null;
  }
  const parsed = parseSomeWeeks(raw);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists || runSnap.data()?.destroying === true) {
    return NextResponse.json({ error: SOME_WEEKS_REFUSAL.noRun }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const staffing = await runStaffingOf(db, actor, run);
  if (!readsTimeAnswers(staffing)) return NextResponse.json({ error: SOME_WEEKS_REFUSAL.notStaff }, { status: 403 });

  const outcome = await recordSomeWeeks(db, { actor, runId: run.id, uid, sessionKeys: parsed.value.sessionKeys, now: new Date() });
  if (!outcome.ok) return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  const answer: TimeAnswerView =
    outcome.answer.kind === "mostWeeks"
      ? {
          kind: "mostWeeks",
          reason: outcome.answer.reason,
          alternatives: outcome.answer.alternatives,
          sessionKeys: outcome.answer.sessionKeys,
        }
      : { kind: outcome.answer.kind, reason: outcome.answer.reason, alternatives: outcome.answer.alternatives };
  const reply: SomeWeeksReply = { ok: true, answer, message: SOME_WEEKS_SAVED };
  return NextResponse.json(reply);
}
