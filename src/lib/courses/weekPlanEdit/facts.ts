import "server-only";
import type { Firestore, Query, Transaction } from "firebase-admin/firestore";
import { formRef } from "@/lib/applications/repo";
import { own } from "@/lib/applications/keys";
import { isApplicationForm, normaliseForm } from "@/lib/applications/normalise";
import { BEST_ANSWERS_COLLECTION, PANGRAM_CHECKS_COLLECTION } from "@/lib/courses/coursework/collections";
import { courseGuideWeekNumbers } from "@/lib/courses/facilitatorGuide/store";
import { readNamingProgramme, type NamingProgramme } from "@/lib/courses/programmeLead";
import { holdIsLive, readHold } from "@/lib/courses/weekEdit/lock";
import { WEEK_HISTORY_SUBCOLLECTION, WEEK_LOCK_SUBCOLLECTION } from "@/lib/courses/weekEdit/paths";
import { weekIsReady } from "@/lib/courses/weekReady";
import { CHECK_IN_WEEKS_COLLECTION } from "@/lib/firestore/checkInWeeks";
import { COURSE_EXPLAINERS_COLLECTION } from "@/lib/firestore/courseExplainers";
import { COURSE_FEEDBACK_COLLECTION } from "@/lib/firestore/courseFeedback";
import { COURSE_GROUP_SHARED_NOTES_COLLECTION } from "@/lib/firestore/courseGroupSharedNotes";
import { COURSE_MATERIAL_NOTES_COLLECTION } from "@/lib/firestore/courseMaterialNotes";
import { COURSE_NOTE_DRAFTS_COLLECTION } from "@/lib/firestore/courseNoteDrafts";
import { COURSE_PACKS_AND_CASES_COLLECTION } from "@/lib/firestore/coursePacksAndCases";
import { COURSE_PAIRS_COLLECTION } from "@/lib/firestore/coursePairs";
import { COURSE_REQUESTS_COLLECTION } from "@/lib/firestore/courseRequests";
import { COURSE_SESSION_REPORTS_COLLECTION } from "@/lib/firestore/courseSessionReports";
import { COURSE_WEEK_REVIEWS_COLLECTION } from "@/lib/firestore/courseWeekReviews";
import { COURSE_WEEK_WORK_COLLECTION } from "@/lib/firestore/courseWeekWork";
import { COURSE_WORK_LOG_COLLECTION } from "@/lib/firestore/courseWorkLog";
import { COURSE_WORK_RATINGS_COLLECTION } from "@/lib/firestore/courseWorkRatings";
import { normalizeCourseRun, sanitizeWeekPlan, weekDocId, type CourseRunDoc } from "@/lib/firestore/courses";
import { finalSources, touchedAddresses, type PlanChange } from "./model";
import {
  DONE_RECORDS,
  DONE_WEEK_ONE,
  DONE_WORK,
  DRIFTED_AND_DONE,
  RUN_ARCHIVED,
  RUN_CANCELLED,
  RUN_FINISHED,
  WEEK_PLAN_READ_ONLY,
  addressTakenWords,
  beingEdited,
  doneGroupWords,
  guideHolds,
  removeHasBlocks,
  removeHasHistory,
  removeHasOlderMaterial,
  tooBigWords,
} from "./words";

/**
 * WHAT DECIDES WHETHER A RUN'S WEEK PLAN MAY CHANGE, read for the Weeks tab
 * (to offer only what would be taken) and in the route's own transaction (to
 * take it), and the one judgement both ask (`judgeChange`).
 *
 * ## The owner's rule
 *
 * A week or a break is MOVED OR REMOVED only while nothing is kept against
 * the run's weeks. A break anywhere, or a week at the end, can be ADDED until
 * the groups go out. A week with blocks in it is never removed. Once the
 * groups have gone out the plan is read only.
 *
 * "Nothing is kept against the run's weeks" is asked of everything on the
 * site found by a week's number or address (`WORK_COLLECTIONS` and
 * `RECORD_COLLECTIONS`, one count on the run's id each, so nobody's row is
 * read; `tests/course-week-plan.test.mjs` holds the lists against every
 * collection that stores a week), of the run's places (a one-week visit, a
 * move from a week, an answer about the time naming sessions), of the run's
 * groups (their own copy of a week, a change to one week, how a week meets,
 * their own calendar), and of week 1's door: once decisions are sent and
 * week 1 is ready, everybody holding a place may open it.
 *
 * ## The facilitators' guide
 *
 * A week's session plan and notes for facilitators are kept on the COURSE,
 * by week number, and every run of the course reads them by number. This
 * never writes them. So a change that would give a week a new number is
 * refused whenever the guide holds anything for the old number or the new
 * one, and a week with something in the guide is never removed: a facilitator
 * of this run never reads one week's plan against another week, and a
 * facilitator of another run reads exactly what they read before.
 *
 * ## What a week's address holds
 *
 * The week's document, its saved versions (`history`) and its edit lock
 * (`editLock`), which can sit at an address with no document. A move takes
 * all of it; a removal deletes it only when the document holds no more than
 * the week's title and settings and there is no saved version.
 */

