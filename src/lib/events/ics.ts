/**
 * Minimal iCalendar (RFC 5545) builder, with every timestamp in UTC ("Z"
 * form) so any calendar client resolves it correctly without needing a
 * VTIMEZONE block. Two files come out of it, from ONE event builder:
 *
 *  - `buildEventIcs`: one VEVENT, for the public `calendar.ics` download
 *    route and the RSVP-approval email attachment;
 *  - `buildCalendarIcs`: many VEVENTs and the properties a subscribed
 *    calendar reads (its name, how often to fetch it again), for a person's
 *    own calendar link to their course sessions.
 *
 * Every line of both is folded at 75 octets (RFC 5545 section 3.1), never
 * inside a character, so a long title or address reaches a strict reader
 * whole.
 *
 * Beside them live the link builders. Two shapes:
 *
 *  - "open this event in a web calendar": Google, and the two Outlook hosts.
 *    Those carry the event in a query string rather than in a file, which is
 *    the only path that survives an in-app browser (Instagram and Facebook
 *    block the file download on iOS), so a page that offers a calendar entry
 *    offers both shapes;
 *  - "subscribe to this calendar": Apple's `webcal:` address, Google's and
 *    Outlook's own ways to add a calendar from a link. A subscription is
 *    fetched again by the calendar app, so a later change reaches it; an
 *    import is a copy taken once, and is never what these build.
 */

/** One event in a calendar file. */
export type IcsEvent = {
  /** Stable unique id for the event (the Firestore doc id works). `@naisi.uk` is added. */
  uid: string;
  title: string;
  description?: string;
  location?: string;
  url?: string;
  startAt: Date;
  /** Defaults to startAt + 2h when omitted. */
  endAt?: Date | null;
  /**
   * When the organiser last touched the event. Becomes LAST-MODIFIED and the
   * SEQUENCE counter: same UID plus a higher SEQUENCE is how a client knows a
   * re-downloaded file REPLACES the entry somebody already added rather than
   * sitting beside it. A poster is printed once and the details change after
   * it, so this is the property that decides whether a correction lands.
   */
  updatedAt?: Date | null;
  /**
   * STATUS, when the file says one. "cancelled" keeps the entry in a
   * subscribed calendar and marks it off, so the evening reads as off rather
   * than silently gone; "confirmed" says it is on, which is what turns a
   * cancelled entry back on when the evening is put back.
   */
  status?: "confirmed" | "cancelled";
};

/** The single-event file's arguments: one event. */
type IcsArgs = IcsEvent;

/** The fields both web-calendar link builders take. */
type CalendarLinkArgs = {
  title: string;
  description?: string;
  location?: string;
  startAt: Date;
  endAt?: Date | null;
};

/** Escape a value for an iCalendar text field (RFC 5545 section 3.3.11). */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Format a Date as a UTC iCalendar timestamp: YYYYMMDDTHHMMSSZ. */
function formatUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** Format a Date as YYYY-MM-DDTHH:MM:SSZ, the form Outlook's deep link takes. */
function formatIsoUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

/** The end an event really has: the stored one, or two hours after the start. */
function endFor(args: { startAt: Date; endAt?: Date | null }): Date {
  return args.endAt && args.endAt.getTime() > args.startAt.getTime()
    ? args.endAt
    : new Date(args.startAt.getTime() + DEFAULT_DURATION_MS);
}

/**
 * SEQUENCE counts SECONDS SINCE 2020, not since 1970.
 *
 * RFC 5545 makes SEQUENCE a non-negative integer that may only grow for a
 * given UID, and clients treat it as a signed 32-bit value: epoch
 * milliseconds overflow that immediately, and epoch seconds overflow it in
 * January 2038. Counting from 2020 keeps one-second resolution (finer than an
 * organiser can edit an event twice) with roughly 68 years of headroom.
 *
 * An event with no `updatedAt` scores 0, which is what a file with no SEQUENCE
 * line means anyway, so the fallback loses nothing.
 */
const SEQUENCE_EPOCH_MS = Date.UTC(2020, 0, 1);
const MAX_SEQUENCE = 2 ** 31 - 1;

