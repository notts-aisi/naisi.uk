import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { clockWords, namesInWords } from "@/lib/courses/facilitatingEmail";
import { runEndOf } from "@/lib/courses/finishing/runEnd";
import { firstNameOfUser, standingUserOf } from "@/lib/courses/programmeLead";
import { displayNameOf } from "@/lib/courses/registerAccess";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { addDaysToKey, currentWeekFor, isValidDateKey, londonDateKey } from "@/lib/courses/weekPlan";
import { formatRunStartShort } from "@/lib/courses/window";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import {
  ATTENDANCE_STATUS_LABEL,
  attendanceDocId,
  normalizeCourseAttendance,
  type AttendanceStatus,
  type CourseAttendanceDoc,
} from "@/lib/firestore/courseAttendance";
import {
  enrolmentHasLeft,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
} from "@/lib/firestore/courseEnrolments";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { accountNamesOf, nameForViewer, type NameViewer } from "@/lib/names/staffName";
import { registerSwitchesIn, type RegisterSwitches } from "@/lib/scheduler/registerSwitches";

/**
 * A PROGRAMME'S ATTENDANCE, WORKED OUT ONCE, ON THE SERVER: every register of
 * the course run a programme names, as its lead's Attendance tab draws it
 * (board wk-attendance). The tab's grid, its CSV, the Overview tab's figures
 * and the line under the programme's name all read this, so the four can
 * never disagree about a number.
 *
 * ── EVERY NUMBER FROM A RECORD ──────────────────────────────────────────────
 * The weeks are the run's plan; each group's dates are its own calendar
 * (`resolveSessions`, which applies a group's own pacing); the marks are the
 * registers (`courseAttendance`); the people are the run's enrolments. No
 * date, time or count of this term is written here.
 *
 * ── WHO IS A ROW ────────────────────────────────────────────────────────────
 *  - Somebody taking part: an enrolment in the group, active (or completed,
 *    once the run is over), shown to this viewer by the register's own rule
 *    (`placementIsShownTo`): an admin sees everybody placed, anybody else only
 *    the people Publish has told their group. The register reads the same way.
 *  - Somebody who LEFT: an enrolment that has left the run, withdrawn by its
 *    owner or removed by staff, listed with the marks they had before they
 *    left (C27), for every viewer alike, and only where a register of the
 *    group holds a mark for them: the mark is the proof they were on that
 *    register, and somebody who left before any register marked them took
 *    no part, and is nobody's row. Both kinds keep the day they went
 *    (`droppedOutAt`; a row removed before Remove recorded it has none, and
 *    reads "Left"). A withdrawn row keeps its group; a removed row does not,
 *    so it is listed in the group whose register last marked it.
 *
 * ── WHAT COUNTS ─────────────────────────────────────────────────────────────
 * "Came" counts present, late and left early, as the board says; "of" counts
 * every mark on a held register of a session that has started, excused and
 * absent included. A mark saved on a register not finished yet counts too,
 * drawn with a ring, because the board counts it ("Saved, not finished").
 * A session the register says did not happen counts for nobody, and nor
 * does one cancelled through "Change a session". Each row also counts the
 * sessions its group held while the person was in it, marked or not, which
 * is what who finished's rule weighs "every session" against.
 *
 * ── ONE SESSION A WEEK ──────────────────────────────────────────────────────
 * A column is a taught week, and each group's first session of it. Every
 * group holds one session a week today (`courseGroups.extraSession` is not
 * produced by the normaliser yet; see `src/lib/courses/sessions.ts`). When a
 * second slot exists, this is where its column goes.
 *
 * NAMES ONLY, never an address, by the names rule for whoever the tab is
 * drawn for (`nameForViewer`, with the viewer's `role`): the committee and
 * admins see "Priya Shah (Pri)", so two who go by one first name are told
 * apart, and a lead or facilitator who is not on the committee sees the
 * name people go by. A caller drawing for nobody in particular (a file, an
 * email, a record) passes no role, and every row reads by the name people
 * go by. A sentence that talks about somebody uses the name they go by. A
 * facilitator is named only while their account still stands behind the
 * role (`isNamedWithStanding`).
 *
 * ONE ORDER OF GROUPS. The groups are listed in the order People in groups
 * draws its columns (`compareGroupsByMeeting`), so the grid, its CSV and the
 * Overview list them as every other tab of the programme's page does.
 */

/** A mark as the grid draws it. */
export type GridMark = AttendanceStatus;

