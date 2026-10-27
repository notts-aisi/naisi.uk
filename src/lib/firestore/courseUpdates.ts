/**
 * `courseUpdates/{id}`: an update somebody running a course run wrote to the
 * people on it (Q18). It is kept on the programme's page for the people it
 * is to, and, when its writer chose, emailed to them too. One document per
 * update; the id is Firestore's own.
 *
 * WRITTEN AND READ ONLY ON THE SERVER. The one writer is the updates route
 * (`src/app/api/courses/runs/[runId]/updates/route.ts`), on the Admin SDK,
 * and every read goes through `src/lib/courses/updates/readers.ts`, which
 * decides who is shown which update. `firestore.rules` refuses every browser,
 * admins included. So this file holds the shape, the limits and the
 * normaliser, and nothing that reads or writes.
 *
 * WHO IT IS TO is two fields, `to` and `groupId`:
 *  - "everyone": the people taking part in the run;
 *  - "group": the people in one of its groups (`groupId`);
 *  - "facilitators": the facilitators of the run's groups.
 *
 * THE WRITER IS A UID, and only a uid. The name an update is shown under is
 * worked out when it is read, from the writer's own account, as every other
 * page of a run names people, so a name changed on a profile changes here
 * too. An update whose writer's account has been deleted is still shown to
 * the people it was to, under the words in `src/lib/courses/updates/words.ts`.
 *
 * WHAT THE EMAIL DID is kept beside the update: `null` when it was posted
 * without one, otherwise how many it was meant for and what became of each.
 * It is written unsettled before the first message goes and settled after
 * the last, so an update whose send was cut off says so, rather than claiming
 * a count it never reached.
 *
 * Deleting a run deletes its updates (`src/lib/firestore/courseDeletion.ts`).
 */

export const COURSE_UPDATES_COLLECTION = "courseUpdates";

export type CourseUpdateTo = "everyone" | "group" | "facilitators";

export const COURSE_UPDATE_TO: readonly CourseUpdateTo[] = ["everyone", "group", "facilitators"];

/**
 * The longest title and message. They are the staff email's own subject and
 * body limits (`COURSE_STAFF_EMAIL_LIMITS` in
 * `src/lib/email/courseFacilitatorEmails.ts`), because an update's title is
 * the email's subject and its message is the email's body. That module is
 * server-only, so a composer in the browser cannot import its numbers; these
 * are a copy, and `tests/course-hub-updates-email.test.mjs` fails when the two
 * differ.
 */
export const COURSE_UPDATE_LIMITS = {
  title: 150,
  message: 4000,
} as const;

/** What the email beside an update did. Counts only, never an address. */
export type CourseUpdateEmail = {
  /** How many people the press said it would email: the number on its button. */
  planned: number;
  /** Handed to the mail provider. */
  sent: number;
  /** Held, because this copy of the site may not write to the address. */
  held: number;
  /** Stopped by the do-not-email list. */
  suppressed: number;
  /** The send threw. */
  failed: number;
  /** False from the write before the first message until the write after the last. */
  settled: boolean;
};

export type CourseUpdateDoc = {
  id: string;
  runId: string;
  to: CourseUpdateTo;
  /** The group an update to one group is to; null for everyone and for the facilitators. */
  groupId: string | null;
  /** One line, the email's subject when it was emailed. */
  title: string;
  /** Plain text, `\n` between lines. Never markup: every page shows it as text. */
  message: string;
  authorUid: string;
  postedAt: Date | null;
  email: CourseUpdateEmail | null;
};

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

function count(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;
}

function emailOf(value: unknown): CourseUpdateEmail | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Raw;
  return {
    planned: count(raw.planned),
    sent: count(raw.sent),
    held: count(raw.held),
    suppressed: count(raw.suppressed),
    failed: count(raw.failed),
    settled: raw.settled === true,
  };
}

/**
 * A stored update, or null for a row that cannot say who it is to: an
 * unknown `to`, an update to a group that names none, a missing run, title
 * or message. A null row is shown to nobody, which is the safe direction for
 * a row nobody can place.
 */
export function normalizeCourseUpdate(id: string, data: Raw): CourseUpdateDoc | null {
  const to = data.to;
  if (to !== "everyone" && to !== "group" && to !== "facilitators") return null;
  const groupId = typeof data.groupId === "string" && data.groupId ? data.groupId : null;
  if (to === "group" && !groupId) return null;
  const runId = typeof data.runId === "string" ? data.runId : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const message = typeof data.message === "string" ? data.message : "";
  if (!runId || !title || !message.trim()) return null;
  return {
    id,
    runId,
    to,
    groupId: to === "group" ? groupId : null,
    title,
    message,
    authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
    postedAt: tsToDate(data.postedAt),
    email: emailOf(data.email),
  };
}
