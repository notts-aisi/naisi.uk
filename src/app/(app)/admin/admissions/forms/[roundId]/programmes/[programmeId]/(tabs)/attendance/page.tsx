import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import ProgrammeAttendance from "@/features/applications/groups/ProgrammeAttendance";
import RunBlank from "@/features/applications/groups/RunBlank";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { buildRunAttendance, readRunRecords } from "@/lib/courses/programmeAttendance";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Attendance tab (board wk-attendance): every register of the
 * course run the programme names, as one grid, read only.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read. A reviewer is told the tab is the lead's
 * and an admin's. The grid is worked out on the server, once
 * (`buildRunAttendance`), from the run's records: who is a row follows the
 * register's own rule, so a lead sees the people Publish has told, and an
 * admin everybody placed. Nothing here marks anything.
 *
 * `?group=<id>` opens the tab on one group: the Overview's "See it" links
 * here that way. An id that is not one of the run's groups is ignored.
 */
export default async function ProgrammeAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ group?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { group?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return <NotYours roundId={roundId} programmeId={programmeId} tab="Attendance" />;
  }
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const records = await readRunRecords(db, view.run.id);
  if (!records) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const model = buildRunAttendance(records, { isAdmin: view.viewer === "admin" }, new Date());
  const asked = typeof query.group === "string" ? query.group : "all";
  return (
    <ProgrammeAttendance
      model={model}
      roundId={view.roundId}
      programmeId={view.programmeId}
      programmeName={view.programmeName}
      initialGroup={model.groups.some((group) => group.id === asked) ? asked : "all"}
    />
  );
}
