import { redirect } from "next/navigation";
import LeftProgramme from "@/features/courses/leaving/LeftProgramme";
import ReadingListView from "@/features/courses/leaving/ReadingListView";
import { getRunAccess } from "@/features/courses/runAccess";
import { loadLeftView, loadReadingList } from "@/lib/courses/leftView";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * THE READING LIST of a programme: every published week's readings, as the
 * person's group reads them, read only, for somebody taking part, since every
 * published week is already theirs to read.
 *
 * WHO. A learner taking part on the run. Somebody who left it by themselves
 * (`hasLeft`) is shown the page that says they left, here as on the run's own
 * page, and no reading list. Anybody else goes back to the run's home, which
 * decides the rest.
 */

export const dynamic = "force-dynamic";

export default async function ReadingPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const home = `/learn/${encodeURIComponent(runId)}`;

  const access = await getRunAccess(runId);
  if (!access) redirect("/learn");
  const enrolment = access.enrolment;
  if (!enrolment || enrolment.role !== "learner" || !(access.isEnrolled || access.hasLeft)) redirect(home);
  const db = getAdminDb();
  if (!db) redirect(home);

  if (access.hasLeft) return <LeftProgramme view={await loadLeftView(db, { run: access.run, enrolment })} />;
  const list = await loadReadingList(db, { run: access.run, enrolment });
  return <ReadingListView list={list} />;
}
