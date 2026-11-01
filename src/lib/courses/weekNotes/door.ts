import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { openCourseworkDoor, type CourseworkDoor, type DoorRefusal } from "@/lib/courses/coursework/door";
import type { CourseworkWeek } from "@/lib/courses/coursework/input";
import { sessionOfWeek } from "@/lib/courses/sessionChange/model";
import { resolveSessions, sessionInstants } from "@/lib/courses/sessions";
import { liveGroupsOfRun, readTabRun } from "@/lib/courses/weeksTab/load";
import { weekNumberOfId } from "@/lib/courses/weeksTab/paths";
import type { SessionUser } from "@/lib/firebase/session";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import { normalizeCourseWeek, type CourseRunDoc } from "@/lib/firestore/courses";
import { WEEK_NOTES_WORDS } from "./words";

/**
 * THE DOOR TO A WEEK'S NOTES ABOUT PEOPLE (privacy v15). The programme's
 * coursework door first (`openCourseworkDoor`, decided from the form before
 * the run is read): an admin, or the programme's lead, who reads the saved
 * notes kept for leads and nothing of Claude's; the routes that draft, save
 * and discard pass `adminOnly`, so the lead is turned away there. Then the
 * run, the week (a taught week of its plan) and each live group's session of
 * that week: whether it has started, so the page knows when every group has
 * met.
 *
 * Who the notes are about is the coursework door's: the people holding a
 * place on the programme now, never a facilitator's own work (`fellowsOf`).
 */

export type NotesGroup = {
  group: CourseGroupDoc;
  /** When the group's session of the week starts, or null when it cannot be dated. */
  startsAt: Date | null;
  cancelled: boolean;
  /** The session has started. */
  met: boolean;
};

export type WeekNotesDoor = {
  ok: true;
  roundId: string;
  programmeId: string;
  door: CourseworkDoor;
  run: CourseRunDoc;
  weekId: string;
  weekNumber: number;
  weekTitle: string;
  /** The week's questions from every copy of it, or null for a week with none. */
  week: CourseworkWeek | null;
  /** The run's live groups, in meeting order, each with its session of the week. */
  groups: NotesGroup[];
  /** How many groups meet this week (a dated session, not cancelled), and how many of those have met. */
  meeting: number;
  met: number;
  /** Every group that meets this week has met: from then on the week's notes can be drafted. */
  allMet: boolean;
  /** The week's first session has started: the page opens from then on. */
  started: boolean;
};

export async function openWeekNotes(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  weekId: string,
  now: Date,
  options: { adminOnly?: string } = {},
): Promise<WeekNotesDoor | DoorRefusal> {
  const door = await openCourseworkDoor(db, user, roundId, programmeId, options);
  if (!door.ok) return door;
  const weekNumber = weekNumberOfId(weekId);
  if (weekNumber === null) return { ok: false, status: 404, error: WEEK_NOTES_WORDS.noWeek };
  const run = await readTabRun(db, door.runId);
  if (!run) return { ok: false, status: 409, error: WEEK_NOTES_WORDS.noRun };
  if (!run.weekPlan.some((entry) => entry.kind === "week" && entry.weekNumber === weekNumber)) {
    return { ok: false, status: 404, error: WEEK_NOTES_WORDS.noWeek };
  }
  const [weekSnap, liveGroups] = await Promise.all([
    db.collection("courseRuns").doc(run.id).collection("weeks").doc(weekId).get(),
    liveGroupsOfRun(db, run.id),
  ]);
  const stored = weekSnap.exists ? normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {}) : null;
  const week = door.weeks.find((each) => each.weekId === weekId) ?? null;
  const groups = liveGroups.map((group): NotesGroup => {
    const session = sessionOfWeek(resolveSessions(run, group), weekNumber);
    const startsAt = session ? sessionInstants(session).startsAt : null;
    const cancelled = session?.cancelled === true;
    return { group, startsAt, cancelled, met: !cancelled && startsAt !== null && startsAt.getTime() <= now.getTime() };
  });
  const meeting = groups.filter((each) => !each.cancelled && each.startsAt !== null);
  const met = meeting.filter((each) => each.met).length;
  return {
    ok: true,
    roundId,
    programmeId,
    door,
    run,
    weekId,
    weekNumber,
    weekTitle: stored?.title.trim() || week?.title || "",
    week,
    groups,
    meeting: meeting.length,
    met,
    allMet: meeting.length > 0 && met === meeting.length,
    started: met > 0,
  };
}
