/**
 * The Weeks tab's own addresses, under one programme's page. Built from the
 * two ids the page was reached by, each encoded, so no address here can be
 * pointed anywhere else.
 */

/** The programme's own page: `/admin/admissions/forms/<round>/programmes/<programme>`. */
export function programmePath(roundId: string, programmeId: string): string {
  return `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
}

/** The Weeks tab, or one week's page on it ("w03"). */
export function weeksPath(roundId: string, programmeId: string, weekId?: string): string {
  const tab = `${programmePath(roundId, programmeId)}/weeks`;
  return weekId ? `${tab}/${encodeURIComponent(weekId)}` : tab;
}

/** One week as a fellow reads it, from the week's page. */
export function weekPreviewPath(roundId: string, programmeId: string, weekId: string, groupId?: string | null): string {
  const page = `${weeksPath(roundId, programmeId, weekId)}/preview`;
  return groupId ? `${page}?group=${encodeURIComponent(groupId)}` : page;
}

/** One week's review, for an admin. */
export function weekReviewPath(roundId: string, programmeId: string, weekId: string): string {
  return `${weeksPath(roundId, programmeId, weekId)}/review`;
}

/** One week's notes about people: an admin's drafts and saved notes, and the lead's reading of the saved ones. */
export function weekNotesPath(roundId: string, programmeId: string, weekId: string, only?: "drafts" | "suggestions" | null): string {
  const page = `${weeksPath(roundId, programmeId, weekId)}/notes`;
  return only ? `${page}?only=${only}` : page;
}

/** "Copy weeks from the course". */
export function copyWeeksPath(roundId: string, programmeId: string): string {
  return `${weeksPath(roundId, programmeId)}/copy`;
}

/** A week document id as the plan addresses it: "w01" to "w60". */
export const WEEK_DOC_ID = /^w(\d\d)$/;

/** The week number a week document id names, or null for anything that is not one. */
export function weekNumberOfId(weekId: string): number | null {
  const match = WEEK_DOC_ID.exec(weekId);
  if (!match) return null;
  const n = Number(match[1]);
  return n >= 1 && n <= 60 ? n : null;
}
