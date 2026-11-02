import type { GridRow } from "@/lib/audience/kind";
import { parseAudienceBody, type Selection } from "@/lib/audience/tags";
import { MESSAGE_LIMITS } from "@/lib/firestore/messageSends";
import { MESSAGE_REFUSAL, tooLongWords } from "./words";

/**
 * THE BODY OF A PRESS IN MESSAGES, checked before anything is read.
 *
 *   send: { include, exclude, row, subject, message, count, post }
 *   test: { subject, message }
 *
 * `include`, `exclude` and `row` are the picker's own (`parseAudienceBody`),
 * so the send resolves exactly the choice the picker counted. `count` is the
 * number on the button, the people it would email: the send is refused when
 * that is no longer who it reaches. `post` is "Also post it on the
 * programme's page".
 *
 * THE SUBJECT AND THE MESSAGE are an update's title and message
 * (`src/lib/courses/updates/parse.ts`), held to the same rules: the same
 * limits, a subject of one line, a message with its line breaks made `\n` and
 * trimmed. A message posted on a programme's page is kept there as an update,
 * so it has to be one that could have been written there.
 */

export type MessageWords = { subject: string; message: string };

export type MessageSend = MessageWords & {
  selection: Selection;
  /** The row a message by their settings reads; null for the one the tags suggest. */
  row: GridRow | null;
  /** The number on the button: the people it would email. */
  count: number;
  /** Also post it on the programme's page. */
  post: boolean;
};

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function wordsOf(b: Record<string, unknown>): Parsed<MessageWords> {
  const subject = typeof b.subject === "string" ? b.subject.trim() : "";
  if (!subject) return { ok: false, error: MESSAGE_REFUSAL.subject };
  if (/[\r\n]/.test(subject)) return { ok: false, error: MESSAGE_REFUSAL.subjectLine };
  if (subject.length > MESSAGE_LIMITS.subject) return { ok: false, error: tooLongWords("subject", MESSAGE_LIMITS.subject) };
  const message = typeof b.message === "string" ? b.message.replace(/\r\n/g, "\n").trim() : "";
  if (!message) return { ok: false, error: MESSAGE_REFUSAL.message };
  if (message.length > MESSAGE_LIMITS.message) return { ok: false, error: tooLongWords("message", MESSAGE_LIMITS.message) };
  return { ok: true, value: { subject, message } };
}

const isRecord = (raw: unknown): raw is Record<string, unknown> =>
  Boolean(raw) && typeof raw === "object" && !Array.isArray(raw);

/** "Send a test to me": the words, and nothing about who it is for. */
export function parseMessageTest(raw: unknown): Parsed<MessageWords> {
  if (!isRecord(raw)) return { ok: false, error: MESSAGE_REFUSAL.body };
  return wordsOf(raw);
}

/** The send: the picker's choice, the words, the number on the button and the post switch. */
export function parseMessageSend(raw: unknown): Parsed<MessageSend> {
  if (!isRecord(raw)) return { ok: false, error: MESSAGE_REFUSAL.body };
  const audience = parseAudienceBody(raw);
  if (!audience.ok) return { ok: false, error: MESSAGE_REFUSAL.body };
  const words = wordsOf(raw);
  if (!words.ok) return words;
  const count = raw.count;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 0) return { ok: false, error: MESSAGE_REFUSAL.count };
  if (raw.post !== undefined && typeof raw.post !== "boolean") return { ok: false, error: MESSAGE_REFUSAL.post };
  return {
    ok: true,
    value: { ...words.value, selection: audience.selection, row: audience.row, count, post: raw.post === true },
  };
}
