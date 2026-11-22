import { redirect } from "next/navigation";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import { opensProgrammeGroups, roleOnProgramme } from "@/lib/applications/access";
import { loadFormForStaff } from "@/lib/applications/editor/load";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { own } from "@/lib/applications/keys";
import { isId } from "@/lib/applications/normalise";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * A PROGRAMME'S OWN ADDRESS, with no tab: where a link to the programme
 * itself lands.
 *
 * Outside `(tabs)`, so it draws no head of its own. It asks the questions the
 * tabs' head asks (`loadProgrammeForStaff`: the form for somebody with a role
 * on it, the programme as the form's own key, the caller's role on it) without
 * the count of applications that loader adds, after the admissions tree's
 * gate, and only then forwards: an admin and the programme's lead to its
 * Overview, a reviewer to the applications they read. Anybody else, and
 * everybody at a programme that does not exist, is drawn the same "there is
 * no programme here" the tabs draw, so the address says nothing about
 * whether there is one.
 */
export default async function ProgrammeAddressPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const loaded = db && isId(programmeId) ? await loadFormForStaff(db, user, roundId) : null;
  const programme = loaded ? own(loaded.form.programmes, programmeId) : undefined;
  const role = loaded && programme ? roleOnProgramme(user, loaded.form, programme.id) : null;
  if (!loaded || !programme || !role) return <NoProgrammeHere roundId={roundId} />;
  const base = `${applicationFormPath(loaded.form.round.id)}/programmes/${programme.id}`;
  redirect(opensProgrammeGroups(role) ? `${base}/overview` : `${base}/applications`);
}
