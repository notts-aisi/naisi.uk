// Relative imports, as the week model's own: suites with loaders of their own
// read this file without the "@/" alias.
import { proseText } from "../weekBlocks/prose";
import type { WeekBlock } from "../weekBlocks/model";
import { MAX_PAIR_NUMBER, isPairNumber } from "../../firestore/coursePairs";

/**
 * PAIRS FOR A SESSION IN PAIRS (Technical AI Safety's hands-on night: "Session
 * 5 is hands-on, in pairs, with laptops"): which weeks ask for them, and the
 * group's pairs as one view that every page and the route read alike.
 *
 * WHICH WEEKS. A week asks for pairs when its In the session block says, in
 * what to do before you come, that people are paired ("Your facilitator
 * pairs you"): `pairsAskOf`. It asks who is bringing a laptop when the same
 * words name a laptop. The week's own words decide, never a week number, so
 * a week of any course written that way asks, and no other week does.
 *
 * A PAIR is the people of one group given the same number by its
 * facilitators: two people, or three (a three where the group is odd, or
 * where laptops are short). A save that would leave one person alone in a
 * pair, or put more than three in one, is refused. AT LEAST ONE LAPTOP PER
 * PAIR is a check, never a refusal: a pair with no laptop yet is said, and
 * saved.
 *
 * Pure: the week page, the group page, the pairs page and the route all ask
 * these, so what a facilitator sees and what the route checks are the same.
 */

/** Before you come says people are paired: "has paired you", "pair up", "in pairs". */
const PAIRS_WORDS = /\bpair(?:s|ed|ing)?\b/i;
/** Before you come names a laptop. */
const LAPTOP_WORDS = /\blaptops?\b/i;

/** The smallest and largest pair. */
export const PAIR_SIZE = { min: 2, max: 3 } as const;

export { MAX_PAIR_NUMBER, isPairNumber };

/** What a week asks of its session in pairs: the block that asks, and whether it asks about laptops. */
export type PairsAsk = {
  /** The In the session block's id: what each person's record keys on. */
  blockId: string;
  /** Before you come names a laptop: each person's "bringing a laptop", and the check. */
  laptops: boolean;
};

/**
 * Whether a week asks for pairs, from its own words: the first In the session
 * block whose "Before you come" says people are paired. Null for every other
 * week, a week written before blocks included (it has no blocks to ask).
 */
export function pairsAskOf(blocks: readonly WeekBlock[]): PairsAsk | null {
  for (const block of blocks) {
    if (block.type !== "inTheSession") continue;
    const before = proseText(block.beforeYouCome);
    if (PAIRS_WORDS.test(before)) return { blockId: block.id, laptops: LAPTOP_WORDS.test(before) };
  }
  return null;
}

/** One person's place in the pairs: their pair's number, or null, and whether they bring a laptop. */
export type PairEntry = { pair: number | null; laptop: boolean };

export const NO_ENTRY: PairEntry = { pair: null, laptop: false };

/** One pair: its number, its people in the order they were given, and those of them bringing a laptop. */
export type Pair<P> = { number: number; people: P[]; laptops: P[] };

export type PairsView<P> = {
  /** Every pair with somebody in it, by number. */
  pairs: Array<Pair<P>>;
  /** Everybody with no pair yet, in the order given. */
  notPaired: P[];
  /** The numbers of the pairs with one person in them: a save refuses one. */
  alone: number[];
  /** The numbers of the pairs with more than three people: a save refuses one. */
  tooMany: number[];
  /**
   * The numbers of the pairs with nobody bringing a laptop: the check. Empty
   * when the week asks nothing about laptops.
   */
  noLaptop: number[];
};

/**
 * The group's pairs from each person's entry. `people` is everybody in the
 * group's pairs, in the order a page lists them (the people taking part and
 * the group's facilitators, who take part too): nobody outside the list is
 * ever in a pair, whatever is stored for them.
 */
export function pairsView<P extends { uid: string }>(
  people: readonly P[],
  entryOf: (uid: string) => PairEntry | null | undefined,
  laptops: boolean,
): PairsView<P> {
  const byNumber = new Map<number, Pair<P>>();
  const notPaired: P[] = [];
  for (const person of people) {
    const entry = entryOf(person.uid) ?? NO_ENTRY;
    const number = isPairNumber(entry.pair) ? entry.pair : null;
    if (number === null) {
      notPaired.push(person);
      continue;
    }
    const pair = byNumber.get(number) ?? { number, people: [], laptops: [] };
    pair.people.push(person);
    if (laptops && entry.laptop) pair.laptops.push(person);
    byNumber.set(number, pair);
  }
  const pairs = [...byNumber.values()].sort((a, b) => a.number - b.number);
  return {
    pairs,
    notPaired,
    alone: pairs.filter((pair) => pair.people.length < PAIR_SIZE.min).map((pair) => pair.number),
    tooMany: pairs.filter((pair) => pair.people.length > PAIR_SIZE.max).map((pair) => pair.number),
    noLaptop: laptops ? pairs.filter((pair) => pair.laptops.length === 0).map((pair) => pair.number) : [],
  };
}

/**
 * What a person's week page says about their own pair in one group they take
 * part in (`readOwnPairs`, on the server): first names and whether a laptop is
 * coming, and nothing of any other pair. Handed to the page as these fields.
 */
export type OwnPair = {
  /** The In the session block it is drawn under. */
  blockId: string;
  /** The group's name, said only when the person is paired in more than one group. */
  groupName: string;
  /** The week asks who is bringing a laptop. */
  laptops: boolean;
  /** The first names of the person's partners, in the order the group lists them; empty when not paired. */
  partners: string[];
  /** The person is bringing a laptop. */
  bringing: boolean;
  /** The first names of the partners bringing a laptop. */
  partnersBringing: string[];
  /** Who to tell about a laptop: the first names of the group's facilitators, the person left out. */
  askNames: string[];
};

/** The pair a person is in, or null. */
export function pairOf<P extends { uid: string }>(view: PairsView<P>, uid: string): Pair<P> | null {
  return view.pairs.find((pair) => pair.people.some((person) => person.uid === uid)) ?? null;
}

/**
 * The first pair among `numbers` that a save would refuse: one with a single
 * person in it, or more than three. A save checks only the pairs it touches
 * (the pairs its people leave and join), so a pair left alone by somebody
 * leaving the programme does not stop the facilitators saving anything else.
 */
export function sizeProblemIn<P extends { uid: string }>(
  view: PairsView<P>,
  numbers: Iterable<number>,
): { kind: "alone" | "tooMany"; pair: Pair<P> } | null {
  const touched = new Set(numbers);
  for (const pair of view.pairs) {
    if (!touched.has(pair.number)) continue;
    if (pair.people.length < PAIR_SIZE.min) return { kind: "alone", pair };
    if (pair.people.length > PAIR_SIZE.max) return { kind: "tooMany", pair };
  }
  return null;
}

/** The pair numbers a group's form offers: one for every two people, and any number already in use. */
export function pairNumbersFor(peopleCount: number, inUse: Iterable<number>): number[] {
  const most = Math.min(MAX_PAIR_NUMBER, Math.max(1, Math.floor(peopleCount / PAIR_SIZE.min)));
  const numbers = new Set<number>();
  for (let n = 1; n <= most; n += 1) numbers.add(n);
  for (const n of inUse) if (isPairNumber(n)) numbers.add(n);
  return [...numbers].sort((a, b) => a - b);
}
