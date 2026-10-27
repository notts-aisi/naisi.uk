/**
 * HOW LONG A GROUP'S WEEKLY SESSION LASTS: the lengths the group editor
 * offers, the one a new group starts with, and the words for a length.
 *
 * One list, read in three places: the group editor's Length box
 * (`SessionSlotField`), the slot a new group is made with (`GroupEditor`),
 * and the times picture on a programme's Groups tab, which counts who is
 * free for a whole session of one of these lengths. How long a term's
 * sessions really last is set on each group in the run editor; nothing here
 * says it.
 *
 * `lengthWords` is the one way a length is said in words ("2 hours"), by the
 * times picture and by the email that tells somebody their group ("Sessions
 * last 2 hours."), so the two cannot come to say one length two ways.
 *
 * Pure, with no import, so a client component and a server page share it.
 */

/** The lengths the group editor offers, in minutes, shortest first. */
export const SESSION_LENGTH_PRESETS: readonly number[] = [60, 90, 120];

/** What a new group's session lasts until somebody changes it. */
export const NEW_GROUP_SESSION_MINUTES = 90;

/** "2 hours", "1 hour", "90 minutes": a length in minutes, in words. */
export function lengthWords(minutes: number): string {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  return `${minutes} minutes`;
}
