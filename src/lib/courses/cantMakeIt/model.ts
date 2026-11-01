/**
 * "CAN'T MAKE IT" FOR ONE SESSION, decided: who may say it about which
 * session, and what a register already holds about them. Pure, with types and
 * nothing else imported, so the route, the programme page's loader and the
 * tests ask one rule.
 *
 * WHAT IT IS. Somebody taking part tells us, before a session of their group
 * starts, that they can't make it. That records them as excused on the
 * session's register (privacy v15, Registers: "We may let you tell us in
 * advance that you can't make a session, which records you as excused."),
 * with a note of when they said so, which the register shows the group's
 * facilitators, the programme's lead and admins. Nobody is emailed. Excused
 * is never counted as missing: a run of absences stops at it, and who
 * finished says it apart from the weeks somebody missed.
 *
 * WHAT IT IS NOT. It is not the event's "Can't make it", which gives a place
 * back; nor "I can't make this time", which is about the group's time and
 * keeps the person's place while they are moved. It never touches the seat.
 *
 * WHILE IT MAY BE SAID OR TAKEN BACK. Only before the session starts, on a
 * session the group holds that has a day and a time, is not cancelled through
 * "Change a session", and whose register is not finished and does not say
 * the session did not happen. Once a facilitator has filled in the person's
 * line of that register themselves, it is theirs: the person is asked to tell
 * them. Taking it back clears only what the person put there: the excused
 * mark that came with their own word in advance.
 */

/** What the press asks for: the session, by its register's key, and whether they can't make it (true) or can after all (false). */
export type CantMakeItRequest = { sessionKey: string; cantMakeIt: boolean };

/** A session key as `sessionKey` makes it: "w03", or "w03-2" for a week's second session. */
const SESSION_KEY = /^w\d{2,3}(?:-[2-9])?$/;

/** The body of a press, or why it is not one. Reads nothing. */
export function parseCantMakeIt(raw: unknown): { ok: true; value: CantMakeItRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Expected a JSON object body." };
  const body = raw as Record<string, unknown>;
  if (typeof body.sessionKey !== "string" || !SESSION_KEY.test(body.sessionKey)) {
    return { ok: false, error: "sessionKey must name one of the group's sessions, like w03." };
  }
  if (typeof body.cantMakeIt !== "boolean") return { ok: false, error: "cantMakeIt must be true or false." };
  return { ok: true, value: { sessionKey: body.sessionKey, cantMakeIt: body.cantMakeIt } };
}

/** What one register holds about one person, as far as this asks. */
export type RegisterLine = {
  /** The register exists and is finished. */
  finished: boolean;
  /** The register says the session did not happen. */
  notHeld: boolean;
  /** Their mark on it, or null. */
  mark: string | null;
  /** When they told us in advance, or null. */
  toldAt: Date | null;
};

/** No register yet: nothing on it about anybody. */
export const EMPTY_LINE: RegisterLine = { finished: false, notHeld: false, mark: null, toldAt: null };

/**
 * Where one person stands on one session:
 *  - `closed`: there is nothing to say any more, and why (the session started,
 *    is cancelled, has no day, or its register is finished or says it did not
 *    happen);
 *  - `told`: they told us, and the register still records them excused;
 *  - `marked`: a facilitator has filled in their line, which is theirs;
 *  - `open`: they may tell us.
 */
export type CantMakeItState =
  | { kind: "open" }
  | { kind: "told"; at: Date }
  | { kind: "marked" }
  | { kind: "closed"; why: "started" | "cancelled" | "undated" | "finished" | "notHeld" };

export function cantMakeItState(input: {
  startsAt: Date | null;
  cancelled: boolean;
  line: RegisterLine;
  now: Date;
}): CantMakeItState {
  const { startsAt, cancelled, line, now } = input;
  if (cancelled) return { kind: "closed", why: "cancelled" };
  if (!startsAt) return { kind: "closed", why: "undated" };
  if (startsAt.getTime() <= now.getTime()) return { kind: "closed", why: "started" };
  if (line.finished) return { kind: "closed", why: "finished" };
  if (line.notHeld) return { kind: "closed", why: "notHeld" };
  if (line.mark === "excused" && line.toldAt) return { kind: "told", at: line.toldAt };
  if (line.mark) return { kind: "marked" };
  return { kind: "open" };
}

/**
 * The ticket's "Can't make it" on the programme page: the session it is
 * about and whether they have told us. Null draws nothing.
 */
export type CantMakeItView = {
  groupId: string;
  sessionKey: string;
  /** "Tue 17 Nov", for the button's name. */
  day: string;
  told: boolean;
};
