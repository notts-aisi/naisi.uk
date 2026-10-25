import { clockWords, dayWords, namesWords, weeksWords } from "./sessionChange/words";

/**
 * THE WORDS OF THE PAGES A MEMBER USES EVERY WEEK, in one place: their
 * programme's home (boards st-programme and wk-programme, laptop and phone),
 * a week's page (wk-week-phone) and Home's card for their programme
 * (wk-home-phone).
 *
 * The boards' own words are kept exactly, apostrophes included, and every
 * name, date, time, room and count in them is a slot filled from a record by
 * the caller. Words the boards do not draw (a session that is not tonight, a
 * week that opens on another day, a mark other than Present) are written in
 * the same voice and are listed in the build notes for the boards' designers
 * to confirm.
 *
 * NO TARGET. Nothing here counts a member's sessions or says how many they
 * came to: their marks are one per session with a legend (C26). No sentence
 * here carries a dash of either kind (C35).
 *
 * Pure, with no imports beyond the house date words, so the server pages, the
 * pages in the browser and the tests all read the same sentences.
 */

/** "Tonight" from 5pm, "Today" before it: the notice's own rule. */
export function tonightWord(startTimeLocal: string): "Tonight" | "Today" {
  const hour = Number(startTimeLocal.slice(0, 2));
  return Number.isInteger(hour) && hour >= 17 ? "Tonight" : "Today";
}

// ---------------------------------------------------------------------------
// The head
// ---------------------------------------------------------------------------

/** "Week 3 of 6", the chip beside the programme's name. */
export function weekOfWords(weekNumber: number, totalWeeks: number): string {
  return totalWeeks > 0 ? `Week ${weekNumber} of ${totalWeeks}` : `Week ${weekNumber}`;
}

/** "Fellowship · Autumn 2026": the kind of programme and the run's term, upper case by the stylesheet. */
export function kindAndTermWords(kind: "fellowship" | "incubator" | null, term: string): string {
  const kindWord = kind === "fellowship" ? "Fellowship" : kind === "incubator" ? "Incubator" : "";
  return [kindWord, term.trim()].filter(Boolean).join(" · ");
}

/** "with Rahul and Sofia", from the facilitators' first names. "" with none. */
export function withWords(firstNames: readonly string[]): string {
  return firstNames.length > 0 ? `with ${namesWords(firstNames)}` : "";
}

/** "Group B · Tuesdays 6pm · Room C20 · with Rahul and Sofia": what is known, in that order. */
export function groupLineWords(parts: { groupName: string; slot: string; room: string; with: string }): string {
  return [parts.groupName, parts.slot, parts.room, parts.with].map((part) => part.trim()).filter(Boolean).join(" · ");
}

// ---------------------------------------------------------------------------
// The next session's card
// ---------------------------------------------------------------------------

/**
 * Over the session's date and time: "Tonight · week 3", "Your first session ·
 * week 1", and on Home on the day "Tonight · your first session". A session
 * that is neither the first nor today is "Your next session · week 4".
 */
export function sessionEyebrow(input: {
  isToday: boolean;
  isFirst: boolean;
  startTimeLocal: string;
  /** The weeks the session covers: its own, and a cancelled one before it ("weeks 4 and 5"). */
  weekNumbers: readonly number[];
  /** Home's card says "your first session" on the day; the programme home says the week. */
  home?: boolean;
}): string {
  const weeks = weeksWords(input.weekNumbers);
  if (input.isToday) {
    const when = tonightWord(input.startTimeLocal);
    return input.isFirst && input.home ? `${when} · your first session` : `${when} · ${weeks}`;
  }
  return input.isFirst ? `Your first session · ${weeks}` : `Your next session · ${weeks}`;
}

/** Beside a room that differs from the group's own this week. */
export const ROOM_CHANGED = "Room changed this week";

/** Home's card's heading: "Group B, 6pm to 8pm". The tile beside it carries the date. */
export function groupHoursWords(groupName: string, hours: string): string {
  return [groupName.trim(), hours].filter(Boolean).join(", ");
}

