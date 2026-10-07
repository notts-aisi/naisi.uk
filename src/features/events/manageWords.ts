import type { ChipTone } from "@/components/ui/Chip";
import { formatSiteDate, isSameSiteDay } from "@/lib/datetime/siteTime";
import type { EventStatus, RsvpStatus } from "@/lib/firestore/events";

/**
 * The words the committee's events pages use for an event: its state, its
 * date and its time.
 *
 * Every date here goes through `formatSiteDate`, so a time reads the same in
 * a browser in another country as it does in the room: an event's time is a
 * statement about a place in Nottingham. Nothing in this file formats a
 * location; that is `src/lib/events/location.ts` alone.
 */

/** An event's state, as the list and the editor say it. */
export const STATUS_WORDS: Record<EventStatus, string> = {
  draft: "Draft",
  pending: "Waiting for approval",
  approved: "Approved",
  published: "Published",
  rejected: "Sent back",
  cancelled: "Cancelled",
};

/** The chip colour that goes with each state. A colour never stands alone: the word is beside it. */
export function statusTone(status: EventStatus): ChipTone {
  switch (status) {
    case "draft":
      return "neutral";
    case "pending":
      return "warning";
    case "approved":
      return "accent";
    case "published":
      return "success";
    case "rejected":
      return "danger";
    case "cancelled":
      return "danger";
  }
}

/**
 * A sign-up's state, as the attendee list says it. Somebody requests a place,
 * so a request nobody has answered yet is "Requested".
 */
export const SIGNUP_WORDS: Record<RsvpStatus, string> = {
  pending: "Requested",
  confirmed: "Confirmed",
  waitlisted: "Waiting list",
  denied: "Turned down",
  cancelled: "Cancelled",
};

export function signupTone(status: RsvpStatus): ChipTone {
  switch (status) {
    case "pending":
      return "warning";
    case "confirmed":
      return "success";
    case "waitlisted":
      return "accent";
    case "denied":
      return "danger";
    case "cancelled":
      return "neutral";
  }
}

/** "6pm", "6:30pm", "12am": a time of day in London. */
export function clockWords(date: Date): string {
  const [hour, minute] = formatSiteDate(date, { hour: "2-digit", minute: "2-digit" })
    .split(":")
    .map(Number);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  const minutes = minute === 0 ? "" : `:${String(minute).padStart(2, "0")}`;
  return `${twelve}${minutes}${hour < 12 ? "am" : "pm"}`;
}

/** "Thu 26 Nov": a day in London. */
export function dayWords(date: Date): string {
  const weekday = formatSiteDate(date, { weekday: "short" });
  const day = formatSiteDate(date, { day: "numeric" });
  const month = formatSiteDate(date, { month: "short" });
  return `${weekday} ${day} ${month}`;
}

/** The year an instant falls in, in London. */
export function yearOf(date: Date): string {
  return formatSiteDate(date, { year: "numeric" });
}

/** The three lines of a date tile, and the same day as a machine reads it. */
export function tileParts(date: Date): {
  weekday: string;
  day: string;
  month: string;
  dateTime: string;
} {
  return {
    weekday: formatSiteDate(date, { weekday: "short" }),
    day: formatSiteDate(date, { day: "numeric" }),
    month: formatSiteDate(date, { month: "short" }),
    dateTime: `${yearOf(date)}-${formatSiteDate(date, { month: "2-digit" })}-${formatSiteDate(date, { day: "2-digit" })}`,
  };
}

/**
 * "7pm", "7pm to 9:30pm", or "6pm to Thu 26 Nov, 9am" for an event that ends
 * on another day.
 */
export function timeRangeWords(start: Date, end: Date | null): string {
  if (!end) return clockWords(start);
  if (isSameSiteDay(start, end)) return `${clockWords(start)} to ${clockWords(end)}`;
  return `${clockWords(start)} to ${dayWords(end)}, ${clockWords(end)}`;
}

/** "Thu 26 Nov · 7pm", or the words for an event with no date yet. */
export function whenWords(start: Date | null): string {
  if (!start) return "No date yet";
  return `${dayWords(start)} · ${clockWords(start)}`;
}

/** "Tue 6 Oct at 7:42pm": when something was last written. */
export function stampWords(date: Date): string {
  return `${dayWords(date)} at ${clockWords(date)}`;
}

/**
 * Whether an event is over: its end has passed, or, with no end time, the
 * London day it started on has. An event with no date is never over.
 */
export function isOver(
  event: { startAt: Date | null; endAt: Date | null },
  now: Date,
): boolean {
  if (event.endAt) return event.endAt.getTime() <= now.getTime();
  if (!event.startAt) return false;
  return event.startAt.getTime() < now.getTime() && !isSameSiteDay(event.startAt, now);
}
