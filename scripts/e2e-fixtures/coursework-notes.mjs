/**
 * Notes the team keeps about a person, and Claude's draft of one (privacy v13
 * and v15), in a real browser.
 *
 * The term T1 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": the people hold their places, Publish told them their
 * groups, and the run is three weeks in. On top of it this fixture writes:
 *
 *  - WEEK 3 AS BLOCKS: one part with one reflection prompt, so the week has
 *    a question coursework can answer.
 *  - ADA'S REFLECTION to it, first written AFTER her account agreed to
 *    privacy v13 (every fixture account agrees to the current version when it
 *    is seeded, and the moment her coursework counts from is that agreement:
 *    `courseworkCountsFrom` in src/lib/legal/courseworkUse.ts), so it is
 *    writing Claude may be sent. Every word of it is made up.
 *  - A NOTE ABOUT ADA WRITTEN BEFORE THAT AGREEMENT (a day before the seed),
 *    by the harness's admin, from no programme: the profile shows it marked,
 *    and the application screen leaves it out and says so. Written before
 *    Ada agreed to privacy v15 as well (the seed's agreement is to v15), it
 *    says admins only read it, and can never be kept for leads.
 *
 * The spec (`tests/e2e/coursework-notes.spec.mjs`) is the harness's admin,
 * who approves Ada, keeps and changes and deletes notes about her on her
 * profile, choosing who reads each one, keeps one for the programme's leads
 * with a suggestion for next term and then keeps it to admins, meets
 * Claude's draft (the calm sentence where Claude is not set up, one press
 * against a deployed target that has a key), and reads the notes beside her
 * application. Then the Coursework tab's panels, an admin's
 * alone since privacy v15: the admin names the running run on the
 * programme's Settings tab (the fixture never does), reads Claude's best
 * answers to week 3 under the tab and Pangram's count before any press, and
 * opens Ada's page, where the column beside her weeks holds the notes written
 * from this run, Claude's draft from it and Pangram, which has nothing of hers
 * to send: her one answer is under 50 words. Nothing on the tab or her page
 * is pressed, so neither Claude nor Pangram is sent a word.
 *
 * ## What it cannot drive, and where that is held instead
 *
 * Nobody leads the programme at this point of the term, and the harness
 * cannot make a lead who is not an admin: a lead must be SU-recognised
 * committee, and the harness grants nothing above a waiting account (an admin
 * it needs is an account it is given), so an admin named as the lead would be
 * answered as an admin. So the lead's side of the notes (reading only the
 * notes kept for leads about the people on their programme, never how many
 * others there are, adding their own, changing only those), "the lead is
 * refused the admins' notes routes and Claude's draft", "the lead is drawn no
 * panel under the tab and refused Claude's best answers" and "the lead never
 * sees Pangram" are held by the persona battery against a real build
 * (`tests/persona-route-gates.registry.mjs`, the `lead` persona on the
 * programme's notes routes, the admins' notes routes, best answers and
 * Pangram), by `tests/course-hub-coursework.test.mjs` (both pages drawn for
 * the lead), by `tests/notes-for-leads.test.mjs` and by
 * `tests/coursework-claude.test.mjs`, not here.
 *
 * ## It sends nothing
 *
 * Approving an account would email it, and every fixture address is
 * suppressed, so nothing leaves; the spec reads no mail and does not need
 * mail caught. A note sends nothing.
 */
import { deleteQuery, fixtureDoc, fixtureQuery, fixtureSubcollection } from "./core.mjs";
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/** Every step the spec must complete, in order. */
export const COURSEWORK_NOTES_STEPS = [
  "the admin approves the account the notes are about",
  "the profile shows the notes the team keeps, with its rule, and marks the note written before the agreement as read by admins only",
  "the admin adds a note, changes its words and deletes it, and the record agrees each time",
  "the admin keeps a note for the programme's leads with a suggestion for next term, then keeps it to admins, and the record agrees each time",
  "the admin keeps a note for the application screen",
  "Claude's draft: the calm sentence where Claude is not set up, or one press answered with a draft or a reason",
  "beside the application only the note written after the agreement shows, with its rule and the count of earlier notes",
  "the admin names the running course run on the programme's Settings tab",
  "under the Coursework tab, Claude's best answers to week 3, an admin's alone, and Pangram's count before any press, with nothing pressed",
  "beside Ada's weeks on her coursework page: the notes written from this run, Claude's draft from it, and Pangram with nothing of hers to send",
];

/** Nothing here is reCAPTCHA-gated: sign-in is a password. */
export const RECAPTCHA_DEPENDENT_STEPS = [];

/** Week 3's one question, and Ada's answer to it. Made up. */
export const COURSEWORK = Object.freeze({
  weekId: "w03",
  weekNumber: 3,
  partId: "e2ecwpart",
  stopId: "e2ecwstop",
  promptId: "e2ecwprompt",
  prompt: "What surprised you most in this week's reading?",
  answer:
    "That the lamp keepers kept such careful logs. I had assumed safety came from the lamp itself, " +
    "but the reading made me think the record of near misses was what kept the light funded.",
});

