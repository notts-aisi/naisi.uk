import "server-only";
import { londonClockLabel, londonDayLabel } from "@/lib/courses/londonLabels";
import {
  dayLabel,
  happened,
  type GridWeekTotal,
  type GroupSessionFacts,
  type ListedGroup,
} from "@/lib/courses/programmeAttendance";
import { NO_SESSION_THIS_WEEK } from "@/lib/courses/sessionChange/words";
import { addDaysToKey } from "@/lib/courses/weekPlan";
import { weekOpenPlace } from "@/lib/email/courseNudgeEmail";
import type { AttendanceStatus } from "@/lib/firestore/courseAttendance";
import { campusForWeek, sessionChangeForWeek, sessionModeForWeek } from "@/lib/firestore/courseGroups";

/**
 * A PROGRAMME'S OVERVIEW, BY WEEK: attendance by week across the whole
 * programme, and one row per group for a chosen week. Pure: everything is
 * worked out from what the Attendance tab already worked out
 * (`listGroups`, its rows and its sessions) and from each group's week as
 * the group's own page counts it (`groupWeekWorkView`), so no number here
 * is counted a second way.
 *
 * ── ATTENDANCE BY WEEK ──────────────────────────────────────────────────────
 * From FINISHED registers only: a mark saved on a register not finished yet
 * is the facilitator's draft and counts here for nobody (the Attendance tab
 * draws it, with a ring, as "so far"). Each mark is a cell of the tab's own
 * rows, read off the register of the group the person was in that week
 * (`groupForWeek`, through each row's `sessionOf`), so somebody moved between
 * groups is counted once, in that week's own group. "Came" is present, late
 * and left early, split into in the room and online as the register records
 * it; excused and absent count in "of". A session that did not happen, or
 * was cancelled, is no session: its group is in no count for that week.
 * Nothing here says how many sessions anybody may still miss.
 *
 * ── GROUPS IN A WEEK ────────────────────────────────────────────────────────
 * One row per group that still meets, in the order every tab lists them:
 * its facilitators, that week's session (its day and time, "moved" when that
 * week was moved on its own, "room to be confirmed" when no room is set),
 * how many have done its readings and the whole week (the group page's own
 * counts, handed in as `work`), and who came the week before and that week,
 * from the group's own finished register, its facilitators apart as the
 * group's page sets them apart (one holding a place in the group included),
 * so every number on a row is out of the same people. The week's own figure
 * above counts every mark, a facilitator's place included, as the
 * Attendance tab's total does.
 */

/** A week's marks on finished registers, by kind. */
export type WeekCounts = { room: number; online: number; excused: number; absent: number };

export type OverviewWeekRow = {
  weekNumber: number;
  /** "Week 1". */
  label: string;
  /** "w/c Mon 2 Nov", "this week", or "" when the week has no date. */
  when: string;
  thisWeek: boolean;
  /**
   * `not-met`: no group has met that week yet. `so-far`: some have, and not
   * every register of the week is finished. `done`: every group that met has
   * a finished register. `none`: no group holds a session that week.
   */
  state: "not-met" | "so-far" | "done" | "none";
  counts: WeekCounts;
  came: number;
  of: number;
  /** "52 of 54 came", "2 of 11 groups have met so far", "Not met yet", "No group meets in week 4". */
  line: string;
  /** "1 register not finished yet": a group that met whose register is not counted. Null with none. */
  unfinished: string | null;
  /** The bar in words, for assistive technology. */
  description: string;
};

export type OverviewGroupRow = {
  groupId: string;
  groupName: string;
  /** The group's page, on the chosen week. */
  href: string;
  /** "Ella Brooks", "Ella Brooks and Owen Price", or "No facilitator yet". */
  facilitators: string;
  /** "Today, 5:30pm · moved · room to be confirmed", "No session this week". */
  session: string;
  /** That week's session was moved on its own. */
  moved: boolean;
  /** "3 of 5", "No readings", "Not published yet", "Not tracked", "Nobody yet". */
  readings: string;
  coursework: string;
  /** The week before's came, or null for week 1. */
  cameBefore: string | null;
  /** The chosen week's came: "5 of 5", "Tonight", "Tomorrow", "Not finished", "No register yet". */
  came: string;
};

