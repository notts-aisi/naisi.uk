import Link from "next/link";
import { redirect } from "next/navigation";
import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import WeeksNotYours from "@/features/applications/weeks/WeeksNotYours";
import ExplainerForm from "@/features/courses/explainers/ExplainerForm";
import styles from "@/features/courses/explainers/explainers.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { loadExplainerForm } from "@/lib/courses/explainers/schedule";
import { EXPLAINER_WORDS } from "@/lib/courses/explainers/words";
import { LEAD_REVIEW_WORDS } from "@/lib/courses/weekReview/words";
import { weekReviewPath, weeksPath } from "@/lib/courses/weeksTab/paths";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";

/**
 * "SCHEDULE AN EXPLAINER", under a week's review, FOR AN ADMIN ALONE, as the
 * review is: decided from the form before the run is read
 * (`loadProgrammeRun`); the programme's lead is drawn the review's calm
 * "admins only" and nothing of the week is read for them; an admin's form is
 * loaded behind the review's own door (`loadExplainerForm`), which asks
 * again.
 *
 * `?theme=2` opens it from the review's third theme: its title to start the
 * topic from, its groups ticked, and where it came from. Without it the
 * topic is typed. Drawing it writes nothing and sends nothing; "Schedule for
 * N groups" sends its own route, which decides everything again.
 */

export const dynamic = "force-dynamic";

export default async function ExplainerPage({
  params,
  searchParams,
}: {
  params: Promise<{ roundId: string; programmeId: string; weekId: string }>;
  searchParams?: Promise<{ theme?: string | string[] }>;
}) {
  const [{ roundId, programmeId, weekId }, query, user] = await Promise.all([
    params,
    searchParams ?? Promise.resolve({} as { theme?: string | string[] }),
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

  const theme = typeof query.theme === "string" && /^\d{1,2}$/.test(query.theme) ? Number(query.theme) : null;
  const loaded = await loadExplainerForm(db, user, { roundId: view.roundId, programmeId: view.programmeId, weekId, theme }, new Date());
  if (!loaded.ok) {
    if (loaded.status === 404) redirect(weeksPath(view.roundId, view.programmeId));
    return <RunBlank view={{ ...view, blank: "run-gone" }} />;
  }
  const { form } = loaded;
  const review = weekReviewPath(view.roundId, view.programmeId, form.weekId);
  if (!form.reviewable) {
    return (
      <Refusal title={EXPLAINER_WORDS.title} href={weeksPath(view.roundId, view.programmeId, form.weekId)} action={LEAD_REVIEW_WORDS.back}>
        {EXPLAINER_WORDS.notYet(form.weekNumber)}
      </Refusal>
    );
  }
  return (
    <section className={styles.page} aria-labelledby="explainer-title">
      <p className={styles.crumbs}>
        <Link href={review} className={styles.crumbLink}>
          {EXPLAINER_WORDS.crumb(view.programmeName, form.weekNumber)}
        </Link>
      </p>
      <h2 id="explainer-title" className={styles.title}>
        {EXPLAINER_WORDS.title}
      </h2>
      <ExplainerForm
        roundId={view.roundId}
        programmeId={view.programmeId}
        weekId={form.weekId}
        reviewHref={review}
        topic={form.topic}
        from={form.from}
        choices={form.choices.map((choice) => ({
          groupId: choice.groupId,
          sessionKey: choice.sessionKey,
          label: choice.label,
          taken: choice.taken,
          ticked: choice.ticked,
        }))}
        undated={form.undated}
        people={form.people}
        minutes={form.minutes}
      />
    </section>
  );
}