/** People's work on the run, each found by a week's number or address. */
export const WORK_COLLECTIONS = [
  "courseProgress",
  "courseExerciseResponses",
  COURSE_PACKS_AND_CASES_COLLECTION,
  COURSE_WEEK_WORK_COLLECTION,
  COURSE_WORK_LOG_COLLECTION,
  COURSE_FEEDBACK_COLLECTION,
  COURSE_WORK_RATINGS_COLLECTION,
  COURSE_PAIRS_COLLECTION,
  BEST_ANSWERS_COLLECTION,
  PANGRAM_CHECKS_COLLECTION,
] as const;

/** The run's records about its weeks: registers, reviews, notes, requests, check-ins. */
export const RECORD_COLLECTIONS = [
  "courseAttendance",
  COURSE_WEEK_REVIEWS_COLLECTION,
  COURSE_MATERIAL_NOTES_COLLECTION,
  COURSE_NOTE_DRAFTS_COLLECTION,
  COURSE_EXPLAINERS_COLLECTION,
  COURSE_SESSION_REPORTS_COLLECTION,
  COURSE_GROUP_SHARED_NOTES_COLLECTION,
  COURSE_REQUESTS_COLLECTION,
  CHECK_IN_WEEKS_COLLECTION,
] as const;

/** Every subcollection a week's address can hold. */
export const WEEK_SUBCOLLECTIONS = [WEEK_HISTORY_SUBCOLLECTION, WEEK_LOCK_SUBCOLLECTION] as const;

/** At most this many writes in one change: a transaction takes 500, and the run's own update and room to spare are kept. */
export const MAX_WRITES = 450;
/** At most this much moved in one change, by the stored data's own size: a commit takes 10 MiB. */
export const MAX_BYTES = 8_000_000;

/** Where the run stands for its week plan. */
export type PlanStanding = "open" | "gone-out" | "finished" | "cancelled" | "archived";

/** What one address holds, as the judgement needs it. */
export type AddressHolds = {
  exists: boolean;
  title: string;
  /** Blocks in it: a non-empty `blocks` list. */
  blocks: boolean;
  /** Readings, exercises, a checklist or guide blocks written before blocks. */
  older: boolean;
  history: number;
  locks: number;
  liveLock: boolean;
  /** The stored data's size, roughly, for the commit's limit; 0 where only counted. */
  bytes: number;
};

export const EMPTY_ADDRESS: AddressHolds = { exists: false, title: "", blocks: false, older: false, history: 0, locks: 0, liveLock: false, bytes: 0 };

export type PlanFacts = {
  standing: PlanStanding;
  /** Why weeks and breaks stay where they are, or null while nothing is kept against the run's weeks. */
  done: string | null;
  /** Anybody holds a place on the run or is on its list, for the removal question's second line. */
  anybodyOnRun: boolean;
  /** The week numbers the course's guide holds a session plan or notes for. */
  guideWeeks: ReadonlySet<number>;
  /** Groups that keep their own calendar, which the run's plan does not reach. */
  ownCalendars: string[];
  /** What each address holds, for every address a judgement may ask about. */
  holds: (address: string) => AddressHolds;
};

/** Where the run stands, from its stored document. */
export function standingOf(raw: Record<string, unknown>, run: CourseRunDoc): PlanStanding {
  if (raw.allocationPublishedAt != null) return "gone-out";
  if (run.status === "completed") return "finished";
  if (run.status === "cancelled") return "cancelled";
  if (run.archived) return "archived";
  return "open";
}

