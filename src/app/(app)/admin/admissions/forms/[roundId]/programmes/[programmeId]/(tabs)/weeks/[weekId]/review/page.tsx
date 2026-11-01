import { redirect } from "next/navigation";
import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import WeekReviewScreen from "@/features/courses/weekReview/WeekReviewScreen";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadWeekReview } from "@/lib/courses/weekReview/store";
import { LEAD_REVIEW_WORDS, REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import { weeksPath } from "@/lib/courses/weeksTab/paths";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * ONE WEEK'S REVIEW (privacy v15, "AI-assisted review"), under the week on a
 * programme's Weeks tab, FOR AN ADMIN ALONE: what Claude returns is seen by
 * admins only. Decided from the form before the run is read
 * (`loadProgrammeRun`, as the tab is): a reviewer is told the tab is the
 * lead's and an admin's; the programme's lead is shown a calm "admins only"
 * and nothing of the week is read for them; an admin's page is read on the
 * server after the review's own door (`loadWeekReview`), which asks again.
 *
 * Drawing it sends nothing and writes nothing: it says what "Review with
 * Claude" would send before anybody presses it. The presses send their own
 * routes, which ask who the caller is again. `?read=strongest` and
 * `?read=weakest` open the lists under the chart, as plain links.
 */

export const dynamic = "force-dynamic";

export default async function WeekReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; weekId: string }>;
  searchParams?: Promise<{ read?: string | string[] }>;
}) {
  const [{ roundId, programmeId, weekId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { read?: string | string[] }),
    requireAdmissionsPage(),
  ]);
  const db = getAdminDb();
  const outcome = db ? await loadProgrammeRun(db, user, roundId, programmeId) : null;
  if (!db || !outcome || outcome.status === "none") return <NoProgrammeHere roundId={roundId} />;
  if (outcome.status === "not-yours") return <WeeksNotYours roundId={roundId} programmeId={programmeId} />;
  const { view } = outcome;
  if (!view.run) return <RunBlank view={view} />;
  if (view.viewer !== "admin") {
    return (
      <Refusal title={LEAD_REVIEW_WORDS.title} href={weeksPath(view.roundId, view.programmeId)} action={LEAD_REVIEW_WORDS.action}>
        {LEAD_REVIEW_WORDS.body}
      </Refusal>
    );
  }

  const loaded = await loadWeekReview(db, user, { roundId: view.roundId, programmeId: view.programmeId, weekId }, new Date());
  if (!loaded.ok) {
    if (loaded.status === 404) redirect(weeksPath(view.roundId, view.programmeId));
    return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  }
  const { page } = loaded;
  const read = query.read === "strongest" || query.read === "weakest" ? query.read : null;
  if (!page.view) {
    return (
      <Refusal title={REVIEW_WORDS.title(page.opened.weekNumber)} href={weeksPath(view.roundId, view.programmeId, page.opened.weekId)} action={LEAD_REVIEW_WORDS.back}>
        {REVIEW_WORDS.notYet(page.opened.weekNumber)}
      </Refusal>
    );
  }
  return (
    <WeekReviewScreen
      view={page.view}
      roundId={view.roundId}
      programmeId={view.programmeId}
      programmeName={view.programmeName}
      names={page.names}
      read={read}
    />
  );
}
