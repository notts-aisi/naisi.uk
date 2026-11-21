import { drawWeekRule, type DrawWeekFacts } from "../packsAndCases/drawWeek";
import type { DrawPerson, DrawWeeks } from "../packsAndCases/readers";
import { joinNames } from "../packsAndCases/words";
import type { ResolvedSession } from "../sessions";
import { handOutOf } from "../weekWork/handOut";
import { givenOutOf, waitingOf, type WaitingPart } from "../weekWork/waiting";
import { wordOf } from "../weekWork/waitingWords";
import { COPY_IN_THE_SLIPS } from "./words";

/**
 * THE PROGRAMME OVERVIEW'S LINE ABOUT SLIPS NOT COPIED IN, under Needs
 * attention, for the programme's lead and admins: "Group C: 2 people are
 * waiting for week 3’s case." One line per group, shown from the END of the
 * session that hands a week's slips out until that week's first session
 * starts, while somebody the facilitator gives a slip to has not got theirs.
 *
 * Nothing here works a week, a session or a person out for itself:
 *  - THE WEEK is the one rule's (`drawWeekRule`, through what `readDrawWeeks`
 *    read and `withDraws` asked again), the week the group page's card is
 *    about, while it is still to come;
 *  - THE SESSION is the rule's hand-out session, and whether it has ended is
 *    the member's own week page's answer (`handOutOf`), so a session called
 *    off names the one held before it, and week 1 has none;
 *  - THE PEOPLE are the people the card counts (`drawRosterOf`, the card's
 *    roster reader, from the records the Overview read);
 *  - "HAS NOT GOT THEIRS" is the Waiting piece's one decision (`waitingOf`):
 *    a part the facilitator gives out that they have not got. It agrees with
 *    the card's draw (`everybodyHasTheirs`) on every pack and case given out,
 *    and differs in one place only: a case that follows a pathway the person
 *    picks waits only once they have picked, because until then it is theirs
 *    to move, not the facilitator's. The card asks whether everybody holds
 *    everything; this asks who waits on the facilitator.
 *
 * The lead and admins read everything, so a facilitator of the group who is
 * given a slip counts like anybody else. The line names nobody.
 *
 * Pure: no reads, and the clock is passed.
 */

/** A week still to come whose hand-out session has ended, by the rule's facts and `handOutOf`. */
function pastItsHandOut(sessions: readonly ResolvedSession[], facts: DrawWeekFacts, now: Date): boolean {
  if (facts.standing !== "ahead") return false;
  const handOut = handOutOf(sessions, facts.weekNumber, now);
  return handOut.kind === "session" && handOut.ended;
}

/**
 * From a group's sessions alone, before anything is read: whether any week
 * the group's plan teaches is still to come and past the session that hands
 * its slips out. A week that gives something out is one of those, with the
 * same facts (the rule's facts of a week do not depend on the other weeks
 * asked about), so a group this says no to can have no line.
 */
export function mayBeAfterHandOut(sessions: readonly ResolvedSession[], now: Date): boolean {
  const taught = [...new Set(sessions.map((session) => session.weekNumber))];
  const { facts } = drawWeekRule({ sessions, givingWeeks: taught, now });
  return [...facts.values()].some((each) => pastItsHandOut(sessions, each, now));
}

/**
 * From the course's weeks as the group reads them, before any slip is read:
 * whether one of the weeks the rule would read is past its hand-out session.
 * No: no slip is read for the group.
 */
export function slipsMayBeWaiting(dates: DrawWeeks, now: Date): boolean {
  return dates.rule.toRead.some((n) => {
    const facts = dates.rule.facts.get(n);
    return facts !== undefined && pastItsHandOut(dates.sessions, facts, now);
  });
}

/** One group's line: the rule's week, and what each person waiting waits for. */
export type SlipsWaiting = {
  weekNumber: number;
  /** For each person waiting, the parts they wait for, in the week's order. */
  people: WaitingPart[][];
  /** Every word the parts are called by, in the week's order: "pathway", "case". */
  things: string[];
  /** Whether every person waiting waits for every one of `things`. */
  every: boolean;
};

/**
 * The group's line, from the course's weeks as the card reads them
 * (`withDraws` over the rule's weeks) and the card's people, at `now`; null while there is
 * nothing to say.
 */
export function slipsWaitingOf(input: { weeks: DrawWeeks; people: readonly DrawPerson[]; now: Date }): SlipsWaiting | null {
  const { weeks, people, now } = input;
  const { rule } = weeks;
  const n = rule.weekNumber;
  if (n === null || !rule.ahead) return null;
  const facts = rule.facts.get(n);
  const week = weeks.weeks.get(n);
  const state = weeks.states.get(n);
  if (!facts || !week || !state || !pastItsHandOut(weeks.sessions, facts, now)) return null;
  const waiting = people
    .map((person) => {
      const holding = state.get(person.uid);
      return waitingOf(week.blocks, {
        // A pack given out, or one the person picked (which the cases follow): the draw reads both.
        packOf: (id) => holding?.packs[id] ?? holding?.picked[id] ?? null,
        caseOf: (id) => holding?.cases[id] ?? null,
      });
    })
    .filter((parts) => parts.length > 0);
  if (waiting.length === 0) return null;
  const given = givenOutOf(week.blocks);
  const order = [...given.packs.map((pack) => wordOf({ kind: "pack", word: pack.word })), "case"];
  const said = waiting.map((parts) => new Set(parts.map(wordOf)));
  const things = [...new Set(order)].filter((word) => said.some((words) => words.has(word)));
  return { weekNumber: n, people: waiting, things, every: said.every((words) => things.every((word) => words.has(word))) };
}

/**
 * "Group C: 2 people are waiting for week 3’s case." (the owner's sentence),
 * "1 person is waiting", the week's own word for a pack ("pathway", "plan"),
 * "pathway and case" when everybody waiting waits for both, and "pathway or
 * case" when some wait for one and some for the other.
 */
export function slipsWaitingWords(groupName: string, waiting: SlipsWaiting): string {
  const count = waiting.people.length;
  const who = count === 1 ? "1 person is" : `${count} people are`;
  return `${groupName}: ${who} waiting for week ${waiting.weekNumber}’s ${joinNames(waiting.things, waiting.every ? "and" : "or")}.`;
}

/** The way to the group's pathways and cases page on the rule's week, with the label every pointer to it uses. */
export function slipsWaitingLink(groupId: string, waiting: SlipsWaiting): { href: string; label: string } {
  return { href: `/learn/draw/${encodeURIComponent(groupId)}?week=${waiting.weekNumber}`, label: COPY_IN_THE_SLIPS };
}
