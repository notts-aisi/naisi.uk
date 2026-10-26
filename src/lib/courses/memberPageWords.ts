import { clockWords, coversWords, dayWords, namesWords, weeksWords } from "./sessionChange/words";

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
 * week 1", and on Home on the day "Tonight · your first session" or, the
 * group's last session, "Tonight · your last session" (wk-lastweek-phone). A
 * session that is neither the first, the last nor today is "Your next session
 * · week 4"; the last before its day is "Your last session · week 6".
 *
 * A SESSION THAT COVERS AN EARLIER, CANCELLED WEEK TOO names its own day and
 * both weeks, "Tue 1 Dec · weeks 4 and 5" (wk-changes), once the caller hands
 * its `dateKey`: the heading under it then says only the hours
 * (`eyebrowNamesTheDay`). On its own day it is "Tonight · weeks 4 and 5".
 *
 * AN ONLINE WEEK ends "· online": "Tonight · week 6 · online" (wk-changes).
 */
export function sessionEyebrow(input: {
  isToday: boolean;
  isFirst: boolean;
  /** The group's last session, by its own calendar (the last week, wk-lastweek-phone). */
  isLast?: boolean;
  startTimeLocal: string;
  /** The weeks the session covers: its own, and a cancelled one before it ("weeks 4 and 5"). */
  weekNumbers: readonly number[];
  /** The session's day, "YYYY-MM-DD": named in the eyebrow of a session covering two weeks. */
  dateKey?: string;
  /** The session is held online that week. */
  online?: boolean;
  /** Home's card says "your first session" and "your last session" on the day; the programme home says the week. */
  home?: boolean;
}): string {
  const weeks = weeksWords(input.weekNumbers);
  const online = input.online ? " · online" : "";
  if (input.isToday) {
    const when = tonightWord(input.startTimeLocal);
    if (input.isFirst && input.home) return `${when} · your first session${online}`;
    if (input.isLast && input.home) return `${when} · your last session${online}`;
    return `${when} · ${weeks}${online}`;
  }
  if (eyebrowNamesTheDay(input)) return `${coversWords(input.dateKey ?? "", input.weekNumbers)}${online}`;
  if (input.isFirst) return `Your first session · ${weeks}${online}`;
  if (input.isLast) return `Your last session · ${weeks}${online}`;
  return `Your next session · ${weeks}${online}`;
}

/**
 * Whether the ticket's eyebrow names the session's own day: a session that
 * covers a cancelled week too, on any day but its own ("Tue 1 Dec · weeks 4
 * and 5", wk-changes). The heading under such an eyebrow says only the hours,
 * "6pm to 8pm", so the day is never said twice.
 */
