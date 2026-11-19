import { dayWords, hoursWords, roomAndCampusWords } from "../sessionChange/words";
import { greetingWords, type ReminderPlace, type WeekEmailWords } from "../weekEmails/words";

/**
 * THE ROOMS FOR THE REST OF TERM, IN ONE EMAIL PER GROUP: every word of it,
 * and every word the term's rooms page says about it.
 *
 * ── THE EMAIL (approved word for word) ──────────────────────────────────────
 *
 *   Where Group C meets for the rest of term
 *   Hi Daniel,
 *   Here is where each of Group C’s sessions is:
 *   Week 4 · Wed 25 Nov, 3pm to 5pm · Portland A21 (University Park)
 *   Week 5 · Wed 2 Dec, 3pm to 5pm · room to be confirmed
 *   The latest is always on your programme page.
 *   [Open your programme page]
 *
 * The words live in `TERM_ROOMS_EMAIL_WORDS` and only `termRoomsEmailWords`
 * reads them. A line's place is said as the reminder of a session says it
 * (`reminderPlaceOf`): a room with its campus, "online", or "room to be
 * confirmed" (none set, cleared for the week, or a link typed as the room,
 * which no email prints). Nothing else is said: a state these words do not
 * cover sends no email (`./model.ts`), and the page says so to staff.
 *
 * ── THE PAGE (staff only) ───────────────────────────────────────────────────
 * Everything below the email is read by an admin or a programme's lead on the
 * term's rooms page, and by nobody else.
 *
 * No imports beyond pure words, so the browser and the server say the same.
 */

export const TERM_ROOMS_EMAIL_WORDS = {
  /** "Where Group C meets for the rest of term". */
  subject: (groupName: string) => `Where ${groupName} meets for the rest of term`,
  /** "Here is where each of Group C’s sessions is:". */
  intro: (groupName: string) => `Here is where each of ${groupName}’s sessions is:`,
  /** "Week 4 · Wed 25 Nov, 3pm to 5pm · Portland A21 (University Park)". */
  line: (weekNumber: number, when: string, where: string) => `Week ${weekNumber} · ${when} · ${where}`,
  online: "online",
  toBeConfirmed: "room to be confirmed",
  latest: "The latest is always on your programme page.",
  button: "Open your programme page",
} as const;

/** One session still to come, as its line is made. */
export type TermRoomsSessionFacts = {
  weekNumber: number;
  dateKey: string;
  /** "15:00". */
  hhmm: string;
  /** The session's length; 0 when it has none, and the end time is left out. */
  minutes: number;
  place: ReminderPlace;
};

/** Where a session is, in a line: a room with its campus, "online" or "room to be confirmed". */
function placeWords(place: ReminderPlace): string {
  const W = TERM_ROOMS_EMAIL_WORDS;
  if (place.kind === "online") return W.online;
  if (place.kind === "to-be-confirmed") return W.toBeConfirmed;
  return roomAndCampusWords(place.room, place.campus);
}

/** "Week 4 · Wed 25 Nov, 3pm to 5pm · Portland A21 (University Park)". */
export function termRoomsLine(session: TermRoomsSessionFacts): string {
  const when = `${dayWords(session.dateKey)}, ${hoursWords(session.hhmm, session.minutes)}`;
  return TERM_ROOMS_EMAIL_WORDS.line(session.weekNumber, when, placeWords(session.place));
}

/**
 * EVERY WORD OF ONE PERSON'S EMAIL: the subject, their greeting ("Hi
 * Daniel,", or none when the account gives no name), the opening line, one
 * line a session (theirs: `./model.ts` says which), the closing line and the
 * button to their programme page for the run. Laid out by `WeekEmail`, the
 * notice line above the words.
 */
export function termRoomsEmailWords(input: {
  groupName: string;
  firstName: string;
  lines: readonly string[];
  programmeUrl: string;
}): WeekEmailWords {
  const W = TERM_ROOMS_EMAIL_WORDS;
  const intro = W.intro(input.groupName);
  return {
    subject: W.subject(input.groupName),
    preheader: intro,
    greeting: greetingWords(input.firstName),
    paragraphs: [intro, ...input.lines, W.latest],
    lists: [],
    button: W.button,
    link: input.programmeUrl,
    after: [],
    feedback: null,
  };
}

// ---------------------------------------------------------------------------
// The term's rooms page (staff only)
// ---------------------------------------------------------------------------

/** "1 person", "12 people". */
function people(n: number): string {
  return `${n} ${n === 1 ? "person" : "people"}`;
}

/** "1 group", "4 groups". */
function groups(n: number): string {
  return `${n} ${n === 1 ? "group" : "groups"}`;
}

/** The heading over each programme's list of groups to email. */
export const EMAIL_HEADING = "Tell each group where its sessions are";

/** The line under it: what the email is, and that saving the grid never sends it. */
export const EMAIL_LEDE =
  "One email to each person in the group and its facilitators, listing where each of their sessions still to come is. It goes only when you press its button: saving the grid emails nobody.";

