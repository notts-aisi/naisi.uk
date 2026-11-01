import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { resolveGroupCalendar } from "@/lib/courses/groupResolve";
import {
  listGroups,
  readRunRecords,
  weeksOf,
  type GroupSessionFacts,
  type RunRecords,
  type StandingFacilitator,
} from "@/lib/courses/programmeAttendance";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
import { nextEmailLineFor, type NextEmailLine } from "@/lib/courses/registerEnding";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { readCoursesConfig } from "@/lib/firestore/config";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";
import { isOwnBoxResponse } from "@/lib/firestore/courseExercises";
import { facilitatesOnRun, readsFacilitatorsOwnWork, reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import { isWordCountedAnswer } from "@/lib/courses/writtenAnswers/model";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * WHAT A FACILITATOR'S PAGES SAY ABOUT ONE GROUP (boards wk-fac-group and
 * wk-fac-home-phone), worked out on the server from the records the
 * programme's own tabs read, so the facilitator, the lead and the register
 * can never disagree about who is in a group, who left, or what a register
 * says.
 *
 * WHO CALLS IT has already decided its caller may read the group: the group
 * page and the summary route behind Home admit a live facilitator of the
 * group and admins. `viewer.isAdmin` then decides who is a row, by the
 * register's own rule: somebody Publish has not told their group is nobody's
 * row but an admin's. `viewer.actor` is who is asking, for whose answers
 * wait for them (TO REVIEW below), and for the name each person is shown by
 * (`nameForViewer`, through `listGroups`: the committee and admins see the
 * full name, a facilitator who is not on the committee the name people go
 * by).
 *
 * What it answers:
 *  - THE PEOPLE: everybody taking part, with each FINISHED register's mark
 *    (a register not finished is the facilitator's draft and shows nothing
 *    here), and everybody who left, last, with the marks they had.
 *  - THE REGISTERS: each session from the first to today's, with its state
 *    and how many came of those marked (late and left early count as came).
 *  - HOW MANY ARE EXPECTED at the next session: the people taking part.
 *  - TO REVIEW: each person's exercises waiting for review, a row per person
 *    per week, newest first, from the review the site already keeps. A
 *    facilitator of the group who holds a place is one of its people, with
 *    their marks, but their own answers are a facilitator's own work, listed
 *    only to whoever the one rule lets read it (`facilitatesOnRun` and
 *    `readsFacilitatorsOwnWork` in `src/lib/courses/writtenAnswers/access.ts`):
 *    the programme's lead and admins, never a co-facilitator or themselves.
 *  - PACE: how many taught weeks the group is behind the programme (or ahead
 *    of it), from the pace the site already keeps for the group.
 *  - FOR HOME: who left the group recently (until the end of the first
 *    session after they left), and where next week's email stands while it
 *    is on its schedule.
 *
 * Every read is an equality on one field, sorted in memory: no read here
 * needs a declared index.
 */

/** Present, late and left early count as came, as the boards say. */
const CAME: ReadonlySet<AttendanceStatus> = new Set(["present", "late", "left-early"]);

/** One box beside a person: a finished register's mark, or why there is none. */
export type GroupMark = {
  weekNumber: number;
  kind: "mark" | "not-marked" | "not-held" | "before" | "after";
  mark: AttendanceStatus | null;
};

export type GroupPersonRow = {
  uid: string;
  /** Their name as the viewer is shown it, as the lead's tabs name people. */
  name: string;
  /** The name they go by, as Home's who's coming calls them ("Amara"). */
  firstName: string;
  /** "Left Fri 13 Nov", "Left", or null for somebody taking part. */
  left: string | null;
  /** One box per finished register, in week order. */
  marks: GroupMark[];
};

/** A register's state, as the Registers card says it. */
export type GroupRegisterState = "finished" | "not-finished" | "today" | "not-held" | "cancelled";

export type GroupRegisterRow = {
  weekNumber: number;
  dateKey: string;
  startTimeLocal: string;
  state: GroupRegisterState;
  /** Of the people the register marks, how many came. */
  came: number;
  of: number;
};

export type GroupReviewRow = {
  uid: string;
  name: string;
  weekNumber: number;
  /** How many of their exercises that week wait for a review. */
  count: number;
  /** The London day the latest of them was sent. */
  sentDateKey: string;
};