/**
 * What one cell of the grid holds.
 *  - `mark`: a mark on the register (`saved` when the register is not finished).
 *  - `not-yet`: no mark: the session is still to come, or nobody marked them.
 *  - `today`: no mark, on a session that is today and has not ended.
 *  - `not-held`: the register says the session did not happen.
 *  - `before`: before the week they joined the group.
 *  - `after`: after they left.
 *  - `none`: the group holds no session that week.
 */
export type GridCellState = "mark" | "not-yet" | "today" | "not-held" | "before" | "after" | "none";

export type GridCell = {
  weekNumber: number;
  state: GridCellState;
  mark: GridMark | null;
  /** True when the mark is on a register saved and not finished yet. */
  saved: boolean;
};

/**
 * The word over a group's date for one week.
 *  - `tonight` / `today`: the session is today and has not ended (an evening
 *    session, from `EVENING_FROM`, is "Tonight").
 *  - `tomorrow`: the session is tomorrow.
 *  - `not-finished`: the session has ended and its register is not finished.
 *  - `not-held`: the register says it did not happen.
 */
export type GridSessionTag = "tonight" | "today" | "tomorrow" | "not-finished" | "not-held" | null;

export type GridGroupWeek = {
  weekNumber: number;
  /** "29 Oct", or "" when the group holds no dated session that week. */
  dateLabel: string;
  tag: GridSessionTag;
};

export type GridPerson = {
  uid: string;
  name: string;
  /** "Left Fri 13 Nov", "Left" when the date is not on record, or null for somebody taking part. */
  left: string | null;
  /** The civil date they left, for the CSV, or null. */
  leftDateKey: string | null;
  /**
   * How many sessions in a row they were last marked absent, when that is at
   * least `ABSENT_IN_A_ROW`; 0 otherwise. Never for somebody who left, and
   * never once the run's last session is over: there are no more sessions to
   * come to, so nothing chases it.
   */
  absentInARow: number;
  /** The weeks of that run of absences, oldest first. */
  absentWeeks: number[];
  cells: GridCell[];
  came: number;
  of: number;
  /**
   * The sessions their group held while they were in it, marked or not: from
   * the week they joined, and for somebody who left, until they left; held,
   * not cancelled, and started. What "came to every session their group
   * held" is counted against (who finished's rule).
   */
  groupHeld: number;
};

export type GridGroup = {
  id: string;
  name: string;
  /** "A" for "Group A": the filter's button and the Overview's short name. */
  tag: string;
  /** "Thursdays 6pm · Amelia", from the group's slot and its facilitators. */
  line: string;
  weeks: GridGroupWeek[];
  people: GridPerson[];
  /** How many rows are drawn before "+N more". `people.length` when the group is drawn whole. */
  shown: number;
  /** True when somebody placed in the group is left out because Publish has not told them. Never for an admin. */
  notYetTold: boolean;
  /** The group's own figures, week by week, for the By week view and a footer filtered to the group. */
  totals: GridWeekTotal[];
};

export type GridWeekTotal = {
  weekNumber: number;
  /** The whole percent who came, or null while no group has a mark that week. */
  percent: number | null;
  came: number;
  of: number;
  /** True while a group's session that week is still to come or its register is not finished. */
  soFar: boolean;
  /** The names of the groups whose marks make up the figure, in the grid's order. */
  from: string[];
};

export type RunAttendance = {
  /** The grid's columns: every taught week of the run and of its groups' own calendars. */
  weeks: { weekNumber: number; thisWeek: boolean }[];
  groups: GridGroup[];
  totals: GridWeekTotal[];
  /**
   * The register's own word for finishing it, from the switch 2c's register
   * reads: "finished" while next week's email is on its schedule ("Finish the
   * register"), "pushed" while the push still sends it ("Push attendance").
   */
  ending: "finished" | "pushed";
};

/** Present, late and left early count as came, as the board says. */
const CAME: ReadonlySet<AttendanceStatus> = new Set(["present", "late", "left-early"]);

/**
 * Absent at this many sessions in a row, with no excuse, is something the
 * lead is shown (wk-attendance's "2 in a row", wk-overview's "has missed 2
 * sessions in a row without saying"). A rule of the board, not of a term.
 */
export const ABSENT_IN_A_ROW = 2;

/** A group with nothing in it to look at is drawn this many rows deep, then "+N more". */
export const QUIET_ROWS = 3;

/** A session starting at or after this London wall clock (minutes) is "Tonight"; earlier, "Today". */
const EVENING_FROM = 17 * 60;

// ---------------------------------------------------------------------------
// The records
// ---------------------------------------------------------------------------

