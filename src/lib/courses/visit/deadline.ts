import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * A ONE-WEEK VISIT'S TWO SESSIONS AND ITS ONE DEADLINE, apart from the plan
 * (`./plan.ts`, which re-exports both) so a reader of a request to go to
 * another session can ask the same rule without reading the whole plan.
 * Pure: no reads, no clock.
 */

/**
 * Their own group's session in a week, whether or not it is still to come:
 * the week's first, dated. A session called off is no session, and a group
 * that no longer meets has none. Null with none.
 */
export function ownSessionThatWeek(run: CourseRunDoc, home: CourseGroupDoc | null, weekNumber: number): ResolvedSession | null {
  if (!home || home.archived) return null;
  return resolveSessions(run, home).find((each) => each.weekNumber === weekNumber && each.occurrence === 1 && each.dateKey !== "" && !each.cancelled) ?? null;
}

/**
 * UNTIL WHEN A VISIT CAN BE CANCELLED, the one answer the person's card, the
 * person's own cancel and staff's call-off all ask: until the EARLIER of the
 * two sessions of that week starts, their own group's (`ownSessionThatWeek`:
 * one called off is no session) or the host's, read from the host group's
 * own schedule whatever has happened to the group since (archived, it still
 * knows when it met). Staff and the person alike: once their own group's
 * session has started, ending the visit would count them absent from a
 * session they were told not to go to; once the host's has, the visit is
 * what that week was. `first` is that session and its group, which the
 * sentence said once it has started names. Null `until` with no dated
 * session to go by. (Staff calling off a visit to a session that is not
 * happening go by their own group's session alone: `planCallOff`.)
 */
export function cancelDeadline(input: {
  host: CourseGroupDoc;
  hostSession: ResolvedSession | null;
  home: CourseGroupDoc | null;
  ownSession: ResolvedSession | null;
}): { until: Date | null; first: { group: CourseGroupDoc; session: ResolvedSession } | null } {
  const hostStart = input.hostSession ? sessionInstants(input.hostSession).startsAt : null;
  const ownStart = input.ownSession ? sessionInstants(input.ownSession).startsAt : null;
  const hostFirst = input.hostSession ? { group: input.host, session: input.hostSession } : null;
  const ownFirst = input.ownSession && input.home ? { group: input.home, session: input.ownSession } : null;
  if (ownStart && (!hostStart || ownStart.getTime() < hostStart.getTime())) return { until: ownStart, first: ownFirst };
  return { until: hostStart, first: hostStart ? hostFirst : ownFirst };
}

