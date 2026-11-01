import "server-only";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { courseEnrolmentId, normalizeCourseEnrolment, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { exerciseResponseId, isReflectionResponse } from "@/lib/firestore/courseExercises";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import type { FeedbackRole } from "@/lib/firestore/courseFeedback";
import { resolveWeekDoc, type ResolvedWeekEntry } from "../groupResolve";
import { isBlockWeek } from "../weekBlocks/model";
import { weekWrittenAnswers } from "../weekBlocks/reader";
import { workIsReadable, type WeekWorkState } from "../weekWork/model";
import { ownLockSource, readRunForLock, weekStateIn } from "../weekWork/own";
import type { LockSource } from "../weekWork/lock";
import {
  liveGroupsOf,
  ownerFactsOf,
  reviewerFactsOf,
  writtenReviewRole,
  type OwnerFacts,
  type ReviewerFacts,
} from "../writtenAnswers/access";
import { isWordCountedAnswer, readWrittenAnswer, type WrittenAnswerRecord } from "../writtenAnswers/model";

/**
 * WHO WRITES FEEDBACK ON SOMEBODY'S WEEK, AND ON WHAT (privacy v15:
 * "Feedback on your work is written by a person on the team running your
 * programme, and shows their name"), for the routes that save, change and
 * delete a piece.
 *
 * WHO: the one gate on whose work a reader may act on (`writtenReviewRole`):
 * for somebody placed in a group, its facilitators, the programme's lead and
 * admins; for a facilitator's own work, the lead and admins, never a
 * co-facilitator; never the person themselves, an admin included. Asked
 * before anything of theirs is read, and again for every change.
 *
 * AS WHAT (`byRole`, stored on the piece so the person's page signs it as it
 * was written): one of the person's group's facilitators writes as their
 * facilitator, whatever else they are; otherwise the programme's lead as the
 * lead, and an admin as an admin.
 *
 * ON WHAT: a week written as blocks (older weeks keep their own review), and
 * only once its readers may read it (`workIsReadable`): submitted, or locked
 * at the session before it was, or with an answer sent before weeks were
 * submitted. A week open, or reopened, takes none. A piece on the written
 * answer needs words in it; a piece on the week as a whole does not.
 */

/** Why the gate refused: one answer each, so a refusal never says whose work exists. */
export type FeedbackRefusal = { ok: false; status: 403 | 404; error: string };

/** Everything the gate read, for the route's next steps. */
export type FeedbackGate = {
  ok: true;
  run: CourseRunDoc;
  liveGroups: CourseGroupDoc[];
  facts: ReviewerFacts;
  owner: OwnerFacts;
  byRole: FeedbackRole;
};

/**
 * As what `actor` signs feedback on `owner`'s work: their group's
 * facilitator, else the programme's lead, else an admin. Asked only of
 * somebody the gate admits.
 */
export function feedbackRoleOf(
  actor: SessionUser,
  facts: ReviewerFacts,
  owner: OwnerFacts,
  liveGroups: readonly CourseGroupDoc[],
): FeedbackRole {
  const group = owner.placedGroupId ? (liveGroups.find((candidate) => candidate.id === owner.placedGroupId) ?? null) : null;
  const facilitatesTheirGroup =
    group !== null &&
    !liveGroups.some((candidate) => candidate.facilitatorUids.includes(owner.uid)) &&
    isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids);
  if (facilitatesTheirGroup) return "facilitator";
  return facts.isAdmin ? "admin" : "lead";
}

/**
 * THE GATE: may `actor` write feedback on `uid`'s work on this run? Reads the
 * run, its groups, the actor's standing and the person's place, and nothing
 * of their work. Every refusal is the same 403.
 */
