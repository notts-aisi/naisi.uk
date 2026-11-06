import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import { SurveysFrame, surveysViewPath } from "@/features/applications/surveys/SurveysViews";
import CheckInsWeeks from "@/features/surveys/lead/CheckInsWeeks";
import ThisWeeksCheckIns from "@/features/surveys/lead/ThisWeeksCheckIns";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { readRunRecords, weeksOf } from "@/lib/courses/programmeAttendance";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { readProgrammeCheckIns } from "@/lib/surveys/checkIns/leadView";
import { readWeekTable } from "@/lib/surveys/checkIns/weekTable";
import { LEAD_TAB_WORDS } from "@/lib/surveys/words";

export const dynamic = "force-dynamic";

/**
 * A PROGRAMME'S SURVEYS TAB, its Check-ins view, for its lead and admins: each
 * week of the check-ins at the end of its groups' sessions, every group's
 * answers together and never a group's alone, once every group's check-in
 * that week has closed and the scheduler has fixed the week's check-ins;
 * totals from three answers and comments from five, in the order of their
 * words (`readProgrammeCheckIns`, its floors decided on the server). An admin
 * also has a row for each group's check-in, with the way to its Results and
 * Answers on the admins' own pages, where one person's answers open only
 * once the opening is recorded; the lead never has those rows. Above the
 * weeks an admin also has THIS WEEK'S CHECK-INS (`readWeekTable`, `?week=`
 * for another week): a row for each group's session, its register, its
 * check-in and how many answered, with the presses to open it (late too),
 * close it and remind the group's facilitators. Read only when the gate
 * said the reader is an admin: the lead never has it.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from the
 * form before any check-in is read; a reviewer is told the tab is the lead's
 * and an admin's, and anybody with no role on the programme that there is no
 * programme here. The admin area is closed during a view-as session
 * (`(app)/admin/layout.tsx`). The page writes nothing.
 */
/** The week asked for in the address, or null. */
function weekAsked(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^\d{1,3}$/.test(raw) ? Number(raw) : null;
}

export default async function ProgrammeSurveysCheckInsPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([params, searchParams, requireAdmissionsPage()]);
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
  const now = new Date();
  const checkIns = await readProgrammeCheckIns(db, {
    roundId: view.roundId,
    programmeId: view.programmeId,
    run: records.run,
    groups: records.groups,
    weeks: weeksOf(records),
    viewer: view.viewer,
    now,
  });
  // An admin's alone: a group's session at a time. Never read for the lead.
  const table = view.viewer === "admin" ? await readWeekTable(db, { records, weekNumber: weekAsked(query.week), now }) : null;
  return (
    <SurveysFrame roundId={view.roundId} programmeId={view.programmeId} current="check-ins">
      {table && (
        <ThisWeeksCheckIns
          table={table}
          roundId={view.roundId}
          programmeId={view.programmeId}
          runId={records.run.id}
          path={surveysViewPath(view.roundId, view.programmeId, "check-ins")}
        />
      )}
      <CheckInsWeeks view={checkIns} />
    </SurveysFrame>
  );
}
