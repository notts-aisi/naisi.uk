import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import LeadSurveysTab from "@/features/surveys/lead/LeadSurveysTab";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { countRunSessionReports } from "@/lib/courses/sessionReports/readers";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { leadSurveysTab } from "@/lib/surveys/leadTab";
import { LEAD_TAB_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * A PROGRAMME'S SURVEYS TAB, for its lead and admins (board sv-programme;
 * Q41, Q49 A): what changed between the before survey and the survey at the
 * end, the programme's surveys with a way to each one's results, how it went,
 * the sources people rated, the facilitator line and what people wrote, in
 * totals and comments, never a name, from the first answer. Ratings and the
 * anonymous form's answers are linked from it, and so are the session
 * reports, on a page of their own because they name people.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from the
 * form before any survey is read; a reviewer is told the tab is the lead's and
 * an admin's, and anybody with no role on the programme that there is no
 * programme here. The admin area is closed during a view-as session
 * (`(app)/admin/layout.tsx`). The page reads and writes nothing else.
 */
export default async function ProgrammeSurveysPage({
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
  const [tab, reports] = await Promise.all([
    leadSurveysTab(db, { roundId: view.roundId, programmeId: view.programmeId, runId: view.run?.id ?? null }, new Date()),
    // How many session reports the run has, for the row that leads to their
    // own page: a count, never what one says.
    view.run ? countRunSessionReports(db, view.run.id) : Promise.resolve(null),
  ]);
  const base = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;
  return <LeadSurveysTab view={tab} base={base} reports={reports} />;
}
