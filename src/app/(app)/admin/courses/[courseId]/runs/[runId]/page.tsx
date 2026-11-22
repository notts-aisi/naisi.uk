import RunEditor from "@/features/courses/RunEditor";
import { isAddressableId } from "@/lib/addressableId";
import { runStarted } from "@/lib/courses/olderEditor/runStarted";
import { namingProgrammeOf } from "@/lib/courses/olderEditor/naming";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Admin run editor. `courses/layout.tsx` gates the tree server-side with
 * `requireCourseAuthorPage()` (admin, `draftCourse` or `approveCourse`), so
 * this page only has to resolve params and hand off to the client editor
 * (which reads Firestore directly: rules are the real boundary for every write
 * it makes).
 *
 * Two facts the editor cannot read for itself are read here: whether Publish
 * has sent the run's groups out (the run's `allocationPublishedAt`, which the
 * editor's own reading of the run does not carry), and which programme names
 * the run, whose Groups tab holds each group's page. Once the groups have gone
 * out the run's start date and week plan are read only and each group's day,
 * time and length are words with the way to that page.
 *
 * And whether anybody has started the run: one count each of its
 * `courseProgress` and `courseExerciseResponses` rows (`runStarted`), so the
 * copy section can say before the press that Replace is refused. Only the
 * yes or no reaches the page; nothing about anybody is read.
 */
export default async function AdminCourseRunPage({
  params,
}: {
  params: Promise<{ courseId: string; runId: string }>;
}) {
  const { courseId, runId } = await params;
  const db = getAdminDb();
  let groupsGoneOut = false;
  let groupPagesAt: { roundId: string; programmeId: string } | null = null;
  let programmeName: string | null = null;
  let peopleStarted = false;
  if (db && isAddressableId(runId)) {
    const [runSnap, naming, started] = await Promise.all([
      db.collection("courseRuns").doc(runId).get(),
      namingProgrammeOf(runId),
      runStarted(db, runId).catch(() => false),
    ]);
    groupsGoneOut = Boolean(runSnap.exists && runSnap.data()?.allocationPublishedAt);
    groupPagesAt = naming ? { roundId: naming.roundId, programmeId: naming.programmeId } : null;
    programmeName = naming?.shortName ?? null;
    peopleStarted = started;
  }
  return (
    <RunEditor
      courseId={courseId}
      runId={runId}
      groupsGoneOut={groupsGoneOut}
      groupPagesAt={groupPagesAt}
      programmeName={programmeName}
      peopleStarted={peopleStarted}
    />
  );
}
