import type { SessionSlot } from "@/lib/admissions/availability";
import type { PaintedWeek } from "../handover/paintedWeek";

/**
 * A FIRST ARRANGEMENT OF A PROGRAMME'S PEOPLE INTO GROUPS, worked out from
 * when each of them said they are free.
 *
 * This is arithmetic, not judgement: who can make which group's weekly
 * session, and how to seat as many people as possible with the groups as
 * even as they can be. Claude's part (`./advise.ts`) comes after, and only
 * suggests changes this file can check. Nothing here writes: an admin reads
 * the proposal, and pressing Apply places people through the site's own
 * routes, which ask every question they always ask.
 *
 * The rules, in order:
 *
 *  1. NOBODY ALREADY PLACED MOVES. A person whose group Publish has told
 *     them stays in it; so does everybody an admin has placed in a group
 *     already, told or not; and so does everybody who facilitates one of the
 *     run's groups (`appointed`), in the group they facilitate, since that is
 *     the only group the site will seat them in. Each counts against their
 *     group's room. Only `startAgain` lets the people placed and not told be
 *     seated afresh, and even then the told and the appointed stay.
 *  2. THE RUN'S GROUPS COME FIRST. A group with a time keeps it. A group with
 *     no time is given the best start time no group meets at, one somebody
 *     who offered to facilitate can make where there is one.
 *  3. MORE GROUPS ONLY WHEN THEY ARE NEEDED. Enough groups for everybody at
 *     the group size; any extra group meets at the next best time no group
 *     meets at, from the times picture's own count (`../handover/times.ts`),
 *     again one that somebody who offered and is not needed elsewhere can
 *     make where there is one.
 *  4. EVERYBODY WHO MARKED A REAL WEEK IS SEATED BEFORE ANYBODY WHO MARKED
 *     LITTLE TIME (under four hours: `minimal`, read "from then on" by
 *     `../handover/paintedWeek.ts`). Within each, THE PEOPLE WHO OFFERED TO
 *     FACILITATE COME FIRST, each to a group they can make with nobody who
 *     offered in it where there is one, then the most constrained first. A
 *     seat is then found for each of the rest by moving people already
 *     seated where that frees one (augmenting paths), which never unseats
 *     anybody, so the number seated is as large as it can be and nobody who
 *     marked a real week, or offered, loses a seat to somebody after them.
 *  5. THEN THE GROUPS ARE EVENED OUT: somebody moves from the largest group to
 *     a smaller one they can make, while that narrows the gap.
 *  6. SOMEBODY WHO MARKED LITTLE TIME AND STILL HAS NO SEAT goes to the
 *     nearest group with room (`nearness`): one meeting after their first
 *     marked time on a day they marked, then after it on another day, then
 *     before it. They are listed as `nearUids`, so the screen says "near their
 *     time, not in it" and somebody checks with them.
 *
 * Somebody who painted no week, or who marked a real week that makes none of
 * the groups, is left for a person to place, with that reason. Pure, with no
 * imports beyond types.
 */

export type ArrangePerson = {
  uid: string;
  name: string;
  week: PaintedWeek;
  /** They said they would like to facilitate this programme. */
  facilitates: boolean;
  /** The group they are in now, if any. */
  groupId: string | null;
  /** Publish has told them their group: they stay in it. */
  told: boolean;
  /**
   * The run's groups they facilitate, by id: they sit in that group and in no
   * other (the allocate route refuses anything else), so they stay there.
   */
  appointed?: readonly string[];
  /**
   * The stretches they marked, for an admin's chart of their week. Never in
   * anything sent to Claude: Claude is told only which groups they can make.
   */
  marked?: readonly { weekday: number; start: number; end: number }[];
};

export type ArrangeGroup = {
  id: string;
  name: string;
  /** Null for a group with no time yet. */
  session: SessionSlot | null;
  /** Null for no limit. */
  capacity: number | null;
  /** It has a facilitator on the run already, who may hold no place on it. */
  staffed?: boolean;
  /**
   * Its time stays as it is in every arrangement: Publish has told somebody
   * it, or somebody facilitates it. Read by `./options.ts`, which may try
   * another time for any other group nobody stays in.
   */
  keepsTime?: boolean;
};

export type CandidateTime = { weekday: number; start: number };

