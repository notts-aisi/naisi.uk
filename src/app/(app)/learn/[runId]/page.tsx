import { redirect } from "next/navigation";
import { homeEvents } from "@/app/(app)/dashboard/homeData";
import { readOwnCertificates } from "@/lib/courses/certificates/own";
import { liveGroupsOf, runEndOf } from "@/lib/courses/finishing/runEnd";
import { endSurveyFor } from "@/lib/surveys/waiting";
import { leavePathFor } from "@/lib/courses/leaving";
import { leaveClosedLine } from "@/lib/courses/leavingWords";
import { loadLeftView } from "@/lib/courses/leftView";
import { pitchingCard } from "@/lib/courses/pitching/load";
import { teamCardFor } from "@/lib/courses/teamPage/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getImpersonator, markerIsLive } from "@/lib/firebase/impersonation";
import LeftProgramme from "@/features/courses/leaving/LeftProgramme";
import { leftPageSurvey } from "@/features/courses/leaving/leftSurvey";
import RunHome from "@/features/courses/RunHome";
import { getRunAccess } from "@/features/courses/runAccess";
import { guideLinksOf } from "@/lib/courses/guide/load";

/**
 * The run home — the page a learner opens daily, and the stage for the
 * WeekRail's once-per-session draw.
 *
 * ROUTING IS THIS FILE'S WHOLE JOB. It resolves the caller's role on this run
 * and decides where they belong; everything visible lives in `RunHome`, a
 * client component, because the learning space's data moves under the reader
 * and the draw is a mount-time effect.
 *
 *   canLearn                    → the cohort view, and once the programme
 *                                 is over, for somebody who took part, the
 *                                 page that says so (en-after-phone), handed
 *                                 the survey at the end and the next event
 *   left the run themselves     → the page that says so (wk-left-phone):
 *                                 that they left and the day, and the
 *                                 leaving survey's card while it is theirs
 *                                 to answer (Q46), and nothing else: not
 *                                 their marks or notes, not the reading
 *                                 list, nothing of the group's
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
        const view = await loadLeftView(leftDb, { run: access.run, enrolment: access.enrolment });
        return <LeftProgramme view={view} survey={await leftPageSurvey(leftDb, access)} />;
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
  // "Your team", for somebody among a team's people who has been told their
  // team (`teamCardFor`, the team page's own gate). A run with no teams costs
  // the gate's reads only for somebody taking part.
  const team = access.isEnrolled && db ? await teamCardFor(db, access.user, runId) : null;

  // "Leave the programme" at the foot (wk-programme), for somebody taking
  // part whose seat they can leave themselves, until the run's last session
  // is over: the same rule the leave route asks (`leavePathFor`), so the link
  // is drawn exactly where the press works.
  const own = access.enrolment;
  const leave =
    access.isEnrolled && own !== null && own.role === "learner" && own.status === "active" && db !== undefined
      ? await leavePathFor(db, access.run, access.user.uid, new Date())
      : null;
  const canLeave = leave !== null && "path" in leave;
  // A facilitator who holds a place is told why there is no way out here,
  // and who gives them one.
  const leaveNote = leave !== null && "closed" in leave && leave.closed === "facilitating" ? leaveClosedLine(leave, access.run.courseTitle) : null;

  // "About this course" (wk-programme): the programme's Start here and
  // Glossary, each linked when the run has it; nothing for a run with neither.
  const guide = db ? await guideLinksOf(db, access.run.id).catch(() => null) : null;

  // "Your certificate" (en-after-phone): the caller's own, by their two
  // addresses, and none during a view-as session, which is never the owner.
  const viewAs = markerIsLive(await getImpersonator(), access.user.uid);
  const certificates = db
    ? await readOwnCertificates(db, access.run.id, access.user.uid, viewAs, process.env.NEXT_PUBLIC_APP_URL)
    : [];

  // Once the programme is over (en-after-phone, en-after-nofinish-phone), for
  // somebody who took part: the survey at the end as it stands for them
  // (`endSurveyFor`: theirs to answer, or sent; nothing in a view-as session)
  // and Home's next event, as Home picks it. Read only once their own group's
  // last session is over (`runEndOf`, which the gate's groups answer with no
  // read), so the page people open while it runs reads nothing more. A read
  // that fails draws nothing.
  const now = new Date();
  const ownGroups = own?.groupId ? liveGroupsOf(access.run.id, access.groups).filter((group) => group.id === own.groupId) : [];
  const over = access.isEnrolled && own?.role === "learner" && runEndOf(access.run, ownGroups, now).over;
  const endSurvey = over && db ? await endSurveyFor(db, access.user, access.run.id, now).catch(() => null) : null;
  const next = over ? (await homeEvents(now)).upcoming[0] ?? null : null;
  const nextEvent = next
    ? { eventId: next.eventId, title: next.title, tile: next.tile, clock: next.clock, place: next.place }
    : null;

  return (
    <RunHome
      runId={runId}
      isAdmin={access.isAdmin}
      canEmailCohort={canEmailCohort}
      pitching={pitching}
      team={team}
      canLeave={canLeave}
      leaveNote={leaveNote}
      uid={access.user.uid}
      {...(guide ? { guide } : {})}
      {...(certificates.length > 0 ? { certificates } : {})}
      {...(endSurvey ? { endSurvey } : {})}
      {...(nextEvent ? { nextEvent } : {})}
    />
  );
}
