import ProgrammeSetup from "@/features/applications/editor/ProgrammeSetup";
import { NoProgrammeHere, SettingsAreTheLeads } from "@/features/applications/editor/Refusals";
import RunHandOver from "@/features/applications/editor/RunHandOver";
import frame from "@/features/applications/editor/ProgrammeSetup.module.css";
import { loadSetup } from "@/lib/applications/editor/load";
import { projectProgrammeForSetup } from "@/lib/applications/editor/views";
import { loadRunPanel } from "@/lib/applications/handover/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Settings tab.
 *
 * For the programme's lead and for admins. The layout of the `(tabs)` group
 * this page is in has already turned away anybody with no role on the
 * programme, and this page asks its own question on top of that, because the layout also admits reviewers and
 * the settings are not theirs: a reviewer is told so, with the way back to
 * the applications they are here to read.
 *
 * AN ADMIN ALSO GETS THE "COURSE RUN" PANEL under the settings: the run this
 * term's accepted people go onto, and the hand-over that puts them on its
 * allocation board. Its read answers nothing for anybody who is not an
 * admin, before it reads anything, so a programme's lead is drawn the
 * settings and no panel, and nothing of the panel is in their page.
 */
export default async function ProgrammeSetupPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadSetup(db, user, roundId, programmeId) : null;
  if (!outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return <SettingsAreTheLeads roundId={roundId} programmeId={programmeId} />;
  }
  const { form, sets, programme, context } = outcome.setup;
  const run = db ? await loadRunPanel(db, user, roundId, programmeId) : null;
  return (
    <div className={frame.stack}>
      <ProgrammeSetup programme={projectProgrammeForSetup(form, sets, programme, context)} />
      {run?.status === "ok" && (
        <RunHandOver roundId={form.round.id} programmeId={programme.id} initial={run.panel} />
      )}
    </div>
  );
}
