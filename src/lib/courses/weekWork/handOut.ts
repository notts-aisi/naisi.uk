import { drawWeekRule } from "../packsAndCases/drawWeek";
import { sessionInstants, type ResolvedSession } from "../sessions";
import type { HandOut } from "./waitingWords";

/**
 * WHEN ONE WEEK'S SLIPS GO OUT, for the person's own week page: asked of the
 * one rule the draw's page, its route and the group page's card ask
 * (`drawWeekRule`), with the sessions the person is due at, so the session
 * named is the one that really hands them out (a called-off session names
 * the one held before it), and nothing here works a session out for itself.
 *
 *  - The rule names a hand-out session: that session's week, and whether it
 *    has ended by `now` ("gives these out at the end of week 2’s session"
 *    until then, "hasn’t copied in your slip yet" after).
 *  - The week starts but no session is held before it (week 1, or every one
 *    before it called off): `none`.
 *  - Nothing can be dated: `undated`.
 *
 * Pure: the clock is passed.
 */
export function handOutOf(sessions: readonly ResolvedSession[], weekNumber: number, now: Date): HandOut {
  const facts = drawWeekRule({ sessions, givingWeeks: [weekNumber], now }).facts.get(weekNumber) ?? null;
  if (!facts || facts.startsAt === null) return { kind: "undated" };
  if (!facts.handOut) return { kind: "none" };
  const { endsAt } = sessionInstants(facts.handOut.session);
  return { kind: "session", weekNumber: facts.handOut.session.weekNumber, ended: endsAt !== null && now.getTime() >= endsAt.getTime() };
}
