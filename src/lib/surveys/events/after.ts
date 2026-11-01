import {
  SURVEY_REMINDER_DAYS,
  sendsAfterHours,
  type StoredSurveyAfter,
  type SurveyAfterWho,
} from "@/lib/events/surveyAfter";
import type { EventAudience, EventSurveyDoc, SurveyPress } from "@/lib/firestore/surveys";
import { sanitizeSurveyItems, surveyQuestionsOf, validateSurveyItems, type SurveyItem, type SurveyQuestion } from "../items";
import { clockWords, dayAndClockWords, dayWords } from "../words";
import { STANDARD_QUESTION_IDS, eventTemplateItems } from "./template";

/**
 * THE SURVEY AFTER AN EVENT, SET UP BY ITS EVENT, in survey
 * terms: what the editor's Survey after step chose, read from the event
 * (`src/lib/events/surveyAfter.ts`), and when each part of it happens.
 *
 *  - ITS QUESTIONS start as the standard set: the question set an admin
 *    keeps on Run NAISI › Surveys › Question sets, else the code's
 *    (`./template.ts`), handed in by the caller (`eventStandardItems` on the
 *    server reads it; a page hands it to the browser). The step rewords,
 *    moves and removes any of them and adds others; a standard question is
 *    never retyped, so its answers compare across events, and "How was it?"
 *    removed reads "not asked" where it is counted.
 *  - WHO GETS IT: everyone who came (from check-in), or everyone with a place.
 *    An event nobody signs up for has only the first. With "everyone who
 *    came", the people who had a place and weren't checked in may be asked one
 *    question instead: what stopped them.
 *  - WHEN: it opens at the event's start, so its QR code works at the end; it
 *    goes by itself a number of whole hours after the event ends (12 unless
 *    the step chose 1 to 96), or only when somebody sends it; its one
 *    reminder goes 3 days after it went; it closes a week after the event,
 *    when a walk-in's address goes (`addLaterUntil`, which the server's own
 *    reader uses).
 *
 * Pure and safe in the browser: the editor's step, the Survey after tab, the
 * routes and the `event-surveys` job all ask here, so they cannot disagree.
 * Every time is printed in London, in the house's clock.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** How long after the event its survey closes: a week, `ADD_LATER_FOR_MS` in `src/lib/events/checkIns.ts`. */
export const SURVEY_AFTER_CLOSES_AFTER_MS = 7 * DAY_MS;

/** The setting with its questions read. */
export type SurveyAfterSettings = Omit<StoredSurveyAfter, "items"> & {
  items: SurveyItem[];
  /** The questions are the standard set as it stands (nothing chosen). */
  standard: boolean;
};

/**
 * An event's setting, its questions read: the standard set as it stands
 * (`standard`, which every caller hands in) when the step chose none.
 */
export function settingsOf(stored: StoredSurveyAfter, standard: readonly SurveyItem[]): SurveyAfterSettings {
  const { items, ...rest } = stored;
  return items === null
    ? { ...rest, items: structuredClone([...standard]) as SurveyItem[], standard: true }
    : { ...rest, items: sanitizeSurveyItems(items), standard: false };
}

/** The questions the step's items hold, in order: never a section or page break, which the step does not make. */
function stepQuestions(items: readonly SurveyItem[]): SurveyQuestion[] {
  return surveyQuestionsOf(items);
}

/** Whether a question is one of the standard set, the code's or the one handed in (and so keeps its type). */
export function isStandardQuestion(id: string, standard: readonly SurveyItem[]): boolean {
  return STANDARD_QUESTION_IDS.includes(id) || standard.some((item) => item.kind === "question" && item.id === id);
}

/**
 * The kind each standard question keeps: the code's for its own, then the
 * standard set's for the rest. The question set gives a question whose kind
 * it changes a new id, so the two never disagree on an id.
 */
function standardTypes(standard: readonly SurveyItem[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const item of [...eventTemplateItems(), ...standard]) {
    if (item.kind === "question" && !out.has(item.id)) out.set(item.id, item.type);
  }
  return out;
}

