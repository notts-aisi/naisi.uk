import { formatSiteDate, isSameSiteDay } from "@/lib/datetime/siteTime";

/**
 * How the public events pages say when an event is, and how many places it
 * has left.
 *
 * Three pages print these facts (the list, the event page and the
 * add-to-calendar page), so the words are worked out here once. Everything is
 * London civil time and goes through `formatSiteDate`, the one place the
 * site's zone is written down: nothing in this file formats an instant itself.
 *
 * No `server-only` import and no Firestore: the sign-up panel is a client
 * component and reads the places words from here too.
 */

/** The three lines of a date tile: "Fri", "16", "Oct". The capitals are CSS. */
export function tileParts(date: Date): { weekday: string; day: string; month: string } {
  return {
    weekday: formatSiteDate(date, { weekday: "short" }).slice(0, 3),
    day: formatSiteDate(date, { day: "numeric" }),
    // The locale abbreviates September to four letters. A tile has room for three.
    month: formatSiteDate(date, { month: "short" }).slice(0, 3),
  };
}

function siteYear(date: Date): string {
  return formatSiteDate(date, { year: "numeric" });
}

/**
 * "Fri 16 Oct", and "Fri 16 Oct 2027" when that is not this year: a date in
 * another year with no year beside it reads as this year's.
 */
export function shortDate(date: Date, now: Date): string {
  const { weekday, day, month } = tileParts(date);
  const base = `${weekday} ${day} ${month}`;
  return siteYear(date) === siteYear(now) ? base : `${base} ${siteYear(date)}`;
}

/** "7pm", "5:30pm", "12am": a time of day the way the site's copy says one. */
export function clockTime(date: Date): string {
  const [hours, minutes] = formatSiteDate(date, { hour: "2-digit", minute: "2-digit" })
    .split(":")
    .map(Number);
  const suffix = hours < 12 ? "am" : "pm";
  const hour = hours % 12 === 0 ? 12 : hours % 12;
  return minutes === 0 ? `${hour}${suffix}` : `${hour}:${String(minutes).padStart(2, "0")}${suffix}`;
}

/**
 * What follows the start time when an event has an end: a time when it ends
 * on the same London day, and the day as well when it does not, because
 * "to 9am" on an overnight event says the wrong thing.
 */
export function endWords(startAt: Date, endAt: Date, now: Date): string {
  return isSameSiteDay(startAt, endAt)
    ? clockTime(endAt)
    : `${shortDate(endAt, now)}, ${clockTime(endAt)}`;
}

/**
 * Whether an event is over. With an end time, once that has passed. With
 * none, once the London day it started on is over: an event with no stated
 * end is not called finished an hour after it began.
 */
export function hasEnded(startAt: Date | null, endAt: Date | null, now: Date): boolean {
  if (endAt) return endAt.getTime() < now.getTime();
  if (!startAt) return false;
  return startAt.getTime() < now.getTime() && !isSameSiteDay(startAt, now);
}

export type PlacesState =
  /** No limit on places, or an event nobody signs up to. Nothing to say. */
  | { kind: "open" }
  | { kind: "left"; left: number; capacity: number; few: boolean }
  | { kind: "full"; capacity: number; waitingList: boolean };

/**
 * Where an event's places stand. Confirmed places are the ones counted, the
 * same two numbers the page has always printed. A drop-in keeps its capacity
 * setting and ignores it, so it never has places to count.
 *
 * "Few" is a quarter of the places or fewer (and never fewer than five), the
 * point at which the count is worth a second look.
 */
export function placesState(event: {
  capacity: number | null;
  rsvpCountConfirmed?: number | null;
  waitlistEnabled: boolean;
  noSignup: boolean;
}): PlacesState {
  if (event.noSignup || event.capacity === null) return { kind: "open" };
  const left = event.capacity - (event.rsvpCountConfirmed ?? 0);
  if (left <= 0) return { kind: "full", capacity: event.capacity, waitingList: event.waitlistEnabled };
  const few = left <= Math.max(5, Math.ceil(event.capacity / 4));
  return { kind: "left", left, capacity: event.capacity, few };
}

/** "38 places left", "1 place left", "Full", "Full · waiting list open". */
export function placesWords(state: PlacesState): string | null {
  if (state.kind === "open") return null;
  if (state.kind === "full") return state.waitingList ? "Full · waiting list open" : "Full";
  return state.left === 1 ? "1 place left" : `${state.left} places left`;
}

/** The chip tone that goes with `placesWords`. A tone never stands alone. */
export function placesTone(state: PlacesState): "neutral" | "warning" | "danger" {
  if (state.kind === "full") return state.waitingList ? "warning" : "danger";
  return state.kind === "left" && state.few ? "warning" : "neutral";
}
