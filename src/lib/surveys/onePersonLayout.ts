import { own } from "@/lib/applications/keys";
import type { EventRespondent, SurveyKind } from "@/lib/firestore/surveys";
import { isLinesQuestion, questionNumbers, surveyQuestionsOf, type SurveyAnswer, type SurveyItem, type SurveyQuestion } from "./items";
import { TEMPLATE_MEASURES } from "./templates";
import {
  PERSON_COLUMN_WORDS,
  PERSON_WORDS,
  dayAndClockWords,
  onlyThisSurveyWords,
  otherWordingWords,
  personScaleWords,
  sameQuestionsWords,
  sentNotAnsweredWords,
} from "./words";

/**
 * ONE PERSON'S ANSWERS, LAID OUT AS THE BOARD DRAWS THEM (sv-person): the
 * change questions with the start and the end side by side, then each
 * survey's own questions under its own heading. Every word of a question is
 * the survey's own, as its record holds it, and every value is the person's
 * answer read against that survey's options: an option's words are never
 * taken from another survey's copy.
 *
 * Pure: the page's server code reads, records the opening first, and hands
 * this what it read. Nothing here knows who the person is.
 */

/**
 * The address segment a person's answers are opened by, from Who answered:
 * their uid, or `g_<signupId>` for a guest of an event (`subjectOf` in
 * `./onePerson.ts` reads it back).
 */
export function whoOf(respondent: EventRespondent): string {
  return respondent.kind === "account" ? respondent.uid : `g_${respondent.signupId}`;
}

/** A value in one column: its lines, or a muted note when there are none. */
export type PersonCell = { lines: string[]; note: string };

export type PersonRow =
  /** A survey's section, with what it measures where the questionnaire names it. */
  | { kind: "section"; heading: string; measure: string }
  | {
      kind: "question";
      /** The number the person saw beside it in the survey the table is numbered by, or null. */
      number: number | null;
      title: string;
      /** "1 Not at all to 5 Very", "Pick any", or "". */
      scale: string;
      /** The line under the question, as the survey holds it, or "". */
      hint: string;
      /** The other survey's words, where they differ ("End: Since the programme started, have you…"), or "". */
      also: string;
      /** One per column; empty for a question answered line by line. */
      cells: PersonCell[];
    }
  /** One line of a "1 to 5 for each line" question. */
  | { kind: "line"; label: string; cells: PersonCell[] };

/** A column: "Start", and when they sent it ("Thu 29 Oct, 7:12pm"), or that they did not. */
export type PersonColumn = { label: string; when: string };

export type PersonTable = {
  title: string;
  /** The line under the title. */
  line: string;
  columns: PersonColumn[];
  rows: PersonRow[];
  /** Said instead of rows when the person was sent the survey and did not answer it, else "". */
  empty: string;
};

/** One of the surveys on the page, as the layout needs it, with what the person did with it. */
export type PersonSurvey = {
  id: string;
  kind: SurveyKind;
  /** What people saw at the top of it. */
  title: string;
  /** The admins' name for it. */
  name: string;
  items: SurveyItem[];
  /** Their answers, or null when they have not answered it. */
  answers: Record<string, SurveyAnswer> | null;
  /** When they sent their answers. */
  sentAt: Date | null;
  /** When it was sent to them; null when it never was (their row is missing, or made as they answered). */
  sentToThemAt: Date | null;
  /** Whether they have a row on it: it was sent to them, it reached them, or they answered it. */
  onIt: boolean;
};

const columnOf = (survey: PersonSurvey): PersonColumn => ({
  label: PERSON_COLUMN_WORDS[survey.kind],
  when: survey.sentAt ? dayAndClockWords(survey.sentAt) : survey.onIt ? PERSON_WORDS.notAnswered : PERSON_WORDS.notSent,
});

/** The person's answer to one question, in that survey's own words. */
export function cellFor(question: SurveyQuestion, answers: Record<string, SurveyAnswer> | null): PersonCell {
  if (answers === null) return { lines: [], note: "" };
  const answer = own(answers, question.id);
  if (!answer) return { lines: [], note: PERSON_WORDS.noAnswer };
  const labelOf = (id: string) => ("options" in question ? (question.options?.find((option) => option.id === id)?.label ?? "") : "");
  switch (answer.type) {
    case "choice": {
      const label = labelOf(answer.optionId);
      return label ? { lines: [label], note: "" } : { lines: [], note: PERSON_WORDS.noAnswer };
    }
    case "choices": {
      const lines = answer.optionIds.map(labelOf).filter(Boolean);
      const most = answer.most && "most" in question && question.most ? labelOf(answer.most) : "";
      if (most && "most" in question && question.most) lines.push(`${question.most} ${most}`);
      return lines.length > 0 ? { lines, note: "" } : { lines: [], note: PERSON_WORDS.noAnswer };
    }
    case "text":
      return answer.text.trim() ? { lines: [answer.text], note: "" } : { lines: [], note: PERSON_WORDS.noAnswer };
    case "rating":
    case "scale":
    case "number":
      return { lines: [String(answer.value)], note: "" };
    case "percent":
      return { lines: [`${answer.value}%`], note: "" };
    default:
      // A lines question is answered line by line (`lineCell`); nothing else is a survey's.
      return { lines: [], note: "" };
  }
}

/** The person's number on one line of a lines question. */
function lineCell(questionId: string, lineId: string, answers: Record<string, SurveyAnswer> | null): PersonCell {
  if (answers === null) return { lines: [], note: "" };
  const answer = own(answers, questionId);
  const value = answer && answer.type === "lines" ? own(answer.values, lineId) : undefined;
  return typeof value === "number" ? { lines: [String(value)], note: "" } : { lines: [], note: PERSON_WORDS.noAnswer };
}

