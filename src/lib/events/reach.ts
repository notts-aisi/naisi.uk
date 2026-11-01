import type { EventVisibility } from "@/lib/firestore/events";
import { canApproveEvent, canDraftEvent } from "@/lib/firestore/users";

/**
 * WHO AN EVENT IS FOR, decided in one place.
 *
 * An event is for one of three audiences, stored as `visibility`:
 *
 *  - `public`, ANYONE: listed on /events, Home, the landing page and /links,
 *    and announced to the people who said yes to event announcements unless
 *    its organiser switched that off.
 *  - `members`, PEOPLE WITH A NAISI ACCOUNT: listed the same way with an
 *    "Account needed" badge, and announced the same way. Signing up needs an
 *    approved account.
 *  - `chosen`, ONLY PEOPLE THE ORGANISER CHOSE: listed nowhere and never
 *    announced. It shows on each invited person's Home, they are emailed an
 *    invitation when it is published, and only they (and the people who run
 *    events) can open it.
 *
 * ── WHY ONE MODULE ──────────────────────────────────────────────────────────
 * Every reader of an event used to compare the stored string for itself, and
 * several read anything but "members" as public. A third value would then
 * have been listed and announced by every one of them. So the stored value is
 * read here and nowhere else (`tests/event-visibility-readers.test.mjs` walks
 * the tree and fails on any other comparison), and the readers ask a question
 * instead: is it listed, does it need an account, may it be announced, may
 * this person open it.
 *
 * ── UNKNOWN VALUES FAIL CLOSED ──────────────────────────────────────────────
 * A value that is none of the three reads as `chosen`: an event nobody can
 * tell the audience of is listed nowhere and announced to nobody, which is the
 * failure that loses nothing but reach. A MISSING value still reads as
 * `members`, as it always has, so no event stored before this changes
 * meaning. `firestore.rules` makes the same two decisions for a browser.
 *
 * Isomorphic on purpose: no `server-only`, no Firestore import. The public
 * pages ask it in a Server Component, the editor and the sign-up form in a
 * Client Component, and the routes, the announcement and its job on the
 * server. The reads it needs (is this person invited) are made by
 * `./opening.ts` and handed in.
 */

export type EventReach = "listed" | "listed-account" | "chosen";

/** The three stored values, in the order the editor offers them. */
export const VISIBILITIES: readonly EventVisibility[] = ["public", "members", "chosen"];

/** The fields of an event this module reads. Every other field is somebody else's. */
export type ReachFields = {
  visibility?: unknown;
  /** Only a stored `false` is off: every event made before the switch announces as it always did. */
  announce?: unknown;
};

/**
 * THE ONE READING OF A STORED VALUE. Missing reads as `members`, as it always
 * has; anything that is not one of the three reads as `chosen`. See the
 * header.
 */
export function visibilityOf(raw: unknown): EventVisibility {
  if (raw === undefined || raw === null) return "members";
  if (raw === "public" || raw === "members" || raw === "chosen") return raw;
  return "chosen";
}

/** A value a request carries: one of the three, or null for anything else. */
export function parseVisibility(raw: unknown): EventVisibility | null {
  return raw === "public" || raw === "members" || raw === "chosen" ? raw : null;
}

/** Who an event is for. */
export function eventReach(event: ReachFields | null | undefined): EventReach {
  const visibility = visibilityOf(event?.visibility);
  if (visibility === "public") return "listed";
  if (visibility === "members") return "listed-account";
  return "chosen";
}

/** Listed on /events, Home, the landing page and /links. Every event but one for chosen people. */
export function isListed(event: ReachFields | null | undefined): boolean {
  return eventReach(event) !== "chosen";
}

/** For chosen people: listed nowhere, never announced, opened only by the people invited. */
export function isForChosenPeople(event: ReachFields | null | undefined): boolean {
  return eventReach(event) === "chosen";
}

/**
 * Whether signing up needs an approved account: for people with a NAISI
 * account, and for chosen people, who are accounts by construction.
 */
export function needsAccount(event: ReachFields | null | undefined): boolean {
  return eventReach(event) !== "listed";
}

/**
 * Whether a guest with no account may hear about it: never for an event that
 * needs an account. The announcement drops guest rows on this.
 */
export function guestsMayHear(event: ReachFields | null | undefined): boolean {
  return eventReach(event) === "listed";
}

/**
 * WHETHER PUBLISHING ANNOUNCES IT to the people who said yes to event
 * announcements: a listed event whose organiser did not switch it off. Only a
 * stored `false` is off, so every event made before the switch existed
 * announces exactly as it did. An event for chosen people never does, whatever
 * is stored: its people are told by their invitation.
 */
export function announces(event: ReachFields | null | undefined): boolean {
  return isListed(event) && event?.announce !== false;
}

// ---------------------------------------------------------------------------
// Who may open an event for chosen people
// ---------------------------------------------------------------------------

/** The fields of a session this module reads. */
export type ReachViewer = {
  uid: string;
  role: string;
  suRecognised?: boolean | null;
  permissions?: { draftEvent?: boolean; approveEvent?: boolean } | null;
};

const APPROVED_ROLES: readonly string[] = ["member", "committee", "admin"];

const isApproved = (viewer: ReachViewer | null | undefined): viewer is ReachViewer =>
  Boolean(viewer) && APPROVED_ROLES.includes(viewer!.role);

/**
 * WHETHER THIS PERSON RUNS EVENTS: an admin, a committee member, or somebody
 * holding the permission to draft or approve one. They are the people
 * `firestore.rules` already lets read every event document (the manage list
 * and the editor), so opening an event's page shows them nothing the rules do
 * not already hand them.
 */
