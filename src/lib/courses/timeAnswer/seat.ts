import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { sessionWhenLabel } from "@/lib/courses/londonLabels";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  currentTimeAnswer,
  type TimeAnswerRequest,
  type TimeAnswerView,
  type TimeQuestionView,
} from "./model";
import { ANSWER_REFUSAL } from "./words";

/**
 * "CAN YOU MAKE THIS TIME?" ON THE PERSON'S OWN SEAT: who is asked, the card
 * their programme page draws, and the one write of their answer.
 *
 * ## Who is asked
 *
 * Somebody taking part whom Publish has told their group: their own learner
 * seat on the run, active, in a live group of the run, told
 * (`placementIsTold`, asked once, in `askedOf`, by both the card and the
 * write), on an account that stands. Not a seat somebody chose for
 * themselves on an open run: they picked their time. Not somebody who
 * facilitates the group they sit in: its time is theirs to sort out with
 * the programme's lead, and the write says so.
 *
 * ## What it is not
 *
 * Leaving. "I can't make this time" keeps the person's place and their seat
 * and asks to be moved; it writes one field on their seat and nothing else,
 * and shares no code with the leave (`src/lib/courses/leaveRun.ts`), which
 * gives the place back. Nobody is emailed, and nothing is sent later because
 * of it.
 *
 * ## What it writes
 *
 * `courseEnrolments/{runId}__{uid}.timeAnswer`, addressed by the caller's own
 * uid, so nothing here can spell anybody else's seat: `{ kind, reason,
 * alternatives, forGroupId, at }`. The person may change it while they are in
 * that group; a move deletes it (every writer that clears Publish's stamp
 * clears it too). The answer the page was showing names its group, and a
 * seat in another group now is refused, so an answer is never kept about a
 * group the person was not looking at.
 */

/** Why the question is not open to this seat about this group. */
type Asked = "asked" | "facilitating" | "not-asked";

function askedOf(user: SessionUser, seat: CourseEnrolmentDoc, group: CourseGroupDoc, runId: string): Asked {
  if (seat.uid !== user.uid || seat.runId !== runId) return "not-asked";
  if (seat.role !== "learner" || seat.status !== "active" || seat.selfEnrolled) return "not-asked";
  if (!seat.groupId || seat.groupId !== group.id || group.runId !== runId || group.archived) return "not-asked";
  // Publish has emailed them this group. Until then it is the board's working
  // copy, shown to nobody, so there is nothing to answer.
  if (!placementIsTold(seat)) return "not-asked";
  if (!isNamedWithStanding(user, "courseEnrolments.uid", seat.uid)) return "not-asked";
  // Named on the group as one of its facilitators, by the same bar every
  // facilitator's power is asked by.
  if (isNamedWithStanding(user, "courseGroups.facilitatorUids", group.facilitatorUids)) return "facilitating";
  return "asked";
}

/**
 * The card for the programme page, worked out from what the page's gate has
 * already read (`getRunAccess`: the caller, their seat as shown to them, and
 * the run's live groups). No read of its own. Null for everybody not asked.
 */
export function timeQuestionFor(input: {
  user: SessionUser;
  runId: string;
  enrolment: CourseEnrolmentDoc | null;
  groups: readonly CourseGroupDoc[];
}): TimeQuestionView | null {
  const seat = input.enrolment;
  if (!seat?.groupId) return null;
  const group = input.groups.find((each) => each.id === seat.groupId);
  if (!group || askedOf(input.user, seat, group, input.runId) !== "asked") return null;
  return {
    groupId: group.id,
    groupName: group.name.trim(),
    when: sessionWhenLabel(group.session),
    campus: group.campus,
    answer: currentTimeAnswer(seat),
  };
}

export type AnswerOutcome =
  | { ok: true; answer: TimeAnswerView }
  | { ok: false; status: 404 | 409; error: string };

const refuse = (status: 404 | 409, error: string): AnswerOutcome => ({ ok: false, status, error });

/**
 * The one write of an answer: the caller's own seat, read again inside the
 * transaction with its group, and written only while the question is still
 * theirs about the group the page showed.
 */
export async function recordTimeAnswer(
  db: Firestore,
  user: SessionUser,
  runId: string,
  request: TimeAnswerRequest,
): Promise<AnswerOutcome> {
  const runRef = db.collection("courseRuns").doc(runId);
  const seatRef = db.collection("courseEnrolments").doc(courseEnrolmentId(runId, user.uid));
  return db.runTransaction(async (tx) => {
    const [runSnap, seatSnap] = await Promise.all([tx.get(runRef), tx.get(seatRef)]);
    // A run being destroyed is refused to everybody, as its pages are.
    if (!runSnap.exists || runSnap.data()?.destroying === true) return refuse(404, ANSWER_REFUSAL.notAsked);
    if (!seatSnap.exists) return refuse(404, ANSWER_REFUSAL.notAsked);
    const seat = normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {});
    if (!seat.groupId) return refuse(404, ANSWER_REFUSAL.notAsked);
    const groupSnap = await tx.get(db.collection("courseGroups").doc(seat.groupId));
    if (!groupSnap.exists) return refuse(404, ANSWER_REFUSAL.notAsked);
    const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});

    const asked = askedOf(user, seat, group, runId);
    // Untold, left, not taking part: answered as nothing to answer, which
    // says nothing of a group Publish has not told them about.
    if (asked === "not-asked") return refuse(404, ANSWER_REFUSAL.notAsked);
    if (asked === "facilitating") return refuse(409, ANSWER_REFUSAL.facilitating);
    // Told, and in another group than the page showed: they were moved and
    // told again since it was opened.
    if (seat.groupId !== request.groupId) return refuse(409, ANSWER_REFUSAL.moved);

    tx.update(seatRef, {
      timeAnswer: {
        kind: request.kind,
        reason: request.kind === "cant" ? request.reason : null,
        alternatives: request.kind === "cant" ? request.alternatives : null,
        forGroupId: seat.groupId,
        at: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return {
      ok: true,
      answer: {
        kind: request.kind,
        reason: request.kind === "cant" ? request.reason : null,
        alternatives: request.kind === "cant" ? request.alternatives : null,
      },
    };
  });
}
