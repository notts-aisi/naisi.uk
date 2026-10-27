import { redirect } from "next/navigation";
import PitchingWeek from "@/features/courses/pitching/PitchingWeek";
import { getRunAccess } from "@/features/courses/runAccess";
import { loadPitching } from "@/lib/courses/pitching/load";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Pitching week, for somebody taking part (board in-pitch-phone): their own
 * pitch, their group's pitches, "I’d join this" on each, until their group's
 * session in that week starts. Reached from their programme's page.
 *
 * Drawn on the server from the same read the GET route answers with
 * (`loadPitching`), so it is all there before the page's script arrives; the
 * presses go to the two POST routes beside that one.
 *
 * WHO. The `[runId]` layout has already sent away anybody with no role on the
 * run. This page narrows to a person taking part: anybody else, facilitators
 * and admins included, and everybody when the run has no published pitching
 * week, goes back to the run's home, which decides the rest. A redirect, not
 * a refusal, the learning space's rule: a guessed address says nothing.
 *
 * `?edit=1` opens the person's own pitch in its form: the "Edit until 6pm"
 * link is an address, so it works before the page's script has loaded.
 */

export const dynamic = "force-dynamic";

export default async function PitchingPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string }>;
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  const [{ runId }, query] = await Promise.all([params, searchParams]);
  const home = `/learn/${encodeURIComponent(runId)}`;

  const access = await getRunAccess(runId);
  if (!access) redirect("/learn");
  const db = getAdminDb();
  if (!db) redirect(home);

  const outcome = await loadPitching(db, access.user, runId);
  if (!outcome.ok) redirect(home);

  const editing = query.edit === "1" && outcome.view.open && outcome.view.mine !== null;
  return <PitchingWeek initial={outcome.view} editing={editing} />;
}
