/**
 * The words of Claude's best answers and of Pangram on coursework (privacy
 * v13), the screens' and the routes' alike. Plain, British, no dashes.
 * Pure: safe anywhere.
 */
import { COURSEWORK_USE_FROM_VERSION } from "@/lib/legal/courseworkUse";

const V = COURSEWORK_USE_FROM_VERSION;

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many.replace("{n}", String(count)));

/** What each kind of answer is called on these screens. */
export const KIND_LABEL = {
  reflection: "Reflection",
  written: "Written answer",
  fillIn: "Box to fill in",
} as const;

export const COURSEWORK_DOOR_WORDS = {
  notHere: "There’s no programme here.",
  notYours: "The coursework is the programme’s lead’s and an admin’s.",
  noRun: "This programme isn’t on a course run yet, so there’s no coursework.",
  noWeek: "That week isn’t one of this run’s weeks with coursework.",
  badWeek: "Say which week: its id, like w03.",
  notOnRun: "They don’t hold a place on this programme or facilitate on its run.",
} as const;

export const BEST_WORDS = {
  title: "Best answers",
  button: "Find the best answers",
  again: "Find them again",
  asking: "Claude is reading…",
  intro: "Claude picks up to three of the strongest answers to each question this week, with a reason, from every answer it may be sent. Names aren’t sent; the site puts them back.",
  whoSees: "Admins and the programme’s lead only.",
  hard: "What people found hard",
  none: "No answer to this question stood out.",
  outOfDate: "Answers have changed since Claude read them. Find them again to include them.",
  asked: (day: string) => `Claude read them ${day}.`,
  sendable: (count: number) => plural(count, "1 answer can be sent.", "{n} answers can be sent."),
  notIncluded: (count: number) =>
    plural(
      count,
      `1 not included yet: its writer hadn’t agreed to version ${V} of the privacy policy when they wrote it.`,
      `{n} not included yet: their writers hadn’t agreed to version ${V} of the privacy policy when they wrote them.`,
    ),
  nothingToSend: `Nobody’s answers to this week can be sent yet: only writing sent after somebody agreed to version ${V} of the privacy policy is.`,
  notSetUp: "Claude isn’t set up on this site yet.",
  failed: "Claude couldn’t read them just now. Try again.",
  aFellow: "a fellow",
  loadFailed: "Couldn’t load Claude’s best answers. Try again.",
  retry: "Try again",
} as const;

export const PANGRAM_WORDS = {
  title: "Pangram",
  whoSees: "Admins only.",
  intro: "Pangram estimates whether writing was produced with AI. It checks written answers and reflections of 50 words or more, only those sent after they agreed. A flag is a reason to read it again, never a verdict.",
  personButton: "Check with Pangram",
  weekButton: (people: number) => plural(people, "Check 1 person with Pangram", "Check {n} people with Pangram"),
  weekCount: (people: number, answers: number) =>
    `${plural(people, "1 person", "{n} people")}, ${plural(answers, "1 answer", "{n} answers")}: one request each, one at a time.`,
  checking: "Pangram is checking…",
  checkingOf: (done: number, total: number) => `Checked ${done} of ${total}…`,
  worthALook: "Worth a look",
  noFlag: "Nothing to flag",
  outOfDate: "Changed since Pangram checked it",
  notChecked: "Not checked yet",
  tooShort: (count: number) => plural(count, "1 answer is under 50 words and isn’t sent.", "{n} answers are under 50 words and aren’t sent."),
  notCounted: (count: number) =>
    plural(
      count,
      `1 answer was written before they agreed to version ${V} of the privacy policy and isn’t sent.`,
      `{n} answers were written before they agreed to version ${V} of the privacy policy and aren’t sent.`,
    ),
  nothingToSend: "Nothing of theirs can be sent to Pangram: no counted answer of 50 words or more.",
  nobodyThisWeek: "Nobody’s answers this week can be sent to Pangram.",
  notSetUp: "Pangram isn’t set up on this site yet.",
  onlyAdmins: "Only an admin can ask Pangram, or see what it found.",
  failed: "Pangram couldn’t check this just now. Try again.",
  loadFailed: "Couldn’t load what Pangram found. Try again.",
  retry: "Try again",
  week: (n: number) => `Week ${n}`,
  words: (n: number) => `${n} words`,
  checked: (day: string) => `checked ${day}`,
  flagged: (count: number) => plural(count, "1 answer worth a look:", "{n} answers worth a look:"),
  noneFlagged: "Nothing this week to flag.",
  stoppedAt: (name: string, reason: string) => `Stopped at ${name}: ${reason}`,
  /** A person the tab has no row for, named nowhere else. */
  somebody: "Somebody on the programme",
} as const;

/**
 * The part of the Coursework tab under the table: a week chosen by plain
 * links, then Claude's best answers to it (admins and the programme's lead)
 * and Pangram on it (admins only). Nothing here names Pangram: the lead
 * reads it.
 */
export const WEEK_PANELS_WORDS = {
  nav: "Choose a week",
} as const;
