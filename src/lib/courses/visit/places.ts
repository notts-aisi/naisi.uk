import { groupForWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";

/**
 * PLACES LEFT IN ONE GROUP'S SESSION FOR ONE WEEK: the group's capacity, less
 * everybody whose session that week is the group's (`groupForWeek`): its own
 * people that week, visitors in, less its people visiting another group's
 * session. No capacity means no limit (null).
 *
 * Counted as the group's own count is (`memberCount`): every active place, of
 * a learner or of somebody who facilitates and holds a place, from the week
 * they joined. The one function the page that arranges a visit, its route and
 * its save ask, so the three never disagree.
 *
 * Pure.
 */

/** The fields of a place the count reads. */
export type CountedPlace = Pick<CourseEnrolmentDoc, "uid" | "status" | "groupId" | "groupsByWeek" | "visits" | "joinedWeekNumber">;

/** Everybody whose session in `weekNumber` is `groupId`'s, by uid. */
export function peopleInWeek(places: readonly CountedPlace[], groupId: string, weekNumber: number): string[] {
  const out = new Set<string>();
  for (const place of places) {
    if (place.status !== "active" || !place.groupId || !place.uid) continue;
    if (place.joinedWeekNumber > weekNumber) continue;
    if (groupForWeek(place, weekNumber) === groupId) out.add(place.uid);
  }
  return [...out];
}

/** The places left in the group's session that week: null for no limit, and below 0 when it is over. */
export function placesLeftInWeek(
  group: Pick<CourseGroupDoc, "id" | "capacity">,
  places: readonly CountedPlace[],
  weekNumber: number,
): number | null {
  if (group.capacity === null) return null;
  return group.capacity - peopleInWeek(places, group.id, weekNumber).length;
}