/**
 * Everything wrong with the step's questions, each naming its question by
 * number, in the form's order. Empty when the survey can be set up with them.
 */
export function questionProblems(items: readonly SurveyItem[], standardSet: readonly SurveyItem[]): string[] {
  const questions = stepQuestions(items);
  const numberOf = new Map(questions.map((question, at) => [question.id, at + 1]));
  const out: string[] = [];
  const standard = standardTypes(standardSet);
  for (const question of questions) {
    const type = standard.get(question.id);
    if (type !== undefined && type !== question.type) out.push(`Question ${numberOf.get(question.id)} can’t change its kind.`);
  }
  for (const problem of validateSurveyItems(sanitizeSurveyItems(items, { clampLimits: false }))) {
    const number = numberOf.get(problem.itemId);
    out.push(number ? `Question ${number}: ${problem.message}` : problem.message);
  }
  return [...new Set(out)];
}

/** What is wrong with each question, by its id: the words to put right beside it in the step. */
export function problemsByQuestion(items: readonly SurveyItem[], standardSet: readonly SurveyItem[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const standard = standardTypes(standardSet);
  const add = (id: string, message: string) => out.set(id, [...new Set([...(out.get(id) ?? []), message])]);
  for (const question of stepQuestions(items)) {
    const type = standard.get(question.id);
    if (type !== undefined && type !== question.type) add(question.id, "A standard question can’t change its kind.");
  }
  for (const problem of validateSurveyItems(sanitizeSurveyItems(items, { clampLimits: false }))) {
    if (problem.itemId) add(problem.itemId, problem.message);
  }
  return out;
}

/** About how long it takes: a minute for every five questions or part of five. */
export function minutesFor(questions: number): number {
  return Math.max(1, Math.ceil(questions / 5));
}

/** Who it goes to at this event: everyone who came, at an event nobody signs up for. */
export function whoAt(setting: Pick<StoredSurveyAfter, "who">, noSignup: boolean): SurveyAfterWho {
  return noSignup ? "came" : setting.who;
}

/** Whether the people who had a place and weren't checked in are asked one question instead. */
export function asksMissed(setting: Pick<StoredSurveyAfter, "who" | "missed">, noSignup: boolean): boolean {
  return !noSignup && setting.who === "came" && setting.missed;
}

/** The survey's audience for a choice of who. */
export function audienceKindOf(who: SurveyAfterWho): Exclude<EventAudience["kind"], "event-missed"> {
  return who === "signups" ? "event-signups" : "event-came";
}

type Timed = { startAt: Date | null; endAt: Date | null };

/** When the event ends: its end, or its start when it has none (`eventEnds`). */
function endsOf(event: Timed): Date | null {
  return event.endAt ?? event.startAt ?? null;
}

/** When each part happens, for an event as it stands; null where the event has no date or the part does not happen. */
export type SurveyAfterTimes = {
  /** It opens, and its QR code works: the event's start. */
  opensAt: Date | null;
  /** It goes by itself; null when it goes only by hand. */
  sendAt: Date | null;
  /** It stops taking answers: a week after the event. */
  closesAt: Date | null;
};

export function timesOf(event: Timed, setting: Pick<StoredSurveyAfter, "when" | "hours">): SurveyAfterTimes {
  const ends = endsOf(event);
  const hours = sendsAfterHours(setting);
  return {
    opensAt: event.startAt ?? null,
    sendAt: ends && hours !== null ? new Date(ends.getTime() + hours * HOUR_MS) : null,
    closesAt: ends ? new Date(ends.getTime() + SURVEY_AFTER_CLOSES_AFTER_MS) : null,
  };
}

/** When the one reminder goes, for a survey that went at `sentAt`. */
export function remindAtAfter(sentAt: Date): Date {
  return new Date(sentAt.getTime() + SURVEY_REMINDER_DAYS * DAY_MS);
}

// ---------------------------------------------------------------------------
// Where a survey its event set up has got to
// ---------------------------------------------------------------------------

/** The press that sent its first email, or null while it has not gone. */
export function firstPressOf(survey: { presses: readonly SurveyPress[] }): SurveyPress | null {
  return survey.presses.find((press) => press.kind === "first") ?? null;
}

type AutoState = Pick<EventSurveyDoc, "auto" | "firstSentAt" | "closedAt" | "closesAt" | "presses">;

/** Whether it has stopped taking answers: closed by hand, or past its time. */
function over(survey: Pick<EventSurveyDoc, "closedAt" | "closesAt">, now: Date): boolean {
  return survey.closedAt !== null || (survey.closesAt !== null && now.getTime() >= survey.closesAt.getTime());
}

/**
 * Whether the `event-surveys` job has anything left to do with a survey its
 * event set up: open it, email it by itself, or send its one reminder. Never
 * once it has closed, which is a week after the event at the latest.
 */
export function stillPending(survey: AutoState, now: Date): boolean {
  const auto = survey.auto;
  if (!auto || over(survey, now)) return false;
  if (!survey.firstSentAt) return true;
  const sendLeft = auto.when !== "hand" && firstPressOf(survey) === null && auto.skipped.send === null;
  const remindLeft = auto.reminder && auto.remindedAt === null && auto.skipped.remind === null && !remindedByHand(survey);
  return sendLeft || remindLeft;
}

/** An admin pressed Remind on the survey's own page: that was its one reminder, and the job sends none. */
function remindedByHand(survey: { presses: readonly SurveyPress[] }): boolean {
  return survey.presses.some((press) => press.kind === "remind" && !press.byJob);
}

/** The job's next step with a survey, and the moment it was due; null when nothing is due now. */
export type DueStep = { step: "open" | "send" | "remind"; dueAt: Date };

export function dueStep(survey: AutoState, times: SurveyAfterTimes, now: Date): DueStep | null {
  const auto = survey.auto;
  if (!auto || over(survey, now)) return null;
  const at = now.getTime();
  if (!survey.firstSentAt) {
    if (times.opensAt && at >= times.opensAt.getTime()) return { step: "open", dueAt: times.opensAt };
    return null;
  }
  const first = firstPressOf(survey);
  if (!first) {
    if (auto.when === "hand" || auto.skipped.send !== null || !times.sendAt) return null;
    return at >= times.sendAt.getTime() ? { step: "send", dueAt: times.sendAt } : null;
  }
  if (!auto.reminder || auto.remindedAt !== null || auto.skipped.remind !== null || remindedByHand(survey) || !first.at) return null;
  const remindAt = remindAtAfter(first.at);
  return at >= remindAt.getTime() ? { step: "remind", dueAt: remindAt } : null;
}

// ---------------------------------------------------------------------------
// The step's words
// ---------------------------------------------------------------------------

export const STEP_WORDS = {
  heading: "Survey after",
  hint: "What people are asked after the event, who gets it and when it goes.",
  on: "Ask people how it went",
  onHint: "On for every event unless you switch it off. The questions start as the standard set; change, remove or add any of them.",
  offHint: "No survey goes after this event.",
  questions: "Questions",
  edit: "Edit",
  done: "Done",
  up: "Up",
  down: "Down",
  remove: "Remove",
  add: "Add a question",
  standard: "Back to the standard questions",
  newChip: "New",
  added: "added for this event",
  optional: "optional",
  wording: "The question",
  answers: "Answers",
  addAnswer: "Add an answer",
  takeOut: "Take out",
  lowEnd: "Words at 1",
  highEnd: "Words at 5",
  required: "Needs an answer",
  requiredOn: "People answer it before they can send.",
  requiredOff: "People can leave it blank. It shows “(optional)”.",
  who: "Who gets it",
  came: "Everyone who came",
  cameHint: "From check-in at the door.",
  signups: "Everyone with a place, came or not",
  noSignup: "Nobody signs up for this event, so it goes to the people who came.",
  missed: "Ask people who had a place but didn’t come one question instead: what stopped them?",
  missedHint: "Only if the door is opened at the event, so check-in says who came.",
  when: "When it goes",
  standardWhen: "By itself, 12 hours after it ends",
  afterWhen: "By itself, a different time after it ends",
  handWhen: "Only when you or an admin send it",
  hoursLabel: "Hours after it ends",
  sooner: "Either way, you or an admin can send it sooner from the Survey after tab.",
  reminder: "One reminder 3 days later, to people who haven’t answered",
  showCode: "Show its QR code at the end of the event",
  showCodeHint: "On the Check-in tab, for whoever runs the door.",
  nobodyPresses: "Nobody needs to press anything.",
  undated: "Once the event has its date and time, this says when.",
  jobOff: "Sending by itself is switched off on this site for now, so until an admin switches it on, send it from the Survey after tab.",
  published: "It’s published: change its survey, and send it sooner, on the Survey after tab.",
  publishedOff: "It’s published with no survey after it. Switch one on from the Survey after tab.",
  publishedBefore: "This event has no survey setting of its own, so an admin makes its survey from Surveys.",
  openTab: "Go to the Survey after tab",
  email: "See the email it sends",
  emailNote: "Each person gets their own link. Signed by the event’s author when it goes by itself, or by whoever sends it, for NAISI.",
  soonerHere: "Either way, you or an admin can send it sooner from this tab.",
  jobOffHere: "Sending by itself is switched off on this site for now, so until an admin switches it on, send it from this tab.",
} as const;

/** The kinds of question "Add a question" offers, in its order, with their words. */
export const ADDABLE_TYPES = [
  { type: "singleChoice", label: "Choose one" },
  { type: "multipleChoice", label: "Pick any" },
  { type: "rating", label: "1 to 5" },
  { type: "shortText", label: "Short answer" },
  { type: "longText", label: "Long answer" },
] as const;

export type AddableType = (typeof ADDABLE_TYPES)[number]["type"];

/** "Fri 20 Nov, 10am": when it goes by itself, or the step's line for an event with no date. */
export function goesAtWords(at: Date | null): string {
  return at ? dayAndClockWords(at) : STEP_WORDS.undated;
}

/** "everyone who came", "everyone with a place". */
export function whoWords(who: SurveyAfterWho): string {
  return who === "signups" ? "everyone with a place" : "everyone who came";
}

type SetUpInput = {
  on: boolean;
  who: SurveyAfterWho;
  missed: boolean;
  sendAt: Date | null;
  byHand: boolean;
  /** Whether the `event-surveys` job is switched on here. */
  jobOn: boolean;
};

/** "the survey goes by itself on Fri 20 Nov at 10am to everyone who came": what is set, as a clause. */
function setUpClause(input: SetUpInput): string {
  const who = `${whoWords(input.who)}${input.missed ? ", and the one question to people with a place who didn’t come" : ""}`;
  if (input.byHand) return `the survey goes to ${who} when you or an admin send it from the Survey after tab`;
  if (!input.sendAt) return `the survey goes by itself to ${who} after the event`;
  const when = `on ${dayWords(input.sendAt)} at ${clockWords(input.sendAt)}`;
  return input.jobOn
    ? `the survey goes by itself ${when} to ${who}`
    : `the survey is ready to go ${when} to ${who}, once sending by itself is switched on`;
}

/**
 * "Publishing sets this up: the survey goes by itself on Fri 20 Nov at 10am
 * to everyone who came. Only admins read the answers; you’ll see that it
 * went." The step's last line, as it stands.
 */
export function setUpWords(input: SetUpInput): string {
  if (!input.on) return "Publishing sets up no survey after this event.";
  return `Publishing sets this up: ${setUpClause(input)}. Only admins read the answers; you’ll see that it went.`;
}

/** "The survey goes by itself on Fri 20 Nov at 10am to everyone who came.", or "None": the last step's summary. */
export function setUpSummaryWords(input: SetUpInput): string {
  if (!input.on) return "None";
  const clause = setUpClause(input);
  return `${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
}

/** "Sat 21 Nov, 10pm", under the hours. */
export function hoursLineWords(sendAt: Date | null, hours: number): string {
  if (!sendAt) return `${hours} ${hours === 1 ? "hour" : "hours"} after it ends.`;
  return `${dayAndClockWords(sendAt)}.`;
}
