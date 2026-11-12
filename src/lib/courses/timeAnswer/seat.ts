import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  closedWords,
  readSessionLines,
  readSessionLinesNow,
  registerHasRoom,
  sessionDay,
  stillToCome,
  writeExcusedInAdvance,
  writeTakenBack,
} from "@/lib/courses/cantMakeIt/seat";
import { CANT_MAKE_IT_REFUSAL } from "@/lib/courses/cantMakeIt/words";
import { sessionWhenLabel } from "@/lib/courses/londonLabels";
import { resolveSessions } from "@/lib/courses/sessions";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import {
  currentTimeAnswer,
  timeQuestionSinceOf,
  type TimeAnswerRequest,
  type TimeAnswerView,
  type TimeQuestionSession,
  type TimeQuestionView,
} from "./model";
import { ANSWER_REFUSAL, sessionRefusalWords } from "./words";

/**
 * "CAN YOU MAKE THIS TIME MOST WEEKS?" ON THE PERSON'S OWN SEAT: who is
 * asked, the card their programme page draws, and the write of their answer.
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
 * Leaving. No answer gives the person's place back: each writes on their own
 * seat and, for "Most weeks, not all", on their own lines of their group's
 * registers, and shares no code with the leave (`src/lib/courses/leaveRun.ts`).
 * Nobody is emailed, and nothing is sent later because of it.
 *
 * ## What it writes
 *
 * `courseEnrolments/{runId}__{uid}.timeAnswer`, addressed by the caller's own
 * uid, so nothing here can spell anybody else's seat: `{ kind, reason,
 * alternatives, forGroupId, at }`, and for `mostWeeks` the `sessionKeys` they
 * ticked. The person may change it while they are in that group. Every writer
 * that clears Publish's stamp deletes it too; a told seat keeps it through a
 * move, shown only while they are in the group it is about
 * (`currentTimeAnswer`), so it is theirs again if they are moved back. The
 * answer the page was showing names its group, and a seat in another group
 * now is refused, so an answer is never kept about a group the person was
 * not looking at.
 *
 * "Most weeks, not all" also makes the person's lines of their group's
 * registers still to come match what they ticked, through the ticket's own
 * write (`src/lib/courses/cantMakeIt/seat.ts`): each session ticked is
 * recorded as excused on their word, and a session they told us about before
 * and have now unticked is taken back, while the line is still their word.
 * "Yes" and "No, I need a different time" touch no register: under a question
 * about most weeks, yes still holds for somebody who misses one, and the
 * ticket is the way to tell us about one session.
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
 * already read (`getRunAccess`: the caller, the run, their seat as shown to
 * them, and the run's live groups), and one read of the group's registers
 * still to come, so the sessions "Most weeks, not all" lists say which they
 * have already told us they can't make. Null for everybody not asked, who
 * costs no read.
 */
export async function timeQuestionFor(
  db: Firestore,
  input: {
    user: SessionUser;
    run: CourseRunDoc;
    enrolment: CourseEnrolmentDoc | null;
    groups: readonly CourseGroupDoc[];
    now: Date;
  },
): Promise<TimeQuestionView | null> {
  const seat = input.enrolment;
  if (!seat?.groupId) return null;
  const group = input.groups.find((each) => each.id === seat.groupId);
  if (!group || askedOf(input.user, seat, group, input.run.id) !== "asked") return null;
  const lines = await readSessionLinesNow(db, {
    run: input.run,
    group,
    uid: input.user.uid,
    sessions: resolveSessions(input.run, group),
    now: input.now,
  });
  const sessions: TimeQuestionSession[] = stillToCome(lines).map((line) => ({
    sessionKey: line.session.sessionKey,
    weekNumber: line.session.weekNumber,
    day: sessionDay(line.session),
    told: line.state.kind === "told",
  }));
  return {
    groupId: group.id,
    groupName: group.name.trim(),
    when: sessionWhenLabel(group.session),
    campus: group.campus,
    answer: currentTimeAnswer(seat, timeQuestionSinceOf(group)),
    sessions,
  };
}

export type AnswerOutcome =
  | { ok: true; answer: TimeAnswerView }
  | { ok: false; status: 400 | 404 | 409; error: string };

const refuse = (status: 400 | 404 | 409, error: string): AnswerOutcome => ({ ok: false, status, error });

/**
 * The one write of an answer: the caller's own seat, read again inside the
 * transaction with its group (and, for "Most weeks, not all", the group's
 * registers), and written only while the question is still theirs about the
 * group the page showed.
 */
export async function recordTimeAnswer(
  db: Firestore,
  user: SessionUser,
  runId: string,
  request: TimeAnswerRequest,
  now: Date,
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

    if (request.kind !== "mostWeeks") {
      const answer: TimeAnswerView = {
        kind: request.kind,
        reason: request.kind === "cant" ? request.reason : null,
        alternatives: request.kind === "cant" ? request.alternatives : null,
      };
      tx.update(seatRef, {
        timeAnswer: { ...answer, forGroupId: seat.groupId, at: FieldValue.serverTimestamp() },
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { ok: true, answer };
    }

    // "Most weeks, not all": every session the group holds, its register read
    // before anything is written. Each one ticked is a session of the group.
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
    const sessions = resolveSessions(run, group);
    const known = new Set(sessions.map((session) => session.sessionKey));
    if (!request.sessionKeys.every((key) => known.has(key))) return refuse(400, CANT_MAKE_IT_REFUSAL.noSession);
    const lines = await readSessionLines(tx, db, { run, group, uid: user.uid, sessions, now });
    const ticked = new Set(request.sessionKeys);

    // Everything decided before anything is written: a ticked session that
    // can no longer be told about refuses the whole answer, naming its day.
    for (const line of lines) {
      if (!ticked.has(line.session.sessionKey)) continue;
      const day = sessionDay(line.session);
      if (line.state.kind === "closed") return refuse(409, sessionRefusalWords(day, closedWords(line.state)));
      if (line.state.kind === "marked") return refuse(409, sessionRefusalWords(day, CANT_MAKE_IT_REFUSAL.marked));
      if (line.state.kind === "open" && !registerHasRoom(line)) return refuse(409, sessionRefusalWords(day, CANT_MAKE_IT_REFUSAL.full));
    }
    for (const line of lines) {
      if (ticked.has(line.session.sessionKey)) {
        if (line.state.kind === "open") writeExcusedInAdvance(tx, line, { run, group, uid: user.uid, told: FieldValue.serverTimestamp() });
      } else if (line.state.kind === "told") {
        // Told before and unticked now: their own word, taken back. A line an
        // approval wrote is not their word, and stays (`setByApproval`).
        writeTakenBack(tx, line, user.uid);
      }
    }
    const answer: TimeAnswerView = { kind: "mostWeeks", reason: null, alternatives: null, sessionKeys: request.sessionKeys };
    tx.update(seatRef, {
      timeAnswer: { ...answer, forGroupId: seat.groupId, at: FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ok: true, answer };
  });
}
