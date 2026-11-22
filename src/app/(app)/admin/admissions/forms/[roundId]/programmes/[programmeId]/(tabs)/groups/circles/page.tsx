import { redirect } from "next/navigation";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import { withShow } from "@/features/applications/groups/boardShow";
import { groupsPath } from "@/features/applications/groups/GroupsViews";
import NotYours from "@/features/applications/groups/NotYours";
import { opensProgrammeGroups, roleOnProgramme } from "@/lib/applications/access";
import { own } from "@/lib/applications/keys";
import { isId } from "@/lib/applications/normalise";
import { loadForm } from "@/lib/applications/repo";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * CIRCLES' OLD ADDRESS. Circles stopped being a view of its own when it
 * became a way to show People in groups, so this address forwards there,
 * shown as Rings (`groups?show=rings`), and the Groups tab's row of views no
 * longer offers it.
 *
 * It asks only what the form says, after the admissions tree's gate: an
 * admin and the programme's lead (who may open the Groups tab) are forwarded,
 * and People in groups then decides again what each of them is shown. A
 * reviewer is told the tab is the lead's and an admin's, and anybody with no
 * role on the programme, or at a programme that is not there, is drawn the
 * same "there is no programme here" as every tab, so the forward says
 * nothing about whether there is one. Nobody's application is read and
 * nothing is written.
 */
export default async function CirclesAddressPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const form = db && isId(roundId) && isId(programmeId) ? await loadForm(db, roundId) : null;
  const programme = form ? own(form.programmes, programmeId) : undefined;
  const role = form && programme ? roleOnProgramme(user, form, programme.id) : null;
  if (!form || !programme || role === null) return <NoProgrammeHere roundId={roundId} />;
  if (!opensProgrammeGroups(role)) return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  redirect(withShow(groupsPath(form.round.id, programme.id), "rings"));
}
