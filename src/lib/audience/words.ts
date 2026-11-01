import { formatSiteDate } from "@/lib/datetime/siteTime";
import { TRACK_LABELS } from "@/lib/firestore/users";
import type { GridRow } from "./kind";
import type { EventPart, ProgrammePart, RoleTag, SubscribedChannel, TermPart } from "./tags";

/**
 * THE WORDS OF "WHO IS THIS FOR?", in one place: the picker's, the routes'
 * and the tags' own. No server import, so the picker in the browser and the
 * routes say the same thing in the same words.
 *
 * British English, sentence case, no dashes: the sign that leaves people out
 * is a minus sign (U+2212), never a hyphen or a dash.
 */

/** The sign on a tag that leaves its people out. */
export const LEAVE_OUT_SIGN = "−";
/** The sign on a tag that includes its people. */
export const INCLUDE_SIGN = "+";

export const PICKER_WORDS = {
  title: "Who is this for?",
  hint: `Add tags to include people, leave out with ${LEAVE_OUT_SIGN}`,
  inputLabel: "Add a tag or a name",
  inputPlaceholder: "Add a tag or a name",
  noMatch: "No tag or name matches that.",
  browse: "All tags",
  browseHide: "Hide the tags",
  add: "Add",
  leaveOut: "Leave out",
  remove: "Remove",
  goneTag: "A tag that has gone",
  seeWho: "See who",
  hideWho: "Hide who",
  willBeEmailed: "Will be emailed",
  leftOutHeading: "Left out",
  leftOutTitle: "Left out, and why",
  why: "Why",
  people: "People",
  you: "you",
  rowLabel: "Which of their settings it reads",
  nothingChosen: "Add a tag to see who it reaches.",
  nobody: "Nobody is in these tags.",
  noTags:
    "There are no tags you can use yet. They come from the programmes you lead, the groups you facilitate, and, for the committee, the term's events.",
  loading: "Loading the tags…",
  counting: "Counting…",
  loadFailed: "We couldn’t load the tags. Try again in a moment.",
  countFailed: "We couldn’t work out who this reaches. Try again in a moment.",
  whoFailed: "We couldn’t list who this reaches. Try again in a moment.",
  retry: "Try again",
} as const;

/** What the routes answer when they refuse, by the refusal. */
export const AUDIENCE_REFUSAL = {
  notSignedIn: "Sign in to choose who a message is for.",
  notApproved: "Your account can’t choose who a message is for.",
  body: "That isn’t a list of tags we can read.",
  notYours: "One of those tags isn’t one you can use, or it has gone. Reload the page and choose again.",
  notConfigured: "Server not configured",
} as const;

// ---------------------------------------------------------------------------
// The tags
// ---------------------------------------------------------------------------

const TERM_LABELS: Record<TermPart, string> = {
  applied: "Applied",
  holding: "Holding a place",
  facilitating: "Facilitating",
  leading: "Leading",
  invited: "Invited, not answered",
};

export const termTagLabel = (part: TermPart): string => TERM_LABELS[part];

/** The heading over the term's own tags. */
export const termHeading = (label: string): string => `This term: ${label.trim() || "this term"}`;

const PROGRAMME_LIST_LABELS: Record<ProgrammePart, string> = {
  everyone: "Everyone",
  holding: "Holding a place",
  facilitating: "Facilitating",
};

/** "AGI Strategy: holding a place". */
export function programmeTagLabel(programme: string, part: ProgrammePart): string {
  return `${programme}: ${PROGRAMME_LIST_LABELS[part].toLowerCase()}`;
}

/** The same tag under its programme's heading. */
export const programmeListLabel = (part: ProgrammePart): string => PROGRAMME_LIST_LABELS[part];

/** "AGI Strategy: Group C". */
export const groupTagLabel = (programme: string, group: string): string => `${programme}: ${group}`;

/** What a programme or a group with no name of its own is called. */
export const UNNAMED_PROGRAMME = "Programme";
export const UNNAMED_GROUP = "Untitled group";
export const UNTITLED_EVENT = "Untitled event";

const EVENT_LABELS: Record<EventPart, string> = {
  came: "Came to",
  "signed-up": "Signed up",
  "no-show": "Didn’t come",
};

/**
 * "Came to: Freshers social". `day` is added when two of the term's events
 * share a title, so the two tags can be told apart.
 */
