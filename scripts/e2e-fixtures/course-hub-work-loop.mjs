/**
 * The course hub's work loop, in a real browser: feedback on a submitted
 * written answer, the batch of "you have feedback" emails, and a rating for
 * the team that the person rated never sees.
 *
 * The term at its coursework point (`./worlds/course-hub-term.mjs`): three
 * weeks into a running run whose weeks are written as blocks, Ada and Ben in
 * Group A, Cleo in Group B and Dan in no group, week 3's sessions over, and
 * Ada's week 3 written answer sent. On top of it this fixture writes what the
 * loop needs and the term does not have:
 *
 *  - BEN'S WEEK 3 WRITTEN ANSWER, sent, as the written answer route stores
 *    one, so two people in the group have an answer to give feedback on and
 *    the batch has two people to email;
 *  - ADA'S AND BEN'S WEEK 3, SUBMITTED, as Submit stores it
 *    (`courseWeekWork`), so each answer is readable by the people running
 *    the group and takes feedback and a rating.
 *
 * The spec (`tests/e2e/course-hub-work-loop.spec.mjs`) is the harness's admin,
 * who approves Fern, Ada and Ben, names the running run on the programme's
 * Settings tab and appoints Fern to Group A; Fern, signed in, who opens both
 * answers from the group page's Feedback to write and saves feedback on each;
 * the admin again, as the programme's lead, who rates Ada's answer for the
 * team on its review page and reads the rating under What the team said, then
 * sends the test of the feedback batch and the batch from the programme's
 * Overview; and Ada, signed in, who follows her email to her week 3 page and
 * reads Fern's feedback there, none of the rating, and opens the old feedback
 * page, which sends her to the same place.
 *
 * ## The lead is the harness's admin
 *
 * A lead must be SU-recognised committee, which the harness never makes, so
 * the programme's lead here is the admin the harness is given, as at every
 * course hub spec. An admin rates as an admin (`workRatingRoleOf`), so the
 * rating is recorded as the admin's; the lead's own rating, saved as the
 * lead's and read by an admin, is held by `tests/course-work-ratings.test.mjs`
 * and the persona battery, not here.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * The test of the batch goes to the admin's own address, which the harness
 * does not own, and the spec reads both people's emails. So it declares
 * `requiresCaughtMail`, and the runner skips it anywhere else. Every email
 * the loop sends names the run (`referenceId`), so the term's own count of
 * the send log finds the test as well as the batch.
 */
import { deleteQuery, fixtureDoc, fixtureQuery } from "./core.mjs";
import { countTerm, courseworkItemId, seedTerm, sessionOf, teardownTerm, weekDocId } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const WORK_LOOP_STEPS = [
  "the admin approves the facilitator and the two people whose answers get feedback",
  "the admin names the running course run on the programme's Settings tab",
  "the admin appoints the facilitator to Group A on the Facilitators view",
  "the facilitator opens a submitted answer from Feedback to write and saves feedback on it, with no rating on the page",
  "the facilitator saves feedback on the second person's answer",
  "the lead rates the first answer for the team on its review page, and an admin reads it under What the team said",
  "Feedback to send lists both pieces, and the test of the batch reaches the admin",
  "the batch sends one email per person, and nobody else is emailed",
  "the person follows the email to their week page and reads the feedback, and none of the rating",
  "the old feedback link lands on the week page's Feedback",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin, the facilitator or the
 * person drives takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** The week the loop is about: the coursework point's week 3, both of Group A's answers to it. */
export const LOOP_WEEK = 3;

/** Ben's week 3 written answer. Made up, every word. */
export const BEN_ANSWER =
  "The port should keep the lamps lit, since the ships that use the light pay its dues and nobody else does.";

/** Ada's and Ben's weeks are submitted this long after their answers were sent: before their group met. */
const SUBMITTED_AFTER_SENT_MS = 60 * 60 * 1000;

/** An hour before Group A's week 3 session ended, less a day, as the term's own answers are sent. */
const SENT_BEFORE_SESSION_END_MS = 26 * 60 * 60 * 1000;

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
  const personOf = (key) => state.people.find((person) => person.key === key);
  const [ada, ben] = [personOf("ada"), personOf("ben")];
  if (!ada || !ben) throw new Error("The term has no Ada or no Ben.");
  const groupA = state.groups.find((group) => group.key === "A");
  if (!groupA) throw new Error("The term has no Group A.");

  const weekId = weekDocId(LOOP_WEEK);
  const answerId = courseworkItemId(LOOP_WEEK, "wa");
  const sent = new Date(sessionOf(groupA, LOOP_WEEK).endsAt.getTime() - SENT_BEFORE_SESSION_END_MS);

  // Ben's written answer, sent, in the shape the term writes Ada's.
  await fixtureDoc("courseExerciseResponses", `${state.runId}__${ben.uid}__${weekId}__${answerId}`).set({
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    uid: ben.uid,
    weekId,
    weekNumber: LOOP_WEEK,
    exerciseId: answerId,
    responseType: "text",
    text: BEN_ANSWER,
    // Counted as Worksheets count words (`countWords`), restated for one plain sentence.
    words: BEN_ANSWER.trim().split(/\s+/).length,
    firstSentAt: sent,
    submittedAt: sent,
    reviewStatus: "unreviewed",
    updatedAt: sent,
  });

  // Ada's and Ben's week 3, submitted after their answers were sent, as Submit stores it.
  const submitted = new Date(sent.getTime() + SUBMITTED_AFTER_SENT_MS);
  for (const person of [ada, ben]) {
    await fixtureDoc("courseWeekWork", `${state.runId}__${person.uid}__${weekId}`).set({
      e2eTermRunId: state.termRunId,
      runId: state.runId,
      uid: person.uid,
      weekId,
      weekNumber: LOOP_WEEK,
      submittedAt: submitted,
      firstSubmittedAt: submitted,
      submitCount: 1,
      updatedAt: submitted,
    });
  }
  // The runner writes what this returns as the spec's state.
  return state;
}

