import { londonClockLabel, londonDayLabel } from "../londonLabels";
import { namesAnd } from "../writtenAnswerWords";
import { notDoneWords, yourWords } from "../weekWork/words";
import type { ReminderDays, WeekAsk, WeekLeft } from "./model";

/**
 * EVERY WORD OF THE WEEK'S THREE EMAILS: "Week N is open", 6 days before a
 * group's session, and the reminders 3 days and 1 day before it to the
 * people whose week is not done. Fixed words, in one file, so the emails, the
 * register's page and the tests say one thing.
 *
 * All three are notices (`docs/notifications.md`): the line above the words
 * saying why the email reached them is the notice lane's own
 * (`src/emails/NoticeMarker.tsx`), and none carries an unsubscribe link.
 *
 * Never "mark", "grade" or "score"; no pronoun for a person; days as "Wed 18
 * Nov" and times in the house clock ("3pm"), in London.
 */

const capitalise = (words: string) => (words ? words[0].toUpperCase() + words.slice(1) : words);

/**
 * A value somebody typed (a week's title, a course's, a room), on one line:
 * a line break in a week's title must never reach a Subject header, and a
 * run of spaces never a sentence.
 */
function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** A sentence ending once: "?" or "!" or "." already there is kept, never doubled. */
function sentence(text: string): string {
  return /[.?!]$/.test(text) ? text : `${text}.`;
}

/** "Wed 18 Nov at 3pm in Portland A21", "Wed 18 Nov at 3pm, online", "Wed 18 Nov at 3pm". */
export function sessionAtWords(at: Date, where: string): string {
  const when = `${londonDayLabel(at)} at ${londonClockLabel(at)}`;
  const place = oneLine(where);
  if (!place) return when;
  return place.toLowerCase() === "online" ? `${when}, online` : `${when} in ${place}`;
}

/** "Hi Priya,", or nothing when the account gives no name. */
export function greetingWords(firstName: string): string {
  const name = oneLine(firstName);
  return name ? `Hi ${name},` : "";
}

/** "week 3" or "weeks 3 and 4", as a sentence goes on. */
function weeksWords(weekNumbers: readonly number[]): string {
  return weekNumbers.length === 1 ? `week ${weekNumbers[0]}` : `weeks ${namesAnd(weekNumbers.map(String))}`;
}

// ---------------------------------------------------------------------------
// "Week N is open"
// ---------------------------------------------------------------------------

/** One line of what a week asks for: "3 readings", "A short reflection", "A written answer". */
export function weekAskWords(ask: WeekAsk): string {
  switch (ask.kind) {
    case "readings":
      return ask.count === 1 ? "A reading" : `${ask.count} readings`;
    case "steps":
      return ask.count === 1 ? "A step to tick" : `${ask.count} steps to tick`;
    case "pack":
      return `Your ${ask.name}’s reading`;
    case "reflections":
      return ask.count === 1 ? "A short reflection" : `${ask.count} short reflections`;
    case "boxes":
      return capitalise(yourWords(oneLine(ask.title)));
    case "answers":
      return ask.count === 1 ? "A written answer" : `${ask.count} written answers`;
    case "talks":
      return ask.count === 1 ? "Getting ready for your talk" : `Getting ready for ${ask.count} talks`;
    case "materials":
      return ask.count === 1 ? "Something to read or watch" : `${ask.count} things to read or watch`;
    case "exercises":
      return ask.count === 1 ? "An exercise to write up" : `${ask.count} exercises to write up`;
  }
}

/** What "Week N is open" is made from, every value read from records. */
export type WeekOpenFacts = {
  courseTitle: string;
  weekNumber: number;
  /** The week's title, "" when it has none. */
  weekTitle: string;
  /** When the session the email is about starts; null when the group's time isn't set. */
  sessionAt: Date | null;
  /** "Portland A21", "Online", or "" for none (or a room that holds a link). */
  where: string;
  /** The group's first session: "Your first session", and no ask about the last one. */
  first: boolean;
  /** The session is cancelled: `change` says so, in place of when and where the group meets. */
  cancelled: boolean;
  /** What changed about the session, as its own paragraph (`nextWeekChangeLine`), or "". */
  change: string;
  asks: WeekAsk[];
  /** The week's page. */
  weekUrl: string;
  /** The weekly feedback form, "" for none. Never asked for before the first session. */
  feedbackUrl: string;
  /** Whether the week's work locks at the session: a week written as blocks. */
  locks: boolean;
};

