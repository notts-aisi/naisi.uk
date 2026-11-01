import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { assertNotImpersonating } from "@/lib/firebase/impersonation";
import { getCurrentUser } from "@/lib/firebase/session";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { givenLevelsOf, rubricOf, type GivenLevel } from "@/lib/courses/rubric";
import { isBlockWeek, partsOf } from "@/lib/courses/weekBlocks/model";
import { weekWrittenAnswers } from "@/lib/courses/weekBlocks/reader";
import {
  liveGroupsOf,
  ownerFactsOf,
  reviewerFactsOf,
  writtenReviewRole,
} from "@/lib/courses/writtenAnswers/access";
import {
  WRITTEN_ANSWER_LIMITS,
  answerNameOf,
  countWords,
  isWordCountedAnswer,
  readWrittenAnswer,
} from "@/lib/courses/writtenAnswers/model";
import { ANSWER_NOT_HERE, commentTooLongWords } from "@/lib/courses/writtenAnswerWords";
import { sendWrittenFeedbackEmail } from "@/lib/email/writtenFeedbackEmail";
import { exerciseResponseId, isReflectionResponse } from "@/lib/firestore/courseExercises";
import { normalizeCourse, normalizeCourseRun } from "@/lib/firestore/courses";
import { courseEnrolmentId, normalizeCourseEnrolment } from "@/lib/firestore/courseEnrolments";
import { workIsReadable } from "@/lib/courses/weekWork/model";
import { ownLockSource, weekStateIn } from "@/lib/courses/weekWork/own";

/**
 * A REVIEWER GIVING FEEDBACK ON ONE PERSON'S WRITTEN ANSWER (boards
 * wk-review, wk-review-phone; Q34 B):
 * `POST /api/courses/runs/[runId]/written-answers/[answerId]/review` with
 * `{ weekId, uid, action: "feedback", levels, comment }`: `levels` is one
 * `{ row, level }` for each row of the course's rubric. The feedback is sent
 * once, stored with each level's descriptor as given and who sent it, then
 * one short email goes to the person that feedback is waiting (transactional;
 * the feedback stays on the site). A course with no rubric takes the comment
 * alone. Never a mark.
 *
 * ONLY ON WORK THEY MAY READ (privacy v15): the week submitted or locked, or
 * an answer sent before weeks were submitted (`workIsReadable`). Opening an
 * answer locks nothing any more, and nor does feedback: the week locks when
 * it is submitted or its session starts. Reopening is the week's own route
 * (`/api/courses/runs/[runId]/weeks/[weekId]/reopen`), asked by the same
 * gate.
 *
 * WHO: the one gate, `writtenReviewRole`, asked before any answer is read.
 * A fellow's answer is their group's facilitators', the programme's lead's
 * and admins'; a facilitator's own answer is the lead's and admins', never
 * a co-facilitator's; nobody's their own. Every refusal is the same 403, so
 * the answer never says whether somebody wrote anything. View-as is refused
 * first, so a view-as session never stamps, reopens or sends.
 *
 * What travels back is built field by field: the answer's state, never the
 * stored document.
 */

const WEEK_ID = /^w(\d{2})$/;
const MAX_WEEK_NUMBER = 60;
const ACTIONS = ["feedback"] as const;

/** Thrown out of the transaction to refuse with a status. */
class ReviewError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export type WrittenReviewResult = {
  ok: true;
  state: {
    /** ISO 8601, or null while its writer can still change it. */
    openedAt: string | null;
    openedByUid: string | null;
    reopenedAt: string | null;
    feedback: { levels: GivenLevel[]; comment: string; sentAt: string } | null;
  };
  /** After feedback: whether the email that it is waiting went. */
  emailed?: boolean;
};

