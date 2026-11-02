import "server-only";

/**
 * DOES THE SURVEY AFTER AN EVENT GO BY ITSELF HERE? Whether the
 * `event-surveys` job is switched on, read through the same `jobStateFor` and
 * the same `enabledByDefault` the tick uses, so the editor's Survey after
 * step and the event's Survey after tab say what the job will do: it ships
 * off, and while it is off they say nothing goes by itself.
 *
 * It imports the job's registration and not the registry, for the reason
 * `announcementQueue.ts` gives. `config/scheduler` is closed to every client,
 * so the pages read this on the server and hand the answer down.
 */

import type { Firestore } from "firebase-admin/firestore";
import { jobStateFor, readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { eventSurveysJob } from "@/lib/scheduler/jobs/eventSurveys";

export async function eventSurveysGoByThemselves(db: Firestore): Promise<boolean> {
  const config = await readSchedulerConfig(db);
  // `jobDefaultEnabled` inlined, as `announcementQueue.ts` does.
  return jobStateFor(config, eventSurveysJob.id, eventSurveysJob.enabledByDefault !== false).enabled;
}
