import { sessionInstants, type ResolvedSession } from "../sessions";

/**
 * THE SESSION ONE PERSON IS DUE AT IN A WEEK: the one moment late is told
 * against, from which the people who read somebody's work may read an unsent
 * written answer (privacy v17, "Changing your work"), and after which earlier
 * versions of their work are kept. Worked out from their group's own
 * calendar (`resolveSessions(run, group)`, every one-off change applied).
 *
 * WHOSE SESSIONS. Somebody placed in a group, told it by Publish: that
 * group's (a facilitator who also holds a place goes by the group they hold
 * it in). Otherwise each live group they facilitate, and the EARLIEST of
 * those groups' sessions that week. Nobody else (somebody holding a place
 * before groups go out) has one.
 *
 * THE MOMENT is the start of the group's session that week, as it is now:
 *  - moved for the week, or put right after it met: when it meets, or met;
 *  - pushed back (the group's weeks moved a week later): the week's new
 *    session;
 *  - cancelled with the group keeping pace: when it WOULD have started. The
 *    week's work is not moved to the group's next session (a pack pick still
 *    closes then: `dueMoment(sessions, n, "before")`, which this is not).
 * With no session to date (the group's time is not set, or its plan does not
 * teach the week) there is no moment.
 *
 * JOINED LATE (somebody told their group after its session that week had
 * started, by Publish or by taking a seat): no moment for that week, so
 * nothing of theirs in it is ever late ("Joined late").
 *
 * Pure: no reads, no clock.
 */

/** Why the moment is what it is, or why there is none. */
export type DueBy =
  /** The group's session that week starts (moved, put right or pushed back: when it meets). */
  | "session"
  /** The week's own session is cancelled and the group keeps pace: when it would have started. */
  | "cancelled"
  /** No session to date: the group's time is not set, or its plan does not teach the week. */
  | "undated"
  /** The session started before they were told their group: nothing of theirs that week is late. */
  | "joined-late"
  /** No group yet (week 1 before groups go out). */
  | "no-group";

/** The session one person is due at in one week: its start, or null with the reason there is none. */
export type WeekDue = { at: Date | null; by: DueBy };

/** What a person's session is worked out from. */
export type SessionSource = {
  /** The sessions of each group whose session they are due at, in its plan order. Empty with no group. */
  sessionLists: ReadonlyArray<readonly ResolvedSession[]>;
  /** When they were told the group they go by; null for somebody told from the start (a facilitator). */
  toldAt: Date | null;
};

export const NO_GROUP: SessionSource = { sessionLists: [], toldAt: null };

/** The start and end of one group's session in week `weekNumber`, cancelled or not; null with none to date. */
function groupSessionOf(sessions: readonly ResolvedSession[], weekNumber: number): { at: Date; endsAt: Date; cancelled: boolean } | null {
  const own = sessions.filter((session) => session.weekNumber === weekNumber).sort((a, b) => a.occurrence - b.occurrence);
  const first = own[0];
  if (!first) return null;
  const { startsAt, endsAt } = sessionInstants(first);
  return startsAt ? { at: startsAt, endsAt: endsAt ?? startsAt, cancelled: first.cancelled } : null;
}

/** The one rule: the session a person is due at in a week, with when that very session ends. */
function dueSessionOf(source: SessionSource, weekNumber: number): { due: WeekDue; endsAt: Date | null } {
  if (source.sessionLists.length === 0) return { due: { at: null, by: "no-group" }, endsAt: null };
  let best: { at: Date; endsAt: Date; cancelled: boolean } | null = null;
  for (const sessions of source.sessionLists) {
    const found = groupSessionOf(sessions, weekNumber);
    if (found && (!best || found.at.getTime() < best.at.getTime())) best = found;
  }
  if (!best) return { due: { at: null, by: "undated" }, endsAt: null };
  if (source.toldAt && best.at.getTime() <= source.toldAt.getTime()) return { due: { at: null, by: "joined-late" }, endsAt: null };
  return { due: { at: best.at, by: best.cancelled ? "cancelled" : "session" }, endsAt: best.endsAt };
}

/** The session the person whose sessions these are is due at in week `weekNumber`. */
export function weekDueOf(source: SessionSource, weekNumber: number): WeekDue {
  return dueSessionOf(source, weekNumber).due;
}

/**
 * WHEN THAT SESSION ENDS: the end of the very session `weekDueOf` picks, its
 * own end instant (`sessionInstants`), or null whenever `weekDueOf` has no
 * moment. Cancelled with the group keeping pace: when it would have ended.
 * The weekly notes draw on a week only after it (privacy v18: "It is drafted
 * after your session").
 */
export function weekDueEndsAt(source: SessionSource, weekNumber: number): Date | null {
  return dueSessionOf(source, weekNumber).endsAt;
}

/**
 * When the group's session that week starts, whenever they were told their
 * group: the same moment without the joined-late rule. What "Feedback to
 * write" counts its seven days from.
 */
export function groupSessionAt(source: SessionSource, weekNumber: number): Date | null {
  return weekDueOf({ ...source, toldAt: null }, weekNumber).at;
}
