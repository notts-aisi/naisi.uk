import { NoProgrammeHere, Refusal } from "@/features/applications/editor/Refusals";
import RunBlank from "@/features/applications/groups/RunBlank";
import RatingsBoard from "@/features/ratings/RatingsBoard";
import styles from "@/features/ratings/ratings.module.css";
import { loadProgrammeRun } from "@/lib/applications/handover/programmeRun";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireAdmissionsPage } from "@/lib/firebase/pageGates";
import { loadRatingsView } from "@/lib/ratings/view";
import { RATINGS_WORDS } from "@/lib/ratings/words";

/**
 * A PROGRAMME'S RATINGS, FOR ITS LEAD AND ADMINS: every group of the run the
 * programme names, each fellow with what their group's facilitators said
 * about them (the rater named beside each), and this reader's own form for
 * the people only they may rate: the facilitators, who are fellows of the
 * groups they run. Once the run's last session is over; before then, one
 * line saying when.
 *
 * WHO: an admin and the programme's lead (`loadProgrammeRun`, decided from
 * the form before the run is read). A reviewer is told the page is the
 * lead's and an admin's. The rules of who rates whom are the route's
 * (`src/lib/ratings/rules.ts`), drawn here: nobody rates themselves, and a
 * co-facilitator never rates a co-facilitator.
 *
 * NOTHING HERE IS EVER SHOWN TO THE PERSON RATED: the reader is never one of
 * the rows (`loadRatingsView`).
 */
export default async function ProgrammeRatingsPage({
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
        title="Only the programme’s lead and admins can open Ratings"
        href={`/admin/admissions/forms/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`}
        action="Go to applications"
      >
        Ratings shows what each group’s facilitators said about their fellows, by name, so only the programme’s lead or an
        admin can open it.
      </Refusal>
    );
  }
  const { view: run } = outcome;
  if (!run.run) return <RunBlank view={run} />;
  const view = await loadRatingsView(db, user, run.run.id, null, new Date());
  if (!view) return <RunBlank view={{ ...run, blank: "run-gone" }} />;
  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <h2 className={styles.title}>{RATINGS_WORDS.runTitle}</h2>
        <p className={styles.intro}>{RATINGS_WORDS.readerIntro}</p>
      </header>
      <RatingsBoard view={view} showGroupNames />
    </div>
  );
}
