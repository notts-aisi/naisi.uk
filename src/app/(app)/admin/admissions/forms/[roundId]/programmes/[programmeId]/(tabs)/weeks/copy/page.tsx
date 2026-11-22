import Link from "next/link";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import CopyWeeks from "@/features/applications/weeks/CopyWeeks";
import SavedTemplates from "@/features/applications/weeks/SavedTemplates";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import styles from "@/features/applications/weeks/weeks.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadCopySources } from "@/lib/courses/weeksTab/copy";
import { readTabRun } from "@/lib/courses/weeksTab/load";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import { loadTemplateList } from "@/lib/courses/weeksTab/templates";
import { COPY_LEDE, COPY_WEEKS, WEEKS_TAB, nothingToCopy, otherRunsTitle } from "@/lib/courses/weeksTab/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * "COPY WEEKS FROM THE COURSE", a page of a programme's
 * Weeks tab. Its first sentence is the promise both copies keep: copying
 * fills weeks that are empty, and a week with anything in it is left as it
 * is.
 *
 *  - OTHER RUNS of the course that hold weeks, each with "Copy its weeks",
 *    through the copy route every run editor uses, which copies only the
 *    weeks this run has no page for yet.
 *  - SAVED TEMPLATES of the course (`loadTemplateList`), each with who saved
 *    it and when and "Copy it in", which writes only the weeks that are
 *    empty (`src/lib/courses/weeksTab/fill.ts`); for an admin, "Delete…" with
 *    its question, and "Save this term's weeks as a template".
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), as the tab is.
 * The lead copies a template in; saving and deleting one are an admin's.
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
  const [sources, templates] = await Promise.all([loadCopySources(db, run.courseId, run.id), loadTemplateList(db, run.courseId, user)]);
  const courseTitle = run.courseTitle.trim() || view.programmeName;
  const weeksOnRun = run.weekPlan.filter((entry) => entry.kind === "week").length;

  return (
    <div className={styles.stack}>
      <Link href={weeksPath(view.roundId, view.programmeId)} className={styles.back}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span>{WEEKS_TAB}</span>
      </Link>
      <div>
        <h2 className={styles.heading}>{COPY_WEEKS}</h2>
        <p className={styles.lede}>{COPY_LEDE}</p>
      </div>
      <section className={styles.panel} aria-labelledby="copy-weeks-title">
        <h2 id="copy-weeks-title" className={styles.subheading}>
          {otherRunsTitle(courseTitle)}
        </h2>
        {sources.length === 0 ? <p className={styles.muted}>{nothingToCopy(courseTitle)}</p> : <CopyWeeks runId={run.id} sources={sources} />}
      </section>
      <SavedTemplates
        runId={run.id}
        courseId={run.courseId}
        courseTitle={courseTitle}
        weeksOnRun={weeksOnRun}
        rows={templates}
        isAdmin={view.viewer === "admin"}
      />
    </div>
  );
}
