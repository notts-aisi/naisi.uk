import { drawWeekRule, type DrawWeekFacts } from "../packsAndCases/drawWeek";
import { casesIn, chooseOnesOf, hasDraw, talksOf, type WeekDraw } from "../packsAndCases/model";
import { everybodyHasTheirs, spreadOf, type DrawPerson, type DrawWeeks, type GroupWeek } from "../packsAndCases/readers";
import type { ResolvedSession } from "../sessions";

/**
 * THE PATHWAYS AND CASES CARD ON A GROUP'S PAGE, as a model: what it says in
 * every state, worked out from what `readDrawWeeks` read (every week of the
 * course as the group reads it, the week the slips being handed out are for
 * by `drawWeekRule`, and the draw of at most the two weeks that rule asks
 * about). Nothing here reads, and no week or hand-out session is worked out
 * here: each is the rule's.
 *
 *  - NO CARD on a course none of whose taught weeks has a Choose one or a
 *    Cases block. On any other course the card is always there.
 *  - FINISHED: every session has ended. What was given out, a tap away.
 *  - NOT GIVEN OUT: a course with a Choose one or Cases block that gives
 *    nothing out, and why: its Choose ones are picked by each person, or its
 *    cases are not set to be given out (nobody can pick a case on the site),
 *    or its Cases blocks have no cases.
 *  - NOTHING NEXT: no week still to come gives anything out; the next week
 *    to come, by the same rule over the taught weeks, is named.
 *  - A WEEK: the rule's week, still to come, in one of four phases: BEFORE
 *    the session that hands its slips out (set early, change afterwards);
 *    GIVE OUT, from the start of that session on its evening while nobody
 *    has theirs; SOME given, with who has what and who has not; ALL, with
 *    the other weeks a tap away. From the start of the hand-out session
 *    until everybody has theirs it is PINNED, straight under the session
 *    card.
 *
 * WHO IS NAMED: a facilitator of the group is left out of the card's named
 * lists for the group's other facilitators, and counted without a name. The
 * reader themself, the lead and admins see every name.
 */

export type DrawCardViewer = {
  uid: string;
  isAdmin: boolean;
  /** Leads the programme that names the group's run. */
  lead: boolean;
};

/** A list of people as this reader is shown it: names, and how many are counted without one. */
export type NamedCount = { names: string[]; unnamed: number };

export type DrawCardPhase = "before" | "giveOut" | "some" | "all";

export type DrawCardModel =
  | { kind: "finished"; givenWeeks: number[] }
  | {
      kind: "notGivenOut";
      reason: "casesNotSet" | "picked" | "nothing";
      /** The week named; null for "nothing". */
      weekNumber: number | null;
      /** The picked Choose one's title, for "picked". */
      chooseOneTitle: string;
    }
  | { kind: "nothingNext"; nextWeek: number | null; givenWeeks: number[] }
  | {
      kind: "week";
      weekNumber: number;
      draw: WeekDraw;
      facts: DrawWeekFacts;
      phase: DrawCardPhase;
      pinned: boolean;
      /** How many have everything the week gives out, of how many. */
      have: number;
      total: number;
      /** Each pack of the week's first Choose one that somebody this reader is shown holds, with their names. */
      tiles: Array<{ id: string; name: string; names: string[] }>;
      notGiven: NamedCount;
      /** The week still to come before it, when everybody has that one's: "Week 2’s cases". */
      earlier: { weekNumber: number; draw: WeekDraw } | null;
      /** Every other week that gives something out. */
      otherWeeks: number[];
    };

/** Whether a reader is shown this person by name on the card. */
export function namedFor(viewer: DrawCardViewer, person: DrawPerson): boolean {
  return !person.facilitates || person.uid === viewer.uid || viewer.isAdmin || viewer.lead;
}

function taughtWeeks(course: DrawWeeks): GroupWeek[] {
  return course.taught.map((n) => course.weeks.get(n)).filter((week): week is GroupWeek => Boolean(week));
}

/** Whether a course has anything the card is about: a Choose one or a Cases block in a taught week. */
export function hasDrawCard(course: DrawWeeks): boolean {
  return taughtWeeks(course).some((week) => chooseOnesOf(week.blocks).length > 0 || talksOf(week.blocks).length > 0);
}

/** The earliest of these weeks still to come, by the one rule; the last of them once none is. */
function nextOf(sessions: readonly ResolvedSession[], weeks: readonly number[], now: Date): number | null {
  return weeks.length > 0 ? drawWeekRule({ sessions, givingWeeks: weeks, now }).weekNumber : null;
}

function notGivenOut(course: DrawWeeks, now: Date): DrawCardModel {
  const weeks = taughtWeeks(course);
  // Cases nobody can be given: a Cases block with cases, not given out. Said first, as it is the one that strands people.
  const casesNotSet = weeks.filter((week) => talksOf(week.blocks).some((talk) => talk.givenBy !== "facilitator" && casesIn(talk).length > 0));
  const n = nextOf(course.sessions, casesNotSet.map((week) => week.weekNumber), now);
  if (n !== null) return { kind: "notGivenOut", reason: "casesNotSet", weekNumber: n, chooseOneTitle: "" };
  const picked = weeks.filter((week) => chooseOnesOf(week.blocks).some((chooseOne) => chooseOne.givenBy !== "facilitator" && chooseOne.packs.length > 0));
  const p = nextOf(course.sessions, picked.map((week) => week.weekNumber), now);
  if (p !== null) {
    const week = course.weeks.get(p);
    const chooseOne = week ? chooseOnesOf(week.blocks).find((each) => each.givenBy !== "facilitator" && each.packs.length > 0) : undefined;
    return { kind: "notGivenOut", reason: "picked", weekNumber: p, chooseOneTitle: chooseOne?.title ?? "" };
  }
  return { kind: "notGivenOut", reason: "nothing", weekNumber: null, chooseOneTitle: "" };
}

