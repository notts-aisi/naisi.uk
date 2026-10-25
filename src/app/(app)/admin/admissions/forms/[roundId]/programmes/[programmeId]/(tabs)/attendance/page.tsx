import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import ProgrammeRegisters from "@/features/applications/groups/ProgrammeRegisters";
import RunBlank from "@/features/applications/groups/RunBlank";
import { loadProgrammeRun, loadRunGroupHeadings } from "@/lib/applications/handover/programmeRun";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Attendance tab: every register of the course run the
 * programme names, read only, group by group.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read. A reviewer is told the tab is the lead's
 * and an admin's. The page reads the run's groups by name and time; each
 * register is read by the register's own route, which asks again who the
 * caller is on the run and lets the lead read and never write.
 */
export default async function ProgrammeAttendancePage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return <NotYours roundId={roundId} programmeId={programmeId} tab="Attendance" />;
  }
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  return <ProgrammeRegisters groups={await loadRunGroupHeadings(db, view.run.id)} />;
}
