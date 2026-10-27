import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import ProgrammeTeams from "@/features/applications/teams/ProgrammeTeams";
import { TeamsAreAnIncubators, TeamsAreTheLeads } from "@/features/applications/teams/TeamsRefusals";
import TeamHandIns from "@/features/courses/team/TeamHandIns";
import teamStyles from "@/features/courses/team/team.module.css";
import { loadProgrammeTeams } from "@/lib/applications/handover/teamsLoad";
import { loadTeamHandIns } from "@/lib/courses/teamPage/lead";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * An incubator's Teams tab: the teams inside its one weekly group, made from
 * the pitches or from the agenda people ranked on the form, each person's
 * "Move to…", and "Tell everyone their team" (boards in-teams, option C, and
 * in-agenda).
 *
 * WHO. The tree's gate runs first, then the `(tabs)` layout draws "there is
 * no programme here" in place of this page for somebody with no role on the
 * programme. This page then asks the form (`loadProgrammeTeams`), before the
 * run is read: an admin and the programme's lead are shown the tab; a
 * reviewer is told it is the lead's and admins'; a fellowship has no teams.
 * What each person ranked on the form is read only for those two, and only
 * for a run whose teams come from the agenda.
 *
 * Under the teams, "Hand-ins" (boards in-team and en-handin-phone): the
 * hand-in dates the lead and admins set, and every team's hand-in, read from
 * the team pages through the same gate (`loadTeamHandIns`), with the way to
 * each team's page.
 */
export default async function ProgrammeTeamsPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeTeams(db, user, roundId, programmeId) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <TeamsAreTheLeads roundId={roundId} programmeId={programmeId} />;
  if (outcome.status === "not-an-incubator") {
    return <TeamsAreAnIncubators roundId={roundId} programmeId={programmeId} programmeName={outcome.programmeName} />;
  }
  const { view } = outcome;
  if (view.blank !== null) return <RunBlank view={view} />;
  const handIns = db ? await loadTeamHandIns(db, user, roundId, programmeId) : null;
  return (
    <div className={teamStyles.tabStack}>
      <ProgrammeTeams view={view} />
      {handIns ? <TeamHandIns view={handIns} /> : null}
    </div>
  );
}
