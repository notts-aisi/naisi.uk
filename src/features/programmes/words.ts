/**
 * Sentences more than one programme page says, written once.
 */

/**
 * Said wherever a page gives a fellowship's format. There is no fixed day or
 * time to print: the term's form asks for availability, and groups are made
 * from the answers.
 */
export const SESSION_TIMES = "Session times are set from the availability people give when they apply.";

/** "~5 hrs a week", a rough commitment figure phrased as one. */
export function weeklyHoursWords(hours: number): string {
  return hours === 1 ? "~1 hr a week" : `~${hours} hrs a week`;
}
