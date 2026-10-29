import { canMake, planGroups, slotFor, stayingIn, type ArrangeGroup, type ArrangePerson, type CandidateTime, type Plan } from "./plan";

/**
 * SEVERAL WORKABLE ARRANGEMENTS, NOT ONE, for Claude to weigh and an admin to
 * choose between.
 *
 * Each is `./plan.ts`'s own arithmetic, asked a different question:
 *
 *  - WHICH TIMES. Where a group still needs a time, every combination of the
 *    best start times (the times picture's own count, most people first) is
 *    tried, so an option can trade the single most popular evening for a
 *    spread that seats more people or puts a facilitator in every group.
 *  - HOW BIG. The programme's group size, and one smaller, which makes one
 *    more group where the people need it.
 *  - ROOM FOR THE PEOPLE LEFT OUT. Where three or more who marked a real
 *    week fit none of an option's groups, the same option is tried with one
 *    or two groups more, at the times most of them can make.
 *  - WHETHER A GROUP KEEPS ITS TIME. The run's groups at the times they have
 *    now is always one of the options. The others may give a new time to any
 *    group nobody stays in (the screen marks it "new time", and Apply changes
 *    it through the group's own time route); a group somebody stays in
 *    (`./plan.ts` rule 1), a group with a facilitator, and a group Publish has
 *    told anybody the time of keep their time in every option.
 *
 * Then each is evened out for FACILITATORS (`spreadFacilitators`): every
 * group with somebody in it who offered to facilitate, and the strongest of
 * them spread so no group holds two while another has none. Strength is the
 * site's guess before Claude has said anything (`Strength`): whether they
 * offered, then the lean of Claude's earlier read, less for thin answers.
 *
 * Everything `./plan.ts` promises holds for every option: nobody already
 * placed moves (unless the admin starts again, and then never the told or a
 * facilitator), nobody is seated in a group they cannot make (except the
 * people who marked little time and were placed near it, rule 6), no group
 * goes past its room. Options are compared (`scoreOf`) by how many people who
 * marked a real week are seated, then how few are only near their time, then
 * how many groups have somebody who offered to facilitate, then how even the
 * groups are, then how many people could make the times chosen; the best few
 * that differ in their times are kept first.
 *
 * Pure, with no imports beyond the planner.
 */

/** The most options Claude is shown. */
export const MAX_CANDIDATES = 8;
/** The most an admin is shown. */
export const MAX_OPTIONS = 5;
/** How many of the best start times combinations are drawn from. */
const TOP_TIMES = 8;
/** The most combinations tried for one group size. */
const MAX_COMBINATIONS = 70;
/** How many people left out of an option it takes to try one with more groups. */
const LEFT_OUT_FOR_MORE = 3;

/** How strongly the site guesses somebody might lead a group: 0 for somebody who did not offer. */
export type Strength = ReadonlyMap<string, number>;

export type CandidateScore = {
  /** People who marked a real week, seated in a group they can make. */
  seated: number;
  /** People seated near their time, not in it. */
  near: number;
  unplaced: number;
  /** Groups with somebody in them who offered to facilitate. */
  covered: number;
  /** The largest group less the smallest. */
  spread: number;
  /** For each group, how many of the people could make its time, added up. */
  reach: number;
};

export type Candidate = {
  plan: Plan;
  /** The group size it was planned at. */
  size: number;
  score: CandidateScore;
};

const timeKey = (plan: Plan) =>
  plan.groups
    .map((group) => `${group.session.weekday}@${group.session.startTimeLocal}`)
    .sort()
    .join(",");

const planKey = (plan: Plan) =>
  plan.groups
    .map((group) => `${group.session.weekday}@${group.session.startTimeLocal}:${[...group.memberUids].sort().join("+")}`)
    .sort()
    .join("|");

/** Every way of picking `k` of `n` indices, in order, up to `limit` of them. */
function combinations(n: number, k: number, limit: number): number[][] {
  const out: number[][] = [];
  const pick = (from: number, chosen: number[]) => {
    if (out.length >= limit) return;
    if (chosen.length === k) {
      out.push([...chosen]);
      return;
    }
    for (let i = from; i <= n - (k - chosen.length); i += 1) pick(i + 1, [...chosen, i]);
  };
  if (k > 0 && k <= n) pick(0, []);
  return out;
}

