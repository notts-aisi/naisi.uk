import {
  isUsableGrid,
  minuteLabel,
  minutesFromTimeLocal,
  type AvailabilityGrid,
  type SessionSlot,
} from "@/lib/admissions/availability";
import { NEW_GROUP_SESSION_MINUTES, SESSION_LENGTH_PRESETS } from "@/lib/courses/sessionLength";
import { compareGroupsByMeeting } from "@/lib/firestore/courseGroups";
import { own } from "../keys";
import type { ProgrammeKind } from "../model";
import type { PaintedWeek } from "./paintedWeek";

/**
 * THE TIMES PICTURE: how many of the people holding a place on a programme
 * are free for a whole session at each start time of the week, so an admin
 * can choose when a run's groups meet.
 *
 * ## What is counted
 *
 *  - WHO: the people `holdingOf()` says hold a place on the programme now
 *    (`placeHoldersOn` in `./holders.ts`, asked by the loader). Somebody who
 *    gave their place back holds none, and an invitation counts once it is
 *    accepted. Of them, only somebody who painted a week is counted in a
 *    cell: "never said" is not "free at no time".
 *  - WHEN: a cell is a weekday and a start time, and a person is counted in
 *    it when their painted week covers the WHOLE session from that start, by
 *    the one reading the allocation board uses (`./paintedWeek.ts`).
 *  - THE START TIMES: every whole hour from the form's grid opening at which
 *    a session of the counted length still ends by the time the grid closes.
 *    The grid is the form's own, so nothing here names an hour: 09:00 to
 *    21:00 and two hours give 9am to 7pm.
 *  - THE LENGTH: what the run's groups last, or a length picked from the ones
 *    the group editor offers (`lengthFromGroups`, `lengthOptions`).
 *
 * A group is counted at its OWN session, its day, start and length, which is
 * the question the board's fit marks answer, so the two always agree.
 *
 * Nothing here is stored or sent anywhere: the loader hands back what this
 * module works out, and only an admin's page asks.
 *
 * Pure, with no server import.
 */

/** Monday first, as a week is read. Each is a `Date.getDay()` number. */
export const WEEK_FROM_MONDAY: readonly number[] = [1, 2, 3, 4, 5, 6, 0];

/** How many of the highest counts the Best times list shows. */
export const BEST_TIMES_SHOWN = 6;

/** A group of the run, reduced to what the picture reads. */
export type TimesGroup = { id: string; name: string; session: SessionSlot };

/** Somebody who holds a place, with what their painted week says. */
export type TimesPerson = { uid: string; name: string; week: PaintedWeek };

/**
 * Has this group a weekly session somebody could be free for? A group made
 * in the run editor always has a day, and its start time can be left empty.
 */
export function hasSessionTime(session: SessionSlot): boolean {
  return (
    Number.isInteger(session.weekday) &&
    session.weekday >= 0 &&
    session.weekday <= 6 &&
    minutesFromTimeLocal(session.startTimeLocal) !== null &&
    Number.isFinite(session.durationMinutes) &&
    session.durationMinutes > 0
  );
}

/**
 * The start times down the side, in minutes past midnight: every whole hour
 * from the grid's opening at which a session of `minutes` ends by the time
 * the grid closes. Empty for a grid nobody can draw on, or a length longer
 * than the grid.
 */
