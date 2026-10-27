import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { peopleNamed } from "@/lib/courses/pitching/load";
import { ownSeat, seatsOn } from "@/lib/courses/pitching/people";
import { TEAMS_COLLECTION, byMaking, normalizeTeam, type TeamDoc } from "@/lib/courses/teams/model";
import { standingTeams, type Participant, type StandingTeam } from "@/lib/courses/teams/standing";
import type { SessionUser } from "@/lib/firebase/session";
import { compareGroupsByMeeting, normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun, type CourseRunDoc } from "@/lib/firestore/courses";
import { NOT_IN_A_TEAM } from "./words";

/**
 * WHO READS AND WRITES A TEAM'S PAGE, and the reads every team page, route
 * and card shares.
 *
 *  - THE TEAM'S PEOPLE read and write it: somebody among a team's people
 *    now (`standingTeams`, the Teams tab's own rule: a live learner seat in
 *    the team's group, told by Publish, on an account that stands) who has
 *    been told their team by its email (an entry of theirs in the team's
 *    `toldAs`). A facilitator who holds a place sits in their group as one
 *    of its people, so they are in a team like anybody. Somebody moved to a
 *    team they have not been told about yet waits for its email, as a seat
 *    waits for Publish.
 *  - THE PROGRAMME'S LEAD AND ADMINS read every team's page, from the
 *    programme's Teams tab (`./lead.ts`), and write none of it.
 *  - Nobody else: not another team, not somebody in no team, not somebody
 *    who left (their seat is no longer live, so they drop off their team at
 *    once), not a facilitator who holds no place, a track lead or a
 *    reviewer.
 *
 * Every read here is one equality on one field, or a document addressed by
 * its id, so none needs a declared index. A team's people are read whole
 * each time, so a move, a leaver or an account that stops standing changes
 * who reads the page on the next request.
 */

export type Refusal = { ok: false; status: number; error: string };

const NOT_YOURS: Refusal = { ok: false, status: 403, error: NOT_IN_A_TEAM };

/** Everybody on a run as the teams see them, read once. */
export type TeamRoster = {
  run: CourseRunDoc;
  /** The run's groups that still meet, by id, in the order the programme's page lists groups. */
  groups: Map<string, CourseGroupDoc>;
  /** The people taking part, by uid: told, in a live group, on an account that stands. */
  takingPart: Map<string, Participant>;
  /** The run's teams with their people now, in the order they were made. */
  standing: StandingTeam[];
};

/** The run, unless it is gone or being destroyed. */
export async function liveRun(db: Firestore, runId: string): Promise<CourseRunDoc | null> {
  if (!runId || runId.includes("/") || runId === "." || runId === "..") return null;
  const snap = await db.collection("courseRuns").doc(runId).get();
  if (!snap.exists || (snap.data() ?? {}).destroying === true) return null;
  return normalizeCourseRun(snap.id, snap.data() ?? {});
}

/** The run's stored teams, in the order they were made. One equality, so no declared index. */
async function teamsOf(db: Firestore, runId: string): Promise<TeamDoc[]> {
  const snap = await db.collection(TEAMS_COLLECTION).where("runId", "==", runId).get();
  return snap.docs
    .map((doc) => normalizeTeam(doc.id, doc.data() ?? {}))
    .filter((team) => team.runId === runId)
    .sort(byMaking);
}

/**
 * Whether any team on the run names this person: one equality, read before
 * anything else, so a page that only shows a card (the programme's page)
 * costs one query on a run with no teams. Being named is not being in a
 * team: the gate below decides that.
 */
export async function namedInATeam(db: Firestore, runId: string, uid: string): Promise<boolean> {
  return (await teamsOf(db, runId)).some((team) => team.memberUids.includes(uid));
}

/** Who is taking part on the run, and the run's teams as they stand. */
export async function readTeamRoster(db: Firestore, run: CourseRunDoc): Promise<TeamRoster> {
  const [groupSnap, teams, seats] = await Promise.all([
    // One equality on one field, so no declared index.
    db.collection("courseGroups").where("runId", "==", run.id).get(),
    teamsOf(db, run.id),
    // Publish's rule for everybody, an admin included: only told seats take part.
    seatsOn(db, run.id, { isAdmin: false }),
  ]);
  // The run's live groups in the one order a programme's page lists groups in.
  const groups = new Map<string, CourseGroupDoc>(
    groupSnap.docs
      .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
      .filter((group) => !group.archived && group.runId === run.id)
      .sort(compareGroupsByMeeting)
      .map((group) => [group.id, group] as const),
  );
  const seated = seats.filter((seat) => seat.groupId !== null && groups.has(seat.groupId));
  const named = await peopleNamed(db, seated.map((seat) => seat.uid));
  const takingPart = new Map<string, Participant>();
  for (const seat of seated) {
    const person = named.get(seat.uid);
    if (!person?.approved || !seat.groupId) continue;
    takingPart.set(seat.uid, { uid: seat.uid, name: person.name, groupId: seat.groupId });
  }
  return { run, groups, takingPart, standing: standingTeams(teams, takingPart) };
}

/** Has this person been told this team by its email? */
export function toldTheirTeam(team: TeamDoc, uid: string): boolean {
  return team.toldAs.some((told) => told.uid === uid);
}

/** One person in a team, and everything their team's page is read from. */
export type TeamPagePerson = {
  user: SessionUser;
  run: CourseRunDoc;
  roster: TeamRoster;
  /** The group the team works inside, which is the person's own. */
  group: CourseGroupDoc;
  team: TeamDoc;
  /** The team's people now, in the order they were put in it. */
  uids: string[];
};

/**
 * THE GATE every team-page route, page and card asks first. The caller's own
 * seat is read before anything else about the run (`ownSeat`: their live,
 * told seat, on an account that stands, addressed by its id), then the run
 * (there, and not being destroyed), then the run's people and teams. One
 * refusal for everybody who is not in a team they have been told about, so
 * a run id says nothing about the run.
 */
export async function teamPagePerson(
  db: Firestore,
  user: SessionUser,
  runId: string,
): Promise<{ ok: true; person: TeamPagePerson } | Refusal> {
  const seat = await ownSeat(db, runId, user);
  if (!seat || !seat.groupId) return NOT_YOURS;
  const run = await liveRun(db, runId);
  if (!run) return NOT_YOURS;
  const roster = await readTeamRoster(db, run);
  const group = roster.groups.get(seat.groupId);
  if (!group) return NOT_YOURS;
  const mine = roster.standing.find((entry) => entry.uids.includes(user.uid));
  if (!mine || mine.team.groupId !== group.id || !toldTheirTeam(mine.team, user.uid)) return NOT_YOURS;
  return { ok: true, person: { user, run, roster, group, team: mine.team, uids: mine.uids } };
}

/** Whether a run still takes writing on its team pages: not finished, cancelled or archived. */
export function runTakesTeamWriting(run: CourseRunDoc): boolean {
  return !run.archived && run.status !== "completed" && run.status !== "cancelled";
}
