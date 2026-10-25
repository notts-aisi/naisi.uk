import { sessionInstants, type ResolvedSession } from "../sessions";
import { addDaysToKey, londonWallClockToInstant } from "../weekPlan";
import type { When } from "./model";

/**
 * WHEN A WEEK'S WORK IS DUE, FOR ONE GROUP (Q33, the written answer's due
 * rule; the same rule dates a This week task).
 *
 * A block stores only the rule (`When`): before the session, by the end of
 * the day before it, or at it. The moment is each group's, worked out here
 * from the group's own calendar (`resolveSessions(run, group)`, which has
 * every one-off move of a session applied), because groups meet on
 * different days.
 *
 * THE RULE FOR A CANCELLED SESSION (board wk-changes): nobody meets, so the
 * week's work is due by the group's NEXT session, the one that covers both
 * weeks, read by the same rule: a written answer due "by the end of the day
 * before" is due by the end of the day before that next session, and a talk
 * "at the session" moves to it. `moved` says so, for a page that wants to.
 *
 * "By the end of the day before" is the London midnight that starts the
 * session's day. An answer first sent after `at` is late; staff (the group's
 * facilitators, the lead and admins) see "Late" on it, nobody else does.
 *
 * Null when there is nothing to date: the group's plan does not teach the
 * week, its sessions have no date yet (week 1 before groups go out: "Due
 * dates wait for the group"), or every session from the week on is
 * cancelled. Never a guess.
 *
 * Pure: no reads, no clock. Every date and time comes from the group's
 * records; nothing here knows a term.
 */

export type DueMoment = {
  /** The moment it is due. */
  at: Date;
  /**
   * The London day to name: the day before the session for `dayBefore`
   * ("By the end of today, Mon 16 Nov"), the session's own day otherwise.
   */
  dateKey: string;
  /** The session the rule was read against: the week's own, or the next one when that is cancelled. */
  session: ResolvedSession;
  /** True when the week's own session is cancelled and the work moved to the group's next one. */
  moved: boolean;
};

/**
 * When work due by `rule` in week `weekNumber` is due for the group whose
 * sessions these are (`resolveSessions(run, group)`, in its plan order).
 */
export function dueMoment(
  sessions: readonly ResolvedSession[],
  weekNumber: number,
  rule: When,
): DueMoment | null {
  const own = sessions
    .filter((session) => session.weekNumber === weekNumber)
    .sort((a, b) => a.occurrence - b.occurrence);
  const first = own[0];
  if (!first) return null;

  let reference: ResolvedSession | null = first;
  let moved = false;
  if (first.cancelled) {
    moved = true;
    const from = sessions.indexOf(first);
    reference =
      sessions.slice(from + 1).find((session) => !session.cancelled && sessionInstants(session).startsAt !== null) ??
      null;
  }
  if (!reference) return null;
  const { startsAt } = sessionInstants(reference);
  if (!startsAt) return null;

  if (rule === "dayBefore") {
    return {
      at: londonWallClockToInstant(reference.dateKey, "00:00"),
      dateKey: addDaysToKey(reference.dateKey, -1),
      session: reference,
      moved,
    };
  }
  return { at: startsAt, dateKey: reference.dateKey, session: reference, moved };
}

/**
 * Was work first sent at `firstSentAt` late? Only against a moment there is
 * one for: with no due moment nothing is late.
 */
export function isLate(firstSentAt: Date, due: DueMoment | null): boolean {
  return due !== null && firstSentAt.getTime() > due.at.getTime();
}
