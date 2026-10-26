import { redirect } from "next/navigation";
import LeftProgramme from "@/features/courses/leaving/LeftProgramme";
import OwnNotesView from "@/features/courses/leaving/OwnNotesView";
import { getRunAccess } from "@/features/courses/runAccess";
import { loadLeftView, loadOwnNotes } from "@/lib/courses/leftView";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * THEIR NOTES AND REFLECTIONS on a programme: what the person wrote on its
 * readings, read only, for somebody taking part, since it is only ever their
 * own words.
 *
 * WHO. A learner taking part on the run. Somebody who left it by themselves
 * (`hasLeft`) is shown the page that says they left, here as on the run's own
 * page, and nothing of what they wrote: it stays in the programme's records,
 * not on a page of theirs. Anybody else goes back to the run's home, which
 * decides the rest.
 */

export const dynamic = "force-dynamic";

export default async function NotesPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const home = `/learn/${encodeURIComponent(runId)}`;

  const access = await getRunAccess(runId);
  if (!access) redirect("/learn");
  const enrolment = access.enrolment;
  if (!enrolment || enrolment.role !== "learner" || !(access.isEnrolled || access.hasLeft)) redirect(home);
  const db = getAdminDb();
  if (!db) redirect(home);

  if (access.hasLeft) return <LeftProgramme view={await loadLeftView(db, { run: access.run, enrolment })} />;
  const notes = await loadOwnNotes(db, { run: access.run, enrolment });
  return <OwnNotesView notes={notes} />;
}
