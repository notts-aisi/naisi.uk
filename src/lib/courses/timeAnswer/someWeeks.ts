import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  readSessionLines,
  readSessionLinesNow,
  registerHasRoom,
  sessionDay,
  stillToCome,
  writeExcusedInAdvance,
  type SessionLine,
} from "@/lib/courses/cantMakeIt/seat";
import { excuseHoldsIn } from "@/lib/courses/excused/standing";
import { resolveSessions } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import { COURSE_AUDIT_COLLECTION } from "@/lib/firestore/courseAudit";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  orderedSessionKeys,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { currentTimeAnswer, timeQuestionSinceOf, type TimeAnswerView } from "./model";
import { CARD_TITLE, SOME_WEEKS_REFUSAL, sessionRefusalWords, someWeeksAuditDetail } from "./words";

/**
 * "THEY MEANT SOME WEEKS": an admin or the lead of the programme that names
 * the run reads somebody's answer of "No, I need a different time" as "Most
 * weeks, not all".
 *
 * WHY IT EXISTS. Until 5 Nov 2026 "Can you make this time?" had two answers,
 * and people who could not make ONE week said they could not make the time,
 * which every reader took as somebody to move.
 * Their own words say what they meant. This turns such an answer into the
 * third answer, as the person would have given it.
 *
 * WHAT IT DOES, in one transaction, refusing everything if any part cannot be
 * done: the answer becomes `mostWeeks`, keeping the words the person wrote
 * (`reason`, `alternatives`) and when they wrote them, so staff still read
 * them; each session staff choose is recorded as excused on its register on
 * the person's own word, through the ticket's write
 * (`src/lib/courses/cantMakeIt/seat.ts`), dated when they gave the answer;
 * and one `courseAudit` row says who did it, to whom, and which sessions,
 * without the person's words. Nobody is emailed.
 *
 * NOR A SESSION AN ADMIN HAS A REQUEST ABOUT. A session whose request to be
 * excused waits, or was declined, is an admin's to decide (`excuseHoldsIn`,
 * as the person's own two doors ask it): ticking it here would excuse them
 * past a decision staff cannot make, so the press is refused.
 *
 * WHAT IT NEVER DOES. It adds and never takes away: a session the person
 * already told us about is kept, and listed; nothing they said themselves is
 * taken back. It changes only an answer of `cant` about the group the seat
 * is in now, on a learner's seat still taking part (`currentTimeAnswer`), so
 * an answer the person has changed since the screen was drawn is refused
 * rather than overwritten.
 *
 * WHO. The route decides, before calling here, by the bar every reader of the
 * answer is drawn behind (`readsTimeAnswers` in
 * `src/lib/courses/runStaffing.ts`): an admin, or the lead of the programme
 * that names the run. A run's track lead is never sent the answer, and
 * cannot change it either.
 */

/** One of the person's group's sessions still to come, as the staff form lists it. */
export type SomeWeeksSession = {
  sessionKey: string;
  weekNumber: number;
  /** "Tue 17 Nov". */
  day: string;
  /** They already told us they can't make it, and its register still says so on their word. */
  excused: boolean;
};

export type SomeWeeksRefusal = { ok: false; status: 400 | 404 | 409; error: string };

const refuse = (status: 400 | 404 | 409, error: string): SomeWeeksRefusal => ({ ok: false, status, error });

/**
 * A seat whose answer may be read as some weeks, and the group it is about;
 * or why not. Only a seat Publish has told can hold an answer (the person's
 * own write asks it, and every move clears both), and it is asked again here
 * so nothing acts on a placement before Publish has.
 */
function whoseAnswer(
  seat: CourseEnrolmentDoc | null,
  group: CourseGroupDoc | null,
  runId: string,
): { ok: true; answer: TimeAnswerView } | SomeWeeksRefusal {
  if (!seat || seat.runId !== runId || seat.role !== "learner" || seat.status !== "active" || !seat.groupId) {
    return refuse(404, SOME_WEEKS_REFUSAL.noSeat);
  }
  if (!placementIsTold(seat)) return refuse(404, SOME_WEEKS_REFUSAL.noSeat);
  if (!group || group.id !== seat.groupId || group.runId !== runId || group.archived) return refuse(404, SOME_WEEKS_REFUSAL.noSeat);
  const answer = currentTimeAnswer(seat, timeQuestionSinceOf(group));
  if (answer?.kind !== "cant") return refuse(409, SOME_WEEKS_REFUSAL.notCant);
  return { ok: true, answer };
}

/** The sessions still to come, as the form lists them. */
function listed(lines: readonly SessionLine[]): SomeWeeksSession[] {
  return stillToCome(lines).map((line) => ({
    sessionKey: line.session.sessionKey,
    weekNumber: line.session.weekNumber,
    day: sessionDay(line.session),
    excused: line.state.kind === "told",
  }));
}

/**
 * What the staff form offers for one person: their group's sessions still to
 * come, each with whether they already told us they can't make it. Refused
 * unless their answer is still "No, I need a different time" about the
 * group they are in. The run is the route's, already read and gated.
 */