/** Everything the run's attendance is worked out from, as read. */
export type RunRecords = {
  run: CourseRunDoc;
  /** The run's groups that still meet (not archived), Monday first (`compareGroupsByMeeting`). */
  groups: CourseGroupDoc[];
  /** Every learner enrolment on the run, whatever its state. */
  enrolments: CourseEnrolmentDoc[];
  /** Every register of the run, by its document id. */
  registers: Map<string, CourseAttendanceDoc>;
  /** The accounts of the run's learners and its groups' facilitators, by uid. */
  accounts: Map<string, Record<string, unknown>>;
  /** The switches the register's ending reads. */
  switches: RegisterSwitches;
};

/**
 * WHO A TAB IS DRAWN FOR. `isAdmin` decides who is a row (the register's
 * rule, `placementIsShownTo`: an admin sees everybody placed, anybody else
 * the people Publish has told). `role` decides the name each row is shown
 * by, through the names rule (`nameForViewer`): the committee role and
 * admins see the full name, everybody else the name people go by. Left out,
 * every row reads by the name people go by, which is what the Kairos file,
 * who finished's record and a certificate want.
 */
export type GridViewer = { isAdmin: boolean; role?: string | null };

/** The name one account is shown by on these tabs, for this viewer. Never an address. */
function personName(viewer: NameViewer, data: Record<string, unknown> | undefined): string {
  return nameForViewer(viewer, accountNamesOf(data ?? {}), "NAISI member");
}

/** Accounts per addressed read. Well inside `getAll`'s own limits. */
const ACCOUNT_BATCH = 300;

/**
 * Read everything once. Each query is one equality on one field, so none
 * needs a declared index; accounts are addressed reads of the uids the run's
 * own documents name, never a query over `users`. Null when the run is not
 * there.
 */
export async function readRunRecords(db: Firestore, runId: string): Promise<RunRecords | null> {
  const [runSnap, groupSnap, enrolmentSnap, registerSnap, scheduler] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseGroups").where("runId", "==", runId).get(),
    db.collection("courseEnrolments").where("runId", "==", runId).get(),
    db.collection("courseAttendance").where("runId", "==", runId).get(),
    readSchedulerConfig(db),
  ]);
  if (!runSnap.exists || runSnap.data()?.destroying === true) return null;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const groups = groupSnap.docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived && group.runId === runId)
    .map((group) => ({ ...group, name: group.name.trim() || "Untitled group" }))
    .sort(compareGroupsByMeeting);
  const enrolments = enrolmentSnap.docs
    .map((doc) => normalizeCourseEnrolment(doc.id, doc.data() ?? {}))
    .filter((row) => row.role === "learner" && row.uid !== "" && row.runId === runId);
  const registers = new Map<string, CourseAttendanceDoc>();
  for (const doc of registerSnap.docs) {
    const register = normalizeCourseAttendance(doc.id, doc.data() ?? {});
    if (register.runId === runId) registers.set(doc.id, register);
  }

  const uids = [
    ...new Set([...enrolments.map((row) => row.uid), ...groups.flatMap((group) => group.facilitatorUids)]),
  ].filter((uid) => uid !== "" && !uid.includes("/"));
  const accounts = new Map<string, Record<string, unknown>>();
  for (let at = 0; at < uids.length; at += ACCOUNT_BATCH) {
    const slice = uids.slice(at, at + ACCOUNT_BATCH);
    const snaps = await db.getAll(...slice.map((uid) => db.collection("users").doc(uid)));
    for (const snap of snaps) {
      if (snap.exists) accounts.set(snap.id, (snap.data() ?? {}) as Record<string, unknown>);
    }
  }
  return { run, groups, enrolments, registers, accounts, switches: registerSwitchesIn(scheduler) };
}

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  day: "numeric",
  month: "short",
});

/** "29 Oct", from a civil date in London. "" for anything that is not one. */
export function dayMonthLabel(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return "";
  return DAY_MONTH.format(new Date(`${dateKey}T12:00:00Z`));
}

/** "Fri 13 Nov", from a civil date in London. "" for anything that is not one. */
export function dayLabel(dateKey: string): string {
  return formatRunStartShort(dateKey) ?? "";
}

/**
 * The register's answer to a press about a session that did not happen: its
 * register says so, or it was cancelled through "Change a session". Remind on
 * the Overview, and the facilitators' register and its push, all refuse in
 * these words. "Group B’s session on Tue 24 Nov didn’t happen, so its
 * register needs nothing."
 */
export function didNotHappenLine(groupName: string, dateKey: string): string {
  const day = dayLabel(dateKey);
  return day
    ? `${groupName}’s session on ${day} didn’t happen, so its register needs nothing.`
    : `${groupName}’s session didn’t happen, so its register needs nothing.`;
}