export function eyebrowNamesTheDay(input: { isToday: boolean; weekNumbers: readonly number[]; dateKey?: string }): boolean {
  return !input.isToday && input.weekNumbers.length > 1 && dayWords(input.dateKey ?? "") !== "";
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

// ---------------------------------------------------------------------------
// A week written as blocks (boards st-week1-phone, wk-week-phone, wk-week)
// ---------------------------------------------------------------------------

/**
 * Over the week's title: "Fellowship: AGI Strategy · Week 3 of 6 · Thu 12 to
 * Wed 18 Nov", upper case by the stylesheet. The programme's kind and name
 * come from the form that names the run; the dates are the week's seven days
 * in the reader's own calendar, and are left out while it has none.
 */
export function blockWeekEyebrow(input: {
  kind: "fellowship" | "incubator" | null;
  name: string;
  weekNumber: number;
  totalWeeks: number;
  range: string;
}): string {
  const kindWord = input.kind === "fellowship" ? "Fellowship" : input.kind === "incubator" ? "Incubator" : "";
  const name = input.name.trim();
  const programme = kindWord && name ? `${kindWord}: ${name}` : name;
  return [programme, weekOfWords(input.weekNumber, input.totalWeeks), input.range.trim()].filter(Boolean).join(" · ");
}

/** The way on, beside the way back, while the next week is shut: the board's words. */
export function weekOpensAfterWords(weekNumber: number): string {
  return `Week ${weekNumber} opens after your session`;
}

/** "In all: About 80 minutes". */
export function inAllWords(total: string): string {
  return `In all: ${total.trim()}`;
}

/** A task that is done. */
export const TASK_DONE = "Done";

/**
 * What the task mark says to a screen reader. `optional` is a row that is
 * offered, not set (the hands-on route); the boards draw none, so it is
 * listed for the boards' designers to confirm.
 */
export const TASK_MARK_WORDS = {
  done: "Done",
  notDone: "Not done yet",
  none: "Nothing to do this week",
  optional: "Optional, not counted",
} as const;

/**
 * The guide's own words after its rule, kept as written: "Before session 1,
 * if you can" says "if you can". The words after the first comma, or "" when
 * there are none. The rule itself is the page's to say, in the reader's own
 * dates.
 */
export function whenQualifierOf(whenText: string): string {
  const at = whenText.indexOf(",");
  return at < 0 ? "" : whenText.slice(at + 1).trim();
}

/** "noon", "5pm", "9:30am": the course's day-before time as the page says it. "" for anything else. */
function dueClockWords(hhmm: string | null | undefined): string {
  if (!hhmm) return "";
  return hhmm === "12:00" ? "noon" : clockWords(hhmm);
}

/**
 * When a This week task is due, for the reader's group (`due.ts` gives the
 * day): "Before your session, Tue 17 Nov", "By the end of today, Mon 16 Nov",
 * "At your session, Tue 17 Nov". Before a group has a day to give, the rule
 * alone: "Before your first session" (the board's "Due dates wait for the
 * group"). `first` is the reader's first session.
 *
 * "The day before" is read by the course's setting (`dayBeforeTime`,
 * `CourseDoc.dayBeforeDueTime`): by the end of that day when it has none, or
 * by its time ("By noon today, Mon 16 Nov", "By noon on Mon 9 Nov", "By noon
 * the day before your session"). The guide's own words after its rule
 * (`whenText`'s "if you can") follow the page's: "Before your first session,
 * if you can". The words for a time and for the guide's own words are not
 * drawn on the boards; they are listed for the boards' designers to confirm.
 */
export function taskWhenWords(
  when: "before" | "dayBefore" | "atSession",
  due: { dateKey: string } | null,
  options: { first: boolean; todayKey: string; dayBeforeTime?: string | null; whenText?: string },
): string {
  const session = options.first ? "your first session" : "your session";
  const day = due ? dayWords(due.dateKey) : "";
  const qualifier = whenQualifierOf(options.whenText ?? "");
  const withQualifier = (words: string) => (qualifier ? `${words}, ${qualifier}` : words);
  if (when === "dayBefore") {
    const clock = dueClockWords(options.dayBeforeTime);
    const today = Boolean(due && due.dateKey === options.todayKey);
    if (clock) {
      if (!day) return withQualifier(`By ${clock} the day before ${session}`);
      return withQualifier(today ? `By ${clock} today, ${day}` : `By ${clock} on ${day}`);
    }
    if (!day) return withQualifier(`By the end of the day before ${session}`);
    return withQualifier(today ? `By the end of today, ${day}` : `By the end of ${day}`);
  }
  // A task the guide says to bring along ("Bring it to session 6", week 6's
  // action plan) keeps its own verb: "Bring it to your session, Tue 8 Dec"
  // (wk-week6-phone). It is due before the session all the same.
  const bring = when === "before" && /^bring it to\b/i.test((options.whenText ?? "").trim());
  const lead = when === "atSession" ? `At ${session}` : bring ? `Bring it to ${session}` : `Before ${session}`;
  return withQualifier(day ? `${lead}, ${day}` : lead);
}

/** "Part 1": a part's place among the week's parts, before its time. */
export function partWords(n: number): string {
  return `Part ${n}`;
}

/** The programme page's short line for a task (board wk-programme). */
export function taskLabelWords(
  subject: { kind: "writtenAnswer" } | { kind: "talk" } | { kind: "parts"; numbers: number[] } | { kind: "other" },
  what: string,
): string {
  if (subject.kind === "writtenAnswer") return "Your written answer";
  if (subject.kind === "talk") return "Your case talk";
  if (subject.kind === "parts") return partsWords(subject.numbers);
  return what.trim();
}

/** "Part 4", "Parts 1 to 3", "Parts 1 and 3", "Parts 1, 3 and 5". */
export function partsWords(numbers: readonly number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return `Part ${sorted[0]}`;
  const runs = sorted.every((n, index) => index === 0 || n === sorted[index - 1] + 1);
  if (runs && sorted.length > 2) return `Parts ${sorted[0]} to ${sorted[sorted.length - 1]}`;
  return `Parts ${namesWords(sorted.map(String))}`;
}

/** The label over a stop's boxes. */
export const REFLECT = "Reflect";

/** In an empty reflection box. */
export const REFLECTION_PLACEHOLDER = "A sentence or two";

/** Under a box whose words are stored. */
export const SAVED = "Saved";

/**
 * Who reads a reflection (Q30), under the page's first stop, with names
 * from records: "Rahul, Sofia, Claudia and admins can read your reflections.
 * Other fellows can’t." Before the group is known, "Your facilitators, ...".
 */
export function reflectionsReadByWords(facilitatorFirstNames: readonly string[], leadFirstName: string | null): string {
  return `${readersWords(facilitatorFirstNames, leadFirstName)} can read your reflections. Other fellows can’t.`;
}

/** That a line may be read out (Q37): "Rahul or Sofia may read a line out in the session, without your name." */
export function readOutWords(facilitatorFirstNames: readonly string[]): string {
  const who =
    facilitatorFirstNames.length === 0
      ? "Your facilitators"
      : facilitatorFirstNames.length === 1
        ? facilitatorFirstNames[0]
        : `${facilitatorFirstNames.slice(0, -1).join(", ")} or ${facilitatorFirstNames[facilitatorFirstNames.length - 1]}`;
  return `${who} may read a line out in the session, without your name.`;
}

/**
 * Who sees the ticks (Q31), under the page's first sources: "Rahul, Sofia,
 * Claudia and admins can see which sources you tick." The boards do not
 * draw this line; it is listed for the boards' designers to confirm.
 */
export function ticksSeenByWords(facilitatorFirstNames: readonly string[], leadFirstName: string | null): string {
  return `${readersWords(facilitatorFirstNames, leadFirstName)} can see which sources you tick.`;
}

/**
 * A FACILITATOR TAKING PART (Zach, Mon 26 Oct: a group's facilitators are
 * participants too): their own reflections are read by the programme's lead
 * and admins, never by their co-facilitators or the group, so the line under
 * their boxes names only those. No read-out line: nobody running the session
 * reads them. The boards draw none of these; listed for the boards'
 * designers to confirm.
 */
export function facilitatorReflectionsReadByWords(leadFirstName: string | null): string {
  const lead = leadFirstName?.trim();
  return lead ? `Only ${lead} and admins can read your reflections.` : "Only admins can read your reflections.";
}

/** Who sees a facilitator's own ticks: the lead and admins, as for their reflections. */
export function facilitatorTicksSeenByWords(leadFirstName: string | null): string {
  const lead = leadFirstName?.trim();
  return lead ? `Only ${lead} and admins can see which sources you tick.` : "Only admins can see which sources you tick.";
}

/** A facilitator's own private note on a reading: nobody in the group reads it. */
export const PRIVATE_NOTE_HINT_FACILITATOR = "Only admins see this. It’s never read out.";

/** "Rahul, Sofia, Claudia and admins", or "Your facilitators, Claudia and admins". Start here's line says it too. */
export function readersWords(facilitatorFirstNames: readonly string[], leadFirstName: string | null): string {
  const people =
    facilitatorFirstNames.length > 0 ? [...facilitatorFirstNames] : ["Your facilitators"];
  if (leadFirstName && leadFirstName.trim() && !people.includes(leadFirstName.trim())) people.push(leadFirstName.trim());
  return `${people.join(", ")} and admins`;
}

/** Under Before the session, where a week has boxes to write in: the site's own line. */
export const BOXES_SAVE_LINE = "Write your answers in the boxes below. They save as you type.";

/** When the reader's own answers could not be read, in place of the boxes. */
export const REFLECTIONS_UNAVAILABLE = "We couldn’t load your reflections. Reload before writing, so you don’t write over them.";

/** When a box's last change has not been stored. */
export const REFLECTION_NOT_SAVED = "Your last change isn’t saved yet. Check your connection: it saves again as you type.";

/** The reading's button (Q38): the rating and the private note, renamed so "reflection" means the set questions only. */
export const RATE_OR_NOTE = "Rate it or leave a note";
/** Over the stars. */
export const HOW_USEFUL = "How useful was this?";
/** The private note's label and who reads it (Q38: the group's facilitators and admins; Q37: never read out). */
export const PRIVATE_NOTE = "Private note";
export const PRIVATE_NOTE_HINT = "Only your facilitators and admins see this. It’s never read out.";

/** Under Go further's heading. */
export const NOT_COUNTED = "Not counted in your time or progress.";

/** "8 items", beside Go further while it is closed. */
export function itemsWords(n: number): string {
  return n === 1 ? "1 item" : `${n} items`;
}

/** The laptop page's list of where things are (board wk-week). */
export const ON_THIS_PAGE = "On this page";

/** "Go further", as the list of where things are names it. */
export const GO_FURTHER_SHORT = "Go further";

/**
 * The hands-on route (optional, for people who code), as the list of where
 * things are names it. Its own heading is the guide's. The boards draw
 * neither; listed for the boards' designers to confirm.
 */
export const HANDS_ON_SHORT = "Hands-on route";

/** The notes the group shares, as the list of where things are names them. */
export const SHARED_NOTES_SHORT = "Notes shared with your group";

// ---------------------------------------------------------------------------
// The last week (wk-lastweek-phone), and what's next (with en-after-phone
// and en-after-nofinish-phone)
// ---------------------------------------------------------------------------

/**
 * Over the certificate line in the last week: "After tonight" on the last
 * session's own day ("After today" before 5pm, the notice's rule), and
 * "After your last session" on the days around it.
 */
export function afterLastSessionHeading(when: "tonight" | "today" | "around"): string {
  if (when === "tonight") return "After tonight";
  if (when === "today") return "After today";
  return "After your last session";
}

/**
 * What happens after the last session (wk-lastweek-phone). The board's line
 * ends "by Mon 14 Dec": no record holds the day certificates go out, so the
 * day is left out until one does.
 */
export const CERTIFICATE_LINE = "Everyone who finishes gets a certificate.";

export const WHATS_NEXT = "What’s next";
export const FIND_OUT_MORE = "Find out more";

/** Said only while the form taking applications asks people whether they would facilitate. */
export const FACILITATE_NEXT_TERM = "Facilitate a group next term: say so when you apply.";

/** "January": the month a date key falls in, in London. "" for anything that is not a date key. */
function monthWords(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  // Noon UTC is the same calendar day in London whatever the season.
  const at = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "Europe/London" }).format(at);
}

