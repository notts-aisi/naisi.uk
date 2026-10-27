import { addDaysToKey, isValidDateKey, londonWallClockToInstant } from "./weekPlan";
import { sessionInstants, type ResolvedSession } from "./sessions";

/**
 * WHEN THE THINGS AROUND A REGISTER HAPPEN, as arithmetic.
 *
 * Three clocks hang off a group's sessions once a register stops being the
 * thing that sends next week's email (wk-register, option B):
 *
 *  1. NEXT WEEK'S EMAIL goes a set number of days before each session, at
 *     that session's own time of day in London (`config/courses
 *     .nextWeekEmailDaysBefore`). A Tuesday 6pm group with the setting at 2
 *     hears on the Sunday at 6pm, on either side of a clock change, because
 *     the days are counted on the calendar and the time is read off the wall.
 *     Counting 48 elapsed hours instead would send at 7pm or 5pm on the
 *     weekend the clocks move.
 *  2. THE REMINDER to the group's facilitators, a number of hours after the
 *     session ENDS (`unmarkedRegisterGraceHours`).
 *  3. THE TASK for the programme's lead and the admins, later still
 *     (`registerTaskHours`).
 *
 * The two chases are counted from the END of the session, never its start:
 * a register is taken during the session, so the clock on finishing it starts
 * when the room empties.
 *
 * PURE. No Firestore, and no clock unless one is passed, so the unit suites
 * can run it standalone. The job and the register page both ask it, so the
 * page cannot promise a time the job does not keep.
 */

/**
 * When next week's email goes for one session: the session's own wall clock
 * on the civil date `daysBefore` days earlier, as an instant.
 *
 * Null when the session cannot be dated (no date key, no usable start time),
 * which is "cannot say" and never "now": an undated session is never mailed
 * about.
 */
export function nextWeekEmailSendAt(
  session: Pick<ResolvedSession, "dateKey" | "session">,
  daysBefore: number,
): Date | null {
  if (!isValidDateKey(session.dateKey)) return null;
  if (!Number.isInteger(daysBefore) || daysBefore < 0) return null;
  const clock = session.session?.startTimeLocal ?? "";
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(clock)) return null;
  try {
    return londonWallClockToInstant(addDaysToKey(session.dateKey, -daysBefore), clock);
  } catch {
    return null;
  }
}

/**
 * Where one session stands with its next week's email, by the clock alone.
 *
 *  - `first-session`: the group's first session. Nothing came before it to
 *    send "next week's" email after; the placement email at Publish is what
 *    tells people about it, and the run's catch-up send is the lane for a
 *    welcome. Never mailed by the schedule.
 *  - `undated`: no instant can be worked out, so nothing is ever sent.
 *  - `waiting`: the send instant is still ahead.
 *  - `due`: the send instant has passed and the session has not started. The
 *    email goes now, or is held (an unpublished week, a missing value) and
 *    goes the moment it can, while this stays true.
 *  - `past`: the session has started. An email still unsent is never sent:
 *    "next week" is now this week, and a late email about a session already
 *    under way is worse than none.
 */
export type NextWeekEmailTiming =
  | { state: "first-session" }
  | { state: "undated" }
  | { state: "waiting"; sendAt: Date; startsAt: Date }
  | { state: "due"; sendAt: Date; startsAt: Date }
  | { state: "past"; sendAt: Date; startsAt: Date };

export function nextWeekEmailTiming(
  sessions: readonly ResolvedSession[],
  index: number,
  daysBefore: number,
  now: Date,
): NextWeekEmailTiming {
  if (index <= 0) return { state: "first-session" };
  const session = sessions[index];
  if (!session) return { state: "undated" };
  const { startsAt } = sessionInstants(session);
  const sendAt = nextWeekEmailSendAt(session, daysBefore);
  if (!startsAt || !sendAt) return { state: "undated" };
  if (now.getTime() >= startsAt.getTime()) return { state: "past", sendAt, startsAt };
  if (now.getTime() < sendAt.getTime()) return { state: "waiting", sendAt, startsAt };
  return { state: "due", sendAt, startsAt };
}

export { londonClockLabel, londonDayAndClock, londonDayLabel, sessionLine } from "./londonLabels";
