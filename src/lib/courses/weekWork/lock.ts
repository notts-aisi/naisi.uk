import { sessionInstants, type ResolvedSession } from "../sessions";
import { dueMoment } from "../weekBlocks/due";
import { weekWorkState, type WeekLock, type WeekWorkFacts, type WeekWorkState } from "./model";

/**
 * WHEN ONE PERSON'S WEEK LOCKS, from their group's own calendar
 * (`resolveSessions(run, group)`, every one-off change of a session applied).
 *
 * WHOSE SESSIONS. Somebody placed in a group, told it by Publish: that
 * group's (a facilitator who also holds a place locks with the group they
 * hold it in). Otherwise each live group they facilitate, and their week
 * locks at the EARLIEST of those groups' sessions that week. Nobody else
 * (somebody holding a place before groups go out) has a session to lock at.
 *
 * THE MOMENT is `dueMoment(sessions, n, "before")`, the rule a pack pick
 * already closes by: the session's start, or, when the week's own session is
 * cancelled while the group keeps pace, the start of the group's next session
 * that meets. With none to date the week locks only when they submit it.
 *
 * JOINED LATE (somebody told their group after its session that week had
 * started, by Publish or by taking a seat): the week does not lock for them by
 * the clock, so they find no week locked before they could open it.
 *
 * Pure: no reads; the clock is handed in.
 */

/** What a person's lock is worked out from. */
export type LockSource = {
  /** The sessions of each group whose session locks their week, in its plan order. Empty with no group. */
  sessionLists: ReadonlyArray<readonly ResolvedSession[]>;
  /** When they were told the group their week locks with; null for somebody told from the start (a facilitator). */
  toldAt: Date | null;
};

export const NO_GROUP: LockSource = { sessionLists: [], toldAt: null };

/** When week `weekNumber` locks for the person whose sessions these are. */
export function weekLockOf(source: LockSource, weekNumber: number): WeekLock {
  if (source.sessionLists.length === 0) return { at: null, by: "no-group" };
  let best: { at: Date; moved: boolean } | null = null;
  for (const sessions of source.sessionLists) {
    const due = dueMoment(sessions, weekNumber, "before");
    if (due && (!best || due.at.getTime() < best.at.getTime())) best = { at: due.at, moved: due.moved };
  }
  if (!best) return { at: null, by: "undated" };
  if (source.toldAt && best.at.getTime() <= source.toldAt.getTime()) return { at: null, by: "joined-late" };
  return { at: best.at, by: best.moved ? "next-session" : "session" };
}

/** The start of the first session that meets after `instant`, across the person's groups; null with none to date. */
export function nextSessionAfter(source: LockSource, instant: Date): Date | null {
  let best: Date | null = null;
  for (const sessions of source.sessionLists) {
    for (const session of sessions) {
      if (session.cancelled) continue;
      const { startsAt } = sessionInstants(session);
      if (!startsAt || startsAt.getTime() <= instant.getTime()) continue;
      if (!best || startsAt.getTime() < best.getTime()) best = startsAt;
    }
  }
  return best;
}

/** Where week `weekNumber` stands for this person at `now`, from its stored facts. */
export function weekStateOf(source: LockSource, weekNumber: number, facts: WeekWorkFacts | null, now: Date): WeekWorkState {
  return weekWorkState({
    facts,
    lock: weekLockOf(source, weekNumber),
    relockAfter: (instant) => nextSessionAfter(source, instant),
    now,
  });
}
