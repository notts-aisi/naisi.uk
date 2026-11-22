import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import CourseDocuments from "@/features/applications/weeks/CourseDocuments";
import WeeksList from "@/features/applications/weeks/WeeksList";
import styles from "@/features/applications/weeks/weeks.module.css";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { facilitatorGuideWriter } from "@/lib/courses/facilitatorGuide/access";
import { readCourseDocumentsLoaded } from "@/lib/courses/facilitatorGuide/store";
import { loadCourseDocuments } from "@/lib/courses/weeksTab/documents";
import { loadWeekPlanView } from "@/lib/courses/weekPlanEdit/view";
import { loadWeeksTab } from "@/lib/courses/weeksTab/load";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * One programme's Weeks tab: first the course's documents (the run's Start
 * here and Glossary, the course's Handbook and Printables) for an admin, and
 * one line for the lead (`loadCourseDocuments`; the course's two are read
 * here, behind `facilitatorGuideWriter`); then when weeks open, "Copy weeks
 * from the course", and every week of the run the programme names, in order,
 * with its state, first session, ready-by day and owner, each a link to the
 * week's own page, and the run's breaks between them; with the plan's
 * controls, each only where its route would take it now
 * (`loadWeekPlanView`, the same judgement the route asks).
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read, as the programme's other run tabs are. A
 * reviewer is told the tab is the lead's and an admin's; anybody with no
 * role on the programme is shown there is no programme here (the layout's).
 * A week whose first session has started offers its review to an admin, and
 * says "admins only" to the lead.
 */
export default async function ProgrammeWeeksPage({
  params,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
}) {
  const [{ roundId, programmeId }, user] = await Promise.all([params, requireAdmissionsPage()]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <WeeksNotYours roundId={roundId} programmeId={programmeId} />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  const tab = await loadWeeksTab(db, view.run.id, view.programmeName, user);
  if (!tab) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  // The course's Handbook and Printables, for an admin alone, read only once
  // the facilitator guide's loader gate has admitted them for this course.
  const writer = user.role === "admin" && tab.courseId ? await facilitatorGuideWriter(db, user, tab.courseId) : null;
  const now = new Date();
  const [course, plan] = await Promise.all([
    writer ? readCourseDocumentsLoaded(db, writer, ["handbook", "printables"]) : Promise.resolve(null),
    loadWeekPlanView(db, tab.runId, now),
  ]);
  const documents = await loadCourseDocuments(db, user, { runId: tab.runId }, course);
  return (
    <div className={styles.stack}>
      <CourseDocuments runId={tab.runId} courseId={tab.courseId} documents={documents} />
      <WeeksList tab={tab} roundId={view.roundId} programmeId={view.programmeId} review={{ viewer: view.viewer, now }} plan={plan} />
    </div>
  );
}
