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
 * (`ResolvedSession.cancelled`), nor is one whose register says it was not
 * held (`notHeld`), and a session the calendar cannot date cannot be said to
 * be past or to come: none of them is read as a session met or to come here.
 *
 * A WEEK NOBODY MET WITH THE OLD GROUP. Between the last week the old group
 * met and week N, a week whose old session is dated but not happening
 * (called off, or marked as not held) was met by nobody: the move takes
 * effect from the EARLIEST such week whose new group's session has not
 * started, so the person is not left a week with no session in either
 * group. Old group's week 3 called off on Tuesday, new group meets on
 * Saturday, moved on Thursday: from week 3. The new group's week 3 already
 * started: from week 4, and week 3 counts for nobody. Old group's week 3 held:
 * from week 4, as N always was. Such a week is only ever before N: a session
 * of the old group still to come is never left behind the move's week, which
 * is why a new group that has met week N still refuses (`new-has-met`) rather
 * than moving from the week after it. That refusal says, when it is true,
 * that calling off the old group's week N session, keeping pace, lets the
 * move go ahead at once (`ifCalledOff`: the rule asked again with that
 * session called off, so it is never said when another session still to come
 * or a new group's week already met would refuse it all the same).
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
  /**
   * The new group has met (or started) week N already. `ifCalledOff`: the
   * week the move would be from at once if the old group's week N session
   * were called off, keeping pace, worked out by this rule; null when calling
   * it off would not let the move go ahead.
   */
  | { kind: "new-has-met"; weekNumber: number; oldSession: ResolvedSession; ifCalledOff: number | null }
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
       * group, and a move would be from the week after. For a week nobody met
       * with the old group (`oldOff`), its session that is not happening.
       */
      oldSession: ResolvedSession;
      /**
       * Null for the old group's next session still to come. Otherwise week N
       * is a week nobody met with the old group, and why: its session was
       * called off, or its register says it was not held.
       */
      oldOff: "called-off" | "not-held" | null;
    }
  | { ok: false; refusal: MoveWeekRefusal };

/** Whether a session was marked as not held on its register: none is, unless the caller says so. */
type NotHeld = (session: ResolvedSession) => boolean;
const NONE_NOT_HELD: NotHeld = () => false;

/** A session the rule can read: dated, and not called off. */
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
  /** Whether one of the person's own sessions is marked as not held on its register. */
  notHeld?: NotHeld;
}): MoveWeek {
  const week = ruleOf(input);
  if (week.ok || week.refusal.kind !== "new-has-met") return week;
  // WHAT CALLING OFF THE OLD GROUP'S WEEK N SESSION WOULD DO: the same rule,
  // with that session called off, keeping pace (only a week's first session
  // can be). Said beside the refusal only when it lets the move go ahead.
  const { oldSession } = week.refusal;
  if (oldSession.occurrence !== 1) return week;
  const calledOff = ruleOf({ ...input, oldSessions: input.oldSessions.map((session) => (session === oldSession ? { ...session, cancelled: true } : session)) });
  return { ok: false, refusal: { ...week.refusal, ifCalledOff: calledOff.ok ? calledOff.weekNumber : null } };
}

/** The rule itself (see the module header). */
function ruleOf(input: {
  /** The person's own sessions, each week's from the group they were in that week. */
  oldSessions: readonly ResolvedSession[];
  /** The new group's sessions, on its own calendar. */
  newSessions: readonly ResolvedSession[];
  now: Date;
  /** Whether one of the person's own sessions is marked as not held on its register. */
  notHeld?: NotHeld;
}): MoveWeek {
  const { newSessions, now } = input;
  const notHeld = input.notHeld ?? NONE_NOT_HELD;
  // No session with a time at all, called off or not: nothing to move from.
  if (input.oldSessions.every((session) => sessionInstants(session).startsAt === null)) {
    return { ok: false, refusal: { kind: "old-has-none-set" } };
  }
  // The sessions that are happening: dated, not called off, not marked as not held.
  const oldSessions = input.oldSessions.filter((session) => !notHeld(session));
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
  const next = toCome.length > 0 ? Math.min(...toCome) : null;

  // A week before N that nobody met with the old group: its session is dated
  // and called off, or marked as not held. The earliest whose new group's
  // session has not started is the move's week.
  const offWeeks = input.oldSessions
    .filter((session) => session.weekNumber > lastMet && (next === null || session.weekNumber < next))
    .filter((session) => sessionInstants(session).startsAt !== null && (session.cancelled || notHeld(session)))
    .sort((a, b) => a.weekNumber - b.weekNumber || a.occurrence - b.occurrence);
  for (const off of offWeeks) {
    const newWeek = weekSessions(newSessions, off.weekNumber);
    if (newWeek.length === 0 || newWeek.some((session) => started(session, now) === true)) continue;
    return { ok: true, weekNumber: off.weekNumber, newSession: newWeek[0], oldSession: off, oldOff: off.cancelled ? "called-off" : "not-held" };
  }

  if (next === null) return { ok: false, refusal: { kind: "old-has-none-left" } };
  const weekNumber = next;
  const oldSession = weekSessions(oldSessions, weekNumber)[0];

  const newWeek = weekSessions(newSessions, weekNumber);
  if (newWeek.length === 0) return { ok: false, refusal: { kind: "new-has-none", weekNumber } };
  if (newWeek.some((session) => started(session, now) === true)) {
    return { ok: false, refusal: { kind: "new-has-met", weekNumber, oldSession, ifCalledOff: null } };
  }
  return { ok: true, weekNumber, newSession: newWeek[0], oldSession, oldOff: null };
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
