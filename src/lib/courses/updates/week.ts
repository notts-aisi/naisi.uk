import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { sessionOfWeek } from "@/lib/courses/sessionChange/model";
import { resolveSessions } from "@/lib/courses/sessions";
import { attendanceDocId, registerIsTaken } from "@/lib/firestore/courseAttendance";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { weekNotOpenWords } from "./words";

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
 * write. A week past the group's last session, a week only another group
 * has, and a week whose register was taken (a session that met and was
 * marked) are refused, in one sentence, before anything is written or sent.
 * Null when the week is one of those it may be.
 */
export async function weekNoticeRefusal(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  weekNumber: number,
): Promise<string | null> {
  const refused = weekNotOpenWords(group.name, weekNumber);
  const session = sessionOfWeek(resolveSessions(run, group), weekNumber);
  if (!session) return refused;
  const snap = await db.collection("courseAttendance").doc(attendanceDocId(run.id, group.id, weekNumber, session.occurrence)).get();
  return snap.exists && registerIsTaken(snap.data() ?? {}) ? refused : null;
}
