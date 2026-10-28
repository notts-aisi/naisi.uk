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
 *  1. NOBODY WHO HAS BEEN TOLD MOVES. A person whose group Publish has told
 *     them stays in it, and counts against its room.
 *  2. THE RUN'S GROUPS COME FIRST. A group with a time keeps it. A group with
 *     no time is given the best start time no group meets at.
 *  3. MORE GROUPS ONLY WHEN THEY ARE NEEDED. Enough groups for everybody at
 *     the group size; any extra group meets at the next best time no group
 *     meets at, from the times picture's own count (`../handover/times.ts`).
 *  4. THE MOST CONSTRAINED ARE SEATED FIRST, then a seat is found for each
 *     of the rest by moving people already seated where that frees one
 *     (augmenting paths), so the number seated is as large as it can be.
 *  5. THEN THE GROUPS ARE EVENED OUT: somebody moves from the largest group to
 *     a smaller one they can make, while that narrows the gap.
 *
 * Somebody who painted no week, or whose week makes none of the groups, is
 * left for a person to place, with that reason. Pure, with no imports beyond
 * types.
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
};

export type ArrangeGroup = {
  id: string;
  name: string;
  /** Null for a group with no time yet. */
  session: SessionSlot | null;
  /** Null for no limit. */
  capacity: number | null;
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
  /** People who were told their group and were left in it. */
  keptUids: string[];
};

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
}): Plan {
  const size = Math.max(1, Math.floor(input.size));
  const people = [...input.people].sort((a, b) => a.uid.localeCompare(b.uid));

  // 1 and 2: the run's groups, each with a time.
  const used: SessionSlot[] = input.groups.flatMap((group) => (group.session ? [group.session] : []));
  const nextTime = (): SessionSlot | null => {
    for (const time of input.best) {
      const slot = slotFor(time, input.minutes);
      if (!used.some((other) => sameStart(other, slot))) {
        used.push(slot);
        return slot;
      }
    }
    return null;
  };
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

  // Rule 1: the told stay where they are.
  const keptUids: string[] = [];
  const toSeat: ArrangePerson[] = [];
  for (const person of people) {
    const theirs = person.told && person.groupId ? planned.find((group) => group.id === person.groupId) : undefined;
    if (theirs) {
      theirs.memberUids.push(person.uid);
      keptUids.push(person.uid);
    } else {
      toSeat.push(person);
    }
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

  // 4: seat the most constrained first, then augment.
  const seated = new Map<string, number>();
  // Who this plan seats in each group, beside the people kept there.
  const occupants: string[][] = planned.map(() => []);
  const free = (index: number) => planned[index].room - planned[index].memberUids.length - occupants[index].length;
  const order = [...options.keys()].sort(
    (a, b) => options.get(a)!.length - options.get(b)!.length || a.localeCompare(b),
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
  for (const uid of order) {
    // A fresh walk for each person, smallest groups first so the seats spread.
    options.set(
      uid,
      [...options.get(uid)!].sort(
        (a, b) => planned[a].memberUids.length + occupants[a].length - (planned[b].memberUids.length + occupants[b].length) || a - b,
      ),
    );
    if (!tryToSeat(uid, new Set())) unplaced.push({ uid, reason: "no-room" });
  }

  // 5: even them out.
  const sizeOf = (index: number) => planned[index].memberUids.length + occupants[index].length;
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

  planned.forEach((group, index) => {
    group.memberUids = [...group.memberUids, ...occupants[index].sort()];
  });
  return {
    groups: planned,
    unplaced: unplaced.sort((a, b) => a.uid.localeCompare(b.uid)),
    keptUids,
  };
}
