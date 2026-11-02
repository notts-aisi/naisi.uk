import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { isBlockWeek } from "@/lib/courses/weekBlocks/model";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import { nextSessionAfter } from "@/lib/courses/weekWork/lock";
import { weekIsShut, weekWorkWire, type WeekWorkWire } from "@/lib/courses/weekWork/model";
import { logWork, ownLockSource, readRunForLock, weekStateIn, weekWorkRef } from "@/lib/courses/weekWork/own";
import { ALREADY_OPEN, NOT_A_SUBMIT_WEEK } from "@/lib/courses/weekWork/words";
import { liveGroupsOf, ownerFactsOf, reviewerFactsOf, writtenReviewRole } from "@/lib/courses/writtenAnswers/access";
import { isWordCountedAnswer, readWrittenAnswer } from "@/lib/courses/writtenAnswers/model";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { courseEnrolmentId, normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { exerciseResponseId, isReflectionResponse } from "@/lib/firestore/courseExercises";

/**
 * REOPENING ONE PERSON'S WEEK (privacy v15: "the people running your group
 * can reopen it for you"): `POST /api/courses/runs/[runId]/weeks/[weekId]/reopen`
 * with `{ uid }`.
 *
 * WHO: the one gate on whose work a reader may act on (`writtenReviewRole`):
 * for somebody placed in a group, its facilitators, the programme's lead and
 * admins; for a facilitator's own week, the lead and admins, never a
 * co-facilitator; never the person themselves, an admin included. Every
 * refusal is the same 403, so the answer never says whose week exists.
 * View-as is refused first, so a view-as session never reopens anything.
 *
 * WHAT. A week written as blocks that is submitted or locked
 * (`src/lib/courses/weekWork/`): it takes writing again until they submit it,
 * or the group's next session that meets starts, whichever comes first.
 * Inside one transaction it clears the submit, stores when and by whom it was
 * reopened and how many times, clears the lock a written answer of the week
 * kept from being opened before weeks were submitted (`openedAt`, noting the
 * reopen on the answer, which its writer's card says), and logs the reopen
 * with who did it. Feedback already given stays, with its date. Nobody is
 * emailed: the person's week page says it was reopened, by whom, and until
 * when.
 */

/** Week doc ids are "w01".."w60" (`weekDocId`). */
const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;

export type ReopenWeekAnswer = { ok: true; work: WeekWorkWire };

/** Thrown out of the transaction to refuse with a status. */
class ReopenRefusal extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ runId: string; weekId: string }> }) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { uid?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say whose week to reopen." }, { status: 400 });
  }
  const uid = typeof body?.uid === "string" ? body.uid : "";
  if (!isAddressableId(uid)) return NextResponse.json({ error: "Say whose week to reopen." }, { status: 400 });

  const { runId, weekId } = await ctx.params;
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (!isAddressableId(runId) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: NOT_A_SUBMIT_WEEK }, { status: 404 });
  }

  // ---- The gate, before any of the person's work is read ---------------------
  const run = await readRunForLock(db, runId);
  const liveGroups = run ? await liveGroupsOf(db, runId) : [];
  const facts = await reviewerFactsOf(db, actor, runId);
  const owner = run ? await ownerFactsOf(db, runId, uid, liveGroups, { isAdmin: facts.isAdmin }) : null;
  const role = owner ? writtenReviewRole(actor, facts, owner, liveGroups) : null;
  if (!run || !owner || !role?.mayReview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ---- Which week: theirs, as they read it ----------------------------------
  const enrolSnap = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get();
  const enrolment = enrolSnap.exists ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {}) : null;
  const facilitated = liveGroups.filter((group) => group.facilitatorUids.includes(uid));
  const ownGroupId = owner.placedGroupId ?? (facilitated.length === 1 ? facilitated[0].id : null);
  const { week } = await resolveWeekDoc(db, runId, ownGroupId, weekId);
  if (!week || !isBlockWeek(week)) return NextResponse.json({ error: NOT_A_SUBMIT_WEEK }, { status: 404 });
  const source = ownLockSource(run, liveGroups, uid, owner.placedGroupId ? enrolment : null);
  const answerRefs = weekWrittenAnswers(week).map((answer) =>
    db.collection("courseExerciseResponses").doc(exerciseResponseId(runId, uid, weekId, answer.id)),
  );
  const now = new Date();

  let work: WeekWorkWire;
  try {
    work = await db.runTransaction(async (tx) => {
      const [{ state }, ...rows] = await Promise.all([
        weekStateIn(tx, db, { runId, uid, weekId, weekNumber, source, now }),
        ...answerRefs.map((ref) => tx.get(ref)),
      ]);
      if (!weekIsShut(state)) throw new ReopenRefusal(ALREADY_OPEN, 409);
      const at = FieldValue.serverTimestamp();
      tx.set(
        weekWorkRef(db, runId, uid, weekId),
        {
          runId,
          uid,
          weekId,
          weekNumber,
          submittedAt: null,
          reopenedAt: at,
          reopenedByUid: actor.uid,
          reopenCount: FieldValue.increment(1),
          updatedAt: at,
        },
        { merge: true },
      );
      // An answer opened before weeks were submitted kept its own lock: the reopen clears it.
      rows.forEach((snap, index) => {
        const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
        if (!data || isReflectionResponse(data) || !isWordCountedAnswer(data) || data.uid !== uid) return;
        if (!readWrittenAnswer(data).openedAt) return;
        tx.update(answerRefs[index], {
          openedAt: FieldValue.delete(),
          openedByUid: FieldValue.delete(),
          reopenedAt: at,
          reopenedByUid: actor.uid,
        });
      });
      logWork(tx, db, { runId, uid, weekId, weekNumber, kind: "reopen", itemKind: "week", itemId: "", byUid: actor.uid });
      return weekWorkWire({ kind: "reopened", at: now, byUid: actor.uid, locksAt: nextSessionAfter(source, now) }, () => "");
    });
  } catch (err) {
    if (err instanceof ReopenRefusal) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses reopen week] write failed", runId, weekId, err);
    return NextResponse.json({ error: "That didn’t reopen. Check your connection and try again." }, { status: 500 });
  }

  // Who reopened it, by the first name they go by: the person's page says so.
  const actorSnap = await db.collection("users").doc(actor.uid).get();
  const byName = actorSnap.exists ? firstNameOfUser(actorSnap.data() ?? {}) : "";
  const answer: ReopenWeekAnswer = {
    ok: true,
    work: { ...work, reopened: work.reopened ? { ...work.reopened, byName } : null },
  };
  return NextResponse.json(answer);
}