/** "Thursdays 6pm", the board's line for a group's weekly slot. Null with no day or time. */
export function slotLine(session: { weekday: number; startTimeLocal: string }): string | null {
  const day = WEEKDAYS[session.weekday];
  const at = clockWords(session.startTimeLocal);
  return day && at ? `${day}s ${at}` : null;
}

/** "A" for "Group A", the first letter otherwise. */
export function groupTagOf(name: string): string {
  const trimmed = name.trim();
  const after = /^group\s+(\S{1,3})$/i.exec(trimmed);
  if (after) return after[1].toUpperCase();
  return (Array.from(trimmed)[0] ?? "?").toUpperCase();
}

/** Group names in the order a person reads them in a sentence: "Group 2" before "Group 10". */
const byName = (a: string, b: string) => a.localeCompare(b, "en-GB", { numeric: true, sensitivity: "base" });

/**
 * "Groups A and D" when every group is named "Group" and a letter, otherwise
 * their names in a sentence: "Tuesday evening and Thursday morning". In name
 * order, as the board writes them, whatever order the list they came from is
 * in: a sentence is not a list of groups.
 */
export function groupsInWords(given: readonly string[]): string {
  if (given.length === 0) return "";
  const names = [...given].sort(byName);
  const tags = names.map((name) => /^group\s+(\S{1,3})$/i.exec(name.trim())?.[1]?.toUpperCase() ?? null);
  if (tags.every((tag): tag is string => tag !== null)) {
    return `${tags.length === 1 ? "Group" : "Groups"} ${namesInWords(tags)}`;
  }
  return namesInWords(names);
}

/** A mark in words, as the CSV and assistive technology say it. */
export function markWord(mark: AttendanceStatus): string {
  return ATTENDANCE_STATUS_LABEL[mark];
}

// ---------------------------------------------------------------------------
// The people of the run
// ---------------------------------------------------------------------------

/** A facilitator of a group, while their account stands behind the role. */
export type StandingFacilitator = { uid: string; firstName: string; name: string };

/**
 * A group's facilitators who still stand behind the role, in the group's own
 * order: `name` by the names rule for `viewer` (none: the name they go by),
 * `firstName` the name a sentence calls them by.
 */
export function facilitatorsOf(records: RunRecords, group: CourseGroupDoc, viewer: NameViewer = null): StandingFacilitator[] {
  const out: StandingFacilitator[] = [];
  for (const uid of [...new Set(group.facilitatorUids)]) {
    const data = records.accounts.get(uid);
    if (!data) continue;
    if (!isNamedWithStanding(standingUserOf(uid, data), "courseGroups.facilitatorUids", group.facilitatorUids)) {
      continue;
    }
    out.push({ uid, firstName: firstNameOfUser(data) || displayNameOf(data), name: personName(viewer, data) });
  }
  return out;
}

/** True for an enrolment that has left the run: withdrawn by its owner or removed by staff (`enrolmentHasLeft`). */
export function hasLeft(row: Pick<CourseEnrolmentDoc, "status">): boolean {
  return enrolmentHasLeft(row.status);
}

/** True for an enrolment taking part: active, or completed once the run is over. */
function takesPart(row: Pick<CourseEnrolmentDoc, "status">): boolean {
  return row.status === "active" || row.status === "completed";
}

/**
 * WHETHER A ROW IS LISTED FOR THIS VIEWER: somebody taking part by the
 * register's own rule (`placementIsShownTo`, about the caller's role);
 * somebody who has left only where a register of the group marked them.
 */
function isListed(enrolment: CourseEnrolmentDoc, viewer: { isAdmin: boolean }, marked: boolean): boolean {
  if (hasLeft(enrolment)) return marked;
  return placementIsShownTo(enrolment, viewer);
}

/** One group's sessions, a week each, with what the clock and the register say of them. */
export type GroupSessionFacts = {
  session: ResolvedSession;
  startsAt: Date | null;
  endsAt: Date | null;
  register: CourseAttendanceDoc | null;
  held: boolean;
  finished: boolean;
  started: boolean;
  ended: boolean;
  tag: GridSessionTag;
};