/** "Week 3 is open: Power and incentives", or "Week 3 is open" for a week with no title. */
export function weekOpenSubject(facts: Pick<WeekOpenFacts, "weekNumber" | "weekTitle">): string {
  const title = oneLine(facts.weekTitle);
  return title ? `Week ${facts.weekNumber} is open: ${title}` : `Week ${facts.weekNumber} is open`;
}

export type WeekEmailWords = {
  subject: string;
  /** The inbox's preview line: the first paragraph. */
  preheader: string;
  greeting: string;
  paragraphs: string[];
  /** What the week asks for, or what is left of it, one line each; a week's lead line above each list. */
  lists: Array<{ lead: string; items: string[] }>;
  button: string;
  link: string;
  /** The lines under the button. */
  after: string[];
  /** The weekly feedback form, as a sentence with its link, or null. */
  feedback: { words: string; url: string } | null;
};

/** The paragraph that opens "Week N is open", with the session's day, time and room. */
function weekOpenLead(facts: WeekOpenFacts): string {
  const title = oneLine(facts.weekTitle);
  const course = oneLine(facts.courseTitle);
  const open = sentence(
    course
      ? `Week ${facts.weekNumber} of ${course} is open${title ? `: ${title}` : ""}`
      : `Week ${facts.weekNumber} is open${title ? `: ${title}` : ""}`,
  );
  if (facts.cancelled || !facts.sessionAt) return open;
  return `${open} Your ${facts.first ? "first" : "next"} session is ${sentence(sessionAtWords(facts.sessionAt, facts.where))}`;
}

/**
 * EVERY WORD OF "WEEK N IS OPEN" for one person: the subject, a greeting by
 * the first name they go by, the week and when the group meets (or, for a
 * cancelled evening, that it is off, why and when they meet next), what the
 * week asks for, a button to its page, and that the work saves as you go
 * and locks when the session starts.
 */
export function weekOpenEmailWords(facts: WeekOpenFacts, firstName: string): WeekEmailWords {
  const lead = weekOpenLead(facts);
  const paragraphs = [lead];
  if (oneLine(facts.change)) paragraphs.push(oneLine(facts.change));
  const after: string[] = [];
  if (facts.locks) {
    after.push(
      facts.cancelled
        ? "Your work saves as you go and locks when your next session starts."
        : "Your work saves as you go and locks when your session starts.",
    );
  }
  const feedbackUrl = facts.first ? "" : oneLine(facts.feedbackUrl);
  return {
    subject: weekOpenSubject(facts),
    preheader: lead,
    greeting: greetingWords(firstName),
    paragraphs,
    lists: facts.asks.length > 0 ? [{ lead: "", items: facts.asks.map(weekAskWords) }] : [],
    button: `Open week ${facts.weekNumber}`,
    link: facts.weekUrl,
    after,
    feedback: feedbackUrl ? { words: "Tell us how the last session went", url: feedbackUrl } : null,
  };
}

/**
 * The values "Week N is open" goes WITHOUT on the register's push and is
 * HELD for on its schedule (`src/lib/courses/nextWeekEmail.ts`): a fact the
 * group needs, read from a record somebody can fill in.
 */
export type WeekOpenValue = "sessionWhen" | "sessionWhere" | "weekTitle" | "weekAsks";

/**
 * The facts "Week N is open" carries that are empty, of the ones a whole
 * email needs. A cancelled session's email says it is off instead of when and
 * where the group meets, so it goes without those two.
 */
export function missingWeekOpenValues(facts: WeekOpenFacts): WeekOpenValue[] {
  const missing: WeekOpenValue[] = [];
  if (!facts.cancelled && !facts.sessionAt) missing.push("sessionWhen");
  if (!facts.cancelled && !oneLine(facts.where)) missing.push("sessionWhere");
  if (!oneLine(facts.weekTitle)) missing.push("weekTitle");
  if (facts.asks.length === 0) missing.push("weekAsks");
  return missing;
}

