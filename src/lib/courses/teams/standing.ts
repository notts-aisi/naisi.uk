import { byMaking, type TeamDoc } from "./model";

/**
 * THE RUN'S TEAMS AS THEY STAND, from what is stored and who takes part now.
 *
 * A team's stored members are who the lead put in it. Its people now are the
 * ones of them who still take part (a live learner seat in one of the run's
 * groups, told by Publish, with an account that stands) and whose seat is in
 * the team's own group. So somebody who leaves, moves to another group or
 * whose account no longer stands drops off their team at once, and comes back
 * if that changes back. A person is in one team at most: should stored teams
 * ever both name somebody, the team made first keeps them.
 *
 * Pure: the caller reads the teams and the people.
 */

/** A person taking part, as the Teams tab and the email know them. */
export type Participant = {
  uid: string;
  /** The name a group already sees (`displayNameOf`): never an address. */
  name: string;
  /** The group whose weekly session they come to. */
  groupId: string;
};

export type StandingTeam = {
  team: TeamDoc;
  /** Its people now, in the order they were put in it. */
  uids: string[];
};

export function standingTeams(
  teams: readonly TeamDoc[],
  takingPart: ReadonlyMap<string, Participant>,
): StandingTeam[] {
  const seen = new Set<string>();
  return [...teams].sort(byMaking).map((team) => {
    const uids = team.memberUids.filter((uid) => {
      const person = takingPart.get(uid);
      if (!person || person.groupId !== team.groupId || seen.has(uid)) return false;
      seen.add(uid);
      return true;
    });
    return { team, uids };
  });
}

/** Who is in which team now, by uid. */
export function teamOfEach(standing: readonly StandingTeam[]): Map<string, string> {
  return new Map(standing.flatMap(({ team, uids }) => uids.map((uid) => [uid, team.id] as const)));
}