export function icsSequenceFor(updatedAt: Date | null | undefined): number {
  const ms = updatedAt?.getTime();
  if (typeof ms !== "number" || !Number.isFinite(ms)) return 0;
  const seconds = Math.floor((ms - SEQUENCE_EPOCH_MS) / 1000);
  if (seconds <= 0) return 0;
  return Math.min(seconds, MAX_SEQUENCE);
}

/** The longest a line may be, in octets, before it is folded (RFC 5545 section 3.1). */
export const ICS_LINE_OCTETS = 75;

const encoder = new TextEncoder();

/**
 * One content line, folded: no line longer than 75 octets, each continuation
 * starting with one space (which counts towards its 75), and never a break
 * inside a character, so a reader that unfolds it gets the line back exactly.
 */
export function foldIcsLine(line: string): string {
  if (encoder.encode(line).length <= ICS_LINE_OCTETS) return line;
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  let room = ICS_LINE_OCTETS;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > room) {
      parts.push(current);
      current = char;
      octets = size;
      room = ICS_LINE_OCTETS - 1;
    } else {
      current += char;
      octets += size;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

/** The lines of a whole file: folded, and ended with CRLF, as RFC 5545 requires. */
function serialise(lines: readonly string[]): string {
  return lines.map(foldIcsLine).join("\r\n") + "\r\n";
}

/**
 * ONE EVENT'S LINES, for both files. `stamp` is DTSTAMP: when the file was
 * made. The property order is the event download's own, so its file is the
 * one it always was.
 */
function eventLines(event: IcsEvent, stamp: Date): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}@naisi.uk`,
    `DTSTAMP:${formatUtc(stamp)}`,
    `SEQUENCE:${icsSequenceFor(event.updatedAt)}`,
    `DTSTART:${formatUtc(event.startAt)}`,
    `DTEND:${formatUtc(endFor(event))}`,
    `SUMMARY:${escapeIcsText(event.title)}`,
  ];
  if (event.updatedAt) lines.push(`LAST-MODIFIED:${formatUtc(event.updatedAt)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
  if (event.url) lines.push(`URL:${escapeIcsText(event.url)}`);
  if (event.status) lines.push(`STATUS:${event.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildEventIcs(args: IcsArgs): string {
  return serialise([
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NAISI//Events//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...eventLines(args, new Date()),
    "END:VCALENDAR",
  ]);
}

/** A calendar a person subscribes to: its name, how often to fetch it again, and its events. */
export type IcsCalendar = {
  /** What a calendar app calls it. */
  name: string;
  /** How often a subscribed calendar should fetch the file again, in whole minutes. */
  refreshMinutes: number;
  events: readonly IcsEvent[];
  /** When the file is made, for every DTSTAMP. Now, unless a caller says. */
  stamp?: Date;
};

/** An RFC 5545 duration of whole minutes: "PT1H", "PT90M". */
function durationOf(minutes: number): string {
  const whole = Math.max(1, Math.floor(minutes));
  return whole % 60 === 0 ? `PT${whole / 60}H` : `PT${whole}M`;
}

/**
 * MANY EVENTS, AS A CALENDAR A PERSON SUBSCRIBES TO.
 *
 * Each event keeps its UID from one file to the next, so a calendar that
 * fetches the file again moves, changes or marks off the entry it already
 * holds; SEQUENCE and LAST-MODIFIED grow with every change behind it.
 *
 * The calendar's own properties are the ones subscribed calendars read: NAME
 * (RFC 7986) and X-WR-CALNAME for its name, REFRESH-INTERVAL (RFC 7986) and
 * X-PUBLISHED-TTL for how often to fetch it again. A file with no events is
 * still a calendar: its name, and nothing in it.
 */
export function buildCalendarIcs(calendar: IcsCalendar): string {
  const stamp = calendar.stamp ?? new Date();
  const every = durationOf(calendar.refreshMinutes);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//NAISI//Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `NAME:${escapeIcsText(calendar.name)}`,
    `X-WR-CALNAME:${escapeIcsText(calendar.name)}`,
    `REFRESH-INTERVAL;VALUE=DURATION:${every}`,
    `X-PUBLISHED-TTL:${every}`,
  ];
  for (const event of calendar.events) lines.push(...eventLines(event, stamp));
  lines.push("END:VCALENDAR");
  return serialise(lines);
}

/**
 * Build an "Add to Google Calendar" link (the TEMPLATE render form). Opens
 * Google Calendar with the event pre-filled: one tap, no file download.
 */
export function googleCalendarUrl(args: CalendarLinkArgs): string {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: args.title,
    dates: `${formatUtc(args.startAt)}/${formatUtc(endFor(args))}`,
  });
  if (args.description) params.set("details", args.description);
  if (args.location) params.set("location", args.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * The two Outlook web hosts, which are not interchangeable: a personal
 * account lives on outlook.live.com and a work or university Microsoft 365
 * account on outlook.office.com, and the wrong host lands the reader on a
 * sign-in page for an account they do not have. Nottingham runs student mail
 * on Microsoft 365, so both are offered rather than one guessed at.
 *
 * The compose path carries NO account index (`/calendar/deeplink/compose`,
 * never `/calendar/0/deeplink/compose`): the index selects the first
 * signed-in account, which means nothing in a stranger's browser.
 *
 * Known, and deliberately not worked around: when the reader is signed out,
 * Microsoft's login redirect turns the escaped spaces in `subject` back into
 * literal plus signs, so the title arrives as "NAISI+Intro+to+AI+Safety". The
 * documented workarounds substitute thin spaces for real ones, which is worse
 * than the symptom. A page offering these keeps them behind a secondary
 * disclosure and leads with Apple and Google instead.
 */
const OUTLOOK_LIVE_BASE = "https://outlook.live.com/calendar/deeplink/compose";
const OUTLOOK_OFFICE_BASE = "https://outlook.office.com/calendar/deeplink/compose";

function outlookUrl(base: string, args: CalendarLinkArgs): string {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: args.title,
    startdt: formatIsoUtc(args.startAt),
    enddt: formatIsoUtc(endFor(args)),
  });
  if (args.location) params.set("location", args.location);
  // Plain text only: angle brackets cannot be passed through the deep link at
  // all, and the body is rendered as HTML at the far end.
  if (args.description) params.set("body", args.description);
  return `${base}?${params.toString()}`;
}

/** Add to a personal Outlook.com calendar. */
export function outlookLiveUrl(args: CalendarLinkArgs): string {
  return outlookUrl(OUTLOOK_LIVE_BASE, args);
}

/** Add to a Microsoft 365 calendar (a university or work account). */
export function outlookOfficeUrl(args: CalendarLinkArgs): string {
  return outlookUrl(OUTLOOK_OFFICE_BASE, args);
}

// ---------------------------------------------------------------------------
// Subscribing to a calendar by its link
// ---------------------------------------------------------------------------

/**
 * A calendar's address as `webcal:`, the scheme a calendar app registers for
 * SUBSCRIBING: on an iPhone or a Mac it opens Calendar's "Subscribe" sheet
 * rather than downloading a copy. Only an `https:` or `http:` address is
 * rewritten; anything else is no calendar address, and answers "".
 */
export function webcalUrl(feedUrl: string): string {
  const match = /^https?:\/\/(.+)$/i.exec(feedUrl);
  return match ? `webcal://${match[1]}` : "";
}

/**
 * Google Calendar's own "add a calendar from a link" (the `cid` form), which
 * subscribes rather than imports: Google fetches the link again by itself.
 * Google is handed the `webcal:` address, and the first signed-in account
 * (`/u/0/`) is addressed, both as the maintained add-to-calendar libraries
 * build this link. Google fetches a subscribed calendar again on its own
 * schedule, which is hours rather than minutes.
 */
export function googleSubscribeUrl(feedUrl: string): string {
  const webcal = webcalUrl(feedUrl);
  if (!webcal) return "";
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(webcal)}`;
}

/**
 * Outlook's "add a calendar from the web" on Microsoft 365, the host of a
 * university or work account (see the two hosts above: the university's mail
 * is Microsoft 365). It subscribes, and `name` is what the calendar is called
 * there. The account index (`/0/`) is in the path because that is the form
 * the subscribe page is opened by, unlike the compose link above. Somebody
 * with a personal Outlook.com account adds the copied link instead.
 */
export function outlookSubscribeUrl(feedUrl: string, name: string): string {
  const webcal = webcalUrl(feedUrl);
  if (!webcal) return "";
  return (
    "https://outlook.office.com/calendar/0/addfromweb/?" +
    `url=${encodeURIComponent(webcal)}&name=${encodeURIComponent(name)}`
  );
}