export type OverviewGroupsWeek = {
  weekNumber: number;
  /** "Groups in week 2". */
  heading: string;
  /** The week chooser's options, every week of the run. */
  options: { value: number; label: string }[];
  /** "Week 1 came", or null for week 1. */
  beforeHeading: string | null;
  /** "Week 2 came". */
  cameHeading: string;
  /** "Week 2 session". */
  sessionHeading: string;
  rows: OverviewGroupRow[];
};

export type OverviewByWeek = {
  /** Null when the run has no weeks or no groups: `blank` says which. */
  weeks: OverviewWeekRow[];
  groups: OverviewGroupsWeek | null;
  blank: string | null;
};

/** What a group's week, as its own page counts it, says on the Overview. */
export type GroupWorkCount =
  | { kind: "counted"; people: number; readingsDone: number | null; weekDone: number }
  /** The week isn't published yet, so nobody can open it. */
  | { kind: "unpublished" }
  /** The group's page draws no count for the week: not written as blocks, an incubator's, or not read. */
  | { kind: "untracked" };

export const NO_WEEKS_YET = "This run has no weeks yet, so it has no registers.";
export const NO_GROUPS_YET = "This run has no groups yet, so it has no registers.";
export const NOT_MET_YET = "Not met yet";
export const NO_FACILITATOR_YET = "No facilitator yet";

const CAME: ReadonlySet<AttendanceStatus> = new Set(["present", "late", "left-early"]);

/** Whether a session's register counts here: held, happened and finished. */
function counts(facts: GroupSessionFacts | undefined): boolean {
  return Boolean(facts && facts.held && facts.finished && happened(facts));
}

/**
 * The marks on finished registers in one week, for every group or one
 * (`groupId`): each listed row's cell, counted for the group whose register
 * holds it, once. `leaveOut` drops some people from a group's own figure: its
 * facilitators, whom the group's page sets apart from its people.
 */
export function weekCounts(
  listed: readonly ListedGroup[],
  weekNumber: number,
  groupId: string | null = null,
  leaveOut: ReadonlySet<string> = new Set(),
): WeekCounts {
  const out: WeekCounts = { room: 0, online: 0, excused: 0, absent: 0 };
  const owners = new Map<GroupSessionFacts, string>();
  for (const entry of listed) {
    const facts = entry.sessions.get(weekNumber);
    if (facts) owners.set(facts, entry.group.id);
  }
  for (const entry of listed) {
    for (const { row, sessionOf } of entry.people) {
      const facts = sessionOf(weekNumber);
      if (!facts || !counts(facts)) continue;
      if (groupId !== null && owners.get(facts) !== groupId) continue;
      if (leaveOut.has(row.uid)) continue;
      const cell = row.cells.find((each) => each.weekNumber === weekNumber);
      if (!cell || cell.state !== "mark" || !cell.mark || cell.saved) continue;
      if (CAME.has(cell.mark)) {
        if (cell.online) out.online += 1;
        else out.room += 1;
      } else if (cell.mark === "excused") out.excused += 1;
      else out.absent += 1;
    }
  }
  return out;
}

const cameOf = (each: WeekCounts) => each.room + each.online;
const ofOf = (each: WeekCounts) => each.room + each.online + each.excused + each.absent;

/** "Week 1: in the room 47, online 5, excused 1, absent 1." */
function barWords(weekNumber: number, each: WeekCounts): string {
  return `Week ${weekNumber}: in the room ${each.room}, online ${each.online}, excused ${each.excused}, absent ${each.absent}.`;
}

/**
 * ATTENDANCE BY WEEK, a row a week of the run. `slots` dates each taught week
 * from the run's own plan (the day its week starts); `thisWeek` is the
 * programme's week now, or null outside one.
 *
 * A WHOLE WEEK'S FIGURE IS THE ATTENDANCE TAB'S OWN. Once every group that
 * holds a dated session that week has a finished register, "came" and "of"
 * (and online) are the tab's weekly total for the week (`totals`, from
 * `buildRunAttendance`), whatever that total counts, so the two never
 * differ; the excused and absent split is this file's count of the same
 * marks, held inside the tab's "of". Until then, the figures are the
 * finished registers' alone. A held session with no date and no finished
 * register has no day to meet on: it keeps the week from no state, and its
 * group's row says it has no date yet.
 */