export function scoreOf(plan: Plan, people: ReadonlyMap<string, ArrangePerson>): CandidateScore {
  const near = new Set(plan.nearUids);
  const sizes = plan.groups.map((group) => group.memberUids.length);
  let seated = 0;
  for (const group of plan.groups) {
    for (const uid of group.memberUids) {
      const person = people.get(uid);
      if (person && !near.has(uid) && !(person.week.kind === "given" && person.week.minimal === true)) seated += 1;
    }
  }
  return {
    seated,
    near: near.size,
    unplaced: plan.unplaced.length,
    covered: plan.groups.filter((group) => group.memberUids.some((uid) => people.get(uid)?.facilitates)).length,
    spread: sizes.length > 0 ? Math.max(...sizes) - Math.min(...sizes) : 0,
    reach: plan.groups.reduce(
      (sum, group) => sum + [...people.values()].filter((person) => canMake(person, group.session)).length,
      0,
    ),
  };
}

/** Better first. */
export function compareScores(a: CandidateScore, b: CandidateScore): number {
  return (
    b.seated - a.seated ||
    a.near - b.near ||
    a.unplaced - b.unplaced ||
    b.covered - a.covered ||
    a.spread - b.spread ||
    b.reach - a.reach
  );
}

/**
 * The plan with its facilitators spread: first, every group that has nobody
 * who offered is given somebody who did, from a group with two or more; then
 * the strongest (`strength` of 3 or more) are shared out the same way, so no
 * group holds two while another has none. A person moves only to a group
 * they can make, with room, or by swapping with somebody who did not offer
 * and can make the other group. Nobody who stays where they are (`keptUids`:
 * told, facilitating, or placed already) moves, and nobody placed near their
 * time does either.
 */
export function spreadFacilitators(
  plan: Plan,
  people: ReadonlyMap<string, ArrangePerson>,
  strength: Strength,
): Plan {
  const groups = plan.groups.map((group) => ({ ...group, memberUids: [...group.memberUids] }));
  const fixed = new Set([...plan.keptUids, ...plan.nearUids]);
  const strengthOf = (uid: string) => strength.get(uid) ?? (people.get(uid)?.facilitates ? 1 : 0);
  const offered = (uid: string) => people.get(uid)?.facilitates === true;
  const strong = (uid: string) => offered(uid) && strengthOf(uid) >= 3;
  const movable = (uid: string, to: number) => {
    const person = people.get(uid);
    return Boolean(person) && !fixed.has(uid) && canMake(person!, groups.at(to)!.session);
  };

  /** Move somebody counted by `counts` from a group with two or more into a group with none. */
  const fill = (counts: (uid: string) => boolean): boolean => {
    const target = groups.findIndex((group) => !group.memberUids.some(counts));
    if (target < 0) return false;
    // Sources with the most to spare first; within a source, keep its strongest.
    const sources = groups
      .map((group, index) => ({ index, spare: group.memberUids.filter(counts) }))
      .filter((source) => source.index !== target && source.spare.length >= 2)
      .sort((a, b) => b.spare.length - a.spare.length || a.index - b.index);
    for (const source of sources) {
      const keep = [...source.spare].sort((a, b) => strengthOf(b) - strengthOf(a) || a.localeCompare(b))[0];
      const candidates = source.spare.filter((uid) => uid !== keep).sort((a, b) => strengthOf(b) - strengthOf(a) || a.localeCompare(b));
      for (const uid of candidates) {
        if (!movable(uid, target)) continue;
        const from = groups.at(source.index)!;
        const to = groups.at(target)!;
        if (to.memberUids.length < to.room) {
          from.memberUids.splice(from.memberUids.indexOf(uid), 1);
          to.memberUids.push(uid);
          return true;
        }
        // Full: swap with somebody who did not offer and can make the other group.
        const other = to.memberUids
          .filter((candidate) => !offered(candidate) && movable(candidate, source.index))
          .sort()[0];
        if (other) {
          from.memberUids.splice(from.memberUids.indexOf(uid), 1, other);
          to.memberUids.splice(to.memberUids.indexOf(other), 1, uid);
          return true;
        }
      }
    }
    return false;
  };

  // A group that cannot be helped is left; the loop ends when nothing moves.
  for (let guard = 0; guard < 50 && fill(offered); guard += 1);
  for (let guard = 0; guard < 50 && fill(strong); guard += 1);
  return { ...plan, groups };
}

/**
 * Up to `MAX_CANDIDATES` workable arrangements, best first, the ones whose
 * times differ before the ones that differ only in who sits where.
 */