export type GroupLeftRecently = {
  uid: string;
  name: string;
  firstName: string;
  leftDateKey: string | null;
  /** The register they are off from: tonight's, today's, or a later day's. */
  from: { kind: "tonight" } | { kind: "today" } | { kind: "day"; dateKey: string };
};

export type FacilitatorGroupModel = {
  /** The group's facilitators who still stand behind the role, in the group's own order. */
  facilitators: StandingFacilitator[];
  people: GroupPersonRow[];
  leavers: GroupPersonRow[];
  /** The weeks whose finished registers the marks come from, in order. */
  finishedWeeks: number[];
  /** Somebody placed in the group has not been told it yet. Never for an admin. */
  notYetTold: boolean;
  registers: GroupRegisterRow[];
  /** The group's first session's day, for the line shown before any register. */
  firstSessionDateKey: string;
  /** The people taking part: who is expected at the next session. */
  expected: number;
  /** True while next week's email is on its schedule: "Finished", not "Pushed". */
  scheduled: boolean;
  toReview: GroupReviewRow[];
  /** Taught weeks behind the programme (below 0: ahead), or null without dates to tell. */
  weeksBehind: number | null;
  /** Who left the group recently, for Home: until the first session after they left is over. */
  leftRecently: GroupLeftRecently[];
};

/** The records the programme's tabs read, with this group in them even when it is archived. */
async function recordsWith(db: Firestore, run: CourseRunDoc, group: CourseGroupDoc): Promise<RunRecords | null> {
  const records = await readRunRecords(db, run.id);
  if (!records) return null;
  if (records.groups.some((candidate) => candidate.id === group.id)) return records;
  return { ...records, groups: [...records.groups, { ...group, name: group.name.trim() || "Untitled group" }] };
}

/** Taught weeks that have started on a calendar: 0 before it, every one after it. */
function taughtSoFar(calendar: ReturnType<typeof resolveGroupCalendar>): number | null {
  const week = calendar.currentWeek;
  if (!week) return null;
  if (week.phase === "before") return 0;
  if (week.phase === "after") return calendar.totalWeeks;
  return week.anchorWeekNumber;
}

/** The weeks the group is behind its programme: the run's taught weeks so far less the group's. */
export function weeksBehindOf(run: CourseRunDoc, group: CourseGroupDoc, now: Date): number | null {
  const ours = resolveGroupCalendar(run, group, now);
  if (ours.calendar.source === "run") return ours.currentWeek ? 0 : null;
  const programme = taughtSoFar(resolveGroupCalendar(run, null, now));
  const groupSoFar = taughtSoFar(ours);
  if (programme === null || groupSoFar === null) return null;
  return programme - groupSoFar;
}

/** One person's boxes, for the finished registers. */
function marksOf(cells: { weekNumber: number; state: string; mark: AttendanceStatus | null }[], finished: readonly number[]): GroupMark[] {
  return finished.map((weekNumber) => {
    const cell = cells.find((candidate) => candidate.weekNumber === weekNumber);
    if (!cell) return { weekNumber, kind: "not-marked", mark: null };
    if (cell.state === "mark" && cell.mark) return { weekNumber, kind: "mark", mark: cell.mark };
    if (cell.state === "not-held") return { weekNumber, kind: "not-held", mark: null };
    if (cell.state === "before") return { weekNumber, kind: "before", mark: null };
    if (cell.state === "after") return { weekNumber, kind: "after", mark: null };
    return { weekNumber, kind: "not-marked", mark: null };
  });
}

/** A register's row, or null for a session still to come. */
function registerRowOf(facts: GroupSessionFacts, todayKey: string, people: { cells: { weekNumber: number; state: string; mark: AttendanceStatus | null }[] }[]): GroupRegisterRow | null {
  const { session } = facts;
  if (!session.dateKey || session.dateKey > todayKey) return null;
  let came = 0;
  let of = 0;
  for (const person of people) {
    const cell = person.cells.find((candidate) => candidate.weekNumber === session.weekNumber);
    if (!cell || cell.state !== "mark" || !cell.mark) continue;
    of += 1;
    if (CAME.has(cell.mark)) came += 1;
  }
  const state: GroupRegisterState = session.cancelled
    ? "cancelled"
    : !facts.held
      ? "not-held"
      : facts.finished
        ? "finished"
        : facts.ended
          ? "not-finished"
          : "today";
  return { weekNumber: session.weekNumber, dateKey: session.dateKey, startTimeLocal: session.session.startTimeLocal, state, came, of };
}

