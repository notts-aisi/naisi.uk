/**
 * The course hub's browser spec for a programme's end: its last week, who
 * finished, certificates, and the pages people read once it is over.
 *
 * The term the earlier course hub specs stand on (`./worlds/course-hub-term.mjs`),
 * at two points at once, each a term of its own:
 *
 *  - "last-week": the fellowship in its last week, its one group's last
 *    session tonight, Ada in it and every register before it finished. The
 *    admin names the run, appoints Fern to the group, and makes and sends
 *    the survey at the end on the real pages; Ada's Home then says tonight
 *    is the last session and shows the survey at the end.
 *  - "programme-over": a fellowship past its run's last session, every
 *    register finished: Ada and Dan in Group A, Cleo and Eve in Group B, and
 *    Dan left in week 3. The admin, as the programme's lead, sets the rule for
 *    who finished on Settings, ticks one more person on the Overview, sends a
 *    test certificate to themselves and then the certificates. Ada reads that
 *    she finished, her certificate and what she keeps, turns its link on and
 *    downloads its PDF; a stranger opens its page; Cleo reads that the
 *    programme has ended, and Dan the page that says he left.
 *
 * The spec is `tests/e2e/course-hub-programme-end.spec.mjs`.
 *
 * ## Every grant is the admin's, on a real page
 *
 * The fixture makes waiting accounts and nothing above them. The admin
 * approves everybody who signs in or is sent a certificate on Approvals,
 * names each run on its programme's Settings tab and appoints Fern on the
 * Facilitators view. The programme's lead is the admin (as at every course
 * hub spec: a lead must be SU-recognised committee, which the harness never
 * makes), and nobody is named lead.
 *
 * ## It reads its own mail, so it runs only where the mail is caught
 *
 * The survey's test and the certificates' test go to the admin's own address,
 * which the harness does not own, and the certificate emails are read word
 * for word out of each person's mailbox. So the spec declares
 * `requiresCaughtMail`: the runner skips it, saying why, anywhere but a server
 * it started with its mail forced into Mailpit.
 */
import { countTerms, seedTerms, teardownTerms } from "./worlds/course-hub-term.mjs";

/**
 * Every step the spec must complete, in order. Shared rather than restated:
 * the spec records what it finished and the runner checks it against this.
 */
export const PROGRAMME_END_STEPS = [
  "the admin approves everybody who signs in or is sent a certificate on this journey",
  "in the last week, the admin names the run and appoints its group's facilitator",
  "the admin makes the survey at the end from its template, tests it on themselves and emails it to the person holding a place",
  "on the day of the last session, Home says tonight is the last session and shows the survey at the end",
  "after the last session, the admin names the run, sets the rule for who finished on Settings and appoints Group A's facilitator",
  "the Overview lists who finished by the rule, the one who left apart, and a switch the lead turns keeps the counts and the list agreeing",
  "Send a test to me emails the lead the first certificate's email, marked as a test, and unlocks the send",
  "the send emails each person who finished and the group's facilitator once, as the button's counts said",
  "a person who finished reads that they finished, their certificate and what they keep on their programme page",
  "the owner turns the certificate's link on, and downloads its PDF",
  "a stranger sees only what the certificate says, cannot download it, and a link that is off shows nothing",
  "a person who did not finish reads that the programme has ended, and is told nothing about finishing and sent nothing",
  "somebody who left reads only that they left, and nothing of the programme's end",
  "every email went to the send log, and none carries the meeting link",
];

/**
 * NOTHING ON THIS JOURNEY IS reCAPTCHA-GATED, so the list is empty. Sign-in
 * is a password, and none of the routes the people or the admin drive takes a
 * token. The spec keeps the shared skip wiring so a press that grows a gate
 * later is one line from being declared.
 */
export const RECAPTCHA_DEPENDENT_STEPS = [];

export const SPEC = {
  name: "course-hub-programme-end",
  specFile: "tests/e2e/course-hub-programme-end.spec.mjs",
  steps: PROGRAMME_END_STEPS,
  recaptchaDependentSteps: RECAPTCHA_DEPENDENT_STEPS,
  // Approvals, the Settings tab, the Facilitators view, New survey, the
  // Overview and its certificates are an admin's here. The account is one the
  // harness is given; it can never make one.
  needs: { admin: true },
  // The two tests go to the admin's own address, and every certificate email
  // is read out of its owner's mailbox.
  requiresCaughtMail: true,
  /**
   * What a green run drives, as src/app keys. `/api/courses/runs/[runId]/sync-tasks`
   * is reached and deliberately absent: Home and a programme page call it on
   * their own and nothing here reads what it answers. The rows it could
   * write are still counted.
   *
   * The survey pages and routes this journey passes through on its way to
   * the survey at the end (New survey, a survey's Questions and Send tabs,
   * its test and its send, and a person's own link) are left out too: the
   * before survey's spec drives every one of them, and claims them, so the
   * two specs' coverage moves never wait on each other.
   */
  covers: {
    routes: [
      "/api/auth/session",
      "/api/admin/application-emails/send",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/run",
      "/api/courses/runs/[runId]/facilitators",
      "/api/courses/groups/[groupId]/facilitators",
      "/api/courses/me",
      "/api/courses/runs/[runId]/overview",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing/rule",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/finishing",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/certificates/test",
      "/api/admissions/forms/[roundId]/programmes/[programmeId]/certificates",
      "/api/courses/certificates/[code]",
      "/api/courses/certificates/[code]/pdf",
    ],
    pages: [
      "/(auth)/login",
      "/(app)/admin/(admin-only)",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/setup",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/groups/facilitators",
      "/(app)/dashboard",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview",
      "/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/overview/certificates",
      "/(app)/learn/[runId]",
      "/(public)/c/[code]",
    ],
  },
  /**
   * VERIFIED on 2026-10-27: against the harness's loopback server on a laptop
   * (beside the other course hub specs), then in the pull request's end-to-end
   * job (run 40463302981; the first run reached the job's old 45-minute limit
   * before it finished): all fourteen steps ran, 102 rows existed before
   * teardown (2 forms and their question sets, 5 applications and 5 decisions,
   * 2 courses and their runs with 12 weeks, 3 groups, 7 enrolments, 1 nudge, 1
   * task, 5 cohort subscriptions, 17 attendance marks, 2 updates, 2 records of
   * who finished, 3 certificates, 1 survey with its 1 person and 2 counters, 13
   * rows of the send log, and 7 accounts with their sign-ins), and the fixture
   * manifest read zero after it.
   */
  status: "verified",
  seed: ({ runId, suppress, onState }) =>
    seedTerms({ runId, suppress, onState, points: ["last-week", "programme-over"] }),
  countRows: countTerms,
  teardown: teardownTerms,
};