/** Every week's first session of a group, keyed by week, with the clock's and the register's facts. */
export function groupSessions(records: RunRecords, group: CourseGroupDoc, now: Date): Map<number, GroupSessionFacts> {
  const todayKey = londonDateKey(now);
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const out = new Map<number, GroupSessionFacts>();
  for (const session of resolveSessions(records.run, group)) {
    if (session.occurrence !== 1 || out.has(session.weekNumber)) continue;
    const { startsAt, endsAt } = sessionInstants(session);
    const register =
      records.registers.get(attendanceDocId(records.run.id, group.id, session.weekNumber, session.occurrence)) ?? null;
    // A session cancelled through "Change a session" did not happen, as a
    // register that says so did not: nothing is chased or reminded for it,
    // and it counts in no figure, as the register jobs and who finished
    // already read it.
    const held = !session.cancelled && (register ? register.held : true);
    const finished = register?.pushedAt instanceof Date;
    const started = startsAt !== null && startsAt.getTime() <= now.getTime();
    const ended = endsAt !== null && endsAt.getTime() <= now.getTime();
    let tag: GridSessionTag = null;
    if (session.dateKey) {
      if (!held) tag = "not-held";
      else if (finished) tag = null;
      else if (ended) tag = "not-finished";
      else if (session.dateKey === todayKey) tag = minutesOf(session.session.startTimeLocal) >= EVENING_FROM ? "tonight" : "today";
      else if (session.dateKey === tomorrowKey) tag = "tomorrow";
    }
    out.set(session.weekNumber, { session, startsAt, endsAt, register, held, finished, started, ended, tag });
  }
  return out;
}

function minutesOf(clock: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  return match ? Number(match[1]) * 60 + Number(match[2]) : -1;
}

/** Whether a session has happened as far as counting goes: it has started, or (undated) it has a register. */
function happened(facts: GroupSessionFacts): boolean {
  return facts.startsAt ? facts.started : facts.register !== null;
}

/** The latest week in which a group's registers mark this person, or 0. */
function lastMarkedWeek(sessions: Map<number, GroupSessionFacts>, uid: string): number {
  let last = 0;
  for (const [weekNumber, facts] of sessions) {
    if (facts.register?.records[uid] && weekNumber > last) last = weekNumber;
  }
  return last;
}

/** One person's row in one group. `over`: the run's last session is over (`runEndOf`). */
function personRow(
  enrolment: CourseEnrolmentDoc,
  name: string,
  weeks: readonly number[],
  sessions: Map<number, GroupSessionFacts>,
  over: boolean,
): GridPerson {
  const left = hasLeft(enrolment);
  const leftAt = left ? enrolment.droppedOutAt : null;
  const lastMarked = left && !leftAt ? lastMarkedWeek(sessions, enrolment.uid) : 0;
  const cells: GridCell[] = [];
  let came = 0;
  let of = 0;
  let groupHeld = 0;
  for (const weekNumber of weeks) {
    const facts = sessions.get(weekNumber);
    if (!facts) {
      cells.push({ weekNumber, state: "none", mark: null, saved: false });
      continue;
    }
    const mark = facts.register?.records[enrolment.uid] ?? null;
    if (weekNumber < enrolment.joinedWeekNumber) {
      cells.push({ weekNumber, state: "before", mark: null, saved: false });
      continue;
    }
    // After leaving: a session that started once they had gone, or, with no
    // date on record, any week after the last register that marked them.
    const afterLeaving = left
      ? leftAt
        ? !mark && (facts.startsAt === null || facts.startsAt.getTime() >= leftAt.getTime())
        : weekNumber > lastMarked
      : false;
    if (afterLeaving) {
      cells.push({ weekNumber, state: "after", mark: null, saved: false });
      continue;
    }
    if (!facts.held) {
      cells.push({ weekNumber, state: "not-held", mark: null, saved: false });
      continue;
    }
    if (happened(facts)) groupHeld += 1;
    if (mark) {
      cells.push({ weekNumber, state: "mark", mark, saved: !facts.finished });
      if (happened(facts)) {
        of += 1;
        if (CAME.has(mark)) came += 1;
      }
      continue;
    }
    const today = facts.tag === "tonight" || facts.tag === "today";
    cells.push({ weekNumber, state: today ? "today" : "not-yet", mark: null, saved: false });
  }

  // The latest run of absences, walking back over the sessions that have
  // happened and carry a mark: an unmarked one says nothing either way. Once
  // the run is over there is no session left to miss, so nothing is chased.
  const absentWeeks: number[] = [];
  if (!left && !over) {
    for (let at = cells.length - 1; at >= 0; at -= 1) {
      const cell = cells[at];
      const facts = sessions.get(cell.weekNumber);
      if (cell.state !== "mark" || !facts || !happened(facts)) continue;
      if (cell.mark !== "absent") break;
      absentWeeks.unshift(cell.weekNumber);
    }
  }
  const inARow = absentWeeks.length >= ABSENT_IN_A_ROW;

  const leftDateKey = leftAt ? londonDateKey(leftAt) : null;
  return {
    uid: enrolment.uid,
    name,
    left: left ? (leftDateKey ? `Left ${dayLabel(leftDateKey)}` : "Left") : null,
    leftDateKey,
    absentInARow: inARow ? absentWeeks.length : 0,
    absentWeeks: inARow ? absentWeeks : [],
    cells,
    came,
    of,
    groupHeld,
  };
}

