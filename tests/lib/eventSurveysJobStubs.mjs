/**
 * The `event-surveys` job's doors, stubbed, for the suites that load the
 * whole scheduler registry and run some other job.
 *
 * The registry imports every job by value, so the survey after an event's
 * presses are in each such suite's graph, and the notice lane's caps behind
 * them (`src/lib/email/noticeCaps.ts`) import `Timestamp` as a value, which
 * is a link error under a Firestore stub that has none. Nothing in those
 * suites runs this job: `tests/event-survey-after.test.mjs` runs it whole,
 * through the real presses.
 */
export const EVENT_SURVEYS_JOB_STUBS = [
  [
    "@/lib/surveys/events/sending",
    "export const openAtEvent = async () => ({ ok: true });\n" +
      "export const sendSurveyAfter = async () => ({ ok: true, tally: { sent: 0, held: 0, suppressed: 0, failed: 0, noAddress: 0 } });",
  ],
  [
    "@/lib/surveys/events/setUp",
    "export const pressFirstEmails = async () => ({ ok: true, tally: { sent: 0, held: 0, suppressed: 0, failed: 0, noAddress: 0 } });\n" +
      "export const refreshFromEvent = async (db, survey) => survey;\n" +
      "export const sendNowCount = async () => ({ main: 0, missed: 0, emails: 0 });\n" +
      "export const settleAuto = async () => {};",
  ],
];
