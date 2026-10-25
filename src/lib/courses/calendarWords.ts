import { clockWords, dayWords } from "./sessionChange/words";

/**
 * THE WORDS OF ADD TO CALENDAR (board st-calendar-phone; the button on the
 * session tickets of st-programme, wk-programme and wk-home-phone), in one
 * place: the dialog's, the link route's, and what each session says in the
 * calendar the link fills.
 *
 * The board's words are copied exactly, with its apostrophes and quotation
 * marks, and every count, day, time and date in them is a slot the caller
 * fills from a record. Words the board does not draw (the calendar's name, a
 * session's title, a link not got yet, a new link) are written in the same
 * voice and are listed in the build notes for the boards' designers to
 * confirm.
 *
 * Never the meeting link: an online week says where to join, on the site,
 * and nothing here takes a link to a call. No sentence carries a dash.
 *
 * Pure, with no imports beyond the house date words, so the dialog in the
 * browser, the route on the server and the tests read the same sentences.
 */

// ---------------------------------------------------------------------------
// The board's words
// ---------------------------------------------------------------------------

export const ADD_TO_CALENDAR = "Add to calendar";
export const CALENDAR_TITLE = "Add your sessions to your calendar";
export const CALENDAR_CHANGES = "If a time or room changes, your calendar changes too.";
export const APPLE_CALENDAR = "Apple Calendar";
export const GOOGLE_CALENDAR = "Google Calendar";
export const OUTLOOK = "Outlook";
export const COPY_THE_LINK = "Copy the link";
export const CALENDAR_NOTE =
  "The link is yours: anyone with it can see your group’s times and room. Online weeks say “Join on naisi.uk”, never the meeting link.";
export const CLOSE = "Close";

/** What an online week says where its room would be. */
export const JOIN_ON_SITE = "Join on naisi.uk";

// ---------------------------------------------------------------------------
// Words the board does not draw
// ---------------------------------------------------------------------------

/** What a calendar app calls the calendar the link fills. */
export const CALENDAR_NAME = "NAISI sessions";

export const GETTING_LINK = "Getting your link…";
export const LINK_FAILED = "We couldn’t get your link just now.";
export const TRY_AGAIN = "Try again";
export const LINK_COPIED = "Link copied";
/** When the browser will not copy for us: the link is shown to copy by hand. */
export const COPY_BY_HAND = "Copy this link into your calendar:";
export const YOUR_LINK = "Your calendar link";
export const NEW_LINK = "Get a new link";
export const NEW_LINK_WARNING =
  "Your old link will stop working, and any calendar using it will stop showing your sessions.";
export const KEEP_THIS_LINK = "Keep this one";
export const GETTING_NEW_LINK = "Getting a new link…";
export const NEW_LINK_DONE =
  "Here’s your new link. Your old one has stopped working, so add this one to your calendar again.";

/** The link route's refusals, each a sentence a person can act on. */
export const REFUSAL = {
  body: "Ask for your calendar link, or for a new one.",
  standing: "Your account isn’t approved yet, so there are no sessions to add.",
  nothing: "You’re not in a group yet, so there are no sessions to add.",
  noAddress: "This copy of the site doesn’t know its own address, so it can’t make a calendar link.",
} as const;

// ---------------------------------------------------------------------------
// The line that counts the sessions
// ---------------------------------------------------------------------------

/** Index = `GroupSession.weekday` (`Date.getDay()`, 0 = Sunday). */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** One group's sessions in the calendar, as the line counts them. */
export type CalendarLineGroup = {
  /** "AGI Strategy": said only when the link holds more than one group's sessions. */
  programmeName: string;
  /** The sessions the calendar holds for the group, cancelled evenings left out. */
  count: number;
  /** The group's usual day, `Date.getDay()`. */
  weekday: number;
  /** The group's usual start, "HH:MM" in London. */
  startTimeLocal: string;
  /** The first of those sessions, "YYYY-MM-DD". */
  firstDateKey: string;
};

/**
 * "6 sessions on Tuesdays at 6pm, from Tue 3 Nov", or with the programme's
 * name ("6 AGI Strategy sessions ...") when the link holds more than one
 * group's. One session is said by its own day: "1 session, on Tue 3 Nov at
 * 6pm". "" for a group the line cannot describe.
 */
function clauseOf(group: CalendarLineGroup, named: boolean): string {
  const day = WEEKDAYS[group.weekday];
  const clock = clockWords(group.startTimeLocal);
  const first = dayWords(group.firstDateKey);
  if (!day || !clock || !first || group.count < 1) return "";
  const what = named && group.programmeName.trim() ? `${group.programmeName.trim()} ` : "";
  if (group.count === 1) return `1 ${what}session, on ${first} at ${clock}`;
  return `${group.count} ${what}sessions on ${day}s at ${clock}, from ${first}`;
}

/**
 * The dialog's line (board: "6 sessions on Tuesdays at 6pm, from Tue 3 Nov.
 * If a time or room changes, your calendar changes too."), counted from the
 * sessions the link's calendar holds. A link that holds two groups' sessions
 * names each group's programme.
 */
export function sessionsLine(groups: readonly CalendarLineGroup[]): string {
  const named = groups.filter((group) => group.count > 0).length > 1;
  const clauses = groups.map((group) => clauseOf(group, named)).filter(Boolean);
  if (clauses.length === 0) return CALENDAR_CHANGES;
  const said =
    clauses.length === 1
      ? clauses[0]
      : clauses.length === 2
        ? `${clauses[0]}, and ${clauses[1]}`
        : `${clauses.slice(0, -1).join("; ")}; and ${clauses[clauses.length - 1]}`;
  return `${said}. ${CALENDAR_CHANGES}`;
}

// ---------------------------------------------------------------------------
// What each session says in the calendar
// ---------------------------------------------------------------------------

/** "AGI Strategy · Group B": the programme and the group. */
export function sessionTitle(programmeName: string, groupName: string): string {
  return [programmeName.trim(), groupName.trim()].filter(Boolean).join(" · ") || CALENDAR_NAME;
}

/** "Cancelled · AGI Strategy · Group B", for an evening cancelled through Change a session. */
export function cancelledTitle(title: string): string {
  return `Cancelled · ${title}`;
}

/** An online week's description: where to join, with the person's programme page, never the call's link. */
export function joinWords(programmePageUrl: string | null): string {
  return programmePageUrl ? `${JOIN_ON_SITE}: ${programmePageUrl}` : JOIN_ON_SITE;
}
