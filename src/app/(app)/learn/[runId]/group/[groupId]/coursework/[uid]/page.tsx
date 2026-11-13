import { redirect } from "next/navigation";
import ReadingView from "@/features/courses/coursework/ReadingView";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { isAddressableId } from "@/lib/addressableId";
import { loadGroupPersonWeek } from "@/lib/courses/coursework/readingLoad";
import { liveGroupsOf, reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * ONE PERSON OF A GROUP, ONE WEEK (the reading view, Fri 13 Nov 2026), from
 * the group's side: `/learn/[runId]/group/[groupId]/coursework/[uid]?week=N`,
 * reached from the group page's Feedback to write and This week's work, and
 * from the group's written answers. With no week named it opens the newest
 * week the person has anything in, else the newest that has begun for them.
 *
 * THE GATE is the group's written review page's, as it is: the run's layout
 * has decided the caller holds some role on the run; this page admits the
 * group's live facilitators, the lead of the programme that names the run and
 * admins, and the group must belong to this run. Then, for the person named,
 * the one gate on whose work a reader may act on (`loadGroupPersonWeek`
 * asks `reviewableIn`, which asks `writtenReviewRole`): somebody placed in
 * this group, or one of its facilitators for the lead and admins; a
 * facilitator never reads a co-facilitator's own work, and nobody reads their
 * own. Everybody else, and anybody named who is not theirs to read, is sent
 * to the run's home: redirects, never 403s, so guessing ids says nothing.
 *
 * What each reader is handed is the readers' own (`readPersonWeek`): a
 * facilitator writes feedback and never sees a rating, the lead never a
 * private note, and only an admin Claude's draft grade or the sealed
 * prediction's row. The routes behind the page ask their own gates again.
 */

export const dynamic = "force-dynamic";

export default async function GroupPersonWeekPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string; uid: string }>;
  searchParams?: Promise<{ week?: string | string[] }>;
}) {
  const { runId, groupId, uid } = await params;
  const query = await (searchParams ?? Promise.resolve({} as { week?: string | string[] }));

  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }
  const runHome = `/learn/${encodeURIComponent(runId)}`;
  if (!isAddressableId(groupId) || !isAddressableId(uid)) redirect(runHome);

  const db = getAdminDb();
  if (!db) redirect(runHome);

  const groupSnap = await db.collection("courseGroups").doc(groupId).get();
  if (!groupSnap.exists) redirect(runHome);
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  if (group.runId !== runId) redirect(runHome);

  const [liveGroups, facts] = await Promise.all([liveGroupsOf(db, runId), reviewerFactsOf(db, access.user, runId)]);
  const facilitatesThisGroup =
    !group.archived && isNamedWithStanding(access.user, "courseGroups.facilitatorUids", group.facilitatorUids);
  if (!facilitatesThisGroup && !facts.isAdmin && !facts.isLead) redirect(runHome);

  const programme = await runProgrammeOf(db, runId).catch(() => null);
  const outcome = await loadGroupPersonWeek(db, access.user, {
    run: access.run,
    group,
    liveGroups,
    facts,
    facilitatesThisGroup,
    uid,
    askedWeek: query.week ?? null,
    programmeName: programme?.shortName || access.run.courseTitle,
    groupPath: `${runHome}/group/${encodeURIComponent(groupId)}`,
  });
  // Nobody this reader may read in this group, or a run with no week to read: the run's home.
  if (outcome.status !== "ok") redirect(runHome);

  return <ReadingView view={outcome.view} />;
}