/**
 * A form taking applications: "Applications for Spring 2027 close on Sun 13
 * Dec.", its term's name as the form says it; "... are open." for a form with
 * no closing time.
 */
export function applicationsCloseWords(label: string, closesOn: string | null): string {
  const term = label.trim() || "next term";
  const day = closesOn ? dayWords(closesOn) : "";
  return day ? `Applications for ${term} close on ${day}.` : `Applications for ${term} are open.`;
}

/** A form that opens later: "Applications for next term open in January." */
export function applicationsOpenWords(opensOn: string): string {
  const month = monthWords(opensOn);
  return month ? `Applications for next term open in ${month}.` : "";
}

// ---------------------------------------------------------------------------
// After the end (en-after-phone, en-after-nofinish-phone)
// ---------------------------------------------------------------------------

/**
 * The parts of the line under the head once the programme is over, each kept
 * whole on a line: "Autumn 2026 · Group B · with Rahul and Sofia" for
 * somebody who finished; for everybody else the term and the group, after
 * the thanks, with a full stop ("Autumn 2026 · Group D."), as the boards
 * write them. What is not known is left out.
 */
export function afterLineParts(parts: { term: string; group: string; with: string }): string[] {
  return [parts.term, parts.group, parts.with].map((part) => part.trim()).filter(Boolean);
}

export const WHAT_YOU_KEEP = "What you keep";

/** "Your action plan": week 6's fill-in boxes, on the week page that holds them. */
export const KEEP_ACTION_PLAN = "Your action plan";

/** "The reading list for all 6 weeks". */
export function readingListKeepWords(totalWeeks: number): string {
  return totalWeeks === 1 ? "The reading list for the week" : `The reading list for all ${totalWeeks} weeks`;
}

/** Under a kept thing: "Week 6", "Weeks 2 to 5", "Weeks 1, 3, 4, 5 and 6". */
export function keepWeeksWords(weekNumbers: readonly number[]): string {
  const sorted = [...new Set(weekNumbers)].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return `Week ${sorted[0]}`;
  const runs = sorted.every((n, index) => index === 0 || n === sorted[index - 1] + 1);
  if (runs && sorted.length > 2) return `Weeks ${sorted[0]} to ${sorted[sorted.length - 1]}`;
  return `Weeks ${namesWords(sorted.map(String))}`;
}