// ---------------------------------------------------------------------------
// The grid
// ---------------------------------------------------------------------------

/**
 * WHERE THE PROGRAMME IS: its run's own calendar, the weeks its plan dates.
 * Run-level by design, and the one place these tabs ask it: the lead's pages
 * speak of the programme's week ("This week", "Running · week 3 of 6", the
 * Overview's week card), while every group's sessions beside it are dated by
 * the group's own calendar (`resolveSessions`). Null for a run whose start
 * date cannot be used.
 */
export function programmeWeekNow(
  run: Pick<CourseRunDoc, "startDate" | "weekPlan">,
  now: Date,
): ReturnType<typeof currentWeekFor> | null {
  if (!isValidDateKey(run.startDate)) return null;
  return currentWeekFor(run, now);
}

/** The run's own current week, when it is in a taught week. */
export function runThisWeek(run: Pick<CourseRunDoc, "startDate" | "weekPlan">, now: Date): number | null {
  const current = programmeWeekNow(run, now);
  return current?.phase === "running" ? current.weekNumber : null;
}

/** The groups each person is listed in, and the rows themselves, for one viewer. */
export type ListedGroup = {
  group: CourseGroupDoc;
  sessions: Map<number, GroupSessionFacts>;
  facilitators: StandingFacilitator[];
  /** Everybody listed: taking part and left, name order. */
  people: { enrolment: CourseEnrolmentDoc; row: GridPerson }[];
  notYetTold: boolean;
};

/**
 * Each group's sessions and listed people, for one viewer at one instant.
 * The grid, the CSV and the Overview are all drawn from this.
 */
export function listGroups(
  records: RunRecords,
  viewer: GridViewer,
  now: Date,
  weeks: readonly number[],
): ListedGroup[] {
  const sessionsByGroup = new Map(records.groups.map((group) => [group.id, groupSessions(records, group, now)]));
  // Once the run's last session is over (the moment who finished opens, the
  // one answer it asks), nobody's absences are chased any more.
  const over = runEndOf(records.run, records.groups, now).over;

  // A removed row has no group on it any more: it belongs where a register
  // last marked it.
  const removedHome = new Map<string, string>();
  for (const enrolment of records.enrolments) {
    if (enrolment.status !== "removed") continue;
    let best: { groupId: string; week: number } | null = null;
    for (const group of records.groups) {
      const week = lastMarkedWeek(sessionsByGroup.get(group.id) ?? new Map(), enrolment.uid);
      if (week > 0 && (!best || week > best.week)) best = { groupId: group.id, week };
    }
    if (best) removedHome.set(enrolment.uid, best.groupId);
  }

  return records.groups.map((group) => {
    const sessions = sessionsByGroup.get(group.id) ?? new Map<number, GroupSessionFacts>();
    let notYetTold = false;
    const people: ListedGroup["people"] = [];
    const seen = new Set<string>();
    for (const enrolment of records.enrolments) {
      if (seen.has(enrolment.uid)) continue;
      const inGroup =
        enrolment.status === "removed" ? removedHome.get(enrolment.uid) === group.id : enrolment.groupId === group.id;
      if (!inGroup || !(takesPart(enrolment) || hasLeft(enrolment))) continue;
      const marked = lastMarkedWeek(sessions, enrolment.uid) > 0;
      if (!isListed(enrolment, viewer, marked)) {
        if (takesPart(enrolment)) notYetTold = true;
        continue;
      }
      seen.add(enrolment.uid);
      const name = personName(viewer, records.accounts.get(enrolment.uid));
      people.push({ enrolment, row: personRow(enrolment, name, weeks, sessions, over) });
    }
    people.sort((a, b) => a.row.name.localeCompare(b.row.name, "en-GB") || a.row.uid.localeCompare(b.row.uid));
    return { group, sessions, facilitators: facilitatorsOf(records, group, viewer), people, notYetTold };
  });
}

/** Every week number the run's plan or a group's own calendar teaches, in order. */
export function weeksOf(records: RunRecords): number[] {
  const weeks = new Set<number>();
  for (const session of resolveSessions(records.run, null)) weeks.add(session.weekNumber);
  for (const group of records.groups) {
    for (const session of resolveSessions(records.run, group)) weeks.add(session.weekNumber);
  }
  return [...weeks].sort((a, b) => a - b);
}