/** "6pm to 8pm", from the start and the length. "" without a time. */
export function hoursWords(startTimeLocal: string, durationMinutes: number): string {
  const start = clockWords(startTimeLocal);
  if (!start) return "";
  const match = /^(\d{2}):(\d{2})$/.exec(startTimeLocal);
  if (!match || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return start;
  const total = (Number(match[1]) * 60 + Number(match[2]) + durationMinutes) % 1440;
  const end = clockWords(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
  return end ? `${start} to ${end}` : start;
}

// ---------------------------------------------------------------------------
// This week, and before a session
// ---------------------------------------------------------------------------

export const THIS_WEEK = "This week";
export const BEFORE_FIRST_SESSION = "Before your first session";
export const BEFORE_YOUR_SESSION = "Before your session";
/** Home's card on the day of the session (wk-home-phone). */
export const BEFORE_TONIGHT = "Before tonight";
export const BEFORE_TODAY = "Before today";

/** "1 of 3 done". */
export function doneWords(done: number, of: number): string {
  return `${done} of ${of} done`;
}

/** "Week 3 · Who decides what AGI means", or "Week 3" for a week with no title yet. */
export function weekTitleWords(weekNumber: number, title: string): string {
  return title.trim() ? `Week ${weekNumber} · ${title.trim()}` : `Week ${weekNumber}`;
}

/** "Open week 3". */
export function openWeekWords(weekNumber: number): string {
  return `Open week ${weekNumber}`;
}

/** The link beside one reading, for a screen reader: "Open The reading's title". */
export function openItemWords(title: string): string {
  return `Open ${title}`;
}

/** A tick box's name: "Done: The reading's title". */
export function doneItemWords(title: string): string {
  return `Done: ${title}`;
}

/** The week page's line under its title: "1 of 3 done · about 50 min left". */
export function weekProgressWords(done: number, of: number, minutesLeft: string): string {
  return minutesLeft ? `${doneWords(done, of)} · ${minutesLeft} left` : doneWords(done, of);
}

/** A week that is not published yet: Home's own sentence. */
export function notUpYetWords(weekNumber: number): string {
  return `Week ${weekNumber} isn’t up yet.`;
}

/** A break in the group's plan has no reading of its own. */
export const NO_NEW_MATERIAL = "No new material this week.";

// ---------------------------------------------------------------------------
// When a week opens (C17)
// ---------------------------------------------------------------------------

/** Under the weeks, before the first session. */
export const EACH_WEEK_OPENS = "Each week opens straight after your previous session.";

/**
 * When a week that is not open yet opens: "Opens tonight, after your
 * session", or on another day "Opens Tue 24 Nov, after your session".
 */
export function opensWords(after: { dateKey: string; startTimeLocal: string }, todayKey: string): string {
  if (after.dateKey === todayKey) return `Opens ${tonightWord(after.startTimeLocal).toLowerCase()}, after your session`;
  return `Opens ${dayWords(after.dateKey)}, after your session`;
}

/** The week page's way on: "Week 4 opens tonight, after your session". */
export function nextWeekOpensWords(weekNumber: number, after: { dateKey: string; startTimeLocal: string }, todayKey: string): string {
  if (after.dateKey === todayKey) {
    return `Week ${weekNumber} opens ${tonightWord(after.startTimeLocal).toLowerCase()}, after your session`;
  }
  return `Week ${weekNumber} opens on ${dayWords(after.dateKey)}, after your session`;
}

/** The week page of a week that is not open to the reader yet. */
export function notOpenTitle(weekNumber: number): string {
  return `Week ${weekNumber} isn’t open yet`;
}

/** Under it: when it opens. */
export function notOpenBody(after: { dateKey: string; startTimeLocal: string }, todayKey: string): string {
  if (after.dateKey === todayKey) return `It opens ${tonightWord(after.startTimeLocal).toLowerCase()}, after your session.`;
  return `It opens on ${dayWords(after.dateKey)}, after your session.`;
}

/** The way back from it. */
export function backToWords(name: string): string {
  return `Back to ${name}`;
}

// ---------------------------------------------------------------------------
// The weeks
// ---------------------------------------------------------------------------

/** "The 6 weeks". */
export function weeksHeading(totalWeeks: number): string {
  return totalWeeks === 1 ? "The week" : `The ${totalWeeks} weeks`;
}

/** What each week's mark says to a screen reader, and the board's image names. */
export const WEEK_STATE_WORDS = {
  done: "Done",
  current: "This week",
  next: "Next",
  shut: "Not open yet",
  cancelled: "Cancelled",
} as const;

/** "Tonight", "Today", or the session's date, for the week a session is next in. */
export function sessionDayWords(dateKey: string, startTimeLocal: string, todayKey: string): string {
  return dateKey === todayKey ? tonightWord(startTimeLocal) : dayWords(dateKey);
}

/** "3 of 3": what is done of a week's reading, beside it. */
export function ofWords(done: number, of: number): string {
  return `${done} of ${of}`;
}

// ---------------------------------------------------------------------------
// Your marks (C26): one per session, a legend, and no count
// ---------------------------------------------------------------------------

export const YOUR_MARKS = "Your marks";
export const MARKS_LINE = "Your facilitators fill these in after each session.";
export const MARKS_LEGEND_LABEL = "What the marks mean";

/** A mark's letter, as the register and the lead's tabs draw it. */
export const MARK_LETTER = {
  present: "P",
  late: "L",
  "left-early": "LE",
  excused: "E",
  absent: "A",
} as const;

/** What a session that is not one of those five says. */
export const MARK_STATE_WORDS = {
  "not-yet": "Not yet",
  "not-marked": "Not marked",
  cancelled: "Cancelled",
  "did-not-happen": "Didn’t happen",
} as const;

/** "Week 1, Tue 3 Nov: Present": one session's mark, said whole. */
export function markWords(weekNumber: number, dateKey: string, word: string): string {
  const day = dayWords(dateKey);
  return day ? `Week ${weekNumber}, ${day}: ${word}` : `Week ${weekNumber}: ${word}`;
}

/** The mark that has not been given yet. A dot, as the register draws it: never a dash. */
export const NOT_YET_MARK = "·";

// ---------------------------------------------------------------------------
// Your group
// ---------------------------------------------------------------------------

export const YOUR_GROUP = "Your group";
export const YOU = "(you)";
export const NAMES_ONLY = "Names only. Nobody here sees your email address.";

/** "Facilitators:" before their first names, "Facilitator:" for one. */
export function facilitatorsLabel(count: number): string {
  return count === 1 ? "Facilitator:" : "Facilitators:";
}

// ---------------------------------------------------------------------------
// The week page
// ---------------------------------------------------------------------------

export const EXERCISE = "Exercise";
export const REVIEWED_CHIP = "A facilitator reviews it";
export const DUE_BEFORE = "Due before your session";
export const START_EXERCISE = "Start the exercise";

/** The card of a week's questions (C29). A week with none draws no card. */
export const QUESTIONS_TO_THINK_ABOUT = "Questions to think about";

/** "01", "02": a question's place, as the board numbers them. */
export function questionNumber(n: number): string {
  return String(n).padStart(2, "0");
}

/** "Rahul or Sofia will read it and reply.", from the group's facilitators' first names. */
export function readerLine(firstNames: readonly string[]): string {
  if (firstNames.length === 0) return "Your facilitators will read it and reply.";
  if (firstNames.length === 1) return `${firstNames[0]} will read it and reply.`;
  return `${firstNames.slice(0, -1).join(", ")} or ${firstNames[firstNames.length - 1]} will read it and reply.`;
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

/** Over Home's greeting: "AGI Strategy · week 1 of 6". Upper case by the stylesheet. */
export function homeEyebrow(name: string, part: string): string {
  return [name.trim(), part.trim()].filter(Boolean).join(" · ");
}