/** What an empty value means to the person who has to fill it in, finishing "missing: ...". */
export function missingWeekOpenWords(keys: readonly WeekOpenValue[], weekNumber: number): string[] {
  const words: Record<WeekOpenValue, string> = {
    sessionWhen: "the group’s day and time",
    sessionWhere: "the group’s room",
    weekTitle: `week ${weekNumber}’s title`,
    weekAsks: `what week ${weekNumber} asks for`,
  };
  return keys.map((key) => words[key]);
}

// ---------------------------------------------------------------------------
// The reminders
// ---------------------------------------------------------------------------

/** One week of a reminder: its number, what is left of it, and whether it asks for anything written. */
export type ReminderWeek = { weekNumber: number; left: WeekLeft; writes: boolean };

/** What a reminder is made from. `weeks` holds only the weeks that are not done, in order. */
export type WeekReminderFacts = {
  courseTitle: string;
  daysBefore: ReminderDays;
  sessionAt: Date;
  where: string;
  weeks: ReminderWeek[];
  /** The page of the first week listed. */
  weekUrl: string;
};

/** "Week 3: your session is tomorrow", "Week 3: your session is on Wed 18 Nov". */
export function weekReminderSubject(facts: Pick<WeekReminderFacts, "daysBefore" | "sessionAt" | "weeks">): string {
  const weeks = capitalise(weeksWords(facts.weeks.map((week) => week.weekNumber)));
  return facts.daysBefore === 1
    ? `${weeks}: your session is tomorrow`
    : `${weeks}: your session is on ${londonDayLabel(facts.sessionAt)}`;
}

/** "Week 3 isn’t submitted.": the line a reminder adds to the check's for a week not submitted. */
export function notSubmittedWords(weekNumber: number): string {
  return `Week ${weekNumber} isn’t submitted.`;
}

/** What is left of one week, one line each: the check's lines, then that it is not submitted. */
export function weekLeftWords(weekNumber: number, left: WeekLeft): string[] {
  const lines = left.items.map(notDoneWords);
  if (left.notSubmitted) lines.push(notSubmittedWords(weekNumber));
  return lines;
}

/**
 * The line under the button: what stops these reminders, and when the work
 * locks. Two weeks where only one has something to write are each finished
 * their own way, which the lists above spell out, so that line says "each".
 */
function reminderAfterWords(weeks: readonly ReminderWeek[]): string {
  const locks = "Your work locks when the session starts.";
  const writing = weeks.filter((week) => week.writes).length;
  if (weeks.length === 1) {
    return writing === 1
      ? `Submitting it, with every reading ticked, stops these reminders. ${locks}`
      : `Ticking everything it asks for stops these reminders. ${locks}`;
  }
  if (writing === weeks.length) return `Submitting each week, with every reading ticked, stops these reminders. ${locks}`;
  if (writing === 0) return `Ticking everything they ask for stops these reminders. ${locks}`;
  return `Finishing each week stops these reminders. ${locks}`;
}

/**
 * EVERY WORD OF A REMINDER for one person: the subject, a greeting, when the
 * session is, then for each week not done "Week 3 isn’t finished yet:" and
 * what is left of it, a button to the first of those weeks, and what stops
 * the reminders. Why it reached them is the notice line above the words.
 */
export function weekReminderEmailWords(facts: WeekReminderFacts, firstName: string): WeekEmailWords {
  const course = oneLine(facts.courseTitle);
  const session = course ? `Your ${course} session` : "Your session";
  const when = sessionAtWords(facts.sessionAt, facts.where);
  const lead = sentence(facts.daysBefore === 1 ? `${session} is tomorrow, ${when}` : `${session} is on ${when}`);
  const first = facts.weeks[0]?.weekNumber ?? 0;
  return {
    subject: weekReminderSubject(facts),
    preheader: lead,
    greeting: greetingWords(firstName),
    paragraphs: [lead],
    lists: facts.weeks.map((week) => ({
      lead: `Week ${week.weekNumber} isn’t finished yet:`,
      items: weekLeftWords(week.weekNumber, week.left),
    })),
    button: `Finish week ${first}`,
    link: facts.weekUrl,
    after: [reminderAfterWords(facts.weeks)],
    feedback: null,
  };
}
