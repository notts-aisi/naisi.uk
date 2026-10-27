/**
 * `courseGroupNotes/{id}`: a note one of a group's facilitators writes for
 * the others (C30, board wk-fac-group's "Notes for you and Sofia"): what went
 * well, who needs a nudge. One document per note; the id is Firestore's own.
 *
 * WHO READS IT: the group's facilitators, the lead of the programme that
 * names the group's run, and admins. Nobody in the group, and no facilitator
 * of another group. It is not a register note: those are about a named person
 * or one session and stay the group's facilitators' and admins' alone.
 *
 * WRITTEN AND READ ONLY ON THE SERVER. The one writer is the notes route
 * (`src/app/api/courses/groups/[groupId]/notes/route.ts`), on the Admin SDK,
 * and it takes a note only from a live facilitator of the group. Every read
 * goes through `src/lib/courses/groupNotes/readers.ts`, called by pages that
 * have already decided their reader may see the group's notes.
 * `firestore.rules` refuses every browser, admins included. So this file
 * holds the shape, the limit and the normaliser, and nothing that reads or
 * writes.
 *
 * THE WRITER IS A UID, and only a uid: the name a note is shown under is
 * worked out when it is read, from the writer's own account.
 *
 * WHAT TAKES IT AWAY: destroying the run (`src/lib/firestore/courseDeletion.ts`)
 * deletes every note of its groups, and deleting the writer's account
 * (`src/lib/firestore/accountDeletion.ts`) deletes every note they wrote.
 *
 * Pure, with no imports, so the note box in the browser reads its limit here.
 */

export const COURSE_GROUP_NOTES_COLLECTION = "courseGroupNotes";

/** The longest note, in characters, counted as the box counts them. */
export const COURSE_GROUP_NOTE_LIMITS = {
  body: 2000,
} as const;

export type CourseGroupNoteDoc = {
  id: string;
  runId: string;
  groupId: string;
  /** The facilitator who wrote it. */
  authorUid: string;
  /** Plain text, `\n` between lines. Never markup: every page shows it as text. */
  body: string;
  createdAt: Date | null;
};

type Raw = Record<string, unknown>;

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

/**
 * A stored note, or null for a row that cannot say whose group it is about
 * or holds no words. A null row is shown to nobody, which is the safe
 * direction for a row nobody can place.
 */
export function normalizeCourseGroupNote(id: string, data: Raw): CourseGroupNoteDoc | null {
  const runId = typeof data.runId === "string" ? data.runId : "";
  const groupId = typeof data.groupId === "string" ? data.groupId : "";
  const body = typeof data.body === "string" ? data.body : "";
  if (!runId || !groupId || !body.trim()) return null;
  return {
    id,
    runId,
    groupId,
    authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
    body,
    createdAt: tsToDate(data.createdAt),
  };
}
