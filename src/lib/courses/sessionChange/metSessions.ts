import { sessionInstants, type ResolvedSession } from "../sessions";
import { registerIsTaken } from "@/lib/firestore/courseAttendance";

/**
 * NOTHING MAY MOVE THE START OF A SESSION WHOSE REGISTER IS TAKEN.
 *
 * A week has no stored date: every session is dated from the group's
 * standing slot, that week's override and the group's own plan
 * (`resolveSessions`). So a change to any of those can re-date a session
 * that already met, and its register (`registerIsTaken`) would then sit
 * under a session at another time. This is the one rule, asked by every door
 * a change can move a session through: one week's change (a push back moves
 * every later week) and a group's own pace. A new regular time asks the same
 * question its own way, refusing any week from its starting week on whose
 * register was taken and pinning the weeks before it.
 *
 * PURE and isomorphic: the caller reads the registers of the sessions
 * `startMoves` names and hands them in.
 */

/** A session whose start a change moves: as it is now, and as it would be (null when it would no longer be held). */
export type StartMove = { before: ResolvedSession; after: ResolvedSession | null };

/**
 * Every session with a start now whose start would not be the same after
 * the change: moved, left without a date, or gone from the plan. Matched by
 * week and occurrence, which is what keys a register. In the order of
 * `before`, so the earliest comes first.
 */
export function startMoves(before: readonly ResolvedSession[], after: readonly ResolvedSession[]): StartMove[] {
  const out: StartMove[] = [];
  for (const was of before) {
    const from = sessionInstants(was).startsAt;
    if (!from) continue;
    const now = after.find((each) => each.weekNumber === was.weekNumber && each.occurrence === was.occurrence) ?? null;
    const to = now ? sessionInstants(now).startsAt : null;
    if (!to || to.getTime() !== from.getTime()) out.push({ before: was, after: now });
  }
  return out;
}

/**
 * The moves whose session's register is taken, earliest first: what a change
 * must be refused for. `registers` holds each moved session's register as
 * stored, by `sessionKey`; a session with none has not met.
 */
export function takenStartMoves(
  before: readonly ResolvedSession[],
  after: readonly ResolvedSession[],
  registers: ReadonlyMap<string, Readonly<Record<string, unknown>>>,
): StartMove[] {
  return startMoves(before, after).filter((move) => registerIsTaken(registers.get(move.before.sessionKey)));
}
