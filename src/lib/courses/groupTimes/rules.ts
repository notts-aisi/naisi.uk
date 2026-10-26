import { parseClock } from "@/lib/courses/sessionChange/words";
import { GROUP_FIELD_LIMITS, groupCapacityError } from "@/lib/firestore/courseGroups";
import { REFUSAL } from "./words";

/**
 * CHOOSING GROUP TIMES FROM THE TIMES PICTURE (board st-times, Q2 option B):
 * the rules, as pure functions the two routes, the dialogs and the tests all
 * ask.
 *
 *  - A GROUP'S DAY AND START CHANGE HERE UNTIL PUBLISH HAS TOLD SOMEBODY
 *    THEM. Once a person placed in the group, or one of its facilitators, has
 *    been emailed when it meets, a change here would leave them believing the
 *    old time, so the route refuses it and points to Change a session, which
 *    moves one week and tells the group (`../groupTimes/told.ts` decides who
 *    was told).
 *  - A GROUP'S LENGTH IS ITS OWN. Change moves the day and the start and
 *    keeps how long the sessions last. A new group lasts a length the group
 *    editor offers or one a group of the run already has, the lengths the
 *    picture can count (`lengthOptions` in `@/lib/applications/handover/times`).
 *  - NOTHING HERE NAMES A TERM'S FACT. A new group's name is suggested from
 *    the names the run's groups already have, its places from the places
 *    they share, and neither when they differ: the lead types them.
 *
 * Pure, so a dialog in the browser and the route on the server read a
 * request the same way.
 */

/** A day of the week as a group stores it: `Date.getDay()`, 0 is Sunday. */
export function isWeekday(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

/** A start time as typed or stored ("6pm", "6:30pm", "18:00"), as the stored "HH:MM", or null. */
export function startOf(value: unknown): string | null {
  return typeof value === "string" ? parseClock(value) : null;
}

/** A group's weekly slot, as much of it as a change names. */
export type Slot = { weekday: number; startTimeLocal: string };

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The body of "Change" and of "Use for a group" on an existing group:
 * `{ weekday, start, from: { weekday, start } }`. `from` is the slot the
 * dialog was opened on, so a dialog left open while somebody else changed
 * the group cannot change another time than the one it showed. A group with
 * no time yet sends `from.start` as "".
 */
export type ChangeTime = { to: Slot; from: Slot };

export function parseChangeTime(raw: unknown): Parsed<ChangeTime> {
  if (!isObject(raw)) return { ok: false, error: REFUSAL.body };
  if (!isWeekday(raw.weekday)) return { ok: false, error: REFUSAL.weekday };
  const start = startOf(raw.start);
  if (start === null) return { ok: false, error: REFUSAL.start };
  const from = raw.from;
  if (!isObject(from) || !isWeekday(from.weekday) || typeof from.start !== "string") {
    return { ok: false, error: REFUSAL.from };
  }
  const fromStart = from.start === "" ? "" : startOf(from.start);
  if (fromStart === null) return { ok: false, error: REFUSAL.from };
  return {
    ok: true,
    value: { to: { weekday: raw.weekday, startTimeLocal: start }, from: { weekday: from.weekday, startTimeLocal: fromStart } },
  };
}

/**
 * The body of "Add a group", and of "Use for a group" for a new one:
 * `{ name, weekday, start, minutes, places }`. `places` is a whole number or
 * null for no limit. Whether `minutes` is a length a new group may last
 * depends on the run's groups, so the route asks `lengthOptions` once it has
 * read them; here it is only a whole number of minutes a group can hold.
 */
export type NewGroup = {
  name: string;
  slot: Slot;
  minutes: number;
  places: number | null;
};

export function parseNewGroup(raw: unknown): Parsed<NewGroup> {
  if (!isObject(raw)) return { ok: false, error: REFUSAL.body };
  const name = typeof raw.name === "string" ? raw.name.trim().replace(/\s+/g, " ") : "";
  if (!name) return { ok: false, error: REFUSAL.name };
  if (name.length > GROUP_FIELD_LIMITS.name) return { ok: false, error: REFUSAL.nameLong };
  if (!isWeekday(raw.weekday)) return { ok: false, error: REFUSAL.weekday };
  const start = startOf(raw.start);
  if (start === null) return { ok: false, error: REFUSAL.start };
  const minutes = raw.minutes;
  if (
    typeof minutes !== "number" ||
    !Number.isInteger(minutes) ||
    minutes <= 0 ||
    minutes > GROUP_FIELD_LIMITS.maxDurationMinutes
  ) {
    return { ok: false, error: REFUSAL.length };
  }
  const places = raw.places;
  if (!(places === null || (typeof places === "number" && Number.isInteger(places)))) {
    return { ok: false, error: REFUSAL.places };
  }
  return { ok: true, value: { name, slot: { weekday: raw.weekday, startTimeLocal: start }, minutes, places } };
}

/**
 * Why a new group's places will not do on a run of this kind, or null when
 * they will: fewer than one in the dialog's own word, and otherwise the
 * group editor's own rule and sentence (a register's ceiling, and a number
 * on every group of a run people join by themselves).
 */
export function placesProblem(places: number | null, enrolMode: "admissions" | "open"): string | null {
  if (places !== null && places < 1) return REFUSAL.places;
  return groupCapacityError(places, enrolMode);
}

/** Whether two names are the same group's, as a person reads them: case and spacing aside. */
export function sameName(a: string, b: string): boolean {
  const fold = (name: string) => name.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-GB");
  return fold(a) === fold(b);
}

/**
 * The name "Add a group" suggests: "Group E" when every group of the run is
 * named "Group" and one letter, and E is the letter after the last; "" when
 * they are named any other way, or Z is taken, and the lead names it.
 */
export function nextGroupName(names: readonly string[]): string {
  if (names.length === 0) return "";
  const letters: number[] = [];
  for (const name of names) {
    const match = /^group ([a-z])$/i.exec(name.trim());
    if (!match) return "";
    letters.push(match[1].toUpperCase().charCodeAt(0));
  }
  const next = Math.max(...letters) + 1;
  return next <= "Z".charCodeAt(0) ? `Group ${String.fromCharCode(next)}` : "";
}

/** The places every live group of the run has, when they all have the same; null otherwise. */
export function sharedPlaces(capacities: readonly (number | null)[]): number | null {
  if (capacities.length === 0) return null;
  const first = capacities[0];
  return first !== null && capacities.every((capacity) => capacity === first) ? first : null;
}

/** Whether a slot is the one stored, a group with no start time reading as "". */
export function sameSlot(a: Slot, b: Slot): boolean {
  return a.weekday === b.weekday && a.startTimeLocal === b.startTimeLocal;
}

/**
 * The most groups one run can hold: the allocation board reads at most this
 * many, so a run with more would draw a board that leaves some out. A cost
 * guard on the board's read, not a term's number.
 */
export const MAX_GROUPS_PER_RUN = 50;
