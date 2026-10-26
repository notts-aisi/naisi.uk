import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import ProgrammeOverview from "@/features/applications/overview/ProgrammeOverview";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadForm } from "@/lib/applications/repo";
import { loadCertificatesSection } from "@/lib/courses/certificates/send";
import { loadWhoFinished } from "@/lib/courses/finishing/whoFinished";
import { buildGetReady } from "@/lib/courses/getReady/model";
import { readGetReady } from "@/lib/courses/getReady/read";
import { readRunRecords } from "@/lib/courses/programmeAttendance";
import { anyGroupHasMet, buildProgrammeOverview } from "@/lib/courses/programmeOverview";
import { loadRunGroups, loadUpdatesFor, updateReadingOf } from "@/lib/courses/updates/readers";
import { overviewUpdateRows } from "@/lib/courses/updates/views";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Overview tab (board wk-overview), the first tab of a
 * programme that names a course run: the week the run is in, each group's
 * session this week and its register, what needs attention, who came by
 * week, and how many are taking part.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read, as Groups and Attendance are. A reviewer
 * is told the tab is the lead's and an admin's. Every figure is worked out on
 * the server from the run's records, the way the Attendance tab works them
 * out, and the page only draws them. The one thing it does is "Remind",
 * which goes through its own route. Its Updates card shows the newest
 * updates on the run, read as the Messages tab reads them, and links there.
 *
 * Once the run's last session is over, Who finished (board en-finish) leads
 * the page, and its switches save through their own route; before then the
 * People card says when it can be done (`loadWhoFinished`). Certificates
 * follows it, read only then (`loadCertificatesSection`, which asks the
 * same question of the form again), and sends through its own two routes.
 *
 * BEFORE ANY OF THE RUN'S GROUPS HAS MET (`anyGroupHasMet`) the page is "Get
 * ready for week 1" instead (boards st-overview and st-overview-phone): the
 * checklist, who has not said when they are free, the places and the
 * facilitators, read once (`readGetReady`) and worked out by `buildGetReady`,
 * the same facts Publish's own page checks itself against.
 */
export default async function ProgrammeOverviewPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  const programmePath = `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
  if (outcome.status === "not-yours") {
    return (
      <Refusal
        title="Only the programme’s lead and admins can open Overview"
        href={`${programmePath}/applications`}
        action="Go to applications"
      >
        Overview shows how the programme’s groups and registers are going, by name, so only the programme’s lead or
        an admin can open it.
      </Refusal>
    );
  }
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const [records, form] = await Promise.all([readRunRecords(db, view.run.id), loadForm(db, view.roundId)]);
  if (!records) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const groups = await loadRunGroups(db, records.run.id);
  const now = new Date();
  const viewer = { isAdmin: view.viewer === "admin", uid: user.uid };
  // Before any group has met: "Get ready for week 1".
  const beforeTheStart = !anyGroupHasMet(records, now);
  const [model, loaded, finishing, ready] = await Promise.all([
    buildProgrammeOverview(
      db,
      records,
      viewer,
      { programmePath, courseId: view.run.courseId, decisionsSentAt: form?.decisionsSentAt ?? null },
      now,
    ),
    updateReadingOf(db, user, records.run, groups).then((reading) =>
      loadUpdatesFor(db, records.run, reading, groups, view.programmeName),
    ),
    loadWhoFinished(db, records, viewer, now),
    beforeTheStart ? readGetReady(db, user, view.roundId, view.programmeId, records, now) : Promise.resolve(null),
  ]);
  const certificates =
    finishing.state === "open" ? await loadCertificatesSection(db, user, roundId, programmeId, now) : null;
  return (
    <ProgrammeOverview
      model={model}
      updates={overviewUpdateRows(loaded.updates)}
      roundId={view.roundId}
      programmeId={view.programmeId}
      programmePath={programmePath}
      finishing={finishing}
      certificates={certificates}
      getReady={ready ? { model: buildGetReady(ready.facts), courseId: ready.courseId, runId: records.run.id } : null}
    />
  );
}
