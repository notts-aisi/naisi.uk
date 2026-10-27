import { sessionInstants, type ResolvedSession } from "./sessions";

/**
 * THE SESSION BEFORE A WEEK, AS A GROUP HOLDS IT: what a sealed predictions
 * card waits on before it opens (`src/lib/courses/predictions/taker.ts`).
 *
 * THE WEEK PAGES NO LONGER ASK THIS. Until 27 October 2026 a published week
 * opened to the people taking part in a group only straight after the
 * group's previous session (C17). Zach decided every week is published at
 * the start and readable at once, so people can read ahead: every published
 * week is open to everybody the run is open to, and nothing here gates a
 * page. The sealed card kept the old clock for itself, so reading the week a
 * card opens in early never opens the card early.
 *
 * The clock: the card's week waits on every session the group holds for the
 * weeks before it, in its own plan. The group's first taught week waits on
 * nothing. Everything is the group's OWN calendar (`resolveSessions`): its
 * pacing, a session moved for one week (its new day and time), and a break a
 * pushed session left.
 *
 * A CANCELLED SESSION IS NO SESSION. Nobody meets on a cancelled evening, so
 * nothing waits on it: the week after it waits only on the session the group
 * last held.
 *
 * A session the calendar cannot date (no start date, no weekday, no time) is
 * not waited on either. Never a guess the other way.
 *
 * ENDED MEANS `sessionRange`'S ENDED: a session is over once its end instant
 * is in the past, so the minute before the end the card is shut and the
 * minute after it is open.
 *
 * Pure: no reads, no clock unless one is passed. Every date, time and length
 * comes from the group's records; nothing here knows a term.
 */

/** The session a card's week waits on: the group's last session before it, as it is held. */
export type OpensAfter = {
  /** The civil date that session falls on, "YYYY-MM-DD". */
  dateKey: string;
  /** Its start, "HH:MM" in London, for "tonight" or "today". */
  startTimeLocal: string;
  /** Its end: the moment the card opens. */
  endsAt: Date;
};

export type WeekOpening = {
  /**
   * The session a card in the week waits on, or null when it waits on none: the
   * group's first taught week, a week every earlier session of which was
   * cancelled or cannot be dated, or a week the group's plan does not teach.
   */
  after: OpensAfter | null;
};

/**
 * The session a card opening in `weekNumber` waits on, for the people in the
 * group whose sessions these are. `sessions` is `resolveSessions(run, group,
 * calendar)` for that group, in its own plan order.
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

/** Whether a card whose week waits on `opening` is open at `now`: its session has ended. */
export function isOpenAt(opening: WeekOpening, now: Date): boolean {
  return opening.after === null || opening.after.endsAt.getTime() < now.getTime();
}