/** The refusal for a run whose plan cannot change at all, or null. */
export function standingRefusal(standing: PlanStanding): string | null {
  if (standing === "gone-out") return WEEK_PLAN_READ_ONLY;
  if (standing === "finished") return RUN_FINISHED;
  if (standing === "cancelled") return RUN_CANCELLED;
  if (standing === "archived") return RUN_ARCHIVED;
  return null;
}

function nonEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}
function nonEmptyMap(value: unknown): boolean {
  return value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

/** What a week document holds, read from its stored data. */
export function docHolds(data: Record<string, unknown> | undefined): Pick<AddressHolds, "exists" | "title" | "blocks" | "older"> {
  if (!data) return { exists: false, title: "", blocks: false, older: false };
  return {
    exists: true,
    title: typeof data.title === "string" ? data.title.trim() : "",
    blocks: nonEmptyList(data.blocks),
    older: ["guideBlocks", "materials", "exercises", "checklist"].some((field) => nonEmptyList(data[field])),
  };
}

/**
 * Why weeks and breaks must stay where they are, or null, and whether anybody
 * is on the run. `tx` given, every read is the transaction's, so a tick that
 * lands before the route's commit is counted.
 */
export async function readDone(
  db: Firestore,
  run: CourseRunDoc,
  naming: NamingProgramme,
  tx?: Transaction,
): Promise<{ done: string | null; anybodyOnRun: boolean; ownCalendars: string[] }> {
  const get = (query: Query) => (tx ? tx.get(query) : query.get());
  const count = async (collection: string) => {
    const aggregate = db.collection(collection).where("runId", "==", run.id).count();
    const snap = tx ? await tx.get(aggregate) : await aggregate.get();
    return snap.data().count;
  };
  const weekOneRef = db.collection("courseRuns").doc(run.id).collection("weeks").doc(weekDocId(1));
  const [work, records, places, groups, applications, formSnap, weekOne] = await Promise.all([
    Promise.all(WORK_COLLECTIONS.map(count)),
    Promise.all(RECORD_COLLECTIONS.map(count)),
    get(db.collection("courseEnrolments").where("runId", "==", run.id)),
    get(db.collection("courseGroups").where("runId", "==", run.id)),
    count("courseApplications"),
    tx ? tx.get(formRef(db, naming.roundId)) : formRef(db, naming.roundId).get(),
    tx ? tx.get(weekOneRef) : weekOneRef.get(),
  ]);

  const formData = formSnap.exists ? formSnap.data() : undefined;
  const form = formData && isApplicationForm(formData) ? normaliseForm(formSnap.id, formData) : null;
  const decisionsSent = form?.decisionsSentAt != null;

  const groupDocs = groups.docs.map((doc) => ({ ref: doc.ref, data: (doc.data() ?? {}) as Record<string, unknown> }));
  const copies = await Promise.all(groupDocs.map((group) => get(group.ref.collection("weeks").limit(1))));
  const ownCalendars: string[] = [];
  let changedGroup: string | null = null;
  groupDocs.forEach((group, i) => {
    const name = typeof group.data.name === "string" && group.data.name.trim() ? group.data.name.trim() : "A group";
    const ownCalendar = nonEmptyList(group.data.paceWeekPlan) || (typeof group.data.paceStartDate === "string" && group.data.paceStartDate !== "");
    if (ownCalendar && group.data.archived !== true) ownCalendars.push(name);
    const changed =
      ownCalendar ||
      !copies[i].empty ||
      nonEmptyMap(group.data.sessionOverrides) ||
      nonEmptyMap(group.data.sessionModes) ||
      nonEmptyMap(group.data.sessionChanges);
    if (changed && changedGroup === null) changedGroup = name;
  });

  const placeRecords = places.docs.some((doc) => {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    return nonEmptyList(data.visits) || nonEmptyList(data.groupsByWeek) || (data.timeAnswer !== undefined && data.timeAnswer !== null);
  });

  const weekOneOpen = decisionsSent && weekOne.exists && weekIsReady(weekOne.data() as { published?: boolean; ready?: boolean });

  let done: string | null = null;
  if (work.some((n) => n > 0)) done = DONE_WORK;
  else if (weekOneOpen) done = DONE_WEEK_ONE;
  else if (changedGroup !== null) done = doneGroupWords(changedGroup);
  else if (records.some((n) => n > 0) || placeRecords) done = DONE_RECORDS;

  const anybodyOnRun = decisionsSent || places.docs.length > 0 || applications > 0;
  return { done, anybodyOnRun, ownCalendars: ownCalendars.sort((a, b) => a.localeCompare(b, "en-GB")) };
}

/** The programme that names the run, and that it still does on its own form. */
export async function namingOf(db: Firestore, runId: string): Promise<NamingProgramme | null> {
  return readNamingProgramme(db, runId);
}

/** Whether the form still names this run on the programme, read in the transaction. */
export async function stillNames(db: Firestore, naming: NamingProgramme, runId: string, tx: Transaction): Promise<boolean> {
  const snap = await tx.get(formRef(db, naming.roundId));
  const data = snap.exists ? snap.data() : undefined;
  if (!data || !isApplicationForm(data)) return false;
  const form = normaliseForm(snap.id, data);
  return own(form.programmes, naming.programmeId)?.runId === runId;
}

/** The run as both readers take it: null when it is not on the site. */
export function runOf(id: string, raw: Record<string, unknown> | undefined): CourseRunDoc | null {
  if (!raw || raw.destroying === true) return null;
  return normalizeCourseRun(id, raw);
}

/** The plan as stored, every entry the normaliser keeps. */
export function storedPlan(raw: Record<string, unknown>) {
  return sanitizeWeekPlan(raw.weekPlan);
}

/** The guide's week numbers, for the course a run belongs to; none for a run tied to no course. */
export async function guideWeeksOf(db: Firestore, courseId: string, tx?: Transaction): Promise<Set<number>> {
  return courseId ? courseGuideWeekNumbers(db, courseId, tx) : new Set<number>();
}

/** What a lock document says, as the week's lock reads it. */
export function lockIsLive(data: Record<string, unknown> | undefined, now: Date): boolean {
  return holdIsLive(readHold({ exists: data !== undefined, data: () => data }), now);
}

/**
 * THE ONE JUDGEMENT: the refusal a change meets, or null when it may be
 * taken. The page asks it of each step it could offer; the route asks it of
 * what its transaction read.
 */
export function judgeChange(facts: PlanFacts, change: PlanChange): string | null {
  const standing = standingRefusal(facts.standing);
  if (standing) return standing;

  const touched = touchedAddresses(change);
  if ((change.reshapes || touched.length > 0) && facts.done !== null) {
    return change.reshapes ? facts.done : DRIFTED_AND_DONE;
  }

  if (change.removed) {
    const n = change.removed.weekNumber;
    const holds = change.removed.source ? facts.holds(change.removed.source) : EMPTY_ADDRESS;
    if (holds.blocks) return removeHasBlocks(n);
    if (holds.older) return removeHasOlderMaterial(n);
    if (holds.history > 0) return removeHasHistory(n);
  }

  const numbers = [
    ...(change.removed ? [change.removed.weekNumber] : []),
    ...change.renumbered.flatMap(({ from, to }) => [from, to]),
  ];
  const guided = numbers.find((n) => facts.guideWeeks.has(n));
  if (guided !== undefined) return guideHolds(guided);

  const numberAt = (address: string) =>
    change.weeks.find((week) => week.source === address)?.weekNumber ??
    change.weeks.find((week) => week.target === address)?.weekNumber ??
    change.removed?.weekNumber ??
    0;
  for (const address of touched) {
    if (facts.holds(address).liveLock) return beingEdited(numberAt(address));
  }

  // An address a week's contents move into that no week's contents leave
  // holds a page the plan does not use: moving into it would write over it.
  const sources = new Set(change.weeks.flatMap((week) => (week.source ? [week.source] : [])));
  if (change.removed?.source) sources.add(change.removed.source);
  for (const [address, final] of finalSources(change)) {
    if (final.from === null || sources.has(address)) continue;
    const holds = facts.holds(address);
    if (holds.exists || holds.history > 0) return addressTakenWords(final.weekNumber ?? 0);
  }

  // The size of the move: every saved version is written at its new address
  // and deleted at its old one.
  let writes = 1;
  let records = 0;
  let bytes = 0;
  for (const address of touched) {
    const holds = facts.holds(address);
    writes += 1 + holds.history * 2 + holds.locks;
    records += holds.history;
    bytes += holds.bytes;
  }
  if (writes > MAX_WRITES || bytes > MAX_BYTES) return tooBigWords(records);
  return null;
}