/**
 * What the loop's routes write, each row with the run's id on it:
 *  - saving feedback (`/api/courses/runs/[runId]/feedback`): one
 *    `courseFeedback` row a piece, stamped by the batch once emailed;
 *  - the test and the batch (`.../feedback/send/test`, `.../feedback/send`):
 *    `courseFeedbackSends`, the test's record and the press's own row (and
 *    the press's hold on the run, let go when the press ends); their emails
 *    are in the send log, about the run, which the term counts;
 *  - a rating for the team (`/api/courses/runs/[runId]/work-ratings`): one
 *    `courseWorkRatings` row a rater and answer.
 * Opening an answer on the review page as its facilitator may lock the week
 * (`courseWeekWork`, `courseWorkLog`), which the term counts by the run.
 */
async function countLoop(state) {
  const courseFeedback = (await fixtureQuery("courseFeedback").where("runId", "==", state.runId).get()).size;
  const courseFeedbackSends = (await fixtureQuery("courseFeedbackSends").where("runId", "==", state.runId).get()).size;
  const courseWorkRatings = (await fixtureQuery("courseWorkRatings").where("runId", "==", state.runId).get()).size;
  return { courseFeedback, courseFeedbackSends, courseWorkRatings };
}

async function teardown(state) {
  await deleteQuery(fixtureQuery("courseFeedback").where("runId", "==", state.runId));
  await deleteQuery(fixtureQuery("courseFeedbackSends").where("runId", "==", state.runId));
  await deleteQuery(fixtureQuery("courseWorkRatings").where("runId", "==", state.runId));
  // The runner reads the manifest this returns, and calls the fixture clean
  // only when its total is zero: the term's own, plus what is left of the
  // three collections above, counted again after the deletes.
  const term = await teardownTerm(state);
  const left = await countLoop(state);
  return {
    ...term,
    ...left,
    total: term.total + left.courseFeedback + left.courseFeedbackSends + left.courseWorkRatings,
  };
}

export const SPEC = {
  name: "course-hub-work-loop",
  specFile: "tests/e2e/course-hub-work-loop.spec.mjs",
  steps: WORK_LOOP_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view, the rating and the
  // batch are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  // The batch's test goes to the admin's own address, and the spec reads both people's emails.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/runs/[runId]/feedback",
      "/api/courses/runs/[runId]/feedback/send",
      "/api/courses/runs/[runId]/feedback/send/test",
      "/api/courses/runs/[runId]/work-ratings",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/[runId]/group/[groupId]/written",
      "/(app)/learn/[runId]/weeks/[n]",
      "/(app)/learn/[runId]/weeks/[n]/feedback",
    ],
  },
  /**
   * VERIFIED on 2 November 2026: in local mode, against the harness's own
   * server with its mail caught by Mailpit
   * (`npm run e2e:browser -- --local --spec course-hub-work-loop`), on dev at
   * b457d82c45957f14f25ca642acf6fe18ba1f7efc: all ten steps ran, twice in a
   * row; before teardown the term held 51 rows (six of them the send log's:
   * three approvals, the test and the batch's two) and the loop five more (two
   * pieces of feedback, the test's and the batch's records and one rating),
   * and the fixture manifest read zero after each run.
   */
  status: "verified",
  seed,
  countRows: async (state) => {
    const term = await countTerm(state);
    const loop = await countLoop(state);
    // The total counts the loop's rows too, not the term's alone.
    return { ...term, ...loop, total: term.total + loop.courseFeedback + loop.courseFeedbackSends + loop.courseWorkRatings };
  },
  teardown,
};
