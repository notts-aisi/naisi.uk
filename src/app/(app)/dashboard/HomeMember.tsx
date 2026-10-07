"use client";

import type { ReactNode } from "react";
import PageHead from "@/components/ui/PageHead";
import Skeleton from "@/components/ui/Skeleton";
import MyCoursesSummary, { liveRunsOf } from "@/features/courses/MyCoursesSummary";
import { useMyRuns } from "@/features/courses/useMyRuns";
import MyWorkSummary from "@/features/tasks/components/MyWorkSummary";
import HomeFacilitator from "./HomeFacilitator";
import HomeProgramme from "./HomeProgramme";
import styles from "./home.module.css";

/**
 * Home for everybody who is not an admin, in three forms.
 *
 * WHICH FORM is decided by `/api/courses/me`, the list of runs this member
 * touches, narrowed to the ones that are live (`liveRunsOf`):
 *
 *   - they facilitate a live run: the facilitator's Home, for that run;
 *   - otherwise they are a learner on one: the programme Home, for that run;
 *   - otherwise: the Home of a member who is not on a programme.
 *
 * Somebody on two live runs sees the first of them in full and the other in
 * a short list ("Your other programmes"), so nothing they are on is out of
 * reach from Home.
 *
 * The parts that are the same for every reader (the term, the events, the
 * member's applications, their unfinished profile) are rendered on the server
 * and handed in. This component only decides where they go. While the list
 * of runs is loading it draws the greeting and a placeholder, and says
 * nothing about programmes: "You're not on a programme yet" is a claim, and
 * it waits until it is known.
 */

type Slots = {
  /** The member's first name, for the greeting. */
  given: string;
  termCard: ReactNode;
  comingUpRows: ReactNode;
  comingUpCards: ReactNode;
  /** The member's applications. Draws nothing when they have none. */
  applications: ReactNode;
  /** "Nothing yet", for a member with no application while applications are open. */
  nothingYet: ReactNode;
  finishProfile: ReactNode;
};

export default function HomeMember({
  given,
  termCard,
  comingUpRows,
  comingUpCards,
  applications,
  nothingYet,
  finishProfile,
}: Slots) {
  const { runs, loading, error } = useMyRuns();
  const live = liveRunsOf(runs);
  const facilitated = live.find((entry) => entry.roles.includes("facilitator")) ?? null;
  const learning = live.find((entry) => entry.roles.includes("learner")) ?? null;
  const featured = facilitated ?? learning;
  const greeting = given ? `Hi ${given}.` : "Hi.";

  if (loading) {
    return (
      <>
        <PageHead title={greeting} />
        <Skeleton height="14rem" />
      </>
    );
  }

  // The cards every form ends with: an unfinished profile, other programmes,
  // then the member's own tasks. Each draws nothing when it has nothing to say.
  const more = (
    <>
      {finishProfile}
      <MyCoursesSummary
        runs={runs}
        loading={loading}
        error={error}
        featuredRunId={featured?.runId ?? null}
      />
      <MyWorkSummary />
    </>
  );

  if (facilitated) {
    return (
      <HomeFacilitator
        given={given}
        entry={facilitated}
        comingUp={comingUpCards}
        more={
          <>
            {applications}
            {more}
          </>
        }
      />
    );
  }

  if (learning) {
    return (
      <HomeProgramme
        given={given}
        entry={learning}
        comingUp={comingUpCards}
        applications={applications}
        more={more}
      />
    );
  }

  return (
    <>
      <PageHead
        title={greeting}
        // A failed read is not "not on a programme": the line is left out.
        description={error ? undefined : "You’re not on a programme yet."}
      />
      {termCard}
      <div className={styles.columns}>
        <div className={styles.stack}>{comingUpRows}</div>
        <div className={styles.stack}>
          {applications}
          {nothingYet}
          {more}
        </div>
      </div>
    </>
  );
}
