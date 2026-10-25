import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { teamsFromFirstChoices, pitchTeamPeople } from "@/lib/courses/teams/make";
import {
  TEAMS_COLLECTION,
  TEAM_LIMITS,
  byMaking,
  normalizeTeam,
  type TeamDoc,
  type TeamsAction,
  type TeamsView,
} from "@/lib/courses/teams/model";
import { standingTeams, teamOfEach } from "@/lib/courses/teams/standing";
import {
  FROM_PITCHES_HERE,
  FROM_THE_AGENDA_HERE,
  LEADS_AND_ADMINS,
  NOT_AN_INCUBATOR,
  NOT_TAKING_PART,
  NO_AGENDA,
  NO_PROGRAMME,
  NO_RUN,
  NO_SIZES,
  NO_SUCH_PITCH,
  NO_SUCH_TEAM,
  NO_WAY_SET,
  OTHER_GROUP,
  RUN_GONE,
  TEAMS_EXIST,
  madeFromAgendaWords,
  madeFromPitchWords,
  movedWords,
  pitchIsATeam,
  teamProjectLine,
  removedWords,
  tooFewForATeam,
} from "@/lib/courses/teams/words";
import type { SessionUser } from "@/lib/firebase/session";
import {
  buildTeamsView,
  hasTestedTeams,
  readTeamsContext,
  teamsGate,
  teamsRun,
  type TeamsContext,
  type TeamsGate,
} from "./teamsLoad";

/**
 * MAKING AND CHANGING AN INCUBATOR'S TEAMS: the one writer of `courseTeams`
 * besides the two deletion cascades and the email's own record of who was
 * told (`./teamsTell.ts`).
 *
 * Four things, each the programme's lead's or an admin's (`teamsGate`, from
 * the form, before the run is read):
 *
 *  - make one pitch a team (in-teams, option C), for a run whose teams come
 *    from the pitches;
 *  - make the run's teams from first choices on the agenda (in-agenda), for a
 *    run whose teams come from it and that has no team yet;
 *  - move somebody to another team of their own group, or to no team;
 *  - remove a team, which puts its people in no team.
 *
 * Each write is one transaction that reads the run's teams again and decides
 * from what it read, so two presses at once cannot put one person in two
 * teams or make one pitch twice: the one that commits second has read
 * something that changed, runs again, and meets the refusal. Putting somebody
 * in a team takes them off every other team of the run first, and with them
 * the record of what they were told there.
 *
 * Nothing here emails anybody. Every refusal is a sentence the lead can act
 * on, and a refusal writes nothing.
 */

export type ActRefusal = { ok: false; status: 403 | 404 | 409; error: string };
export type ActOutcome = { ok: true; said: string; view: TeamsView } | ActRefusal;
type Done = { ok: true; said: string } | ActRefusal;

const refuse = (status: ActRefusal["status"], error: string): ActRefusal => ({ ok: false, status, error });

/** What a caller the gate turned away is told. */
export function gateRefusal(gate: Exclude<TeamsGate, { ok: true }>): ActRefusal {
  if (gate.outcome === "not-yours") return refuse(403, LEADS_AND_ADMINS);
  if (gate.outcome === "not-an-incubator") return refuse(409, NOT_AN_INCUBATOR);
  return refuse(404, NO_PROGRAMME);
}

function teamsQuery(db: Firestore, runId: string) {
  // One equality on one field, so no declared index.
  return db.collection(TEAMS_COLLECTION).where("runId", "==", runId);
}

/** The run's teams, read inside the transaction that writes. */
async function teamsIn(tx: Transaction, db: Firestore, runId: string): Promise<TeamDoc[]> {
  const snap = await tx.get(teamsQuery(db, runId));
  return snap.docs.map((doc) => normalizeTeam(doc.id, doc.data() ?? {})).sort(byMaking);
}

/**
 * Take these people off every team of the run but `keep`, and with them what
 * each was told there. One update per team that changes.
 */
