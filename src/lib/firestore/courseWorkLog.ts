/**
 * `courseWorkLog/{autoId}`: what one person did to their own week of a
 * course, and when (privacy v15, "What we record": what you tick, write and
 * send on each week's pages, and when). One row per thing done, never
 * changed after it is written:
 *
 *  - `tick` and `untick`: a reading, a checklist step or a pack's reading,
 *    ticked or unticked (`/api/courses/runs/[runId]/ticks/[itemId]`); a talk
 *    marked ready or not (`.../packs-and-cases/[blockId]`).
 *  - `save`: the first save of a WRITING SPELL in a reflection, a fill-in
 *    box or the written answer, and a pack picked. A box saves as its writer
 *    types, every second or so, so a row for every save would be a row for
 *    every pause: a spell starts with the first save after `SAVE_SPELL_MS`
 *    without one, and only that save is logged. The row itself keeps the
 *    first save (`firstWrittenAt`) and the last (`updatedAt`).
 *  - `cleared`: a box emptied, which deletes its row.
 *  - `submit`: the week submitted.
 *  - `reopen`: the week reopened for them by somebody running the group,
 *    named in `byUid`.
 *
 * Opening a page is never logged: no line of the policy covers it.
 *
 * WHO READS IT: nobody yet; it is kept so a later page can show a person's
 * work with its times. `firestore.rules` refuses every browser, admins
 * included, and only the routes above write it, on the Admin SDK.
 *
 * WHAT TAKES IT AWAY: deleting the person's account (by `uid`) and
 * destroying the run (by `runId`).
 *
 * Pure, with no imports: the routes hand in the server's time.
 */

export const COURSE_WORK_LOG_COLLECTION = "courseWorkLog";

export const WORK_LOG_KINDS = ["tick", "untick", "save", "cleared", "submit", "reopen"] as const;
export type WorkLogKind = (typeof WORK_LOG_KINDS)[number];

/** What a row is about: one of the week's items, or the week itself (`week`) for a submit or a reopen. */
export type WorkLogItemKind =
  | "material"
  | "checklist"
  | "reflection"
  | "fillIn"
  | "writtenAnswer"
  | "pack"
  | "talk"
  | "week";

/** How long without a save before the next save starts a new writing spell, and is logged. */
export const SAVE_SPELL_MS = 30 * 60 * 1000;

/**
 * Whether a save at `now` starts a writing spell: the box held nothing saved
 * before (`lastSavedAt` null), or its last save was `SAVE_SPELL_MS` or more
 * ago. Pure.
 */
export function startsWritingSpell(lastSavedAt: Date | null, now: Date): boolean {
  return lastSavedAt === null || now.getTime() - lastSavedAt.getTime() >= SAVE_SPELL_MS;
}

/** One row, as a route writes it. `at` is the server's time, handed in by the route. */
export function workLogEntry(input: {
  runId: string;
  uid: string;
  weekId: string;
  weekNumber: number;
  kind: WorkLogKind;
  itemKind: WorkLogItemKind;
  /** The item's id, or "" for the week itself. */
  itemId: string;
  /** Who did it, when it is not the person themselves (a reopen); "" otherwise. */
  byUid?: string;
  at: unknown;
}): Record<string, unknown> {
  return {
    runId: input.runId,
    uid: input.uid,
    weekId: input.weekId,
    weekNumber: input.weekNumber,
    kind: input.kind,
    itemKind: input.itemKind,
    itemId: input.itemId,
    byUid: input.byUid ?? "",
    at: input.at,
  };
}