/** Somebody who left one group, as the grid lists them. */
export type GroupLeaver = {
  uid: string;
  /** "Left Fri 13 Nov", or "Left" when the day is not on record. */
  left: string;
  /** The civil date they left, or null. */
  leftDateKey: string | null;
};

/**
 * WHO LEFT ONE GROUP, for the group's own register (the facilitators' page,
 * wk-fac-group): exactly the people the lead's grid lists in that group as
 * having left, with the same words for when, so the register and the grid
 * can never disagree about who left a group or when. Listed for every
 * viewer alike, where a register of the group marked them (see "Who is a
 * row" above).
 */
export function leaversOfGroup(records: RunRecords, groupId: string, now: Date): GroupLeaver[] {
  const listed = listGroups(records, { isAdmin: false }, now, weeksOf(records)).find(
    (entry) => entry.group.id === groupId,
  );
  if (!listed) return [];
  return listed.people
    .filter(({ enrolment }) => hasLeft(enrolment))
    .map(({ enrolment, row }) => ({ uid: enrolment.uid, left: row.left ?? "Left", leftDateKey: row.leftDateKey }));
}

/** Whether a group holds something the lead is shown first: a register not finished, a leaver, a run of absences. */
function needsLooking(listed: ListedGroup): boolean {
  for (const facts of listed.sessions.values()) if (facts.tag === "not-finished") return true;
  return listed.people.some(({ row }) => row.left !== null || row.absentInARow > 0);
}

/**
 * Who came in one week, over some groups: the marks on held registers of
 * sessions that have happened, present, late and left early counted as came.
 * "So far" while one of those groups' sessions that week is still to come or
 * its register is not finished.
 */
function weekTotal(entries: readonly ListedGroup[], weekNumber: number): GridWeekTotal {
  let came = 0;
  let of = 0;
  let soFar = false;
  const from: string[] = [];
  for (const entry of entries) {
    const facts = entry.sessions.get(weekNumber);
    if (!facts || !facts.held) continue;
    if (!facts.finished) soFar = true;
    if (!happened(facts)) continue;
    let counted = 0;
    for (const { row } of entry.people) {
      const cell = row.cells.find((c) => c.weekNumber === weekNumber);
      if (!cell || cell.state !== "mark" || !cell.mark) continue;
      counted += 1;
      if (CAME.has(cell.mark)) came += 1;
    }
    if (counted > 0) {
      of += counted;
      from.push(entry.group.name);
    }
  }
  const percent = of > 0 ? Math.round((came * 100) / of) : null;
  return { weekNumber, percent, came, of, soFar: percent !== null && soFar, from };
}

/**
 * THE GRID, as the Attendance tab draws it, for one viewer at one instant.
 * Pure: the records are read already.
 */
export function buildRunAttendance(records: RunRecords, viewer: GridViewer, now: Date): RunAttendance {
  const weeks = weeksOf(records);
  const thisWeek = runThisWeek(records.run, now);
  const listed = listGroups(records, viewer, now, weeks);

  const groups: GridGroup[] = listed.map((entry) => {
    const { group, sessions, facilitators, people } = entry;
    const slot = slotLine(group.session);
    const who = namesInWords(facilitators.map((person) => person.firstName));
    const rows = people.map(({ row }) => row);
    return {
      id: group.id,
      name: group.name,
      tag: groupTagOf(group.name),
      line: [slot, who].filter(Boolean).join(" · "),
      weeks: weeks.map((weekNumber) => {
        const facts = sessions.get(weekNumber);
        return {
          weekNumber,
          dateLabel: facts ? dayMonthLabel(facts.session.dateKey) : "",
          tag: facts?.tag ?? null,
        };
      }),
      people: rows,
      shown: needsLooking(entry) || rows.length <= QUIET_ROWS ? rows.length : QUIET_ROWS,
      notYetTold: entry.notYetTold,
      totals: weeks.map((weekNumber) => weekTotal([entry], weekNumber)),
    };
  });

  const totals: GridWeekTotal[] = weeks.map((weekNumber) => weekTotal(listed, weekNumber));

  return {
    weeks: weeks.map((weekNumber) => ({ weekNumber, thisWeek: weekNumber === thisWeek })),
    groups,
    totals,
    ending: records.switches.scheduled ? "finished" : "pushed",
  };
}

// ---------------------------------------------------------------------------
// The line under the programme's name
// ---------------------------------------------------------------------------

/**
 * The line the wk boards draw under a programme's name once its run is under
 * way: "Running · week 3 of 6", then "31 taking part in 4 groups" and "Last
 * sessions Wed 9 Dec". Null before the run's first day and for a run with no
 * dates or no taught weeks, where the page keeps the form's own line.
 */
