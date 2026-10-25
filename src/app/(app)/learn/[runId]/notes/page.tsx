import { redirect } from "next/navigation";
import OwnNotesView from "@/features/courses/leaving/OwnNotesView";
import { getRunAccess } from "@/features/courses/runAccess";
import { loadOwnNotes } from "@/lib/courses/leftView";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * THEIR NOTES AND REFLECTIONS on a programme: what the person wrote on its
 * readings, read only. Reached from the programme page somebody reads once
 * they have left ("What stays here"), and open to anybody taking part too,
 * since it is only ever their own words.
 *
 * WHO. A learner on the run, taking part or left by themselves (`hasLeft`).
 * Anybody else goes back to the run's home, which decides the rest.
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

  const notes = await loadOwnNotes(db, { run: access.run, enrolment });
  return <OwnNotesView notes={notes} />;
}
