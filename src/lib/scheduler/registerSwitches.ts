import "server-only";

/**
 * THE THREE SWITCHES A REGISTER'S ENDING DEPENDS ON, read together for the
 * register's page, which has to say what finishing does and what happens if
 * nobody finishes.
 *
 *  - `scheduled`: next week's email is on its schedule
 *    (`courses-next-week-email`), so the button is "Finish the register" and
 *    emails nobody. The same answer the push route acts on.
 *  - `remindersOn`: the facilitators get a reminder email
 *    (`courses-register-reminders`).
 *  - `tasksOn`: the lead and admins get a task (`courses-unmarked-registers`).
 *
 * Each through `jobStateFor` with the job's own default, exactly as the tick
 * resolves them, so the page never promises a reminder the tick will not
 * send. The ids and defaults come from `registerJobs.ts`, for the reason
 * `nextWeekEmailSchedule.ts` gives.
 */

import { jobStateFor, type SchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { nextWeekEmailScheduledIn } from "@/lib/scheduler/nextWeekEmailSchedule";
import { REGISTER_REMINDERS_JOB, UNMARKED_REGISTERS_JOB } from "@/lib/scheduler/registerJobs";

export type RegisterSwitches = {
  scheduled: boolean;
  remindersOn: boolean;
  tasksOn: boolean;
};

export function registerSwitchesIn(config: SchedulerConfig): RegisterSwitches {
  return {
    scheduled: nextWeekEmailScheduledIn(config),
    remindersOn: jobStateFor(
      config,
      REGISTER_REMINDERS_JOB.id,
      REGISTER_REMINDERS_JOB.enabledByDefault,
    ).enabled,
    tasksOn: jobStateFor(
      config,
      UNMARKED_REGISTERS_JOB.id,
      UNMARKED_REGISTERS_JOB.enabledByDefault,
    ).enabled,
  };
}