export async function POST(
  req: Request,
  ctx: { params: Promise<{ runId: string; answerId: string }> },
) {
  const blocked = await assertNotImpersonating();
  if (blocked) return blocked;

  const { runId, answerId } = await ctx.params;
  if (!isAddressableId(runId) || !isAddressableId(answerId)) {
    return NextResponse.json({ error: ANSWER_NOT_HERE }, { status: 404 });
  }

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // ---- The body, before any document is read --------------------------------
  let body: { weekId?: unknown; uid?: unknown; action?: unknown; levels?: unknown; comment?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Say whose answer, which week and what to do." }, { status: 400 });
  }
  const weekId = typeof body.weekId === "string" ? body.weekId : "";
  const match = WEEK_ID.exec(weekId);
  const weekNumber = match ? Number(match[1]) : 0;
  if (weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    return NextResponse.json({ error: 'Say which week the answer is on, like "w03".' }, { status: 400 });
  }
  const uid = typeof body.uid === "string" ? body.uid : "";
  if (!isAddressableId(uid)) return NextResponse.json({ error: "Say whose answer it is." }, { status: 400 });
  if (!ACTIONS.some((candidate) => candidate === body.action)) {
    return NextResponse.json({ error: `Say what to do: ${ACTIONS.join(", ")}.` }, { status: 400 });
  }
  if (body.levels !== undefined && !Array.isArray(body.levels)) {
    return NextResponse.json({ error: "Send the levels as a list of each row and its level." }, { status: 400 });
  }
  const chosen: Array<{ row: unknown; level: unknown }> = ((body.levels as unknown[] | undefined) ?? []).slice(0, 20).map((entry) => {
    const value = (entry ?? {}) as { row?: unknown; level?: unknown };
    return { row: value.row, level: value.level };
  });
  if (body.comment !== undefined && typeof body.comment !== "string") {
    return NextResponse.json({ error: "Send the comment as text." }, { status: 400 });
  }
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  if (comment.length > WRITTEN_ANSWER_LIMITS.commentChars || countWords(comment) > WRITTEN_ANSWER_LIMITS.commentWords) {
    return NextResponse.json({ error: commentTooLongWords(WRITTEN_ANSWER_LIMITS.commentWords) }, { status: 400 });
  }

  // ---- The gate, before any answer is read ---------------------------------
  const runSnap = await db.collection("courseRuns").doc(runId).get();
  const runData = runSnap.exists ? ((runSnap.data() ?? {}) as Record<string, unknown>) : null;
  const liveGroups = runData && runData.destroying !== true ? await liveGroupsOf(db, runId) : [];
  const facts = await reviewerFactsOf(db, actor, runId);
  const owner = runData ? await ownerFactsOf(db, runId, uid, liveGroups, { isAdmin: facts.isAdmin }) : null;
  const role = owner ? writtenReviewRole(actor, facts, owner, liveGroups) : null;
  if (!runData || !owner || !role?.mayReview) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // ---- Which answer: the written answer of the week as its writer reads it ---
  const facilitated = liveGroups.filter((group) => group.facilitatorUids.includes(uid));
  const ownGroupId = owner.placedGroupId ?? (facilitated.length === 1 ? facilitated[0].id : null);
  const { week } = await resolveWeekDoc(db, runId, ownGroupId, weekId);
  const answer = week && isBlockWeek(week) ? (weekWrittenAnswers(week).find((candidate) => candidate.id === answerId) ?? null) : null;
  if (!week || !answer) return NextResponse.json({ error: ANSWER_NOT_HERE }, { status: 404 });

  // ---- The rubric, for feedback: the course's, as it stands -----------------
  let levels: GivenLevel[] = [];
  const courseId = typeof runData.courseId === "string" ? runData.courseId : "";
  const courseSnap = courseId && isAddressableId(courseId) ? await db.collection("courses").doc(courseId).get() : null;
  const rubric = courseSnap?.exists ? rubricOf(normalizeCourse(courseSnap.id, courseSnap.data() ?? {})) : null;
  if (rubric) {
    const given = givenLevelsOf(rubric, chosen);
    if (!given.ok) return NextResponse.json({ error: given.error }, { status: 409 });
    levels = given.levels;
  } else {
    if (chosen.length > 0) {
      return NextResponse.json({ error: "The rubric changed while you were giving feedback. Reload the page." }, { status: 409 });
    }
    if (!comment) {
      return NextResponse.json({ error: "Write a short comment: this course has no rubric, so the comment is the feedback." }, { status: 400 });
    }
  }

  const ref = db.collection("courseExerciseResponses").doc(exerciseResponseId(runId, uid, weekId, answerId));
  // Whose sessions lock the person's week, for whether their answer may be read.
  const ownerSeat = await db.collection("courseEnrolments").doc(courseEnrolmentId(runId, uid)).get();
  const source = ownLockSource(
    normalizeCourseRun(runSnap.id, runData),
    liveGroups,
    uid,
    owner.placedGroupId && ownerSeat.exists ? normalizeCourseEnrolment(ownerSeat.id, ownerSeat.data() ?? {}) : null,
  );
  let after: Record<string, unknown>;
  try {
    after = await db.runTransaction(async (tx) => {
      const now = new Date();
      const [snap, standing] = await Promise.all([tx.get(ref), weekStateIn(tx, db, { runId, uid, weekId, weekNumber, source, now })]);
      const data = snap.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
      if (!data || isReflectionResponse(data) || !isWordCountedAnswer(data)) {
        throw new ReviewError("That answer hasn’t been submitted yet.", 409);
      }
      const record = readWrittenAnswer(data);
      // Feedback is on work its readers may read: submitted, locked, or sent before weeks were submitted.
      if (record.words === 0 || !workIsReadable(standing.state, record)) {
        throw new ReviewError("That answer hasn’t been submitted yet.", 409);
      }
      if (record.feedback) throw new ReviewError("Feedback on this answer has already been sent.", 409);
      const feedback = { levels, comment, byUid: actor.uid, sentAt: FieldValue.serverTimestamp() };
      // The row's `updatedAt` stays its writer's last save.
      tx.update(ref, { feedback });
      return { ...data, feedback: { ...feedback, sentAt: now } };
    });
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[courses written review] write failed", runId, weekId, answerId, err);
    return NextResponse.json({ error: "Couldn’t save that just now. Try again." }, { status: 500 });
  }

  const record = readWrittenAnswer(after);
  const result: WrittenReviewResult = {
    ok: true,
    state: {
      openedAt: record.openedAt ? record.openedAt.toISOString() : null,
      openedByUid: record.openedAt ? record.openedByUid || null : null,
      reopenedAt: record.reopenedAt ? record.reopenedAt.toISOString() : null,
      feedback: record.feedback
        ? {
            levels: record.feedback.levels,
            comment: record.feedback.comment,
            sentAt: (record.feedback.sentAt ?? new Date()).toISOString(),
          }
        : null,
    },
  };

  // The email that feedback is waiting, to the address on the person's own
  // account, once the feedback is saved. A message that does not go undoes
  // nothing: the page says it did not go.
  const [ownerSnap, actorSnap] = await Promise.all([
    db.collection("users").doc(uid).get(),
    db.collection("users").doc(actor.uid).get(),
  ]);
  const to = ownerSnap.exists ? (ownerSnap.data() ?? {}).email : null;
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/+$/, "");
  const part = partsOf(isBlockWeek(week) ? week.blocks : []).find((candidate) => candidate.id === answer.partId) ?? null;
  result.emailed =
    typeof to === "string" && to && appUrl
      ? await sendWrittenFeedbackEmail({
          to,
          uid,
          runId,
          appUrl,
          facts: {
            weekNumber,
            byFirstName: actorSnap.exists ? firstNameOfUser(actorSnap.data() ?? {}) : "",
            answerName: answerNameOf(part?.title ?? ""),
          },
        })
      : false;
  return NextResponse.json(result);
}