function takeOff(tx: Transaction, db: Firestore, teams: readonly TeamDoc[], uids: ReadonlySet<string>, keep: string | null): void {
  for (const team of teams) {
    if (team.id === keep || !team.memberUids.some((uid) => uids.has(uid))) continue;
    tx.update(db.collection(TEAMS_COLLECTION).doc(team.id), {
      memberUids: team.memberUids.filter((uid) => !uids.has(uid)),
      toldAs: team.toldAs.filter((told) => !uids.has(told.uid)),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
}

/** A new team's document, whole. */
function newTeam(
  context: TeamsContext,
  fields: { groupId: string; name: string; project: string; source: TeamDoc["source"]; memberUids: string[] },
): Record<string, unknown> {
  return {
    runId: context.run.id,
    courseId: context.run.courseId,
    groupId: fields.groupId,
    name: fields.name.slice(0, TEAM_LIMITS.name),
    project: fields.project.slice(0, TEAM_LIMITS.project),
    source: fields.source,
    memberUids: fields.memberUids.slice(0, TEAM_LIMITS.maxMembers),
    toldAs: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
}

/** Why this run's teams are not made from pitches, or null when they are. */
function notFromPitches(context: TeamsContext): ActRefusal | null {
  if (context.run.teamsFrom === "pitches") return null;
  return refuse(409, context.run.teamsFrom === "agenda" ? FROM_THE_AGENDA_HERE : NO_WAY_SET);
}

async function makeFromPitch(db: Firestore, context: TeamsContext, pitchId: string): Promise<Done> {
  const wrongWay = notFromPitches(context);
  if (wrongWay) return wrongWay;
  const sizes = context.run.pitchSettings.teamSize;
  if (!sizes) return refuse(409, NO_SIZES);
  const pitches = context.pitching?.pitches ?? [];
  const pitch = pitches.find((candidate) => candidate.id === pitchId);
  if (!pitch) return refuse(404, NO_SUCH_PITCH);

  // How many of that week's pitches in the pitch's group each person picked.
  const picks = new Map<string, number>();
  for (const other of pitches) {
    if (other.groupId !== pitch.groupId) continue;
    for (const uid of other.wouldJoinUids) picks.set(uid, (picks.get(uid) ?? 0) + 1);
  }
  const inGroup = new Map(
    [...context.takingPart.values()]
      .filter((person) => person.groupId === pitch.groupId)
      .map((person) => [person.uid, person.name] as const),
  );

  return db.runTransaction<Done>(async (tx) => {
    const teams = await teamsIn(tx, db, context.run.id);
    if (teams.some((team) => team.source.kind === "pitch" && team.source.pitchId === pitch.id)) {
      return refuse(409, pitchIsATeam(pitch.title));
    }
    const made = pitchTeamPeople({
      pitcherUids: pitch.pitcherUids,
      wouldJoinUids: pitch.wouldJoinUids,
      inGroup,
      teamOf: teamOfEach(standingTeams(teams, context.takingPart)),
      picks,
      sizes,
    });
    if (made.short) return refuse(409, tooFewForATeam(pitch.title, made.uids.length, sizes.min));
    takeOff(tx, db, teams, new Set(made.uids), null);
    tx.create(
      db.collection(TEAMS_COLLECTION).doc(),
      newTeam(context, {
        groupId: pitch.groupId,
        name: pitch.title,
        project: teamProjectLine(pitch.paper?.title ?? null, pitch.twist),
        source: { kind: "pitch", pitchId: pitch.id },
        memberUids: made.uids,
      }),
    );
    return { ok: true, said: madeFromPitchWords(pitch.title, made.uids.length) };
  });
}

async function makeFromAgenda(db: Firestore, context: TeamsContext): Promise<Done> {
  if (context.run.teamsFrom !== "agenda") {
    return refuse(409, context.run.teamsFrom === "pitches" ? FROM_PITCHES_HERE : NO_WAY_SET);
  }
  const sizes = context.run.pitchSettings.teamSize;
  if (!sizes) return refuse(409, NO_SIZES);
  const agenda = context.agenda?.agenda ?? null;
  if (!agenda) return refuse(409, NO_AGENDA);
  const rankings = context.agenda?.rankings ?? new Map<string, string[]>();

  // Each group's teams from its own people: a team works inside one group's session.
  const byGroup = new Map<string, Array<{ uid: string; name: string; ranking: string[] }>>();
  for (const person of context.takingPart.values()) {
    const list = byGroup.get(person.groupId) ?? [];
    list.push({ uid: person.uid, name: person.name, ranking: rankings.get(person.uid) ?? [] });
    byGroup.set(person.groupId, list);
  }
  const groupIds = [...byGroup.keys()].sort();
  const made = groupIds.map((groupId) => ({
    groupId,
    ...teamsFromFirstChoices(byGroup.get(groupId) ?? [], agenda.items, sizes),
  }));

  return db.runTransaction<Done>(async (tx) => {
    const teams = await teamsIn(tx, db, context.run.id);
    if (teams.length > 0) return refuse(409, TEAMS_EXIST);
    let count = 0;
    for (const group of made) {
      for (const team of group.teams) {
        count += 1;
        tx.create(
          db.collection(TEAMS_COLLECTION).doc(),
          newTeam(context, {
            groupId: group.groupId,
            name: team.item,
            project: "",
            source: { kind: "agenda", item: team.item },
            memberUids: team.uids,
          }),
        );
      }
    }
    const unplaced = made.reduce((sum, group) => sum + group.unplaced.length, 0);
    return { ok: true, said: madeFromAgendaWords(count, unplaced) };
  });
}

async function move(db: Firestore, context: TeamsContext, uid: string, teamId: string | null): Promise<Done> {
  const person = context.takingPart.get(uid);
  if (!person) return refuse(404, NOT_TAKING_PART);
  return db.runTransaction<Done>(async (tx) => {
    const teams = await teamsIn(tx, db, context.run.id);
    if (teamId === null) {
      takeOff(tx, db, teams, new Set([uid]), null);
      return { ok: true, said: movedWords(person.name, null) };
    }
    const target = teams.find((team) => team.id === teamId);
    if (!target) return refuse(404, NO_SUCH_TEAM);
    if (target.groupId !== person.groupId) return refuse(409, OTHER_GROUP);
    takeOff(tx, db, teams, new Set([uid]), target.id);
    if (!target.memberUids.includes(uid)) {
      if (target.memberUids.length >= TEAM_LIMITS.maxMembers) {
        return refuse(409, `${target.name} has as many people as a team can hold.`);
      }
      tx.update(db.collection(TEAMS_COLLECTION).doc(target.id), {
        memberUids: [...target.memberUids, uid],
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    return { ok: true, said: movedWords(person.name, target.name) };
  });
}

async function remove(db: Firestore, context: TeamsContext, teamId: string): Promise<Done> {
  return db.runTransaction<Done>(async (tx) => {
    const teams = await teamsIn(tx, db, context.run.id);
    const team = teams.find((candidate) => candidate.id === teamId);
    if (!team) return refuse(404, NO_SUCH_TEAM);
    tx.delete(db.collection(TEAMS_COLLECTION).doc(team.id));
    return { ok: true, said: removedWords(team.name) };
  });
}

/**
 * One request from the Teams tab: who may, then the run, then the write, then
 * the tab as it stands after it. The request was checked before this is
 * called (`parseTeamsAction`).
 */
export async function actOnTeams(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  action: TeamsAction,
  now: Date = new Date(),
): Promise<ActOutcome> {
  const gate = await teamsGate(db, user, roundId, programmeId);
  if (!gate.ok) return gateRefusal(gate);
  const found = await teamsRun(db, gate.programme);
  if (!found.ok) return refuse(409, found.blank === "no-run" ? NO_RUN : RUN_GONE);
  const context = await readTeamsContext(db, user, gate, found.run);

  let done: Done;
  switch (action.action) {
    case "from-pitch":
      done = await makeFromPitch(db, context, action.pitchId);
      break;
    case "from-agenda":
      done = await makeFromAgenda(db, context);
      break;
    case "move":
      done = await move(db, context, action.uid, action.teamId);
      break;
    case "remove":
      done = await remove(db, context, action.teamId);
      break;
  }
  if (!done.ok) return done;
  const [after, tested] = await Promise.all([
    readTeamsContext(db, user, gate, found.run),
    hasTestedTeams(db, found.run.id, user.uid),
  ]);
  return { ok: true, said: done.said, view: buildTeamsView(after, tested, now) };
}
