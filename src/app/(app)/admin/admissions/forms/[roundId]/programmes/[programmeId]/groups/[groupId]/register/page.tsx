import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import RegisterPageBody, { sessionParamOf } from "@/features/courses/register/RegisterPageBody";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { groupsPath } from "@/features/applications/groups/GroupsViews";
import { gateGroupRegister } from "@/lib/courses/registerAccess";
import { DIDNT_HAPPEN_MOVED_STAFF } from "@/lib/courses/registerCover/pageWords";
import { GO_TO_GROUPS, GROUP_NOT_HERE_LINE, GROUP_NOT_HERE_TITLE } from "@/lib/courses/groupPage/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * ONE GROUP'S REGISTER, under its page in the programme's Groups tab, at
 * `.../programmes/[programmeId]/groups/[groupId]/register?session=w02`: where
 * an admin and the programme's lead take a register, in a facilitator's
 * place or helping one ("Take the register" on the group's page, and the
 * three ways forward when a session has started with nobody taking it). The
 * programme's lead works from the programme's own pages, and the run's
 * pages under /learn do not admit them, so their register is here. The page
 * around the grid is the facilitators' own (`RegisterPageBody`).
 *
 * THE GATE: `loadProgrammeRun`, the gate every Groups view uses (an admin
 * and the programme's lead, decided from the form), then the register's own
 * (`gateGroupRegister`), restated because a page's only protection must not
 * be a level above it. The group must be a live group of the run the
 * programme names, or the page says, calmly, that it is not here. The
 * register's routes ask again on every read and every tap: a register's
 * notes are not sent to the lead, and whether each facilitator was there is
 * sent to admins and the lead who do not facilitate the group.
 */

export const dynamic = "force-dynamic";

export default async function ProgrammeGroupRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; groupId: string }>;
  searchParams?: Promise<{ session?: string | string[] }>;
}) {
  const [{ roundId, programmeId, groupId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const session = sessionParamOf((await (searchParams ?? Promise.resolve({} as { session?: string | string[] }))).session);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  const tabPath = groupsPath(view.roundId, view.programmeId);
  const notHere = (
    <Refusal title={GROUP_NOT_HERE_TITLE} href={tabPath} action={GO_TO_GROUPS}>
      {GROUP_NOT_HERE_LINE}
    </Refusal>
  );
  if (!view.run || !isAddressableId(groupId)) return notHere;
  const [runSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(view.run.id).get(),
    db.collection("courseGroups").doc(groupId).get(),
  ]);
  if (!runSnap.exists || !groupSnap.exists) return notHere;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  if (group.runId !== run.id || group.archived) return notHere;
  const gated = await gateGroupRegister(group.id, user, db);
  if (!gated.ok || gated.runId !== run.id) return notHere;

  const groupPage = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups/${encodeURIComponent(group.id)}`;
  // Called, not mounted: the page answers with the tree the body draws.
  return RegisterPageBody({
    gated,
    user,
    run,
    backHref: groupPage,
    session,
    reportHref: `${groupPage}/report`,
    didntHappen: { href: groupPage, words: DIDNT_HAPPEN_MOVED_STAFF },
    // A waiting ask on a line leads to its request, on the Requests page in
    // this same tree: an admin and the programme's lead reach it.
    requestsBase: REQUESTS_PATH,
  });
}
