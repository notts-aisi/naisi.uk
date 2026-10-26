import Link from "next/link";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import PublishGroups from "@/features/applications/groups/PublishGroups";
import PublishReadiness from "@/features/applications/groups/PublishReadiness";
import RunBlank from "@/features/applications/groups/RunBlank";
import styles from "@/features/applications/groups/PublishGroups.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { buildReadiness } from "@/lib/courses/getReady/model";
import { readGetReady } from "@/lib/courses/getReady/read";
import { PUBLISH_BACK, publishHeading } from "@/lib/courses/getReady/words";
import { readRunRecords } from "@/lib/courses/programmeAttendance";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Groups tab, Publish's own page (board st-publish), reached
 * from the Overview's "Publish groups…" and from People in groups: whether
 * the groups are ready to publish, the two emails as each person will get
 * them, who a press reaches, "Send a test to me" and "Publish and send 37
 * emails".
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read, as the tab's other views are. A reviewer
 * is told the tab is the lead's and an admin's. The readiness check is
 * worked out on the server from the facts the Overview's checklist reads
 * (`readGetReady`, `buildReadiness`); the emails and the buttons are
 * Publish's own, through its own routes, which decide again who may press
 * and refuse whatever Publish refuses, whatever this page shows.
 */
export default async function ProgrammePublishPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const records = await readRunRecords(db, view.run.id);
  if (!records) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const ready = await readGetReady(db, user, view.roundId, view.programmeId, records, new Date());

  return (
    <div className={styles.page}>
      <Link
        href={`/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups`}
        className={styles.back}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span>{PUBLISH_BACK}</span>
      </Link>
      <h2 className={styles.title}>{publishHeading(view.programmeName)}</h2>
      {ready ? <PublishReadiness model={buildReadiness(ready.facts)} roundId={view.roundId} programmeId={view.programmeId} /> : null}
      <PublishGroups runId={view.run.id} />
    </div>
  );
}
