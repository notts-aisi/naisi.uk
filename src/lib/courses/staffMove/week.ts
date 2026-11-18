import { sessionInstants, type ResolvedSession } from "../sessions";

/**
 * WHICH WEEK A MOVE MADE MID-TERM TAKES EFFECT FROM, decided here and nowhere
 * else, so the page that states it and the save that writes it cannot come to
 * differ. Nobody chooses it.
 *
 * THE RULE. A move takes effect from the week of the OLD group's next session
 * still to come: week N. A session that has started counts as met (one in
 * progress included), and a week counts as met once any session of it has
 * started, so N is the first week after the last week the old group has met
 * in which it has a session still to come. Every week before N stays with the
 * old group, where the person met; week N and every later week go to the new
 * group. It is offered only when the new group has a session for week N that
 * has NOT started. So after a move no week still to come is left with the old
 * group, and no week the new group has already met is given to the person.
 *
 * Each group is read in ITS OWN sessions and week numbers, never in calendar
 * weeks: a group that lost a session is behind, and the rule holds whichever
 * of the two is ahead.
 *
 * "The old group's sessions" are the person's own: each week's session from
 * the group they were in that week (`sessionsByWeekGroup` in
 * `../groupsByWeek.ts`). With no record of groups by week that is simply the
 * old group's sessions. For somebody moved before, it is never a session of
 * the group they are in now from a week they spent elsewhere: moved into
 * Group F from week 3, Group F's week 2 is not theirs, so a move back is from
 * Group F's week 3.
 *
 * A session called off with the group keeping pace is no meeting
 * (`ResolvedSession.cancelled`), and a session the calendar cannot date
 * cannot be said to be past or to come: neither is read as a session here.
 * So when the old group's week N is called off and it keeps pace, the move is
 * from the week after, though the new group may meet in week N: they have no
 * session that week either way.
 *
 * TWO MORE REFUSALS keep the rule's promise that no session still to come is
 * left with the old group: the old group still has a session to come in a
 * week before N (its weeks met out of order, or a second session of a week
 * whose first has started), so the move waits until after it; and the old
 * group has no session with a time at all, so there is nothing to move from.
 *
 * Pure: the caller hands in both groups' sessions (`resolveSessions`, each on
 * its group's own calendar) and the clock.
 */

/** Why no week can be offered: the refusals of the rule. */
export type MoveWeekRefusal =
  /** The new group has met (or started) week N already. */
  | { kind: "new-has-met"; weekNumber: number; oldSession: ResolvedSession }
  /** The old group has no session with a time at all. */
  | { kind: "old-has-none-set" }
  /** The old group still has a session to come in a week before N: the earliest such. */
  | { kind: "old-still-to-come"; session: ResolvedSession }
  /** The old group has no session still to come. */
  | { kind: "old-has-none-left" }
  /** The new group has no session it can still hold for week N. */
  | { kind: "new-has-none"; weekNumber: number };

export type MoveWeek =
  | {
      ok: true;
      /** Week N: the first week they are in the new group. */
      weekNumber: number;
      /** The new group's first session of week N, still to come: their first session with them. */
      newSession: ResolvedSession;
      /**
       * The old group's first session of week N, still to come: the one they
       * will now not go to. Once it starts, week N counts as met with the old
       * group, and a move would be from the week after.
       */
      oldSession: ResolvedSession;
    }
  | { ok: false; refusal: MoveWeekRefusal };

/** A session the rule can read: held, and dated. */
function readable(session: ResolvedSession): Date | null {
  if (session.cancelled) return null;
  return sessionInstants(session).startsAt;
}

/** Whether a session has started by `now` (in progress counts). Null when it cannot be read. */
function started(session: ResolvedSession, now: Date): boolean | null {
  const at = readable(session);
  return at === null ? null : at.getTime() <= now.getTime();
}

/** The sessions of one week, earliest first by start, that can be read. */
function weekSessions(sessions: readonly ResolvedSession[], weekNumber: number): ResolvedSession[] {
  return sessions
    .filter((session) => session.weekNumber === weekNumber && readable(session) !== null)
    .sort((a, b) => (readable(a)?.getTime() ?? 0) - (readable(b)?.getTime() ?? 0));
}

export function moveWeekOf(input: {
  /** The person's own sessions, each week's from the group they were in that week. */
  oldSessions: readonly ResolvedSession[];
  /** The new group's sessions, on its own calendar. */
  newSessions: readonly ResolvedSession[];
  now: Date;
}): MoveWeek {
  const { oldSessions, newSessions, now } = input;
  // No session with a time at all, called off or not: nothing to move from.
  if (oldSessions.every((session) => sessionInstants(session).startsAt === null)) {
    return { ok: false, refusal: { kind: "old-has-none-set" } };
  }
  // The last week the old group has met in: any of its sessions started.
  let lastMet = 0;
  for (const session of oldSessions) {
    if (started(session, now) === true) lastMet = Math.max(lastMet, session.weekNumber);
  }
  // A session still to come in a week it has met in already (weeks met out of
  // order, or a second session of a week whose first has started) would be
  // left behind with the old group: the move waits until after the earliest.
  const behind = oldSessions
    .filter((session) => session.weekNumber <= lastMet && started(session, now) === false)
    .sort((a, b) => (readable(a)?.getTime() ?? 0) - (readable(b)?.getTime() ?? 0));
  if (behind.length > 0) return { ok: false, refusal: { kind: "old-still-to-come", session: behind[0] } };
  // Week N: the first week after it in which the old group still has a session to come.
  const toCome = oldSessions
    .filter((session) => session.weekNumber > lastMet && started(session, now) === false)
    .map((session) => session.weekNumber);
  if (toCome.length === 0) return { ok: false, refusal: { kind: "old-has-none-left" } };
  const weekNumber = Math.min(...toCome);
  const oldSession = weekSessions(oldSessions, weekNumber)[0];

  const newWeek = weekSessions(newSessions, weekNumber);
  if (newWeek.length === 0) return { ok: false, refusal: { kind: "new-has-none", weekNumber } };
  if (newWeek.some((session) => started(session, now) === true)) {
    return { ok: false, refusal: { kind: "new-has-met", weekNumber, oldSession } };
  }
  return { ok: true, weekNumber, newSession: newWeek[0], oldSession };
}

/**
 * The weeks a move from week N takes with the person, whose work and feedback
 * the new group's facilitators can then read: from the week they joined (the
 * place's `joinedWeekNumber`, never before week 1) to the week before N. None
 * when the move is from the first week they would have met.
 */
export function weeksThatCome(joinedWeekNumber: number, weekNumber: number): number[] {
  const from = Number.isInteger(joinedWeekNumber) && joinedWeekNumber > 1 ? joinedWeekNumber : 1;
  const out: number[] = [];
  for (let week = from; week < weekNumber; week += 1) out.push(week);
  return out;
}