/** The week a stored exercise answer belongs to: its stored number, or the one its week id names. */
function weekNumberOf(data: Record<string, unknown>): number {
  if (typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber)) return data.weekNumber;
  const match = typeof data.weekId === "string" ? /^w(\d{1,3})$/.exec(data.weekId) : null;
  return match ? Number(match[1]) : 0;
}

/** A stored instant, from a Timestamp or a Date, or null. */
function instantOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

/**
 * Each person's exercises waiting for review: an answer sent and not yet
 * reviewed, as the review queue's "Needs review" counts them. One equality
 * on the run, the group's people kept in memory: a run's answers are its
 * people's weeks of exercises, the slice the destroy's manifest counts too.
 */
async function readToReview(db: Firestore, runId: string, people: GroupPersonRow[]): Promise<GroupReviewRow[]> {
  const names = new Map(people.map((person) => [person.uid, person.name]));
  if (names.size === 0) return [];
  const snap = await db.collection("courseExerciseResponses").where("runId", "==", runId).get();
  const byKey = new Map<string, { uid: string; weekNumber: number; count: number; latest: Date }>();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    if (!names.has(uid) || data.runId !== runId) continue;
    // A reflection or a fill-in box is never sent and never reviewed
    // (courseExercises.ts), and a block week's written answer waits in the
    // review queue, not here.
    if (isOwnBoxResponse(data) || isWordCountedAnswer(data)) continue;
    const sentAt = instantOf(data.submittedAt);
    const status = typeof data.reviewStatus === "string" ? data.reviewStatus : "unreviewed";
    if (!sentAt || status !== "unreviewed") continue;
    const weekNumber = weekNumberOf(data);
    if (weekNumber < 1) continue;
    const key = `${uid} ${weekNumber}`;
    const entry = byKey.get(key) ?? { uid, weekNumber, count: 0, latest: sentAt };
    entry.count += 1;
    if (sentAt > entry.latest) entry.latest = sentAt;
    byKey.set(key, entry);
  }
  return [...byKey.values()]
    .sort((a, b) => b.latest.getTime() - a.latest.getTime() || a.weekNumber - b.weekNumber || a.uid.localeCompare(b.uid))
    .map((entry) => ({
      uid: entry.uid,
      name: names.get(entry.uid) ?? "NAISI member",
      weekNumber: entry.weekNumber,
      count: entry.count,
      sentDateKey: londonDateKey(entry.latest),
    }));
}

const EMPTY: FacilitatorGroupModel = {
  facilitators: [],
  people: [],
  leavers: [],
  finishedWeeks: [],
  notYetTold: false,
  registers: [],
  firstSessionDateKey: "",
  expected: 0,
  scheduled: false,
  toReview: [],
  weeksBehind: null,
  leftRecently: [],
};

