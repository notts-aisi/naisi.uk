import { londonDateKey } from "../weekPlan";
import { sessionInstants, type ResolvedSession } from "../sessions";

/**
 * WHICH WEEK THE SLIPS BEING HANDED OUT ARE FOR: the one rule the draw's
 * page, its route and the group page's card ask, so none of them works a week
 * out for itself (`tests/course-draw-week.test.mjs` walks the three for one
 * that does).
 *
 * A facilitator hands out a week's pathways and cases on paper at the session
 * BEFORE that week's, then copies the slips in. So the answer is the earliest
 * week still to come that gives something out and where somebody has not got
 * theirs, and from the START of the session that hands its slips out it is
 * the week the slips are for, never that session's own week.
 *
 *  - A WEEK STARTS at the earliest start of its sessions, an evening called
 *    off included (it is when the week was due to begin). A week none of
 *    whose sessions can be dated has not been seen to start, so it is still
 *    to come.
 *  - Its STANDING: "ahead" until it starts; "now" from then until the last of
 *    its sessions ends (the week people are working on now); "met" after.
 *  - THE HAND-OUT SESSION is the last session HELD (not called off, with a
 *    date) that starts before the week does, read from the one session
 *    resolver with the group's own calendar (`resolveSessions`), so a moved
 *    session, a pushed-back plan, a break week and a group meeting twice a
 *    week each give their own answer. When the session just before the week
 *    is called off, the slips go out at the last one held before it, and
 *    `calledOff` names the one that is not. Week 1 has none: it is set
 *    before the first session.
 *  - THE BOUND: only the next two weeks that give something out are asked
 *    whether everybody has theirs (`toRead`). When both are complete, or are
 *    not read, the answer is the first of them.
 *  - No week still to come gives anything out: the answer is the last week
 *    that does (`ahead` false), so the page opens on what was given out.
 *  - A course that gives nothing out has no answer.
 *
 * Pure: no reads, and the clock is passed. Callers ask it twice when they
 * need the answer itself: once to learn which weeks to read, then with
 * `everybodyHas` for them.
 */

/** How many weeks still to come that give something out are read for whether everybody has theirs. */
export const DRAW_WEEKS_READ = 2;

export type DrawStanding = "ahead" | "now" | "met";

export type DrawWeekFacts = {
  weekNumber: number;
  /** When the week's first session starts, a called-off one included; null when none can be dated. */
  startsAt: Date | null;
  standing: DrawStanding;
  /** Whether the week's first session is called off. */
  startsCalledOff: boolean;
  /** The session the week's slips are handed out at, and when it starts; null for week 1, or with no dates. */
  handOut: { session: ResolvedSession; startsAt: Date } | null;
  /** The session just before the week, when it is called off: the slips go out at an earlier one, or with none, before the week. */
  calledOff: ResolvedSession | null;
  /** From the start of the hand-out session to the end of that London day, while the week is still to come. */
  handOutNight: boolean;
};

export type DrawWeekRule = {
  /** The week the slips being handed out are for; null for a course that gives nothing out. */
  weekNumber: number | null;
  /** Whether that week is still to come. */
  ahead: boolean;
  /** The weeks still to come, at most `DRAW_WEEKS_READ`, whose draw decides the answer: read these. */
  toRead: number[];
  /** The facts of every week asked about. */
  facts: Map<number, DrawWeekFacts>;
};

type Dated = { session: ResolvedSession; startsAt: Date; endsAt: Date };

function datedOf(sessions: readonly ResolvedSession[]): Dated[] {
  const out: Dated[] = [];
  for (const session of sessions) {
    const { startsAt, endsAt } = sessionInstants(session);
    if (startsAt && endsAt) out.push({ session, startsAt, endsAt });
  }
  return out.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

function factsOf(dated: readonly Dated[], weekNumber: number, now: Date): DrawWeekFacts {
  const own = dated.filter((entry) => entry.session.weekNumber === weekNumber);
  const startsAt = own.length > 0 ? own[0].startsAt : null;
  const endsAt = own.reduce<Date | null>((latest, entry) => (!latest || entry.endsAt > latest ? entry.endsAt : latest), null);
  const standing: DrawStanding =
    !startsAt || now.getTime() < startsAt.getTime() ? "ahead" : endsAt && now.getTime() <= endsAt.getTime() ? "now" : "met";
  const startsCalledOff = own.length > 0 && own[0].session.cancelled;
  if (!startsAt) return { weekNumber, startsAt, standing, startsCalledOff, handOut: null, calledOff: null, handOutNight: false };
  const before = dated.filter((entry) => entry.startsAt.getTime() < startsAt.getTime());
  const held = before.filter((entry) => !entry.session.cancelled);
  const last = held[held.length - 1] ?? null;
  const justBefore = before[before.length - 1] ?? null;
  const handOut = last ? { session: last.session, startsAt: last.startsAt } : null;
  return {
    weekNumber,
    startsAt,
    standing,
    startsCalledOff,
    handOut,
    calledOff: justBefore && justBefore.session.cancelled ? justBefore.session : null,
    handOutNight:
      standing === "ahead" &&
      handOut !== null &&
      now.getTime() >= handOut.startsAt.getTime() &&
      londonDateKey(now) === handOut.session.dateKey,
  };
}

export function drawWeekRule(input: {
  sessions: readonly ResolvedSession[];
  /** The weeks that give something out, as the group reads them. */
  givingWeeks: readonly number[];
  now: Date;
  /** For the weeks read: whether everybody in the draw has theirs. A week not here counts as not. */
  everybodyHas?: ReadonlyMap<number, boolean>;
}): DrawWeekRule {
  const dated = datedOf(input.sessions);
  const giving = [...new Set(input.givingWeeks.filter((n) => Number.isInteger(n) && n >= 1))].sort((a, b) => a - b);
  const facts = new Map(giving.map((n) => [n, factsOf(dated, n, input.now)]));
  const upcoming = giving.filter((n) => facts.get(n)?.standing === "ahead");
  const toRead = upcoming.slice(0, DRAW_WEEKS_READ);
  if (upcoming.length > 0) {
    const missing = toRead.find((n) => input.everybodyHas?.get(n) !== true);
    return { weekNumber: missing ?? upcoming[0], ahead: true, toRead, facts };
  }
  const last = giving[giving.length - 1];
  return { weekNumber: last ?? null, ahead: false, toRead, facts };
}

