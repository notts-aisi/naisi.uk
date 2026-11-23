import CourseEditor from "@/features/courses/CourseEditor";
import { readRunProgrammes } from "@/lib/courses/coursePage/runProgrammes";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireCourseAuthorPage } from "@/lib/firebase/pageGates";

/**
 * A course's own page. Route params are Promises in Next 16, so this stays an
 * async Server Component that awaits them and hands the id to the client
 * page. Access is `courses/layout.tsx`'s (`requireCourseAuthorPage()`: admin,
 * `draftCourse` or `approveCourse`), asked again here because this page reads
 * on the server with the reader's session: which programme names each run of
 * the course, and whether this reader may open that programme's Overview
 * (`readRunProgrammes`). The cards read and write from the browser, and
 * through their own routes, as they always have; Firestore rules and those
 * routes are the boundary on each one.
 */
export const dynamic = "force-dynamic";

export default async function AdminCourseEditorPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const [{ courseId }, user] = await Promise.all([params, requireCourseAuthorPage()]);
  const db = getAdminDb();
  const programmes = db ? await readRunProgrammes(db, user, courseId) : null;
  return <CourseEditor courseId={courseId} programmes={programmes} />;
}
