import { placementWhere } from "@/lib/courses/placementEmail";
import { resolveSessions, sessionRange } from "@/lib/courses/sessions";
import type { CourseGroupDoc } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import { dayIn, meetsWords, shortSlotWords, whenWords, type AskWhere } from "./words";

/**
 * WHAT AN ASK SAYS ABOUT ITS GROUP, worked out from the group's own records:
 * its weekly slot, where it meets, its size, and its term on the group's OWN
 * calendar (a group can pace itself apart from its run), read through
 * `resolveSessions`, the resolver every schedule surface uses.
 *
 * Asked before a group has met, the term runs from its first session. Asked
 * after, it runs from the next session still to come, for the weeks left,
 * so nobody is told a day already past. A cancelled session is no meeting
 * (`sessionRange`).
 *
 * Where it meets is decided by `placementWhere`, as for every course email:
 * a room is printed only when nothing in it could be followed, and a meeting
 * link is never printed: an online group is "online".
 *
 * Pure: no reads, no clock of its own.
 */

export type GroupAskFacts = {
  id: string;
  name: string;
  /** "Mondays at 6pm", or null while the group has no day and time. */
  meets: string | null;
  /** "Mon 6pm", the board's short form. */
  short: string | null;
  /** "Mondays, 6pm to 8pm". */
  when: string | null;
  /** "Mon 2 Nov": the session the term is counted from. */
  firstSession: string | null;
  /** Taught weeks from that session on. */
  weeks: number;
  where: AskWhere;
  capacity: number | null;
  /** Whether an email that names this group can be written whole. */
  askable: boolean;
};

export function groupAskFacts(run: CourseRunDoc, group: CourseGroupDoc, now: Date): GroupAskFacts {
  const sessions = resolveSessions(run, group).filter((session) => session.occurrence === 1);
  // The soonest session still to finish: the first, until it has, then the
  // next. A group with none left has nothing to ask anybody to.
  const from = sessionRange(sessions, now).next;
  const weeks = from ? new Set(sessions.filter((s) => s.weekNumber >= from.weekNumber).map((s) => s.weekNumber)).size : 0;

  const placed = placementWhere(group.session, null);
  const where: AskWhere =
    placed?.kind === "room" ? { kind: "room", room: placed.room } : placed?.kind === "online" ? { kind: "online" } : null;

  const meets = meetsWords(group.session);
  const firstSession = from ? dayIn(from.dateKey) : null;
  return {
    id: group.id,
    name: group.name.trim(),
    meets,
    short: shortSlotWords(group.session),
    when: whenWords(group.session),
    firstSession,
    weeks,
    where,
    capacity: group.capacity,
    askable: group.name.trim() !== "" && meets !== null && firstSession !== null && weeks > 0,
  };
}
