import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveSessions, type ResolvedSession } from "@/lib/courses/sessions";
import {
  normalizeCourseEnrolment,
  placementIsTold,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import {
  COURSE_WEEK_WORK_COLLECTION,
  courseWeekWorkId,
  normalizeCourseWeekWork,
  type CourseWeekWorkDoc,
} from "@/lib/firestore/courseWeekWork";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { readPackCaseRecords, recordBlocksOf } from "@/lib/courses/packsAndCases/readers";
import type { WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { instantOf, isWordCountedAnswer } from "@/lib/courses/writtenAnswers/model";
import { isOwnBoxResponse } from "@/lib/firestore/courseExercises";
import { NO_GROUP, weekLockOf, weekStateOf, type LockSource } from "./lock";
import {
  personWeekProgress,
  weekAsksForWriting,
  weekWorkWire,
  type CheckState,
  type PersonWeekProgress,
  type WeekLock,
  type WeekWorkState,
  type WeekWorkWire,
} from "./model";

/**
 * THE READS BEHIND WHERE A WEEK STANDS, on the server, each after its
 * caller's own gate: one person's week for the routes that write it, and
 * everybody's on a run for the pages that list people. `./model.ts` decides;
 * this file reads what it decides from.
 *
 * Every query is one equality on `runId`, filtered in memory, so nothing
 * needs a declared index.
 */

/**
 * WHOSE SESSIONS LOCK THIS PERSON'S WEEK (`./lock.ts`): their placement's
 * group when it is a live group and Publish has told them it (an admin's
 * view of a placement never counts: the lock is the person's own), told at
 * `allocatedEmailAt`, or when they took the seat themselves; otherwise each
 * live group they facilitate; otherwise none.
 */
export function lockSourceFor(
  run: CourseRunDoc,
  liveGroups: readonly CourseGroupDoc[],
  uid: string,
  enrolment: CourseEnrolmentDoc | null,
  sessionsOf: (group: CourseGroupDoc) => readonly ResolvedSession[] = (group) => resolveSessions(run, group),
): LockSource {
  const placed =
    enrolment !== null &&
    enrolment.uid === uid &&
    enrolment.role === "learner" &&
    (enrolment.status === "active" || enrolment.status === "completed") &&
    enrolment.groupId !== null &&
    placementIsTold(enrolment)
      ? (liveGroups.find((group) => group.id === enrolment.groupId) ?? null)
      : null;
  if (placed && enrolment) {
    const toldAt = enrolment.selfEnrolled ? (enrolment.createdAt ?? null) : (enrolment.allocatedEmailAt ?? null);
    return { sessionLists: [sessionsOf(placed)], toldAt };
  }
  const facilitated = liveGroups.filter((group) => group.facilitatorUids.includes(uid));
  if (facilitated.length > 0) return { sessionLists: facilitated.map((group) => sessionsOf(group)), toldAt: null };
  return NO_GROUP;
}

/** One person's stored week, by its address; null before they first submit it. */
export async function readWeekWork(db: Firestore, runId: string, uid: string, weekId: string): Promise<CourseWeekWorkDoc | null> {
  const snap = await db.collection(COURSE_WEEK_WORK_COLLECTION).doc(courseWeekWorkId(runId, uid, weekId)).get();
  return snap.exists ? normalizeCourseWeekWork(snap.id, snap.data() ?? {}) : null;
}

/** Everybody's stored weeks on a run, by uid and then week id. One equality on the run. */
export async function readRunWeekWork(db: Firestore, runId: string): Promise<Map<string, Map<string, CourseWeekWorkDoc>>> {
  const snap = await db.collection(COURSE_WEEK_WORK_COLLECTION).where("runId", "==", runId).get();
  const out = new Map<string, Map<string, CourseWeekWorkDoc>>();
  for (const doc of snap.docs) {
    const record = normalizeCourseWeekWork(doc.id, doc.data() ?? {});
    if (record.runId !== runId || !record.uid || !record.weekId) continue;
    const own = out.get(record.uid) ?? new Map<string, CourseWeekWorkDoc>();
    own.set(record.weekId, record);
    out.set(record.uid, own);
  }
  return out;
}

/**
 * ONE PERSON'S OWN WEEKS, as the overview hands them to their pages: each
 * week asked about, by its id, with where it stands and, when somebody
 * reopened it, that person's first name. Their own records alone, by address.
 */
export async function ownWeekWires(
  db: Firestore,
  input: { runId: string; uid: string; weeks: ReadonlyArray<{ id: string; weekNumber: number }>; source: LockSource; now: Date },
): Promise<Map<string, WeekWorkWire>> {
  const out = new Map<string, WeekWorkWire>();
  if (input.weeks.length === 0) return out;
  const snaps = await db.getAll(
    ...input.weeks.map((week) => db.collection(COURSE_WEEK_WORK_COLLECTION).doc(courseWeekWorkId(input.runId, input.uid, week.id))),
  );
  const states = input.weeks.map((week, index) => {
    const snap = snaps[index];
    const record = snap.exists ? normalizeCourseWeekWork(snap.id, snap.data() ?? {}) : null;
    return weekStateOf(input.source, week.weekNumber, record && record.uid === input.uid ? record : null, input.now);
  });
  const reopeners = [...new Set(states.flatMap((state) => (state.kind === "reopened" && state.byUid ? [state.byUid] : [])))];
  const names = new Map<string, string>();
  for (const snap of reopeners.length ? await db.getAll(...reopeners.map((uid) => db.collection("users").doc(uid))) : []) {
    if (snap.exists) names.set(snap.id, firstNameOfUser(snap.data() ?? {}));
  }
  input.weeks.forEach((week, index) => {
    out.set(week.id, weekWorkWire(states[index], (uid) => names.get(uid) || "Your facilitator"));
  });
  return out;
}

/**
 * WHAT EACH OF SOME PEOPLE HAS DONE OF ONE WEEK WRITTEN AS BLOCKS, as the
 * check before Submit reads a person's own week (`CheckState`): which
 * readings and steps they ticked, which boxes they wrote in, which written
 * answers are sent and how many words each holds, their pack and their ready
 * mark, and whether they have touched the week at all. Read on the server
 * after the caller's own gate, as counts and nothing else: the week's rows of
 * the answers store by who and which item (never a word), its ticks by who
 * and which item, and each person's pack and ready mark by address.
 */
export type PersonWeekFacts = { state: CheckState; touched: boolean };

export async function loadPeopleWeekFacts(
  db: Firestore,
  input: {
    runId: string;
    weekNumber: number;
    blocks: readonly WeekBlock[];
    uids: readonly string[];
  },
): Promise<Map<string, PersonWeekFacts>> {
  const { runId, weekNumber, blocks } = input;
  const uids = new Set(input.uids);
  const out = new Map<string, PersonWeekFacts>();
  if (uids.size === 0) return out;
  const recordBlocks = recordBlocksOf(blocks);
  const [rows, ticks, records] = await Promise.all([
    // Who wrote in which box and which answers are sent: never a word.
    db
      .collection("courseExerciseResponses")
      .where("runId", "==", runId)
      .where("weekNumber", "==", weekNumber)
      .select("uid", "exerciseId", "kind", "words", "firstSentAt", "runId")
      .get(),
    // The projection is the boundary: who, which item and whether it is ticked.
    db
      .collection("courseProgress")
      .where("runId", "==", runId)
      .where("weekNumber", "==", weekNumber)
      .select("uid", "itemId", "completed")
      .get(),
    readPackCaseRecords(
      db,
      runId,
      [...uids].flatMap((uid) => recordBlocks.map((block) => ({ uid, blockId: block.id }))),
    ),
  ]);
  type Facts = { written: Set<string>; sent: Set<string>; words: Map<string, number>; ticked: Set<string>; touched: boolean };
  const facts = new Map<string, Facts>();
  const of = (uid: string) => {
    let found = facts.get(uid);
    if (!found) {
      found = { written: new Set(), sent: new Set(), words: new Map(), ticked: new Set(), touched: false };
      facts.set(uid, found);
    }
    return found;
  };
  for (const doc of rows.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const id = typeof data.exerciseId === "string" ? data.exerciseId : "";
    if (!uids.has(uid) || !id || data.runId !== runId) continue;
    // A box's row exists only while it holds something: an emptied box deletes it.
    if (isOwnBoxResponse(data)) {
      of(uid).written.add(id);
      of(uid).touched = true;
    } else if (isWordCountedAnswer(data)) {
      if (instantOf(data.firstSentAt)) of(uid).sent.add(id);
      if (typeof data.words === "number" && data.words > 0) {
        of(uid).words.set(id, Math.floor(data.words));
        of(uid).touched = true;
      }
    }
  }
  for (const doc of ticks.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const itemId = typeof data.itemId === "string" ? data.itemId : "";
    if (data.completed !== true || !uids.has(uid) || !itemId) continue;
    of(uid).ticked.add(itemId);
    of(uid).touched = true;
  }
  for (const uid of uids) {
    const own = of(uid);
    const record = (blockId: string) => records.get(`${uid} ${blockId}`) ?? null;
    if (recordBlocks.some((block) => record(block.id)?.packId || record(block.id)?.ready)) own.touched = true;
    out.set(uid, {
      state: {
        isTicked: (id) => own.ticked.has(id),
        isWritten: (id) => own.written.has(id),
        isSent: (id) => own.sent.has(id),
        packOf: (id) => record(id)?.packId ?? null,
        isReady: (id) => record(id)?.ready === true,
        // Counts only: no word of an answer is read here, so an answer in
        // boxes with words in some of them reads as having none empty.
        answerOf: (id) => ({ words: own.words.get(id) ?? 0, emptyBoxes: 0 }),
      },
      touched: own.touched,
    });
  }
  return out;
}

/**
 * HOW FAR EACH OF SOME PEOPLE HAS GOT WITH ONE WEEK WRITTEN AS BLOCKS, by the
 * one count every page uses (`personWeekProgress`): This week's tasks done,
 * whether the week is done, and whether they have started it, from what
 * `loadPeopleWeekFacts` reads. `submitted` says whose week is submitted
 * (`loadRunWeekStates`).
 */
export async function loadPeopleWeekProgress(
  db: Firestore,
  input: {
    runId: string;
    weekNumber: number;
    blocks: readonly WeekBlock[];
    uids: readonly string[];
    submitted: (uid: string) => boolean;
  },
): Promise<Map<string, PersonWeekProgress>> {
  const out = new Map<string, PersonWeekProgress>();
  const facts = await loadPeopleWeekFacts(db, input);
  const tasks = weekTaskNeeds(input.blocks);
  const writes = weekAsksForWriting(input.blocks);
  for (const [uid, own] of facts) {
    out.set(
      uid,
      personWeekProgress({ tasks, state: own.state, writes, submitted: input.submitted(uid), touched: own.touched }),
    );
  }
  return out;
}

/** Where every week of every person on a run stands, and when each locks. */
export type RunWeekStates = {
  stateOf: (uid: string, weekNumber: number) => WeekWorkState;
  lockOf: (uid: string, weekNumber: number) => WeekLock;
  recordOf: (uid: string, weekNumber: number) => CourseWeekWorkDoc | null;
  /**
   * When the person's group's session that week starts (the lock's own
   * moment, `dueMoment`'s "before" rule), whenever they were told their
   * group: null with none to date. What "Feedback to write" counts from.
   */
  sessionOf: (uid: string, weekNumber: number) => Date | null;
};

function weekIdOf(weekNumber: number): string {
  return `w${String(weekNumber).padStart(2, "0")}`;
}

/**
 * EVERYBODY'S WEEKS ON A RUN, for a page that lists people: the run's stored
 * weeks (one equality on the run), and its seats unless the caller has read
 * them already. Each person's sessions are resolved once per group.
 */
export async function loadRunWeekStates(
  db: Firestore,
  input: { run: CourseRunDoc; liveGroups: readonly CourseGroupDoc[]; enrolments?: readonly CourseEnrolmentDoc[] | null; now: Date },
): Promise<RunWeekStates> {
  const { run, liveGroups, now } = input;
  const [records, enrolments] = await Promise.all([
    readRunWeekWork(db, run.id),
    input.enrolments
      ? Promise.resolve(input.enrolments)
      : db
          .collection("courseEnrolments")
          .where("runId", "==", run.id)
          .get()
          .then((snap) => snap.docs.map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))),
  ]);
  const seatOf = new Map<string, CourseEnrolmentDoc>();
  for (const seat of enrolments) if (seat.runId === run.id && seat.uid) seatOf.set(seat.uid, seat);
  const sessionsByGroup = new Map<string, readonly ResolvedSession[]>();
  const sessionsOf = (group: CourseGroupDoc) => {
    let sessions = sessionsByGroup.get(group.id);
    if (!sessions) {
      sessions = resolveSessions(run, group);
      sessionsByGroup.set(group.id, sessions);
    }
    return sessions;
  };
  const sources = new Map<string, LockSource>();
  const sourceOf = (uid: string) => {
    let source = sources.get(uid);
    if (!source) {
      source = lockSourceFor(run, liveGroups, uid, seatOf.get(uid) ?? null, sessionsOf);
      sources.set(uid, source);
    }
    return source;
  };
  const recordOf = (uid: string, weekNumber: number) => records.get(uid)?.get(weekIdOf(weekNumber)) ?? null;
  return {
    stateOf: (uid, weekNumber) => weekStateOf(sourceOf(uid), weekNumber, recordOf(uid, weekNumber), now),
    lockOf: (uid, weekNumber) => weekLockOf(sourceOf(uid), weekNumber),
    recordOf,
    sessionOf: (uid, weekNumber) => weekLockOf({ ...sourceOf(uid), toldAt: null }, weekNumber).at,
  };
}
