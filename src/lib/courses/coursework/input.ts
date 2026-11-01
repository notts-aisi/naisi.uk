import { createHash } from "node:crypto";

/**
 * WHAT LEAVES THE SITE WHEN AN ADMIN, OR A PROGRAMME'S LEAD, ASKS CLAUDE OR
 * PANGRAM ABOUT COURSEWORK (privacy v13; docs/courses-ops.md, "Claude and
 * Pangram on coursework").
 *
 * Built from what `gather.ts` reads, and only from answers it marked
 * `counted`: written entirely after their writer first agreed to privacy v13.
 * Then:
 *
 *  - NO NAME, EMAIL ADDRESS OR ACCOUNT ID. People are labels ("Fellow 3",
 *    "the fellow"), numbered in account-id order so every asker builds the
 *    same labels. A name typed INTO an answer is swapped for a label too
 *    (`scrubNames`), from the names of everybody on the run.
 *  - NO GROUP NAME (a group may be named after its facilitator), no
 *    facilitator's name, no availability, no private note, no survey answer,
 *    no tick: `gather.ts` reads none of them.
 *  - FEEDBACK AS LEVELS, NEVER COMMENTS. A written answer's feedback goes as
 *    the rubric's row and the level given; a comment is somebody else's free
 *    text and may name anybody.
 *  - A HASH OF WHAT WAS SENT (`fingerprintOf`), kept with a stored result, so
 *    the screen marks it out of date once the answers change.
 *
 * Pure: a test runs every builder on fixtures holding names, addresses and
 * account ids and reads every line that would go.
 */

export type CourseworkKind = "reflection" | "written" | "fillIn";

/** One question of a week, from whichever copy of the week asks it. */
export type CourseworkQuestion = {
  /** `reflection:<promptId>`, `written:<blockId>` or `fillIn:<boxId>`. */
  key: string;
  kind: CourseworkKind;
  /** The id a row of `courseExerciseResponses` stores as `exerciseId`. */
  rowId: string;
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  /** The question as asked. */
  text: string;
  /** A written answer's labelled boxes, or none. */
  boxes: Array<{ id: string; label: string }>;
};

export type CourseworkWeek = {
  weekId: string;
  weekNumber: number;
  title: string;
  questions: CourseworkQuestion[];
};

/** One person's answer to one question. */
export type CourseworkAnswer = {
  /** The row's document id. */
  rowId: string;
  uid: string;
  questionKey: string;
  weekId: string;
  kind: CourseworkKind;
  /** Its words (a written answer in boxes: each box under its label). */
  text: string;
  /** Written entirely after its writer first agreed to privacy v13: the only answers that may leave. */
  counted: boolean;
  /** Whether its writer has agreed to privacy v13 at all. */
  agreed: boolean;
  /** A written answer's feedback, as levels only. */
  levels: Array<{ row: string; level: string }>;
};

/** Somebody whose name may appear in somebody's words, and the label it becomes. */
export type NameToLabel = { label: string; name: string };

/** Somebody on the run: their account, their name, and the label their name becomes unless they are numbered. */
export type RunPerson = { uid: string; name: string; label: string };

const KIND_WORDS: Record<CourseworkKind, string> = {
  reflection: "Reflection",
  written: "Written answer",
  fillIn: "Box to fill in",
};

/**
 * A written answer's words as Claude and Pangram are sent them: an answer of
 * one box, its words; an answer in boxes, each box with words under its
 * label. `boxes` are the question's, in order. The review page's Pangram chip
 * hashes the same words to say whether a reading is out of date.
 */
export function writtenAnswerWords(
  boxes: ReadonlyArray<{ id: string; label: string }>,
  record: { text: string; boxes: Record<string, string> | null },
): string {
  if (record.boxes) {
    return boxes
      .map((box) => ({ label: box.label, text: (record.boxes?.[box.id] ?? "").trim() }))
      .filter((box) => box.text)
      .map((box) => `${box.label}: ${box.text}`)
      .join("\n\n");
  }
  return record.text.trim();
}

