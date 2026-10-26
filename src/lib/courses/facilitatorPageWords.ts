import { clockWords, dayWords, namesWords, weeksWords } from "./sessionChange/words";

/**
 * THE WORDS OF THE PAGES A FACILITATOR USES EVERY WEEK, in one place: their
 * group's page (board wk-fac-group, laptop and phone), the group's register
 * page, their Home (wk-fac-home-phone), and the notes a group's facilitators
 * share (C30), where the programme's lead reads them too.
 *
 * The boards' own words are kept exactly, apostrophes included, and every
 * name, date, time, room and count in them is a slot filled from a record by
 * the caller. Words the boards do not draw (a session that is not tonight, a
 * register not finished, a group behind the programme, an empty list) are
 * written in the same voice and are listed in the build notes for the
 * boards' designers to confirm.
 *
 * NO PRONOUN IS GUESSED. Where the boards give somebody who left a pronoun,
 * the page names the person ("Sam’s off the register"): the site never
 * decides how somebody is referred to.
 *
 * No sentence here carries a dash of either kind. Pure, with no imports
 * beyond the house date words, so the server pages, the pages in the browser
 * and the tests all read the same sentences.
 */

/** "Tonight" from 5pm, "Today" before it: the notice's own rule. */
function tonightOrToday(startTimeLocal: string): "Tonight" | "Today" {
  const hour = Number(startTimeLocal.slice(0, 2));
  return Number.isInteger(hour) && hour >= 17 ? "Tonight" : "Today";
}

function capitalised(text: string): string {
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : text;
}

// ---------------------------------------------------------------------------
// The group page's head
// ---------------------------------------------------------------------------

export const MY_PROGRAMMES = "My programmes";

/** "Fellowship: AGI Strategy", or the name alone when the kind is not known. */
export function programmeWords(kind: "fellowship" | "incubator" | null, name: string): string {
  const kindWord = kind === "fellowship" ? "Fellowship" : kind === "incubator" ? "Incubator" : "";
  const trimmed = name.trim();
  if (!trimmed) return kindWord;
  return kindWord ? `${kindWord}: ${trimmed}` : trimmed;
}

/** "with Sofia Rossi": the group's other facilitators, by their whole names. "" with none. */
export function coFacilitatorsWords(names: readonly string[]): string {
  return names.length > 0 ? `with ${namesWords(names)}` : "";
}

