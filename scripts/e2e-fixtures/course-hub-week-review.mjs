/**
 * The course hub's browser spec for a week's review (privacy v15): an
 * admin's page under a week on the Weeks tab, where Claude may be asked for
 * draft grades, what people found hard and who might need a hand.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at its coursework point: three weeks into a running run whose weeks are
 * written as blocks, Ada and Ben in Group A, Cleo in Group B and Dan in no
 * group, with week 3's sessions of both groups over. On top of it this
 * fixture writes, for Ada and for Cleo: what each wrote in week 3 marked
 * first written a second after the seed, so after their accounts agreed to
 * the policy (every fixture account agrees to the current version, 15, when
 * it is seeded); their week 3 submitted under the old button a second after
 * that, which the review still reads (a week submitted under it is done once
 * its ticks are) and a note's draft does not (privacy v18: a note draws on a
 * week from its session on, as it stands); and a draft of a note about each,
 * as if Claude had drafted it that moment, built only from that week as it
 * stood. Ada wrote a written answer and a reflection, Cleo one reflection. Everything else the term wrote carries no first-written time
 * and is "not included yet".
 *
 * The spec (`tests/e2e/course-hub-week-review.spec.mjs`) is the harness's
 * admin, who approves Fern and Group A's two people, names the running run on
 * the programme's Settings tab and appoints Fern to Group A; finds Review
 * beside week 3 on the Weeks tab; reads the review page saying what would be
 * sent before any press and Pangram's count, with nothing pressed; reads who
 * might need a hand from the site's own records; asks Fern to have a word
 * with Ben, which makes one task with fixed words and no reason; presses
 * Review with Claude once (in local mode the harness's fake Claude answers
 * it, `scripts/e2e/lib/fakeClaude.mjs`) and reads the draft grades, the theme
 * and the hand that come back; opens the week's Notes beside its review,
 * where both drafts wait; saves Ada's to her notes with a suggestion for
 * next term; discards Cleo's, which leaves Cleo the one person to draft for;
 * presses Draft this week's notes once, which drafts Cleo's again through
 * Claude; reads next term's page, where the saved note suggests Ada for
 * facilitating; and Fern, signed in, finds the task on My Work.
 *
 * ## What it cannot drive, and where that is held instead
 *
 * The programme's lead's side of the review ("a week's review is for admins",
 * nothing of the week read) and of the week's notes (the saved notes kept for
 * leads, never a draft) is not driven here: this spec names no lead. It is
 * held by the persona battery against a real build
 * (`tests/persona-route-gates.registry.mjs`, the `lead` persona on the review
 * page and both routes), by `tests/week-review.test.mjs` and by
 * `tests/week-notes.test.mjs`. A lead who is not an admin is signed in by
 * `course-hub-explainers-and-lead-notes`, for the notes about a person.
 * Pangram is never pressed.
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
  "the review says what would be sent before any press, and offers Review with Claude, with nothing pressed",
  "who might need a hand, from the site's own records, each line saying where it came from",
  "the admin asks the facilitator to have a word with a person: one task, fixed words and no reason",
  "the admin presses Review with Claude once, and its draft grades, what people found hard and a hand come back",
  "the week's notes, beside its review: who has work to note, and a waiting draft built only from the week as it stood",
  "the admin saves the draft to the person's notes, in the admin's words, and the card says who saved it",
  "the admin discards a waiting draft, and its person is the one left to draft for",
  "the admin presses Draft this week's notes once, and a draft comes back for the one person without one",
  "next term's page shows the person the saved note suggests for facilitating",
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
  const personOf = (key) => {
    const person = state.people.find((each) => each.key === key);
    if (!person) throw new Error(`The term has no ${key}.`);
    return person;
  };
  const after = new Date(Date.now() + AFTER_AGREEMENT_MS);
  const submitted = new Date(Date.now() + SUBMITTED_AFTER_MS);
  // What each of the two wrote in week 3 that was first written after they
  // agreed, and what the seeded draft about them says it was built from.
  const writers = [
    { person: personOf("ada"), keys: ["wa", "rp1"], text: DRAFTED, built: { written: 1, reflections: 1 } },
    { person: personOf("cleo"), keys: ["rp1"], text: DRAFTED_TO_DISCARD, built: { written: 0, reflections: 1 } },
  ];
  for (const { person, keys, text, built } of writers) {
    for (const key of keys) {
      await fixtureDoc("courseExerciseResponses", `${state.runId}__${person.uid}__w03__${courseworkItemId(3, key)}`).set(
        { firstWrittenAt: after },
        { merge: true },
      );
    }
    // Their week 3 submitted after writing it, as Submit stores it.
    await fixtureDoc("courseWeekWork", `${state.runId}__${person.uid}__w03`).set({
      e2eTermRunId: state.termRunId,
      runId: state.runId,
      uid: person.uid,
      weekId: "w03",
      weekNumber: 3,
      submittedAt: submitted,
      firstSubmittedAt: submitted,
      submitCount: 1,
      updatedAt: submitted,
    });
    // A draft of a note about them from week 3, in the shape the draft route
    // keeps (src/lib/firestore/courseNoteDrafts.ts), built from their week as it stood when drafted.
    await fixtureDoc("courseNoteDrafts", `${state.runId}__w03__${person.uid}`).set({
      e2eTermRunId: state.termRunId,
      runId: state.runId,
      weekId: "w03",
      weekNumber: 3,
      uid: person.uid,
      text,
      builtFrom: [{ kind: "work", weekNumber: 3, submittedAt: null, asOf: submitted, ...built, boxes: 0 }],
      raters: {},
      sourceUids: [],
      fingerprint: "e2e-seeded",
      model: "e2e-seeded",
      at: submitted,
      askedByUid: "",
    });
  }
  return state;
}

/** Ada's week 3 is submitted two seconds after the seed: after her rows were first written. */
const SUBMITTED_AFTER_MS = 2_000;

