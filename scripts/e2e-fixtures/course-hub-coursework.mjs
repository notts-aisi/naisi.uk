/**
 * The course hub's browser spec for reading coursework: the Coursework tab, a
 * person's page, and a group's reflections read with names.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its coursework point: three weeks into a running run whose weeks are
 * written as blocks, Publish having told Ada and Ben their place in Group A and
 * Cleo hers in Group B, and Dan holding a place in no group. Ada has written
 * two reflections, ticked a source with a private note on it and sent her
 * week 3 written answer; Cleo has written one reflection and, here alone, sent
 * her week 3 written answer (`cleoSendsHerAnswer`); Dan has written his
 * week 1 reflections and ticked a week 1 source before any group.
 *
 * The spec (`tests/e2e/course-hub-coursework.spec.mjs`) is the programme's
 * lead (the admin, as at most course hub specs: a lead must be SU-recognised
 * committee, which only an admin makes, on the real pages) reading the Coursework tab and
 * two people's weeks in the reading view, writing feedback on one week there
 * and reading it back, then Fern, appointed to Group A on the real page,
 * reading the group's reflections with names and the page to read lines out,
 * which still names nobody, then opening Ada's week from the group's page,
 * the reading view on the group's side, and writing feedback on her answer
 * there, which the lead reads beside it. Both read one question across the
 * group too: an answer not read yet, read once opened, the answers with no
 * feedback yet, feedback written from that page, and the switch between the
 * two ways of reading a week. Then the lead's filters on the Coursework tab,
 * feedback written on Cleo's answer from the tab's list of what waits for
 * feedback, and Ada, signed in, changing her written answer, which comes back
 * on that list and on Fern's card as changed since feedback.
 *
 * WHAT IT CANNOT PROVE: that the programme's lead, when the lead is not an
 * admin, is never shown a private note or a placement Publish has not told.
 * This spec signs in no lead who is not an admin.
 * `tests/course-hub-coursework.test.mjs` drives both pages as a lead who is
 * not one, and holds both; `course-hub-explainers-and-lead-notes` signs one
 * in, made a lead by the admin on the real pages, for the notes column on a
 * person's page.
 *
 * ## Every grant is made on a real page, by the admin the harness is given
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves Fern and the two people of Group A on Approvals, names the running
 * run on the programme's Settings tab, and appoints Fern to Group A on the
 * Groups tab's Facilitators view.
 *
 * ## It reads no mail
 *
 * Nothing it drives sends an email but the approvals, which go to addresses
 * the fixture suppressed first: saving feedback emails nobody (an admin's
 * batch does, which the spec never presses), and nor does changing a written
 * answer. So it runs wherever the harness runs, against a deployed target too.
 *
 * ## What its feedback and its reading leave behind
 *
 * Saving a piece writes one `courseFeedback` row with the run's id on it, and
 * a piece on a written answer stamps the person's week record
 * (`courseWeekWork`), which the term counts and drains by the run. The pieces
 * are counted and deleted here, beside the term's own rows. Opening a
 * person's week or one question across the group keeps on the same record
 * when each answer shown was first read (`firstReadAt`, never who), so it
 * makes or changes only `courseWeekWork` rows, which the term drains too.
 */