/** A hash of a message, kept with what came back to tell when it is out of date. */
export function fingerprintOf(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A whole word, in any alphabet: `\b` does not see an accented letter as part of a word. */
function wordRe(word: string, flags: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(word)}(?![\\p{L}\\p{N}])`, `${flags}u`);
}

/**
 * Somebody's words with every name of everybody listed swapped for that
 * person's label: a whole name first (in any case), then each part of a name
 * of three letters or more AS WRITTEN WITH ITS CAPITAL, because coursework is
 * prose and a first name like "Will", "May" or "Hope" is also a word. A part
 * two people share becomes "someone on the programme". An email address
 * typed anywhere becomes "(an email address)".
 */
export function scrubNames(text: string, people: readonly NameToLabel[]): string {
  let out = text;
  const whole = people
    .map((person) => ({ label: person.label, name: person.name.trim().replace(/\s+/g, " ") }))
    .filter((person) => person.name.includes(" "))
    .sort((a, b) => b.name.length - a.name.length);
  for (const { label, name } of whole) out = out.replace(wordRe(name, "gi"), label);
  const byPart = new Map<string, Set<string>>();
  for (const person of people) {
    for (const part of person.name.trim().split(/\s+/)) {
      if (part.length < 3) continue;
      const labels = byPart.get(part) ?? new Set<string>();
      labels.add(person.label);
      byPart.set(part, labels);
    }
  }
  const parts = [...byPart.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [part, labels] of parts) {
    const replacement = labels.size === 1 ? [...labels][0] : "someone on the programme";
    out = out.replace(wordRe(part, "g"), replacement);
  }
  return out.replace(/[^\s@<>()[\]"',;:]+@[^\s@<>()[\]"',;:]+\.[A-Za-z]{2,}/g, "(an email address)");
}

// ---------------------------------------------------------------------------
// A note about one person (B4)
// ---------------------------------------------------------------------------

export type NoteDraftInput = {
  message: string;
  /** How many answers went. */
  sent: number;
};

/**
 * The message for Claude's draft of a note about ONE person, from their
 * counted coursework on one run. `people` is everybody on the run with the
 * label their name becomes: the person themselves "the fellow".
 */
export function noteDraftInput(input: {
  programme: string;
  weeks: readonly CourseworkWeek[];
  answers: readonly CourseworkAnswer[];
  people: readonly NameToLabel[];
}): NoteDraftInput {
  const counted = input.answers.filter((answer) => answer.counted);
  const lines: string[] = [];
  lines.push(`# The programme: ${scrubNames(input.programme, input.people)}`);
  lines.push(
    "Only the fellow's writing from after a certain date is shown. Anything earlier is left out on purpose, so a question with no answer here is not one they skipped.",
  );
  let sent = 0;
  for (const week of input.weeks) {
    const mine = week.questions
      .map((question) => ({ question, answer: counted.find((answer) => answer.questionKey === question.key && answer.weekId === week.weekId) }))
      .filter((pair): pair is { question: CourseworkQuestion; answer: CourseworkAnswer } => pair.answer !== undefined);
    if (mine.length === 0) continue;
    lines.push("", `# Week ${week.weekNumber}: ${scrubNames(week.title, input.people)}`);
    for (const { question, answer } of mine) {
      lines.push("", `## ${KIND_WORDS[question.kind]}: ${scrubNames(question.text, input.people)}`, scrubNames(answer.text, input.people));
      if (answer.levels.length > 0) {
        lines.push(`Feedback given, as levels on the course's rubric: ${answer.levels.map((level) => `${level.row}: ${level.level}`).join("; ")}`);
      }
      sent += 1;
    }
  }
  return { message: lines.join("\n"), sent };
}

/** Names back where Claude wrote "the fellow", for the admin's box. */
export function noteWithName(text: string, firstName: string): string {
  if (!firstName.trim()) return text;
  return text.replace(/\bThe fellow\b/g, firstName).replace(/\bthe fellow\b/g, firstName);
}

// ---------------------------------------------------------------------------
// The strongest answers to a week's questions (B5)
// ---------------------------------------------------------------------------

export type BestAnswersInput = {
  message: string;
  fingerprint: string;
  /** "Fellow 3" to the account it stands for. */
  labels: Record<string, string>;
  /** The questions sent, by their label ("Q1"). */
  questions: Array<{ label: string; key: string; kind: CourseworkKind; text: string }>;
  /** How many answers were sent. */
  sent: number;
  /** Answers left out because their writer has not agreed to privacy v13, or wrote them before agreeing. */
  leftOut: number;
};

/**
 * The message for Claude's pick of the strongest answers to ONE week's
 * questions across a programme. `writers` is who may be read: everybody
 * holding a place, never a facilitator's own work. `people` is everybody on
 * the run, for swapping a typed name for a label.
 */