/** The seeded draft's words, labels and all, as Claude's would come back. */
export const DRAFTED = "The fellow argues from the week's reading with care. Worth asking the fellow about facilitating.";

/** The words of the seeded draft about Cleo, which the admin discards. */
export const DRAFTED_TO_DISCARD = "The fellow answers the week's question in one short line.";

/** What the review keeps on the run, the follow-ups made from it, the drafts of notes and the notes saved from them. */
async function countReview(state) {
  const courseWeekReviews = (await fixtureQuery("courseWeekReviews").where("runId", "==", state.runId).get()).size;
  const reviewFollowUps = (
    await fixtureQuery("tasks").where("source", "==", "review-follow-up").where("sourceRef.cohortId", "==", state.runId).get()
  ).size;
  const courseNoteDrafts = (await fixtureQuery("courseNoteDrafts").where("runId", "==", state.runId).get()).size;
  // The notes saved from a draft are about the term's people, and keyed by the run they came from.
  const memberNotes = (await fixtureQuery("memberNotes").where("runId", "==", state.runId).get()).size;
  return { courseWeekReviews, reviewFollowUps, courseNoteDrafts, memberNotes };
}

async function teardown(state) {
  await deleteQuery(fixtureQuery("courseWeekReviews").where("runId", "==", state.runId));
  await deleteQuery(fixtureQuery("tasks").where("source", "==", "review-follow-up").where("sourceRef.cohortId", "==", state.runId));
  await deleteQuery(fixtureQuery("courseNoteDrafts").where("runId", "==", state.runId));
  await deleteQuery(fixtureQuery("memberNotes").where("runId", "==", state.runId));
  // The runner reads the manifest this returns, and calls the fixture clean
  // only when its total is zero: the term's own, plus what is left of the
  // four above, counted again after the deletes.
  const term = await teardownTerm(state);
  const left = await countReview(state);
  return {
    ...term,
    ...left,
    total: term.total + left.courseWeekReviews + left.reviewFollowUps + left.courseNoteDrafts + left.memberNotes,
  };
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
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/review/follow-up",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/notes/draft",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/notes/[uid]",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/weeks/[weekId]/notes/[uid]/save",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/review",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/weeks/[weekId]/notes",
      "/(app)/admin/admissions/forms/[roundId]/next-term",
      "/(app)/tasks",
    ],
  },
  /**
   * VERIFIED on Mon 2 November 2026: in local mode, against the harness's own
   * server (`npm run e2e:browser -- --local --spec course-hub-week-review`),
   * on dev b457d82c, with the two steps on the week's Notes (the seeded draft,
   * and saving it): all ten steps ran, the term's 48 rows existed before
   * teardown (the one follow-up task among them) beside the follow-up's record
   * and the one note saved, and the fixture manifest read zero after it.
   * Nothing was pressed that sends anything to Claude or Pangram: the local
   * server had no key for either. It had passed in the same mode on 1 November
   * 2026, before the Notes steps were added.
   *
   * Again the same day, in local mode with the harness's fake Claude
   * answering there: all ten steps ran, the fake was asked nothing, 48 rows
   * existed before teardown, and the manifest read zero after it.
   *
   * Again on Mon 2 November 2026, in local mode, with the presses that reach
   * Claude (Review with Claude, Draft this week's notes), the discarded draft
   * and next term's page added, on the fake Claude's branch at 98565f11 with
   * this spec's commits on it: all fourteen steps ran, the fake answered the
   * review's three asks and one note's draft, 49 rows existed before
   * teardown, and the manifest read zero after it. Twice, about 30 seconds
   * of spec each time.
   */
  status: "verified",
  seed,
  countRows: async (state) => ({ ...(await countTerm(state)), ...(await countReview(state)) }),
  teardown,
};
