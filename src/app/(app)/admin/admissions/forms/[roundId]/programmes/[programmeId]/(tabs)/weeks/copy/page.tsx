import Link from "next/link";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import CopyWeeks from "@/features/applications/weeks/CopyWeeks";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import styles from "@/features/applications/weeks/weeks.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadCopySources } from "@/lib/courses/weeksTab/copy";
import { readTabRun } from "@/lib/courses/weeksTab/load";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import { COPY_WEEKS, TEMPLATES_LINE, WEEKS_TAB, copyLede, nothingToCopy } from "@/lib/courses/weeksTab/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * "COPY WEEKS FROM THE COURSE" (board pr-weeks), a page of a programme's
 * Weeks tab: the course's other runs that hold weeks, each with "Copy its
 * weeks", which copies only the weeks this run does not have yet.
 *
 * A course holds no weeks of its own yet (weeks live on runs; what a
 * course's own curriculum should be is still to be settled), so this is the
 * nearest thing the site has: another run of the same course, through the
 * copy route every run editor uses. An admin is also told where a saved
 * template is applied.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), as the tab is.
 */
export default async function CopyWeeksPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <WeeksNotYours roundId={roundId} programmeId={programmeId} />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const run = await readTabRun(db, view.run.id);
  if (!run) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const sources = await loadCopySources(db, run.courseId, run.id);
  const courseTitle = run.courseTitle.trim() || view.programmeName;

  return (
    <div className={styles.stack}>
      <Link href={weeksPath(view.roundId, view.programmeId)} className={styles.back}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span>{WEEKS_TAB}</span>
      </Link>
      <section className={styles.panel} aria-labelledby="copy-weeks-title">
        <h2 id="copy-weeks-title" className={styles.heading}>
          {COPY_WEEKS}
        </h2>
        <p className={styles.lede}>{copyLede(courseTitle)}</p>
        {sources.length === 0 ? <p className={styles.muted}>{nothingToCopy(courseTitle)}</p> : <CopyWeeks runId={run.id} sources={sources} />}
        {view.viewer === "admin" && (
          <p className={styles.muted}>
            {TEMPLATES_LINE}{" "}
            <Link href={`/admin/courses/${encodeURIComponent(run.courseId)}/runs/${encodeURIComponent(run.id)}`} className={styles.inlineLink}>
              Open the run’s editor
            </Link>
          </p>
        )}
      </section>
    </div>
  );
}
