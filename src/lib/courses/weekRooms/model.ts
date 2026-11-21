import { campusLabel } from "../campus";
import { onlineForRooms, roomSourceOf, type RoomSource } from "../sessionChange/room";
import { resolveSessions, sessionInstants, type ResolvedSession } from "../sessions";
import { clockWords, dayWords } from "../sessionChange/words";
import { addDaysToKey, isValidDateKey, londonDateKey } from "../weekPlan";
import { attendanceDocId, registerIsTaken } from "@/lib/firestore/courseAttendance";
import {
  campusForWeek,
  sessionChangeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { rowAnchor, weekRoomsPath } from "./paths";
import {
  NEXT_WEEK,
  NO_SESSIONS_MARK,
  THIS_WEEK,
  weekColumnWords,
  weekLinkWords,
  weekOfWords,
} from "./words";
import { weekLinkKind } from "../meetingLink/plan";

/**
 * THE WEEK'S ROOMS AND THE TERM'S ROOMS, worked out from records. PURE: no
 * reads and no clock but the one handed in. `./load.ts` reads the records and
 * hands them here; the pages draw what comes back.
 *
 * A ROW IS ONE GROUP'S SESSION IN ONE CALENDAR WEEK, Monday to Sunday in
 * London, as every group's sessions resolve (`resolveSessions`, the one
 * resolver every schedule reads). Only the week's first session
 * (`occurrence` 1): a one-week change of room, the writer behind every row's
 * field, changes that session alone. A group whose week runs across two
 * calendar weeks shows in the week its session falls in; a group with two
 * sessions in one calendar week (a moved week beside the next) shows twice,
 * each row naming its week.
 *
 * WHAT A ROW SAYS, all from the group and that session's register:
 *
 *  - the day and time and the campus that week (`campusForWeek`);
 *  - THAT WEEK'S ROOM: the room the session resolves to, "" when there is
 *    none (To be confirmed on the page), and where it comes from: the week's
 *    own room, the group's usual room, or none (`roomSourceOf`);
 *  - the meeting link, set or missing, and whether it is the group's for every
 *    week, the week's own, or the link it had before a later week's press
 *    (`weekLinkKind`, the facilitator's list's decision too). Never the link itself;
 *  - how many are away (their line says excused, or they said they can't make
 *    it), how many said they are joining online, and how many requests about
 *    the session wait for this reader (counted by `./load.ts` the way the
 *    programme's Requests line counts them). Away and online count only the
 *    people in the group FOR THAT WEEK (`inGroup`, which `./load.ts` asks of
 *    the run's places): a line left on the register by somebody since moved to another
 *    group is not counted here, as the group's own page does not count it.
 *
 * A ROW'S ROOM IS CHANGED HERE ONLY WHEN THE ROOM-ONLY CHANGE WOULD TAKE IT
 * (`../sessionChange/room.ts`): a session still to come, not called off and
 * not held online (the week's own mode, or the Online campus). Those rows say
 * so in place of the field.
 *
 * VISITS ARE NOT COUNTED. One-week visits to another group's session are not
 * on this site yet; when they are, `RoomRow` takes a count beside `online`.
 */

/** Monday of the London calendar week a date key falls in. */
export function mondayOf(dateKey: string): string {
  if (!isValidDateKey(dateKey)) return "";
  const day = new Date(`${dateKey}T12:00:00Z`).getUTCDay();
  return addDaysToKey(dateKey, -((day + 6) % 7));
}

/** One programme as the pages are handed it: its run, the run's live groups and what was read for them. */
export type ProgrammeRecords = {
  programmeId: string;
  /** "AGI Strategy", the programme's short name. */
  programmeName: string;
  run: CourseRunDoc;
  /** The run's groups that still meet, in the order every tab lists them. */
  groups: readonly CourseGroupDoc[];
  /** Registers read, by `attendanceDocId`. A register not written yet is absent. */
  registers: ReadonlyMap<string, Readonly<Record<string, unknown>>>;
  /** Requests waiting for this reader, by `${groupId}__${sessionKey}`. */
  requests: ReadonlyMap<string, number>;
  /**
   * Whether somebody's group for a week was this group, asked of the run's
   * places by `./load.ts` (`inGroupForWeek`). Absent: every line on a register
   * is counted (the term's grid reads no counts).
   */
  inGroup?: (uid: string, groupId: string, weekNumber: number) => boolean;
};

export type RowState = "cancelled" | "online" | "met" | "started" | null;

export type RoomRow = {
  /** `${groupId}__${sessionKey}`: unique on a page, and the row's anchor. */
  key: string;
  programmeId: string;
  programmeName: string;
  runId: string;
  groupId: string;
  groupName: string;
  weekNumber: number;
  /** The session's date, which the change route checks the press against. */
  dateKey: string;
  /** The session's stored start, which a room change keeps. Never printed: `when` is. */
  start: string;
  /** "Tue 17 Nov, 5:30pm". */
  when: string;
  /** "University Park", or "". */
  campus: string;
  /** That week's room, trimmed; "" for none. */
  room: string;
  /** The group's room for every week, trimmed; "" for none. */
  usualRoom: string;
  /** Where that week's room comes from: its own, the usual room, or none. */
  roomSource: RoomSource;
  /** A one-week move changed the session (a room set here never does). */
  moved: boolean;
  /** Why the room is not changed here; null when it is. */
  state: RowState;
  /** `weekLinkKind`'s answer: a link set for the week, every week's, one kept from before, or none. */
  link: { kind: "every" | "week" | "kept" | "none"; words: string };
  away: number;
  online: number;
  requests: number;
};

/** The calendar weeks the week picker offers. */
export type WeekChoice = {
  monday: string;
  /** "w/c Mon 9 Nov". */
  label: string;
  /** "this week", "next week", "no sessions", or "". */
  tag: string;
  hasSessions: boolean;
};

export type WeekRoomsView = {
  /** The Monday shown. */
  monday: string;
  /** "w/c Mon 16 Nov". */
  weekLabel: string;
  weeks: WeekChoice[];
  previous: string | null;
  next: string | null;
  /** The programmes shown, filtered or not: their chips and how many rows each has this week. */
  programmes: { programmeId: string; programmeName: string; rows: number }[];
  /** Every row of the week across every programme the reader may see, before the filter. */
  allRows: number;
  rows: RoomRow[];
  counts: { notBooked: number; linksSet: number; away: number; online: number; requests: number };
  /** With no rows: the nearest week that has some, after this one first. */
  elsewhere: { monday: string; direction: "next" | "last" } | null;
};

/** A session's register, as read, or undefined. */
function registerOf(records: ProgrammeRecords, groupId: string, session: ResolvedSession) {
  return records.registers.get(attendanceDocId(records.run.id, groupId, session.weekNumber, session.occurrence));
}

/** Who is counted on a register: everybody, or only those this says were in the group that week. */
type Counted = (uid: string) => boolean;
const everybody: Counted = () => true;

/** How many are away on a register: a line that says excused, or somebody's word in advance. */
export function awayOn(register: Readonly<Record<string, unknown>> | undefined, counted: Counted = everybody): number {
  if (!register) return 0;
  const away = new Set<string>();
  const records = register.records;
  if (records && typeof records === "object") {
    for (const [uid, mark] of Object.entries(records as Record<string, unknown>)) if (mark === "excused" && counted(uid)) away.add(uid);
  }
  const said = register.excusedInAdvance;
  if (said && typeof said === "object") for (const uid of Object.keys(said as Record<string, unknown>)) if (counted(uid)) away.add(uid);
  return away.size;
}

/** How many said they are joining online, on a register. */
export function onlineOn(register: Readonly<Record<string, unknown>> | undefined, counted: Counted = everybody): number {
  const said = register?.onlineSaid;
  return said && typeof said === "object" ? Object.keys(said as Record<string, unknown>).filter(counted).length : 0;
}

/** Who a group's row counts for one week: with the run's places, those in the group that week; without, everybody. */
function countedFor(records: Pick<ProgrammeRecords, "inGroup">, groupId: string, weekNumber: number): Counted {
  const inGroup = records.inGroup;
  return inGroup ? (uid) => inGroup(uid, groupId, weekNumber) : everybody;
}

const nameOf = (group: CourseGroupDoc) => group.name.trim() || "Untitled group";

/** The first session of each week a group holds, dated. */
function datedFirstSessions(run: CourseRunDoc, group: CourseGroupDoc): ResolvedSession[] {
  return resolveSessions(run, group).filter((session) => session.occurrence === 1 && session.dateKey !== "");
}

/** What is in force for one session, as a row says it. */
export function stateOf(
  group: CourseGroupDoc,
  session: ResolvedSession,
  register: Readonly<Record<string, unknown>> | undefined,
  now: Date,
): RowState {
  if (session.cancelled) return "cancelled";
  if (registerIsTaken(register)) return "met";
  const { startsAt } = sessionInstants(session);
  if (!startsAt || startsAt.getTime() <= now.getTime()) return "started";
  if (onlineForRooms(group, session.weekId)) return "online";
  return null;
}

/** One row, from a group's session and what was read for it. */
export function rowOf(records: ProgrammeRecords, group: CourseGroupDoc, session: ResolvedSession, now: Date): RoomRow {
  const register = registerOf(records, group.id, session);
  // Which link the week reads, by the one decision the facilitator's list of links asks too.
  const kind = weekLinkKind(group, session.weekId);
  const link: RoomRow["link"] = { kind, words: weekLinkWords(kind, session.weekNumber) };
  return {
    key: `${group.id}__${session.sessionKey}`,
    programmeId: records.programmeId,
    programmeName: records.programmeName,
    runId: records.run.id,
    groupId: group.id,
    groupName: nameOf(group),
    weekNumber: session.weekNumber,
    dateKey: session.dateKey,
    start: session.session.startTimeLocal,
    when: `${dayWords(session.dateKey)}, ${clockWords(session.session.startTimeLocal)}`,
    campus: campusLabel(campusForWeek(group, session.weekId)),
    room: session.session.location.trim(),
    usualRoom: group.session.location.trim(),
    roomSource: roomSourceOf(group, session.weekId),
    moved: sessionChangeForWeek(group, session.weekId)?.kind === "moved",
    state: stateOf(group, session, register, now),
    link,
    away: awayOn(register, countedFor(records, group.id, session.weekNumber)),
    online: onlineOn(register, countedFor(records, group.id, session.weekNumber)),
    requests: records.requests.get(`${group.id}__${session.sessionKey}`) ?? 0,
  };
}

/**
 * Every session the week's rows can come from, without anything read about
 * them: which register ids a week's view needs, and which weeks have rows.
 */
export function sessionsInWeek(
  programmes: readonly Pick<ProgrammeRecords, "run" | "groups">[],
  monday: string,
): { run: CourseRunDoc; group: CourseGroupDoc; session: ResolvedSession }[] {
  const sunday = addDaysToKey(monday, 6);
  const out: { run: CourseRunDoc; group: CourseGroupDoc; session: ResolvedSession }[] = [];
  for (const { run, groups } of programmes) {
    for (const group of groups) {
      for (const session of datedFirstSessions(run, group)) {
        if (session.dateKey >= monday && session.dateKey <= sunday) out.push({ run, group, session });
      }
    }
  }
  return out;
}

/** The register ids a week's rows read: one per row. */
export function registerIdsForWeek(programmes: readonly Pick<ProgrammeRecords, "run" | "groups">[], monday: string): string[] {
  return sessionsInWeek(programmes, monday).map(({ run, group, session }) =>
    attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence),
  );
}

