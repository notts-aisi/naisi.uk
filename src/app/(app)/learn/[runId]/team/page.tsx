import { redirect } from "next/navigation";
import TeamPage from "@/features/courses/team/TeamPage";
import { getRunAccess } from "@/features/courses/runAccess";
import { loadTeamPage } from "@/lib/courses/teamPage/load";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * A TEAM'S OWN PAGE, for the people in it (boards in-team and
 * in-team-phone), reached from their programme's page once teams are made
 * and they have been told theirs.
 *
 * Drawn on the server from `loadTeamPage`, so it is all there before the
 * page's script arrives. `?link=add` opens the form that adds a link: an
 * address, so "Add a link" works before the script has loaded.
 *
 * WHO. The `[runId]` layout has already sent away anybody with no role on
 * the run. This page narrows to somebody among a team's people who has been
 * told their team (`teamPagePerson`): anybody else, the programme's lead and
 * admins included (they read every team's page from the Teams tab), goes
 * back to the run's home, which decides the rest. A redirect, not a refusal,
 * the learning space's rule: a guessed address says nothing.
 */

export const dynamic = "force-dynamic";

export default async function TeamPageRoute({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ link?: string | string[] }>;
}) {
  const [{ runId }, query] = await Promise.all([params, searchParams]);
  const home = `/learn/${encodeURIComponent(runId)}`;

  const access = await getRunAccess(runId);
  if (!access) redirect("/learn");
  const db = getAdminDb();
  if (!db) redirect(home);

  const outcome = await loadTeamPage(db, access.user, runId);
  if (!outcome.ok) redirect(home);

  return <TeamPage view={outcome.view} addingLink={query.link === "add" && outcome.view.canChangeLinks} />;
}
