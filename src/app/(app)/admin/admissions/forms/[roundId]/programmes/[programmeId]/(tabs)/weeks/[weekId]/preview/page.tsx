import Link from "next/link";
import { redirect } from "next/navigation";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import PreviewWeek from "@/features/applications/weeks/PreviewWeek";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import styles from "@/features/applications/weeks/weeks.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { liveGroupsOfRun, readTabRun } from "@/lib/courses/weeksTab/load";
import { weekNumberOfId, weeksPath } from "@/lib/courses/weeksTab/paths";
import { loadWeekPreview } from "@/lib/courses/weeksTab/preview";
import { nothingToPreviewWords, previewLine } from "@/lib/courses/weeksTab/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * "PREVIEW AS A FELLOW" (board pr-weeks): one week of the run a programme
 * names, drawn by the member's own week page as somebody taking part reads
 * it, with nothing ticked or written and nothing that can be pressed
 * (`loadWeekPreview`). `?group=<id>` previews a group's own copy of the week,
 * when the group is one of the run's that still meet and has one.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), as the tab is.
 * It reads the week, never anybody's answers, and writes nothing.
 */
export default async function PreviewWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; weekId: string }>;
  searchParams: Promise<{ group?: string | string[] }>;
}) {
  const [{ roundId, programmeId, weekId }, query, user] = await Promise.all([params, searchParams, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <WeeksNotYours roundId={roundId} programmeId={programmeId} />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const run = await readTabRun(db, view.run.id);
  if (!run) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const weekNumber = weekNumberOfId(weekId);
  const inPlan = weekNumber !== null && run.weekPlan.some((entry) => entry.kind === "week" && entry.weekNumber === weekNumber);
  if (weekNumber === null || !inPlan) redirect(weeksPath(view.roundId, view.programmeId));

  // A group's copy only for one of the run's groups that still meet.
  const asked = Array.isArray(query.group) ? query.group[0] : query.group;
  const group = asked ? ((await liveGroupsOfRun(db, run.id)).find((candidate) => candidate.id === asked) ?? null) : null;
  const preview = await loadWeekPreview(db, run.id, weekNumber, weekId, group?.id ?? null);

  return (
    <div className={styles.stack}>
      <Link href={weeksPath(view.roundId, view.programmeId, weekId)} className={styles.back}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15 6l-6 6 6 6" />
        </svg>
        <span>{`Week ${weekNumber}`}</span>
      </Link>
      {preview ? (
        <>
          <p role="status" className={styles.line}>
            <span className={styles.lineText}>{previewLine(weekNumber, group ? group.name.trim() || "Untitled group" : null)}</span>
          </p>
          <div className={styles.preview}>
            <PreviewWeek runId={preview.runId} weekNumber={preview.weekNumber} week={preview.week} payload={preview.payload} />
          </div>
        </>
      ) : (
        <p className={styles.panelNote}>{nothingToPreviewWords(weekNumber)}</p>
      )}
    </div>
  );
}
