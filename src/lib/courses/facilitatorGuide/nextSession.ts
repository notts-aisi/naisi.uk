import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";

/**
 * THE READER'S OWN GROUPS ON A COURSE, AS THE GUIDE'S PAGES USE THEM: the
 * card at the top of the course page ("Your next session"), the way back to
 * the group, and "Take the register" under a week's title, one row for each
 * group whose session that week is next or in progress.
 *
 * The guide is addressed by course and knows nothing of the reader's group,
 * so the guide's gate (`./access.ts`), which already reads the course's
 * groups and each one's run to decide who is a facilitator, hands back the
 * caller's own live groups it read, projected here to NAMED FIELDS: the
 * group's id, its run, its name, how many taught weeks it has, and its
 * sessions by week, day and clock. Never the group document, never a
 * meeting link, a room or anybody's name.
 *
 * The sessions are the one resolver's (`resolveSessions`), as every other
 * reader of a group's dates has them: a week moved through "Change a
 * session" is on its new day, a group pacing itself apart from its run is on
 * its own dates, and a session called off is kept, marked, and never the
 * next one.
 *
 * Pure, with no reads: the gate projects, the pages choose.
 */

/** One session of the reader's group, as the guide's pages need it. */
export type GuideSession = {
  weekNumber: number;
  /** 1 for the group's standing slot, 2 for a second one in the same week. */
  occurrence: number;
  /** The register's key for it: `w03`, as `?session=` takes it. */
  sessionKey: string;
  /** Its civil date, "YYYY-MM-DD", or "" when it cannot be dated. */
  dateKey: string;
  /** Its start on the wall clock, "18:00". */
  startTimeLocal: string;
  /** When it starts and ends, in milliseconds; null when it cannot be dated. */
  startsAt: number | null;
  endsAt: number | null;
  /** Called off through "Change a session": nobody meets. */
  cancelled: boolean;
};

/** One of the reader's own live groups on the course. */
export type GuideGroup = {
  groupId: string;
  runId: string;
  name: string;
  /** How many taught weeks the group's own calendar has. */
  weekCount: number;
  sessions: GuideSession[];
};

/** A group, as the gate read it, in the fields the guide's pages use. */
export function guideGroupOf(run: CourseRunDoc, group: CourseGroupDoc): GuideGroup {
  const sessions = resolveSessions(run, group).map((session): GuideSession => {
    const { startsAt, endsAt } = sessionInstants(session);
    return {
      weekNumber: session.weekNumber,
      occurrence: session.occurrence,
      sessionKey: session.sessionKey,
      dateKey: session.dateKey,
      startTimeLocal: session.session.startTimeLocal,
      startsAt: startsAt ? startsAt.getTime() : null,
      endsAt: endsAt ? endsAt.getTime() : null,
      cancelled: session.cancelled,
    };
  });
  return {
    groupId: group.id,
    runId: group.runId,
    name: group.name,
    weekCount: new Set(sessions.map((session) => session.weekNumber)).size,
    sessions,
  };
}

/**
 * A group's next session: the soonest-starting one that has not finished and
 * is not called off, as `sessionRange` decides "next" for every card. A
 * session in progress is still the next one. Null once the group's last
 * session is over, or when none can be dated.
 */
export function nextSessionOf(group: GuideGroup, now: Date): GuideSession | null {
  let next: GuideSession | null = null;
  for (const session of group.sessions) {
    if (session.cancelled || session.startsAt === null || session.endsAt === null) continue;
    if (session.endsAt < now.getTime()) continue;
    if (!next || session.startsAt < (next.startsAt ?? Infinity)) next = session;
  }
  return next;
}

/**
 * The session the reader meets next, across their groups on the course, and
 * whose it is: with two groups, the one that meets next. Null after every
 * group's last session.
 */
export function nextGuideSession(groups: readonly GuideGroup[], now: Date): { group: GuideGroup; session: GuideSession } | null {
  let found: { group: GuideGroup; session: GuideSession } | null = null;
  for (const group of groups) {
    const session = nextSessionOf(group, now);
    if (!session) continue;
    if (!found || (session.startsAt ?? Infinity) < (found.session.startsAt ?? Infinity)) found = { group, session };
  }
  return found;
}

/**
 * The reader's group the guide's pages lead back to: the one that meets
 * next, or, once every session is over, the first in meeting order. Null
 * for somebody who facilitates no live group on the course.
 */
export function homeGroupOf(groups: readonly GuideGroup[], now: Date): GuideGroup | null {
  return nextGuideSession(groups, now)?.group ?? groups[0] ?? null;
}

/**
 * The register "Take the register" opens from a week's page, for one of the
 * reader's groups: that week's session of the group, when it IS the group's
 * next session or is in progress now (started and not yet ended). Never a
 * session that is over, called off or further ahead than the next: putting
 * a finished register right is done from the group's own page, as before.
 * Null when there is none. Decided for each group on its own.
 */
export function registerSessionFor(group: GuideGroup, weekNumber: number, now: Date): GuideSession | null {
  const next = nextSessionOf(group, now);
  const at = now.getTime();
  for (const session of group.sessions) {
    if (session.weekNumber !== weekNumber || session.cancelled || session.startsAt === null || session.endsAt === null) continue;
    if (session.startsAt <= at && at <= session.endsAt) return session;
  }
  return next && next.weekNumber === weekNumber ? next : null;
}

/**
 * Every one of the reader's groups whose register for this week is theirs to
 * take now (`registerSessionFor`), in the order the groups come in, which is
 * meeting order: one row each on the week's page.
 */
export function registerRowsFor(groups: readonly GuideGroup[], weekNumber: number, now: Date): { group: GuideGroup; session: GuideSession }[] {
  return groups.flatMap((group) => {
    const session = registerSessionFor(group, weekNumber, now);
    return session ? [{ group, session }] : [];
  });
}

/** The group's page. */
export function groupPagePath(group: Pick<GuideGroup, "runId" | "groupId">): string {
  return `/learn/${encodeURIComponent(group.runId)}/group/${encodeURIComponent(group.groupId)}`;
}

/**
 * The group's register, at one session: `?session=w03`, the address the
 * register page reads a session from, as the email to somebody given one
 * session and the session report's way back write it. Home's "Take the
 * register" leads to the register with no session named.
 */
export function registerPath(group: Pick<GuideGroup, "runId" | "groupId">, session: Pick<GuideSession, "sessionKey">): string {
  return `${groupPagePath(group)}/register?session=${encodeURIComponent(session.sessionKey)}`;
}
