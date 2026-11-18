import type { CourseAttendanceDoc } from "@/lib/firestore/courseAttendance";
import type { ResolvedSession } from "./sessions";

/**
 * A WEEK SPENT IN A GROUP ARCHIVED SINCE: what still counts of it.
 *
 * A place can record that somebody spent some weeks in a group that has since
 * been archived (`groupsByWeek`, written by the mid-term move). An archived
 * group has no session to come, no reminder, no calendar entry and nothing to
 * be excused from, and a week spent there reads as undated. But a session it
 * held whose register was FINISHED did happen, and the marks on it are true:
 * for the people whose record gives them that week, it counts as held and
 * their mark is their mark, as it was before the group was archived.
 *
 * So of an archived group's sessions, a week reader keeps exactly the ones
 * this says: the register is finished, it says the session was held, and the
 * session was not called off through "Change a session". A register never
 * finished, one saying the session did not happen, and a session called off
 * count for nothing, as a week with no session does. The rollup on a place
 * applies the same three rules to every register already
 * (`recomputeRollup`), so it reads an archived group's registers whole.
 *
 * Only ever asked about a group a person's own record names for that week:
 * with no record, nothing reads an archived group's registers at all.
 *
 * Pure: no reads, no clock.
 */
export function countsFromArchivedGroup(
  session: Pick<ResolvedSession, "cancelled">,
  register: Pick<CourseAttendanceDoc, "held" | "pushedAt"> | null | undefined,
): boolean {
  return !session.cancelled && register != null && register.held && register.pushedAt instanceof Date;
}