export function attendanceByWeek(input: {
  listed: readonly ListedGroup[];
  weeks: readonly number[];
  slots: readonly { weekNumber: number; startKey: string }[];
  thisWeek: number | null;
  /** The Attendance tab's weekly totals (`buildRunAttendance(...).totals`). */
  totals: readonly GridWeekTotal[];
  /** "finished" or "pushed": the register's own word for finishing it. */
  ending: "finished" | "pushed";
}): OverviewWeekRow[] {
  const { listed, weeks, slots, thisWeek, totals, ending } = input;
  return weeks.map((weekNumber): OverviewWeekRow => {
    const slot = slots.find((each) => each.weekNumber === weekNumber) ?? null;
    const isThisWeek = weekNumber === thisWeek;
    const when = isThisWeek ? "this week" : slot ? `w/c ${dayLabel(slot.startKey)}` : "";
    // The groups holding a session the week can wait for: held, and dated or already counted.
    const held = listed
      .map((entry) => entry.sessions.get(weekNumber))
      .filter((facts): facts is GroupSessionFacts => Boolean(facts?.held && (facts.startsAt !== null || counts(facts))));
    const counted = held.filter((facts) => counts(facts)).length;
    const met = held.filter((facts) => facts.ended || counts(facts)).length;
    const own = weekCounts(listed, weekNumber);
    const tab = totals.find((total) => total.weekNumber === weekNumber) ?? null;
    const whole = counted === held.length && (held.length > 0 || (tab?.of ?? 0) > 0);
    // A whole week reads the tab's total; the split of what did not come is this file's, inside it.
    const each: WeekCounts =
      whole && tab
        ? (() => {
            const away = Math.max(0, tab.of - tab.came);
            const excused = Math.min(own.excused, away);
            return { room: tab.came - tab.online, online: tab.online, excused, absent: away - excused };
          })()
        : own;
    const base = {
      weekNumber,
      label: `Week ${weekNumber}`,
      when,
      thisWeek: isThisWeek,
      counts: each,
      came: cameOf(each),
      of: ofOf(each),
      description: barWords(weekNumber, each),
    };
    if (whole) return { ...base, state: "done", line: `${base.came} of ${base.of} came`, unfinished: null };
    if (held.length === 0) {
      return { ...base, state: "none", line: `No group meets in week ${weekNumber}`, unfinished: null };
    }
    if (met === 0) return { ...base, state: "not-met", line: NOT_MET_YET, unfinished: null };
    const waiting = met - counted;
    const unfinished = waiting > 0 ? `${waiting} ${waiting === 1 ? "register" : "registers"} not ${ending} yet` : null;
    return {
      ...base,
      state: "so-far",
      line: `${met} of ${held.length} ${held.length === 1 ? "group has" : "groups have"} met so far`,
      unfinished,
    };
  });
}

/**
 * THE WEEK THE GROUPS ARE SHOWN FOR: the week asked for when it is one of the
 * run's, else the programme's week now, else the latest week whose slot has
 * begun, else the first.
 */
export function chosenWeekOf(input: {
  asked: number | null;
  weeks: readonly number[];
  slots: readonly { weekNumber: number; startKey: string }[];
  thisWeek: number | null;
  todayKey: string;
}): number | null {
  const { asked, weeks, slots, thisWeek, todayKey } = input;
  if (weeks.length === 0) return null;
  if (asked !== null && weeks.includes(asked)) return asked;
  if (thisWeek !== null && weeks.includes(thisWeek)) return thisWeek;
  const begun = slots.filter((slot) => slot.startKey <= todayKey && weeks.includes(slot.weekNumber));
  if (begun.length > 0) return begun[begun.length - 1].weekNumber;
  return weeks[0];
}

/** One group's came for one week, from its own register. */
function cameWords(entry: ListedGroup, listed: readonly ListedGroup[], weekNumber: number, ending: "finished" | "pushed"): string {
  const facts = entry.sessions.get(weekNumber);
  if (!facts) return "No session";
  if (!facts.held) return facts.session.cancelled ? "Cancelled" : "Not held";
  if (counts(facts)) {
    // The group's people as its own page lists them: its facilitators apart, even one holding a place in it.
    const each = weekCounts(listed, weekNumber, entry.group.id, new Set(entry.group.facilitatorUids));
    return `${cameOf(each)} of ${ofOf(each)}`;
  }
  if (facts.tag === "tonight") return "Tonight";
  if (facts.tag === "today") return "Today";
  if (facts.tag === "tomorrow") return "Tomorrow";
  if (facts.ended) return `Not ${ending}`;
  if (!facts.startsAt) return "No date yet";
  return "No register yet";
}