/** The Mondays of every week with a session, across these programmes. */
function mondaysWithSessions(programmes: readonly Pick<ProgrammeRecords, "run" | "groups">[]): Set<string> {
  const out = new Set<string>();
  for (const { run, groups } of programmes) {
    for (const group of groups) for (const session of datedFirstSessions(run, group)) out.add(mondayOf(session.dateKey));
  }
  return out;
}

/** The week a page opens on: the one asked for (any day of it), else this week. */
export function chosenMonday(asked: string | null | undefined, now: Date): string {
  return asked && isValidDateKey(asked) ? mondayOf(asked) : mondayOf(londonDateKey(now));
}

/**
 * The week picker: every week from the first with a session to the last, and
 * the week shown and this week wherever they fall, each tagged this week,
 * next week or no sessions.
 */
export function weekChoices(withSessions: ReadonlySet<string>, shown: string, now: Date): WeekChoice[] {
  const today = mondayOf(londonDateKey(now));
  const keys = [...withSessions, shown, today].filter(Boolean).sort();
  if (keys.length === 0) return [];
  const out: WeekChoice[] = [];
  // Bounded: a term is weeks long, and a year is 53 of them at most.
  for (let monday = keys[0], i = 0; monday <= keys[keys.length - 1] && i < 60; monday = addDaysToKey(monday, 7), i++) {
    const has = withSessions.has(monday);
    out.push({
      monday,
      label: weekOfWords(dayWords(monday)),
      tag: monday === today ? THIS_WEEK : monday === addDaysToKey(today, 7) ? NEXT_WEEK : has ? "" : NO_SESSIONS_MARK,
      hasSessions: has,
    });
  }
  return out;
}

