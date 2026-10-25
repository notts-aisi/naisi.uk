import { isAddressableId } from "@/lib/addressableId";
import { COURSE_UPDATE_LIMITS, COURSE_UPDATE_TO, type CourseUpdateTo } from "@/lib/firestore/courseUpdates";
import { REFUSAL, tooLongWords } from "./words";

/**
 * THE BODY OF A PRESS ON THE UPDATES ROUTE, checked before anything is read.
 *
 *   { to, groupId?, title, message, email, emailCount?, test? }
 *
 * `to` is "everyone", "group" (with `groupId`) or "facilitators". `email` is
 * the "Also email it" switch, and `emailCount` the number its button showed:
 * the press is refused when that is no longer who the email would reach.
 * `test: true` is "Send a test to me", which posts nothing.
 *
 * THE TITLE AND THE MESSAGE ARE THE STAFF EMAIL'S SUBJECT AND BODY, held to
 * the same rules as `parseStaffMessage` in
 * `src/lib/email/courseFacilitatorEmails.ts`: the same limits, a title of one
 * line, a message with its line breaks made `\n` and trimmed. The sentences
 * are the composer's own words ("title", not "subject").
 * `tests/course-hub-updates-email.test.mjs` runs both over the same inputs
 * and fails when they disagree about one.
 */

export type UpdatePost = {
  to: CourseUpdateTo;
  groupId: string | null;
  title: string;
  message: string;
  /** "Also email it". Always false on a test, which emails the presser alone. */
  email: boolean;
  /** The number on the button; 0 when nothing is to be emailed. */
  emailCount: number;
  test: boolean;
};

export type ParsedUpdatePost = { ok: true; value: UpdatePost } | { ok: false; error: string };

export function parseUpdatePost(raw: unknown): ParsedUpdatePost {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: REFUSAL.body };
  const b = raw as Record<string, unknown>;

  if (b.test !== undefined && typeof b.test !== "boolean") return { ok: false, error: REFUSAL.test };
  const test = b.test === true;

  const to = b.to;
  if (typeof to !== "string" || !(COURSE_UPDATE_TO as readonly string[]).includes(to)) {
    return { ok: false, error: REFUSAL.to };
  }
  const audience = to as CourseUpdateTo;
  let groupId: string | null = null;
  if (audience === "group") {
    if (typeof b.groupId !== "string" || !isAddressableId(b.groupId)) return { ok: false, error: REFUSAL.group };
    groupId = b.groupId;
  }

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return { ok: false, error: REFUSAL.title };
  if (/[\r\n]/.test(title)) return { ok: false, error: REFUSAL.titleLine };
  if (title.length > COURSE_UPDATE_LIMITS.title) {
    return { ok: false, error: tooLongWords("title", COURSE_UPDATE_LIMITS.title) };
  }

  const message = typeof b.message === "string" ? b.message.replace(/\r\n/g, "\n").trim() : "";
  if (!message) return { ok: false, error: REFUSAL.message };
  if (message.length > COURSE_UPDATE_LIMITS.message) {
    return { ok: false, error: tooLongWords("message", COURSE_UPDATE_LIMITS.message) };
  }

  if (test) {
    return { ok: true, value: { to: audience, groupId, title, message, email: false, emailCount: 0, test } };
  }

  if (typeof b.email !== "boolean") return { ok: false, error: REFUSAL.email };
  let emailCount = 0;
  if (b.email) {
    const n = b.emailCount;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 0) return { ok: false, error: REFUSAL.emailCount };
    emailCount = n;
  }
  return {
    ok: true,
    value: { to: audience, groupId, title, message, email: b.email, emailCount, test },
  };
}