/** The note written before Ada agreed, from no programme. */
export const EARLIER_NOTE = "Earlier note, written before the agreement: quiet in the first session.";

const DAY_MS = 86_400_000;

/** The first person of the term: the one the notes are about. */
const subjectOf = (state) => state.people[0];

async function seed({ runId, suppress, onState }) {
  let state = null;
  await seedTerm({
    runId,
    suppress,
    point: "week-three",
    onState: (published) => {
      state = published;
      onState?.(published);
    },
  });
  if (!state) throw new Error("The term published no state.");
  const subject = subjectOf(state);
  const now = new Date();

  // Week 3, written as blocks with one reflection prompt.
  await fixtureSubcollection("courseRuns", state.runId, "weeks").doc(COURSEWORK.weekId).set(
    {
      blocks: [
        {
          id: COURSEWORK.partId,
          type: "part",
          title: "The lamp keepers",
          time: "",
          framing: [],
          blocks: [{ id: COURSEWORK.stopId, type: "reflection", prompts: [{ id: COURSEWORK.promptId, text: COURSEWORK.prompt }] }],
        },
      ],
    },
    { merge: true },
  );

  // Ada's reflection, first written after her account agreed to the policy.
  await fixtureDoc(
    "courseExerciseResponses",
    `${state.runId}__${subject.uid}__${COURSEWORK.weekId}__${COURSEWORK.promptId}`,
  ).set({
    runId: state.runId,
    uid: subject.uid,
    weekId: COURSEWORK.weekId,
    weekNumber: COURSEWORK.weekNumber,
    exerciseId: COURSEWORK.promptId,
    kind: "reflection",
    responseType: "text",
    text: COURSEWORK.answer,
    submittedAt: null,
    reviewStatus: "unreviewed",
    updatedAt: now,
    firstWrittenAt: new Date(now.getTime() + 1_000),
  });

  // The note written before she agreed.
  await fixtureDoc("memberNotes", `e2e-cw-earlier-${runId}`).set({
    uid: subject.uid,
    text: EARLIER_NOTE,
    authorUid: state.adminUid ?? "e2e-note-record",
    draftedByClaude: false,
    runId: null,
    programmeLabel: "",
    createdAt: new Date(now.getTime() - DAY_MS),
    updatedAt: new Date(now.getTime() - DAY_MS),
  });

  // The runner writes what this returns as the spec's state; nothing returned
  // means the spec finds no term and skips itself.
  return state;
}

/** The notes about the term's people, and what Claude and Pangram keep on its run. */
async function countCoursework(state) {
  let memberNotes = 0;
  for (const person of state.people ?? []) {
    memberNotes += (await fixtureQuery("memberNotes").where("uid", "==", person.uid).get()).size;
  }
  const courseBestAnswers = (await fixtureQuery("courseBestAnswers").where("runId", "==", state.runId).get()).size;
  const coursePangramChecks = (await fixtureQuery("coursePangramChecks").where("runId", "==", state.runId).get()).size;
  return { memberNotes, courseBestAnswers, coursePangramChecks };
}

async function teardown(state) {
  // Before the term's own teardown, which deletes the accounts the notes name.
  for (const person of state.people ?? []) {
    await deleteQuery(fixtureQuery("memberNotes").where("uid", "==", person.uid));
  }
  await deleteQuery(fixtureQuery("courseBestAnswers").where("runId", "==", state.runId));
  await deleteQuery(fixtureQuery("coursePangramChecks").where("runId", "==", state.runId));
  // The runner reads the manifest this returns, and calls the fixture clean
  // only when its total is zero: the term's own, plus what is left of the
  // three collections above, counted again after the deletes.
  const term = await teardownTerm(state);
  const left = await countCoursework(state);
  return { ...term, ...left, total: term.total + left.memberNotes + left.courseBestAnswers + left.coursePangramChecks };
}

export const SPEC = {
  name: "coursework-notes",
  specFile: "tests/e2e/coursework-notes.spec.mjs",
  steps: COURSEWORK_NOTES_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approving an account, the profile and an application are an admin's.
  needs: { admin: true },
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/members/[uid]/notes",
      "/api/admin/members/[uid]/notes/[noteId]",
      "/api/admin/members/[uid]/notes/draft",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/best-answers",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/pangram",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]/pangram",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/(admin-only)/members/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/applications/[uid]",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/coursework/[uid]",
    ],
  },
  /**
   * VERIFIED on 30 October 2026: against dev.naisi.uk, in the end-to-end
   * workflow's dev job (run 41006846324): every step ran, the one press of
   * Claude's draft came back with a draft, 86 rows existed before teardown,
   * and the fixture manifest read zero after it. Its steps had passed in the
   * pull request's end-to-end job in local mode before that.
   */
  status: "verified",
  seed,
  countRows: async (state) => ({ ...(await countTerm(state)), ...(await countCoursework(state)) }),
  teardown,
};