export function eventTagLabel(part: EventPart, title: string, day: string | null): string {
  return `${EVENT_LABELS[part]}: ${title}${day ? `, ${day}` : ""}`;
}

/** An event's day, "Wed 30 Sep", read in London. */
export function eventDay(at: Date): string {
  return formatSiteDate(at, { weekday: "short", day: "numeric", month: "short" });
}

const SUBSCRIBED_LIST_LABELS: Record<SubscribedChannel, string> = {
  newsletter: "Newsletter",
  events: "Event announcements",
};

export const subscribedTagLabel = (channel: SubscribedChannel): string => `Subscribed: ${SUBSCRIBED_LIST_LABELS[channel]}`;
export const subscribedListLabel = (channel: SubscribedChannel): string => SUBSCRIBED_LIST_LABELS[channel];

const ROLE_LABELS: Record<RoleTag, string> = { committee: "Committee", admin: "Admins" };

export const roleTagLabel = (role: RoleTag): string => ROLE_LABELS[role];
export const trackTagLabel = (track: keyof typeof TRACK_LABELS): string => TRACK_LABELS[track];

export const GROUP_HEADINGS = {
  events: "Events",
  subscribed: "Subscribed",
  roles: "Roles and tags",
} as const;

/** What a person with no name on their record is called on the list. */
export const NO_NAME = "No name on file";

// ---------------------------------------------------------------------------
// The count, how it would be sent, and who is left out
// ---------------------------------------------------------------------------

/** "1 person", "23 people". */
export function peopleWords(n: number): string {
  return n === 1 ? "1 person" : `${n} people`;
}

/** "23 people, including you". */
export function headlineWords(people: number, you: boolean): string {
  return `${peopleWords(people)}${you && people > 0 ? ", including you" : ""}`;
}

/** "23 will be emailed · 0 left out". */
export function emailedWords(emailed: number, leftOut: number): string {
  return `${emailed} will be emailed · ${leftOut} left out`;
}

/** A row of the settings grid, as a sentence says it. */
const ROW_IN_A_SENTENCE: Record<GridRow, string> = {
  newsletter: "the newsletter",
  events: "event announcements",
  courses: "course announcements",
};

/** A row of the settings grid, as the choice of row lists it. */
export const ROW_LABELS: Record<GridRow, string> = {
  newsletter: "Newsletter",
  events: "Event announcements",
  courses: "Course announcements",
};

export const rowInASentence = (row: GridRow): string => ROW_IN_A_SENTENCE[row];

export const MODE_LABELS = {
  notice: "Programme notice",
  grid: "By their settings",
} as const;

/**
 * Why a message would go the way it would, in one sentence the writer reads
 * beside the count. `tagsAllow` is whether the tags are about running a
 * programme at all.
 */
export function modeWords(mode: "notice" | "grid", row: GridRow, tagsAllow: boolean): string {
  if (mode === "notice") {
    return (
      "Everybody here is on a programme you run, so it goes as a notice: it reaches them whatever their settings say. " +
      "Keep it to running the programme; news goes by their settings."
    );
  }
  const yes = `only people who said yes to ${ROW_IN_A_SENTENCE[row]} are emailed.`;
  return tagsAllow
    ? `Not everybody here is on a programme you run, so it goes by their settings: ${yes}`
    : `It isn’t about running a programme, so it goes by their settings: ${yes}`;
}

/** Why somebody would not be emailed. */
export type LeftOutReason = "no-address" | "suppressed" | "settings" | "left" | "walk-in";

/** The order the reasons are listed in. */
export const LEFT_OUT_REASONS: readonly LeftOutReason[] = ["settings", "left", "walk-in", "no-address", "suppressed"];

export function leftOutWords(reason: LeftOutReason, row: GridRow): string {
  switch (reason) {
    case "no-address":
      return "No email address on record";
    case "suppressed":
      return "Their address bounced or marked us as spam";
    case "settings":
      return `Didn’t say yes to ${ROW_IN_A_SENTENCE[row]}`;
    case "left":
      return "Left the programme";
    case "walk-in":
      return "Came without signing up: the address they left is only for the event’s survey";
  }
}

// ---------------------------------------------------------------------------
// The preview on the mailing list page
// ---------------------------------------------------------------------------

export const PREVIEW_WORDS = {
  title: "Who would a message reach?",
  note: "Choose tags to see who they reach, and who would be left out and why. Nothing is sent from here.",
  show: "Show",
  hide: "Hide",
} as const;
