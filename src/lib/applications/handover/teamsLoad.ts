import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { pitchesOnRun } from "@/lib/courses/pitching/load";
import type { PitchDoc } from "@/lib/courses/pitching/model";
import { seatsOn } from "@/lib/courses/pitching/people";
import { readPitchingWeek, type PitchingWeek } from "@/lib/courses/pitching/week";
import { pitchedByWords } from "@/lib/courses/pitching/words";
import { firstNameOfUser, standingUserOf } from "@/lib/courses/programmeLead";
import { displayNameOf } from "@/lib/courses/registerAccess";
import {
  TEAMS_COLLECTION,
  byMaking,
  normalizeTeam,
  type AgendaRowView,
  type PitchTeamRowView,
  type TeamCardView,
  type TeamDoc,
  type TeamPersonView,
  type TeamsView,
} from "@/lib/courses/teams/model";
import { standingTeams, teamOfEach, type Participant, type StandingTeam } from "@/lib/courses/teams/standing";
import { TEAMS_MARKERS, membersAsTold, teamsTestId } from "@/lib/courses/teams/told";
import { changeUntilWords, placeWords, sizeNoteWords, teamsByDay } from "@/lib/courses/teams/words";
import { londonDateKey } from "@/lib/courses/weekPlan";
import { holdsStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { canRunTerm, opensProgrammeGroups, roleOnProgramme } from "../access";
import { own } from "../keys";
import type { ProgrammeSettings } from "../model";
import { isId, type ApplicationForm } from "../normalise";
import { loadForm } from "../repo";
import { findAgenda, readRankings, type Agenda } from "./agenda";
import { RUNS_COLLECTION, readRun } from "./run";

/**
 * AN INCUBATOR'S TEAMS, FOR ITS LEAD AND FOR ADMINS (boards in-teams, option
 * C, and in-agenda): who may open the Teams tab and act on it, everything the
 * tab and its routes read, and the tab itself.
 *
 * ## Who
 *
 * An admin, or the programme's lead while they meet the lead's bar
 * (`roleOnProgramme`, then `opensProgrammeGroups`), decided from the form
 * before the run is read. A reviewer of the programme is told the tab is the
 * lead's and admins'. Anybody with no role on the programme (the run's track
 * lead, a group's facilitator, the people taking part, the lead of another
 * programme) is answered as for a programme that is not there. A fellowship
 * has no teams.
 *
 * ## Who takes part
 *
 * Somebody with a live learner seat in one of the run's groups that still
 * meets, told by Publish, whose account stands. Publish's rule holds here for
 * everybody, an admin included: a person who has not been told their group is
 * not put in a team, named, counted or emailed. See `standingTeams` for who a
 * team's people are.
 *
 * ## What is read for whom
 *
 * Names only, never an address, travel to the page. What each person ranked
 * on the application form (in-agenda's "1st: Compute governance") is read
 * only for a run whose teams come from the agenda, by `./agenda.ts`, after
 * the gate above. The addresses the email needs are read here and kept on the
 * server (`TeamsContext.accounts`).
 */

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

export type TeamsGate =
  | { ok: true; form: ApplicationForm; programme: ProgrammeSettings; viewer: "admin" | "lead" }
  | { ok: false; outcome: "none" | "not-yours" | "not-an-incubator"; programmeName: string };

/** Who may open and act on a programme's teams. Reads the form and nothing else. */
export async function teamsGate(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<TeamsGate> {
  const none = { ok: false, outcome: "none", programmeName: "" } as const;
  if (!isId(roundId) || !isId(programmeId)) return none;
  const form = await loadForm(db, roundId);
  if (!form) return none;
  const programme = own(form.programmes, programmeId);
  if (!programme) return none;
  const role = roleOnProgramme(user, form, programmeId);
  if (role === null) return none;
  const programmeName = programme.shortName.trim() || programme.name.trim();
  if (!opensProgrammeGroups(role)) return { ok: false, outcome: "not-yours", programmeName };
  if (programme.kind !== "incubator") return { ok: false, outcome: "not-an-incubator", programmeName };
  return { ok: true, form, programme, viewer: role === "admin" ? "admin" : "lead" };
}

/** The run a programme names, or why there is none. A run being destroyed is gone already. */
export async function teamsRun(
  db: Firestore,
  programme: ProgrammeSettings,
): Promise<{ ok: true; run: CourseRunDoc } | { ok: false; blank: "no-run" | "run-gone" }> {
  if (programme.runId === null) return { ok: false, blank: "no-run" };
  const snap = await db.collection(RUNS_COLLECTION).doc(programme.runId).get();
  const read = snap.exists ? readRun(snap.id, snap.data()) : null;
  if (!read || read.destroying) return { ok: false, blank: "run-gone" };
  return { ok: true, run: read.run };
}

// ---------------------------------------------------------------------------
// Everything the tab and its routes read
// ---------------------------------------------------------------------------

/** What the email needs of one account. Server only: never handed to a page. */
export type TeamAccount = { name: string; firstName: string; address: string };

export type TeamsContext = {
  user: SessionUser;
  form: ApplicationForm;
  programme: ProgrammeSettings;
  viewer: "admin" | "lead";
  run: CourseRunDoc;
  /** The run's groups that still meet, by id. */
  groups: Map<string, CourseGroupDoc>;
  /** The people taking part, by uid. */
  takingPart: Map<string, Participant>;
  /** The accounts of the people taking part and of everybody who pitched, by uid. */
  accounts: Map<string, TeamAccount>;
  /** The run's stored teams, in the order they were made. */
  teams: TeamDoc[];
  standing: StandingTeam[];
  /** For a run whose teams come from the pitches: its pitching week and that week's pitches. */
  pitching: { week: PitchingWeek | null; pitches: PitchDoc[] } | null;
  /** For a run whose teams come from the agenda: the agenda, and what each person taking part ranked. */
  agenda: { agenda: Agenda | null; rankings: Map<string, string[]> } | null;
};

/** The accounts of these people, read once: names, the first name, the address, and whether each stands. */
async function readAccounts(
  db: Firestore,
  uids: Iterable<string>,
): Promise<Map<string, TeamAccount & { stands: boolean }>> {
  const list = [...new Set([...uids].filter(Boolean))];
  const out = new Map<string, TeamAccount & { stands: boolean }>();
  if (list.length === 0) return out;
  const docs = await db.getAll(...list.map((uid) => db.collection("users").doc(uid)));
  for (const doc of docs) {
    if (!doc.exists) continue;
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    out.set(doc.id, {
      name: displayNameOf(data),
      firstName: firstNameOfUser(data),
      address: typeof data.email === "string" ? data.email.trim() : "",
      // The bar a seat on a run is held to, asked of the stored account.
      stands: holdsStanding(standingUserOf(doc.id, data), "courseEnrolments.uid"),
    });
  }
  return out;
}

/** The run's stored teams, in the order they were made. One equality, so no declared index. */
export async function teamsOnRun(db: Firestore, runId: string): Promise<TeamDoc[]> {
  const snap = await db.collection(TEAMS_COLLECTION).where("runId", "==", runId).get();
  return snap.docs.map((doc) => normalizeTeam(doc.id, doc.data() ?? {})).sort(byMaking);
}

/** Everything a page or a press about this run's teams reads, read once. */
export async function readTeamsContext(
  db: Firestore,
  user: SessionUser,
  gate: Extract<TeamsGate, { ok: true }>,
  run: CourseRunDoc,
): Promise<TeamsContext> {
  const [seats, groupSnap, teams, week] = await Promise.all([
    // Publish's rule for everybody, an admin included: only told seats take part.
    seatsOn(db, run.id, { isAdmin: false }),
    // One equality on one field, so no declared index.
    db.collection("courseGroups").where("runId", "==", run.id).get(),
    teamsOnRun(db, run.id),
    run.teamsFrom === "pitches" ? readPitchingWeek(db, run.id) : Promise.resolve(null),
  ]);
  const groups = new Map<string, CourseGroupDoc>();
  for (const doc of groupSnap.docs) {
    const group = normalizeCourseGroup(doc.id, doc.data() ?? {});
    if (!group.archived && group.runId === run.id) groups.set(group.id, group);
  }
  const pitches =
    run.teamsFrom === "pitches" && week
      ? (await pitchesOnRun(db, run.id)).filter((pitch) => pitch.weekId === week.weekId)
      : [];
  const seated = seats.filter((seat) => seat.groupId !== null && groups.has(seat.groupId));
  const read = await readAccounts(db, [
    ...seated.map((seat) => seat.uid),
    ...pitches.flatMap((pitch) => pitch.pitcherUids),
  ]);
  const takingPart = new Map<string, Participant>();
  for (const seat of seated) {
    const account = read.get(seat.uid);
    if (!account?.stands || !seat.groupId) continue;
    takingPart.set(seat.uid, { uid: seat.uid, name: account.name, groupId: seat.groupId });
  }
  const accounts = new Map<string, TeamAccount>(
    [...read].map(([uid, { name, firstName, address }]) => [uid, { name, firstName, address }]),
  );

  let agenda: TeamsContext["agenda"] = null;
  if (run.teamsFrom === "agenda") {
    const found = await findAgenda(db, gate.form, gate.programme.id);
    agenda = {
      agenda: found,
      rankings: found ? await readRankings(db, user, gate.form, found, [...takingPart.keys()]) : new Map(),
    };
  }

  return {
    user,
    form: gate.form,
    programme: gate.programme,
    viewer: gate.viewer,
    run,
    groups,
    takingPart,
    accounts,
    teams,
    standing: standingTeams(teams, takingPart),
    pitching: run.teamsFrom === "pitches" ? { week, pitches } : null,
    agenda,
  };
}

/** Has this person sent themselves a test of the team email on this run? */
export async function hasTestedTeams(db: Firestore, runId: string, uid: string): Promise<boolean> {
  return (await db.collection(TEAMS_MARKERS).doc(teamsTestId(runId, uid)).get()).exists;
}

// ---------------------------------------------------------------------------
// The tab
// ---------------------------------------------------------------------------

/** The fallback a group with no name is called by, the allocation board's own. */
const UNTITLED_GROUP = "Untitled group";
const SOMEBODY = "NAISI member";

/** What one person ranked, as their row says it (in-agenda). */
function ranksOf(
  ranking: readonly string[],
  teamItem: string | null,
  inATeam: boolean,
): Array<{ place: string; item: string; above: boolean }> {
  const at = teamItem === null ? -1 : ranking.indexOf(teamItem);
  if (at >= 0) {
    return ranking.slice(0, at + 1).map((item, index) => ({ place: placeWords(index + 1), item, above: index < at }));
  }
  // In a team that is none of their choices, every choice shown is one above it.
  return ranking.slice(0, 3).map((item, index) => ({ place: placeWords(index + 1), item, above: inATeam }));
}

/** The Teams tab, built from what `readTeamsContext` read. Names only. */
export function buildTeamsView(context: TeamsContext, tested: boolean, now: Date): TeamsView {
  const { run, groups, takingPart, accounts, teams, standing } = context;
  const sizes = run.pitchSettings.teamSize;
  const severalGroups = new Set([...takingPart.values()].map((person) => person.groupId)).size > 1;
  const groupName = (groupId: string) => groups.get(groupId)?.name.trim() || UNTITLED_GROUP;
  const teamOf = teamOfEach(standing);
  const standingOf = new Map(standing.map((entry) => [entry.team.id, entry] as const));
  const rankings = context.agenda?.rankings ?? null;

  const person = (uid: string): TeamPersonView => {
    const participant = takingPart.get(uid);
    const teamId = teamOf.get(uid) ?? null;
    const team = teamId ? (standingOf.get(teamId)?.team ?? null) : null;
    const ranking = rankings?.get(uid) ?? [];
    const teamItem = team ? (team.source.kind === "agenda" ? team.source.item : team.name) : null;
    return {
      uid,
      name: participant?.name ?? SOMEBODY,
      groupId: participant?.groupId ?? "",
      ranks: rankings ? ranksOf(ranking, teamItem, team !== null) : null,
      rankedNothing: rankings !== null && ranking.length === 0,
    };
  };

  // Teams made from the agenda are listed in the agenda's order, as in-agenda
  // draws them; any other team by its name, as in-teams does.
  const items = context.agenda?.agenda?.items ?? [];
  const placeOf = (team: TeamDoc) => {
    const at = team.source.kind === "agenda" ? items.indexOf(team.source.item) : -1;
    return at >= 0 ? at : items.length;
  };
  const listed = [...standing].sort(
    (a, b) =>
      placeOf(a.team) - placeOf(b.team) ||
      a.team.name.localeCompare(b.team.name, "en-GB") ||
      a.team.id.localeCompare(b.team.id),
  );
  const cards: TeamCardView[] = listed.map(({ team, uids }) => ({
    id: team.id,
    name: team.name,
    project: team.project,
    groupId: team.groupId,
    groupName: severalGroups ? groupName(team.groupId) : null,
    people: uids.map(person),
    sizeNote: sizeNoteWords(uids.length, sizes),
  }));

  const noTeam = [...takingPart.values()]
    .filter((participant) => !teamOf.has(participant.uid))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.uid.localeCompare(b.uid))
    .map((participant) => person(participant.uid));

  let pitches: TeamsView["pitches"] = null;
  if (context.pitching) {
    const { week, pitches: weekPitches } = context.pitching;
    const fromPitch = new Set(
      teams.flatMap((team) => (team.source.kind === "pitch" ? [team.source.pitchId] : [])),
    );
    const severalPitchGroups = new Set(weekPitches.map((pitch) => pitch.groupId)).size > 1;
    const rows: PitchTeamRowView[] = weekPitches
      .map((pitch) => ({
        id: pitch.id,
        title: pitch.title,
        twist: pitch.twist,
        pitchedBy: pitchedByWords(
          pitch.pitcherUids.map((uid) => accounts.get(uid)?.name ?? SOMEBODY),
          undefined,
        ),
        // A pick counts while its owner takes part in the pitch's own group.
        wouldJoin: pitch.wouldJoinUids.filter((uid) => takingPart.get(uid)?.groupId === pitch.groupId).length,
        groupName: severalPitchGroups ? groupName(pitch.groupId) : null,
        state: fromPitch.has(pitch.id)
          ? ("became-a-team" as const)
          : fromPitch.size > 0
            ? ("not-taken-forward" as const)
            : ("no-team-yet" as const),
      }))
      .sort((a, b) => b.wouldJoin - a.wouldJoin || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    pitches = { weekNumber: week?.weekNumber ?? null, published: week?.published === true, rows };
  }

  let agenda: TeamsView["agenda"] = null;
  if (context.agenda) {
    const found = context.agenda.agenda;
    const ranked = [...takingPart.keys()].map((uid) => rankings?.get(uid) ?? []);
    const rows: AgendaRowView[] = (found?.items ?? []).map((item) => ({
      item,
      ranked: [0, 1, 2].map((place) => ranked.filter((ranking) => ranking[place] === item).length) as [
        number,
        number,
        number,
      ],
      teams: standing
        .filter(({ team }) => team.source.kind === "agenda" && team.source.item === item)
        .map(({ team, uids }) => ({
          id: team.id,
          people: uids.map((uid) => ({ uid, name: takingPart.get(uid)?.name ?? SOMEBODY })),
        })),
    }));
    agenda = { found: found !== null, rows };
  }

  const members = membersAsTold(standing);
  const owed = members.filter((member) => member.owed);
  const emailed = owed.filter((member) => Boolean(accounts.get(member.uid)?.address));
  return {
    roundId: context.form.round.id,
    programmeId: context.programme.id,
    programmeName: context.programme.shortName.trim() || context.programme.name.trim(),
    viewer: context.viewer,
    run: { id: run.id, courseId: run.courseId },
    blank: null,
    madeFrom: run.teamsFrom,
    canOpenRunEditor: canRunTerm(context.user),
    sizes,
    changeUntil: changeUntilWords(run.pitchSettings.teamsMadeOn, londonDateKey(now)),
    takingPart: takingPart.size,
    inATeam: members.length,
    pitches,
    agenda,
    teams: cards,
    noTeam,
    tell: {
      owed: owed.length,
      emails: emailed.length,
      noAddress: owed
        .filter((member) => !accounts.get(member.uid)?.address)
        .map((member) => takingPart.get(member.uid)?.name ?? SOMEBODY),
      tested,
    },
  };
}

/** A tab with nothing to show yet: no run named, or the one named is gone. */
function blankView(
  gate: Extract<TeamsGate, { ok: true }>,
  user: SessionUser,
  blank: "no-run" | "run-gone",
): TeamsView {
  return {
    roundId: gate.form.round.id,
    programmeId: gate.programme.id,
    programmeName: gate.programme.shortName.trim() || gate.programme.name.trim(),
    viewer: gate.viewer,
    run: null,
    blank,
    madeFrom: null,
    canOpenRunEditor: canRunTerm(user),
    sizes: null,
    changeUntil: null,
    takingPart: 0,
    inATeam: 0,
    pitches: null,
    agenda: null,
    teams: [],
    noTeam: [],
    tell: { owed: 0, emails: 0, noAddress: [], tested: false },
  };
}

export type TeamsOutcome =
  | { status: "ok"; view: TeamsView }
  /** No form, no such programme, or no role on it. */
  | { status: "none" }
  /** A reviewer of the programme: the tab is the lead's and admins'. */
  | { status: "not-yours" }
  /** A fellowship, which has groups and no teams. */
  | { status: "not-an-incubator"; programmeName: string };

/** The Teams tab, or why it is not this caller's. Reads; writes nothing. */
export async function loadProgrammeTeams(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  now: Date = new Date(),
): Promise<TeamsOutcome> {
  const gate = await teamsGate(db, user, roundId, programmeId);
  if (!gate.ok) {
    if (gate.outcome === "not-an-incubator") return { status: "not-an-incubator", programmeName: gate.programmeName };
    return { status: gate.outcome };
  }
  const found = await teamsRun(db, gate.programme);
  if (!found.ok) return { status: "ok", view: blankView(gate, user, found.blank) };
  const [context, tested] = await Promise.all([
    readTeamsContext(db, user, gate, found.run),
    hasTestedTeams(db, found.run.id, user.uid),
  ]);
  return { status: "ok", view: buildTeamsView(context, tested, now) };
}

// ---------------------------------------------------------------------------
// The tab in the programme's head
// ---------------------------------------------------------------------------

/**
 * What the programme's head says about teams: how many the run has, for the
 * Teams tab's count, and the day they are made ("Teams by Thu 19 Nov"), from
 * the run's own setting. Null for a programme that is not an incubator, which
 * has no Teams tab. Drawn for anybody with a role on the programme: a number
 * and a day, nobody's name.
 */
export async function readTeamsTab(
  db: Firestore,
  programme: ProgrammeSettings,
): Promise<{ count: number | null; teamsBy: string | null } | null> {
  if (programme.kind !== "incubator") return null;
  const found = await teamsRun(db, programme);
  if (!found.ok) return { count: null, teamsBy: null };
  const snap = await db.collection(TEAMS_COLLECTION).where("runId", "==", found.run.id).get();
  return { count: snap.docs.length, teamsBy: teamsByDay(found.run.pitchSettings.teamsMadeOn) };
}
