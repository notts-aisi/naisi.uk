/**
 * The course hub's fourth browser spec: an incubator's pitching week and its
 * teams.
 *
 * The term T1 to T3 stand on (`./worlds/course-hub-term.mjs`), at its fourth
 * point, "pitching-week": the form's one programme is an incubator whose run
 * meets as one weekly group of five, three weeks in, Publish told everybody
 * their place before the start, and week 3 is pitching week, published, with
 * two readings and the run's pitching settings saved (a pick limit, the
 * smallest and largest team, the day the teams are made, and teams made from
 * the pitches). The spec (`tests/e2e/course-hub-incubator-pitching-and-teams.spec.mjs`)
 * is the week itself: three people pitch, one alone on a reading, one with a
 * partner on a paper typed in, one alone again; they read each other's
 * pitches and pick the ones they would join, up to the limit, and one more is
 * refused in the page's words; the lead reads how many would join each, makes
 * teams from the pitches on the Teams tab, moves the one person left over with
 * the Move to… menu, sends the team email's test to themselves, and tells
 * everyone their team with the count on the button. Each person's email names
 * their own team and nobody else's.
 *
 * ## Every grant is the admin's, on a real page
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves the five on Approvals and names the incubator's running run on the
 * programme's Settings tab; every press after that is the people's own or the
 * lead's. The programme's lead is the admin (as at T1 to T3: a lead must be
 * SU-recognised committee, which the harness never makes), and nobody is named
 * lead, so the pages and the email say what they say for a programme with no
 * lead.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * The test of the team email goes to the admin's own address, and each
 * person's email is read word for word out of their mailbox. So the spec
 * declares `requiresCaughtMail`, and the runner skips it anywhere but a
 * server it started with its mail forced into Mailpit.
 */
import { countTerm, seedTerm, teardownTerm } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const PITCHING_AND_TEAMS_STEPS = [
  "the admin approves the five people taking part in the incubator",
  "the admin names the incubator's running course run on the programme's Settings tab",
  "a member opens pitching week and pitches alone, on one of the week's readings",
  "a second member pitches with a partner from the group, on a paper typed in, and picks a pitch",
  "a third member pitches alone, reads both other pitches and picks up to the limit",
  "the first member picks a pitch, and the pitching read answers what each page drew and refuses the lead",
  "a member who did not pitch picks up to the limit, and one more is refused in the page's words",
  "the lead's Pitches view shows each pitch and how many would join, and names nobody who picked",
  "on the Teams tab the lead makes teams from the pitches",
  "the lead moves the person left without a team with the Move to… menu, never a drag",
  "the lead sends the team email's test to themselves, and it is the first person's email marked as a test",
  "the lead tells everyone their team, with the count on the button",
  "each person's email names their own team, word for word, and nobody else's, and no email carries the meeting link",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people or the lead drive takes a
 * token. The spec keeps the shared skip wiring so a press that grows a gate
 * later is one line from being declared.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-incubator-pitching-and-teams",
  specFile: "tests/e2e/course-hub-incubator-pitching-and-teams.spec.mjs",
  steps: PITCHING_AND_TEAMS_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Pitches view and the Teams tab are an
  // admin's here. The account is one the harness is given; it can never make
  // one.
  needs: { admin: true },
  // The test of the team email goes to the admin's own address, and every
  // person's email is read out of their mailbox.
  requiresCaughtMail: true,
  /** What a green run drives, as src/app keys. */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/pitching",
      "/api/courses/runs/[runId]/pitching/pitch",
      "/api/courses/runs/[runId]/pitching/picks",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/tell/test",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/teams/tell",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/learn/[runId]/pitching",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/pitches",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/teams",
    ],
  },
  /**
   * VERIFIED on 2026-10-25: against the harness's loopback server on a laptop
   * (alone, then beside the other three course hub specs), then in the pull
   * request's end-to-end job (run 40217771880), in its final form: all thirteen
   * steps ran, 58 rows existed before teardown (the form and its question set,
   * 5 applications and 5 decisions, the course, the run and its 3 published
   * weeks, 1 group, 5 enrolments, 5 cohort subscriptions, 2 registers, 1
   * update, 3 pitches, 2 teams, a send marker, 11 sends, 5 accounts and their
   * documents), and the manifest read zero afterwards.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) => seedTerm({ runId, suppress, onState, point: "pitching-week" }),
  countRows: countTerm,
  teardown: teardownTerm,
};
