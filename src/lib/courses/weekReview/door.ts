import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { openCourseworkDoor, type CourseworkDoor, type DoorRefusal } from "@/lib/courses/coursework/door";
import { sessionOfWeek } from "@/lib/courses/sessionChange/model";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { liveGroupsOfRun, readTabRun } from "@/lib/courses/weeksTab/load";
import { weekNumberOfId } from "@/lib/courses/weeksTab/paths";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseWeek, type CourseRunDoc } from "@/lib/firestore/courses";
import { REVIEW_WORDS } from "./words";

/**
 * THE DOOR TO A WEEK'S REVIEW (privacy v15: what Claude returns is seen by
 * admins only). The programme's coursework door first (`openCourseworkDoor`,
 * decided from the form before the run is read), turning away everybody but
 * an admin (`adminOnly`): the programme's lead included, who reads a calm
 * "Admins only" on the page instead. Then the run, the week (a taught week of
 * its plan) and every live group's session of that week: when it starts,
 * whether it has, whether it is cancelled, and when the group next meets.
 *
 * A week can be reviewed from its first session (clash 6): Claude reads only
 * what exists, and the page says how many groups have met.
 *
 * Who is reviewed is the coursework door's: the people holding a place on
 * the programme now, never a facilitator's own work (`fellowsOf`).
 */

export type ReviewGroup = {
  group: CourseGroupDoc;
  /** When the group's session of the week starts, or null when it cannot be dated. */
  startsAt: Date | null;
  cancelled: boolean;
  /** The session has started. */
  met: boolean;
  /** When the group next meets after now, a session that is not cancelled, or null. */
  nextAt: Date | null;
};

export type WeekReviewDoor = {
  ok: true;
  roundId: string;
  programmeId: string;
  door: CourseworkDoor;
  run: CourseRunDoc;
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  /** The run's copy of the week, or [] for a week not written as blocks. */
  blocks: WeekBlock[];
  /** The run's live groups, in meeting order, each with its session of the week. */
  groups: ReviewGroup[];
  /** The earliest start of the week among the groups that meet it, or null. */
  firstAt: Date | null;
  /** How many groups have met this week. */
  met: number;
  /** From the week's first session on. */
  reviewable: boolean;
};

export async function openWeekReview(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  weekId: string,
  now: Date,
): Promise<WeekReviewDoor | DoorRefusal> {
  const door = await openCourseworkDoor(db, user, roundId, programmeId, { adminOnly: REVIEW_WORDS.onlyAdmins });
  if (!door.ok) return door;
  const weekNumber = weekNumberOfId(weekId);
  if (weekNumber === null) return { ok: false, status: 404, error: REVIEW_WORDS.noWeek };
  const run = await readTabRun(db, door.runId);
  if (!run) return { ok: false, status: 409, error: REVIEW_WORDS.noRun };
  if (!run.weekPlan.some((entry) => entry.kind === "week" && entry.weekNumber === weekNumber)) {
    return { ok: false, status: 404, error: REVIEW_WORDS.noWeek };
  }
  const [weekSnap, liveGroups] = await Promise.all([
    db.collection("courseRuns").doc(run.id).collection("weeks").doc(weekId).get(),
    liveGroupsOfRun(db, run.id),
  ]);
  const week = weekSnap.exists ? normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {}) : null;
  const groups = liveGroups.map((group): ReviewGroup => {
    const sessions = resolveSessions(run, group);
    const session = sessionOfWeek(sessions, weekNumber);
    const startsAt = session ? sessionInstants(session).startsAt : null;
    const cancelled = session?.cancelled === true;
    const met = !cancelled && startsAt !== null && startsAt.getTime() <= now.getTime();
    const next = sessions
      .filter((each) => !each.cancelled)
      .map((each) => sessionInstants(each).startsAt)
      .filter((at): at is Date => at !== null && at.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0];
    return { group, startsAt, cancelled, met, nextAt: next ?? null };
  });
  const starts = groups.filter((each) => !each.cancelled && each.startsAt).map((each) => (each.startsAt as Date).getTime());
  const met = groups.filter((each) => each.met).length;
  return {
    ok: true,
    roundId,
    programmeId,
    door,
    run,
    weekId,
    weekNumber,
    weekTitle: week?.title.trim() || door.weeks.find((each) => each.weekId === weekId)?.title || "",
    blocks: week && isBlockWeek(week) ? week.blocks : [],
    groups,
    firstAt: starts.length > 0 ? new Date(Math.min(...starts)) : null,
    met,
    reviewable: met > 0,
  };
}
