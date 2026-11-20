import { sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";

/**
 * THE WEEK A REGISTER'S GUIDE LINK IS ABOUT: "Facilitator guide for week 3"
 * above the register's table.
 *
 *  - the session the address names (`?session=w03`), when the group holds it;
 *  - else the latest of the group's sessions that has started, the one the
 *    register's foot is about while it is taken and finished (a session in
 *    progress is that one);
 *  - else, before any has started, the first still to come;
 *  - null when the group has no dated session.
 *
 * A session called off through "Change a session" is never the one: it met
 * nobody. Pure.
 */
export function registerGuideWeek(sessions: readonly ResolvedSession[], askedSession: string | null, now: Date): number | null {
  if (askedSession) {
    const asked = sessions.find((session) => session.sessionKey === askedSession);
    if (asked) return asked.weekNumber;
  }
  let started: { weekNumber: number; at: number } | null = null;
  let ahead: { weekNumber: number; at: number } | null = null;
  for (const session of sessions) {
    if (session.cancelled) continue;
    const { startsAt } = sessionInstants(session);
    if (!startsAt) continue;
    const at = startsAt.getTime();
    if (at <= now.getTime()) {
      if (!started || at > started.at) started = { weekNumber: session.weekNumber, at };
    } else if (!ahead || at < ahead.at) {
      ahead = { weekNumber: session.weekNumber, at };
    }
  }
  return (started ?? ahead)?.weekNumber ?? null;
}
