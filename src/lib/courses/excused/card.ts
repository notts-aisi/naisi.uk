import type { ExcusedOwnView, OwnExcusedSession } from "./own";

/**
 * WHAT A PERSON'S OWN SESSION CARD SAYS ABOUT BEING EXCUSED, decided: which
 * way in the ticket of their next session offers, the card's state for one
 * session, which ended session gets a card of its own, and which weeks the
 * request may cover. Pure, with types alone imported, so the programme page
 * and its tests ask one rule.
 *
 * THE WAY IN. Somebody taking part asks to be excused, and an admin decides.
 * Somebody who facilitates the group they hold a place in asks nobody: they
 * keep today's instant "Can't make it" (the ask route refuses them), so their
 * ticket is drawn exactly as before. When the person's own view could not be
 * read, neither is offered: a fellow is never handed the instant button by a
 * read that failed.
 */

/** Which way in the next session's ticket offers. */
export type TicketEntry =
  /** A facilitator who holds a place in the group: today's instant "Can't make it". */
  | "instant"
  /** Somebody taking part: the card's states, and "Can't make it" opening the request. */
  | "ask"
  /** Neither (no view, or nothing about this session). */
  | "none";

export function ticketEntryOf(view: Pick<ExcusedOwnView, "asks" | "groupId"> | null, groupId: string | null): TicketEntry {
  if (!view || !groupId || view.groupId !== groupId) return "none";
  return view.asks ? "ask" : "instant";
}

/** One session's card, as the person reads it. */
export type CardState =
  /** Nothing asked: "Can't make it" opens the request. */
  | { kind: "open" }
  | { kind: "waiting"; requestId: string; askedAt: string | null; reason: string; started: boolean }
  | { kind: "approved"; by: string; at: string | null; reply: string; came: boolean }
  | { kind: "declined"; by: string; reply: string; register: OwnExcusedSession["register"]; again: boolean }
  | { kind: "withdrawn"; at: string | null; again: boolean }
  | { kind: "time-set" }
  | { kind: "in-advance" }
  /** After the session, its finished register says Absent and nothing was asked: the request is offered there. */
  | { kind: "after" }
  /** Nothing to say. */
  | { kind: "none" };

export function cardStateOf(session: OwnExcusedSession): CardState {
  const excuse = session.excuse;
  const asksBefore = session.ask.open && session.ask.when === "before";
  const asksAfter = session.ask.open && session.ask.when === "after";
  switch (excuse?.kind) {
    case "waiting":
      return { kind: "waiting", requestId: excuse.requestId, askedAt: excuse.askedAt, reason: excuse.reason, started: session.started };
    case "approved":
      // The facilitator's own entry wins: they came after all.
      return { kind: "approved", by: excuse.by?.firstName ?? "", at: excuse.at, reply: excuse.reply, came: session.register === "came" };
    case "time-set":
      return { kind: "time-set" };
    case "in-advance":
      return { kind: "in-advance" };
    case "declined":
      return { kind: "declined", by: excuse.by?.firstName ?? "", reply: excuse.reply, register: session.register, again: session.ask.open };
    case "withdrawn":
      return { kind: "withdrawn", at: excuse.at, again: session.ask.open };
    default:
      if (asksBefore) return { kind: "open" };
      if (asksAfter) return { kind: "after" };
      return { kind: "none" };
  }
}

/** The session the ticket shows, from the person's own view. */
export function sessionOf(view: ExcusedOwnView | null, sessionKey: string | null): OwnExcusedSession | null {
  if (!view || !sessionKey) return null;
  return view.sessions.find((session) => session.sessionKey === sessionKey) ?? null;
}

/**
 * The ended session that gets a card of its own under the ticket: the latest
 * one to end, not called off and not the ticket's, while there is something
 * to say about it (a request about it, or a finished register that says
 * Absent, which may still be asked about).
 */
export function lastSessionOf(view: ExcusedOwnView | null, ticketKey: string | null): OwnExcusedSession | null {
  if (!view) return null;
  const ended = view.sessions
    .filter((session) => session.ended && !session.cancelled && session.sessionKey !== ticketKey)
    .sort((a, b) => (b.startsAt ?? "").localeCompare(a.startsAt ?? ""));
  const last = ended[0];
  if (!last) return null;
  const state = cardStateOf(last);
  return state.kind === "waiting" || state.kind === "approved" || state.kind === "declined" || state.kind === "withdrawn" || state.kind === "after"
    ? last
    : null;
}

/**
 * The weeks a request before the session may cover, soonest first: every
 * session of theirs still to come that may be asked about, with the one the
 * card is about first. Never more than a request takes.
 */
export function weeksToChoose(view: ExcusedOwnView, firstKey: string, max = 10): OwnExcusedSession[] {
  const open = view.sessions
    .filter((session) => session.ask.open && session.ask.when === "before")
    .sort((a, b) => (a.startsAt ?? "").localeCompare(b.startsAt ?? ""));
  const first = open.find((session) => session.sessionKey === firstKey);
  const rest = open.filter((session) => session.sessionKey !== firstKey);
  return (first ? [first, ...rest] : rest).slice(0, max);
}
