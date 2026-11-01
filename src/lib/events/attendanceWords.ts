/**
 * THE WORDS OF ONE PERSON'S EVENTS, as an admin reads them on the person's
 * page, and the shape the route that reads them answers with; and the words
 * of the event page's panel for somebody who holds a place there.
 *
 * Pure and client safe: `GET /api/admin/members/[uid]/events` builds the view
 * on the server (`src/lib/events/missedEvents.ts`, which decides what counts),
 * and the person's page draws it with these words. Nothing here decides
 * anything.
 */

/** Where one person's sign-up for one event stands, as their page says it. */
export type PersonEventState =
  /** They were checked in. */
  | "came"
  /** A confirmed place at an event still to come, or under way. */
  | "place"
  /** A confirmed place at an event that is over, whose door was opened, and no check-in for them. */
  | "missed"
  /** A confirmed place at an event that is over, whose door was never opened: nobody can say. */
  | "unchecked"
  /** A request nobody has decided. */
  | "asked"
  | "waiting-list"
  | "turned-down"
  /** The sign-up was cancelled, by them or by an organiser. */
  | "cancelled"
  /** The event itself was cancelled. */
  | "event-cancelled";

/** "Film night, Thu 22 Oct: had a place, didn’t come": what follows the colon. */
export const PERSON_EVENT_WORDS: Record<PersonEventState, string> = {
  came: "came",
  place: "has a place",
  missed: "had a place, didn’t come",
  unchecked: "had a place, check-in wasn’t used",
  asked: "asked for a place",
  "waiting-list": "on the waiting list",
  "turned-down": "turned down",
  cancelled: "sign-up cancelled",
  "event-cancelled": "event cancelled",
};

/** One event on the person's page. */
export type PersonEventRow = {
  eventId: string;
  title: string;
  /** When it starts, as an instant; null for an event with no date yet. */
  startAt: string | null;
  state: PersonEventState;
};

/** What `GET /api/admin/members/[uid]/events` answers. */
export type PersonEventsView = {
  /**
   * When they agreed to privacy version 15, as an instant, or null when they
   * have not: until then the page lists none of their events and counts none.
   */
  agreedAt: string | null;
  /** Whether the two most recent events that count both went by without them. */
  missed: boolean;
  /** This academic year's events they signed up for or came to, newest first. */
  events: PersonEventRow[];
};

export const PERSON_EVENTS_WORDS = {
  title: "Events",
  admins: "Admins only",
  loading: "Loading their events…",
  failed: "Their events didn’t load. Reload the page to try again.",
  notAgreed: "Their events show here once they accept the current privacy policy.",
  none: "No events this academic year.",
} as const;

/**
 * What counts towards the line, under the list: "Two in a row counts only
 * events since they accepted the privacy policy on Sat 31 Oct, where check-in
 * was used. It starts again each September."
 */
export function countsFromWords(agreedOn: string): string {
  return `Two in a row counts only events since they accepted the privacy policy on ${agreedOn}, where check-in was used. It starts again each September.`;
}

/**
 * THE EVENT PAGE'S PANEL FOR SOMEBODY WHO HOLDS A PLACE: "Can't make it"
 * gives it back, as the cancel link in their email does, and the waiting list
 * moves up. Offered until the event starts.
 */
export const HELD_PLACE_WORDS = {
  heading: "You have a place",
  lede: "Can’t come after all? Give it back so somebody else can have it.",
  cantMakeIt: "Can’t make it",
  /** True of the code: a place given back is never counted (`src/lib/events/missedEvents.ts`). */
  never: "Giving it back before it starts never counts as not coming.",
  started: "It has started. See you there.",
  ask: "Give your place back?",
  askLede: "Somebody else can then have it. If you change your mind, you can ask for a place again.",
  giveBack: "Give my place back",
  giving: "Giving it back…",
  keep: "Keep my place",
  givenHeading: "Your place is given back",
  givenLede: "Thanks for letting us know. If you change your mind, you can ask for a place again.",
  askAgain: "Ask for a place again",
  failed: "That didn’t go through. Try again.",
} as const;

/** "Film night, Thu 22 Oct: had a place, didn’t come", the day already in words. */
export function personEventLine(title: string, day: string | null, state: PersonEventState): string {
  const name = title.trim() || "Untitled event";
  return `${day ? `${name}, ${day}` : name}: ${PERSON_EVENT_WORDS[state]}`;
}
