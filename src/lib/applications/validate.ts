import { STATUSES_WITH_GRADUATION, validateUniversityEmail } from "@/lib/firestore/users";
import {
  APPLICATION_LIMITS,
  type AnswerValue,
  type Answers,
  type ApplicationContent,
  type ApplicationFormFields,
  type ApplicationQuestion,
  type QuestionSetDoc,
} from "./model";
import { applicableSets, openProgrammes, rankedProgrammes } from "./sections";

/**
 * WHAT MAKES AN APPLICATION READY TO SEND.
 *
 * A draft is allowed to be anything: half an answer, a programme ticked and
 * no questions answered yet. The draft save only cleans what it is given.
 * Sending is the one moment the whole application is held to the form, and
 * this module is that check, used by the form (to show what is missing), by
 * the check page, and by the send route (which trusts neither).
 *
 * `contentForSend` is the other half: what is copied into `sent`. It keeps
 * only the answers to question sets that apply, so a reviewer never reads an
 * answer to a programme the person unticked afterwards.
 */

type Form = Pick<
  ApplicationFormFields,
  "programmeIds" | "programmes" | "questionSetIds" | "asksFacilitating"
>;

/** Word limits on the two About you answers the form counts. */
export const ABOUT_YOU_WORD_LIMITS = { motivation: 100, interests: 50 } as const;

/** The option a ranked-programme question always adds. */
export const EITHER_OPTION = "Either";

/** Words in a piece of text: runs of non-space characters. */
export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * The options a question offers this person. For a question whose options
 * come from the ranking, that is each programme they ranked and "Either".
 */
export function optionsFor(
  question: ApplicationQuestion,
  form: Form,
  content: Pick<ApplicationContent, "rankedProgrammeIds">,
): string[] {
  if (!question.optionsFromRanking) return question.options;
  const names = rankedProgrammes(form, content).map((programme) => programme.shortName);
  return names.length > 1 ? [...names, EITHER_OPTION] : names;
}

/** True when an answer is there at all. A blank string and an empty list are not. */
export function isAnswered(value: AnswerValue | undefined): boolean {
  if (value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  return value.length > 0;
}

/**
 * What is wrong with one answer, as a sentence for the person, or null.
 * An optional question left blank is fine; anything written is checked.
 */
export function answerProblem(
  question: ApplicationQuestion,
  value: AnswerValue | undefined,
  options: readonly string[],
): string | null {
  if (!isAnswered(value)) return question.required ? "Answer this question." : null;
  const L = APPLICATION_LIMITS;
  if (question.type === "short" || question.type === "long") {
    if (typeof value !== "string") return "Answer this question in words.";
    const cap = question.type === "short" ? L.shortAnswerChars : L.longAnswerChars;
    if (value.length > cap) return "That answer is too long.";
    if (question.wordLimit !== null && countWords(value) > question.wordLimit) {
      return `Keep this to ${question.wordLimit} words.`;
    }
    return null;
  }
  if (question.type === "choice") {
    return typeof value === "string" && options.includes(value) ? null : "Pick one of the options.";
  }
  if (question.type === "multi") {
    return Array.isArray(value) && value.every((item) => options.includes(item))
      ? null
      : "Pick from the options.";
  }
  // scale: the index of a point.
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < options.length
    ? null
    : "Pick a point on the scale.";
}

export type Issue = {
  /** The step to send the person back to: a step id from `stepsFor`. */
  step: string;
  /** Present for a problem with one question. */
  questionId: string | null;
  /** A sentence for the person. */
  message: string;
};

function aboutYouIssues(content: ApplicationContent): Issue[] {
  const about = content.aboutYou;
  const issues: Issue[] = [];
  const add = (message: string) => issues.push({ step: "about", questionId: null, message });
  if (!about.preferredName.trim()) add("Tell us what to call you.");
  if (!about.universityEmail.trim()) add("Add your university email.");
  else {
    const problem = validateUniversityEmail(about.universityEmail.trim());
    if (problem) add(problem);
  }
  if (!about.status) add("Tell us what you do at UoN.");
  if (about.status === "other" && !about.statusOther.trim()) add("Tell us what you do at UoN.");
  if (!about.subject.trim()) add("Add your degree.");
  if (
    (STATUSES_WITH_GRADUATION as readonly string[]).includes(about.status) &&
    !about.expectedGraduation
  ) {
    add("Add when you expect to graduate.");
  }
  if (!about.motivation.trim()) add("Tell us why you are interested in AI safety.");
  else if (countWords(about.motivation) > ABOUT_YOU_WORD_LIMITS.motivation) {
    add(`Keep why you are interested to ${ABOUT_YOU_WORD_LIMITS.motivation} words.`);
  }
  if (countWords(about.interests) > ABOUT_YOU_WORD_LIMITS.interests) {
    add(`Keep your interests to ${ABOUT_YOU_WORD_LIMITS.interests} words.`);
  }
  return issues;
}

/**
 * Everything that stops this application being sent, in the order the form
 * asks for it. Empty means it can be sent.
 */
export function issuesFor(
  form: Form,
  sets: readonly QuestionSetDoc[],
  content: ApplicationContent,
): Issue[] {
  const issues = aboutYouIssues(content);

  const open = new Set(openProgrammes(form).map((programme) => programme.id));
  const ranked = rankedProgrammes(form, content);
  if (ranked.length === 0) {
    issues.push({ step: "choose", questionId: null, message: "Tick at least one programme." });
  }
  for (const programme of ranked) {
    if (!open.has(programme.id)) {
      issues.push({
        step: "choose",
        questionId: null,
        message: `${programme.shortName} is not taking applications. Untick it to carry on.`,
      });
    }
  }

  if (form.asksFacilitating && content.wantsToFacilitate === null) {
    issues.push({
      step: "facilitating",
      questionId: null,
      message: "Tell us whether you would like to facilitate a group.",
    });
  }

  for (const set of applicableSets(form, sets, content)) {
    const answers = content.answers[set.id] ?? {};
    for (const question of set.questions) {
      const problem = answerProblem(question, answers[question.id], optionsFor(question, form, content));
      if (problem) issues.push({ step: `set:${set.id}`, questionId: question.id, message: problem });
    }
  }

  if (content.suMembership === null) {
    issues.push({
      step: "check",
      questionId: null,
      message: "Tell us whether you have SU membership. It will not affect your application.",
    });
  }
  return issues;
}

/**
 * The content that becomes the application of record: the same choices, and
 * answers only to the sets and questions this person was actually asked.
 */
export function contentForSend(
  form: Form,
  sets: readonly QuestionSetDoc[],
  content: ApplicationContent,
): ApplicationContent {
  const answers: Answers = {};
  for (const set of applicableSets(form, sets, content)) {
    const given = content.answers[set.id] ?? {};
    const kept: Record<string, AnswerValue> = {};
    for (const question of set.questions) {
      const value = given[question.id];
      if (isAnswered(value)) kept[question.id] = value as AnswerValue;
    }
    answers[set.id] = kept;
  }
  return {
    ...content,
    rankedProgrammeIds: rankedProgrammes(form, content).map((programme) => programme.id),
    wantsToFacilitate: form.asksFacilitating ? content.wantsToFacilitate : null,
    answers,
  };
}

/** How many of a set's questions this person has answered, for "2 of 2 answered". */
export function answeredCount(set: QuestionSetDoc, content: Pick<ApplicationContent, "answers">): number {
  const given = content.answers[set.id] ?? {};
  return set.questions.filter((question) => isAnswered(given[question.id])).length;
}
