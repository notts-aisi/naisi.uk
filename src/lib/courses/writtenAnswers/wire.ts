import type { GivenLevel } from "../rubric";
import type { WrittenAnswerRecord } from "./model";

/**
 * A WRITTEN ANSWER AS IT TRAVELS TO THE PERSON WHO WROTE IT (the week page,
 * through my-exercises and the writer's own route). It rides on
 * `ExerciseResponseWire.written`, present only on a block week's written
 * answer. Its `feedback` is feedback given before it became a signed
 * comment; the week page draws every piece from the overview's own.
 *
 * NEVER "LATE": whether it was sent after the due time is shown to staff
 * only (Q33), and is not a field here. Names are the first names people go
 * by, never an address.
 */
export type WrittenAnswerWire = {
  /** An answer in labelled boxes, box id to words; null for an answer of one box (its words are `text`). */
  boxes: Record<string, string> | null;
  words: number;
  /** ISO 8601: when it was first sent, never moved; null for a draft. */
  firstSentAt: string | null;
  /** ISO 8601: the latest change after it was first sent, or null. */
  editedAt: string | null;
  /** ISO 8601: when its writer last saved it, or null. */
  savedAt: string | null;
  /** Locked by one of its reviewers opening it, or null while its writer can change it. */
  opened: { at: string; byName: string } | null;
  /** The last "Reopen for edits", which its writer is told, or null. */
  reopened: { at: string; byName: string } | null;
  feedback: {
    levels: GivenLevel[];
    comment: string;
    byName: string;
    sentAt: string | null;
  } | null;
};

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/**
 * The wire for one record. `firstNames` maps a uid to the first name they go
 * by; a uid it does not hold reads as "Your facilitator", never as an id.
 */
export function writtenAnswerWire(record: WrittenAnswerRecord, firstNames: ReadonlyMap<string, string>): WrittenAnswerWire {
  const nameOf = (uid: string) => (uid && firstNames.get(uid)) || "Your facilitator";
  return {
    boxes: record.boxes,
    words: record.words,
    firstSentAt: iso(record.firstSentAt),
    editedAt: iso(record.editedAt),
    savedAt: iso(record.savedAt),
    opened: record.openedAt ? { at: record.openedAt.toISOString(), byName: nameOf(record.openedByUid) } : null,
    reopened: record.reopenedAt ? { at: record.reopenedAt.toISOString(), byName: nameOf(record.reopenedByUid) } : null,
    feedback: record.feedback
      ? {
          levels: record.feedback.levels,
          comment: record.feedback.comment,
          byName: nameOf(record.feedback.byUid),
          sentAt: iso(record.feedback.sentAt),
        }
      : null,
  };
}

/** The uids a record names, whose first names its wire needs. */
export function namedIn(record: WrittenAnswerRecord): string[] {
  return [record.openedByUid, record.reopenedByUid, record.feedback?.byUid ?? ""].filter(Boolean);
}
