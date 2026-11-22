/**
 * ONE REQUEST AT A TIME, ACROSS KINDS: a person has at most one request
 * waiting on a run of the kinds that change where they go, to go to another
 * group's session for a week (`visit`) or to change group for good (`move`).
 * Every ask of either kind, and every way in to one, asks this one question,
 * over the standings each kind's own rule gives (`visitRequestStandingOf`,
 * `moveRequestStandingOf`), so a waiting request of one kind is never missed
 * by the other. Requests to be excused are per week and keep their own rules.
 *
 * Pure: reads nothing.
 */

/** Whether any of these standings, of any kind, still waits. */
export function aRequestWaits(...standings: ReadonlyArray<Iterable<{ state: string }>>): boolean {
  for (const each of standings) for (const standing of each) if (standing.state === "waiting") return true;
  return false;
}
