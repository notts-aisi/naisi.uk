import { sessionInstants, type ResolvedSession } from "./sessions";
import { WEEK_OPEN_DAYS_BEFORE, weekEmailSendAt } from "./weekEmails/model";

/**
 * WHEN THE THINGS AROUND A REGISTER HAPPEN, as arithmetic.
 *
 * Three clocks hang off a group's sessions once a register stops being the
 * thing that sends the group's "Week N is open" email (wk-register, option B):
 *
 *  1. "WEEK N IS OPEN" goes 6 days before each session, at 9am in London
 *     (`src/lib/courses/weekEmails/model.ts`, which also times the reminders
 *     3 days and 1 day before). The days are counted on the calendar and the
 *     time is read off the wall, so a clock change moves nothing: counting
 *     144 elapsed hours instead would send at 8am or 10am the week the clocks
 *     move.
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
 * When "Week N is open" goes for one session: 9am in London on the civil date
 * 6 days before it.
 *
 * Null when the session cannot be dated (no date key, no usable start time),
 * which is "cannot say" and never "now": an undated session is never mailed
 * about.
 */
export function nextWeekEmailSendAt(
  session: Pick<ResolvedSession, "dateKey" | "session">,
): Date | null {
  const clock = session.session?.startTimeLocal ?? "";
  if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(clock)) return null;
  return weekEmailSendAt(session.dateKey, WEEK_OPEN_DAYS_BEFORE);
}

/**
 * Where one session stands with its "Week N is open", by the clock alone.
 *
 *  - `undated`: no instant can be worked out, so nothing is ever sent.
 *  - `waiting`: the send instant is still ahead.
 *  - `due`: the send instant has passed and the session has not started. The
 *    email goes now, or is held (an unpublished week, a missing value) and
 *    goes the moment it can, while this stays true.
 *  - `past`: the session has started. An email still unsent is never sent:
 *    the week it opens is under way, and a late email about it is worse than
 *    none.
 *
 * The group's FIRST session is timed like every other: "Week 1 is open" goes
 * 6 days before it, to the people told their group by then.
 */
export type NextWeekEmailTiming =
  | { state: "undated" }
  | { state: "waiting"; sendAt: Date; startsAt: Date }
  | { state: "due"; sendAt: Date; startsAt: Date }
  | { state: "past"; sendAt: Date; startsAt: Date };

export function nextWeekEmailTiming(
  sessions: readonly ResolvedSession[],
  index: number,
  now: Date,
): NextWeekEmailTiming {
  const session = sessions[index];
  if (!session) return { state: "undated" };
  const { startsAt } = sessionInstants(session);
  const sendAt = nextWeekEmailSendAt(session);
  if (!startsAt || !sendAt) return { state: "undated" };
  if (now.getTime() >= startsAt.getTime()) return { state: "past", sendAt, startsAt };
  if (now.getTime() < sendAt.getTime()) return { state: "waiting", sendAt, startsAt };
  return { state: "due", sendAt, startsAt };
}

export { londonClockLabel, londonDayAndClock, londonDayLabel, sessionLine } from "./londonLabels";
