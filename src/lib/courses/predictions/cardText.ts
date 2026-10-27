import {
  PREDICTION_LIMITS,
  predictionCardProblems,
  questionIdAt,
  weekNumberOf,
  type PredictionCard,
  type PredictionQuestion,
  type PredictionQuestions,
} from "./model";

/**
 * A CREDENCE CARD AS PRINTED, READ AND WRITTEN (the course editor's
 * "Sealed predictions" card, through `/api/courses/[courseId]/predictions`).
 * An admin pastes the card the way the session plans print it, and what
 * this reads back is what every run of the course asks.
 *
 * THE SHAPE IT READS, one entry per paragraph or numbered line:
 *  - the FIRST line is the card's heading, kept as printed ("MY CARD
 *    (sealed until week 6)"); when it says "sealed until week N",
 *    N has to be the week the card opens in;
 *  - a "Name:" line is left out (the site knows whose card it is);
 *  - a line before the first question that is not one is the card's opening
 *    line ("Put a number on each, from 0% to 100%.");
 *  - a question is a numbered line ("1. ...", carried on over the lines
 *    under it) or a line that ends in a blank or a colon. How it ends says how
 *    it is answered: a blank and a % sign ("____%") a percentage; a blank
 *    alone ("____") a number on the scale its brackets give, "(0 = not at
 *    all, 10 = completely)"; a colon and no blank a sentence.
 * Fences (```) round the card are left out, and so are the backslashes a
 * copied Markdown file puts before an underscore.
 *
 * Nothing is ever cut short in silence: a line too long, a question that
 * does not say how it is answered, too many questions, or a heading that
 * names another week is a problem with its sentence, and the card is not
 * saved until there are none.
 *
 * WRITTEN BACK OUT (`predictionCardToText`) in the same shape, so the copy
 * the editor shows reads back as the same card.
 *
 * Pure: the route reads it, and the editor's card writes it.
 */

export type PredictionCardRead = {
  /** The card as read, or null when there is no question in it. */
  card: PredictionCard | null;
  /** What stops it being saved. Empty when it can be. */
  problems: string[];
};

/** One entry: a paragraph, or a numbered line with the lines carried under it. */
type Entry = { number: string; text: string };

const NUMBERED = /^(\d{1,3})\.\s+(.*)$/;
const BLANK_PERCENT = /_{2,}\s*%\s*$/;
const BLANK = /_{2,}\s*$/;
const SCALE_ENDS = /\(\s*0\s*=\s*([^,()=]+?)\s*,\s*(\d{1,3})\s*=\s*([^()=]+?)\s*\)/;
const SEALED_UNTIL = /sealed until week\s+(\d{1,2})/i;