export function startRows(grid: AvailabilityGrid, minutes: number): number[] {
  const rows: number[] = [];
  if (!isUsableGrid(grid) || !Number.isFinite(minutes) || minutes <= 0) return rows;
  for (let start = Math.ceil(grid.startMinute / 60) * 60; start + minutes <= grid.endMinute; start += 60) {
    rows.push(start);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// The length counted
// ---------------------------------------------------------------------------

/** Where the length the picture counts comes from. */
export type LengthSource =
  /** Every group with a time set lasts this long. */
  | { kind: "groups"; minutes: number }
  /**
   * The groups differ. `lengths` is each length a group has, shortest first,
   * and `most` the one most groups have (the longer, when two are level).
   */
  | { kind: "mixed"; lengths: number[]; most: number }
  /** No group has a time set yet. */
  | { kind: "none" };

export function lengthFromGroups(groups: readonly TimesGroup[]): LengthSource {
  const tally = new Map<number, number>();
  for (const group of groups) {
    if (!hasSessionTime(group.session)) continue;
    const minutes = group.session.durationMinutes;
    tally.set(minutes, (tally.get(minutes) ?? 0) + 1);
  }
  const lengths = [...tally.keys()].sort((a, b) => a - b);
  if (lengths.length === 0) return { kind: "none" };
  if (lengths.length === 1) return { kind: "groups", minutes: lengths[0] };
  let most = lengths[0];
  for (const minutes of lengths) {
    if ((tally.get(minutes) ?? 0) >= (tally.get(most) ?? 0)) most = minutes;
  }
  return { kind: "mixed", lengths, most };
}

/**
 * How long a programme of each kind usually meets, in person (the committee's
 * word, 28 October 2026): a fellowship's discussion group for two hours, an
 * incubator for an afternoon of four. Counted while no group of the run has a
 * time to say otherwise.
 */
const USUAL_MINUTES: Record<ProgrammeKind, number> = { fellowship: 120, incubator: 240 };

/** The length a programme of this kind usually meets for, or a new group's when there is no kind to go by. */
export function usualLength(kind: ProgrammeKind | null): number {
  return kind ? (own(USUAL_MINUTES, kind) ?? NEW_GROUP_SESSION_MINUTES) : NEW_GROUP_SESSION_MINUTES;
}

/** The length counted when nobody has picked one: the groups' own, else the programme's usual length. */
export function defaultLength(source: LengthSource, kind: ProgrammeKind | null = null): number {
  if (source.kind === "groups") return source.minutes;
  if (source.kind === "mixed") return source.most;
  return usualLength(kind);
}

/**
 * The lengths that can be picked: the ones the group editor offers, and any
 * other length a group of the run already has, shortest first.
 */
export function lengthOptions(groups: readonly TimesGroup[]): number[] {
  const options = new Set<number>(SESSION_LENGTH_PRESETS);
  for (const group of groups) {
    if (hasSessionTime(group.session)) options.add(group.session.durationMinutes);
  }
  return [...options].sort((a, b) => a - b);
}

/**
 * The length a request asked for, when it is one of `options`, or the
 * default. Anything else in the address (a word, a fraction, a length nobody
 * offered) is the default, so the picture never counts a length nobody can
 * set on a group.
 */
export function pickLength(requested: unknown, options: readonly number[], fallback: number): number {
  const raw = Array.isArray(requested) ? requested[0] : requested;
  if (typeof raw !== "string" || !/^\d{1,4}$/.test(raw)) return fallback;
  const minutes = Number(raw);
  return options.includes(minutes) ? minutes : fallback;
}

// ---------------------------------------------------------------------------
// The picture
// ---------------------------------------------------------------------------

/** One of the highest counts. */
export type BestTime = {
  weekday: number;
  start: number;
  count: number;
  /** The groups whose session starts then. */
  groupIds: string[];
};

/** One group of the run, and how many of the people who said can make it. */
export type GroupFit = {
  id: string;
  name: string;
  session: SessionSlot;
  /** Null for a group with no time set: nobody can be free for no time. */
  canMake: number | null;
};

/** Somebody who said when they are free and can make none of the groups. */
export type FitsNone = {
  uid: string;
  name: string;
  /**
   * The days they are free for a whole session of the counted length at one
   * of the start times, Monday first. Can be empty.
   */
  freeDays: number[];
};

export type TimesPicture = {
  /** People who hold a place. */
  holders: number;
  /** Of them, people who painted a week. Every count below is out of this. */
  said: number;
  /**
   * Of those, people who marked under four hours (`../handover/paintedWeek.ts`):
   * left out of the start-time counts, so they never choose when groups meet.
   */
  littleMarked: number;
  /** The length counted, in minutes. */
  minutes: number;
  /** The start times down the side, in minutes past midnight. */
  rows: number[];
  /** `counts[row][column]`, the columns Monday first (`WEEK_FROM_MONDAY`). */
  counts: number[][];
  /** `meets[row][column]`: the ids of the groups whose session starts then. */
  meets: string[][][];
  best: BestTime[];
  /** Every group of the run, by name. */
  groups: GroupFit[];
  /**
   * Who can make at least one group, and who can make none. Null while no
   * group has a time, or nobody has said when they are free.
   */
  fit: { canMakeOne: number; none: FitsNone[] } | null;
};

const slotAt = (weekday: number, start: number, minutes: number): SessionSlot => ({
  weekday,
  startTimeLocal: minuteLabel(start),
  durationMinutes: minutes,
});

const byName = <T extends { name: string; id?: string; uid?: string }>(a: T, b: T) =>
  a.name.localeCompare(b.name, "en", { numeric: true }) ||
  (a.id ?? a.uid ?? "").localeCompare(b.id ?? b.uid ?? "");

/**
 * Work out the picture. `grid` is the form's current grid, `minutes` the
 * length counted, `people` everybody who holds a place, `groups` the run's
 * groups that are not archived.
 */
export function timesPicture(input: {
  grid: AvailabilityGrid;
  minutes: number;
  people: readonly TimesPerson[];
  groups: readonly TimesGroup[];
}): TimesPicture {
  const { grid, minutes } = input;
  const covering: { uid: string; name: string; covers: (session: SessionSlot) => boolean; minimal: boolean }[] = [];
  for (const person of input.people) {
    if (person.week.kind === "given") {
      covering.push({ uid: person.uid, name: person.name, covers: person.week.covers, minimal: person.week.minimal === true });
    }
  }
  const rows = startRows(grid, minutes);

  // Somebody who marked little time does not choose when groups meet
  // (`./paintedWeek.ts`): the counts that pick a start time are everybody
  // else's, and they are fitted to the groups those choose.
  const choosing = covering.filter((person) => !person.minimal);
  const counts = rows.map((start) =>
    WEEK_FROM_MONDAY.map(
      (weekday) => choosing.filter((person) => person.covers(slotAt(weekday, start, minutes))).length,
    ),
  );

  const timed = input.groups.filter((group) => hasSessionTime(group.session));
  const meets = rows.map(() => WEEK_FROM_MONDAY.map(() => [] as string[]));
  for (const group of [...timed].sort(byName)) {
    const row = rows.indexOf(minutesFromTimeLocal(group.session.startTimeLocal) ?? -1);
    const column = WEEK_FROM_MONDAY.indexOf(group.session.weekday);
    if (row !== -1 && column !== -1) meets[row][column].push(group.id);
  }

  const cells: BestTime[] = [];
  rows.forEach((start, row) => {
    WEEK_FROM_MONDAY.forEach((weekday, column) => {
      const count = counts[row][column];
      if (count > 0) cells.push({ weekday, start, count, groupIds: meets[row][column] });
    });
  });
  const dayOrder = (weekday: number) => WEEK_FROM_MONDAY.indexOf(weekday);
  cells.sort((a, b) => b.count - a.count || dayOrder(a.weekday) - dayOrder(b.weekday) || a.start - b.start);

  // Listed in the order every tab of the programme's page lists its groups:
  // Monday first, as People in groups draws its columns.
  const groups: GroupFit[] = input.groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      session: group.session,
      canMake: hasSessionTime(group.session)
        ? covering.filter((person) => person.covers(group.session)).length
        : null,
    }))
    .sort((a, b) => compareGroupsByMeeting(a, b) || a.id.localeCompare(b.id));

  let fit: TimesPicture["fit"] = null;
  if (timed.length > 0 && covering.length > 0) {
    const none: FitsNone[] = [];
    for (const person of covering) {
      if (timed.some((group) => person.covers(group.session))) continue;
      none.push({
        uid: person.uid,
        name: person.name,
        freeDays: WEEK_FROM_MONDAY.filter((weekday) =>
          rows.some((start) => person.covers(slotAt(weekday, start, minutes))),
        ),
      });
    }
    fit = { canMakeOne: covering.length - none.length, none: none.sort(byName) };
  }

  return {
    holders: input.people.length,
    said: covering.length,
    littleMarked: covering.length - choosing.length,
    minutes,
    rows,
    counts,
    meets,
    best: cells.slice(0, BEST_TIMES_SHOWN),
    groups,
    fit,
  };
}
