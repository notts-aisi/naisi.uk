import WeekEditor from "@/features/courses/WeekEditor";
import { readNamingProgramme } from "@/lib/courses/programmeLead";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Admin week editor. Weeks live at `courseRuns/{runId}/weeks/{wNN}` — under the
 * RUN, not the course — because a week's content is one cohort's delivery of
 * it, and copy-forward clones ids into the next run rather than sharing them.
 * The route mirrors that shape so the breadcrumb and the data model agree.
 *
 * `courses/layout.tsx` gates the tree server-side with
 * `requireCourseAuthorPage()` (admin, `draftCourse` or `approveCourse`), so
 * this page only resolves params and hands off to the client editor (which
 * reads and writes Firestore directly: rules are the real boundary).
 *
 * The one thing read here: the programme that names the run, if any, for the
 * address of this week on its Weeks page, where the week's blocks are changed
 * and it is marked ready. Only the two ids of the form and the programme
 * reach the page, as a link.
 */
export default async function AdminCourseWeekPage({
  params,
}: {
  params: Promise<{ courseId: string; runId: string; weekId: string }>;
}) {
  const { courseId, runId, weekId } = await params;
  const db = getAdminDb();
  const naming = db ? await readNamingProgramme(db, runId) : null;
  const weeksHref = naming ? weeksPath(naming.roundId, naming.programmeId, weekId) : null;
  return <WeekEditor courseId={courseId} runId={runId} weekId={weekId} weeksHref={weeksHref} />;
}
