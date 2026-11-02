import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import { SurveysFrame } from "@/features/applications/surveys/SurveysViews";
import SurveysOverview from "@/features/surveys/lead/SurveysOverview";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { leadSurveysOverview } from "@/lib/surveys/leadOverview";
import { LEAD_TAB_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * A PROGRAMME'S SURVEYS TAB, its Overview, for its lead and admins: a card for
 * each of the tab's views, how useful the sessions were and how much of the
 * reading people did week by week from the check-ins, what was unclear in a
 * chosen week (`?week=3`) with how many facilitators' reports named each part,
 * who came (the Attendance tab's own count), and the week's reports with the
 * way to read them. Totals only, never a name, and a check-in's week only once
 * every group's check-in that week has closed (`leadSurveysOverview`).
 *
 * Its views each have an address under this one (`SurveysViews`): Before,
 * Check-ins, Facilitators' reports, End and Follow-ups, each behind the same
 * gate as this page.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from the
 * form before any survey, check-in, report or register is read; a reviewer is
 * told the tab is the lead's and an admin's, and anybody with no role on the
 * programme that there is no programme here. The admin area is closed during
 * a view-as session (`(app)/admin/layout.tsx`). The page writes nothing.
 */
export default async function ProgrammeSurveysPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ week?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { week?: string | string[] }),
    requireAdmissionsPage(),
  ]);
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
  // A week of the run by its number; anything else asks for the latest that shows.
  const asked = typeof query.week === "string" && /^[1-9]\d?$/.test(query.week) ? Number(query.week) : null;
  const overview = await leadSurveysOverview(
    db,
    { roundId: view.roundId, programmeId: view.programmeId, runId: view.run?.id ?? null, viewer: view.viewer },
    new Date(),
    asked,
  );
  const base = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;
  return (
    <SurveysFrame roundId={view.roundId} programmeId={view.programmeId} current="overview">
      {!overview.run && <RunBlank view={view.run ? { ...view, blank: "run-gone" } : view} />}
      <SurveysOverview view={overview} base={base} />
    </SurveysFrame>
  );
}
