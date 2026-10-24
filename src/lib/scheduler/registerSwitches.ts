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
 * send. The registrations are imported rather than the registry, for the
 * reason `nextWeekEmailSchedule.ts` gives.
 */

import { jobStateFor, type SchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { registerRemindersJob } from "@/lib/scheduler/jobs/registerReminders";
import { unmarkedRegistersJob } from "@/lib/scheduler/jobs/unmarkedRegisters";
import { nextWeekEmailScheduledIn } from "@/lib/scheduler/nextWeekEmailSchedule";

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
      registerRemindersJob.id,
      registerRemindersJob.enabledByDefault !== false,
    ).enabled,
    tasksOn: jobStateFor(
      config,
      unmarkedRegistersJob.id,
      unmarkedRegistersJob.enabledByDefault !== false,
    ).enabled,
  };
}
