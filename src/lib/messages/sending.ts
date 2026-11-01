import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { GridRow } from "@/lib/audience/kind";
import type { AudienceWorld, Reached, Resolution } from "@/lib/audience/resolve";
import { parseTag, type Selection } from "@/lib/audience/tags";
import { MAX_NOTICE_RECIPIENTS } from "@/lib/email/noticeCaps";
import {
  MESSAGE_SENDS_COLLECTION,
  type MessageOutcome,
  type MessagePerson,
  type MessageTally,
} from "@/lib/firestore/messageSends";
import { signToken } from "@/lib/signedTokens";

/**
 * WHAT A SEND IN MESSAGES KEEPS AND ASKS, around the dispatch the send route
 * makes (`src/app/api/messages/route.ts`): the test it waits for, the caps it
 * claims, the record it leaves, and each unsubscribe link.
 *
 * ── A TEST FIRST, AS PUBLISH WAITS FOR ONE ──────────────────────────────────
 * "Send a test to me" sends the writer their own message and, when it reached
 * them, records the words it was made from (`recordMessageTest`). The send is
 * refused until the writer has such a test of the words they are sending:
 * changing the subject or the message needs a fresh one. A test this copy of
 * the site held, or one to an address on the do-not-email list, reached
 * nobody and is not recorded, which is Publish's rule
 * (`src/lib/courses/allocationPublish.ts`). The record is one document per
 * writer in the estate's send bookkeeping (`courseNudges`), beside Publish's
 * own, and holds a fingerprint of the words, never the words.
 *
 * ── THE CAPS ────────────────────────────────────────────────────────────────
 * Every send claims the notice lane's two windows (`reserveNoticeSlots`):
 * three an hour per writer and audience, ten a day per audience whoever
 * writes. The audience is the choice of tags, canonically spelled and hashed,
 * so the same tags chosen in any order are one audience. A message by their
 * settings claims them too: nobody needs one list written to eleven times a
 * day. And over three hundred emails one send is refused whole, never
 * trimmed: a partial send looks successful, and its retry mails the same
 * people again.
 */

/** Sends an hour per writer and audience, and a day per audience: the notice lane's. */
export const MESSAGES_PER_HOUR = 3;
export const MESSAGES_PER_DAY = 10;

/** "Send a test to me", per writer, an hour. */
export const MESSAGE_TESTS_PER_HOUR = 10;

/**
 * The emails one send may make, counted in messages, because a member whose
 * settings send to two addresses takes two. Over it the send is refused
 * whole. The notice lane's own ceiling (`MAX_NOTICE_RECIPIENTS`), whose
 * arithmetic against the request's time is in `src/lib/email/dispatch.ts`.
 */
export const MAX_MESSAGE_EMAILS = MAX_NOTICE_RECIPIENTS;

/** Where the estate keeps its send bookkeeping: the caps' counters, Publish's test, and this. */
const BOOKKEEPING = "courseNudges";

const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** The words a test was made from, as one fingerprint: equal exactly when the subject and the message are. */
export function wordingOf(subject: string, message: string): string {
  return sha256(JSON.stringify(["message", subject, message]));
}

/** Where a writer's last test is recorded: also the test email's reference, so the send log finds it. */
export const testDocId = (uid: string) => `messagetest__${uid}`;

/** Whether this writer's last test that reached them was of these words: none sent, of other words, or of these. */
export async function testStandingOf(db: Firestore, uid: string, wording: string): Promise<"none" | "stale" | "fresh"> {
  const snap = await db.collection(BOOKKEEPING).doc(testDocId(uid)).get();
  const stored = snap.exists ? snap.data()?.wording : undefined;
  if (typeof stored !== "string") return "none";
  return stored === wording ? "fresh" : "stale";
}

/** Record a test that reached the writer, and the words it was made from. */
export async function recordMessageTest(db: Firestore, uid: string, wording: string): Promise<void> {
  await db.collection(BOOKKEEPING).doc(testDocId(uid)).set({
    kind: "message-test",
    byUid: uid,
    at: FieldValue.serverTimestamp(),
    wording,
  });
}

/** One audience, whichever order its tags were chosen in: the caps' key. */
export function audienceKeyOf(selection: Selection): string {
  const spelled = JSON.stringify([[...selection.include].sort(), [...selection.exclude].sort()]);
  return sha256(spelled).slice(0, 24);
}

/** The cap windows a send claims, for `reserveNoticeSlots`. */
export function capWindows(writerUid: string, selection: Selection, hourMs: number, dayMs: number) {
  const audience = audienceKeyOf(selection);
  return {
    hour: { key: `message__${audience}__${writerUid}`, limit: MESSAGES_PER_HOUR, windowMs: hourMs },
    day: { key: `messageday__${audience}`, limit: MESSAGES_PER_DAY, windowMs: dayMs },
  };
}

