import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { teamsGate, teamsRun } from "@/lib/applications/handover/teamsLoad";
import { resolveSessions } from "@/lib/courses/sessions";
import type { SessionUser } from "@/lib/firebase/session";
import { resolveCalendar } from "@/lib/courses/groupResolve";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { readTeamRoster, type TeamRoster } from "./access";
import { buildStaffTeamPage, handInStateWords, handInsOnRun } from "./load";
import { TEAM_PAGE_LIMITS, shownAddress, type HandInSettingsInput } from "./model";
import type { TeamHandInsView, TeamPageView } from "./views";
import { BACK_TO_TEAMS, SHOWCASE_NOT_A_WEEK, handInAsksWords, showcaseOptionWords } from "./words";

/**
 * EVERY TEAM'S PAGE AND HAND-IN, FOR THE PROGRAMME'S LEAD AND ADMINS, read
 * from the programme's Teams tab: its "Hand-ins" section (each team's
 * hand-in, and the hand-in dates the lead sets) and one team's page, read
 * only.
 *
 * WHO is the Teams tab's own question (`teamsGate`): an admin, or the
 * programme's lead while they meet the lead's bar, decided from the form
 * before the run is read; a reviewer is told it is the lead's and admins';
 * anybody with no role on the programme is answered as for a programme that
 * is not there; a fellowship has no teams. They read; they write nothing on
 * a team's page. The dates are the one thing they set here.
 */

/** The Teams tab's address, built from ids. */
export function teamsTabHref(roundId: string, programmeId: string): string {
  return `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/teams`;
}

/** The run's own calendar's taught weeks, for the showcase's list: dated by its one group's session, when it has one. */
function showcaseWeeks(roster: TeamRoster): Array<{ weekNumber: number; label: string }> {
  const { run, groups } = roster;
  const only = groups.size === 1 ? [...groups.values()][0] : null;
  const sessions = only ? resolveSessions(run, only).filter((session) => session.occurrence === 1) : [];
  return resolveCalendar(run, null)
    .weekPlan.filter((entry) => entry.kind === "week")
    .map((entry) => {
      const weekNumber = entry.kind === "week" ? entry.weekNumber : 0;
      const dateKey = sessions.find((session) => session.weekNumber === weekNumber)?.dateKey ?? "";
      return { weekNumber, label: showcaseOptionWords(weekNumber, dateKey) };
    });
}

/** The taught week a day falls in by the run's own calendar, for the line the lead reads. */
function runWeekOfDay(run: CourseRunDoc, dateKey: string): number | null {
  for (const session of resolveSessions(run, null)) {
    if (session.occurrence !== 1 || !session.slotStartKey) continue;
    const end = new Date(Date.parse(`${session.slotStartKey}T00:00:00Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
    if (session.slotStartKey <= dateKey && dateKey <= end) return session.weekNumber;
  }
  return null;
}

/**
 * The Teams tab's Hand-ins section, for the lead and admins, or null for
 * anybody else and while the programme names no run on the site.
 */
export async function loadTeamHandIns(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<TeamHandInsView | null> {
  const gate = await teamsGate(db, user, roundId, programmeId);
  if (!gate.ok) return null;
  const found = await teamsRun(db, gate.programme);
  if (!found.ok) return null;
  const [roster, handIns] = await Promise.all([readTeamRoster(db, found.run), handInsOnRun(db, found.run)]);
  const { dueOn, showcaseWeek } = found.run.teamHandIn;
  return {
    roundId: gate.form.round.id,
    programmeId: gate.programme.id,
    dueOn,
    showcaseWeek,
    weeks: showcaseWeeks(roster),
    asks: handInAsksWords(dueOn, dueOn ? runWeekOfDay(found.run, dueOn) : null, TEAM_PAGE_LIMITS.summaryWords),
    rows: roster.standing
      .map(({ team }) => {
        const entry = handIns.get(team.id) ?? null;
        return {
          teamId: team.id,
          name: team.name,
          state: handInStateWords(roster, entry),
          entry: entry
            ? { url: entry.url, shown: shownAddress(entry.url), summary: entry.summary, whoDidWhat: entry.whoDidWhat }
            : null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "en-GB") || a.teamId.localeCompare(b.teamId)),
  };
}

export type LeadTeamPageOutcome =
  | { status: "ok"; view: TeamPageView }
  /** No form, no such programme, or no role on it. */
  | { status: "none" }
  /** A reviewer of the programme: the tab is the lead's and admins'. */
  | { status: "not-yours" }
  /** A fellowship, which has groups and no teams. */
  | { status: "not-an-incubator"; programmeName: string }
  /** No run named, the run gone, or no such team on it. */
  | { status: "no-team" };

/** One team's page, read only, for the lead and admins. Reads; writes nothing. */
export async function loadLeadTeamPage(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  teamId: string,
  now: Date = new Date(),
): Promise<LeadTeamPageOutcome> {
  const gate = await teamsGate(db, user, roundId, programmeId);
  if (!gate.ok) {
    if (gate.outcome === "not-an-incubator") return { status: "not-an-incubator", programmeName: gate.programmeName };
    return { status: gate.outcome };
  }
  const found = await teamsRun(db, gate.programme);
  if (!found.ok) return { status: "no-team" };
  const roster = await readTeamRoster(db, found.run);
  const standing = roster.standing.find((entry) => entry.team.id === teamId);
  if (!standing) return { status: "no-team" };
  const back = {
    href: teamsTabHref(gate.form.round.id, gate.programme.id),
    label: BACK_TO_TEAMS,
    short: BACK_TO_TEAMS,
  };
  const view = await buildStaffTeamPage(db, roster, standing.team, standing.uids, back, now);
  return view ? { status: "ok", view } : { status: "no-team" };
}

/**
 * The lead's hand-in dates, checked against the run they name: a showcase
 * week must be one of the run's own taught weeks. Null when they fit, or the
 * refusal.
 */
export function handInSettingsProblem(run: CourseRunDoc, input: HandInSettingsInput): string | null {
  if (input.showcaseWeek === null) return null;
  const taught = resolveCalendar(run, null).weekPlan.some(
    (entry) => entry.kind === "week" && entry.weekNumber === input.showcaseWeek,
  );
  return taught ? null : SHOWCASE_NOT_A_WEEK;
}
