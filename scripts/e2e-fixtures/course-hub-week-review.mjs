/**
 * The course hub's browser spec for a week's review (privacy v15): an
 * admin's page under a week on the Weeks tab, where Claude may be asked for
 * draft grades, what people found hard and who might need a hand.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its coursework point: three weeks into a running run whose weeks are
 * written as blocks, Ada and Ben in Group A, Cleo in Group B and Dan in no
 * group, with week 3's sessions of both groups over. On top of it this
 * fixture writes one thing: Ada's week 3 written answer and her first week 3
 * reflection are marked first written a second after the seed, so after her
 * account agreed to the policy (every fixture account agrees to the current
 * version, 15, when it is seeded). They are writing the review may send;
 * everything else the term wrote carries no first-written time and is "not
 * included yet".
 *
 * The spec (`tests/e2e/course-hub-week-review.spec.mjs`) is the harness's
 * admin, who approves Fern and Group A's two people, names the running run on
 * the programme's Settings tab and appoints Fern to Group A; finds Review
 * beside week 3 on the Weeks tab; reads the review page saying what would be
 * sent before any press (in local mode, with no key, the calm sentence that
 * Claude is not set up, and no press) and Pangram's count before any press,
 * with nothing pressed; reads who might need a hand from the site's own
 * records; asks Fern to have a word with Ben, which makes one task with fixed
 * words and no reason; and Fern, signed in, finds the task on My Work.
 *
 * ## What it cannot drive, and where that is held instead
 *
 * The harness signs in no lead who is not an admin (a lead must be
 * SU-recognised committee, and the harness grants nothing above a waiting
 * account), so "the programme's lead is shown a calm 'a week's review is for
 * admins' and nothing of the week is read" is held by the persona battery
 * against a real build (`tests/persona-route-gates.registry.mjs`, the `lead`
 * persona on the review page and both routes) and by
 * `tests/week-review.test.mjs`, not here. Nothing is pressed that would send
 * anything to Claude or Pangram.
 *
 * ## It reads no mail
 *
 * The approvals and the follow-up's task email go to addresses the fixture
 * suppressed first, so nothing leaves; the spec reads no mail.
 */
import { deleteQuery, fixtureDoc, fixtureQuery } from "./core.mjs";
import { countTerm, courseworkItemId, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const WEEK_REVIEW_STEPS = [
  "the admin approves the facilitator and the two people of the group they will facilitate",
  "the admin names the running course run on the programme's Settings tab",
  "the admin appoints the facilitator to Group A on the Facilitators view",
  "the Weeks tab offers the admin week 3's review, and no week whose first session is still to come",
  "the review says what would be sent before any press, and with no key that Claude is not set up, with nothing pressed",
  "who might need a hand, from the site's own records, each line saying where it came from",
  "the admin asks the facilitator to have a word with a person: one task, fixed words and no reason",
  "the facilitator finds the task on My Work",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin or the facilitator drives
 * takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** Seeded a second after the seed, so after every fixture account's agreement. */
const AFTER_AGREEMENT_MS = 1_000;

async function seed({ runId, suppress, onState }) {
  let state = null;
  await seedTerm({
    runId,
    suppress,
    point: "coursework",
    onState: (published) => {
      state = published;
      onState?.(published);
    },
  });
  if (!state) throw new Error("The term published no state.");
  const ada = state.people.find((person) => person.key === "ada");
  if (!ada) throw new Error("The term has no Ada.");
  const after = new Date(Date.now() + AFTER_AGREEMENT_MS);
  // Ada's week 3 written answer and first reflection, first written after she agreed.
  for (const key of ["wa", "rp1"]) {
    await fixtureDoc("courseExerciseResponses", `${state.runId}__${ada.uid}__w03__${courseworkItemId(3, key)}`).set(
      { firstWrittenAt: after },
      { merge: true },
    );
  }
  return state;
}

/** What the review keeps on the run, and the follow-ups made from it. */
async function countReview(state) {
  const courseWeekReviews = (await fixtureQuery("courseWeekReviews").where("runId", "==", state.runId).get()).size;
  const reviewFollowUps = (
    await fixtureQuery("tasks").where("source", "==", "review-follow-up").where("sourceRef.cohortId", "==", state.runId).get()
  ).size;
  return { courseWeekReviews, reviewFollowUps };
}

async function teardown(state) {
  await deleteQuery(fixtureQuery("courseWeekReviews").where("runId", "==", state.runId));
  await deleteQuery(fixtureQuery("tasks").where("source", "==", "review-follow-up").where("sourceRef.cohortId", "==", state.runId));
  // The runner reads the manifest this returns, and calls the fixture clean
  // only when its total is zero: the term's own, plus what is left of the
  // two above, counted again after the deletes.
  const term = await teardownTerm(state);
  const left = await countReview(state);
  return { ...term, ...left, total: term.total + left.courseWeekReviews + left.reviewFollowUps };
}

export const SPEC = {
  name: "course-hub-week-review",
  specFile: "tests/e2e/course-hub-week-review.spec.mjs",
  steps: WEEK_REVIEW_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view and the review are an
  // admin's here. The account is one the harness is given; it can never make one.
  needs: { admin: true },
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/pangram",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review/follow-up",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review",
      "/(app)/tasks",
    ],
  },
  /**
   * Written beside the code it drives and not yet run end to end: it counts
   * nothing on the coverage map until a run against the harness's server has
   * passed and read zero rows afterwards.
   */
  status: "unverified",
  seed,
  countRows: async (state) => ({ ...(await countTerm(state)), ...(await countReview(state)) }),
  teardown,
};
