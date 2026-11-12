import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import { groupsPath, groupsViewPath } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import GroupPage from "@/features/courses/groupPage/GroupPage";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { own } from "@/lib/applications/keys";
import { loadGroupPage } from "@/lib/courses/groupPage/load";
import { GO_TO_GROUPS, GROUP_NOT_HERE_LINE, GROUP_NOT_HERE_TITLE } from "@/lib/courses/groupPage/words";
import { messagesEntriesFor } from "@/lib/messages/handover";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * ONE GROUP'S PAGE, under the programme's Groups tab, at
 * `.../programmes/[programmeId]/groups/[groupId]`: the one place a group is
 * run from. Its head, how it meets with a Change beside each part, every
 * week of its plan with its date and state, one week's change or a new
 * regular time from a week onwards with what will happen before anything is
 * saved, and its history (`GroupPage`, from `loadGroupPage`). Every group
 * the Groups tab lists links here.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`, the gate every
 * Groups view uses), decided from the form before the run is read: a
 * reviewer is told the tab is the lead's and an admin's, and anybody with no
 * role on the programme that there is no programme here. The group must be
 * a live group of the run the programme names, or the page says, calmly,
 * that it is not here. The routes behind every button ask again who the
 * caller is.
 *
 * THIS PAGE STANDS ALONE, as one person's coursework does: it is outside the
 * `(tabs)` route group beside it, so it is drawn with no programme head and
 * no tabs, and carries its own way back to the programme and its Groups tab.
 *
 * "Take the register" is today's register page, which takes an admin or the
 * group's own facilitator; a lead who facilitates nothing here is not
 * offered it. "Write to Group C" is Messages, set to the group, wherever
 * Messages would start with it for this person.
 */

export const dynamic = "force-dynamic";

export default async function ProgrammeGroupPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string; groupId: string }>;
}) {
  const [{ roundId, programmeId, groupId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  const tabPath = groupsPath(view.roundId, view.programmeId);
  if (!view.run) {
    return (
      <ApplicationsRoot className={shared.page}>
        <RunBlank view={view} />
      </ApplicationsRoot>
    );
  }

  const notHere = (
    <Refusal title={GROUP_NOT_HERE_TITLE} href={tabPath} action={GO_TO_GROUPS}>
      {GROUP_NOT_HERE_LINE}
    </Refusal>
  );
  if (!isAddressableId(groupId)) return notHere;
  const [runSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(view.run.id).get(),
    db.collection("courseGroups").doc(groupId).get(),
  ]);
  if (!runSnap.exists || !groupSnap.exists) return notHere;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const group = normalizeCourseGroup(groupSnap.id, groupSnap.data() ?? {});
  if (group.runId !== run.id || group.archived) return notHere;

  const now = new Date();
  const [page, messages] = await Promise.all([
    loadGroupPage(db, { run, group, viewer: view.viewer, viewerUid: user.uid, now }),
    messagesEntriesFor(db, user, run.id, now).catch(() => null),
  ]);
  const takesRegister =
    user.role === "admin" || isNamedWithStanding(user, "courseGroups.facilitatorUids", group.facilitatorUids);
  const base = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;

  return (
    <ApplicationsRoot className={shared.page}>
      <GroupPage
        view={{ ...page, programmeName: view.programmeName || page.programmeName }}
        links={{
          programme: `${base}/overview`,
          groups: tabPath,
          register: takesRegister ? `/learn/${encodeURIComponent(run.id)}/group/${encodeURIComponent(group.id)}/register` : null,
          write: messages ? (own(messages.groups, group.id) ?? null) : null,
          facilitators: groupsViewPath(view.roundId, view.programmeId, "facilitators"),
          times: groupsViewPath(view.roundId, view.programmeId, "times"),
          people: tabPath,
          roomPath: `/api/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups/${encodeURIComponent(group.id)}/room`,
        }}
      />
    </ApplicationsRoot>
  );
}
