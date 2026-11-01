import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import { SurveysFrame } from "@/features/applications/surveys/SurveysViews";
import CheckInsWeeks from "@/features/surveys/lead/CheckInsWeeks";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { readRunRecords, weeksOf } from "@/lib/courses/programmeAttendance";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { readProgrammeCheckIns } from "@/lib/surveys/checkIns/leadView";
import { LEAD_TAB_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * A PROGRAMME'S SURVEYS TAB, its Check-ins view, for its lead and admins: each
 * week of the check-ins at the end of its groups' sessions, every group's
 * answers together and never a group's alone, once every group's check-in
 * that week has closed; totals from three answers and comments from five, in
 * the order of their words (`readProgrammeCheckIns`, its floors decided on the
 * server). An admin also has a row for each group's check-in, with the way to
 * its Results and Who answered on the admins' own pages, where one person's
 * answers open only once the opening is recorded; the lead never has those
 * rows.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from the
 * form before any check-in is read; a reviewer is told the tab is the lead's
 * and an admin's, and anybody with no role on the programme that there is no
 * programme here. The admin area is closed during a view-as session
 * (`(app)/admin/layout.tsx`). The page writes nothing.
 */
export default async function ProgrammeSurveysCheckInsPage({
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
  const records = view.run ? await readRunRecords(db, view.run.id) : null;
  if (!records) {
    return (
      <SurveysFrame roundId={view.roundId} programmeId={view.programmeId} current="check-ins">
        <RunBlank view={view.run ? { ...view, blank: "run-gone" } : view} />
      </SurveysFrame>
    );
  }
  const checkIns = await readProgrammeCheckIns(db, {
    roundId: view.roundId,
    programmeId: view.programmeId,
    run: records.run,
    groups: records.groups,
    weeks: weeksOf(records),
    viewer: view.viewer,
    now: new Date(),
  });
  return (
    <SurveysFrame roundId={view.roundId} programmeId={view.programmeId} current="check-ins">
      <CheckInsWeeks view={checkIns} />
    </SurveysFrame>
  );
}
