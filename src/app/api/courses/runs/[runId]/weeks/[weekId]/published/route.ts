import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { readWeekInUse, weekIdNumber, type WeekInUse } from "@/lib/courses/olderEditor/weekInUse";
import { weekStaysPublishedWords } from "@/lib/courses/olderEditor/words";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { doesTrackLeadWork, runStaffingOf } from "@/lib/courses/runStaffing";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { asUidList } from "@/lib/firestore/events";
import { canApproveCourse, canDraftCourse } from "@/lib/firestore/users";

/**
 * UNPUBLISH A RUN'S WEEK, ONCE IT IS CHECKED THAT NOBODY HAS STARTED IT:
 * `PATCH /api/courses/runs/[runId]/weeks/[weekId]/published` with
 * `{ published: false }`.
 *
 * Publishing stays a browser write from the week editor. Taking a week back
 * is this route's, for every writer, admins included: firestore.rules
 * refuses any browser write that takes a run's week's `published` from true
 * to false, because what decides it is other people's rows, which a rule
 * cannot count.
 *
 * THE RULE (the owner's): a week stays published once anybody has ticked or
 * written in it, or its session has passed, and week 1 stays published while
 * it is open early to everybody holding a place. `readWeekInUse` asks all of
 * it, and the refusal says "People have started week 3, so it stays
 * published." with no count of people and no names.
 *
 * WHO. The people who could unpublish a week before this route existed, the
 * rule's `canEditRun()` on the run's weeks (an admin, a course approver, the
 * course drafter who wrote the run, one of its track leads), and the lead of
 * the programme that names the run (`runStaffingOf`). Everybody else gets
 * one 403, and nobody but an approver learns whether the run exists.
 *
 * ONE TRANSACTION. The counts, the run's groups, the run and the week are
 * read in it and `published` written in it, so a tick that lands first is
 * counted and the refusal stands. Writes `published` only, and nothing is
 * emailed. A view-as session is refused first.
 */

type Params = { params: Promise<{ runId: string; weekId: string }> };

const NOT_YOURS = "Only an admin, a course approver, the run’s author, its track leads or the programme’s lead can unpublish a week.";
const BAD_BODY = "Say { \"published\": false }. A week is published from its editor.";

export type WeekUnpublishAnswer = { ok: true; week: { weekId: string; weekNumber: number; published: false } };
export type WeekUnpublishRefusal = { error: string; inUse?: WeekInUse };

class Refusal extends Error {
  constructor(
    message: string,
    public status: number,
    public inUse?: WeekInUse,
  ) {
    super(message);
  }
}

export async function PATCH(req: Request, ctx: Params) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let body: { published?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: BAD_BODY }, { status: 400 });
  }
  if (body?.published !== false) return NextResponse.json({ error: BAD_BODY }, { status: 400 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  const { runId, weekId } = await ctx.params;
  const addressable = isAddressableId(runId) && weekIdNumber(weekId) !== null;

  // The gate. An approver needs nothing read; anybody else is decided on the
  // run's own author and track leads, and on the forms for the programme's
  // lead, with one answer for a run that is not there.
  if (!canApproveCourse(actor)) {
    const runSnap = isAddressableId(runId) ? await db.collection("courseRuns").doc(runId).get() : null;
    const data = runSnap?.exists ? (runSnap.data() ?? {}) : null;
    const author = data !== null && canDraftCourse(actor) && data.authorUid === actor.uid;
    const staffing = data !== null ? await runStaffingOf(db, actor, { id: runId, trackLeadUids: asUidList(data.trackLeadUids) }) : null;
    if (!author && !(staffing && doesTrackLeadWork(staffing))) {
      return NextResponse.json({ error: NOT_YOURS }, { status: 403 });
    }
  }
  if (!addressable) {
    return NextResponse.json({ error: "That isn’t a week of a run: weeks are w01 to w60." }, { status: 404 });
  }

  const namedByProgramme = (await readNamingProgramme(db, runId)) !== null;
  const weekRef = db.collection("courseRuns").doc(runId).collection("weeks").doc(weekId);

  let weekNumber: number;
  try {
    weekNumber = await db.runTransaction(async (tx) => {
      const facts = await readWeekInUse(db, { runId, weekId, namedByProgramme, now: new Date() }, tx);
      if (!facts) throw new Refusal("That week isn’t on this run.", 404);
      if (!facts.week.published) return facts.weekNumber;
      if (facts.inUse) throw new Refusal(weekStaysPublishedWords(facts.weekNumber), 409, facts.inUse);
      tx.update(weekRef, { published: false, updatedAt: FieldValue.serverTimestamp(), updatedByUid: actor.uid });
      return facts.weekNumber;
    });
  } catch (err) {
    if (err instanceof Refusal) {
      const refusal: WeekUnpublishRefusal = err.inUse ? { error: err.message, inUse: err.inUse } : { error: err.message };
      return NextResponse.json(refusal, { status: err.status });
    }
    console.error("[courses week unpublish] write failed", runId, weekId, err);
    return NextResponse.json({ error: "Couldn’t save that just now. Try again." }, { status: 500 });
  }

  const answer: WeekUnpublishAnswer = { ok: true, week: { weekId, weekNumber, published: false } };
  return NextResponse.json(answer);
}
