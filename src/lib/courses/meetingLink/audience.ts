import "server-only";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { groupForWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import { sessionKeyParts } from "@/lib/courses/excused/model";
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
 * ONE SESSION GIVEN TO SOMEBODY. Whoever an admin or the programme's lead
 * gave one session of the group to runs it, so they see THAT session's link,
 * while the grant holds (`givenSessions`: the register's gate's own list of
 * the live grants, by session key), on its register and nowhere else. Never
 * the group's standing link, and never another session's.
 *
 * ONE-WEEK VISITORS. Somebody going to the group's session for one week (a
 * one-week visit, `visits` on their place) sees THAT session's link: the
 * session the link is for (`sessionKey`) is in a week whose session is this
 * group's for them (`groupForWeek`). Never the group's standing link, and
 * never another week's.
 */
export function seesSessionLink(input: {
  viewer: SessionUser;
  isAdmin: boolean;
  /** The viewer's own seat on the group's run, or null for none. */
  seat: (Pick<CourseEnrolmentDoc, "status" | "groupId"> & Partial<Pick<CourseEnrolmentDoc, "groupsByWeek" | "visits">>) | null;
  group: Pick<CourseGroupDoc, "id" | "facilitatorUids">;
  /** The session the link is for (`sessionKey`), or null for the group's standing link. */
  sessionKey: string | null;
  /** The sessions of this group given to the viewer, while each grant holds (`gateGroupRegister`'s `givenSessions`). */
  givenSessions?: readonly string[];
}): boolean {
  const { viewer, isAdmin, seat, group, sessionKey } = input;
  if (isAdmin) return true;
  if (seat?.status === "active" && seat.groupId === group.id) return true;
  if (sessionKey !== null && (input.givenSessions ?? []).includes(sessionKey)) return true;
  // A one-week visit to this group: that week's session alone.
  const week = sessionKey !== null ? sessionKeyParts(sessionKey) : null;
  if (week && seat?.status === "active" && seat.groupId && seat.groupId !== group.id && groupForWeek(seat, week.weekNumber) === group.id) return true;
  return isNamedWithStanding(viewer, "courseGroups.facilitatorUids", group.facilitatorUids);
}
