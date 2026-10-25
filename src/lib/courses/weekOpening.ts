import { sessionInstants, type ResolvedSession } from "./sessions";

/**
 * WHEN A WEEK OPENS TO THE PEOPLE TAKING PART IN A GROUP (C17, Q5): straight
 * after the group's previous session.
 *
 * A published week's page opens to a member of a group once every session the
 * group holds for the weeks before it, in its own plan, has ended. The group's
 * first taught week waits on nothing: it opens when Publish has told them
 * their group, which is when the run opens to them at all. Everything is the
 * group's OWN calendar (`resolveSessions`): its pacing, a session moved for
 * one week (its new day and time), and a break a pushed session left.
 *
 * A CANCELLED SESSION IS NO SESSION. Nobody meets on a cancelled evening, so
 * nothing waits on it: the week after it opens straight after the session the
 * group last held, and the next session, which covers both weeks, has both
 * weeks' reading open in front of it.
 *
 * A session the calendar cannot date (no start date, no weekday, no time) is
 * not waited on either, so a run nobody has dated yet behaves as every run did
 * before this rule: its published weeks are open. Never a guess the other way.
 *
 * ENDED MEANS `sessionRange`'S ENDED: a session is over once its end instant
 * is in the past, so the minute before the end the week is shut and the
 * minute after it is open, and the page that says what is next never names a
 * session the week is still waiting on.
 *
 * WHO IT APPLIES TO is the caller's decision, not this module's: the people
 * taking part. The group's facilitators, the programme's lead and admins see
 * every published week, as they always have.
 *
 * Pure: no reads, no clock unless one is passed. Every date, time and length
 * comes from the group's records; nothing here knows a term.
 */

/** The session a week waits on: the group's last session before it, as it is held. */
export type OpensAfter = {
  /** The civil date that session falls on, "YYYY-MM-DD". */
  dateKey: string;
  /** Its start, "HH:MM" in London, for "tonight" or "today". */
  startTimeLocal: string;
  /** Its end: the moment the week opens. */
  endsAt: Date;
};

export type WeekOpening = {
  /**
   * The session the week waits on, or null when it waits on none: the
   * group's first taught week, a week every earlier session of which was
   * cancelled or cannot be dated, or a week the group's plan does not teach.
   */
  after: OpensAfter | null;
};

/**
 * When `weekNumber` opens to the people in the group whose sessions these
 * are. `sessions` is `resolveSessions(run, group, calendar)` for that group,
 * in its own plan order.
 */
export function weekOpening(sessions: readonly ResolvedSession[], weekNumber: number): WeekOpening {
  const index = sessions.findIndex((session) => session.weekNumber === weekNumber);
  if (index < 0) return { after: null };
  let after: OpensAfter | null = null;
  for (const session of sessions.slice(0, index)) {
    if (session.cancelled) continue;
    const { endsAt } = sessionInstants(session);
    if (!endsAt) continue;
    if (!after || endsAt.getTime() > after.endsAt.getTime()) {
      after = { dateKey: session.dateKey, startTimeLocal: session.session.startTimeLocal, endsAt };
    }
  }
  return { after };
}

/** Whether a week that waits on `opening` is open at `now`: its session has ended. */
export function isOpenAt(opening: WeekOpening, now: Date): boolean {
  return opening.after === null || opening.after.endsAt.getTime() < now.getTime();
}
