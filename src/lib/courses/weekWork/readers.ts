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
import { readPackCaseRecords, recordBlocksOf } from "@/lib/courses/packsAndCases/readers";
import type { WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { instantOf, isWordCountedAnswer } from "@/lib/courses/writtenAnswers/model";
import { boxIsWritten, isOwnBoxResponse } from "@/lib/firestore/courseExercises";
import { workClosesAt } from "./closes";
import { NO_GROUP, groupSessionAt, weekDueEndsAt, weekDueOf, type SessionSource, type WeekDue } from "./sessionDue";
import {
  personWeekProgress,
  submittedOnce,
  weekWorkState,
  weekWorkWire,
  weekWritingNeeds,
  type CheckState,
  type DoneTimes,
  type PersonWeekProgress,
  type WeekWorkState,
  type WeekWorkWire,
} from "./model";

/**
 * THE READS BEHIND WHERE A WEEK STANDS, on the server, each after its
 * caller's own gate: one person's week for their own pages, and everybody's
 * on a run for the pages that list people. `./model.ts` decides; this file
 * reads what it decides from.
 *
 * Every query is one equality on `runId`, filtered in memory, so nothing
 * needs a declared index.
 */

/**
 * WHOSE SESSIONS THIS PERSON'S WEEK GOES BY (`./sessionDue.ts`): their
 * placement's group when it is a live group and Publish has told them it (an
 * admin's view of a placement never counts: the session is the person's
 * own), told at `allocatedEmailAt`, or when they took the seat themselves;
 * otherwise each live group they facilitate; otherwise none.
 */
export function sessionSourceFor(
  run: CourseRunDoc,
  liveGroups: readonly CourseGroupDoc[],
  uid: string,
  enrolment: CourseEnrolmentDoc | null,
  sessionsOf: (group: CourseGroupDoc) => readonly ResolvedSession[] = (group) => resolveSessions(run, group),
): SessionSource {
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

/** Everybody's stored weeks on a run, by uid and then week id. */
export type RunWeekWork = Map<string, Map<string, CourseWeekWorkDoc>>;

/** Everybody's stored weeks on a run, by uid and then week id. One equality on the run. */
export async function readRunWeekWork(db: Firestore, runId: string): Promise<RunWeekWork> {
  const snap = await db.collection(COURSE_WEEK_WORK_COLLECTION).where("runId", "==", runId).get();
  return runWeekWorkOf(snap.docs, runId);
}

/**
 * The stored weeks of a run from documents a caller has read already (one
 * equality on the run), each as every reader of a person's own record reads it
 * (`normalizeCourseWeekWork`); a document that is not the run's is left out.
 */
export function runWeekWorkOf(docs: ReadonlyArray<{ id: string; data: () => Record<string, unknown> | undefined }>, runId: string): RunWeekWork {
  const out: RunWeekWork = new Map();
  for (const doc of docs) {
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
 * week asked about, by its id, with the session they are due at, when the
 * programme closes, and when they pressed the week's old Submit. Their own
 * records alone, by address.
 */
export async function ownWeekWires(
  db: Firestore,
  input: {
    runId: string;
    uid: string;
    weeks: ReadonlyArray<{ id: string; weekNumber: number }>;
    source: SessionSource;
    closesAt: Date | null;
    now: Date;
  },
): Promise<Map<string, WeekWorkWire>> {
  const out = new Map<string, WeekWorkWire>();
  if (input.weeks.length === 0) return out;
  const snaps = await db.getAll(
    ...input.weeks.map((week) => db.collection(COURSE_WEEK_WORK_COLLECTION).doc(courseWeekWorkId(input.runId, input.uid, week.id))),
  );
  input.weeks.forEach((week, index) => {
    const snap = snaps[index];
    const record = snap.exists ? normalizeCourseWeekWork(snap.id, snap.data() ?? {}) : null;
    const state = weekWorkState({
      due: weekDueOf(input.source, week.weekNumber),
      closesAt: input.closesAt,
      facts: record && record.uid === input.uid ? record : null,
      now: input.now,
    });
    out.set(week.id, weekWorkWire(state, input.now));
  });
  return out;
}

/**
 * WHAT EACH OF SOME PEOPLE HAS DONE OF ONE WEEK WRITTEN AS BLOCKS, as the
 * check before Send reads a person's own week (`CheckState`), and when each
 * thing was done (`DoneTimes`, for when the week became done): which readings
 * and steps they ticked, which boxes they wrote in, which written answers are
 * sent and how many words each holds, their pack and their ready mark, and
 * whether they have touched the week at all. Read on the server after the
 * caller's own gate, as counts and times and nothing else: the week's rows of
 * the answers store by who, which item and when (never a word), its ticks by
 * who, which item and when, and each person's pack and ready mark by address.
 */
export type PersonWeekFacts = {
  state: CheckState;
  times: DoneTimes;
  touched: boolean;
  /**
   * When a reflection box or fill-in box holding something was last saved,
   * for a staff page's "Started, saved Tue 3 Nov"; null for one empty or not
   * saying. Never asked of a written answer: before the session its readers
   * see only that it was started (privacy v17).
   */
  savedAt: (boxId: string) => Date | null;
};

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
    // Who wrote in which box, when, and which answers are sent: never a word.
    db
      .collection("courseExerciseResponses")
      .where("runId", "==", runId)
      .where("weekNumber", "==", weekNumber)
      .select("uid", "exerciseId", "kind", "words", "firstSentAt", "firstWrittenAt", "updatedAt", "emptiedAt", "runId")
      .get(),
    // The projection is the boundary: who, which item, whether it is ticked and when.
    db
      .collection("courseProgress")
      .where("runId", "==", runId)
      .where("weekNumber", "==", weekNumber)
      .select("uid", "itemId", "completed", "completedAt")
      .get(),
    readPackCaseRecords(
      db,
      runId,
      [...uids].flatMap((uid) => recordBlocks.map((block) => ({ uid, blockId: block.id }))),
    ),
  ]);
  type Facts = {
    written: Map<string, Date | null>;
    saved: Map<string, Date | null>;
    sent: Map<string, Date>;
    words: Map<string, number>;
    ticked: Map<string, Date | null>;
    touched: boolean;
  };
  const facts = new Map<string, Facts>();
  const of = (uid: string) => {
    let found = facts.get(uid);
    if (!found) {
      found = { written: new Map(), saved: new Map(), sent: new Map(), words: new Map(), ticked: new Map(), touched: false };
      facts.set(uid, found);
    }
    return found;
  };
  for (const doc of rows.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const id = typeof data.exerciseId === "string" ? data.exerciseId : "";
    if (!uids.has(uid) || !id || data.runId !== runId) continue;
    if (isOwnBoxResponse(data)) {
      // A box holds something while its row does, unless the row is kept only for an earlier version.
      if (!boxIsWritten(data)) continue;
      of(uid).written.set(id, instantOf(data.firstWrittenAt) ?? instantOf(data.updatedAt));
      of(uid).saved.set(id, instantOf(data.updatedAt) ?? instantOf(data.firstWrittenAt));
      of(uid).touched = true;
    } else if (isWordCountedAnswer(data)) {
      const sentAt = instantOf(data.firstSentAt);
      if (sentAt) of(uid).sent.set(id, sentAt);
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
    of(uid).ticked.set(itemId, instantOf(data.completedAt));
    of(uid).touched = true;
  }
  for (const uid of uids) {
    const own = of(uid);
    const record = (blockId: string) => records.get(`${uid} ${blockId}`) ?? null;
    if (recordBlocks.some((block) => record(block.id)?.packId || record(block.id)?.ready)) own.touched = true;
    const packOf = (id: string) => record(id)?.packId ?? null;
    out.set(uid, {
      state: {
        isTicked: (id) => own.ticked.has(id),
        isWritten: (id) => own.written.has(id),
        isSent: (id) => own.sent.has(id),
        packOf,
        isReady: (id) => record(id)?.ready === true,
        // Counts only: no word of an answer is read here, so an answer in
        // boxes with words in some of them reads as having none empty.
        answerOf: (id) => ({ words: own.words.get(id) ?? 0, emptyBoxes: 0 }),
      },
      times: {
        tickedAt: (id) => own.ticked.get(id) ?? null,
        writtenAt: (id) => own.written.get(id) ?? null,
        sentAt: (id) => own.sent.get(id) ?? null,
        packOf,
      },
      touched: own.touched,
      savedAt: (id) => own.saved.get(id) ?? null,
    });
  }
  return out;
}

/**
 * HOW FAR EACH OF SOME PEOPLE HAS GOT WITH ONE WEEK WRITTEN AS BLOCKS, by the
 * one count every page uses (`personWeekProgress`): This week's tasks done,
 * whether the week is done and when it became done, and whether they have
 * started it, from what `loadPeopleWeekFacts` reads. `submittedAt` says when
 * somebody pressed the week's old Submit (`RunWeekStates.submittedOf`).
 */
export async function loadPeopleWeekProgress(
  db: Firestore,
  input: {
    runId: string;
    weekNumber: number;
    blocks: readonly WeekBlock[];
    uids: readonly string[];
    submittedAt: (uid: string) => Date | null;
  },
): Promise<Map<string, PersonWeekProgress>> {
  const out = new Map<string, PersonWeekProgress>();
  const facts = await loadPeopleWeekFacts(db, input);
  const tasks = weekTaskNeeds(input.blocks);
  const asks = weekWritingNeeds(input.blocks);
  for (const [uid, own] of facts) {
    out.set(
      uid,
      personWeekProgress({ tasks, state: own.state, times: own.times, submittedAt: input.submittedAt(uid), touched: own.touched, asks }),
    );
  }
  return out;
}

/** Where every week of every person on a run stands, and the session each is due at. */
export type RunWeekStates = {
  /** When the run closes for work, or null when it never closes by the clock. */
  closesAt: Date | null;
  stateOf: (uid: string, weekNumber: number) => WeekWorkState;
  /** The session the person is due at that week (`./sessionDue.ts`). */
  dueOf: (uid: string, weekNumber: number) => WeekDue;
  /** When that same session ends (`weekDueEndsAt`), or null with none. */
  dueEndOf: (uid: string, weekNumber: number) => Date | null;
  recordOf: (uid: string, weekNumber: number) => CourseWeekWorkDoc | null;
  /** When they first pressed the week's old Submit, or null. */
  submittedOf: (uid: string, weekNumber: number) => Date | null;
  /**
   * When the person's group's session that week starts, whenever they were
   * told their group: null with none to date. What "Feedback to write"
   * counts from.
   */
  sessionOf: (uid: string, weekNumber: number) => Date | null;
};

function weekIdOf(weekNumber: number): string {
  return `w${String(weekNumber).padStart(2, "0")}`;
}

/**
 * EVERYBODY'S WEEKS ON A RUN, for a page that lists people: the run's stored
 * weeks (one equality on the run) and its seats, each unless the caller has
 * read them already. Each person's sessions are resolved once per group.
 */
export async function loadRunWeekStates(
  db: Firestore,
  input: {
    run: CourseRunDoc;
    liveGroups: readonly CourseGroupDoc[];
    enrolments?: readonly CourseEnrolmentDoc[] | null;
    /** The run's stored weeks, when the caller has read them already (`runWeekWorkOf`): not read again. */
    records?: RunWeekWork | null;
    now: Date;
  },
): Promise<RunWeekStates> {
  const { run, liveGroups, now } = input;
  const [records, enrolments] = await Promise.all([
    input.records ? Promise.resolve(input.records) : readRunWeekWork(db, run.id),
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
  const sources = new Map<string, SessionSource>();
  const sourceOf = (uid: string) => {
    let source = sources.get(uid);
    if (!source) {
      source = sessionSourceFor(run, liveGroups, uid, seatOf.get(uid) ?? null, sessionsOf);
      sources.set(uid, source);
    }
    return source;
  };
  const closesAt = workClosesAt(run, liveGroups);
  const recordOf = (uid: string, weekNumber: number) => records.get(uid)?.get(weekIdOf(weekNumber)) ?? null;
  const dueOf = (uid: string, weekNumber: number) => weekDueOf(sourceOf(uid), weekNumber);
  return {
    closesAt,
    stateOf: (uid, weekNumber) => weekWorkState({ due: dueOf(uid, weekNumber), closesAt, facts: recordOf(uid, weekNumber), now }),
    dueOf,
    dueEndOf: (uid, weekNumber) => weekDueEndsAt(sourceOf(uid), weekNumber),
    recordOf,
    submittedOf: (uid, weekNumber) => submittedOnce(recordOf(uid, weekNumber)),
    sessionOf: (uid, weekNumber) => groupSessionAt(sourceOf(uid), weekNumber),
  };
}