export function bestAnswersInput(input: {
  programme: string;
  week: CourseworkWeek;
  answers: readonly CourseworkAnswer[];
  writers: ReadonlySet<string>;
  people: readonly RunPerson[];
}): BestAnswersInput {
  const ofWeek = input.answers.filter((answer) => answer.weekId === input.week.weekId && input.writers.has(answer.uid));
  const counted = ofWeek.filter((answer) => answer.counted);
  const leftOut = ofWeek.length - counted.length;
  const uids = [...new Set(counted.map((answer) => answer.uid))].sort();
  const labelOf = new Map(uids.map((uid, index) => [uid, `Fellow ${index + 1}`]));
  const labels = Object.fromEntries(uids.map((uid) => [labelOf.get(uid) as string, uid]));
  // A name in somebody's words becomes that person's label when they are
  // numbered here, else the words that name nobody they came with.
  const people: NameToLabel[] = input.people.map((person) => ({ name: person.name, label: labelOf.get(person.uid) ?? person.label }));

  const lines: string[] = [];
  lines.push(`# The programme: ${scrubNames(input.programme, people)}`);
  lines.push(`# Week ${input.week.weekNumber}: ${scrubNames(input.week.title, people)}`);
  lines.push('Each answer is labelled with the fellow who wrote it ("Fellow 3"); a fellow has the same label on every question.');
  const questions: BestAnswersInput["questions"] = [];
  let sent = 0;
  input.week.questions.forEach((question) => {
    const answers = counted
      .filter((answer) => answer.questionKey === question.key)
      .sort((a, b) => (labelOf.get(a.uid) ?? "").localeCompare(labelOf.get(b.uid) ?? "", "en", { numeric: true }));
    if (answers.length === 0) return;
    const label = `Q${questions.length + 1}`;
    questions.push({ label, key: question.key, kind: question.kind, text: question.text });
    lines.push("", `## ${label}. ${KIND_WORDS[question.kind]}: ${scrubNames(question.text, people)}`);
    for (const answer of answers) {
      lines.push("", `### ${labelOf.get(answer.uid)}`, scrubNames(answer.text, people));
      sent += 1;
    }
  });
  const message = lines.join("\n");
  return { message, fingerprint: fingerprintOf(message), labels, questions, sent, leftOut };
}

/** Names back where Claude wrote "Fellow 3", for the screen. A label nobody holds any more reads "a fellow". */
export function withFellowNames(text: string, names: Readonly<Record<string, string>>): string {
  return text.replace(/\bFellow (\d+)\b/g, (whole) => (Object.prototype.hasOwnProperty.call(names, whole) ? names[whole] : "a fellow"));
}

// ---------------------------------------------------------------------------
// Pangram (B6)
// ---------------------------------------------------------------------------

/** One answer Pangram may check: a counted written answer or reflection, long enough. */
export type PangramPart = {
  /** The row's document id. */
  key: string;
  weekId: string;
  kind: CourseworkKind;
  /** The question it answers (`CourseworkQuestion.key`). */
  questionKey: string;
  text: string;
  words: number;
  /** A hash of its words, kept with its reading. */
  hash: string;
};

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * The parts of one person's coursework Pangram may be sent: counted written
 * answers and reflections of `minWords` or more, in week order. Fill-in boxes
 * are never sent: they are short plans, not prose. `weekId` narrows it to one
 * week. Also counts what is left out, for the screen.
 */
export function pangramPartsOf(
  answers: readonly CourseworkAnswer[],
  minWords: number,
  weekId: string | null,
): { parts: PangramPart[]; tooShort: number; notCounted: number } {
  const mine = answers.filter((answer) => (answer.kind === "written" || answer.kind === "reflection") && (!weekId || answer.weekId === weekId));
  const parts: PangramPart[] = [];
  let tooShort = 0;
  let notCounted = 0;
  for (const answer of mine) {
    if (!answer.counted) {
      notCounted += 1;
      continue;
    }
    const words = countWords(answer.text);
    if (words < minWords) {
      tooShort += 1;
      continue;
    }
    parts.push({
      key: answer.rowId,
      weekId: answer.weekId,
      kind: answer.kind,
      questionKey: answer.questionKey,
      text: answer.text,
      words,
      hash: fingerprintOf(answer.text),
    });
  }
  parts.sort((a, b) => a.weekId.localeCompare(b.weekId) || a.key.localeCompare(b.key));
  return { parts, tooShort, notCounted };
}
