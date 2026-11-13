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
import { loadGroupAttendance } from "@/lib/courses/groupAttendance/load";
import { loadGroupPage } from "@/lib/courses/groupPage/load";
import { REQUESTS_PATH } from "@/lib/courses/requests/paths";
import { GO_TO_GROUPS, GROUP_NOT_HERE_LINE, GROUP_NOT_HERE_TITLE } from "@/lib/courses/groupPage/words";
import { messagesEntriesFor } from "@/lib/messages/handover";
import { getAdminDb } from "@/lib/firebase/admin";
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
 * The chosen week's work (who has done it, who was late, and Remind) is read
 * for the week in the address (`?week=2`), or the week the page opens on.
 *
 * "Take the register" is the group's register under this page, which takes
 * an admin and the programme's lead; each week's ways to take a register in
 * a facilitator's place open from the week, and from the notice when a
 * session has started with nobody taking it (`?take=2` opens on week 2 with
 * them shown). "Write to Group C" is Messages, set to the group, wherever
 * Messages would start with it for this person.
 */

export const dynamic = "force-dynamic";

export default async function ProgrammeGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; groupId: string }>;
  searchParams?: Promise<{ take?: string | string[]; week?: string | string[] }>;
}) {
  const [{ roundId, programmeId, groupId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const search = await (searchParams ?? Promise.resolve({} as { take?: string | string[]; week?: string | string[] }));
  // "Take the register" on Overview's Needs attention: open on that week, with its ways to take it shown.
  const takeParam = search.take;
  const take = typeof takeParam === "string" && /^\d{1,2}$/.test(takeParam) ? Number(takeParam) : null;
  // The week whose work the page shows: chosen on the page, or opened from a link.
  const weekParam = search.week;
  const week = typeof weekParam === "string" && /^\d{1,2}$/.test(weekParam) ? Number(weekParam) : take;
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
  const [page, messages, attendance] = await Promise.all([
    loadGroupPage(db, { run, group, viewer: view.viewer, viewerUid: user.uid, now, week }),
    messagesEntriesFor(db, user, run.id, now).catch(() => null),
    // Attendance, all weeks: the register's own gate decides what it holds.
    // An admin or the programme's lead is given the tab; somebody here who
    // facilitates the group (a lead who also runs it) is answered as its
    // facilitator, and a facilitator has their own register pages, so the
    // tab is left out for them.
    loadGroupAttendance(db, user, group.id, now).catch(() => ({ status: "none" as const })),
  ]);
  const base = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;

  return (
    <ApplicationsRoot className={shared.page}>
      <GroupPage
        view={{ ...page, programmeName: view.programmeName || page.programmeName }}
        take={take}
        attendance={attendance.status === "ok" && attendance.view.viewer !== "facilitator" ? attendance.view : null}
        links={{
          programme: `${base}/overview`,
          groups: tabPath,
          // The register under this page: an admin and the programme's lead
          // take any session's register, in a facilitator's place or helping.
          register: `${base}/groups/${encodeURIComponent(group.id)}/register`,
          write: messages ? (own(messages.groups, group.id) ?? null) : null,
          facilitators: groupsViewPath(view.roundId, view.programmeId, "facilitators"),
          times: groupsViewPath(view.roundId, view.programmeId, "times"),
          people: tabPath,
          requests: REQUESTS_PATH,
          // Each name in the week's people opens that person's week in the reading view.
          coursework: `${base}/coursework`,
          roomPath: `/api/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/groups/${encodeURIComponent(group.id)}/room`,
        }}
      />
    </ApplicationsRoot>
  );
}
