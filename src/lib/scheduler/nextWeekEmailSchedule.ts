import "server-only";

/**
 * IS NEXT WEEK'S EMAIL ON ITS SCHEDULE? One answer, asked wherever it decides
 * something.
 *
 * The `courses-next-week-email` job's own switch on Site status is THE switch
 * between the two ways a register ends:
 *
 *  - OFF (how it ships): pushing the register sends the group next week's
 *    email, as it always has. The register's button is "Push attendance".
 *  - ON: the job sends the email on its schedule and the register's button is
 *    "Finish the register", which emails nobody.
 *
 * The push route asks this to decide whether to send; the register's page
 * asks it to say what its button does; the register cards ask it to say which
 * button to press. They must never disagree, and the way they cannot is one
 * function reading the switch through the same `jobStateFor` and the same
 * `enabledByDefault` the tick uses.
 *
 * THE JOB'S OWN SWITCH ONLY, not the site-wide pause, which is the
 * `event-announcements` precedent: the pause is for a scheduler that is
 * misbehaving, and flipping every register back to sending its own email
 * during an incident would mail groups early and change the page under the
 * facilitators. The email simply waits for the pause to end, and goes then if
 * its session is still ahead.
 *
 * IT IMPORTS THE REGISTRATION AND NOT THE REGISTRY, for the reason
 * `announcementQueue.ts` gives: the registry imports every job, and this is
 * asked by a request.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  jobStateFor,
  readSchedulerConfig,
  type SchedulerConfig,
} from "@/lib/firestore/schedulerConfig";
import { nextWeekEmailJob } from "@/lib/scheduler/jobs/nextWeekEmail";

/** The answer, from a scheduler config the caller has already read. */
export function nextWeekEmailScheduledIn(config: SchedulerConfig): boolean {
  return jobStateFor(
    config,
    nextWeekEmailJob.id,
    // `jobDefaultEnabled` inlined; importing it costs the whole registry.
    nextWeekEmailJob.enabledByDefault !== false,
  ).enabled;
}

export async function nextWeekEmailIsScheduled(db: Firestore): Promise<boolean> {
  return nextWeekEmailScheduledIn(await readSchedulerConfig(db));
}
