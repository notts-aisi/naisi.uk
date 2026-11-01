/**
 * `courseExplainers/{autoId}`: an explainer an admin scheduled from a week's
 * review. Somebody on the committee (or an admin) explains one topic for a
 * few minutes at the start of the next session of each group chosen.
 *
 * WHAT IT HOLDS IS THE ADMIN'S. The topic is the words the admin scheduled,
 * at most 120 characters, whether they typed them or kept the title of a
 * theme Claude found: nothing else of the review is kept here (no theme, no
 * count, no group's share of it), so a reader of an explainer never reaches
 * what Claude returned, which is seen by admins only (privacy v15).
 *
 * ONE ENTRY PER SESSION (`sessions`): the group, the session's key (the
 * register's own, `sessionKey`), its week and when it started when it was
 * scheduled. A ticket shows the explainer while the group's next session is
 * that key, so a session moved for one week keeps it and a cancelled one
 * drops off every ticket. Each session has one task for the explainer, at
 * `explainerTaskId`.
 *
 * CANCELLED, NEVER DELETED, by an admin on the review page: `cancelledAt`
 * and `cancelledByUid` are stamped, the tasks are closed, and every reader
 * (`activeExplainers`) leaves it out. A run's destroy deletes every one of
 * the run's explainers with it; an account's deletion leaves the explainer
 * and takes the account's id off it (`explainerUid`, `scheduledByUid`,
 * `cancelledByUid` become null), so the ticket says "Starts with an
 * explainer" without a name.
 *
 * WRITTEN AND READ ONLY ON THE SERVER: `firestore.rules` refuses every
 * browser, admins included.
 *
 * Pure: no imports, so the routes, the pages, the deletions, a browser's
 * form and the tests read it anywhere.
 */

export const COURSE_EXPLAINERS_COLLECTION = "courseExplainers";

/**
 * The `tasks.source` an explainer's tasks carry. `courseTasks.ts` lists it
 * beside the other sources a run's task sweep may filter on.
 */
export const EXPLAINER_TASK_SOURCE = "explainer";

/** The longest topic, in characters: one line on a ticket. */
export const EXPLAINER_TOPIC_MAX = 120;

/** How long an explainer may be, in minutes. */
export const EXPLAINER_MINUTES = [5, 10, 15, 20] as const;
export type ExplainerMinutes = (typeof EXPLAINER_MINUTES)[number];

/**
 * One explainer's task for one session: `explainer__{explainerId}__{groupId}__{sessionKey}`.
 * CONSTRUCT-ONLY: every part is also on the task's `sourceRef` or the explainer.
 */
export function explainerTaskId(explainerId: string, groupId: string, sessionKey: string): string {
  return `${EXPLAINER_TASK_SOURCE}__${explainerId}__${groupId}__${sessionKey}`;
}

/** One session an explainer opens. */
export type ExplainerSession = {
  groupId: string;
  /** The register's key for the session: "w04", or "w04-2" for a week's second meeting. */
  sessionKey: string;
  weekNumber: number;
  /** When it started, as the session stood when it was scheduled. */
  startsAt: Date | null;
};

export type CourseExplainerDoc = {
  id: string;
  runId: string;
  roundId: string;
  programmeId: string;
  /** The week whose review it was scheduled from: "w03", and its number. */
  fromWeekId: string;
  fromWeekNumber: number;
  /** The admin's words. */
  topic: string;
  /** Who explains; null once their account is deleted. */
  explainerUid: string | null;
  minutes: ExplainerMinutes;
  sessions: ExplainerSession[];
  scheduledByUid: string | null;
  scheduledAt: Date | null;
  cancelledAt: Date | null;
  cancelledByUid: string | null;
};

type Raw = Record<string, unknown>;

function record(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function tsToDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

const str = (value: unknown, max: number): string => (typeof value === "string" ? value.slice(0, max) : "");
const uidOrNull = (value: unknown): string | null => (typeof value === "string" && value ? value.slice(0, 128) : null);

/** Whether a number is one of the lengths an explainer may be. */
export function isExplainerMinutes(value: unknown): value is ExplainerMinutes {
  return typeof value === "number" && (EXPLAINER_MINUTES as readonly number[]).includes(value);
}

/** A stored explainer, read; null for one with no run, no topic, no length or no session. */
export function normalizeExplainer(id: string, raw: Raw): CourseExplainerDoc | null {
  const runId = str(raw.runId, 200);
  const topic = str(raw.topic, EXPLAINER_TOPIC_MAX).trim();
  const fromWeekNumber = raw.fromWeekNumber;
  if (!runId || !topic || !isExplainerMinutes(raw.minutes)) return null;
  if (typeof fromWeekNumber !== "number" || !Number.isInteger(fromWeekNumber) || fromWeekNumber < 1) return null;
  const sessions: ExplainerSession[] = [];
  for (const each of Array.isArray(raw.sessions) ? raw.sessions : []) {
    const session = record(each);
    const groupId = str(session.groupId, 200);
    const sessionKey = str(session.sessionKey, 20);
    const weekNumber = session.weekNumber;
    if (!groupId || !sessionKey || typeof weekNumber !== "number" || !Number.isInteger(weekNumber)) continue;
    sessions.push({ groupId, sessionKey, weekNumber, startsAt: tsToDate(session.startsAt) });
  }
  if (sessions.length === 0) return null;
  return {
    id,
    runId,
    roundId: str(raw.roundId, 200),
    programmeId: str(raw.programmeId, 200),
    fromWeekId: str(raw.fromWeekId, 10),
    fromWeekNumber,
    topic,
    explainerUid: uidOrNull(raw.explainerUid),
    minutes: raw.minutes,
    sessions,
    scheduledByUid: uidOrNull(raw.scheduledByUid),
    scheduledAt: tsToDate(raw.scheduledAt),
    cancelledAt: tsToDate(raw.cancelledAt),
    cancelledByUid: uidOrNull(raw.cancelledByUid),
  };
}

/** The explainers still on: every one not cancelled. */
export function activeExplainers(explainers: readonly CourseExplainerDoc[]): CourseExplainerDoc[] {
  return explainers.filter((explainer) => explainer.cancelledAt === null);
}

/** The explainer still on that opens this group's session, or null. One per session: the route refuses a second. */
export function explainerOnSession(
  explainers: readonly CourseExplainerDoc[],
  groupId: string,
  sessionKey: string,
): CourseExplainerDoc | null {
  return (
    activeExplainers(explainers).find((explainer) =>
      explainer.sessions.some((session) => session.groupId === groupId && session.sessionKey === sessionKey),
    ) ?? null
  );
}

/** The account fields an account's deletion takes off an explainer that names it. */
export const EXPLAINER_ACCOUNT_FIELDS = ["explainerUid", "scheduledByUid", "cancelledByUid"] as const;