/** Everything the group page shows about the group's people, registers, reviews and pace. */
export async function loadFacilitatorGroup(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  viewer: { isAdmin: boolean; actor: SessionUser },
  now: Date,
): Promise<FacilitatorGroupModel> {
  const records = await recordsWith(db, run, group);
  if (!records) return EMPTY;
  const listed = listGroups(records, { isAdmin: viewer.isAdmin, role: viewer.actor.role }, now, weeksOf(records)).find(
    (entry) => entry.group.id === group.id,
  );
  if (!listed) return EMPTY;

  const todayKey = londonDateKey(now);
  const ordered = [...listed.sessions.values()].sort((a, b) => a.session.weekNumber - b.session.weekNumber);
  const finishedWeeks = ordered.filter((facts) => facts.finished).map((facts) => facts.session.weekNumber);
  const rows = listed.people.map(({ row }) => row);
  const toRow = (row: (typeof rows)[number]): GroupPersonRow => ({
    uid: row.uid,
    name: row.name,
    firstName: firstNameOfUser(records.accounts.get(row.uid) ?? {}) || row.name,
    left: row.left,
    marks: marksOf(row.cells, finishedWeeks),
  });
  const people = rows.filter((row) => row.left === null).map(toRow);
  const leavers = rows.filter((row) => row.left !== null).map(toRow);
  const registers = ordered
    .map((facts) => registerRowOf(facts, todayKey, rows))
    .filter((row): row is GroupRegisterRow => row !== null);
  // Whose answers wait for the viewer: the group's people, but a
  // facilitator's own work only for whoever the one rule lets read it. The
  // viewer's standing is read only when one of the people facilitates.
  const reviewer = people.some((person) => facilitatesOnRun(person.uid, records.groups))
    ? await reviewerFactsOf(db, viewer.actor, run.id)
    : null;
  const reviewable = people.filter(
    (person) =>
      !facilitatesOnRun(person.uid, records.groups) ||
      (reviewer !== null && readsFacilitatorsOwnWork(viewer.actor, reviewer, person.uid)),
  );

  return {
    facilitators: listed.facilitators,
    people,
    leavers,
    finishedWeeks,
    notYetTold: listed.notYetTold,
    registers,
    firstSessionDateKey: ordered[0]?.session.dateKey ?? "",
    expected: people.length,
    scheduled: records.switches.scheduled,
    // A facilitator who holds a place is one of the group's people, and their
    // own answers wait for the programme's lead and admins, never for their
    // co-facilitators or themselves.
    toReview: await readToReview(db, run.id, reviewable),
    weeksBehind: weeksBehindOf(run, group, now),
    leftRecently: leftRecentlyIn(records, listed, now),
  };
}

// ---------------------------------------------------------------------------
// For Home
// ---------------------------------------------------------------------------

/** "Tonight" from 5pm, "Today" before it. */
function evening(startTimeLocal: string): boolean {
  const hour = Number(startTimeLocal.slice(0, 2));
  return Number.isInteger(hour) && hour >= 17;
}

/**
 * Who left the group recently: everybody who left, until the end of the
 * first session of the group's after they left. Before that session they are
 * off its register, and Home says so; after it, the register itself does.
 */
function leftRecentlyIn(
  records: RunRecords,
  listed: ReturnType<typeof listGroups>[number],
  now: Date,
): GroupLeftRecently[] {
  const todayKey = londonDateKey(now);
  const sessions = [...listed.sessions.values()]
    .filter((facts) => !facts.session.cancelled && facts.startsAt !== null)
    .sort((a, b) => (a.startsAt as Date).getTime() - (b.startsAt as Date).getTime());
  const out: GroupLeftRecently[] = [];
  for (const { enrolment, row } of listed.people) {
    if (row.left === null) continue;
    const leftAt = enrolment.droppedOutAt;
    if (!leftAt) continue;
    const next = sessions.find((facts) => (facts.startsAt as Date).getTime() >= leftAt.getTime());
    if (!next || !next.endsAt || next.endsAt.getTime() <= now.getTime()) continue;
    out.push({
      uid: enrolment.uid,
      name: row.name,
      firstName: firstNameOfUser(records.accounts.get(enrolment.uid) ?? {}) || row.name,
      leftDateKey: row.leftDateKey,
      from:
        next.session.dateKey === todayKey
          ? evening(next.session.session.startTimeLocal)
            ? { kind: "tonight" }
            : { kind: "today" }
          : { kind: "day", dateKey: next.session.dateKey },
    });
  }
  return out;
}

/**
 * Where the next "Week N is open" stands, while the email is on its schedule:
 * the first session still to come (the group's first among them) whose email
 * has not gone. Null while the email is not on its schedule (the push still
 * sends it), and when no session is left to email about.
 */
export async function readNextEmailForHome(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  scheduled: boolean,
  now: Date,
): Promise<NextEmailLine | null> {
  if (!scheduled) return null;
  const sessions: ResolvedSession[] = resolveSessions(run, group);
  const config = await readCoursesConfig(db);
  for (const session of sessions) {
    const { startsAt } = sessionInstants(session);
    if (!startsAt || startsAt.getTime() <= now.getTime()) continue;
    const line = await nextEmailLineFor(db, { run, group, sessions, session, config, now });
    if (!line || line.state === "went" || line.state === "missed") continue;
    return line;
  }
  return null;
}
