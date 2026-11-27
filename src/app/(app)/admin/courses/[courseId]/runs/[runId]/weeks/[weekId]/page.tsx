import WeekEditor from "@/features/courses/WeekEditor";
import { isAddressableId } from "@/lib/addressableId";
import { readWeekInUse } from "@/lib/courses/olderEditor/weekInUse";
import { weekStaysPublishedWords } from "@/lib/courses/olderEditor/words";
import { namingProgrammeOf } from "@/lib/courses/olderEditor/naming";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireCourseAuthorPage } from "@/lib/firebase/pageGates";

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
 * Two things are read here. The programme that names the run, if any, for the
 * address of this week on its Weeks page, where the week's blocks are changed
 * and it is marked ready: only the two ids of the form and the programme
 * reach the page, as a link. And whether the week is in use
 * (`readWeekInUse`: anybody has ticked or written in it, or a group's
 * session for it has passed), so that a published week
 * says it stays published in place of its switch: only that sentence reaches
 * the page, never a count or a name. The unpublish route asks again and is
 * the lock.
 */
export default async function AdminCourseWeekPage({
  params,
}: {
  params: Promise<{ courseId: string; runId: string; weekId: string }>;
}) {
  const { courseId, runId, weekId } = await params;
  await requireCourseAuthorPage();
  const db = getAdminDb();
  const naming = await namingProgrammeOf(runId);
  const weeksHref = naming ? weeksPath(naming.roundId, naming.programmeId, weekId) : null;
  const facts =
    db && isAddressableId(runId)
      ? await readWeekInUse(db, { runId, weekId, now: new Date() }).catch(() => null)
      : null;
  const staysPublished = facts && facts.week.published && facts.inUse ? weekStaysPublishedWords(facts.weekNumber) : null;
  return <WeekEditor courseId={courseId} runId={runId} weekId={weekId} weeksHref={weeksHref} staysPublished={staysPublished} />;
}