export function runsEvents(viewer: ReachViewer | null | undefined): boolean {
  if (!isApproved(viewer)) return false;
  const user = { role: viewer.role as "member" | "committee" | "admin", permissions: viewer.permissions ?? undefined };
  return viewer.role === "admin" || viewer.role === "committee" || canDraftEvent(user) || canApproveEvent(user);
}

/**
 * What the server read about this person and this one event: whether they were
 * invited to it, and whether they are named on it (its author, or a
 * collaborator) and still stand behind that bar. `./opening.ts` makes both
 * reads.
 */
export type Named = { invited: boolean; organiser: boolean };

/**
 * MAY THIS PERSON OPEN THE EVENT: its page, its calendar page and file, its
 * check-in and survey codes. A listed event opens for anybody with its
 * address, as it always has (signing up is the sign-up route's question). An
 * event for chosen people opens only for an approved account that was invited
 * to it, is named on it, or runs events. Everybody else is told, calmly, that
 * it is only for the people invited to it.
 */
export function mayOpen(event: ReachFields | null | undefined, viewer: ReachViewer | null | undefined, named: Named): boolean {
  if (!isForChosenPeople(event)) return true;
  if (!isApproved(viewer)) return false;
  return named.invited || named.organiser || runsEvents(viewer);
}

/**
 * WHETHER A LIVE EVENT MAY TAKE THIS AUDIENCE, for the post-publish save.
 *
 * A listed event and one for chosen people are told about in different ways
 * at the moment they are published: one is announced, the other's people are
 * invited. Crossing between the two afterwards would either list an event
 * whose people were told it was theirs alone, or hide one that has already
 * been announced, so once it is published an event stays on its side. Between
 * the two listed audiences it moves freely, as it always could. A value that
 * is not one of the three is refused, never read as one of them, and an
 * absent one keeps what is stored.
 */
export function liveVisibilityChange(
  stored: unknown,
  asked: unknown,
): { ok: true; visibility: EventVisibility } | { ok: false; error: string } {
  const was = visibilityOf(stored);
  if (asked === undefined) return { ok: true, visibility: was };
  const next = parseVisibility(asked);
  if (next === null) return { ok: false, error: REACH_WORDS.unknownVisibility };
  if ((was === "chosen") !== (next === "chosen")) return { ok: false, error: REACH_WORDS.liveCrossing };
  return { ok: true, visibility: next };
}

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

/**
 * Who an event is for, in the words every surface uses. One name for an event
 * that needs an account: "People with a NAISI account" for the choice, and
 * "Account needed" for the badge.
 */
export const REACH_WORDS = {
  /** The three choices in the editor, and what each does. */
  choice: {
    listed: "Anyone",
    "listed-account": "People with a NAISI account",
    chosen: "Only people you choose",
  } satisfies Record<EventReach, string>,
  choiceHint: {
    listed: "Listed on naisi.uk/events, and can be announced to people who said yes to event announcements.",
    "listed-account": "Listed with an “Account needed” badge, and can be announced the same way.",
    chosen: "Not listed and not announced. It shows on their Home, and only they can open it.",
  } satisfies Record<EventReach, string>,
  /** The badge on a list and on the event's own page. Null: no badge. */
  badge: {
    listed: null,
    "listed-account": "Account needed",
    chosen: "Invitation only",
  } satisfies Record<EventReach, string | null>,
  /** "Who can come", on the event's page. */
  whoCanCome: {
    listed: "Everyone",
    "listed-account": "People with a NAISI account",
    chosen: "The people invited to it",
  } satisfies Record<EventReach, string>,
  /** The add-to-calendar page's line about who it is for. Null: nothing to say. */
  calendarLine: {
    listed: null,
    "listed-account": "This event is for people with a NAISI account.",
    chosen: "This event is for the people invited to it.",
  } satisfies Record<EventReach, string | null>,
  /** Under the sign-up form's heading. */
  formLede: {
    listed: "Anyone can come.",
    "listed-account": "This one is for people with a NAISI account.",
    chosen: "This one is for the people invited to it.",
  } satisfies Record<EventReach, string>,
  /** Above the sign-in button, for somebody signed out at an event that needs an account. */
  signInLede: {
    listed: "Sign in to ask for a place.",
    "listed-account": "This one is for people with a NAISI account. Sign in to ask for a place.",
    chosen: "This one is for the people invited to it. Sign in to ask for a place.",
  } satisfies Record<EventReach, string>,
  /** The editor's preview, above the sign-up form. Null: no note. */
  formNote: {
    listed: null,
    "listed-account": "People sign in to their NAISI account first.",
    chosen: "Only the people invited can ask for a place, signed in to their NAISI account.",
  } satisfies Record<EventReach, string | null>,
  /** The page somebody who was not invited sees in place of the event. */
  onlyInvited: "This event is only for the people invited to it.",
  onlyInvitedSignedOut: "If you were invited, sign in to see it.",
  onlyInvitedSignedIn: "If you think you were invited, ask the person who sent you the link.",
  signIn: "Sign in",
  seeWhatsOn: "See what else is on",
  /** The title link previews and the browser tab show for an event for chosen people. */
  plainTitle: "NAISI event",
  plainDescription: "An event on naisi.uk.",
  /** The sign-up route's refusals for an event for chosen people. */
  signUpSignIn: "Sign in to ask for a place at this event.",
  signUpNotInvited: "This event is only for the people invited to it.",
  unknownVisibility: "That isn’t who an event can be for.",
  liveCrossing:
    "Once it’s published, an event for the people you chose stays one, and a listed event can’t become one.",
} as const;
