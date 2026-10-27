import { redirect } from "next/navigation";
import { getRunAccess, getSessionUser, type RunAccess } from "@/features/courses/runAccess";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import WeekView from "@/features/courses/WeekView";
import { sharedNotesForWeekPage, type WeekSharedNotes } from "@/lib/courses/sharedNotes/readers";
import { getAdminDb } from "@/lib/firebase/admin";
import { runSharesGroupNotes } from "@/lib/firestore/courseGroupSharedNotes";
import { normalizeCourse } from "@/lib/firestore/courses";
import { guideLinksOf } from "@/lib/courses/guide/load";
import type { CourseRoutes } from "@/lib/courses/routes/model";
import type { OwnPair } from "@/lib/courses/pairs/model";
import { readOwnPairs } from "@/lib/courses/pairs/readers";
import { beforeSurveyCardFor, type SurveyCard } from "@/lib/surveys/waiting";
import { ownPredictionsView } from "@/lib/courses/predictions/own";
import type { PredictionsView } from "@/lib/courses/predictions/wire";

/**
 * Server shell for the member week page. It decides whether this viewer
 * belongs in the learning space and hands a validated week number to the
 * client `WeekView` (data on this page is client-fetched: the tick listener
 * needs the client SDK anyway).
 *
 * Access via `getRunAccess` (React cache(), so the layout and sibling pages
 * share the reads): learners, facilitators and admins may learn; reviewers
 * and track leads are bounced to the admissions queue (their one course
 * surface, per the locked decision that admissions is a separate lane from
 * the cohort) and everyone else to the hub. Plain redirects, not 403s: a
 * member guessing run ids learns nothing about which runs exist.
 *
 * EVERY PUBLISHED WEEK IS OPEN (Zach, 27 October 2026: each week is
 * published at the start, so people can read ahead). Once Publish has told
 * somebody their group, every published week of the run is theirs to read
 * and work in, whatever their group's sessions; an unpublished one says so
 * on the page itself. Facilitators and admins see every published week, as
 * they always have. The sealed predictions card keeps its own clock (its
 * reader, below), so reading a week early never opens a card early.
 *
 * Somebody holding a place whom Publish has not told yet reads week 1 alone,
 * once its door is open to them (Q35 B, `beforeGroups`): see below.
 *
 * WEEK 1'S FIRST CARD IS THE BEFORE SURVEY'S while it waits for the reader
 * (Q50 B): this run's before survey, open, sent to them, still theirs and not
 * answered, by the same answer Home asks (`beforeSurveyCardFor`). Asked of
 * week 1 alone, and read for the reader alone; nothing in a view-as session.
 *
 * SEALED PREDICTIONS: on the week the course's card is sealed in and the week
 * it opens in, the reader's own card, as `ownPredictionsView` decides they may
 * read and change it now; nothing for anybody with no card, and nothing in a
 * view-as session.
 *
 * A SESSION IN PAIRS (Technical AI Safety's hands-on night): the reader's own
 * pairs, read here for them alone (`readOwnPairs`), go to the page only when
 * there is one, so every other week is handed exactly what it was before.
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
    const holderSurvey = await weekOneSurvey(access, 1);
    return <WeekView runId={runId} weekNumber={1} uid={access.user.uid} viewerRole="learner" sharedNotes={null} {...(holderGuide ? { guide: holderGuide } : {})} {...(holderSurvey ? { survey: holderSurvey } : {})} />;
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

  // The programme's Start here and Glossary, linked under a block week's
  // title when the run has either; nothing is handed for a run with neither.
  // The course's routes travel only when it has some: a course with none
  // hands the page nothing new, and the week shows the guide's own tables.
  const guideDb = getAdminDb();
  const [sharedNotes, guide, routes, survey, predictions, pairs] = await Promise.all([
    sharedNotesFor(access),
    guideDb ? guideLinksOf(guideDb, access.run.id).catch(() => null) : Promise.resolve(null),
    routesFor(access),
    weekOneSurvey(access, weekNumber),
    predictionsFor(access, weekNumber),
    pairsFor(access, weekNumber),
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
      {...(survey ? { survey } : {})}
      {...(predictions ? { predictions } : {})}
      {...(pairs.length > 0 ? { pairs } : {})}
    />
  );
}

/**
 * The reader's own sealed predictions card on this week, or null: a week
 * that holds no card for them, or a read that fails, shows none.
 */
async function predictionsFor(access: RunAccess, weekNumber: number): Promise<PredictionsView | null> {
  const db = getAdminDb();
  if (!db) return null;
  try {
    return await ownPredictionsView(db, access.user, access.run.id, weekNumber, new Date());
  } catch (err) {
    console.error("[week page] predictions read failed", access.run.id, err);
    return null;
  }
}

/**
 * THE READER'S OWN PAIRS for a week whose session is in pairs, read here on
 * the server for them alone (`readOwnPairs`): who they are paired with, by
 * first name, and who in their pair is bringing a laptop, for each group they
 * take part in (their own place's, and each they facilitate). Empty on every
 * other week, before their group's facilitators pair them, for somebody who
 * takes part in no group, and when the read fails, so the week shows the
 * guide's own words.
 */
async function pairsFor(access: RunAccess, weekNumber: number): Promise<OwnPair[]> {
  if (access.groups.length === 0) return [];
  const db = getAdminDb();
  if (!db) return [];
  try {
    return await readOwnPairs(db, access.user, access.run.id, access.groups, access.enrolment, weekNumber, new Date());
  } catch (err) {
    console.error("[week page] pairs read failed", access.run.id, err);
    return [];
  }
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
 * Week 1's first card (Q50 B): this run's before survey while it waits for
 * the reader, or null; null on every other week, and when it cannot be read.
 */
async function weekOneSurvey(access: RunAccess, weekNumber: number): Promise<SurveyCard | null> {
  if (weekNumber !== 1) return null;
  const db = getAdminDb();
  if (!db) return null;
  try {
    return await beforeSurveyCardFor(db, access.user, access.run.id, new Date());
  } catch (err) {
    console.warn("[week page] could not read the before survey waiting for this reader", access.run.id, err);
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
