import { redirect } from "next/navigation";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import WeekNotOpen from "@/features/courses/weekly/WeekNotOpen";
import WeekView from "@/features/courses/WeekView";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { resolveSessions } from "@/lib/courses/sessions";
import { isOpenAt, weekOpening } from "@/lib/courses/weekOpening";
import { getAdminDb } from "@/lib/firebase/admin";
import { weekDocId } from "@/lib/firestore/courses";

/**
 * Server shell for the member week page. It decides whether this viewer
 * belongs in the learning space, whether the week is open to them yet, and
 * hands a validated week number to the client `WeekView` (data on this page is
 * client-fetched: the tick listener needs the client SDK anyway).
 *
 * Access via `getRunAccess` (React cache(), so the layout and sibling pages
 * share the reads): learners, facilitators and admins may learn; reviewers
 * and track leads are bounced to the admissions queue (their one course
 * surface, per the locked decision that admissions is a separate lane from
 * the cohort) and everyone else to the hub. Plain redirects, not 403s: a
 * member guessing run ids learns nothing about which runs exist.
 *
 * EACH WEEK OPENS STRAIGHT AFTER THE GROUP'S PREVIOUS SESSION (C17). For
 * somebody taking part, a published week whose group session before it has
 * not ended yet is not drawn: the page says when it opens instead, worked out
 * from their group's own calendar (`weekOpening`, a session moved or
 * cancelled through "Change a session" included). The week's document is
 * readable by anybody signed in, so this is the page's gate, like
 * `published`, and not a boundary. Facilitators and admins see every
 * published week, as they always have.
 */

export const dynamic = "force-dynamic";

/** Matches the rules' weekNumber bound and COURSE_FIELD_LIMITS.maxWeekPlanEntries. */
const MAX_WEEK_NUMBER = 60;

export default async function WeekPage({
  params,
}: {
  params: Promise<{ runId: string; n: string }>;
}) {
  const { runId, n } = await params;

  const access = await getRunAccess(runId);
  if (!access) {
    // Null is "no session" OR "no such run": getSessionUser (memoised, so
    // this is free) tells them apart without leaking which runs exist.
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }
  if (!access.canLearn) {
    redirect(
      access.isReviewer || access.isTrackLead
        ? `/learn/${encodeURIComponent(runId)}/admissions`
        : "/learn",
    );
  }

  // A positive int inside the plan's bounds; anything else (including "03",
  // one canonical URL per week) goes back to the run home rather than 404ing.
  const weekNumber = /^[1-9]\d?$/.test(n) ? Number(n) : NaN;
  if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > MAX_WEEK_NUMBER) {
    redirect(`/learn/${encodeURIComponent(runId)}`);
  }

  const viewerRole = access.isAdmin
    ? "admin"
    : access.isFacilitator
      ? "facilitator"
      : "learner";

  // The opening rule, for somebody taking part in a group of this run.
  const own = access.enrolment;
  const group =
    viewerRole === "learner" && own?.groupId
      ? (access.groups.find((candidate) => candidate.id === own.groupId) ?? null)
      : null;
  if (group) {
    const now = new Date();
    const opening = weekOpening(resolveSessions(access.run, group), weekNumber);
    if (!isOpenAt(opening, now) && opening.after) {
      // Only a PUBLISHED week waits on a session: an unpublished one is the
      // page's own "isn't published yet", whenever it would have opened.
      const db = getAdminDb();
      const [resolved, programme] = db
        ? await Promise.all([
            resolveWeekDoc(db, access.run.id, group.id, weekDocId(weekNumber)).catch(() => null),
            runProgrammeOf(db, access.run.id).catch(() => null),
          ])
        : [null, null];
      if (resolved?.week?.published) {
        return (
          <WeekNotOpen
            runId={runId}
            weekNumber={weekNumber}
            programmeName={programme?.shortName || access.run.courseTitle || "Your programme"}
            after={{ dateKey: opening.after.dateKey, startTimeLocal: opening.after.startTimeLocal }}
            now={now}
          />
        );
      }
    }
  }

  return (
    <WeekView
      runId={runId}
      weekNumber={weekNumber}
      uid={access.user.uid}
      viewerRole={viewerRole}
    />
  );
}