export type RunHeader = {
  /** "Running · week 3 of 6", "Running · Reading week", "Finished". */
  chip: string;
  /** True while the run is under way: the chip is drawn live. */
  live: boolean;
  /** People taking part in the groups that still meet, as this viewer is shown them. */
  takingPart: number;
  groups: number;
  /** "Wed 9 Dec": the last day any group meets, or null when none can be dated. */
  lastSession: string | null;
};

/** The run's groups that still meet, from a read of its groups: not archived, and the run's own. */
function liveGroupsOf(docs: readonly { id: string; data(): Record<string, unknown> | undefined }[], runId: string): CourseGroupDoc[] {
  return docs
    .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
    .filter((group) => !group.archived && group.runId === runId);
}

/**
 * HOW MANY GROUPS THE RUN HAS THAT STILL MEET: the number beside a
 * programme's Groups tab once the programme names the run, which is the
 * head's "in 3 groups" (`readRunHeader`) counted the same way. One document
 * and one equality on one field, so no declared index. Null for a run that
 * is not there or is being destroyed.
 */
export async function countRunGroups(db: Firestore, runId: string): Promise<number | null> {
  const [runSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseGroups").where("runId", "==", runId).get(),
  ]);
  if (!runSnap.exists || runSnap.data()?.destroying === true) return null;
  return liveGroupsOf(groupSnap.docs, runId).length;
}

/**
 * Read only what the line needs: the run, its groups and its enrolments.
 * Who counts as taking part is the grid's own rule (`isListed`), so the line
 * and the Overview's "taking part" never differ.
 */
export async function readRunHeader(
  db: Firestore,
  runId: string,
  viewer: { isAdmin: boolean },
  now: Date,
): Promise<RunHeader | null> {
  const [runSnap, groupSnap, enrolmentSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseGroups").where("runId", "==", runId).get(),
    db.collection("courseEnrolments").where("runId", "==", runId).get(),
  ]);
  // A run being destroyed is gone already for everybody it served, as the tabs read it.
  if (!runSnap.exists || runSnap.data()?.destroying === true) return null;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const total = run.weekPlan.filter((entry) => entry.kind === "week").length;
  const current = total > 0 ? programmeWeekNow(run, now) : null;
  if (!current || current.phase === "before") return null;

  const groups = liveGroupsOf(groupSnap.docs, runId);
  const live = new Set(groups.map((group) => group.id));
  let takingPart = 0;
  for (const doc of enrolmentSnap.docs) {
    const row = normalizeCourseEnrolment(doc.id, doc.data() ?? {});
    if (row.role !== "learner" || row.runId !== runId || !takesPart(row)) continue;
    if (!row.groupId || !live.has(row.groupId)) continue;
    if (isListed(row, viewer, false)) takingPart += 1;
  }
  let lastKey = "";
  for (const group of groups) {
    for (const session of resolveSessions(run, group)) {
      if (session.dateKey > lastKey) lastKey = session.dateKey;
    }
  }
  const chip =
    current.phase === "after"
      ? "Finished"
      : current.weekNumber !== null
        ? `Running · week ${current.weekNumber} of ${total}`
        : `Running · ${current.breakLabel?.trim() || "a week off"}`;
  return {
    chip,
    live: current.phase === "running",
    takingPart,
    groups: groups.length,
    lastSession: lastKey ? dayLabel(lastKey) : null,
  };
}

// ---------------------------------------------------------------------------
// The CSV
// ---------------------------------------------------------------------------

/**
 * The grid as a spreadsheet: one row a person, in the grid's order, with the
 * group, the name, each week's mark in words, the figures and when they
 * left. Nothing a register does not show: names and marks, never an address
 * and never a note.
 */
export function attendanceCsvTable(model: RunAttendance): { header: string[]; rows: (string | number)[][] } {
  const header = [
    "Group",
    "Name",
    ...model.weeks.map((week) => `Week ${week.weekNumber}`),
    "Came",
    "Of",
    "Left",
  ];
  const unfinished = ` (not ${model.ending})`;
  const rows: (string | number)[][] = [];
  for (const group of model.groups) {
    for (const person of group.people) {
      rows.push([
        group.name,
        person.name,
        ...person.cells.map((cell) =>
          cell.state === "mark" && cell.mark
            ? `${markWord(cell.mark)}${cell.saved ? unfinished : ""}`
            : cell.state === "not-held"
              ? "Not held"
              : "",
        ),
        person.came,
        person.of,
        person.left === null ? "" : (person.leftDateKey ?? "Yes"),
      ]);
    }
  }
  return { header, rows };
}
