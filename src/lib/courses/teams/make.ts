/**
 * MAKING TEAMS, worked out before anything is written.
 *
 * Two ways, one for each kind of run (`CourseRunDoc.teamsFrom`), both pure so
 * a test can run them on the boards' own samples:
 *
 *  - `teamsFromFirstChoices`: the agenda people ranked on the application
 *    form, made into teams from first choices, within the run's smallest and
 *    largest team (in-agenda);
 *  - `pitchTeamPeople`: who goes into a team made from one pitch (in-teams,
 *    option C).
 *
 * Neither ever puts a person in two teams, and neither decides anything about
 * who may make teams: the caller has asked that already.
 */

export type TeamSizes = { min: number; max: number };

/** One person taking part, with what they ranked, first choice first. */
export type RankedPerson = { uid: string; name: string; ranking: readonly string[] };

/** People in the order a contested place goes to them: fewest items ranked first, then by name, then by id. */
function contestOrder(a: RankedPerson, b: RankedPerson): number {
  return (
    a.ranking.length - b.ranking.length ||
    a.name.localeCompare(b.name, "en-GB") ||
    a.uid.localeCompare(b.uid)
  );
}

/**
 * TEAMS FROM FIRST CHOICES, for one group's people.
 *
 *  1. In rounds by rank, each person not yet in a team asks for their choice
 *     at that rank. An item takes people up to the largest team; where more
 *     ask than it has room for, the people who ranked fewest items go first
 *     (they have fewest places left to go), then by name. Somebody turned
 *     away asks for their next choice in the next round.
 *  2. Then a team below the smallest size is let go: the smallest of them
 *     (fewest people, then the fewest who put it first, then the fewest who
 *     ranked it at all, then the later on the agenda), whose people go back
 *     to step 1 with that item closed to them. One at a time, because letting
 *     one go can bring another up to size.
 *  3. When no team is below the smallest size, what is left are the teams.
 *
 * Somebody who ranked nothing, or whose every choice filled up or was let go,
 * is in no team: the lead puts them in one by hand. `items` is the agenda in
 * the form's order, and the teams come back in that order.
 */
export function teamsFromFirstChoices(
  people: readonly RankedPerson[],
  items: readonly string[],
  sizes: TeamSizes,
): { teams: Array<{ item: string; uids: string[] }>; unplaced: string[] } {
  const known = new Set(items);
  // Each person's ranking, kept to the items on the agenda, once each.
  const ranked = people.map((person) => ({
    ...person,
    ranking: person.ranking.filter((item, at, all) => known.has(item) && all.indexOf(item) === at),
  }));
  const open = new Set(items);
  const placed = new Map<string, string>();
  const firstChoices = new Map(items.map((item) => [item, ranked.filter((person) => person.ranking[0] === item).length]));
  const rankedAtAll = new Map(items.map((item) => [item, ranked.filter((person) => person.ranking.includes(item)).length]));
  const membersOf = (item: string) => ranked.filter((person) => placed.get(person.uid) === item);
  const depth = Math.max(0, ...ranked.map((person) => person.ranking.length));

  for (;;) {
    for (let rank = 0; rank < depth; rank += 1) {
      for (const item of items) {
        if (!open.has(item)) continue;
        const room = sizes.max - membersOf(item).length;
        if (room <= 0) continue;
        const asking = ranked
          .filter((person) => !placed.has(person.uid) && person.ranking[rank] === item)
          .sort(contestOrder);
        for (const person of asking.slice(0, room)) placed.set(person.uid, item);
      }
    }
    const small = items.filter((item) => {
      const count = membersOf(item).length;
      return open.has(item) && count > 0 && count < sizes.min;
    });
    if (small.length === 0) break;
    const letGo = small
      .map((item) => ({
        item,
        at: items.indexOf(item),
        count: membersOf(item).length,
        first: firstChoices.get(item) ?? 0,
        demand: rankedAtAll.get(item) ?? 0,
      }))
      .sort((a, b) => a.count - b.count || a.first - b.first || a.demand - b.demand || b.at - a.at)[0];
    open.delete(letGo.item);
    for (const person of membersOf(letGo.item)) placed.delete(person.uid);
  }

  // A team's people in name order, as the tab lists them.
  const byName = (a: RankedPerson, b: RankedPerson) => a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid);
  const teams = items
    .filter((item) => open.has(item) && membersOf(item).length > 0)
    .map((item) => ({ item, uids: membersOf(item).sort(byName).map((person) => person.uid) }));
  const unplaced = ranked.filter((person) => !placed.has(person.uid)).map((person) => person.uid);
  return { teams, unplaced };
}

/**
 * WHO GOES INTO A TEAM MADE FROM ONE PITCH.
 *
 * Its pitchers first, wherever they are now: a pitch's pitchers belong to its
 * team, so one already in another team is taken out of it (`takenFrom`).
 * Then the people who said they would join it and are in no team yet, the
 * people who picked fewest pitches first (it was more likely their choice),
 * then by name, until the team is at the largest size. Only people taking
 * part in the pitch's own group count: `inGroup` is that group's.
 *
 * `short` is true when the team would be smaller than the smallest size; the
 * caller refuses to make it then.
 */
export function pitchTeamPeople(input: {
  pitcherUids: readonly string[];
  wouldJoinUids: readonly string[];
  /** People taking part in the pitch's group, by id, with the name the tab shows. */
  inGroup: ReadonlyMap<string, string>;
  /** Who is in a team now, by id, and which team. */
  teamOf: ReadonlyMap<string, string>;
  /** How many pitches of that week and group each person said they would join. */
  picks: ReadonlyMap<string, number>;
  sizes: TeamSizes;
}): { uids: string[]; takenFrom: Array<{ uid: string; teamId: string }>; short: boolean } {
  const { inGroup, teamOf, picks, sizes } = input;
  const pitchers = input.pitcherUids.filter((uid) => inGroup.has(uid)).slice(0, sizes.max);
  const takenFrom = pitchers
    .filter((uid) => teamOf.has(uid))
    .map((uid) => ({ uid, teamId: teamOf.get(uid) as string }));
  const joiners = input.wouldJoinUids
    .filter((uid, at, all) => all.indexOf(uid) === at)
    .filter((uid) => inGroup.has(uid) && !pitchers.includes(uid) && !teamOf.has(uid))
    .sort(
      (a, b) =>
        (picks.get(a) ?? 0) - (picks.get(b) ?? 0) ||
        (inGroup.get(a) ?? "").localeCompare(inGroup.get(b) ?? "", "en-GB") ||
        a.localeCompare(b),
    );
  const uids = [...pitchers, ...joiners.slice(0, Math.max(0, sizes.max - pitchers.length))];
  return { uids, takenFrom, short: uids.length < sizes.min };
}
