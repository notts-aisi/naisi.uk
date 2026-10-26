import { NoProgrammeHere } from "@/features/applications/editor/Refusals";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import WrittenReview from "@/features/courses/written/WrittenReview";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { isAddressableId } from "@/lib/addressableId";
import { liveGroupsOf, reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import { loadWrittenReview } from "@/lib/courses/writtenAnswers/reviewPage";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { normalizeCourseRun } from "@/lib/firestore/courses";

/**
 * THE PROGRAMME'S LEAD GIVING FEEDBACK ON WRITTEN ANSWERS (Zach, Mon 26 Oct:
 * a facilitator's own answer is read, and given feedback, by the lead or an
 * admin): the review page (boards wk-review, wk-review-phone) for one group
 * of the run the programme names, at
 * `.../programmes/[programmeId]/written?group=&week=&person=`, reached from
 * the Attendance tab's "Written answers" card.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read; a reviewer is told it is the lead's and
 * an admin's. Then the one gate, person by person (`loadWrittenReview`): the
 * lead and admins may review every answer of the group, its facilitators'
 * own among them. The routes behind the page ask the same gate again.
 *
 * Outside the tabs, as a single application is: a screen of its own, with
 * the way back to the Attendance tab.
 */

export const dynamic = "force-dynamic";

export default async function LeadWrittenAnswersPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string }>;
  searchParams?: Promise<{ group?: string | string[]; week?: string | string[]; person?: string | string[] }>;
}) {
  const [{ roundId, programmeId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { group?: string | string[]; week?: string | string[]; person?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Attendance" />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;

  const runSnap = await db.collection("courseRuns").doc(view.run.id).get();
  if (!runSnap.exists || (runSnap.data() ?? {}).destroying === true) return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const [liveGroups, facts] = await Promise.all([liveGroupsOf(db, run.id), reviewerFactsOf(db, user, run.id)]);
  // The run's live groups, in the one order every tab lists them in.
  const askedGroup = typeof query.group === "string" && isAddressableId(query.group) ? query.group : null;
  const group = liveGroups.find((candidate) => candidate.id === askedGroup) ?? liveGroups[0] ?? null;
  if (!group) return <RunBlank view={view} />;

  const asked = typeof query.week === "string" && /^\d{1,2}$/.test(query.week) ? Number(query.week) : null;
  const person = typeof query.person === "string" && isAddressableId(query.person) ? query.person : null;
  const model = await loadWrittenReview(db, user, run, group, asked, person, new Date(), { liveGroups, facts });

  const programmePath = `/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}`;
  return (
    <WrittenReview
      model={model}
      basePath={`${programmePath}/written`}
      groupParam={group.id}
      back={{ href: `${programmePath}/attendance`, label: "Attendance" }}
    />
  );
}
