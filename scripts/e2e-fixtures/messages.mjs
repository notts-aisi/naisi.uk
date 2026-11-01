/**
 * Messages' browser spec: one message, written in Messages, from a test to
 * the send.
 *
 * The term T1 stands on (`./worlds/course-hub-term.mjs`), at its second
 * point, "week-three": Publish told everybody their group before the run
 * began, so Ada and Ben are in Group A and Cleo in Group B, and all three
 * hold a place on the programme. The spec (`tests/e2e/messages.spec.mjs`) has
 * the admin name the running run on the programme's Settings tab (so the
 * programme and its groups have tags in the picker), open Messages from the
 * programme's Messages tab, set to its people, send themselves a test, then
 * send it: one notice each to the three, the update kept on the programme's
 * page as well, and a record of the send that names no address.
 *
 * ## The term is the one Messages writes to, and the seed makes it so
 *
 * Messages' tags are the current term's: the opened form whose decision day
 * went out most recently (`chooseTerm` in src/lib/surveys/term/choose.ts).
 * A run seeds every spec's world before the first spec runs, and every term
 * world dates its decision day two days before the moment it describes, so a
 * world three weeks in is the oldest of them and never the term while another
 * world is on the server. So the seed stamps this form's decision day later
 * than every other decided form's (`makeTheTerm`), whatever else the run has
 * seeded or will. It stamps only where the run's mail is caught, on the
 * harness's own server: the runner seeds this spec nowhere else, and on a
 * shared project the stamp would change what every member's picker reads.
 * The spec checks first that the picker reads this term and offers the
 * programme's people, and says why when it does not.
 *
 * ## Every grant is the admin's, on a real page
 *
 * The fixture makes waiting accounts and nothing above them, and the three
 * people never sign in: they are written to. The admin names the run on the
 * programme's Settings tab, as every spec on this term does.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * "Send a test to me" emails the admin's own address, which the harness does
 * not own, and the spec reads every email the send makes. So it declares
 * `requiresCaughtMail`, and the runner skips it anywhere else.
 */
import { fixtureDoc, fixtureQuery } from "./core.mjs";
import { countTerms, seedTerms, teardownTerms } from "./worlds/course-hub-term.mjs";

/** A stored moment as milliseconds, or null for anything that is not one. */
function millisOf(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value.toMillis === "function") return value.toMillis();
  return null;
}

/**
 * Make the fixture's form the current term without doubt: its decision day
 * becomes later than every other decided form's on the server (a form whose
 * decision day is still to come is not decided, and competes with nothing),
 * and never later than now, or it would not be decided either. Refused where
 * the run's mail is not caught (see the header).
 */
async function makeTheTerm(state, { suppress }) {
  if (suppress !== false) {
    throw new Error(
      "REFUSING to make a fixture form the current term on a server whose mail is not caught: " +
        "on a shared project every member's picker would read it. This spec runs only where the mail is caught.",
    );
  }
  const [term] = state.terms;
  const now = Date.now();
  let latest = 0;
  for (const doc of (await fixtureQuery("admissionRounds").get()).docs) {
    if (doc.id === term.formId) continue;
    const at = millisOf(doc.data()?.decisionsSentAt);
    if (at !== null && at <= now && at > latest) latest = at;
  }
  await fixtureDoc("admissionRounds", term.formId).update({ decisionsSentAt: new Date(Math.max(now, latest + 1)) });
}

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const MESSAGES_STEPS = [
  "the picker reads this term, and offers the admin the programme's people",
  "the admin names the running course run on the programme's Settings tab, so its groups have tags and a message can be kept on its page",
  "the programme's Messages tab opens Messages set to its people, as a programme notice, with the post switch on",
  "the send waits for a test, and the test reaches the admin alone, marked as one",
  "the send goes to the number on its button: one notice each, and nobody else",
  "the message is kept on the programme's page too, and the send's record names no address",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the admin drives takes a token.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "messages",
  specFile: "tests/e2e/messages.spec.mjs",
  steps: MESSAGES_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // The Settings tab and Messages for a whole programme are an admin's here.
  // The account is one the harness is given; it can never make one.
  needs: { admin: true },
  // The test goes to the admin's own address, and the spec reads each person's notice.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/audience",
      "/api/audience/who",
      "/api/messages",
      "/api/messages/test",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/messages",
      "/(app)/messages",
    ],
  },
  /**
   * Written beside the code it drives and not yet run end to end: it counts
   * nothing on the coverage map until a run against the harness's server,
   * with its mail caught, has passed and read zero rows afterwards.
   */
  status: "unverified",
  seed: async ({ runId, suppress, onState }) => {
    // The spec presses Send a test as the admin, so the test's rows are this fixture's.
    const state = await seedTerms({ runId, suppress, onState, points: ["week-three"], adminTests: true });
    await makeTheTerm(state, { suppress });
    return state;
  },
  countRows: countTerms,
  teardown: teardownTerms,
};
