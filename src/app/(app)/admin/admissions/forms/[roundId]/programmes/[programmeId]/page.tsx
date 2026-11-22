import { redirect } from "next/navigation";
import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import { opensProgrammeGroups } from "@/lib/applications/access";
import { loadProgrammeForStaff } from "@/lib/applications/editor/load";
import { applicationFormPath } from "@/lib/applications/editor/olderRounds";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * A PROGRAMME'S OWN ADDRESS, with no tab: where a link to the programme
 * itself lands.
 *
 * Outside `(tabs)`, so it draws no head of its own. It asks the question the
 * tabs' head asks (`loadProgrammeForStaff`), after the admissions tree's
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
  const loaded = db ? await loadProgrammeForStaff(db, user, roundId, programmeId) : null;
  if (!loaded) return <NoProgrammeHere roundId={roundId} />;
  const base = `${applicationFormPath(loaded.form.round.id)}/programmes/${loaded.programme.id}`;
  redirect(opensProgrammeGroups(loaded.role) ? `${base}/overview` : `${base}/applications`);
}