export type PlannedGroup = {
  /** The run's group, or null for one this plan would add. */
  id: string | null;
  name: string;
  session: SessionSlot;
  /** Whether this plan gives the group its time (it had none, or is new). */
  timeIsNew: boolean;
  /** How many it may hold. */
  room: number;
  memberUids: string[];
};

export type Unplaced = { uid: string; reason: "no-week" | "fits-none" | "no-room" };

export type Plan = {
  groups: PlannedGroup[];
  unplaced: Unplaced[];
  /**
   * People who stay where they are (rule 1): told, facilitating the group
   * they sit in, or (unless starting again) placed already. Somebody kept in
   * a group this plan could not give a time is in no group of it, and stays.
   */
  keptUids: string[];
  /** People who marked little time, seated in the group nearest their time rather than one they marked (rule 6). */
  nearUids: string[];
};

const minutesOf = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/**
 * How near a group is to when somebody said they are free, best first: after
 * their first marked time on that day (0), after their earliest marked time
 * on another day (1), before it on that day (2), before it on another (3);
 * then by how far. Rule 6.
 */
export function nearness(firstMarks: readonly (number | null)[], session: SessionSlot): [number, number] {
  const start = minutesOf(session.startTimeLocal);
  const mark = firstMarks[session.weekday] ?? null;
  if (mark !== null) return start >= mark ? [0, start - mark] : [2, mark - start];
  const marks = firstMarks.filter((m): m is number => m !== null);
  if (marks.length === 0) return [3, 0];
  const earliest = Math.min(...marks);
  return start >= earliest ? [1, start - earliest] : [3, earliest - start];
}

const isMinimal = (person: Pick<ArrangePerson, "week">) => person.week.kind === "given" && person.week.minimal === true;

const pad = (n: number) => String(n).padStart(2, "0");

export function slotFor(time: CandidateTime, minutes: number): SessionSlot {
  return {
    weekday: time.weekday,
    startTimeLocal: `${pad(Math.floor(time.start / 60))}:${pad(time.start % 60)}`,
    durationMinutes: minutes,
  };
}

const sameStart = (a: SessionSlot, b: SessionSlot) =>
  a.weekday === b.weekday && a.startTimeLocal === b.startTimeLocal;

/** Whether this person can make this session, by the one reading of their week. */
export function canMake(person: Pick<ArrangePerson, "week">, session: SessionSlot): boolean {
  return person.week.kind === "given" && person.week.covers(session);
}

/**
 * The run's group somebody stays in whatever is suggested (rule 1), or null
 * when they may be seated afresh: the group they facilitate (the one they sit
 * in, if they facilitate several), else the group they are in when Publish
 * has told them it or, unless starting again, when they are in one at all.
 * `liveIds` is the run's live groups: a seat in any other group is no seat.
 */
export function stayingIn(
  person: Pick<ArrangePerson, "groupId" | "told" | "appointed">,
  liveIds: ReadonlySet<string>,
  startAgain: boolean,
): string | null {
  const appointed = (person.appointed ?? []).filter((id) => liveIds.has(id));
  if (appointed.length > 0) return person.groupId !== null && appointed.includes(person.groupId) ? person.groupId : appointed[0];
  if (person.groupId === null || !liveIds.has(person.groupId)) return null;
  return person.told || !startAgain ? person.groupId : null;
}

/**
 * The plan. `best` is the times picture's start times, best first; `size` the
 * group size to aim for; `names` makes the name of each group the plan adds.
 */
