import { redirect } from "next/navigation";
import WrittenReview from "@/features/courses/written/WrittenReview";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import { liveGroupsOf, reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import { loadWrittenReview } from "@/lib/courses/writtenAnswers/reviewPage";
import { isAddressableId } from "@/lib/addressableId";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";

/**
 * A GROUP'S WRITTEN ANSWERS, ONE AT A TIME (boards wk-review, wk-review-phone):
 * `/learn/[runId]/group/[groupId]/written?week=N&person=uid`, reached from the
 * group page's review queue ("Give feedback") and Home.
 *
 * THE GATE. The run's layout has decided the caller holds some role on the
 * run; this page admits the group's live facilitators, the lead of the
 * programme that names the run and admins, and shows each of them only the
 * answers the one gate lets them review (`loadWrittenReview` asks
 * `writtenReviewRole` for every person): a facilitator their group's fellows
 * but its facilitators, the lead and admins those and the facilitators' own.
 * The group must belong to this run. Everybody else is sent to the run's
 * home: redirects, never 403s, so guessing ids says nothing.
 *
 * The routes behind the page (`written-answers/[answerId]/review`) ask the
 * same gate again and are the boundary; this is the page's.
 */

export const dynamic = "force-dynamic";

export default async function WrittenAnswersPage({
  params,
  searchParams,
}: {
  params: Promise<{ runId: string; groupId: string }>;
  searchParams?: Promise<{ week?: string | string[]; person?: string | string[] }>;
}) {
  const { runId, groupId } = await params;
  const query = await (searchParams ?? Promise.resolve({} as { week?: string | string[]; person?: string | string[] }));

  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }
  const runHome = `/learn/${encodeURIComponent(runId)}`;
  if (!isAddressableId(groupId)) redirect(runHome);

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

  const asked = typeof query.week === "string" && /^\d{1,2}$/.test(query.week) ? Number(query.week) : null;
  const person = typeof query.person === "string" && isAddressableId(query.person) ? query.person : null;
  const model = await loadWrittenReview(db, access.user, access.run, group, asked, person, new Date(), { liveGroups, facts });

  const groupPath = `${runHome}/group/${encodeURIComponent(groupId)}`;
  return (
    <WrittenReview
      model={model}
      basePath={`${groupPath}/written`}
      back={{ href: groupPath, label: group.name.trim() || "Your group" }}
    />
  );
}
