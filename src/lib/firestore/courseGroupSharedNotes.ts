/**
 * `courseGroupSharedNotes/{id}`: a note somebody in a group writes for the
 * rest of it (C29, board wk-week-phone's "Notes shared with your group"). One
 * document per note; the id is Firestore's own.
 *
 * A NOTE BELONGS TO ITS GROUP, and remembers the week whose page it was
 * written on. Every week's page of the group shows all of the group's notes,
 * newest first, each with "Week 3:" before its words, as the board draws it.
 *
 * WHO WRITES: the group's people (a learner placed in it, told by Publish,
 * not left) and its live facilitators. WHO READS: those same people, the lead
 * of the programme that names the run, and admins. Nobody else: not another
 * group, not the run's track leads, not a programme's reviewers. It is not a
 * register note, and not the notes the group's facilitators keep for each
 * other (C30), which nobody in the group reads.
 *
 * Only a run that places people in groups keeps these notes
 * (`runSharesGroupNotes`). A run anyone can join keeps the run's comments on
 * each reading instead, as it always has.
 *
 * WRITTEN AND READ ONLY ON THE SERVER. The writers are the shared notes
 * routes (`src/app/api/courses/groups/[groupId]/shared-notes/`), on the Admin
 * SDK: one adds a note, one deletes a note for the person who wrote it. Every
 * read goes through `src/lib/courses/sharedNotes/readers.ts`, which asks who
 * the reader is first. `firestore.rules` refuses every browser, admins
 * included. So this file holds the shape, the limits, the normaliser and the
 * run's one question, and nothing that reads or writes.
 *
 * THE WRITER IS A UID, and only a uid: the name a note is shown under is
 * worked out when it is read, from the writer's own account.
 *
 * WHAT TAKES IT AWAY: its writer deleting it, destroying the run
 * (`src/lib/firestore/courseDeletion.ts`), and deleting the writer's account
 * (`src/lib/firestore/accountDeletion.ts`). Leaving the run does not: a note
 * already shared stays with the group, as the person's marks stay on its
 * register.
 *
 * Pure, with no imports, so the note box in the browser reads its limit here.
 */

export const COURSE_GROUP_SHARED_NOTES_COLLECTION = "courseGroupSharedNotes";

/**
 * The longest note, in characters, counted as the box counts them: the
 * length of a comment on a reading (`PROGRESS_LIMITS.publicComment`), which
 * these notes take the place of on a run with groups.
 */
export const COURSE_GROUP_SHARED_NOTE_LIMITS = {
  body: 1000,
} as const;

export type CourseGroupSharedNoteDoc = {
  id: string;
  runId: string;
  groupId: string;
  /** The taught week whose page it was written on, 1 and up. */
  weekNumber: number;
  /** Who wrote it. */
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
 * A stored note, or null for a row that cannot say whose group it is in,
 * which week it is about, or holds no words. A null row is shown to nobody,
 * which is the safe direction for a row nobody can place.
 */
export function normalizeCourseGroupSharedNote(id: string, data: Raw): CourseGroupSharedNoteDoc | null {
  const runId = typeof data.runId === "string" ? data.runId : "";
  const groupId = typeof data.groupId === "string" ? data.groupId : "";
  const body = typeof data.body === "string" ? data.body : "";
  const weekNumber = typeof data.weekNumber === "number" && Number.isInteger(data.weekNumber) ? data.weekNumber : 0;
  if (!runId || !groupId || !body.trim() || weekNumber < 1) return null;
  return {
    id,
    runId,
    groupId,
    weekNumber,
    authorUid: typeof data.authorUid === "string" ? data.authorUid : "",
    body,
    createdAt: tsToDate(data.createdAt),
  };
}

/**
 * Whether a run's groups share notes: a run that places people in groups.
 * A run anyone can join (`enrolMode: "open"`, where people pick a session)
 * keeps the run's comments on each reading instead. A run with no live
 * group has nobody to share them, and its pages say nothing of them.
 */
export function runSharesGroupNotes(run: { enrolMode: string }): boolean {
  return run.enrolMode !== "open";
}
