import { redirect } from "next/navigation";
import { leavePathFor } from "@/lib/courses/leaving";
import { loadLeftView } from "@/lib/courses/leftView";
import { pitchingCard } from "@/lib/courses/pitching/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import LeftProgramme from "@/features/courses/leaving/LeftProgramme";
import RunHome from "@/features/courses/RunHome";
import { getRunAccess } from "@/features/courses/runAccess";

/**
 * The run home — the page a learner opens daily, and the stage for the
 * WeekRail's once-per-session draw.
 *
 * ROUTING IS THIS FILE'S WHOLE JOB. It resolves the caller's role on this run
 * and decides where they belong; everything visible lives in `RunHome`, a
 * client component, because the learning space's data moves under the reader
 * and the draw is a mount-time effect.
 *
 *   canLearn                    → the cohort view
 *   left the run themselves     → the page that says so (wk-left-phone):
 *                                 the day, what stays theirs, their marks,
 *                                 and nothing of the group's
 *   reviewer / track lead only  → /admissions, their entire surface on this
 *                                 run. Admissions is a separate lane from the
 *                                 cohort (locked decision, stated from the
 *                                 other side in the overview route): reviewing
 *                                 applications grants no sight of the people
 *                                 who were admitted.
 *   anyone else                 → /learn — a plain redirect rather than a 403,
 *                                 so a guessed run id reveals nothing about
 *                                 whether that run exists.
 *
 * The redirects are convenience, not the boundary: every route behind them
 * re-derives access from the session, so a member who reaches a surface they
 * shouldn't sees an error, not someone else's cohort.
 */

export const dynamic = "force-dynamic";

export default async function RunHomePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  // Free: `[runId]/layout.tsx` already called this, and `getRunAccess` is
  // `cache()`-wrapped, so the second call is the same object, not a second pair
  // of reads.
  const access = await getRunAccess(runId);
  // Null fuses "no session" with "no such run" on purpose (run ids stay
  // unenumerable). The layout has already split those two and redirected, so
  // reaching this line means a request raced a change; the hub is the right
  // landing for every branch of it.
  if (!access) redirect("/learn");

  if (!access.canLearn) {
    // Somebody who left the run themselves reads the page that says so (board
    // wk-left-phone), and nothing else of the run.
    if (access.hasLeft && access.enrolment) {
      const leftDb = getAdminDb();
      if (leftDb) {
        const view = await loadLeftView(leftDb, { run: access.run, enrolment: access.enrolment }, new Date());
        return <LeftProgramme view={view} />;
      }
    }
    if (access.isReviewer || access.isTrackLead) {
      redirect(`/learn/${encodeURIComponent(runId)}/admissions`);
    }
    redirect("/learn");
  }

  // `isAdmin` travels as a prop rather than being read off the overview
  // payload: that payload's `access` block is a mirror of the server's
  // decision, and this one is the decision.
  //
  // `canEmailCohort` is the announcement lane's gate, spelled the same way
  // here, on `/learn/[runId]/email` and in the send route: run facilitators,
  // track leads and admins. It CANNOT come off `access.isFacilitator`, which
  // is also true for someone who merely holds one group — the person that
  // lane deliberately excludes.
  const canEmailCohort =
    access.isAdmin ||
    access.isTrackLead ||
    isNamedWithStanding(
      access.user,
      "courseRuns.runFacilitatorUids",
      access.run.runFacilitatorUids,
    );

  // Pitching week's card, for somebody taking part, while it is on (see
  // `pitchingCard`). Worked out here so the run home's one fetch stays as it
  // is; a run with no pitching week costs one query.
  const db = getAdminDb();
  const pitching = access.isEnrolled && db ? await pitchingCard(db, access.user, runId) : null;

  // "Leave the programme" at the foot (wk-programme), for somebody taking
  // part whose seat they can leave themselves, until the run's last session
  // is over: the same rule the leave route asks (`leavePathFor`), so the link
  // is drawn exactly where the press works.
  const own = access.enrolment;
  const canLeave =
    access.isEnrolled &&
    own !== null &&
    own.role === "learner" &&
    own.status === "active" &&
    db !== undefined &&
    "path" in (await leavePathFor(db, access.run, access.user.uid, new Date()));

  return (
    <RunHome
      runId={runId}
      isAdmin={access.isAdmin}
      canEmailCohort={canEmailCohort}
      pitching={pitching}
      canLeave={canLeave}
    />
  );
}