/**
 * THE WEEK'S ROOMS: every programme the reader may see (already decided by
 * the loader), one row per group's session in the week, and the counts.
 * `only` narrows the rows to one programme; the chips still count every one.
 */
export function weekRoomsView(input: {
  programmes: readonly ProgrammeRecords[];
  monday: string;
  only: string | null;
  now: Date;
}): WeekRoomsView {
  const { monday, now } = input;
  const shown = input.only ? input.programmes.filter((each) => each.programmeId === input.only) : input.programmes;
  const sunday = addDaysToKey(monday, 6);
  const rowsOf = (records: ProgrammeRecords): RoomRow[] => {
    const rows: RoomRow[] = [];
    for (const group of records.groups) {
      for (const session of datedFirstSessions(records.run, group)) {
        if (session.dateKey >= monday && session.dateKey <= sunday) rows.push(rowOf(records, group, session, now));
      }
    }
    return rows;
  };
  const byProgramme = input.programmes.map((records) => ({ records, rows: rowsOf(records) }));
  const rows = byProgramme.filter(({ records }) => shown.includes(records)).flatMap(({ rows: each }) => each);

  const withSessions = mondaysWithSessions(shown);
  const weeks = weekChoices(withSessions, monday, now);
  const at = weeks.findIndex((week) => week.monday === monday);
  const after = [...withSessions].filter((key) => key > monday).sort();
  const before = [...withSessions].filter((key) => key < monday).sort();
  const elsewhere =
    rows.length > 0
      ? null
      : after.length
        ? { monday: after[0], direction: "next" as const }
        : before.length
          ? { monday: before[before.length - 1], direction: "last" as const }
          : null;

  return {
    monday,
    weekLabel: weekOfWords(dayWords(monday)),
    weeks,
    previous: at > 0 ? weeks[at - 1].monday : null,
    next: at >= 0 && at < weeks.length - 1 ? weeks[at + 1].monday : null,
    programmes: byProgramme.map(({ records, rows: each }) => ({
      programmeId: records.programmeId,
      programmeName: records.programmeName,
      rows: each.length,
    })),
    allRows: byProgramme.reduce((sum, { rows: each }) => sum + each.length, 0),
    rows,
    counts: {
      // Only rows that can take a room: a session held online, called off or past needs none.
      notBooked: rows.filter((row) => row.state === null && row.room === "").length,
      linksSet: rows.filter((row) => row.link.kind !== "none").length,
      away: rows.reduce((sum, row) => sum + row.away, 0),
      online: rows.reduce((sum, row) => sum + row.online, 0),
      requests: rows.reduce((sum, row) => sum + row.requests, 0),
    },
    elsewhere,
  };
}

