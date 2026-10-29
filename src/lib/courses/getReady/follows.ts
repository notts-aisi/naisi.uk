import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { loadForm } from "@/lib/applications/repo";
import { formAsksToConfirm, PLACE_CONFIRMATIONS_JOB_ID } from "@/lib/applications/status/confirming";
import { placementWhere } from "@/lib/courses/placementEmail";
import { jobStateFor, readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import type { GroupSession } from "@/lib/firestore/courseGroups";
import { NEXT_WEEK_EMAIL_JOB, REGISTER_REMINDERS_JOB } from "@/lib/scheduler/registerJobs";

/**
 * "WHAT CAN FOLLOW BY ITSELF", under "What this press sends" on Publish's own
 * page: the scheduled course emails that go without anybody's press once
 * groups are out, each with whether it is switched on right now.
 *
 * READ, NEVER DECIDED. Each switch is read as the tick resolves it
 * (`jobStateFor`, with the job's own default), the way Site status and the
 * register's page read them, and nothing here changes one. The site-wide
 * pause is said too: while it is on, none of them goes.
 *
 *  - NEXT WEEK'S EMAIL (`courses-next-week-email`): with it on, a group whose
 *    room is empty has its email held until it has one, so the groups with no
 *    room are named.
 *  - THE FACILITATORS' REGISTER REMINDER (`courses-register-reminders`).
 *  - THE REMINDER TO CONFIRM A PLACE (`application-place-confirmations`),
 *    only while the programme's form asks people to confirm by a day.
 *
 * The ids and defaults are the jobs' own, without importing the jobs (which
 * import their sends): the first two from `registerJobs.ts`, held equal to
 * the registrations by `tests/course-register-jobs.test.mjs`; the third's
 * default here, held equal to its registration by
 * `tests/course-publish-outside-notes.test.mjs`.
 */

/** `application-place-confirmations` ships off: it emails people. */
export const PLACE_CONFIRMATIONS_ENABLED_BY_DEFAULT = false;

export type WhatFollows = {
  /** The whole scheduler is paused on Site status. */
  paused: boolean;
  nextWeekEmail: { on: boolean; waitsForRoom: string[] };
  registerReminders: { on: boolean };
  /** Null while the form asks nobody to confirm their place by a day. */
  placeConfirmations: { on: boolean } | null;
};

export async function readWhatFollows(
  db: Firestore,
  roundId: string,
  groups: readonly { name: string; session: GroupSession }[],
  now: Date,
): Promise<WhatFollows> {
  const [config, form] = await Promise.all([readSchedulerConfig(db), loadForm(db, roundId)]);
  const on = (id: string, byDefault: boolean) => jobStateFor(config, id, byDefault).enabled;
  return {
    paused: !config.enabled,
    nextWeekEmail: {
      on: on(NEXT_WEEK_EMAIL_JOB.id, NEXT_WEEK_EMAIL_JOB.enabledByDefault),
      // The weekly slot's own place, as the email says it: a room, or online.
      waitsForRoom: groups.filter((group) => placementWhere(group.session, null) === null).map((group) => group.name),
    },
    registerReminders: { on: on(REGISTER_REMINDERS_JOB.id, REGISTER_REMINDERS_JOB.enabledByDefault) },
    placeConfirmations:
      form && formAsksToConfirm(form, now)
        ? { on: on(PLACE_CONFIRMATIONS_JOB_ID, PLACE_CONFIRMATIONS_ENABLED_BY_DEFAULT) }
        : null,
  };
}
