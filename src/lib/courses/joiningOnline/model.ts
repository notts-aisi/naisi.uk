/**
 * "JOINING ONLINE" FOR ONE SESSION, decided: who may say it about which
 * session, what a register already holds about them, and whether a session is
 * held online for everybody. Pure, with types and nothing else imported, so
 * the route, the programme page's loader, the session tickets in the browser
 * and the tests ask one rule.
 *
 * WHAT IT IS. Somebody taking part tells us, before a session of their group
 * starts, that they will join it online rather than in the room. Their word
 * is kept on the session's register (`onlineSaid`), with when they said it,
 * and is never a mark: the register's `records` are untouched. The group's
 * facilitators read it in the box at the top of the group page and of the
 * register, which asks them for a meeting link for that week, and the
 * register puts them down as online when they are marked as having come.
 * The group's facilitators are emailed once per person per session, the
 * first time it is said, never with the link (`tell.ts`).
 *
 * ONE THING AT A TIME. Somebody who has told us they can't make the session
 * (excused in advance, "Can't make it") cannot also say they are joining it
 * online, and somebody who has said they are joining online is offered
 * "Can't make it" only once they take that back. Wherever both are on a
 * register, can't make it wins: an excused person is nobody's to expect
 * online.
 *
 * WHILE IT MAY BE SAID OR TAKEN BACK. As "Can't make it": only before the
 * session starts, on a session the group holds that has a day and a time, is
 * not cancelled through "Change a session", and whose register is not
 * finished and does not say the session did not happen. Once a facilitator
 * has filled in the person's line of that register, it is theirs. And never
 * for a session held online for everybody, where there is nothing to tell.
 */

/** What the press asks for: the session, by its register's key, and whether they are joining online (true) or in the room after all (false). */
export type JoiningOnlineRequest = { sessionKey: string; online: boolean };

/** A session key as `sessionKey` makes it: "w03", or "w03-2" for a week's second session. */
const SESSION_KEY = /^w\d{2,3}(?:-[2-9])?$/;

/** The body of a press, or why it is not one. Reads nothing. */
export function parseJoiningOnline(
  raw: unknown,
): { ok: true; value: JoiningOnlineRequest } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "Expected a JSON object body." };
  const body = raw as Record<string, unknown>;
  for (const key of Object.keys(body)) {
    if (key !== "sessionKey" && key !== "online") return { ok: false, error: `Unknown field "${key}".` };
  }
  if (typeof body.sessionKey !== "string" || !SESSION_KEY.test(body.sessionKey)) {
    return { ok: false, error: "sessionKey must name one of the group's sessions, like w03." };
  }
  if (typeof body.online !== "boolean") return { ok: false, error: "online must be true or false." };
  return { ok: true, value: { sessionKey: body.sessionKey, online: body.online } };
}

/**
 * HOW A SESSION MEETS, FOR WHO A LINK IS FOR: online for everybody, or in a
 * room with a link for whoever joins online.
 *
 *  - A week set online ("virtual") is online for everybody.
 *  - A week set in person is in a room.
 *  - A week nobody set: a group whose campus is Online meets online; one
 *    with a room or a campus of bricks meets in it; one with neither is the
 *    oldest shape of an online group (a link and nothing else), and meets
 *    online.
 */
export function heldOnline(input: {
  mode: "in-person" | "virtual" | null;
  campus: string | null;
  /** The session's own room, for its own week. */
  room: string;
}): boolean {
  if (input.mode === "virtual") return true;
  if (input.mode === "in-person") return false;
  if (input.campus === "online") return true;
  return input.room.trim() === "" && input.campus === null;
}

/** What one register holds about one person, as far as this asks. */
export type OnlineLine = {
  /** The register exists and is finished. */
  finished: boolean;
  /** The register says the session did not happen. */
  notHeld: boolean;
  /** Their mark on it, or null. */
  mark: string | null;
  /** When they told us in advance they can't make it, or null. */
  toldAt: Date | null;
  /** When they said they are joining online, or null. */
  saidAt: Date | null;
};

/** No register yet: nothing on it about anybody. */
export const EMPTY_ONLINE_LINE: OnlineLine = { finished: false, notHeld: false, mark: null, toldAt: null, saidAt: null };

/**
 * Where one person stands on one session:
 *  - `closed`: there is nothing to say any more, and why (the session
 *    started, is cancelled, has no day, its register is finished or says it
 *    did not happen, or it is online for everybody);
 *  - `told`: they told us they can't make it, and the register still records
 *    them excused on their word: one thing at a time;
 *  - `marked`: a facilitator has filled in their line, which is theirs;
 *  - `said`: they said they are joining online;
 *  - `open`: they may say it.
 */
export type JoiningOnlineState =
  | { kind: "open" }
  | { kind: "said"; at: Date }
  | { kind: "told" }
  | { kind: "marked" }
  | { kind: "closed"; why: "started" | "cancelled" | "undated" | "finished" | "notHeld" | "online" };

export function joiningOnlineState(input: {
  startsAt: Date | null;
  cancelled: boolean;
  /** The session is held online for everybody (`heldOnline`). */
  online: boolean;
  line: OnlineLine;
  now: Date;
}): JoiningOnlineState {
  const { startsAt, cancelled, online, line, now } = input;
  if (cancelled) return { kind: "closed", why: "cancelled" };
  if (!startsAt) return { kind: "closed", why: "undated" };
  if (startsAt.getTime() <= now.getTime()) return { kind: "closed", why: "started" };
  if (line.finished) return { kind: "closed", why: "finished" };
  if (line.notHeld) return { kind: "closed", why: "notHeld" };
  if (online) return { kind: "closed", why: "online" };
  if (line.mark === "excused" && line.toldAt) return { kind: "told" };
  if (line.mark) return { kind: "marked" };
  if (line.saidAt) return { kind: "said", at: line.saidAt };
  return { kind: "open" };
}

/**
 * The ticket's "Joining online" on the programme page: the session it is
 * about, whether they have said it, and whether they have told us they can't
 * make it instead (then the ticket offers it only once that is taken back).
 * Null draws nothing.
 */
export type JoiningOnlineView = {
  groupId: string;
  sessionKey: string;
  /** "Tue 17 Nov", for the button's name. */
  day: string;
  said: boolean;
  /** They told us they can't make it: one thing at a time. */
  told: boolean;
};
