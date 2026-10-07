/**
 * The day to print after "applications closed on", or null for no day.
 *
 * A form closes at the time written on it, or earlier when an admin closes it
 * by hand. Closed by hand, the time written on it is still ahead, and a page
 * that printed it would be telling somebody that applications "closed on" a
 * day that has not come. So the day is printed only once it has passed, and
 * until then the pages say that applications have closed and name no day.
 *
 * Pure: the caller passes the form's own closing time, its label as an
 * applicant is shown it, and the clock.
 */
export function closedOnLabel(scheduledClose: Date | null, label: string | null, now: Date): string | null {
  if (scheduledClose === null || label === null) return null;
  return scheduledClose.getTime() <= now.getTime() ? label : null;
}
