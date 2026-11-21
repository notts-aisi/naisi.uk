import { redirect } from "next/navigation";
import { FacilitatorPersonPage } from "@/features/courses/personPage/PersonPage";
import { getRunAccess, getSessionUser } from "@/features/courses/runAccess";
import { loadFacilitatorPersonPage } from "@/lib/courses/personPage/load";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * ONE PERSON OF A GROUP, AS THEIR FACILITATOR SEES THEM (Wed 18 Nov 2026), at
 * `/learn/[runId]/group/[groupId]/people/[uid]`, reached from their name on
 * the group's page: the name they go by, this group's weeks of their work,
 * their attendance at this group's sessions, and the feedback this
 * facilitator wrote. No application, no notes, no ratings, no contact
 * details, no events and no activity: those are the programme team's.
 *
 * THE GATE: the run's layout has decided the caller holds some role on the
 * run; this page admits a live facilitator of this group, with standing, and
 * nobody else (the programme's lead and admins have the team's page under
 * the programme). Then, for the person named, somebody placed in this group
 * now whose work the one gate lets this facilitator read
 * (`writtenReviewRole`): never a co-facilitator, never themselves. Everybody
 * else, and anybody named who is not theirs, is sent to the run's home:
 * redirects, never 403s, so guessing ids says nothing. Nothing here writes.
 */

export const dynamic = "force-dynamic";

export default async function GroupPersonPage({ params }: { params: Promise<{ runId: string; groupId: string; uid: string }> }) {
  const { runId, groupId, uid } = await params;
  const access = await getRunAccess(runId);
  if (!access) {
    const user = await getSessionUser();
    redirect(user ? "/learn" : "/login");
  }
  const runHome = `/learn/${encodeURIComponent(runId)}`;
  const db = getAdminDb();
  if (!db) redirect(runHome);
  const outcome = await loadFacilitatorPersonPage(db, access.user, access.run, groupId, uid);
  if (outcome.status !== "ok") redirect(runHome);
  return <FacilitatorPersonPage view={outcome.view} />;
}