/** The people a resolution would email, and how many messages that is. */
export function emailedOf(resolution: Resolution): { people: Reached[]; messages: number } {
  const people = resolution.people.filter((person) => person.leftOut === null && person.addresses.length > 0);
  return { people, messages: people.reduce((n, person) => n + person.addresses.length, 0) };
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** The tags as the writer saw them, in the order chosen. */
export type RecordedTag = { id: string; label: string; sign: "include" | "exclude" };

/** The tags of a selection with the words the picker showed for each: a tag's chip, a person's name. */
export function recordedTags(world: AudienceWorld, selection: Selection): RecordedTag[] {
  const labelOf = (id: string): string => {
    const tag = parseTag(id);
    if (tag?.kind === "person") return world.nameable.get(tag.uid) ?? id;
    return world.tags.find((each) => each.id === id)?.label ?? id;
  };
  return [
    ...selection.include.map((id): RecordedTag => ({ id, label: labelOf(id), sign: "include" })),
    ...selection.exclude.map((id): RecordedTag => ({ id, label: labelOf(id), sign: "exclude" })),
  ];
}

/**
 * The record of a send, written before the first message goes. Counts, the
 * tags, the class per person and why each person was left out, by account id;
 * never an address, a guest's key or the message itself.
 */
export async function startMessageRecord(
  db: Firestore,
  args: {
    writerUid: string;
    tags: RecordedTag[];
    resolution: Resolution;
    subject: string;
    postedUpdateId: string | null;
  },
): Promise<string> {
  const { resolution } = args;
  const ref = db.collection(MESSAGE_SENDS_COLLECTION).doc();
  const people: MessagePerson[] = resolution.people.map((person) => ({
    uid: person.uid,
    kind: person.kind,
    leftOut: person.leftOut,
    outcome: null,
  }));
  await ref.set({
    writerUid: args.writerUid,
    tags: args.tags,
    // The same ids as plain strings, so a send can be found by a tag it was for.
    tagIds: args.tags.map((tag) => tag.id),
    mode: resolution.mode,
    row: resolution.mode === "grid" ? resolution.row : null,
    subject: args.subject,
    people,
    counts: {
      people: resolution.counts.people,
      emailed: resolution.counts.emailed,
      leftOut: resolution.counts.leftOut,
      sent: 0,
      held: 0,
      suppressed: 0,
      failed: 0,
      pushed: 0,
    },
    reasons: Object.fromEntries(resolution.reasons.map((each) => [each.reason, each.count])),
    postedUpdateId: args.postedUpdateId,
    sentAt: FieldValue.serverTimestamp(),
    settled: false,
  });
  return ref.id;
}

/**
 * What the emails did, once the last has gone: the tally, each person's
 * outcome by their place in the list, and how many phones a notice to one
 * group reached (`pushed`, 0 for every other send).
 */
export async function settleMessageRecord(
  db: Firestore,
  id: string,
  resolution: Resolution,
  outcomes: ReadonlyMap<string, MessageOutcome>,
  tally: MessageTally,
  pushed: number,
): Promise<void> {
  const people: MessagePerson[] = resolution.people.map((person) => ({
    uid: person.uid,
    kind: person.kind,
    leftOut: person.leftOut,
    outcome: outcomes.get(person.key) ?? null,
  }));
  await db.collection(MESSAGE_SENDS_COLLECTION).doc(id).update({
    people,
    "counts.sent": tally.sent,
    "counts.held": tally.held,
    "counts.suppressed": tally.suppressed,
    "counts.failed": tally.failed,
    "counts.pushed": pushed,
    settled: true,
  });
}

// ---------------------------------------------------------------------------
// Unsubscribing from the row
// ---------------------------------------------------------------------------

/** Same lifetime the newsletter and the event announcement give their links. */
const UNSUB_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

/**
 * The link at the foot of a message by their settings, for one person: an
 * account's token names the account, so one click switches the row off for
 * every address it has; a guest's names their address, the only handle they
 * have. Either way it names the row the message read, and nothing else.
 */
export function unsubscribeUrlFor(person: Pick<Reached, "uid" | "addresses">, row: GridRow): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const token = person.uid
    ? signToken({ s: "unsubscribe", uid: person.uid, c: row }, UNSUB_TOKEN_TTL_SECONDS)
    : signToken({ s: "unsubscribe", email: person.addresses[0] ?? "", c: row }, UNSUB_TOKEN_TTL_SECONDS);
  return `${appUrl}/api/unsubscribe?t=${encodeURIComponent(token)}`;
}