import { deleteQuery, fixtureDoc, fixtureQuery, readTimesKeptSince } from "./core.mjs";
import { COURSEWORK, countTerm, courseworkItemId, seedTerm, teardownTerm, weekDocId } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const COURSEWORK_STEPS = [
  "the admin approves the facilitator and the two people of the group they will facilitate",
  "the admin names the running course run on the programme's Settings tab",
  "the admin appoints the facilitator to Group A on the Facilitators view",
  "the lead opens the Coursework tab: everybody in their group, the person in no group last, and each cell in words",
  "the lead opens the person in no group: their week 1 reflections under their prompts",
  "the lead opens one question across the group from a person's week: an answer not read yet, then read once opened",
  "the facilitator opens the written answer across the group: not read yet, no feedback yet, the person's week and back, and read",
  "the lead opens a fellow's page: reflections with when, the answer waiting for feedback, and as an admin the private note",
  "the lead writes feedback on a fellow's week in the reading view, and reads it back",
  "the lead keeps, with the filters, the people with something not read yet and the people with no feedback yet",
  "the lead opens an answer from the waiting list, writes feedback on it, and finds it gone from the list",
  "the lead reads the group's reflections with each writer's name",
  "the facilitator reads the group's reflections with names, and never a private note",
  "the facilitator's page to read lines out still names nobody beside an answer",
  "the facilitator opens a person's week from the group page, reads it with the private note and no rating, and writes feedback there",
  "the lead reads the facilitator's feedback beside the answer on the programme's side",
  "the lead writes feedback from the page of one question and reads it back, then switches to the person's week and back",
  "the person changes the written answer the lead and the facilitator gave feedback on",
  "the lead finds it back on the waiting list as changed since feedback, and so does the facilitator's card",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin or the facilitator drives
 * takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/**
 * THE SITE KEEPING READ TIMES BEFORE THE ANSWERS THE SPEC READS AS "NOT READ
 * YET" (Ada's second reflection of week 3, which the lead opens, and her
 * written answer, which the facilitator opens). An answer that became readable
 * before the site began keeping read times (`config/firstReadTimes`) is
 * neither read nor unread. So the fixture makes sure the site has begun,
 * days before the term's first week where it has not (the document is made
 * only where missing and never moved), and where it began after those two
 * answers were saved (a database where it began recently), moves each to that
 * instant, the answer's send with it. Her first reflection, whose time other
 * steps read, is left as the term writes it.
 */
async function savedSinceReadTimesAreKept(state) {
  const before = new Date(Date.now() - (COURSEWORK.daysIn + 3) * 24 * 60 * 60 * 1000);
  const keptSince = await readTimesKeptSince(before);
  const ada = state.people.find((person) => person.key === "ada");
  for (const key of ["rp2", "wa"]) {
    const ref = fixtureDoc("courseExerciseResponses", `${state.runId}__${ada.uid}__${weekDocId(3)}__${courseworkItemId(3, key)}`);
    const stored = (await ref.get()).data();
    const at = stored?.updatedAt?.toDate?.() ?? null;
    if (!stored || (at && at.getTime() >= keptSince.getTime())) continue;
    await ref.set(key === "wa" ? { updatedAt: keptSince, firstSentAt: keptSince, submittedAt: keptSince } : { updatedAt: keptSince }, { merge: true });
  }
}

/**
 * CLEO'S WEEK 3 WRITTEN ANSWER, SENT, a minute after Ada's: the second answer
 * on the lead's list of what waits for feedback, which the lead opens from the
 * list, gives feedback on and sees go, while Ada's waits for her facilitator.
 * Written beside the term's own rows, with the run's id on it, so the term's
 * teardown drains it. Its time is told from Ada's as stored, after the step
 * above may have moved it, so it is saved since read times are kept too.
 */
export const CLEO_ANSWER = "The harbour board, since it already keeps the buoys.";

async function cleoSendsHerAnswer(state) {
  const [ada, cleo] = ["ada", "cleo"].map((key) => state.people.find((person) => person.key === key));
  const answerId = courseworkItemId(3, "wa");
  const adas = (await fixtureDoc("courseExerciseResponses", `${state.runId}__${ada.uid}__${weekDocId(3)}__${answerId}`).get()).data();
  const adaAt = adas?.firstSentAt?.toDate?.() ?? adas?.updatedAt?.toDate?.() ?? new Date();
  const at = new Date(adaAt.getTime() + 60_000);
  await fixtureDoc("courseExerciseResponses", `${state.runId}__${cleo.uid}__${weekDocId(3)}__${answerId}`).set({
    e2eTermRunId: state.termRunId,
    runId: state.runId,
    uid: cleo.uid,
    weekId: weekDocId(3),
    weekNumber: 3,
    exerciseId: answerId,
    responseType: "text",
    text: CLEO_ANSWER,
    words: CLEO_ANSWER.trim().split(/\s+/).length,
    firstSentAt: at,
    submittedAt: at,
    reviewStatus: "unreviewed",
    updatedAt: at,
  });
}

/** The pieces of feedback the spec saves, each with the run's id on it. */
async function countFeedback(state) {
  return (await fixtureQuery("courseFeedback").where("runId", "==", state.runId).get()).size;
}

async function teardown(state) {
  await deleteQuery(fixtureQuery("courseFeedback").where("runId", "==", state.runId));
  // The runner calls the fixture clean only when the total is zero: the term's own, plus the pieces counted again.
  const term = await teardownTerm(state);
  const courseFeedback = await countFeedback(state);
  return { ...term, courseFeedback, total: term.total + courseFeedback };
}

export const SPEC = {
  name: "course-hub-coursework",
  specFile: "tests/e2e/course-hub-coursework.spec.mjs",
  steps: COURSEWORK_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view and the lead's tabs
  // are an admin's here. The account is one the harness is given; it can
  // never make one.
  needs: { admin: true },
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/runs/[runId]/feedback",
      "/api/courses/runs/[runId]/first-read",
      "/api/courses/runs/[runId]/written-answers/[answerId]",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/reflections",
      "/(app)/learn/[runId]/group/[groupId]/reflections/names",
      "/(app)/learn/[runId]/group/[groupId]/reflections",
      "/(app)/learn/[runId]/group/[groupId]",
      "/(app)/learn/[runId]/group/[groupId]/coursework/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/question",
      "/(app)/learn/[runId]/group/[groupId]/question",
      "/(app)/learn/[runId]/weeks/[n]",
    ],
  },
  /**
   * VERIFIED on 30 October 2026: in the pull request's end-to-end job
   * (run 40996453948): all nine steps ran, 90 rows existed before teardown,
   * and the fixture manifest read zero after it. The reading view's steps
   * (the person pages read one week at a time, two pieces of feedback written
   * and read back, the group's side) were added on 13 November 2026: run on a
   * laptop against a production build of the branch (`--local`), all twelve
   * steps ran, 49 rows existed before teardown (two pieces of feedback among
   * them), and the fixture manifest read zero after it. The pull request's
   * end-to-end job runs them again. The steps reading one question across the
   * group (the lead and the facilitator: not read yet, then read; no feedback
   * yet; feedback written from that page; the switch both ways) were added on
   * 13 November 2026 and run the same way: all fifteen steps ran, 50 rows
   * existed before teardown (one week record holding when answers were first
   * read among them), and the fixture manifest read zero after it. The steps
   * reading the Coursework tab in words (its filters, feedback written from its
   * list of what waits, and an answer changed since feedback coming back on the
   * list and on the facilitator's card) were added on 13 November 2026 and
   * have not yet run in a browser: the pull request's end-to-end job runs them
   * first.
   */
  status: "verified",
  seed: async ({ runId, suppress, onState }) => {
    const state = await seedTerm({ runId, suppress, onState, point: "coursework" });
    await savedSinceReadTimesAreKept(state);
    await cleoSendsHerAnswer(state);
    return state;
  },
  countRows: async (state) => {
    const term = await countTerm(state);
    const courseFeedback = await countFeedback(state);
    // The total counts the pieces of feedback too, not the term's rows alone.
    return { ...term, courseFeedback, total: term.total + courseFeedback };
  },
  teardown,
};
