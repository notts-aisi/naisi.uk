/**
 * A REMINDER BY HAND ABOUT ONE PERSON'S WEEK: one small record per person and
 * week, in `courseNudges`, kept so "Last reminded" on a group's page can say
 * when somebody pressed Remind for them and who, and so a retry of the same
 * press emails nobody twice.
 *
 *   courseNudges/handremind__{runId}__{uid}__{weekId}
 *
 * WHERE, AND WHY THERE. `courseNudges` is where the estate's human-pressed
 * course sends keep their claims (the house rule in
 * `src/lib/firestore/schedulerMarkers.ts`), and `firestore.rules` already
 * refuses every browser both ways (`allow read, write: if false`): written by
 * the Remind route alone, through the Admin SDK, and read on the server
 * alone. No rule changes for it, and it needs no index: it is read by id.
 *
 * WHAT IT HOLDS: the run, the person, the week and the group it was pressed
 * from; `at` and `byUid` of the latest reminder that went; how many have
 * gone; and `claimedAt`, the moment a press claimed it before sending, which
 * is what stops a second press within `SAME_PRESS_MS` from emailing them
 * again. Never an address, never a word of the email. Each field is
 * optional to a reader: a record missing one reads as no reminder.
 *
 * DELETED WITH THE PERSON'S ACCOUNT (`src/lib/firestore/accountDeletion.ts`),
 * found by the one equality on `uid` and told apart from the collection's
 * other records by its `kind`, as the automatic reminders' markers are.
 * Pure: no runtime imports, so the unit suite can load it on its own.
 */

export const HAND_REMINDERS_COLLECTION = "courseNudges";

/** The kind every record here carries, so a sweep by `uid` touches nothing else in the collection. */
export const HAND_REMINDER_KIND = "week-remind-by-hand";

/** The record for one person's week on one run. */
export function handReminderId(runId: string, uid: string, weekId: string): string {
  return `handremind__${runId}__${uid}__${weekId}`;
}

export type HandReminderDoc = {
  runId: string;
  uid: string;
  weekId: string;
  /** The group the latest press was made from. */
  groupId: string | null;
  /** When the latest reminder went, or null for none yet. */
  at: Date | null;
  /** Who pressed for it. */
  byUid: string | null;
  /** How many reminders by hand have gone. */
  count: number;
  /** When a press last claimed it, sent or not. */
  claimedAt: Date | null;
};

function instantOf(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  if (stamp && typeof stamp.toDate === "function") {
    const at = stamp.toDate();
    return at instanceof Date && !Number.isNaN(at.getTime()) ? at : null;
  }
  return null;
}

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** A stored record, read: anything missing reads as nothing. */
export function normalizeHandReminder(data: Record<string, unknown>): HandReminderDoc {
  return {
    runId: text(data.runId),
    uid: text(data.uid),
    weekId: text(data.weekId),
    groupId: text(data.groupId) || null,
    at: instantOf(data.at),
    byUid: text(data.byUid) || null,
    count: typeof data.count === "number" && Number.isFinite(data.count) && data.count > 0 ? Math.floor(data.count) : 0,
    claimedAt: instantOf(data.claimedAt),
  };
}
