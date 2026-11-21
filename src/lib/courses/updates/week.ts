import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { sessionOfWeek } from "@/lib/courses/sessionChange/model";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { attendanceDocId, registerIsTaken } from "@/lib/firestore/courseAttendance";
import { sessionChangeForWeek, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { weekNotOpenWords } from "./words";

/** How long after a change to a session that has started its notice may still be posted (a retry included). */
export const PAST_NOTICE_WINDOW_MS = 24 * 3_600_000;

/**
 * THE WEEK AN UPDATE TO ONE GROUP IS ABOUT (`weekNumber`), held to the one
 * use it has: the notice a change to one of the group's sessions posts
 * (`POST /api/courses/groups/[groupId]/session/change` answers it, and the
 * group page's Change panel and the Sessions view's dialog post it), whose
 * email reaches the people in the group that week.
 *
 * So the week must be one the change route can have changed, as the change
 * route leaves it: a week in which THIS group has a session
 * (`resolveSessions` on the group's own calendar, the change route's own
 * read), whose register nobody has taken (`registerIsTaken`). A session still
 * to come has no register taken; one put right after it started ("It didn't
 * happen", a move after it met) has its register's lines cleared in the same
 * write.
 *
 * A SESSION THAT HAS STARTED is told about only by the person who just
 * changed it: the change route writes the week's record
 * (`group.sessionChanges[weekId]`) with who changed it and when, for every
 * change it makes to a session that has started (moved, met at another time,
 * called off, pushed back), and "Put it back as usual" is refused for one. So
 * the week's record must name `actorUid` and be no more than
 * `PAST_NOTICE_WINDOW_MS` old.
 *
 * A week past the group's last session, a week only another group has, a
 * week whose register was taken (a session that met and was marked), and a
 * session that has started with no such record are refused, in one
 * sentence, before anything is written or sent. Null when the week is one of
 * those it may be.
 */
export async function weekNoticeRefusal(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  weekNumber: number,
  actorUid: string,
  now: Date,
): Promise<string | null> {
  const refused = weekNotOpenWords(group.name, weekNumber);
  const session = sessionOfWeek(resolveSessions(run, group), weekNumber);
  if (!session) return refused;
  // A session that has started: only from the record the change route wrote, by this person, lately.
  const startsAt = sessionInstants(session).startsAt;
  if (startsAt !== null && startsAt.getTime() <= now.getTime()) {
    const change = sessionChangeForWeek(group, session.weekId);
    const fresh = change?.at instanceof Date && now.getTime() - change.at.getTime() <= PAST_NOTICE_WINDOW_MS;
    if (!change || change.byUid !== actorUid || !fresh) return refused;
  }
  const snap = await db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, weekNumber, session.occurrence)).get();
  return snap.exists && registerIsTaken(snap.data() ?? {}) ? refused : null;
}
