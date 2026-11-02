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
 * A PROGRAMME'S SURVEYS TAB, its End view, for its lead and admins: what
 * changed between the before survey and the survey at the end, the survey at
 * the end and the survey about leaving with the way to each one's results,
 * Ratings and the anonymous form's answers, how it went, the sources people
 * rated, the facilitator line and what people wrote. Totals and comments,
 * never a name, from the first answer (`leadSurveysTab`, every number the one
 * its own page shows).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from the
 * form before any survey is read; a reviewer is told the tab is the lead's and
 * an admin's, and anybody with no role on the programme that there is no
 * programme here. The admin area is closed during a view-as session
 * (`(app)/admin/layout.tsx`). The page writes nothing.
 */
export default async function ProgrammeSurveysEndPage({
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
    <SurveysFrame roundId={view.roundId} programmeId={view.programmeId} current="end">
      <LeadSurveysTab view={tab} base={base} stage="end" />
    </SurveysFrame>
  );
}