/** Each question's section in its survey, by the question's id. */
function sectionsOf(items: readonly SurveyItem[]): Map<string, { id: string; heading: string }> {
  const out = new Map<string, { id: string; heading: string }>();
  let current: { id: string; heading: string } | null = null;
  for (const item of items) {
    if (item.kind === "section") current = { id: item.id, heading: item.heading };
    else if (item.kind === "question" && current) out.set(item.id, current);
  }
  return out;
}

/**
 * The rows for some of a survey's questions, in its order, each section's
 * heading before its first question shown, numbered by `numbered` when given.
 * `columns` are the surveys whose answers fill the cells, each read against
 * its own copy of the question.
 */
function rowsFor(
  layout: PersonSurvey,
  questions: readonly SurveyQuestion[],
  columns: readonly PersonSurvey[],
  numbered: boolean,
): PersonRow[] {
  const rows: PersonRow[] = [];
  const sections = sectionsOf(layout.items);
  const numbers = questionNumbers(layout.items);
  let lastSection = "";
  for (const question of questions) {
    const section = sections.get(question.id);
    if (section && section.id !== lastSection) {
      rows.push({ kind: "section", heading: section.heading, measure: TEMPLATE_MEASURES[section.id] ?? "" });
      lastSection = section.id;
    }
    // Each column's own copy of the question: its words, its options, its lines.
    const copies = columns.map((column) => surveyQuestionsOf(column.items).find((each) => each.id === question.id) ?? question);
    const also = copies
      .map((copy, at) => (copy.title !== question.title ? otherWordingWords(PERSON_COLUMN_WORDS[columns[at].kind], copy.title) : ""))
      .filter(Boolean)
      .join(" ");
    const head = {
      kind: "question" as const,
      number: numbered ? (numbers.get(question.id) ?? null) : null,
      title: question.title,
      scale: personScaleWords(question),
      hint: question.hint ?? "",
      also,
    };
    if (isLinesQuestion(question)) {
      rows.push({ ...head, cells: [] });
      for (const line of question.lines) {
        rows.push({ kind: "line", label: line.label, cells: columns.map((column) => lineCell(question.id, line.id, column.answers)) });
      }
      continue;
    }
    rows.push({ ...head, cells: copies.map((copy, at) => cellFor(copy, columns[at].answers)) });
  }
  return rows;
}

/**
 * The questions the start and the end both ask, the same way: the same id and
 * the same type, in the before survey's order. The pairing is by id, as the
 * results compare them.
 */
export function changeQuestions(before: PersonSurvey, after: PersonSurvey): SurveyQuestion[] {
  const later = surveyQuestionsOf(after.items);
  return surveyQuestionsOf(before.items).filter((question) => later.some((each) => each.id === question.id && each.type === question.type));
}

/**
 * The page's tables. The change questions come first, when the person was on
 * both the start and the end and answered at least one; then each survey's own
 * questions, the change questions left out of the two that share them, under
 * the survey's title. A survey the person was sent and did not answer says so
 * in a line; one they were never on is not shown.
 */
export function personTables(surveys: readonly PersonSurvey[]): { change: PersonTable | null; rest: PersonTable[] } {
  const mine = surveys.filter((survey) => survey.onIt || survey.answers !== null);
  const before = mine.find((survey) => survey.kind === "before") ?? null;
  const after = mine.find((survey) => survey.kind === "after") ?? null;
  const shared = before && after && (before.answers !== null || after.answers !== null) ? changeQuestions(before, after) : [];
  const change: PersonTable | null =
    before && after && shared.length > 0
      ? {
          title: PERSON_WORDS.changeTitle,
          line: sameQuestionsWords(shared.length),
          columns: [columnOf(before), columnOf(after)],
          rows: rowsFor(before, shared, [before, after], true),
          empty: "",
        }
      : null;
  const sharedIds = new Set(change ? shared.map((question) => question.id) : []);
  const rest: PersonTable[] = [];
  for (const survey of mine) {
    const paired = change !== null && (survey.kind === "before" || survey.kind === "after");
    const questions = surveyQuestionsOf(survey.items).filter((question) => !(paired && sharedIds.has(question.id)));
    if (questions.length === 0) continue;
    const line = paired ? onlyThisSurveyWords(survey.kind as "before" | "after") : survey.name;
    if (survey.answers === null) {
      rest.push({ title: survey.title, line, columns: [], rows: [], empty: sentNotAnsweredWords(survey.sentToThemAt) });
      continue;
    }
    rest.push({ title: survey.title, line, columns: [columnOf(survey)], rows: rowsFor(survey, questions, [survey], false), empty: "" });
  }
  return { change, rest };
}

/** One opening, as Who has opened this lists it. */
export type PersonOpeningLine = {
  /** Their name, beside their initials. */
  name: string;
  /** For the disc's colour only. */
  key: string;
  /** "Zach Levin · Mon 21 Dec, 11:04am". */
  line: string;
};

/** Everything the page draws about the person, built on the server (`./onePerson.ts`) field by field: never a stored document. */
export type PersonView = {
  /** "Amara Okafor", or that the account or the guest is gone. */
  name: string;
  /** For the disc's colour only: the account's uid, or the guest's key. */
  key: string;
  /** "Fellowship: AGI Strategy", "Group B", "Answered both". */
  meta: string[];
  /** "Only admins can open one person’s answers, and each opening is logged. You opened this at 11:04am." */
  notice: string;
  /** Said in place of the tables when there is nothing of theirs here, else "". */
  nothing: string;
  change: PersonTable | null;
  rest: PersonTable[];
  /** "Amara’s name comes off on Sat 9 Dec 2028.", then "Their answers stay in the totals."; empty when no day is set. */
  namesOff: string[];
  openings: PersonOpeningLine[];
};
