import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import { PitchesAreTheLeads, ProgrammePitches } from "@/features/applications/pitches/ProgrammePitches";
import { canRunTerm } from "@/lib/applications/access";
import { loadProgrammePitches } from "@/lib/applications/handover/pitchesLoad";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * The pitches from one programme's pitching week, for its lead and for
 * admins: each pitch, who pitched it and how many would join it. Read only.
 * Reached from the Groups tab's views (Times, People in groups, Pitches).
 *
 * WHO. The tree's gate runs first, then the `(tabs)` layout draws "there is
 * no programme here" in place of this page for somebody with no role on the
 * programme. This page then asks the form: an admin and the programme's lead
 * are answered; a reviewer of the programme is told the list is the lead's
 * and admins'. Nobody here is shown who picked what.
 *
 * The Groups tab's views are drawn for whoever may open the Groups tab,
 * which today is an admin (`canRunTerm`, the tab's own gate).
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
  return <ProgrammePitches view={outcome.view} groupsOpen={canRunTerm(user)} />;
}
