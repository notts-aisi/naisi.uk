import YourApplications from "@/features/applications/home/YourApplications";
import { holdsPlace } from "@/features/applications/home/holdsPlace";
import { getLeftRuns } from "@/features/courses/runAccess";
import { loadLeftView } from "@/lib/courses/leftView";
import { getAdminDb } from "@/lib/firebase/admin";
import { getCurrentUser } from "@/lib/firebase/session";
import LearnHub, { type LeftRun } from "./LearnHub";

/**
 * `/learn`: every run the member touches, drawn by `LearnHub` in the browser
 * from the list of their runs.
 *
 * A Server Component for two reads the browser cannot make. Somebody decision
 * day gave a place has no run until they are put on one, so the hub would
 * tell them they are not on a course. The page asks `holdsPlace` (yes, no, or
 * could not tell) and hands the hub what to draw where it would say so:
 *
 *  - "no": nothing, and the hub says what it always has;
 *  - "yes", and "could not tell" (a view-as session, or a read that failed):
 *    the way to the member's applications, which names none of them. The hub
 *    then makes no claim either way.
 *
 * And the list of runs leaves out a run somebody left, so the page hands the
 * hub the runs the member left by themselves (`getLeftRuns`, the gate every
 * page under a run asks), each named as the run's own page names it. The hub
 * draws a card for each that says only that they left.
 *
 * THIS PAGE STATES NO OUTCOME. It does one thing for a place and for a place
 * it could not read, so nothing drawn here says which, and what became of an
 * application is said on the person's own page, which that card leads to.
 *
 * What a maintainer has to keep: both reads are by the session's own uid and
 * by nothing a request carries; the read of a place is not made in a view-as
 * session (the check is `holdsPlace`'s own, before it reads), while the runs
 * left are exactly what each run's own page shows the member, in a view-as
 * session too; and nothing in this file looks at an application or a decision.
 */
export default async function LearnPage() {
  const user = await getCurrentUser();
  const left = user ? await runsLeft() : [];
  const held = user ? await holdsPlace(user.uid) : "unknown";
  return <LearnHub instead={held === "no" ? null : <YourApplications rows={null} />} left={left} />;
}

/** The runs the member left by themselves, newest first, each as its own page names it. */
async function runsLeft(): Promise<LeftRun[]> {
  const db = getAdminDb();
  if (!db) return [];
  const accesses = await getLeftRuns();
  const named = await Promise.all(
    accesses.map(async (access) => {
      const enrolment = access.enrolment;
      if (!enrolment) return null;
      const view = await loadLeftView(db, { run: access.run, enrolment });
      return { runId: view.runId, name: view.name, at: enrolment.droppedOutAt?.getTime() ?? 0 };
    }),
  );
  return named
    .filter((entry): entry is LeftRun & { at: number } => entry !== null)
    .sort((a, b) => b.at - a.at || a.name.localeCompare(b.name, "en-GB"))
    .map(({ runId, name }) => ({ runId, name }));
}