// ---------------------------------------------------------------------------
// The term's rooms
// ---------------------------------------------------------------------------

export type CellMark = "moved" | "cancelled" | "online" | "met" | "started";

export type TermCell =
  | { kind: "none"; weekNumber: number }
  | {
      kind: "session";
      weekNumber: number;
      /** "Tue 17 Nov". */
      day: string;
      /** That week's room, trimmed; "" for none. */
      room: string;
      /** Where the room comes from: the week's own, the usual room, or none. */
      roomSource: RoomSource;
      /** The session's date, which a room-only change checks the press against. */
      dateKey: string;
      /** Why the room is not changed in the grid; null when it is. */
      state: RowState;
      marks: CellMark[];
      /** The week's rooms page, that week, that programme, this row in view. */
      href: string;
    };

export type TermRow = { groupId: string; groupName: string; usualRoom: string; cells: TermCell[] };

export type TermSection = {
  programmeId: string;
  programmeName: string;
  /** The run's taught weeks, in plan order: "Week 3", the first day of its slot in words, and as a date key. */
  weeks: { weekNumber: number; label: string; from: string; fromKey: string }[];
  rows: TermRow[];
};

/** The register ids the term's grid reads: one per group and taught week with a dated session. */
export function registerIdsForTerm(programmes: readonly Pick<ProgrammeRecords, "run" | "groups">[]): string[] {
  const out: string[] = [];
  for (const { run, groups } of programmes) {
    for (const group of groups) {
      for (const session of datedFirstSessions(run, group)) out.push(attendanceDocId(run.id, group.id, session.weekNumber, 1));
    }
  }
  return out;
}

