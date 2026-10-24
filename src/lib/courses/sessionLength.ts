/**
 * HOW LONG A GROUP'S WEEKLY SESSION LASTS: the lengths the group editor
 * offers, and the one a new group starts with.
 *
 * One list, read in three places: the group editor's Length box
 * (`SessionSlotField`), the slot a new group is made with (`GroupEditor`),
 * and the times picture on a programme's Groups tab, which counts who is
 * free for a whole session of one of these lengths. How long a term's
 * sessions really last is set on each group in the run editor; nothing here
 * says it.
 *
 * Pure, with no import, so a client component and a server page share it.
 */

/** The lengths the group editor offers, in minutes, shortest first. */
export const SESSION_LENGTH_PRESETS: readonly number[] = [60, 90, 120];

/** What a new group's session lasts until somebody changes it. */
export const NEW_GROUP_SESSION_MINUTES = 90;