export function candidatePlans(input: {
  people: readonly ArrangePerson[];
  groups: readonly ArrangeGroup[];
  best: readonly CandidateTime[];
  minutes: number;
  size: number;
  names: (taken: readonly string[]) => string;
  strength: Strength;
  /** Seat afresh everybody placed and not told (`./plan.ts`, rule 1). */
  startAgain?: boolean;
}): Candidate[] {
  const people = new Map(input.people.map((person) => [person.uid, person] as const));
  const startAgain = input.startAgain === true;
  const sizes = [...new Set([input.size, input.size - 1])].filter((size) => size >= 3);
  const seen = new Set<string>();
  const found: Candidate[] = [];

  const consider = (groups: readonly ArrangeGroup[], best: readonly CandidateTime[], size: number, extra = 0): Candidate | null => {
    const planned = planGroups({ people: input.people, groups, best, minutes: input.minutes, size, names: input.names, extra, startAgain });
    // A group given back the time it has already is not a new time.
    for (const group of planned.groups) {
      const had = group.id ? input.groups.find((each) => each.id === group.id)?.session : null;
      if (had && had.weekday === group.session.weekday && had.startTimeLocal === group.session.startTimeLocal) group.timeIsNew = false;
    }
    const plan = spreadFacilitators(planned, people, input.strength);
    if (plan.groups.length === 0) return null;
    const key = planKey(plan);
    if (seen.has(key)) return found.find((candidate) => planKey(candidate.plan) === key) ?? null;
    seen.add(key);
    const candidate = { plan, size, score: scoreOf(plan, people) };
    found.push(candidate);
    return candidate;
  };

  // A group somebody stays in, or that keeps its time, keeps it; any other may be given a new one.
  const liveIds = new Set(input.groups.map((group) => group.id));
  const occupied = new Set(input.people.map((person) => stayingIn(person, liveIds, startAgain)).filter((id) => id !== null));
  const fixed = (group: ArrangeGroup) => group.keepsTime === true || group.staffed === true || occupied.has(group.id);
  const loose = input.groups.map((group) => (fixed(group) ? group : { ...group, session: null }));
  // Only worth trying when some group with a time could be given another.
  const layouts = input.groups.some((group) => group.session !== null && !fixed(group))
    ? [input.groups, loose]
    : [input.groups];

  // The run's groups at their own times, at the programme's own size.
  const asTheyAre = consider(input.groups, input.best, input.size);
  for (const groups of layouts) {
    for (const size of sizes) {
      const base = planGroups({ people: input.people, groups, best: input.best, minutes: input.minutes, size, names: input.names, startAgain });
      consider(groups, input.best, size);
      const needed = base.groups.filter((group) => group.timeIsNew).length;
      const top = input.best.slice(0, TOP_TIMES);
      for (const picked of combinations(top.length, needed, MAX_COMBINATIONS)) {
        const first = picked.map((index) => top[index]);
        consider(groups, [...first, ...input.best.filter((time) => !first.includes(time))], size);
      }
      // People left out: the same times, and one or two groups more where most of them can come.
      const leftOut = base.unplaced.filter((entry) => entry.reason !== "no-week").map((entry) => entry.uid);
      if (leftOut.length >= LEFT_OUT_FOR_MORE) {
        const sameSlot = (time: CandidateTime, group: { session: { weekday: number; startTimeLocal: string } }) => {
          const slot = slotFor(time, input.minutes);
          return slot.weekday === group.session.weekday && slot.startTimeLocal === group.session.startTimeLocal;
        };
        const kept = base.groups
          .filter((group) => group.timeIsNew)
          .flatMap((group) => input.best.filter((time) => sameSlot(time, group)).slice(0, 1));
        const forThem = input.best
          .filter((time) => !kept.includes(time) && !base.groups.some((group) => sameSlot(time, group)))
          .map((time) => ({
            time,
            fits: leftOut.filter((uid) => {
              const person = people.get(uid);
              return person ? canMake(person, slotFor(time, input.minutes)) : false;
            }).length,
          }))
          .filter((entry) => entry.fits >= 2)
          .sort((a, b) => b.fits - a.fits)
          .slice(0, 4)
          .map((entry) => entry.time);
        for (const extra of [1, 2]) {
          for (const picked of combinations(forThem.length, extra, 6)) {
            const first = [...kept, ...picked.map((index) => forThem[index])];
            consider(groups, [...first, ...input.best.filter((time) => !first.includes(time))], size, extra);
          }
        }
      }
    }
  }

  found.sort((a, b) => compareScores(a.score, b.score));
  // Different times first, then the rest, keeping each list's order.
  const times = new Set<string>();
  const distinct: Candidate[] = [];
  const rest: Candidate[] = [];
  for (const candidate of found) {
    const key = `${candidate.size}:${timeKey(candidate.plan)}`;
    if (times.has(key)) rest.push(candidate);
    else {
      times.add(key);
      distinct.push(candidate);
    }
  }
  const ordered = [...distinct, ...rest];
  // The groups as they are is always there to compare with, among the first an admin is shown.
  const at = asTheyAre ? ordered.indexOf(asTheyAre) : -1;
  if (asTheyAre && at >= MAX_OPTIONS) {
    ordered.splice(at, 1);
    ordered.splice(MAX_OPTIONS - 1, 0, asTheyAre);
  }
  return ordered.slice(0, MAX_CANDIDATES);
}
