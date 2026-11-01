import { countWords } from "@/lib/firestore/worksheets";
import { normalizeGivenLevels, type GivenLevel } from "../rubric";

/**
 * A WEEK'S WRITTEN ANSWER, AS ONE PERSON'S ROW (boards wk-week, wk-review,
 * wk-feedback-phone; Q30 C, Q33, Q34 B).
 *
 * WHERE IT IS STORED. In `courseExerciseResponses`, the store a week's
 * answers already use, as an answer's row (no `kind`: `courseExercises.ts`,
 * "Two kinds of row"), addressed by `exerciseResponseId(runId, uid, weekId,
 * answerId)` where `answerId` is the Written answer block's id. Only routes
 * write it: the writer's own (`runs/[runId]/written-answers/[answerId]`) and
 * the reviewer's (`.../review`).
 *
 * COUNTED IN WORDS, NEVER CHARACTERS. A row a block week's written answer
 * stores always carries `words`, the count of what it holds, counted as
 * Worksheets count (`countWords`, imported, so the two can never differ).
 * Summer's answers have no `words`: `isWordCountedAnswer` is how a reader
 * that does not read the week tells the two apart, and every field summer's
 * rows hold keeps its meaning (`reviewStatus`, `seen` among it, is never
 * used for this).
 *
 * THE FIELDS ADDED, each written by one route:
 *  - `boxes`: an answer of labelled boxes (a one-page plan), box id to
 *    words; `text` holds an answer of one box. Never both.
 *  - `words`: the count of everything it holds.
 *  - `firstSentAt`: when it was FIRST sent, stored once and never moved:
 *    since weeks are submitted, the first time its week was submitted with
 *    words in it. `submittedAt` is stamped with it, as every reader of
 *    answers sent already reads (who finished counts it).
 *  - `editedAt`: the latest change after it was first sent.
 *  - `openedAt`, `openedByUid`: the lock an answer kept before weeks were
 *    submitted (Q33): set when one of its own reviewers first opened it on
 *    the review page, after which its writer could not change it. Nothing
 *    writes them now; reopening the week (`src/lib/courses/weekWork/`)
 *    clears both.
 *  - `reopenedAt`, `reopenedByUid`: the last time that lock was cleared,
 *    which the writer is told.
 *  - `feedback`: `{ levels, comment, byUid, sentAt }`. A level for each row
 *    of the course's rubric (with its descriptor, as given) and a short
 *    comment. Never a mark, a score or a total.
 *
 * "LATE" is never stored: it is worked out for staff from the first-sent
 * time and the group's own due moment (`isLate`, `due.ts`), and travels on
 * staff pages only.
 *
 * Pure: no reads, no clock.
 */

export { countWords };

/** The caps the routes hold an answer and a comment to. */
export const WRITTEN_ANSWER_LIMITS = {
  /** What one answer may hold in all, in characters: a storage bound far over any word range. */
  maxChars: 40_000,
  /** One labelled box. */
  boxChars: 10_000,
  /** A reviewer's comment, in words: "Short and specific beats long". */
  commentWords: 300,
  commentChars: 3_000,
} as const;

/** Is this stored row a block week's written answer (counted in words)? Summer's answers are not. */
export function isWordCountedAnswer(data: { words?: unknown } | null | undefined): boolean {
  return typeof data?.words === "number";
}

/** A stored instant, from a Timestamp or a Date, or null. */
export function instantOf(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  return stamp && typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

export type WrittenFeedback = {
  levels: GivenLevel[];
  comment: string;
  byUid: string;
  sentAt: Date | null;
};

/** The fields a written answer's row adds, read. */
export type WrittenAnswerRecord = {
  /** An answer of one box; "" for an answer in boxes. */
  text: string;
  /** An answer in labelled boxes, box id to words; null for an answer of one box. */
  boxes: Record<string, string> | null;
  words: number;
  firstSentAt: Date | null;
  editedAt: Date | null;
  openedAt: Date | null;
  openedByUid: string;
  /** When its writer last saved it (the row's `updatedAt`), or null. */
  savedAt: Date | null;
  reopenedAt: Date | null;
  reopenedByUid: string;
  feedback: WrittenFeedback | null;
};

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A stored row's written-answer fields, read. Never throws. */
export function readWrittenAnswer(data: Record<string, unknown>): WrittenAnswerRecord {
  let boxes: Record<string, string> | null = null;
  if (data.boxes && typeof data.boxes === "object" && !Array.isArray(data.boxes)) {
    boxes = {};
    for (const [id, value] of Object.entries(data.boxes as Record<string, unknown>)) {
      if (typeof value === "string") boxes[id] = value;
    }
  }
  const raw = data.feedback && typeof data.feedback === "object" ? (data.feedback as Record<string, unknown>) : null;
  const feedback: WrittenFeedback | null = raw
    ? {
        levels: normalizeGivenLevels(raw.levels),
        comment: str(raw.comment),
        byUid: str(raw.byUid),
        sentAt: instantOf(raw.sentAt),
      }
    : null;
  return {
    text: boxes ? "" : str(data.text),
    boxes,
    words: typeof data.words === "number" && Number.isFinite(data.words) && data.words >= 0 ? Math.floor(data.words) : 0,
    firstSentAt: instantOf(data.firstSentAt),
    editedAt: instantOf(data.editedAt),
    openedAt: instantOf(data.openedAt),
    openedByUid: str(data.openedByUid),
    savedAt: instantOf(data.updatedAt),
    reopenedAt: instantOf(data.reopenedAt),
    reopenedByUid: str(data.reopenedByUid),
    feedback: feedback && (feedback.levels.length > 0 || feedback.comment.trim()) ? feedback : null,
  };
}

/**
 * Where one person's answer stands:
 *  - `not-started`: no row, or nothing written;
 *  - `draft`: written, never sent;
 *  - `sent`: sent, and nobody who reviews it has opened it, so its writer
 *    can still change it;
 *  - `opened`: opened by one of its reviewers, locked, no feedback yet;
 *  - `feedback`: feedback sent.
 */
export type AnswerState = "not-started" | "draft" | "sent" | "opened" | "feedback";

export function answerState(record: WrittenAnswerRecord | null): AnswerState {
  if (!record) return "not-started";
  if (record.feedback) return "feedback";
  if (record.firstSentAt) return record.openedAt ? "opened" : "sent";
  return record.words > 0 ? "draft" : "not-started";
}

/** Sent and waiting for feedback: opened or not (an opened answer with no feedback still waits). */
export function waitsForFeedback(record: WrittenAnswerRecord | null): boolean {
  const state = answerState(record);
  return state === "sent" || state === "opened";
}

/** The words of an answer, every box together. */
export function answerWords(text: string, boxes: Record<string, string> | null): number {
  if (boxes) return Object.values(boxes).reduce((sum, value) => sum + countWords(value), 0);
  return countWords(text);
}

/**
 * The name of the answer in running text, from its part's title: "your
 * threat model" from "Your threat model, the week’s written answer", or
 * "your written answer" when the title does not name it that way.
 */
export function answerNameOf(partTitle: string): string {
  const named = partTitle
    .replace(/,\s*the week[’']s (?:one )?written (?:answer|piece)\s*$/i, "")
    .trim();
  if (/^your\s+\S/i.test(named) && named.length <= 80) return `your ${named.replace(/^your\s+/i, "")}`;
  return "your written answer";
}
