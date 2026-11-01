import { createHash } from "node:crypto";
import { cameAfter } from "@/lib/legal/courseworkUse";
import type { NoteSource, NoteSourceRole } from "@/lib/memberNotes/model";

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
 *  - THE TEAM'S WORDS ONLY IN A NOTE'S DRAFT (privacy v15). The best answers
 *    and Pangram carry no feedback at all. A note's draft carries the
 *    feedback, ratings and comments people on the team gave the work, each
 *    scrubbed like the work and each writer by what they are, never who
 *    (`noteDraftInput`); feedback given before pieces existed goes as its
 *    levels on the rubric, never its comment.
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
  /**
   * When the row was first written, for a later moment than version 13's:
   * the week review sends work only from its writer's version 15 moment.
   */
  firstWrittenAt?: Date | null;
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
// A note about one person: the profile's press and the end-of-week notes
// ---------------------------------------------------------------------------

/** One piece of the team's feedback on somebody's week, as read: a comment, never a level. */
export type NoteFeedback = {
  /** The piece's own id, which orders two pieces saved at once. */
  id: string;
  weekId: string;
  /** The written answer it is on, by its block's id, or null for a piece on the week as a whole. */
  itemId: string | null;
  byUid: string;
  role: NoteSourceRole;
  text: string;
  /** When its words were last written: its change, else its saving. */
  at: Date | null;
};

/** One rating for the team of somebody's written answer, as read. */
export type NoteRating = {
  weekId: string;
  /** The written answer it rates, by its block's id. */
  itemId: string;
  raterUid: string;
  role: "lead" | "admin";
  rating: number;
  comment: string;
  /** When it was last given: its change, else its first giving. */
  at: Date | null;
};

/** One of the person's weeks with its questions, and when they submitted it. Only a submitted week is ever handed over. */
export type NoteWeek = { week: CourseworkWeek; submittedAt: Date };

export type NoteDraftInput = {
  message: string;
  /** How many pieces of their work went. */
  sent: number;
  /** A hash of the message, kept with a draft to tell when it is out of date. */
  fingerprint: string;
  /** Everything that went, in the message's order: what a draft keeps and a saved note shows as "Built only from". */
  builtFrom: NoteSource[];
  /** "Rater 1" to the account it stands for, for putting names back. */
  raters: Record<string, string>;
};

/** How a piece of feedback's writer is named to Claude: by what they are, never who. */
const FEEDBACK_FROM: Record<NoteSourceRole, string> = {
  facilitator: "their facilitator",
  lead: "the programme's lead",
  admin: "an admin",
};

const byAtThen = <T>(atOf: (item: T) => Date | null, keyOf: (item: T) => string) => (a: T, b: T) =>
  (atOf(a)?.getTime() ?? 0) - (atOf(b)?.getTime() ?? 0) || keyOf(a).localeCompare(keyOf(b));

/**
 * THE MESSAGE FOR CLAUDE'S DRAFT OF A NOTE ABOUT ONE PERSON (privacy v15:
 * "Once a week Claude may also draft a short note on how each person is
 * doing, using only the work they submitted and the feedback, ratings and
 * comments people on the team gave it"). The one builder for both drafts:
 * the end-of-week notes hand it one week, and the profile's "Draft a note
 * with Claude" every week of one run.
 *
 *  - ONLY SUBMITTED WEEKS. `weeks` holds the weeks the person submitted and
 *    has not had reopened since; anything else is never handed over, so
 *    there is no submission, no note.
 *  - ONLY WORK FROM THEIR MOMENT: an answer counted under version 13 and
 *    first written after the person agreed to version 15 (`from`); none, and
 *    nothing of the week goes.
 *  - THE TEAM'S WORDS ON IT: each piece of feedback on an answer that went,
 *    or on a week whose work went, as a comment with its writer's role ("their
 *    facilitator", "the programme's lead", "an admin"); each rating for the
 *    team of an answer that went, from 1 to 10 with its comment, by a number
 *    for its rater ("Rater 1", the same rater everywhere). A writer's words
 *    go only when written after THEIR version 15 moment (`writerFrom`).
 *    Feedback given before pieces existed goes as its levels, as before.
 *  - NOTHING ELSE: no survey or check-in, no session report, no grade of
 *    Claude's own, no register: nothing here reads them, and their gatherer
 *    imports none of their code.
 *  - NO NAME, ADDRESS OR ACCOUNT. Every free text is scrubbed (`scrubNames`)
 *    with `people`: the person "the fellow", everybody else on the run by
 *    what they are.
 *
 * `builtFrom` is everything that went, so a draft's "Built only from" is
 * what was sent, item for item.
 */
