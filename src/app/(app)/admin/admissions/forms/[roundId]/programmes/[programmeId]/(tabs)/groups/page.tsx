import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import GroupsAreAdmins from "@/features/applications/times/GroupsAreAdmins";
import TimesPicture from "@/features/applications/times/TimesPicture";
import { canRunTerm } from "@/lib/applications/access";
import { loadTimesPicture } from "@/lib/applications/handover/timesLoad";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Groups tab, which today holds one view: the times picture
 * (how many of the people holding a place are free for a whole session at
 * each start time, the best times, and who can make each of the run's
 * groups). Read only: it writes nothing and keeps nothing.
 *
 * AN ADMIN'S, AND DECIDED BEFORE ANYTHING IS READ. The tree's gate runs
 * first, then this page asks the session alone whether the caller is an
 * admin, so a programme's lead or reviewer is told the tab is an admin's and
 * nothing about anybody has been read for them. The layout of the `(tabs)`
 * group has already drawn "there is no programme here" for somebody with no
 * role on the programme, in place of this page.
 *
 * `?length=<minutes>` counts sessions of that length: one of the lengths the
 * group editor offers, or one a group of the run already has. Anything else
 * counts the default, which comes from the run's groups.
 */
export default async function ProgrammeGroupsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<{ length?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams,
    requireAdmissionsPage(),
  ]);
  if (!canRunTerm(user)) return <GroupsAreAdmins roundId={roundId} programmeId={programmeId} />;
  const db = getAdminDb();
  const outcome = db ? await loadTimesPicture(db, user, roundId, programmeId, query.length) : null;
  if (!outcome || outcome.status !== "ok") return <NoProgrammeHere roundId={roundId} />;
  return <TimesPicture view={outcome.view} />;
}