/**
 * The card, for this reader, at `now`; null for a course the card is not
 * about. `people` is everybody in the draw, as `readDrawWeeks` was given
 * them.
 */
export function drawCardModel(input: {
  course: DrawWeeks;
  people: readonly DrawPerson[];
  viewer: DrawCardViewer;
  now: Date;
}): DrawCardModel | null {
  const { course, people, viewer, now } = input;
  if (!hasDrawCard(course)) return null;
  const givenWeeks = course.giving.map((week) => week.weekNumber);
  if (course.finished) return { kind: "finished", givenWeeks };
  const { rule } = course;
  if (rule.weekNumber === null) return notGivenOut(course, now);
  if (!rule.ahead) {
    const next = drawWeekRule({ sessions: course.sessions, givingWeeks: course.taught, now });
    return { kind: "nothingNext", nextWeek: next.ahead ? next.weekNumber : null, givenWeeks };
  }

  const n = rule.weekNumber;
  const week = course.weeks.get(n);
  const state = course.states.get(n);
  const facts = rule.facts.get(n);
  if (!week || !state || !facts || !hasDraw(week.draw)) return null;

  const holding = (person: DrawPerson) => everybodyHasTheirs(week, [person], state);
  const have = people.filter(holding).length;
  const total = people.length;
  const all = total > 0 && have === total;
  const started = facts.handOut !== null && now.getTime() >= facts.handOut.startsAt.getTime();
  const pinned = total > 0 && started && !all;
  const phase: DrawCardPhase = all ? "all" : !pinned ? "before" : have === 0 && facts.handOutNight ? "giveOut" : "some";

  const shown = people.filter((person) => namedFor(viewer, person));
  const tiles = spreadOf(week, shown, state)
    .tiles.filter((tile) => tile.people.length > 0)
    .map((tile) => ({ id: tile.id, name: tile.name, names: tile.people.map((person) => person.firstName) }));
  const lacking = people.filter((person) => !holding(person));
  const notGiven: NamedCount = {
    names: lacking.filter((person) => namedFor(viewer, person)).map((person) => person.firstName),
    unnamed: lacking.filter((person) => !namedFor(viewer, person)).length,
  };

  // The rule reads the next two weeks still to come; when its week is the second, everybody has the first's.
  const first = rule.toRead[0];
  const firstWeek = first !== undefined && first !== n ? course.weeks.get(first) : undefined;
  const earlier = firstWeek && phase === "before" ? { weekNumber: firstWeek.weekNumber, draw: firstWeek.draw } : null;

  return {
    kind: "week",
    weekNumber: n,
    draw: week.draw,
    facts,
    phase,
    pinned,
    have,
    total,
    tiles,
    notGiven,
    earlier,
    otherWeeks: phase === "all" ? course.giving.map((each) => each.weekNumber).filter((each) => each !== n) : [],
  };
}

/**
 * WHAT THE REGISTER AND HOME POINT TO, AT THE SESSION THAT HANDS THE SLIPS
 * OUT: the card's week while it is pinned and it is that session's evening
 * (`handOutNight`: from the start of the session to the end of that day in
 * London), with that session. Null at any other time, so nothing points
 * there once everybody has theirs or the evening is over; the card itself
 * stays pinned until everybody has theirs. Asks nothing about names, so it
 * is the same for every reader.
 */
export type SlipsTonight = {
  weekNumber: number;
  draw: WeekDraw;
  handOut: { session: ResolvedSession; startsAt: Date };
};

export function slipsTonightOf(input: { course: DrawWeeks; people: readonly DrawPerson[]; now: Date }): SlipsTonight | null {
  const model = drawCardModel({ ...input, viewer: { uid: "", isAdmin: true, lead: false } });
  if (!model || model.kind !== "week" || !model.pinned || !model.facts.handOutNight || !model.facts.handOut) return null;
  return { weekNumber: model.weekNumber, draw: model.draw, handOut: model.facts.handOut };
}

/** Whether the course's draw can be at its hand-out evening at all, from the rule's facts alone: no draw is read to ask. */
export function mayBeHandOutNight(course: DrawWeeks): boolean {
  return course.rule.toRead.some((n) => course.rule.facts.get(n)?.handOutNight === true);
}

/**
 * THE GUIDE'S CARD on a week's page: the week after it, when that week gives
 * something out and this is the evening its slips are handed out at this
 * week's session, by the one rule over the group's sessions. The guide reads
 * that one week's blocks and no draw, so it says nothing of who has theirs.
 */
export function guideSlipsOf(input: {
  sessions: readonly ResolvedSession[];
  /** The week after the page's, as the group reads it; null when it is not written as blocks. */
  next: GroupWeek | null;
  pageWeek: number;
  now: Date;
}): { weekNumber: number; draw: WeekDraw; sessionNumber: number } | null {
  const { sessions, next, pageWeek, now } = input;
  if (!next || !hasDraw(next.draw)) return null;
  const facts = drawWeekRule({ sessions, givingWeeks: [next.weekNumber], now }).facts.get(next.weekNumber);
  if (!facts || !facts.handOutNight || !facts.handOut || facts.handOut.session.weekNumber !== pageWeek) return null;
  return { weekNumber: next.weekNumber, draw: next.draw, sessionNumber: facts.handOut.session.weekNumber };
}
