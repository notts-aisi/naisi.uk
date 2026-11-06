import "server-only";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";

/**
 * WHO SEES A SESSION'S MEETING LINK: one answer, asked by every page and
 * route that hands a group's link to somebody (the run overview behind the
 * programme page and Home, and a facilitator's group page).
 *
 * A session's link is its week's own, or the group's standing link
 * (`sessionForWeek`). It is shown to the whole group that week: the people
 * with an active seat in the group, its facilitators while their accounts
 * stand behind the role, and admins. Nobody else, and never in an email or a
 * calendar feed: the link is a door onto the group's call.
 *
 * ONE-WEEK VISITORS. Somebody who swaps into a group for one week is to see
 * that week's link too. Nothing records such a visit yet; when it does, it
 * is added here, by the session the link is for (`sessionKey`), and every
 * reader of the link follows. That is why a caller says which session it is
 * asking about (null for the group's standing link) although nothing reads
 * it today.
 */
export function seesSessionLink(input: {
  viewer: SessionUser;
  isAdmin: boolean;
  /** The viewer's own seat on the group's run, or null for none. */
  seat: Pick<CourseEnrolmentDoc, "status" | "groupId"> | null;
  group: Pick<CourseGroupDoc, "id" | "facilitatorUids">;
  /** The session the link is for (`sessionKey`), or null for the group's standing link. */
  sessionKey: string | null;
}): boolean {
  const { viewer, isAdmin, seat, group } = input;
  if (isAdmin) return true;
  if (seat?.status === "active" && seat.groupId === group.id) return true;
  return isNamedWithStanding(viewer, "courseGroups.facilitatorUids", group.facilitatorUids);
}