export function noteDraftInput(input: {
  programme: string;
  weeks: readonly NoteWeek[];
  answers: readonly CourseworkAnswer[];
  feedback: readonly NoteFeedback[];
  ratings: readonly NoteRating[];
  people: readonly NameToLabel[];
  /** The person's privacy v15 moment, or null: then nothing goes. */
  from: Date | null;
  /** Each feedback writer's and rater's own privacy v15 moment. */
  writerFrom: ReadonlyMap<string, Date | null>;
}): NoteDraftInput {
  const scrub = (text: string) => scrubNames(text, input.people);
  const oneLine = (text: string) => scrub(text).replace(/\s+/g, " ").trim();
  const theirs = (at: Date | null, uid: string) => cameAfter(at, input.from) && cameAfter(at, input.writerFrom.get(uid) ?? null);
  const going = input.answers.filter((answer) => answer.counted && cameAfter(answer.firstWrittenAt ?? null, input.from));
  const raterLabel = new Map<string, string>();
  const labelOf = (uid: string) => {
    if (!raterLabel.has(uid)) raterLabel.set(uid, `Rater ${raterLabel.size + 1}`);
    return raterLabel.get(uid) as string;
  };

  const lines: string[] = [];
  lines.push(`# The programme: ${scrub(input.programme)}`);
  lines.push(
    "Only the fellow's submitted work from after a certain date is shown, each piece under the question it answers, with what people on the team said about it. Anything earlier is left out on purpose, so a question with no answer here is not one they skipped.",
  );
  let sent = 0;
  const builtFrom: NoteSource[] = [];
  for (const { week, submittedAt } of [...input.weeks].sort((a, b) => a.week.weekNumber - b.week.weekNumber)) {
    const mine = week.questions
      .map((question) => ({ question, answer: going.find((answer) => answer.questionKey === question.key && answer.weekId === week.weekId) }))
      .filter((pair): pair is { question: CourseworkQuestion; answer: CourseworkAnswer } => pair.answer !== undefined);
    if (mine.length === 0) continue;
    const work = { written: 0, reflections: 0, boxes: 0 };
    const said: NoteSource[] = [];
    let levels = false;
    lines.push("", `# Week ${week.weekNumber}: ${scrub(week.title)}`);
    for (const { question, answer } of mine) {
      lines.push("", `## ${KIND_WORDS[question.kind]}: ${scrub(question.text)}`, scrub(answer.text));
      sent += 1;
      if (question.kind === "reflection") work.reflections += 1;
      else if (question.kind === "fillIn") work.boxes += 1;
      else work.written += 1;
      if (question.kind !== "written") continue;
      if (answer.levels.length > 0) {
        levels = true;
        lines.push(`Feedback given before, as levels on the course's rubric: ${answer.levels.map((level) => `${level.row}: ${level.level}`).join("; ")}`);
      }
      const pieces = input.feedback
        .filter((piece) => piece.weekId === week.weekId && piece.itemId === question.rowId && piece.text.trim() && theirs(piece.at, piece.byUid))
        .sort(byAtThen((piece) => piece.at, (piece) => piece.id));
      for (const piece of pieces) {
        lines.push(`Feedback from ${FEEDBACK_FROM[piece.role]}: ${oneLine(piece.text)}`);
        said.push({ kind: "feedback", weekNumber: week.weekNumber, byUid: piece.byUid, role: piece.role, on: "writtenAnswer", at: piece.at });
      }
      const ratings = input.ratings
        .filter((rating) => rating.weekId === week.weekId && rating.itemId === question.rowId && theirs(rating.at, rating.raterUid))
        .sort(byAtThen((rating) => rating.at, (rating) => rating.raterUid));
      for (const rating of ratings) {
        const label = labelOf(rating.raterUid);
        const comment = oneLine(rating.comment);
        const role = rating.role === "lead" ? "the programme's lead" : "an admin";
        lines.push(`${label} (${role}) rated it ${rating.rating} of 10${comment ? `: ${comment}` : "."}`);
        said.push({ kind: "rating", weekNumber: week.weekNumber, raterUid: rating.raterUid, role: rating.role, label, rating: rating.rating, comment: rating.comment.trim(), at: rating.at });
      }
    }
    const onTheWeek = input.feedback
      .filter((piece) => piece.weekId === week.weekId && piece.itemId === null && piece.text.trim() && theirs(piece.at, piece.byUid))
      .sort(byAtThen((piece) => piece.at, (piece) => piece.id));
    if (onTheWeek.length > 0) {
      lines.push("", "## Feedback on the week as a whole");
      for (const piece of onTheWeek) {
        lines.push(`From ${FEEDBACK_FROM[piece.role]}: ${oneLine(piece.text)}`);
        said.push({ kind: "feedback", weekNumber: week.weekNumber, byUid: piece.byUid, role: piece.role, on: "week", at: piece.at });
      }
    }
    builtFrom.push({ kind: "work", weekNumber: week.weekNumber, submittedAt, ...work });
    if (levels) builtFrom.push({ kind: "levels", weekNumber: week.weekNumber });
    builtFrom.push(...said);
  }
  const message = lines.join("\n");
  return {
    message,
    sent,
    fingerprint: fingerprintOf(message),
    builtFrom,
    raters: Object.fromEntries([...raterLabel].map(([uid, label]) => [label, uid])),
  };
}

/** Names back where Claude wrote "the fellow", for the admin's box. */
export function noteWithName(text: string, firstName: string): string {
  if (!firstName.trim()) return text;
  return text.replace(/\bThe fellow\b/g, firstName).replace(/\bthe fellow\b/g, firstName);
}

/** Names back where Claude wrote "Rater 1", for the admin's box. A label nobody holds any more reads "a rater". */
export function noteWithRaters(text: string, names: Readonly<Record<string, string>>): string {
  return text.replace(/\bRater (\d+)\b/g, (whole) => (Object.prototype.hasOwnProperty.call(names, whole) && names[whole] ? names[whole] : "a rater"));
}

/**
 * The labels in Claude's draft that it was never sent: a "Rater N" with no
 * rater behind it, or a "Fellow N" or "Group N", which no note's message
 * carries. A draft with any is refused rather than kept, so a label slip can
 * never put the wrong name in a note.
 */
export function noteLabelSlips(text: string, raters: Readonly<Record<string, string>>): string[] {
  const slips = new Set<string>();
  for (const [whole] of text.matchAll(/\b(?:Rater|Fellow|Group) \d+\b/g)) {
    if (whole.startsWith("Rater ") && Object.prototype.hasOwnProperty.call(raters, whole)) continue;
    slips.add(whole);
  }
  return [...slips];
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