/** The entries of a pasted card, in order. */
function entriesOf(text: string): Entry[] {
  const lines = text
    .replace(/\r\n?/g, "\n")
    // A copied Markdown file escapes the blanks.
    .replace(/\\([_%*])/g, "$1")
    .split("\n")
    .filter((line) => !/^\s*```/.test(line));
  const entries: Entry[] = [];
  let current: { number: string; lines: string[] } | null = null;
  const close = () => {
    if (current && current.lines.length > 0) {
      entries.push({ number: current.number, text: current.lines.join(" ").replace(/\s+/g, " ").trim() });
    }
    current = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      close();
      continue;
    }
    const numbered = NUMBERED.exec(line);
    if (numbered) {
      close();
      current = { number: numbered[1], lines: [numbered[2]] };
      continue;
    }
    if (!current) current = { number: "", lines: [] };
    current.lines.push(line);
  }
  close();
  return entries.filter((entry) => entry.text !== "");
}

/** Whether an entry asks a question: it is numbered, or ends in a blank or a colon. */
function asksSomething(entry: Entry): boolean {
  return entry.number !== "" || BLANK.test(entry.text) || BLANK_PERCENT.test(entry.text) || /:\s*$/.test(entry.text);
}

/** One question from one entry, or the sentence that says why it is not one. */
function questionOf(entry: Entry, index: number): { question: PredictionQuestion } | { problem: string } {
  const name = entry.number ? `Question ${entry.number}` : `“${entry.text.slice(0, 60)}”`;
  const base = { id: questionIdAt(index), number: entry.number, lowLabel: "", highLabel: "" };
  if (BLANK_PERCENT.test(entry.text)) {
    const statement = entry.text.replace(BLANK_PERCENT, "").trim();
    if (!statement) return { problem: `${name} has a blank and no words.` };
    return { question: { ...base, kind: "percent", statement, max: 100 } };
  }
  if (BLANK.test(entry.text)) {
    const withoutBlank = entry.text.replace(BLANK, "").trim();
    const ends = SCALE_ENDS.exec(withoutBlank);
    if (!ends) {
      return {
        problem: `${name} ends in a blank with no % sign, so say what its numbers run between, like “(0 = not at all, 10 = completely)”, or put a % sign after the blank for a percentage.`,
      };
    }
    const statement = withoutBlank.replace(SCALE_ENDS, " ").replace(/\s+/g, " ").trim();
    if (!statement) return { problem: `${name} has a scale and no words.` };
    return {
      question: { ...base, kind: "scale", statement, max: Number(ends[2]), lowLabel: ends[1].trim(), highLabel: ends[3].trim() },
    };
  }
  if (/:\s*$/.test(entry.text)) {
    return { question: { ...base, kind: "sentence", statement: entry.text, max: 0 } };
  }
  return {
    problem: `${name} doesn’t say how it’s answered: end it with ____% for a percentage, with ____ and its ends in brackets for a number on a scale, or with a colon for a sentence.`,
  };
}

/**
 * Read a pasted card. `weeks` are the week it is sealed in and the week it
 * opens in, as the editor's two boxes send them.
 */
export function readPredictionCardText(text: string, weeks: { sealWeek: unknown; openWeek: unknown }): PredictionCardRead {
  const problems: string[] = [];
  if (text.length > PREDICTION_LIMITS.textChars) {
    return { card: null, problems: [`That’s too long for a card: keep it under ${PREDICTION_LIMITS.textChars} characters.`] };
  }
  const entries = entriesOf(text).filter((entry) => !(entry.number === "" && /^name\s*:/i.test(entry.text)));
  if (entries.length === 0) return { card: null, problems: ["There’s nothing in that to read."] };

  // The first line is the heading, unless it is already a question.
  const first = entries[0];
  const title = asksSomething(first) ? "" : first.text;
  const rest = title ? entries.slice(1) : entries;

  let intro = "";
  const questions: PredictionQuestion[] = [];
  for (const entry of rest) {
    if (!asksSomething(entry)) {
      if (questions.length === 0 && !intro) {
        intro = entry.text;
        continue;
      }
      problems.push(
        `“${entry.text.slice(0, 60)}” is neither a question nor the line under the heading. A question is numbered, or ends in a blank or a colon.`,
      );
      continue;
    }
    const read = questionOf(entry, questions.length);
    if ("problem" in read) problems.push(read.problem);
    else questions.push(read.question);
  }

  if (questions.length === 0) {
    return { card: null, problems: problems.length > 0 ? problems : ["There are no questions on that card."] };
  }

  const sealWeek = typeof weeks.sealWeek === "number" ? weeks.sealWeek : NaN;
  const openWeek = typeof weeks.openWeek === "number" ? weeks.openWeek : NaN;
  const card: PredictionCard = { title, intro, sealWeek, openWeek, questions };
  problems.push(...predictionCardProblems(card));

  // A heading that names the week the card opens in has to name the right one.
  const named = SEALED_UNTIL.exec(title);
  if (named && weekNumberOf(openWeek) !== null && Number(named[1]) !== openWeek) {
    problems.push(`The heading says the card is sealed until week ${named[1]}, and it opens in week ${openWeek}: make them the same.`);
  }
  return { card, problems };
}

/** One question, as printed. */
function questionLine(question: PredictionQuestion): string {
  const lead = question.number ? `${question.number}. ` : "";
  if (question.kind === "percent") return `${lead}${question.statement} ____%`;
  if (question.kind === "scale") {
    return `${lead}${question.statement} (0 = ${question.lowLabel}, ${question.max} = ${question.highLabel}) ____`;
  }
  return `${lead}${question.statement}`;
}

/** A card written back out in the shape `readPredictionCardText` reads. */
export function predictionCardToText(card: PredictionQuestions): string {
  const parts: string[] = [];
  if (card.title) parts.push(card.title);
  if (card.intro) parts.push(card.intro);
  for (const question of card.questions) parts.push(questionLine(question));
  return `${parts.join("\n\n")}\n`;
}

/** What the editor says it found: "7 questions: 5 percentages and 2 sentences". */
export function foundWords(questions: readonly PredictionQuestion[]): string {
  const count = (kind: PredictionQuestion["kind"]) => questions.filter((question) => question.kind === kind).length;
  const kinds = [
    [count("percent"), "percentage", "percentages"],
    [count("scale"), "number on a scale", "numbers on a scale"],
    [count("sentence"), "sentence", "sentences"],
  ] as const;
  const named = kinds.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  const list = named.length <= 1 ? named.join("") : `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`;
  return `${questions.length} ${questions.length === 1 ? "question" : "questions"}: ${list}`;
}
