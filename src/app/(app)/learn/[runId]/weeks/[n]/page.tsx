import { redirect } from "next/navigation";
import { getRunAccess, getSessionUser, type RunAccess } from "@/features/courses/runAccess";
import WeekNotOpen from "@/features/courses/weekly/WeekNotOpen";
import WeekView from "@/features/courses/WeekView";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { sharedNotesForWeekPage, type WeekSharedNotes } from "@/lib/courses/sharedNotes/readers";
import { resolveSessions } from "@/lib/courses/sessions";
import { isOpenAt, weekOpening } from "@/lib/courses/weekOpening";
import { getAdminDb } from "@/lib/firebase/admin";
import { runSharesGroupNotes } from "@/lib/firestore/courseGroupSharedNotes";
import { normalizeCourse, weekDocId } from "@/lib/firestore/courses";
import { guideLinksOf } from "@/lib/courses/guide/load";
import type { CourseRoutes } from "@/lib/courses/routes/model";

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
 *
 * Somebody holding a place whom Publish has not told yet reads week 1 alone,
 * once its door is open to them (Q35 B, `beforeGroups`): see below.
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
  if (!access.canLearn && !access.beforeGroups) {
    redirect(
      access.isReviewer || access.isTrackLead
        ? `/learn/${encodeURIComponent(runId)}/admissions`
        : "/learn",
    );
  }

  // WEEK 1 BEFORE GROUPS GO OUT (Q35 B): somebody holding a place whom
  // Publish has not told, once week 1's door is open to them (`beforeGroups`,
  // asked of `weekOneDoorFor` by the gate). Week 1 and nothing else of the
  // run: every other week sends them to week 1, and there is no group, no
  // session and no group notes. What it draws is the overview's week 1 alone.
  if (!access.canLearn && access.beforeGroups) {
    if (n !== "1") redirect(`/learn/${encodeURIComponent(runId)}/weeks/1`);
    // st-week1-phone draws "Start here · Glossary" for exactly this reader.
    const holderDb = getAdminDb();
    const holderGuide = holderDb ? await guideLinksOf(holderDb, access.run.id).catch(() => null) : null;
    return <WeekView runId={runId} weekNumber={1} uid={access.user.uid} viewerRole="learner" sharedNotes={null} {...(holderGuide ? { guide: holderGuide } : {})} />;
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

  // The programme's Start here and Glossary, linked under a block week's
  // title when the run has either; nothing is handed for a run with neither.
  // The course's routes travel only when it has some: a course with none
  // hands the page nothing new, and the week shows the guide's own tables.
  const guideDb = getAdminDb();
  const [sharedNotes, guide, routes] = await Promise.all([
    sharedNotesFor(access),
    guideDb ? guideLinksOf(guideDb, access.run.id).catch(() => null) : Promise.resolve(null),
    routesFor(access),
  ]);
  return (
    <WeekView
      runId={runId}
      weekNumber={weekNumber}
      uid={access.user.uid}
      viewerRole={viewerRole}
      sharedNotes={sharedNotes}
      {...(guide ? { guide } : {})}
      {...(routes ? { routes } : {})}
    />
  );
}

/**
 * THE RUN'S COURSE'S ROUTES AND DEADLINES (`CourseDoc.routes`), read here on
 * the server and handed to the page as the list alone: a week that lists
 * routes shows them in place of the guide's tables. Null for a course with
 * none, a run with no course, or a read that fails, so the week shows the
 * guide's own tables rather than nothing.
 */
async function routesFor(access: RunAccess): Promise<CourseRoutes | null> {
  if (!access.run.courseId) return null;
  const db = getAdminDb();
  if (!db) return null;
  try {
    const snap = await db.collection("courses").doc(access.run.courseId).get();
    return snap.exists ? normalizeCourse(snap.id, snap.data() ?? {}).routes : null;
  } catch (err) {
    console.error("[week page] routes read failed", access.run.id, err);
    return null;
  }
}

/**
 * NOTES SHARED WITH THE GROUP (C29), read here on the server for this reader
 * and handed to the page: a section for the group their place is in and one
 * for each group they facilitate (`sharedNotesForWeekPage`, which asks who
 * they are first). Null on a run whose groups share none, or with no live
 * group, so the page keeps the run's comments on each reading there.
 *
 * A read that fails leaves the sections empty rather than putting the run's
 * comments back on a run with groups.
 */
async function sharedNotesFor(access: RunAccess): Promise<WeekSharedNotes> {
  if (!runSharesGroupNotes(access.run) || access.groups.length === 0) return null;
  const db = getAdminDb();
  if (!db) return { sections: [] };
  try {
    const programme = await runProgrammeOf(db, access.run.id).catch(() => null);
    return await sharedNotesForWeekPage(db, access.user, access.run, access.groups, programme?.leadFirstName ?? null);
  } catch (err) {
    console.error("[week page] shared notes read failed", access.run.id, err);
    return { sections: [] };
  }
}