/** "Email Group C its rooms". */
export function emailGroupWords(groupName: string): string {
  return `Email ${groupName} its rooms`;
}

/** The one button for every group shown. */
export const EMAIL_EVERY_GROUP = "Email every group shown its rooms";

/** "Last emailed Thu 19 Nov at 2:05pm by Alex Doe." */
export function lastEmailedWords(when: string, byName: string): string {
  const by = byName.trim();
  return by ? `Last emailed ${when} by ${by}.` : `Last emailed ${when}.`;
}

export const NEVER_EMAILED = "Not emailed its rooms yet.";

/** An incubator's people are never told the word group: the email cannot be written for them. */
export const INCUBATOR_NO_EMAIL = "An incubator’s people aren’t emailed their rooms from here: the email names their group.";

/** While the dialog asks the route who the email goes to. */
export const CHECKING = "Checking who it goes to…";

/** "It goes to 12 people: everybody in Group C for at least one of its sessions still to come, and its facilitators." */
export function goesToWords(n: number, groupName: string): string {
  return `It goes to ${people(n)}: everybody in ${groupName} for at least one of its sessions still to come, and its facilitators, never you.`;
}

/** "2 of them move group part way through, so their emails list only their own weeks." */
export function fewerLinesWords(n: number): string {
  return n === 1
    ? "1 of them moves group part way through, so their email lists only their own weeks."
    : `${n} of them move group part way through, so their emails list only their own weeks.`;
}

/** "One of the 12, as it goes to Daniel." */
export function sampleWords(n: number, firstName: string): string {
  const name = firstName.trim();
  return name ? `One of the ${n}, exactly as it goes to ${name}:` : `One of the ${n}, exactly as it goes:`;
}

/** The press: "Email 12 people". */
export function emailPeopleWords(n: number): string {
  return `Email ${people(n)}`;
}

/** The press for every group: "Email 4 groups (46 people)". */
export function emailGroupsWords(groupCount: number, peopleCount: number): string {
  return `Email ${groups(groupCount)} (${people(peopleCount)})`;
}

/** "3 groups have nothing to email, and are left out:", over the list of why. */
export function leftOutWords(n: number): string {
  return n === 1 ? "1 group has nothing to email, and is left out:" : `${n} groups have nothing to email, and are left out:`;
}

export const CANCEL = "Cancel";
export const CLOSE = "Close";
export const SENDING = "Emailing…";
export const PREVIEW_TITLE = "The email";

/** Why a group gets no email, on the page and in the route's refusal. */
export const NO_EMAIL = {
  incubator: INCUBATOR_NO_EMAIL,
  noSessions: "This group has no session still to come, so there’s nothing to email.",
  nobody: "Nobody in this group would get it: nobody has been told their group yet, or nobody is in it for a session still to come.",
  unnamed: "This group has no name, and the email names it. Give it one on the Groups tab first.",
} as const;

/** What one group's press did: "Emailed 12 people." and its kin. */
export function sentWords(tally: { sent: number; held: number; suppressed: number; failed: number }): string {
  const parts = [`Emailed ${people(tally.sent)}.`];
  if (tally.suppressed > 0) parts.push(`${people(tally.suppressed)} on the do-not-email list ${tally.suppressed === 1 ? "wasn’t" : "weren’t"} emailed.`);
  if (tally.held > 0) parts.push(`${people(tally.held)} ${tally.held === 1 ? "was" : "were"} held back by this copy of the site.`);
  if (tally.failed > 0) {
    parts.push(
      `${tally.failed === 1 ? "1 email" : `${tally.failed} emails`} didn’t go. Nothing is sent again by itself: pressing again emails everybody in the group again.`,
    );
  }
  return parts.join(" ");
}

/** A second press of the same dialog, answered once. */
export const ALREADY_SENT = "That was already sent: it went once.";

/** The count changed between the dialog and the press. */
export function countChangedWords(n: number): string {
  return `Who it goes to changed: it would now go to ${people(n)}. Nothing was sent. Check it again, then press.`;
}

/** No answer came back. */
export const UNKNOWN_OUTCOME = "We couldn’t tell whether that went. Reload this page and look at when the group was last emailed before you press again.";

/** The route's refusals that are not about the email's people. */
export const REFUSAL = {
  body: "Say whether this is a preview, or the count you were shown and this press’s key.",
  gone: "That group no longer meets.",
  notYours: "Only an admin or the programme’s lead can email a group its rooms.",
  overCap: "This group has more people than one send can take, so nothing was sent. Raise it with an admin.",
  unread: "The limits on this email couldn’t be read, so nothing was sent. Try again.",
  failed: "That didn’t go through, so nothing was sent.",
} as const;

/** The History row's one sentence: "Emailed Group C where each of its 5 sessions still to come is, to 12 people." */
export function historyWords(groupName: string, sessions: number, emailed: number): string {
  return `Emailed ${groupName} where each of its ${sessions === 1 ? "1 session" : `${sessions} sessions`} still to come is, to ${people(emailed)}.`;
}
