import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import VisitPage from "@/features/courses/visit/VisitPage";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { dbReader, planVisit, previewOf, readVisitFacts, sessionChoices, standingVisits, weekChoices } from "@/lib/courses/visit/plan";
import type { VisitPageView } from "@/lib/courses/visit/view";
import { BACK_TO_PEOPLE, VISIT_PAGE_TITLE, VISIT_REFUSAL, visitTitle } from "@/lib/courses/visit/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ARRANGING A ONE-WEEK VISIT TO ANOTHER GROUP'S SESSION FOR ONE PERSON, at
 * `.../programmes/[programmeId]/people/[uid]/visit`, reached from their row on
 * the People tab (its More menu) and from their name on the programme's page
 * of a group. `?week=<n>&to=<groupId>` opens it with a week and a session
 * already chosen, so a page can link here with them.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read; a reviewer is told it is the lead's and
 * an admin's. Everything it says is worked out by the plan its route shares
 * (`src/lib/courses/visit/plan.ts`): the weeks of their group still to come,
 * each other group's session that week with its places left, what will
 * happen, who is emailed and the email to the person as it will be sent; and
 * every visit that stands, with the way to call it off. NOTHING HERE WRITES:
 * the presses are the route's.
 *
 * BEFORE ANY SCRIPT the choices are plain forms that reload this page with
 * `?week=` and `?to=`, so what a visit would do can be read without one; the
 * presses themselves need the script, as its neighbours' do.
 */

export const dynamic = "force-dynamic";

const asWeek = (value: string | string[] | undefined): number | null =>
  typeof value === "string" && /^\d{1,2}$/.test(value) ? Number(value) : null;

export default async function StaffVisitPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; uid: string }>;
  searchParams?: Promise<{ week?: string | string[]; to?: string | string[] }>;
}) {
  const [{ roundId, programmeId, uid }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { week?: string | string[]; to?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <NotYours roundId={roundId} programmeId={programmeId} tab="Groups" />;
  const { view } = outcome;
  if (!view.run) {
    return (
      <ApplicationsRoot className={shared.page}>
        <RunBlank view={view} />
      </ApplicationsRoot>
    );
  }
  const base = `/admin/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}`;
  const backHref = `${base}/people`;
  const now = new Date();
  const read = isAddressableId(uid) ? await readVisitFacts(dbReader(db), db, view.run.id, uid, "ahead", now) : null;
  if (!read || !read.ok) {
    return (
      <Refusal title={VISIT_PAGE_TITLE} href={backHref} action={BACK_TO_PEOPLE}>
        {read?.error ?? ""}
      </Refusal>
    );
  }
  const { facts } = read;
  const standing = standingVisits(facts, user.uid, now);
  // A run with one group that still meets takes no visit, but a visit that stands there can still be called off.
  if (facts.oneGroup && standing.length === 0) {
    return (
      <Refusal title={VISIT_PAGE_TITLE} href={backHref} action={BACK_TO_PEOPLE}>
        {VISIT_REFUSAL.oneGroup}
      </Refusal>
    );
  }
  const weeks = weekChoices(facts, now);
  const asked = asWeek(query.week);
  const week = asked !== null && weeks.some((each) => each.weekNumber === asked && !each.visiting) ? asked : null;
  const sessions = week !== null ? sessionChoices(facts, week, now) : [];
  const to = week !== null && typeof query.to === "string" && isAddressableId(query.to) ? query.to : null;
  const planned = week !== null && to ? planVisit(facts, week, to, user.uid, now) : null;
  const page: VisitPageView = {
    roundId: view.roundId,
    programmeId: view.programmeId,
    uid,
    title: visitTitle(facts.person.name),
    firstName: facts.person.firstName,
    weeks,
    week,
    sessions,
    chosen: to,
    outcome: planned ? (planned.ok ? { ok: true, preview: previewOf(planned.plan) } : { ok: false, error: planned.error }) : null,
    standing,
    routePath: `/api/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/people/${encodeURIComponent(uid)}/visit`,
    backHref,
  };
  return (
    <ApplicationsRoot className={shared.page}>
      <VisitPage view={page} />
    </ApplicationsRoot>
  );
}
