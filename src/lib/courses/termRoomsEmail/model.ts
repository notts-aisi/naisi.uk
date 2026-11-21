import { resolveSessions, sessionInstants } from "../sessions";
import { reminderPlaceOf } from "../weekEmails/model";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { groupForWeek, type CourseEnrolmentDoc } from "@/lib/firestore/courseEnrolments";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { termRoomsLine } from "./words";

/**
 * WHAT A GROUP'S ROOMS EMAIL SAYS, AND TO WHOM EACH LINE GOES. Pure: no reads,
 * no clock (the caller hands `now` in).
 *
 * ── THE LINES ───────────────────────────────────────────────────────────────
 * One line a session of the group STILL TO COME: dated, not called off, and
 * not started at `now`, in the order the group meets, read through the
 * resolver every reader of a session uses (`resolveSessions`): a week moved
 * for that week only shows its new day and time, a week with its own room
 * shows that room, and a session called off is left out. Its place is
 * `reminderPlaceOf`'s, the reminder of a session's own rule: a room with its
 * campus, online when the week is held online, and "room to be confirmed"
 * with no room, a room cleared for the week, or a link typed as the room. A
 * week's second session, where a group meets twice, is a line of its own.
 *
 * ── WHOSE LINES ARE WHOSE ───────────────────────────────────────────────────
 * Who it goes to is the places that BELONG to the group in a week of a
 * session still to come (`../../email/courseFacilitatorEmails.ts`,
 * `belongingInWeeks`), so somebody only visiting the group for a week is not
 * sent it. Each person's email then lists their own timetable with the group:
 * the sessions of the weeks they are due at the group's session
 * (`groupForWeek`). Somebody moving out of the group from a later week gets
 * the weeks before it, somebody moving in from a later week gets the weeks
 * from it, and a member visiting another group for one week has that week
 * left out, since that week they are due at the other group's session.
 * Somebody with no line gets no email. A facilitator's lines are every line.
 *
 * ── WHEN NO EMAIL GOES ──────────────────────────────────────────────────────
 * The words are approved as they stand, and no state gets a sentence of its
 * own. So no email goes for an incubator (its people are never told the word
 * group, and the subject names it), for a group with no name, or for a group
 * with no session still to come; the page says which to staff.
 */

export type TermRoomsSession = {
  weekNumber: number;
  occurrence: number;
  dateKey: string;
  /** The session's line, in the email's words. */
  line: string;
};

/** Why a group gets no email; null when it gets one. */
export type NoEmailWhy = "incubator" | "unnamed" | "noSessions";

/** The group's name as the email prints it: one line, trimmed. */
export function emailGroupName(group: Pick<CourseGroupDoc, "name">): string {
  return group.name.replace(/\s+/g, " ").trim();
}

/** Every session of the group still to come at `now`, in the order the group meets, each with its line. */
export function sessionsStillToCome(run: CourseRunDoc, group: CourseGroupDoc, now: Date): TermRoomsSession[] {
  const out: Array<TermRoomsSession & { at: number }> = [];
  for (const session of resolveSessions(run, group)) {
    if (session.cancelled || !session.dateKey) continue;
    const { startsAt } = sessionInstants(session);
    if (!startsAt || startsAt.getTime() <= now.getTime()) continue;
    out.push({
      weekNumber: session.weekNumber,
      occurrence: session.occurrence,
      dateKey: session.dateKey,
      at: startsAt.getTime(),
      line: termRoomsLine({
        weekNumber: session.weekNumber,
        dateKey: session.dateKey,
        hhmm: session.session.startTimeLocal,
        minutes: session.session.durationMinutes,
        place: reminderPlaceOf(group, session, false),
      }),
    });
  }
  out.sort((a, b) => a.at - b.at || a.weekNumber - b.weekNumber || a.occurrence - b.occurrence);
  return out.map((session) => ({ weekNumber: session.weekNumber, occurrence: session.occurrence, dateKey: session.dateKey, line: session.line }));
}

/** Why this group gets no email, or null when it gets one. */
export function noEmailWhy(input: { incubator: boolean; group: Pick<CourseGroupDoc, "name">; sessions: readonly TermRoomsSession[] }): NoEmailWhy | null {
  if (input.incubator) return "incubator";
  if (!emailGroupName(input.group)) return "unnamed";
  if (input.sessions.length === 0) return "noSessions";
  return null;
}

/** A learner's lines: the sessions of the weeks they are due at the group's session, a week visiting another group left out. */
export function linesForPlace(
  place: Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek" | "visits">,
  groupId: string,
  sessions: readonly TermRoomsSession[],
): string[] {
  return sessions.filter((session) => groupForWeek(place, session.weekNumber) === groupId).map((session) => session.line);
}

/** The weeks of the sessions still to come, once each: whose places the audience reads. */
export function weeksOf(sessions: readonly TermRoomsSession[]): number[] {
  return [...new Set(sessions.map((session) => session.weekNumber))].sort((a, b) => a - b);
}
