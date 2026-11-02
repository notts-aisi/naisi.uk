import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import { SurveysFrame } from "@/features/applications/surveys/SurveysViews";
import LeadSurveysTab from "@/features/surveys/lead/LeadSurveysTab";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { leadSurveysTab } from "@/lib/surveys/leadTab";
import { LEAD_TAB_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * A PROGRAMME'S SURVEYS TAB, its Before view, for its lead and admins: the
 * survey before the programme once it has gone out, with how many answered
 * and the way to its results (`[surveyId]`), in totals and comments, never a
 * name (`leadSurveysTab`, every survey counted by its own Results).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from the
 * form before any survey is read; a reviewer is told the tab is the lead's and
 * an admin's, and anybody with no role on the programme that there is no
 * programme here. The admin area is closed during a view-as session
 * (`(app)/admin/layout.tsx`). The page writes nothing.
 */
export default async function ProgrammeSurveysBeforePage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") {
    return (
      <Refusal
        title={LEAD_TAB_WORDS.refusalTitle}
        href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
        action={LEAD_TAB_WORDS.refusalAction}
      >
        {LEAD_TAB_WORDS.refusalBody}
      </Refusal>
    );
  }
  const { view } = outcome;
  const tab = await leadSurveysTab(db, { roundId: view.roundId, programmeId: view.programmeId, runId: view.run?.id ?? null }, new Date());
  const base = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;
  return (
    <SurveysFrame roundId={view.roundId} programmeId={view.programmeId} current="before">
      <LeadSurveysTab view={tab} base={base} stage="before" />
    </SurveysFrame>
  );
}