/** What a cell marks, beside its room. */
export function marksOf(
  group: CourseGroupDoc,
  session: ResolvedSession,
  register: Readonly<Record<string, unknown>> | undefined,
  now: Date,
): CellMark[] {
  if (session.cancelled) return ["cancelled"];
  const marks: CellMark[] = [];
  if (onlineForRooms(group, session.weekId)) marks.push("online");
  if (sessionChangeForWeek(group, session.weekId)?.kind === "moved") marks.push("moved");
  const state = stateOf(group, session, register, now);
  if (state === "met") marks.push("met");
  else if (state === "started") marks.push("started");
  return marks;
}

/**
 * THE TERM'S ROOMS: a section per programme, a row per group, a column per
 * taught week of the run, each cell that week's room and what is unusual
 * about it. Reading only: every cell is a link to its week's rooms.
 */
export function termRoomsView(input: { roundId: string; programmes: readonly ProgrammeRecords[]; now: Date }): TermSection[] {
  return input.programmes.map((records) => {
    const { run } = records;
    const weeks: TermSection["weeks"] = [];
    run.weekPlan.forEach((entry, index) => {
      if (entry.kind !== "week") return;
      const from = isValidDateKey(run.startDate) ? addDaysToKey(run.startDate, index * 7) : "";
      weeks.push({ weekNumber: entry.weekNumber, label: weekColumnWords(entry.weekNumber), from: from ? dayWords(from) : "", fromKey: from });
    });
    const rows = records.groups.map((group): TermRow => {
      const sessions = datedFirstSessions(run, group);
      return {
        groupId: group.id,
        groupName: nameOf(group),
        usualRoom: group.session.location.trim(),
        cells: weeks.map(({ weekNumber }): TermCell => {
          const session = sessions.find((each) => each.weekNumber === weekNumber);
          if (!session) return { kind: "none", weekNumber };
          const register = registerOf(records, group.id, session);
          return {
            kind: "session",
            weekNumber,
            day: dayWords(session.dateKey),
            room: session.session.location.trim(),
            roomSource: roomSourceOf(group, session.weekId),
            dateKey: session.dateKey,
            state: stateOf(group, session, register, input.now),
            marks: marksOf(group, session, register, input.now),
            href: `${weekRoomsPath(input.roundId, { week: mondayOf(session.dateKey), programme: records.programmeId })}#${rowAnchor(`${group.id}__${session.sessionKey}`)}`,
          };
        }),
      };
    });
    return { programmeId: records.programmeId, programmeName: records.programmeName, weeks, rows };
  });
}
