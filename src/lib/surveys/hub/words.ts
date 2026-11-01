import { LIST_WORDS, STAGE_WORDS, answeredOf, dayWords, questionsWords } from "../words";
import type { SurveyTemplate } from "../templates";

/**
 * WHAT RUN NAISI › SURVEYS SAYS, now that it is organised by what each survey
 * is for: its two tabs, each programme's rows and each event's. Every value
 * comes from a record and arrives here as an argument; the survey's own words
 * (its state, Remind, Results, Edit) stay in `LIST_WORDS`.
 *
 * Pure, with no import but the survey words and a type, so the page, its view
 * and the tests word it alike. Dates are read in London.
 */

export const HUB_WORDS = {
  /** What a screen reader calls the two tabs together. */
  tabs: "Surveys by what they’re for",
  byProgramme: "By programme",
  events: "Events",
  /** One programme's check-ins at the end of its sessions, drawn as one row. */
  checkIns: "Weekly check-ins",
  /** One programme's session reports, drawn as one row that leads to their own page. */
  reports: "Facilitators’ reports",
  /** The chip on the two rows that come round at every session. */
  everySession: "Every session",
  /** A survey's chip before its first send. */
  draft: "Draft",
  /** A survey about leaving that has not been opened: nobody sends it. */
  notOpen: "Not open yet",
  /** The survey about leaving reaches each person as they leave. */
  whenSomeoneLeaves: "When someone leaves",
  /** A programme of the term with no check-in yet. */
  noneYet: "None yet",
  /** The check-ins' row opens its list in place. */
  seeThem: "See them",
  /** The reports' row leads to their own page. */
  readThem: "Read them",
  /** The Events tab's card. */
  eventsTitle: "Surveys after events",
  noEvents: "No survey after an event yet. Make one from New survey.",
} as const;

/** "Before the programme", "At the end of the programme", "Leaving a programme": a stage's row, by the New survey page's name for it. */
export function stageRowWords(stage: SurveyTemplate): string {
  return STAGE_WORDS[stage].card;
}

/** One line of a row: its parts with a middle dot between, leaving out the empty ones. */
export function rowLineWords(parts: readonly string[]): string {
  return parts.filter(Boolean).join(" · ");
}

/** "Sent Wed 28 Oct". */
export function sentOnWords(at: Date): string {
  return `Sent ${dayWords(at)}`;
}

/** "41 of 54 answered". */
export function answeredLineWords(answered: number, of: number): string {
  return `${answeredOf(answered, of)} answered`;
}

/** "2 answers": a survey after an event's answers, never "of" anybody (its QR code takes answers from people it was never emailed to). */
export function eventAnswersWords(answered: number): string {
  return `${answered} ${answered === 1 ? "answer" : "answers"}`;
}

/** "Week 3", "Weeks 1 to 3", or "" with none: the weeks a programme's check-ins were at. */
export function weeksWords(weeks: readonly number[]): string {
  if (weeks.length === 0) return "";
  const first = Math.min(...weeks);
  const last = Math.max(...weeks);
  return first === last ? `Week ${first}` : `Weeks ${first} to ${last}`;
}

/**
 * "due at the last session, Wed 9 Dec": beside "Not sent yet" on the survey
 * at the end. Programme surveys are sent by hand, so this says when it is due
 * and never that anything is scheduled.
 */
export function dueAtLastSessionWords(day: string): string {
  return `due at the last session, ${day}`;
}

/** "8 questions, from each group’s facilitators": a session report, counted by its own record's questions. */
export function reportQuestionsWords(questions: number): string {
  return `${questionsWords(questions)}, from each group’s facilitators`;
}

/**
 * What each link on a row says to a screen reader: its own words first, as
 * drawn, then the survey or the programme it is about.
 */
export const HUB_LABELS = {
  results: (name: string) => `${LIST_WORDS.results} for ${name}`,
  edit: (name: string) => `${LIST_WORDS.edit} ${name}`,
  remind: (name: string) => `Remind people who haven’t answered ${name}: opens its Send tab`,
  reports: (programme: string) => `${HUB_WORDS.readThem}: the facilitators’ reports on ${programme}`,
} as const;
