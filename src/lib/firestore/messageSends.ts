import { isGridRow, type GridRow } from "@/lib/audience/kind";
import { COURSE_UPDATE_LIMITS } from "./courseUpdates";

/**
 * `messageSends/{id}`: one message written in Messages and sent, as a record
 * of who wrote it, who it was for and how each person was reached or why they
 * were left out (docs/messages.md). One document per send; the id is
 * Firestore's own.
 *
 * WRITTEN ONLY ON THE SERVER, by the send route
 * (`src/app/api/messages/route.ts`) on the Admin SDK, and read only on the
 * server, by Messages' Sent (`src/lib/messages/sent.ts`), which names the
 * people for the person reading: nothing in the browser reads it, and
 * `firestore.rules` refuses every browser, admins included.
 *
 * WHAT IT KEEPS, and what it never does:
 *  - who wrote it (`writerUid`), the subject and when (`sentAt`);
 *  - the tags, included and left out, each with the words the writer saw,
 *    and their ids again as plain strings (`tagIds`), so a send can be found
 *    by a tag it was for;
 *  - how it went: as a programme notice or by the one row of the settings
 *    grid the writer chose (`mode`, `row`);
 *  - each person it reached, by account id, with how a message would reach
 *    them, why they were left out if they were, and what became of the email
 *    once it was sent (`people`). A guest or a walk-in is kept as having no
 *    account, with nothing that says who;
 *  - the counts, and how many were left out for each reason.
 *
 * NEVER AN ADDRESS, and never the message itself: the email was the message,
 * and the record is of who it reached.
 *
 * It is written unsettled before the first message goes and settled after
 * the last, so a send that was cut off says so rather than claiming counts it
 * never reached.
 */

export const MESSAGE_SENDS_COLLECTION = "messageSends";

/**
 * The longest subject and message. The same as an update's title and
 * message, because a message posted on a programme's page as well is kept
 * there as one (`src/lib/firestore/courseUpdates.ts`), and those are the
 * staff email's own limits.
 */
export const MESSAGE_LIMITS = {
  subject: COURSE_UPDATE_LIMITS.title,
  message: COURSE_UPDATE_LIMITS.message,
} as const;

/** How the email reached one person, once it was sent. */
export type MessageOutcome = "sent" | "held" | "suppressed" | "failed";

/** One person a message reached. No address, and no name: an account id or nothing. */
export type MessagePerson = {
  /** The account, or null for a guest or a walk-in. */
  uid: string | null;
  /** How a message would reach them: as a notice, or by their settings. */
  kind: "notice" | "grid";
  /** Why they were left out (`LeftOutReason` in src/lib/audience/words.ts), or null. */
  leftOut: string | null;
  /** What became of the email, once the send settled; null for somebody left out, or before it settled. */
  outcome: MessageOutcome | null;
};

/** What a send's emails did, in people. */
export type MessageTally = { sent: number; held: number; suppressed: number; failed: number };

// ---------------------------------------------------------------------------
// Reading a record back (Sent)
// ---------------------------------------------------------------------------

/** One tag of a send, as the writer saw it. */
export type MessageSendTag = { id: string; label: string; sign: "include" | "exclude" };

/** A record as Sent reads it (`src/lib/messages/sent.ts`). */
export type MessageSendDoc = {
  id: string;
  writerUid: string;
  tags: MessageSendTag[];
  mode: "notice" | "grid";
  /** The row a message by their settings read; null for a notice. */
  row: GridRow | null;
  subject: string;
  people: MessagePerson[];
  counts: {
    people: number;
    emailed: number;
    leftOut: number;
    sent: number;
    held: number;
    suppressed: number;
    failed: number;
    /** Phone notifications handed to a device, for a notice to one group; 0 for every other send. */
    pushed: number;
  };
  /** The update it was posted as on a programme's page, or null. */
  postedUpdateId: string | null;
  sentAt: Date | null;
  /** False while the emails go, and for good when a send was cut off. */
  settled: boolean;
};

type Raw = Record<string, unknown>;

const OUTCOMES: readonly MessageOutcome[] = ["sent", "held", "suppressed", "failed"];

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

const isRecord = (value: unknown): value is Raw => Boolean(value) && typeof value === "object" && !Array.isArray(value);

function tagOf(value: unknown): MessageSendTag | null {
  if (!isRecord(value)) return null;
  const id = typeof value.id === "string" ? value.id : "";
  const sign = value.sign;
  if (!id || (sign !== "include" && sign !== "exclude")) return null;
  return { id, label: typeof value.label === "string" ? value.label : "", sign };
}

function personOf(value: unknown): MessagePerson | null {
  if (!isRecord(value)) return null;
  const kind = value.kind;
  if (kind !== "notice" && kind !== "grid") return null;
  return {
    uid: typeof value.uid === "string" && value.uid ? value.uid : null,
    kind,
    leftOut: typeof value.leftOut === "string" && value.leftOut ? value.leftOut : null,
    outcome: OUTCOMES.includes(value.outcome as MessageOutcome) ? (value.outcome as MessageOutcome) : null,
  };
}

/**
 * A stored record, or null for one that cannot say who it was for: no
 * writer, no tag it can read, or a class it does not know. A null record is
 * shown to nobody, which is the safe direction for a send nobody can place.
 *
 * Its tags are every id it holds, in `tags` and in `tagIds` alike, so a
 * record whose two lists disagree is read as being for all of them: Sent
 * asks the reader's right to every one (`src/lib/messages/sent.ts`).
 */
export function normalizeMessageSend(id: string, data: Raw): MessageSendDoc | null {
  const writerUid = typeof data.writerUid === "string" ? data.writerUid : "";
  if (!writerUid) return null;
  const mode = data.mode;
  if (mode !== "notice" && mode !== "grid") return null;
  const row = data.row;
  const tags = (Array.isArray(data.tags) ? data.tags : []).map(tagOf);
  if (tags.length === 0 || tags.some((tag) => tag === null)) return null;
  const known = tags as MessageSendTag[];
  for (const extra of Array.isArray(data.tagIds) ? data.tagIds : []) {
    if (typeof extra !== "string" || !extra) return null;
    if (!known.some((tag) => tag.id === extra)) known.push({ id: extra, label: "", sign: "include" });
  }
  const people = (Array.isArray(data.people) ? data.people : []).map(personOf);
  if (people.some((person) => person === null)) return null;
  const counts = isRecord(data.counts) ? data.counts : {};
  return {
    id,
    writerUid,
    tags: known,
    mode,
    row: mode === "grid" && isGridRow(row) ? row : null,
    subject: typeof data.subject === "string" ? data.subject : "",
    people: people as MessagePerson[],
    counts: {
      people: count(counts.people),
      emailed: count(counts.emailed),
      leftOut: count(counts.leftOut),
      sent: count(counts.sent),
      held: count(counts.held),
      suppressed: count(counts.suppressed),
      failed: count(counts.failed),
      pushed: count(counts.pushed),
    },
    postedUpdateId: typeof data.postedUpdateId === "string" && data.postedUpdateId ? data.postedUpdateId : null,
    sentAt: tsToDate(data.sentAt),
    settled: data.settled === true,
  };
}