/** The parts of the line under the group's name, in the board's order, each one that is known. */
export function groupHeadParts(parts: { programme: string; slot: string; room: string; with: string }): string[] {
  return [parts.programme, parts.slot, parts.room, parts.with].map((part) => part.trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// The session ticket
// ---------------------------------------------------------------------------

/** The group page's ticket heading: "Tue 17 Nov, 6pm". */
export function ticketHeading(dateKey: string, startTimeLocal: string): string {
  return [dayWords(dateKey), clockWords(startTimeLocal)].filter(Boolean).join(", ");
}

/** Home's ticket heading: "Group B, 6pm". */
export function homeTicketHeading(groupName: string, startTimeLocal: string): string {
  return [groupName.trim(), clockWords(startTimeLocal)].filter(Boolean).join(", ");
}

/** Home's line under it: "Room C20 · with Sofia", what is known of the two. */
export function homeRoomLine(room: string, coFacilitatorFirstNames: readonly string[]): string {
  const withPart = coFacilitatorFirstNames.length > 0 ? `with ${namesWords(coFacilitatorFirstNames)}` : "";
  return [room.trim(), withPart].filter(Boolean).join(" · ");
}

/** "6 expected": the people taking part in the group who are on its register. */
export function expectedWords(people: number): string {
  return `${people} expected`;
}

export const TAKE_THE_REGISTER = "Take the register";

/** Where the next session would be, once the group's last one is over: Home's own sentence. */
export const NO_MORE_SESSIONS = "No more sessions are planned for your group.";

/**
 * Under Home's "Take the register": "Opens your group’s register for
 * tonight." on the day of an evening session, "for today." on the day of a
 * daytime one, and on any other day where it leads.
 */
export function takeRegisterLine(isToday: boolean, startTimeLocal: string): string {
  if (!isToday) return "Opens your group’s register.";
  return `Opens your group’s register for ${tonightOrToday(startTimeLocal).toLowerCase()}.`;
}

// ---------------------------------------------------------------------------
// Your group
// ---------------------------------------------------------------------------

export const YOUR_GROUP = "Your group";

/** "Weeks 1 and 2": the weeks whose finished registers the marks come from. "" for none. */
export function finishedWeeksWords(weekNumbers: readonly number[]): string {
  return weekNumbers.length > 0 ? capitalised(weeksWords(weekNumbers)) : "";
}

export const NAMES_ONLY = "Names only. Email addresses stay with admins.";
export const NOBODY_IN_GROUP = "Nobody is in this group yet.";

/** What a session that is not one of the five marks says to a screen reader. */
export const GROUP_MARK_WORDS = {
  "not-marked": "Not marked",
  "not-held": "Didn’t happen",
  before: "Not in the group yet",
  after: "Had left",
} as const;

/** "Week 2: Late", one mark said whole. */
export function groupMarkWords(weekNumber: number, word: string): string {
  return `Week ${weekNumber}: ${word}`;
}

// ---------------------------------------------------------------------------
// Registers
// ---------------------------------------------------------------------------

export const REGISTERS = "Registers";
export const SEE_IT = "See it";

/** The register's own word for a finished register: "Finished" on the schedule, "Pushed" while the push still sends. */
export function finishedWord(scheduled: boolean): string {
  return scheduled ? "Finished" : "Pushed";
}

/** A register whose session has ended and that nobody has finished. */
export function notFinishedWord(scheduled: boolean): string {
  return scheduled ? "Not finished" : "Not pushed";
}

export const DID_NOT_HAPPEN = "Didn’t happen";
export const CANCELLED = "Cancelled";

/** "Tonight" or "Today", over a session that is on today and has not ended. */
export function todayWord(startTimeLocal: string): "Tonight" | "Today" {
  return tonightOrToday(startTimeLocal);
}

/** "7 of 8 came": late and left early count as came. */
export function cameWords(came: number, of: number): string {
  return `${came} of ${of} came`;
}

/** Before any session has started: when the first register is. */
export function firstRegisterWords(dateKey: string): string {
  const day = dayWords(dateKey);
  return day ? `The first register is on ${day}.` : "There’s no register yet.";
}

// ---------------------------------------------------------------------------
// To review
// ---------------------------------------------------------------------------

export const TO_REVIEW = "To review";
export const REVIEW = "Review";
export const NOTHING_TO_REVIEW = "Nothing to review.";
/** The way to every exercise, under the list: the old page's own words. */
export const REVIEW_EXERCISES = "Review exercises";

/** "Week 2 exercise", or "Week 2 exercises" for more than one from one person. */
export function reviewWeekWords(weekNumber: number, count: number): string {
  return count > 1 ? `Week ${weekNumber} exercises` : `Week ${weekNumber} exercise`;
}

/** "sent Mon 16 Nov". "" without a day. */
export function sentWords(dateKey: string): string {
  const day = dayWords(dateKey);
  return day ? `sent ${day}` : "";
}

/** Home's count: "3 exercises to review", "1 exercise to review". */
export function toReviewWords(count: number): string {
  if (count === 0) return NOTHING_TO_REVIEW;
  return count === 1 ? "1 exercise to review" : `${count} exercises to review`;
}

// ---------------------------------------------------------------------------
// Pace
// ---------------------------------------------------------------------------

export const PACE = "Pace";
/** The way to the group's own weeks and pace: the old page's own words. */
export const WEEKS_AND_SCHEDULE = "Weeks & schedule";

/** Where the group is against the programme, in weeks: 0 on pace, above 0 behind, below 0 ahead. */
export function paceWords(weeksBehind: number): string {
  if (weeksBehind === 0) return "On pace with the programme.";
  const n = Math.abs(weeksBehind);
  const span = n === 1 ? "A week" : `${n} weeks`;
  return weeksBehind > 0 ? `${span} behind the programme.` : `${span} ahead of the programme.`;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

export const THIS_WEEK = "This week";

/**
 * Next week's email on Home, while it is on its schedule (2c): when it goes,
 * or what it is waiting for. The register's own sentence without its "whatever
 * happens here", which belongs beside the register's button.
 */
export function homeNextEmailWords(
  groupName: string,
  line:
    | { state: "goes"; at: string }
    | { state: "went"; at: string }
    | { state: "waiting-for-week"; weekNumber: number }
    | { state: "held"; missing: string[] }
    | { state: "shortly" },
): string {
  const group = groupName.trim() || "your group";
  switch (line.state) {
    case "goes":
      return `Next week’s email goes to ${group} on ${line.at}.`;
    case "went":
      return `Next week’s email went to ${group} on ${line.at}.`;
    case "waiting-for-week":
      return `Next week’s email to ${group} is waiting for week ${line.weekNumber} to be published.`;
    case "held":
      return `Next week’s email to ${group} is held: it’s missing ${namesWords(line.missing)}.`;
    case "shortly":
      return `Next week’s email to ${group} goes out shortly.`;
  }
}

/**
 * Somebody who left the group recently, on Home: "Sam Whitfield left the
 * programme on Fri 13 Nov. Sam’s off the register from tonight." Named, never
 * a pronoun. `from` is when the register they are off is: "tonight",
 * "today", or a day.
 */
export function leftLine(args: {
  name: string;
  firstName: string;
  leftDateKey: string | null;
  from: { kind: "tonight" } | { kind: "today" } | { kind: "day"; dateKey: string } | null;
}): string {
  const day = args.leftDateKey ? dayWords(args.leftDateKey) : "";
  const first = day ? `${args.name} left the programme on ${day}.` : `${args.name} left the programme.`;
  const who = args.firstName.trim() || args.name;
  if (!args.from) return `${first} ${who}’s off the register.`;
  const from =
    args.from.kind === "day" ? (dayWords(args.from.dateKey) || "now") : args.from.kind === "tonight" ? "tonight" : "today";
  return `${first} ${who}’s off the register from ${from}.`;
}

// ---------------------------------------------------------------------------
// Home before the group's first session (board st-fac-before-phone)
// ---------------------------------------------------------------------------

/**
 * Over the first session's date on Home before it: "Tomorrow · week 1" the
 * day before, the board's; "Your first session · week 1" on the days before
 * that, the programme home's own.
 */
export function firstSessionEyebrow(tomorrow: boolean, weekNumbers: readonly number[]): string {
  return `${tomorrow ? "Tomorrow" : "Your first session"} · ${weeksWords(weekNumbers)}`;
}

/** The ticket's way to the group's page, before the first session. */
export const OPEN_YOUR_GROUP = "Open your group";

export const WHOS_COMING = "Who’s coming";

/**
 * "6 of 8 said they’re coming. Kofi and Zara haven’t said." From each
 * person's first name and whether they have said so, in the group's order.
 * Up to three who have not said are named; more are counted. Never says
 * anybody is not coming: no reply is not a no.
 */
export function whosComingSentence(people: readonly { firstName: string; coming: boolean }[]): string {
  const all = people.length;
  const coming = people.filter((person) => person.coming).length;
  const notSaid = people.filter((person) => !person.coming).map((person) => person.firstName);
  if (all === 0) return "";
  if (coming === all) return all === 1 ? "1 of 1 said they’re coming." : `All ${all} said they’re coming.`;
  const first = `${coming} of ${all} said they’re coming.`;
  const rest =
    notSaid.length === 1
      ? `${notSaid[0]} hasn’t said.`
      : notSaid.length <= 3
        ? `${namesWords(notSaid)} haven’t said.`
        : `${notSaid.length} haven’t said.`;
  return `${first} ${rest}`;
}

/** What a chip says to assistive technology after the name: ", coming" or ", hasn’t said". */
export function comingChipWords(coming: boolean): string {
  return coming ? ", coming" : ", hasn’t said";
}

export const SAY_HELLO = "Say hello";

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * "Send your group a hello before Tuesday.", the first session's weekday,
 * while it is within the week; "before Tue 3 Nov." further off, so the day
 * cannot be read as this week's.
 */
export function sayHelloLine(firstSessionDateKey: string, withinAWeek: boolean): string {
  const at = /^\d{4}-\d{2}-\d{2}$/.test(firstSessionDateKey) ? new Date(`${firstSessionDateKey}T12:00:00Z`) : null;
  const weekday = at ? WEEKDAY_NAMES[at.getUTCDay()] : "";
  const day = withinAWeek && weekday ? weekday : dayWords(firstSessionDateKey);
  return day ? `Send your group a hello before ${day}.` : "Send your group a hello before your first session.";
}

// ---------------------------------------------------------------------------
// The notes a group's facilitators share (C30)
// ---------------------------------------------------------------------------

/**
 * The notes card's title for one of the group's facilitators: "Notes for you
 * and Sofia", the others by first name; "Notes for you" with none. For a
 * reader who is not one of them (an admin): "Notes for Rahul and Sofia".
 */
export function notesTitle(otherFirstNames: readonly string[], readerFacilitates: boolean): string {
  if (!readerFacilitates) {
    return otherFirstNames.length > 0 ? `Notes for ${namesWords(otherFirstNames)}` : "Notes for the facilitators";
  }
  return otherFirstNames.length > 0 ? `Notes for you and ${namesWords(otherFirstNames)}` : "Notes for you";
}

/**
 * Who reads them: "Only Group B’s facilitators, Claudia and admins see
 * these." The lead is named by first name; "you" when the reader is the lead;
 * left out when the programme names no lead.
 */
export function notesWhoLine(groupName: string, lead: { firstName: string; isReader: boolean } | null): string {
  const group = groupName.trim() || "the group";
  const owner = `${group}’s facilitators`;
  if (!lead || (!lead.isReader && !lead.firstName.trim())) return `Only ${owner} and admins see these.`;
  return `Only ${owner}, ${lead.isReader ? "you" : lead.firstName.trim()} and admins see these.`;
}

/** "Sofia · Wed 11 Nov", over one note. */
export function noteByline(firstName: string, dateKey: string): string {
  return [firstName.trim(), dayWords(dateKey)].filter(Boolean).join(" · ");
}

export const ADD_A_NOTE = "Add a note";
export const NOTE_PLACEHOLDER = "What went well, who needs a nudge…";
export const SAVE_NOTE = "Save note";
export const SAVING_NOTE = "Saving…";
export const NOTE_SAVED = "Note saved.";
export const NO_NOTES_YET = "No notes yet.";

/** The lead's heading over a group's notes on the Attendance tab. */
export function leadNotesHeading(groupName: string): string {
  return `Notes from ${groupName.trim() || "the group"}’s facilitators`;
}

/** The notes route's refusals, each a sentence a person can act on. */
export const NOTE_REFUSAL = {
  body: "That note didn’t come through. Try again.",
  empty: "Write your note in the box first, then save it.",
  notYours: "Only the group’s facilitators can add a note here.",
  network: "That didn’t go through: check your connection and try again.",
} as const;

/** "That note is too long: keep it to 2,000 characters." */
export function noteTooLongWords(max: number): string {
  return `That note is too long: keep it to ${new Intl.NumberFormat("en-GB").format(max)} characters.`;
}

// ---------------------------------------------------------------------------
// The register's page
// ---------------------------------------------------------------------------

/** "Group B’s register". */
export function registerTitle(groupName: string): string {
  return `${groupName.trim() || "The group"}’s register`;
}
