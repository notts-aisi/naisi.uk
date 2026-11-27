import RunEditor from "@/features/courses/RunEditor";
import { isAddressableId } from "@/lib/addressableId";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireCourseAuthorPage } from "@/lib/firebase/pageGates";

/**
 * Admin run editor. The page asks `requireCourseAuthorPage()` (admin,
 * `draftCourse` or `approveCourse`) itself before it reads, as
 * `courses/layout.tsx` does, then hands off to the client editor (which reads
 * Firestore directly: rules are the real boundary for every write it makes).
 *
 * Two facts the editor cannot read for itself are read here: whether Publish
 * has sent the run's groups out (the run's `allocationPublishedAt`, which the
 * editor's own reading of the run does not carry), and which programme names
 * the run, whose Groups tab holds each group's page. Once the groups have gone
 * out the run's start date and week plan are read only and each group's day,
 * time and length are words with the way to that page. Nothing about anybody
 * is read.
 */
export default async function AdminCourseRunPage({
  params,
}: {
  params: Promise<{ courseId: string; runId: string }>;
}) {
  const { courseId, runId } = await params;
  await requireCourseAuthorPage();
  const db = getAdminDb();
  let groupsGoneOut = false;
  let groupPagesAt: { roundId: string; programmeId: string } | null = null;
  if (db && isAddressableId(runId)) {
    const [runSnap, naming] = await Promise.all([
      db.collection("courseRuns").doc(runId).get(),
      readNamingProgramme(db, runId).catch(() => null),
    ]);
    groupsGoneOut = Boolean(runSnap.exists && runSnap.data()?.allocationPublishedAt);
    groupPagesAt = naming ? { roundId: naming.roundId, programmeId: naming.programmeId } : null;
  }
  return <RunEditor courseId={courseId} runId={runId} groupsGoneOut={groupsGoneOut} groupPagesAt={groupPagesAt} />;
}