/** That week's session, in words: its day and time, and what is different about it. */
function sessionWords(entry: ListedGroup, weekNumber: number, todayKey: string): { words: string; moved: boolean } {
  const facts = entry.sessions.get(weekNumber);
  if (!facts) return { words: NO_SESSION_THIS_WEEK, moved: false };
  const { group } = entry;
  const tomorrowKey = addDaysToKey(todayKey, 1);
  const key = facts.session.dateKey;
  const day = !key
    ? "No date yet"
    : key === todayKey
      ? "Today"
      : key === tomorrowKey
        ? "Tomorrow"
        : facts.startsAt
          ? londonDayLabel(facts.startsAt)
          : dayLabel(key);
  const at = key && facts.startsAt ? `${day}, ${londonClockLabel(facts.startsAt)}` : day;
  const change = sessionChangeForWeek(group, facts.session.weekId);
  const moved = change?.kind === "moved";
  const extras: string[] = [];
  if (!facts.held) {
    extras.push(facts.session.cancelled ? "cancelled" : "not held");
  } else {
    if (moved) extras.push("moved");
    if (change?.kind === "online") extras.push("online this week");
    const place = weekOpenPlace(facts.session.session, sessionModeForWeek(group, facts.session.weekId), campusForWeek(group, facts.session.weekId));
    if (place.roomToBeConfirmed) extras.push("room to be confirmed");
  }
  return { words: [at, ...extras].join(" · "), moved };
}

/** A group's readings or whole week done, as a cell says it. */
function workWords(count: GroupWorkCount | undefined, which: "readings" | "week"): string {
  if (!count || count.kind === "untracked") return "Not tracked";
  if (count.kind === "unpublished") return "Not published yet";
  if (count.people === 0) return "Nobody yet";
  if (which === "readings") return count.readingsDone === null ? "No readings" : `${count.readingsDone} of ${count.people}`;
  return `${count.weekDone} of ${count.people}`;
}

/** Facilitators' names in a sentence: "Ella", "Ella and Owen", "Ella, Owen and Sam". */
function namesLine(names: readonly string[]): string {
  if (names.length === 0) return NO_FACILITATOR_YET;
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** ONE ROW PER GROUP FOR THE CHOSEN WEEK. */
export function groupsInWeek(input: {
  listed: readonly ListedGroup[];
  weeks: readonly number[];
  weekNumber: number;
  thisWeek: number | null;
  work: ReadonlyMap<string, GroupWorkCount>;
  ending: "finished" | "pushed";
  todayKey: string;
  /** The programme's own address, no trailing slash. */
  programmePath: string;
}): OverviewGroupsWeek {
  const { listed, weeks, weekNumber, thisWeek, work, ending, todayKey, programmePath } = input;
  const at = weeks.indexOf(weekNumber);
  const before = at > 0 ? weeks[at - 1] : null;
  return {
    weekNumber,
    heading: `Groups in week ${weekNumber}`,
    options: weeks.map((value) => ({ value, label: value === thisWeek ? `Week ${value} (this week)` : `Week ${value}` })),
    beforeHeading: before === null ? null : `Week ${before} came`,
    cameHeading: `Week ${weekNumber} came`,
    sessionHeading: `Week ${weekNumber} session`,
    rows: listed.map((entry): OverviewGroupRow => {
      const session = sessionWords(entry, weekNumber, todayKey);
      const count = work.get(entry.group.id);
      return {
        groupId: entry.group.id,
        groupName: entry.group.name,
        href: `${programmePath}/groups/${encodeURIComponent(entry.group.id)}?week=${weekNumber}`,
        facilitators: namesLine(entry.facilitators.map((person) => person.name)),
        session: session.words,
        moved: session.moved,
        readings: workWords(count, "readings"),
        coursework: workWords(count, "week"),
        cameBefore: before === null ? null : cameWords(entry, listed, before, ending),
        came: cameWords(entry, listed, weekNumber, ending),
      };
    }),
  };
}
