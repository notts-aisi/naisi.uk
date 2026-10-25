import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { resolveSessions, sessionInstants } from "../sessions";
import { formatRunStartShort } from "../window";

/**
 * WHEN A RUN IS OVER: the end of its last session, the moment who finished
 * opens. One answer, asked by who finished (`record.ts`), by leaving (which
 * closes then), and by the lead's attendance (which stops chasing absences
 * then: there are no more sessions to come to).
 *
 * Pure: no reads, and no clock but the one passed. It lives apart from
 * `record.ts` so that `programmeAttendance.ts`, which `record.ts` reads, can
 * ask it too.
 */

export type RunEnd = {
  /** The day of the run's last session, "YYYY-MM-DD", or null when none can be dated. */
  lastDateKey: string | null;
  /** "Wed 9 Dec", or null. */
  lastDay: string | null;
  /** When that session ends, or null. */
  endsAt: Date | null;
  /** True once the last session has ended. Never true for a run whose sessions cannot be dated. */
  over: boolean;
  /** The most sessions any live group of the run is due to hold, cancelled ones counted: the "of 6". */
  sessions: number;
};

/** The groups of a run that still meet: not archived, and the run's own. */
export function liveGroupsOf(runId: string, groups: readonly CourseGroupDoc[]): CourseGroupDoc[] {
  return groups.filter((group) => !group.archived && group.runId === runId);
}

/**
 * When the run's last session ends, from each live group's own calendar
 * (`resolveSessions` applies a group's pacing and one-week changes). A
 * cancelled session is no meeting, so a group that cancelled its last
 * session finishes on the one before it.
 */
export function runEndOf(run: CourseRunDoc, groups: readonly CourseGroupDoc[], now: Date): RunEnd {
  let last: { endsAt: Date; dateKey: string } | null = null;
  let sessions = 0;
  for (const group of liveGroupsOf(run.id, groups)) {
    const resolved = resolveSessions(run, group);
    sessions = Math.max(sessions, resolved.length);
    for (const session of resolved) {
      if (session.cancelled) continue;
      const { endsAt } = sessionInstants(session);
      if (!endsAt) continue;
      if (!last || endsAt.getTime() > last.endsAt.getTime()) last = { endsAt, dateKey: session.dateKey };
    }
  }
  return {
    lastDateKey: last?.dateKey ?? null,
    lastDay: last ? formatRunStartShort(last.dateKey) || null : null,
    endsAt: last?.endsAt ?? null,
    over: last !== null && last.endsAt.getTime() <= now.getTime(),
    sessions,
  };
}
