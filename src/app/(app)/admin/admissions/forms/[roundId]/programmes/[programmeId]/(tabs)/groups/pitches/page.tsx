import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import GroupsViews, { GroupsFrame } from "@/features/applications/groups/GroupsViews";
import { PitchesAreTheLeads, ProgrammePitches } from "@/features/applications/pitches/ProgrammePitches";
import { loadProgrammePitches } from "@/lib/applications/handover/pitchesLoad";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * The pitches from one programme's pitching week, for its lead and for
 * admins: each pitch, who pitched it and how many would join it. Read only.
 * Reached from the Groups tab's views, which offer Pitches on a run with a
 * pitching week.
 *
 * WHO. The tree's gate runs first, then the `(tabs)` layout draws "there is
 * no programme here" in place of this page for somebody with no role on the
 * programme. This page then asks the form: an admin and the programme's lead
 * are answered; a reviewer of the programme is told the list is the lead's
 * and admins'. Nobody here is shown who picked what.
 *
 * Whoever is shown the list may open the Groups tab (an admin or the
 * programme's lead), so the tab's row of views is drawn above it, as on the
 * tab's other views.
 */
export default async function ProgrammePitchesPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammePitches(db, user, roundId, programmeId) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return <PitchesAreTheLeads roundId={roundId} programmeId={programmeId} />;
  }
  const { view } = outcome;
  return (
    <GroupsFrame
      views={<GroupsViews roundId={view.roundId} programmeId={view.programmeId} current="pitches" pitches />}
    >
      <ProgrammePitches view={view} />
    </GroupsFrame>
  );
}
