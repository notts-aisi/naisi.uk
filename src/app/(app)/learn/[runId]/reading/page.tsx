import { redirect } from "next/navigation";
import ReadingListView from "@/features/courses/leaving/ReadingListView";
import { getRunAccess } from "@/features/courses/runAccess";
import { loadReadingList } from "@/lib/courses/leftView";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * THE READING LIST of a programme: every published week's readings, as the
 * person's group reads them, read only. Reached from the programme page
 * somebody reads once they have left ("What stays here"), and open to anybody
 * taking part too, since every published week is already theirs to read.
 *
 * WHO. A learner on the run, taking part or left by themselves (`hasLeft`).
 * Anybody else goes back to the run's home, which decides the rest.
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

  const list = await loadReadingList(db, { run: access.run, enrolment });
  return <ReadingListView list={list} />;
}
