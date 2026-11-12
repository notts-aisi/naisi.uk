import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import { groupsPath } from "@/features/applications/groups/GroupsViews";
import SessionReportPageBody from "@/features/courses/report/SessionReportPageBody";
import { sessionParamOf } from "@/features/courses/register/RegisterPageBody";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { GO_TO_GROUPS, GROUP_NOT_HERE_LINE, GROUP_NOT_HERE_TITLE } from "@/lib/courses/groupPage/words";
import { loadReportPage } from "@/lib/courses/sessionReports/page";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE SESSION'S REPORT, written by the programme's lead or an admin who took
 * that session's register in a facilitator's place, under the group's page
 * in the programme's Groups tab (`.../groups/[groupId]/report?session=w02`).
 * The register under the same page leads here; the run's pages under /learn
 * do not admit the programme's lead.
 *
 * THE GATE: `loadProgrammeRun` (an admin and the programme's lead), then the
 * report's own (`loadReportPage`: a live facilitator of the group, or
 * whoever took the session the address names in a facilitator's place,
 * while it holds). Anybody else who reaches the programme is told calmly
 * that it is not here. The report route asks again on Send, and the report
 * says whose place its writer took.
 */

export const dynamic = "force-dynamic";

export default async function ProgrammeGroupReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; groupId: string }>;
  searchParams?: Promise<{ session?: string | string[] }>;
}) {
  const [{ roundId, programmeId, groupId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const session = sessionParamOf((await (searchParams ?? Promise.resolve({} as { session?: string | string[] }))).session);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  const tabPath = groupsPath(view.roundId, view.programmeId);
  const notHere = (
    <Refusal title={GROUP_NOT_HERE_TITLE} href={tabPath} action={GO_TO_GROUPS}>
      {GROUP_NOT_HERE_LINE}
    </Refusal>
  );
  if (!view.run || !isAddressableId(groupId)) return notHere;
  const report = await loadReportPage(db, user, view.run.id, groupId, session, new Date());
  if (!report) return notHere;

  const groupPage = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups/${encodeURIComponent(groupId)}`;
  const backHref = report.covering && session ? `${groupPage}/register?session=${encodeURIComponent(session)}` : groupPage;
  // Called, not mounted: the body holds no hook, so the page answers with the tree it draws.
  return SessionReportPageBody({ view: report, backHref });
}
