import { slotCountFor, type AvailabilityGrid } from "@/lib/admissions/availability";
import { setRange, type DayColumns } from "@/features/admissions/availabilityModel";

/**
 * THE WORDS OF THE AVAILABILITY STEP, AND ITS TYPED ROUTE.
 *
 * The grid stores seven columns of quarter hours (`DayColumns`, the model the
 * older form already uses, converted to and from the stored mask at the
 * edges). This module turns those columns into what a person reads ("6pm to
 * 9pm", "Free 14 hours across 5 days", "Mon, Tue and Thu, 6pm to 9pm") and
 * turns what a person TYPES back into columns, which is the route for
 * anybody who cannot or would rather not drag.
 *
 * Every number is a wall clock in Europe/London on no particular day, exactly
 * as in `src/lib/admissions/availability.ts`: no instant is made, so no clock
 * change can move a slot.
 *
 * Pure, so `tests/applications-apply-availability.test.mjs` runs all of it.
 */

/** Stored columns are indexed Sunday first. The form shows Monday first. */
export const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const DAY_LONG = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Monday to Friday, as stored day indexes. */
export const WEEKDAYS = [1, 2, 3, 4, 5] as const;

/** "9am", "7:30pm", "12pm". Minutes past midnight in, the house time style out. */
export function clockLabel(minute: number): string {
  const total = ((Math.round(minute) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(total / 60);
  const minutes = total % 60;
  const suffix = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minutes === 0
    ? `${hour12}${suffix}`
    : `${hour12}:${String(minutes).padStart(2, "0")}${suffix}`;
}

/** A painted run of slots in one day: `from` is its first slot, `to` the slot after its last. */
export type Run = { from: number; to: number };

export function runsOf(column: readonly boolean[] | undefined): Run[] {
  const runs: Run[] = [];
  if (!column) return runs;
  let start = -1;
  for (let slot = 0; slot <= column.length; slot += 1) {
    const on = slot < column.length && column[slot] === true;
    if (on && start === -1) start = slot;
    if (!on && start !== -1) {
      runs.push({ from: start, to: slot });
      start = -1;
    }
  }
  return runs;
}

export function slotMinute(slot: number, grid: AvailabilityGrid): number {
  return grid.startMinute + slot * grid.slotMinutes;
}

/** "6pm to 9pm". */
export function runLabel(run: Run, grid: AvailabilityGrid): string {
  return `${clockLabel(slotMinute(run.from, grid))} to ${clockLabel(slotMinute(run.to, grid))}`;
}

/** "3 hours", "1 hour", "45 minutes", "2 hours 30 minutes". */
export function durationLabel(minutes: number): string {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  const hourPart = hours === 0 ? "" : `${hours} ${hours === 1 ? "hour" : "hours"}`;
  const minutePart = rest === 0 ? "" : `${rest} minutes`;
  if (!hourPart && !minutePart) return "0 hours";
  return [hourPart, minutePart].filter(Boolean).join(" ");
}

export function paintedSlots(column: readonly boolean[] | undefined): number {
  return column ? column.filter(Boolean).length : 0;
}

/** The two figures in "Free 14 hours across 5 days", or null when nothing is painted. */
export function totalFree(
  columns: DayColumns,
  grid: AvailabilityGrid,
): { hours: string; days: string } | null {
  let slots = 0;
  let days = 0;
  for (const column of columns) {
    const painted = paintedSlots(column);
    slots += painted;
    if (painted > 0) days += 1;
  }
  if (slots === 0) return null;
  return {
    hours: durationLabel(slots * grid.slotMinutes),
    days: `${days} ${days === 1 ? "day" : "days"}`,
  };
}

/** "Monday, 3 hours free" or "Friday, no time painted": what a day chip says to a screen reader. */
export function dayChipLabel(columns: DayColumns, day: number, grid: AvailabilityGrid): string {
  const painted = paintedSlots(columns[day]);
  return painted === 0
    ? `${DAY_LONG[day]}, no time painted`
    : `${DAY_LONG[day]}, ${durationLabel(painted * grid.slotMinutes)} free`;
}

/** "a", "a and b", "a, b and c". */
export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The availability as the last step shows it: one line per pattern of times,
 * with the days that share it. "Mon, Tue and Thu, 6pm to 9pm".
 */
export function summaryLines(columns: DayColumns, grid: AvailabilityGrid): string[] {
  const groups: { key: string; days: string[]; times: string }[] = [];
  for (const day of DISPLAY_DAYS) {
    const runs = runsOf(columns[day]);
    if (runs.length === 0) continue;
    const key = runs.map((run) => `${run.from}-${run.to}`).join(",");
    const existing = groups.find((group) => group.key === key);
    if (existing) existing.days.push(DAY_SHORT[day]);
    else {
      groups.push({
        key,
        days: [DAY_SHORT[day]],
        times: joinList(runs.map((run) => runLabel(run, grid))),
      });
    }
  }
  return groups.map((group) => `${joinList(group.days)}, ${group.times}`);
}

/** Copy one day's painted times onto Monday to Friday. */
export function copyToWeekdays(columns: DayColumns, fromDay: number): DayColumns {
  const source = columns[fromDay];
  if (!source) return columns;
  const next = columns.slice();
  for (const day of WEEKDAYS) next[day] = source.slice();
  return next;
}

// ---------------------------------------------------------------------------
// Typing a time instead of dragging
// ---------------------------------------------------------------------------

const TYPED_TIME = /^(\d{1,2})(?:[:.]?(\d{2}))?(am|pm)?$/;

/**
 * A time somebody typed, as minutes past midnight, or null.
 *
 * Reads "6pm", "6:30pm", "6.30 pm", "18:00", "1830" and a bare "6". A bare
 * hour with no am or pm is read as the hour that falls inside the grid, so
 * "6" on a 9am to 9pm grid is 6pm, and when both would fit the earlier one
 * wins unless it would not come after `after` (the start of the run being
 * typed, so "9" as an end time after a 6pm start is 9pm).
 */
export function parseTypedTime(
  text: string,
  grid: AvailabilityGrid,
  after: number | null = null,
): number | null {
  // Bounded first, then spaces out and "p.m." read as "pm", by plain string
  // steps so the time taken never depends on what was typed.
  const compact = text
    .slice(0, 16)
    .toLowerCase()
    .split(" ")
    .join("")
    .replace("a.m.", "am")
    .replace("p.m.", "pm")
    .replace("a.m", "am")
    .replace("p.m", "pm");
  const match = TYPED_TIME.exec(compact);
  if (!match) return null;
  const hour = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  if (minutes > 59) return null;
  const suffix = match[3];
  if (suffix) {
    if (hour < 1 || hour > 12) return null;
    const base = hour % 12;
    return (suffix === "pm" ? base + 12 : base) * 60 + minutes;
  }
  if (hour > 24 || (hour === 24 && minutes > 0)) return null;
  const morning = hour * 60 + minutes;
  const evening = morning + 12 * 60;
  const fits = (minute: number) =>
    minute >= grid.startMinute && minute <= grid.endMinute && (after === null || minute > after);
  if (fits(morning)) return morning;
  if (hour <= 12 && fits(evening)) return evening;
  return morning;
}

export type TypedRun = { ok: true; from: number; to: number } | { ok: false; error: string };

/**
 * A typed start and end, as a run of whole slots. Times that are not on a
 * quarter hour are brought INWARD (a 6:20 start becomes 6:30), so the form
 * never records somebody as free for minutes they did not offer.
 */
export function typedRun(fromText: string, toText: string, grid: AvailabilityGrid): TypedRun {
  const opens = clockLabel(grid.startMinute);
  const closes = clockLabel(grid.endMinute);
  const hint = `Type a time between ${opens} and ${closes}, like 6pm or 18:30.`;
  const start = parseTypedTime(fromText, grid);
  if (start === null) return { ok: false, error: `We could not read the start time. ${hint}` };
  const end = parseTypedTime(toText, grid, start);
  if (end === null) return { ok: false, error: `We could not read the end time. ${hint}` };
  if (start < grid.startMinute || end > grid.endMinute) {
    return { ok: false, error: `Times run from ${opens} to ${closes}.` };
  }
  if (end <= start) return { ok: false, error: "The end time has to be after the start time." };
  const count = slotCountFor(grid);
  const from = Math.ceil((start - grid.startMinute) / grid.slotMinutes);
  const to = Math.min(count, Math.floor((end - grid.startMinute) / grid.slotMinutes));
  if (to <= from) {
    return { ok: false, error: `That is less than ${grid.slotMinutes} minutes. Times are kept in quarter hours.` };
  }
  return { ok: true, from, to };
}

/** Paint a run of slots (`to` is the slot after the last) on one day. */
export function paintRun(columns: DayColumns, day: number, run: Run): DayColumns {
  return setRange(columns, day, run.from, run.to - 1, true);
}

/** Clear a run of slots on one day. */
export function clearRun(columns: DayColumns, day: number, run: Run): DayColumns {
  return setRange(columns, day, run.from, run.to - 1, false);
}
