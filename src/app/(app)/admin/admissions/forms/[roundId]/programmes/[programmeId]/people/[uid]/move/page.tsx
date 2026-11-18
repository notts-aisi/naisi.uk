import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import shared from "@/features/applications/editor/editor.module.css";
import NotYours from "@/features/applications/groups/NotYours";
import RunBlank from "@/features/applications/groups/RunBlank";
import ApplicationsRoot from "@/features/applications/kit/ApplicationsRoot";
import MovePage from "@/features/courses/staffMove/MovePage";
import { isAddressableId } from "@/lib/addressableId";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { moveChoices, planMove, previewOf, readMoveFacts } from "@/lib/courses/staffMove/plan";
import type { MovePageView } from "@/lib/courses/staffMove/view";
import { BACK_TO_PEOPLE, MOVE_PAGE_TITLE, moveTitle } from "@/lib/courses/staffMove/words";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * MOVING ONE PERSON TO ANOTHER GROUP FOR GOOD, MID-TERM, at
 * `.../programmes/[programmeId]/people/[uid]/move`, reached from their row on
 * the People tab (its More menu) and from their name on the programme's page
 * of a group. `?to=<groupId>` opens it with a group already chosen, so a page
 * can link here with one.
 *
 * FOR AN ADMIN AND THE PROGRAMME'S LEAD (`loadProgrammeRun`), decided from
 * the form before the run is read; a reviewer is told it is the lead's and
 * an admin's. Everything it says is worked out by the plan its route shares
 * (`src/lib/courses/staffMove/plan.ts`): the week the move is from (stated,
 * never chosen), what will happen, who is emailed and the email to the
 * person as it will be sent. NOTHING HERE WRITES: the press is the route's.
 *
 * BEFORE ANY SCRIPT the choice of group is a plain form that reloads this
 * page with `?to=`, so what a move would do can be read without one; the
 * press itself needs the script, as its neighbours' do.
 *
 * THIS PAGE STANDS ALONE, outside the `(tabs)` route group beside it, as one
 * application and one person's week do, and carries its own way back.
 */

export const dynamic = "force-dynamic";

export default async function StaffMovePage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; uid: string }>;
  searchParams?: Promise<{ to?: string | string[] }>;
}) {
  const [{ roundId, programmeId, uid }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { to?: string | string[] }),
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
  const read = isAddressableId(uid) ? await readMoveFacts(db, view.run.id, uid) : null;
  if (!read || !read.ok) {
    return (
      <Refusal title={MOVE_PAGE_TITLE} href={backHref} action={BACK_TO_PEOPLE}>
        {read?.error ?? ""}
      </Refusal>
    );
  }
  const { facts } = read;
  const choices = moveChoices(facts);
  const to = typeof query.to === "string" && isAddressableId(query.to) ? query.to : null;
  const planned = to ? await planMove(db, facts, to, user.uid, new Date()) : null;
  const page: MovePageView = {
    roundId: view.roundId,
    programmeId: view.programmeId,
    uid,
    title: moveTitle(facts.person.name),
    firstName: facts.person.firstName,
    fromName: facts.from.name.trim() || "Untitled group",
    choices,
    chosen: to,
    outcome: planned ? (planned.ok ? { ok: true, preview: previewOf(planned.plan) } : { ok: false, error: planned.error }) : null,
    routePath: `/api/admissions/forms/${encodeURIComponent(view.roundId)}/programmes/${encodeURIComponent(view.programmeId)}/people/${encodeURIComponent(uid)}/move`,
    backHref,
  };
  return (
    <ApplicationsRoot className={shared.page}>
      <MovePage view={page} />
    </ApplicationsRoot>
  );
}