export function planGroups(input: {
  people: readonly ArrangePerson[];
  groups: readonly ArrangeGroup[];
  best: readonly CandidateTime[];
  minutes: number;
  size: number;
  names: (taken: readonly string[]) => string;
  /** Groups to add beyond the ones the people need, at the next best times: an option with room for more fits. */
  extra?: number;
  /**
   * Seat afresh everybody placed and not yet told ("Start again"). The told,
   * and everybody facilitating one of the run's groups, stay where they are.
   */
  startAgain?: boolean;
}): Plan {
  const size = Math.max(1, Math.floor(input.size));
  const people = [...input.people].sort((a, b) => a.uid.localeCompare(b.uid));
  const offered = (person: ArrangePerson) => person.facilitates === true;
  const liveIds = new Set(input.groups.map((group) => group.id));

  // Rule 1: who stays where they are, and in which of the run's groups.
  const stayIn = new Map<string, string>();
  for (const person of people) {
    const groupId = stayingIn(person, liveIds, input.startAgain === true);
    if (groupId !== null) stayIn.set(person.uid, groupId);
  }

  // People who offered to facilitate and are still to be seated. Each group
  // the plan gives a time is given one one of them can make, where there is
  // one, and that person is then counted on for it (`counted`).
  const spare = people.filter((person) => offered(person) && !stayIn.has(person.uid) && person.week.kind === "given");
  const counted = new Set<string>();
  const offererFor = (session: SessionSlot) =>
    spare.find((person) => !counted.has(person.uid) && canMake(person, session)) ?? null;

  // 2: the run's groups, each with a time.
  const used: SessionSlot[] = input.groups.flatMap((group) => (group.session ? [group.session] : []));
  const nextTime = (): SessionSlot | null => {
    const free = input.best
      .map((time) => slotFor(time, input.minutes))
      .filter((slot) => !used.some((other) => sameStart(other, slot)));
    const slot = free.find((each) => offererFor(each) !== null) ?? free[0] ?? null;
    if (!slot) return null;
    used.push(slot);
    const offerer = offererFor(slot);
    if (offerer) counted.add(offerer.uid);
    return slot;
  };
  // A group with a time, and nobody staying in it who offered and no
  // facilitator, counts on somebody who offered and can make it, first.
  for (const group of input.groups) {
    if (!group.session || group.staffed) continue;
    if (people.some((person) => stayIn.get(person.uid) === group.id && offered(person))) continue;
    const offerer = offererFor(group.session);
    if (offerer) counted.add(offerer.uid);
  }
  const planned: PlannedGroup[] = [];
  for (const group of input.groups) {
    const session = group.session ?? nextTime();
    if (!session) continue;
    planned.push({
      id: group.id,
      name: group.name,
      session,
      timeIsNew: group.session === null,
      room: group.capacity ?? size,
      memberUids: [],
    });
  }

  // Rule 1: everybody staying put, in their group. Somebody whose group the
  // plan could give no time stays where they are, in no group of the plan.
  const keptUids: string[] = [];
  const toSeat: ArrangePerson[] = [];
  for (const person of people) {
    const groupId = stayIn.get(person.uid);
    if (groupId === undefined) {
      toSeat.push(person);
      continue;
    }
    planned.find((group) => group.id === groupId)?.memberUids.push(person.uid);
    keptUids.push(person.uid);
  }

  // 3: more groups, only as many as the people need.
  const room = () => planned.reduce((sum, group) => sum + Math.max(0, group.room - group.memberUids.length), 0);
  while (room() < toSeat.filter((person) => person.week.kind === "given").length) {
    const session = nextTime();
    if (!session) break;
    planned.push({
      id: null,
      name: input.names(planned.map((group) => group.name)),
      session,
      timeIsNew: true,
      room: size,
      memberUids: [],
    });
  }

  for (let added = 0; added < (input.extra ?? 0); added += 1) {
    const session = nextTime();
    if (!session) break;
    planned.push({
      id: null,
      name: input.names(planned.map((group) => group.name)),
      session,
      timeIsNew: true,
      room: size,
      memberUids: [],
    });
  }

  const unplaced: Unplaced[] = [];
  const options = new Map<string, number[]>();
  for (const person of toSeat) {
    if (person.week.kind !== "given") {
      unplaced.push({ uid: person.uid, reason: "no-week" });
      continue;
    }
    const fits = planned.flatMap((group, index) => (canMake(person, group.session) ? [index] : []));
    if (fits.length === 0) unplaced.push({ uid: person.uid, reason: "fits-none" });
    else options.set(person.uid, fits);
  }

  // 4: seat the most constrained first, the people who offered before the
  // rest, then augment.
  const seated = new Map<string, number>();
  // Who this plan seats in each group, beside the people kept there.
  const occupants: string[][] = planned.map(() => []);
  const free = (index: number) => planned[index].room - planned[index].memberUids.length - occupants[index].length;
  const byUid = new Map(people.map((person) => [person.uid, person] as const));
  const offerers = (index: number) =>
    [...planned[index].memberUids, ...occupants[index]].filter((uid) => {
      const person = byUid.get(uid);
      return person !== undefined && offered(person);
    }).length;
  const staffedIds = new Set(input.groups.filter((group) => group.staffed).map((group) => group.id));
  const minimalUids = new Set(toSeat.filter(isMinimal).map((person) => person.uid));
  const offeredUids = new Set(toSeat.filter(offered).map((person) => person.uid));
  const order = [...options.keys()].sort(
    (a, b) =>
      Number(minimalUids.has(a)) - Number(minimalUids.has(b)) ||
      Number(offeredUids.has(b)) - Number(offeredUids.has(a)) ||
      options.get(a)!.length - options.get(b)!.length ||
      a.localeCompare(b),
  );
  const tryToSeat = (uid: string, visited: Set<number>): boolean => {
    for (const index of options.get(uid)!) {
      if (visited.has(index)) continue;
      visited.add(index);
      if (free(index) > 0) {
        occupants[index].push(uid);
        seated.set(uid, index);
        return true;
      }
      for (const other of [...occupants[index]]) {
        if (tryToSeat(other, visited)) {
          occupants[index].splice(occupants[index].indexOf(other), 1);
          // `other` has been seated elsewhere by the call above.
          occupants[index].push(uid);
          seated.set(uid, index);
          return true;
        }
      }
    }
    return false;
  };
  const sizeNow = (index: number) => planned[index].memberUids.length + occupants[index].length;
  for (const uid of order) {
    // A fresh walk for each person, smallest groups first so the seats spread;
    // somebody who offered, groups with nobody who offered (and no facilitator) first.
    const facilitates = offeredUids.has(uid);
    const covered = (index: number) =>
      facilitates ? (staffedIds.has(planned[index].id ?? "") ? 1 : 0) + offerers(index) : 0;
    options.set(
      uid,
      [...options.get(uid)!].sort((a, b) => covered(a) - covered(b) || sizeNow(a) - sizeNow(b) || a - b),
    );
    if (!tryToSeat(uid, new Set())) unplaced.push({ uid, reason: "no-room" });
  }

  // 5: even them out.
  const sizeOf = sizeNow;
  for (let moved = true, guard = 0; moved && guard < 1000; guard += 1) {
    moved = false;
    const largest = planned.map((_, index) => index).sort((a, b) => sizeOf(b) - sizeOf(a) || a - b);
    for (const from of largest) {
      for (const uid of [...occupants[from]].sort()) {
        const to = options
          .get(uid)!
          .filter((index) => index !== from && free(index) > 0 && sizeOf(index) + 1 < sizeOf(from))
          .sort((a, b) => sizeOf(a) - sizeOf(b) || a - b)[0];
        if (to === undefined) continue;
        occupants[from].splice(occupants[from].indexOf(uid), 1);
        occupants[to].push(uid);
        seated.set(uid, to);
        moved = true;
        break;
      }
      if (moved) break;
    }
  }

  // 6: somebody who marked little time and has no seat goes to the nearest group with room.
  const nearUids: string[] = [];
  const firstMarksOf = new Map(
    toSeat.flatMap((person) =>
      person.week.kind === "given" && person.week.minimal ? [[person.uid, person.week.firstMarks ?? []] as const] : [],
    ),
  );
  for (const entry of [...unplaced].sort((a, b) => a.uid.localeCompare(b.uid))) {
    const firstMarks = firstMarksOf.get(entry.uid);
    if (!firstMarks || entry.reason === "no-week") continue;
    const nearest = planned
      .map((group, index) => ({ index, near: nearness(firstMarks, group.session) }))
      .filter(({ index }) => free(index) > 0)
      .sort(
        (a, b) =>
          a.near[0] - b.near[0] || a.near[1] - b.near[1] || sizeOf(a.index) - sizeOf(b.index) || a.index - b.index,
      )[0];
    if (!nearest) continue;
    occupants[nearest.index].push(entry.uid);
    nearUids.push(entry.uid);
    unplaced.splice(unplaced.indexOf(entry), 1);
  }

  planned.forEach((group, index) => {
    group.memberUids = [...group.memberUids, ...occupants[index].sort()];
  });
  return {
    groups: planned,
    unplaced: unplaced.sort((a, b) => a.uid.localeCompare(b.uid)),
    keptUids,
    nearUids: nearUids.sort(),
  };
}
