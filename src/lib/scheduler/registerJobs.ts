/**
 * THE THREE SCHEDULER JOBS A REGISTER'S ENDING DEPENDS ON, by id and by what
 * "no stored switch" means for each.
 *
 *  - `courses-next-week-email`: next week's email on its schedule. Its switch
 *    also decides what finishing a register does (see
 *    `nextWeekEmailSchedule.ts`). Off until an admin turns it on: it emails
 *    whole groups.
 *  - `courses-register-reminders`: the facilitators' one reminder. Off until
 *    an admin turns it on: it emails people.
 *  - `courses-unmarked-registers`: the task for the lead and the admins. On
 *    unless an admin turns it off: it raises cards and emails nobody.
 *
 * WHY THESE ARE RESTATED HERE RATHER THAN READ OFF THE REGISTRATIONS. A
 * request that has to say what a register's button does asks these switches,
 * and importing a job's registration imports the whole job: its sends, its
 * templates and the application form's code behind the lead. A request needs
 * two facts per job, so it imports two facts per job. Each job's registration
 * spells out the same id and the same default, and
 * `tests/course-register-jobs.test.mjs` holds every pair here equal to its
 * registration, so the two cannot come apart without a test failing.
 *
 * No imports, on purpose.
 */

export const NEXT_WEEK_EMAIL_JOB = {
  id: "courses-next-week-email",
  enabledByDefault: false,
} as const;

export const REGISTER_REMINDERS_JOB = {
  id: "courses-register-reminders",
  enabledByDefault: false,
} as const;

export const UNMARKED_REGISTERS_JOB = {
  id: "courses-unmarked-registers",
  enabledByDefault: true,
} as const;
