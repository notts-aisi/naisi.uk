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
 * ## The term is the one Messages writes to
 *
 * Messages' tags are the current term's: the form whose decision day went
 * out most recently. On the harness's own emulator the fixture's form is the
 * only one, so it is that term.
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
import { countTerms, seedTerms, teardownTerms } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const MESSAGES_STEPS = [
  "the admin names the running course run on the programme's Settings tab, so its people have a tag",
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
  seed: ({ runId, suppress, onState }) => seedTerms({ runId, suppress, onState, points: ["week-three"] }),
  countRows: countTerms,
  teardown: teardownTerms,
};