export async function feedbackGate(db: Firestore, actor: SessionUser, runId: string, uid: string): Promise<FeedbackGate | FeedbackRefusal> {
  const run = await readRunForLock(db, runId);
  const liveGroups = run ? await liveGroupsOf(db, runId) : [];
  const facts = await reviewerFactsOf(db, actor, runId);
  const owner = run ? await ownerFactsOf(db, runId, uid, liveGroups, { isAdmin: facts.isAdmin }) : null;
  const role = owner ? writtenReviewRole(actor, facts, owner, liveGroups) : null;
  if (!run || !owner || !role?.mayReview) return { ok: false, status: 403, error: "Forbidden" };
  return { ok: true, run, liveGroups, facts, owner, byRole: feedbackRoleOf(actor, facts, owner, liveGroups) };
}

/** The person's own copy of a week and whose sessions lock it, for what a piece may be on. */
export type FeedbackWeek = {
  week: ResolvedWeekEntry["week"];
  /** The week's written answers' block ids, in page order. */
  answerIds: string[];
  source: LockSource;
};

/**
 * The person's week as they read it (their group's copy, or the one group
 * they facilitate), or null when it is not a week written as blocks. Reads
 * the week and their place, nothing of their work.
 */
export async function feedbackWeekOf(db: Firestore, gate: FeedbackGate, weekId: string): Promise<FeedbackWeek | null> {
  const { run, liveGroups, owner } = gate;
  const facilitated = liveGroups.filter((group) => group.facilitatorUids.includes(owner.uid));
  const ownGroupId = owner.placedGroupId ?? (facilitated.length === 1 ? facilitated[0].id : null);
  const [{ week }, seatSnap] = await Promise.all([
    resolveWeekDoc(db, run.id, ownGroupId, weekId),
    db.collection("courseEnrolments").doc(courseEnrolmentId(run.id, owner.uid)).get(),
  ]);
  if (!week || !isBlockWeek(week)) return null;
  const seat: CourseEnrolmentDoc | null =
    owner.placedGroupId && seatSnap.exists ? normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {}) : null;
  return {
    week,
    answerIds: weekWrittenAnswers(week).map((answer) => answer.id),
    source: ownLockSource(run, liveGroups, owner.uid, seat),
  };
}

/**
 * Where the person's week stands and their written answer's row, read INSIDE
 * a write's transaction, so a reopen and a save landing together are put in
 * one order. `answerId` is the answer the piece is on, or the week's first
 * written answer for a piece on the whole week (null for a week with none).
 */
export async function feedbackStandingIn(
  tx: Transaction,
  db: Firestore,
  input: { runId: string; uid: string; weekId: string; weekNumber: number; answerId: string | null; source: LockSource; now: Date },
): Promise<{ state: WeekWorkState; answer: WrittenAnswerRecord | null }> {
  const ref = input.answerId
    ? db.collection("courseExerciseResponses").doc(exerciseResponseId(input.runId, input.uid, input.weekId, input.answerId))
    : null;
  const [standing, snap] = await Promise.all([
    weekStateIn(tx, db, { runId: input.runId, uid: input.uid, weekId: input.weekId, weekNumber: input.weekNumber, source: input.source, now: input.now }),
    ref ? tx.get(ref) : Promise.resolve(null),
  ]);
  const data = snap?.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
  const answer =
    data && !isReflectionResponse(data) && isWordCountedAnswer(data) && data.uid === input.uid ? readWrittenAnswer(data) : null;
  return { state: standing.state, answer };
}

/**
 * Whether a week takes feedback now: its readers may read it
 * (`workIsReadable`), the written answer asked about holding words when the
 * piece is on it. Answers the refusal's words, or null.
 */
export function feedbackRefusalFor(
  on: "writtenAnswer" | "week",
  state: WeekWorkState,
  answer: WrittenAnswerRecord | null,
  words: { notReadable: string; answerEmpty: string },
): string | null {
  if (!workIsReadable(state, answer)) return words.notReadable;
  if (on === "writtenAnswer" && (!answer || answer.words === 0)) return words.answerEmpty;
  return null;
}
