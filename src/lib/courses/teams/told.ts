import "server-only";
import { createHash } from "node:crypto";
import type { TeamDoc } from "./model";
import type { StandingTeam } from "./standing";

/**
 * WHAT A PERSON WAS TOLD ABOUT THEIR TEAM, as one string to compare, and the
 * markers the email to everyone keeps.
 *
 * "Tell everyone their team" emails each person their team's name, its
 * project line and their teammates' names. When one of those changes (they
 * are moved, somebody joins or leaves their team, the team is remade) what
 * they were told is out of date, and the next press tells them again. When
 * none has, the next press leaves them alone.
 *
 * So each email that goes stores, on the team, a fingerprint of the facts it
 * told (`TeamDoc.toldAs`): the team's id, name and project line, and the ids
 * of the teammates who take part, sorted. Ids rather than names, so somebody
 * changing the name they go by does not send everybody in their team another
 * email. 64 hexadecimal characters, equal exactly when the facts are.
 */
export function toldFingerprint(team: Pick<TeamDoc, "id" | "name" | "project">, teammateUids: readonly string[]): string {
  const facts = JSON.stringify([team.id, team.name, team.project, [...teammateUids].sort()]);
  return createHash("sha256").update(facts, "utf8").digest("hex");
}

/** One person in a team, and whether a press would email them. */
export type TeamMemberStanding = {
  uid: string;
  team: TeamDoc;
  /** The other people in the team now. */
  teammateUids: string[];
  /** The fingerprint of what their email would say now. */
  fingerprint: string;
  /** Never told, or told something that has changed since. */
  owed: boolean;
};

/** Everybody in a team, in team order, with whether each is owed an email. */
export function membersAsTold(standing: readonly StandingTeam[]): TeamMemberStanding[] {
  return standing.flatMap(({ team, uids }) =>
    uids.map((uid) => {
      const teammateUids = uids.filter((other) => other !== uid);
      const fingerprint = toldFingerprint(team, teammateUids);
      const told = team.toldAs.find((entry) => entry.uid === uid)?.fingerprint ?? null;
      return { uid, team, teammateUids, fingerprint, owed: told !== fingerprint };
    }),
  );
}

// ---------------------------------------------------------------------------
// The markers, in `courseNudges`
// ---------------------------------------------------------------------------

/**
 * The server-only collection the course emails keep their markers in
 * (`firestore.rules` shuts it to every browser). Each marker here carries the
 * run's id, so destroying the run sweeps them.
 */
export const TEAMS_MARKERS = "courseNudges";

/**
 * A test of the team email that reached the person who asked for it, on one
 * run. One per person: a press asks for the presser's own, so whoever sends
 * the emails has read one first.
 */
export function teamsTestId(runId: string, uid: string): string {
  return `teamstest__${runId}__${uid}`;
}

/** The kind written on a test's marker, which account deletion looks for. */
export const TEAMS_TEST_KIND = "teams-test";

/** A press in progress on one run (`takeTellLock`). */
export function teamsTellLockId(runId: string): string {
  return `teamstell__${runId}`;
}