export async function someWeeksFor(
  db: Firestore,
  input: { run: CourseRunDoc; uid: string; now: Date },
): Promise<{ ok: true; sessions: SomeWeeksSession[] } | SomeWeeksRefusal> {
  const seatSnap = await db.collection("courseEnrolments").doc(courseEnrolmentId(input.run.id, input.uid)).get();
  const seat = seatSnap.exists ? normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {}) : null;
  const groupSnap = seat?.groupId ? await db.collection("courseGroups").doc(seat.groupId).get() : null;
  const group = groupSnap?.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
  const whose = whoseAnswer(seat, group, input.run.id);
  if (!whose.ok) return whose;
  if (!seat || !group) return refuse(404, SOME_WEEKS_REFUSAL.noSeat);
  const lines = await readSessionLinesNow(db, {
    run: input.run,
    group,
    uid: seat.uid,
    sessions: resolveSessions(input.run, group),
    now: input.now,
  });
  return { ok: true, sessions: listed(lines) };
}

/** Why one chosen session cannot be recorded, in staff's words. */
const CLOSED_FOR_STAFF = {
  started: SOME_WEEKS_REFUSAL.started,
  cancelled: SOME_WEEKS_REFUSAL.cancelled,
  undated: SOME_WEEKS_REFUSAL.noSession,
  finished: SOME_WEEKS_REFUSAL.finished,
  notHeld: SOME_WEEKS_REFUSAL.notHeld,
} as const;

/**
 * The one write, read again inside its transaction: the run, the person's
 * seat, their group and every register of the group. `sessionKeys` are the
 * sessions staff chose; none is allowed (the week they meant may be over).
 */
export async function recordSomeWeeks(
  db: Firestore,
  input: { actor: SessionUser; runId: string; uid: string; sessionKeys: readonly string[]; now: Date },
): Promise<{ ok: true; answer: TimeAnswerView } | SomeWeeksRefusal> {
  const runRef = db.collection("courseRuns").doc(input.runId);
  const seatRef = db.collection("courseEnrolments").doc(courseEnrolmentId(input.runId, input.uid));
  return db.runTransaction(async (tx) => {
    const [runSnap, seatSnap] = await Promise.all([tx.get(runRef), tx.get(seatRef)]);
    if (!runSnap.exists || runSnap.data()?.destroying === true) return refuse(404, SOME_WEEKS_REFUSAL.noRun);
    const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
    const seat = seatSnap.exists ? normalizeCourseEnrolment(seatSnap.id, seatSnap.data() ?? {}) : null;
    const groupSnap = seat?.groupId ? await tx.get(db.collection("courseGroups").doc(seat.groupId)) : null;
    const group = groupSnap?.exists ? normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {}) : null;
    const whose = whoseAnswer(seat, group, run.id);
    if (!whose.ok) return whose;
    if (!seat?.groupId || !group || seat.timeAnswer?.kind !== "cant") return refuse(409, SOME_WEEKS_REFUSAL.notCant);
    const stored = seat.timeAnswer;

    const sessions = resolveSessions(run, group);
    const known = new Set(sessions.map((session) => session.sessionKey));
    if (!input.sessionKeys.every((key) => known.has(key))) return refuse(400, SOME_WEEKS_REFUSAL.noSession);
    const lines = await readSessionLines(tx, db, { run, group, uid: seat.uid, sessions, now: input.now });
    const chosen = new Set(input.sessionKeys);
    const holdOf = chosen.size > 0 ? await excuseHoldsIn(tx, db, seat.uid, run.id) : () => null;

    // Everything decided before anything is written.
    for (const line of lines) {
      if (!chosen.has(line.session.sessionKey)) continue;
      const day = sessionDay(line.session);
      if (line.state.kind === "closed") return refuse(409, sessionRefusalWords(day, CLOSED_FOR_STAFF[line.state.why]));
      if (line.state.kind === "marked") return refuse(409, sessionRefusalWords(day, SOME_WEEKS_REFUSAL.marked));
      if (line.state.kind === "open" && holdOf(line.session.sessionKey) !== null) {
        return refuse(409, sessionRefusalWords(day, SOME_WEEKS_REFUSAL.withAnAdmin));
      }
      if (line.state.kind === "open" && !registerHasRoom(line)) return refuse(409, sessionRefusalWords(day, SOME_WEEKS_REFUSAL.full));
    }

    // On their own word, as they gave it: dated when they answered. A session
    // they told us about themselves is theirs already, and is left as it is.
    const told = stored.at ?? FieldValue.serverTimestamp();
    const recorded: SessionLine[] = [];
    for (const line of lines) {
      if (!chosen.has(line.session.sessionKey) || line.state.kind !== "open") continue;
      writeExcusedInAdvance(tx, line, { run, group, uid: seat.uid, told });
      recorded.push(line);
    }
    // The answer lists every session still to come they can't make: the ones
    // chosen, and any they had already told us about themselves.
    const already = stillToCome(lines).filter((line) => line.state.kind === "told");
    const sessionKeys = orderedSessionKeys([...input.sessionKeys, ...already.map((line) => line.session.sessionKey)]);
    const answer: TimeAnswerView = {
      kind: "mostWeeks",
      reason: stored.reason,
      alternatives: stored.alternatives,
      sessionKeys,
    };
    tx.update(seatRef, {
      timeAnswer: { ...answer, forGroupId: seat.groupId, at: stored.at ?? FieldValue.serverTimestamp() },
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.set(db.collection(COURSE_AUDIT_COLLECTION).doc(), {
      kind: "time-answer-changed",
      runId: run.id,
      groupId: group.id,
      subjectUid: seat.uid,
      actorUid: input.actor.uid,
      actorName: input.actor.displayName ?? "",
      targetLabel: CARD_TITLE,
      detail: someWeeksAuditDetail(
        recorded.map((line) => ({ weekNumber: line.session.weekNumber, day: sessionDay(line.session) })),
      ),
      at: FieldValue.serverTimestamp(),
    });
    return { ok: true, answer };
  });
}
