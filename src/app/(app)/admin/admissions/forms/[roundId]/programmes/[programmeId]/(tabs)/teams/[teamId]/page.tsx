import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import { TeamsAreAnIncubators, TeamsAreTheLeads } from "@/features/applications/teams/TeamsRefusals";
import TeamPage from "@/features/courses/team/TeamPage";
import { loadLeadTeamPage } from "@/lib/courses/teamPage/lead";
import { NO_SUCH_TEAM } from "@/lib/courses/teams/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE TEAM'S PAGE, AS THE PROGRAMME'S LEAD AND ADMINS READ IT, reached from
 * the Teams tab's Hand-ins: the team's people, its project, every week's
 * check-in, its links and its hand-in, with nothing to write. The team's own
 * page (`/learn/[runId]/team`) is for its people.
 *
 * WHO. The tree's gate runs first, then the `(tabs)` layout draws "there is
 * no programme here" for somebody with no role on the programme. This page
 * then asks the Teams tab's own question (`loadLeadTeamPage`, through
 * `teamsGate`), before the run is read: an admin and the programme's lead
 * are shown the page; a reviewer is told the tab is the lead's and admins';
 * a fellowship has no teams; a team that is not on the run the programme
 * names, or no run at all, is said in one sentence with the way back to
 * Teams.
 */

export const dynamic = "force-dynamic";

export default async function LeadTeamPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string; teamId: string }>;
}) {
  const [{ roundId, programmeId, teamId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadLeadTeamPage(db, user, roundId, programmeId, teamId) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "no-team") {
    return (
      <Refusal
        title="That team isn’t here"
        href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/teams`}
        action="Go to Teams"
      >
        {NO_SUCH_TEAM}
      </Refusal>
    );
  }
  if (outcome.status === "not-yours") return <TeamsAreTheLeads roundId={roundId} programmeId={programmeId} />;
  if (outcome.status === "not-an-incubator") {
    return <TeamsAreAnIncubators roundId={roundId} programmeId={programmeId} programmeName={outcome.programmeName} />;
  }
  return <TeamPage view={outcome.view} />;
}
