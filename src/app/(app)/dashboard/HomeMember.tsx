"use client";

import type { ReactNode } from "react";
import PageHead from "@/components/ui/PageHead";
import Skeleton from "@/components/ui/Skeleton";
import MyCoursesSummary, { liveRunsOf } from "@/features/courses/MyCoursesSummary";
import { useMyRuns } from "@/features/courses/useMyRuns";
import MyWorkSummary from "@/features/tasks/components/MyWorkSummary";
import OnItsWay from "@/features/courses/weekOne/OnItsWay";
import SurveyCards from "@/features/surveys/cards/SurveyCards";
import type { BeforeGroupsCard } from "@/lib/courses/weekOne/cards";
import type { SurveyCard } from "@/lib/surveys/waiting";
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
 *
 * A PLACE ON A PROGRAMME IS NOT A RUN. Somebody decision day gave a place
 * has no run until they are put on one, so this list has nothing of theirs,
 * and "You're not on a programme yet" would be untrue of them. The server
 * asks whether the member holds a place and hands in one answer,
 * `holdsNoPlace`: the sentence is said only when the server could read that
 * they hold none. THIS PAGE STATES NO OUTCOME. With a place, or with a place
 * that could not be read, it leaves the sentence out and does nothing else:
 * the member's applications card, which names no outcome either, is the way
 * to the page that says where they stand.
 *
 * BEFORE GROUPS GO OUT, one card more for a place they hold (`beforeGroups`,
 * Q13 B, board st-waiting): "Your group’s on its way", under the greeting in
 * every form. Worded on the server by week 1's door; what it may say is held
 * by `MAY_SHOW` in `tests/applications-place-in-the-member-area.test.mjs`.
 *
 * A SURVEY WAITING FOR THEM is Home's first card (`surveys`, Q50 B): "A
 * survey for you", above the cards for a place, in every form. Worded on the
 * server by `surveysWaitingFor`; never how many others have answered.
 */

type Slots = {
  /** The member's first name, for the greeting. */
  given: string;
  /** The invitation to install the site as an app, drawn under the greeting. */
  invite: ReactNode;
  termCard: ReactNode;
  comingUpRows: ReactNode;
  comingUpCards: ReactNode;
  /** The member's applications. Draws nothing when they have none. */
  applications: ReactNode;
  /** "Nothing yet", for a member with no application while applications are open. */
  nothingYet: ReactNode;
  /**
   * True only when the server could read that this member holds no place.
   * While false, nothing is said about being on no programme.
   */
  holdsNoPlace: boolean;
  /**
   * "Your group’s on its way" for each place held before groups go out
   * (Q13 B), worded on the server (`beforeGroupsCardsFor`). Drawn under the
   * greeting in every form of Home, and nothing when there is none.
   */
  beforeGroups: readonly BeforeGroupsCard[];
  /**
   * "A survey for you" for each survey waiting for the member (Q50 B), worded
   * on the server (`surveysWaitingFor`). Drawn first under the greeting in
   * every form of Home, and nothing when there is none.
   */
  surveys: readonly SurveyCard[];
  finishProfile: ReactNode;
};

export default function HomeMember({
  given,
  invite,
  termCard,
  comingUpRows,
  comingUpCards,
  applications,
  nothingYet,
  holdsNoPlace,
  beforeGroups,
  surveys,
  finishProfile,
}: Slots) {
  const { runs, loading, error } = useMyRuns();
  const live = liveRunsOf(runs);
  const facilitated = live.find((entry) => entry.roles.includes("facilitator")) ?? null;
  const learning = live.find((entry) => entry.roles.includes("learner")) ?? null;
  const featured = facilitated ?? learning;
  // Somebody with an offer, or who leads or reviews a programme, is not on
  // one in the sense this page means, and is not somebody to tell "You're not
  // on a programme yet" either. For them the line is left out.
  const involved = runs.some(
    (entry) => !entry.archived && (entry.roles.length > 0 || entry.membership !== "none"),
  );
  const greeting = given ? `Hi ${given}.` : "Hi.";

  if (loading) {
    return (
      <>
        <PageHead title={greeting} />
        {invite}
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

  // The cards sit straight under the greeting, with the install invitation:
  // a survey waiting for them first (Q50 B), then the cards for a place.
  const cards = (
    <>
      <SurveyCards cards={surveys} />
      <OnItsWay cards={beforeGroups} />
    </>
  );
  const underGreeting = (
    <>
      {invite}
      {cards}
    </>
  );

  if (facilitated) {
    return (
      <HomeFacilitator
        given={given}
        invite={underGreeting}
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
        invite={underGreeting}
        entry={learning}
        comingUp={comingUpCards}
        applications={applications}
        more={more}
      />
    );
  }

  // "Not on a programme" is said only when it is known: the runs were read
  // and hold nothing, and the server read that the member holds no place.
  const onNothing = !error && !involved && holdsNoPlace;

  return (
    <>
      <PageHead title={greeting} description={onNothing ? "You’re not on a programme yet." : undefined} />
      {invite}
      {cards}
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
