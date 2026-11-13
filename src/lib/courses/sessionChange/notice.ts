import { campusLabel } from "../campus";
import { couldBeFollowed } from "../followable";
import { heldOnline } from "../joiningOnline/model";
import { resolveSessions, type ResolvedSession, type SessionGroup } from "../sessions";
import { campusForWeek, sessionModeForWeek } from "@/lib/firestore/courseGroups";
import type { CourseRunDoc } from "@/lib/firestore/courses";
import {
  cancelledHeadline,
  historyDetail,
  momentWords,
  movedHeadline,
  onlineHeadline,
  pushedHeadline,
  putRightHeadline,
  restoredHeadline,
} from "../groupChange/words";
import type { CheckedPress } from "./check";
import { nextHeldAfter, sessionOfWeek } from "./model";
import type { ChangePress } from "./parse";
import { oneWeekNoticeWords, type OneWeekNotice } from "./words";

/**
 * WHAT ONE WEEK'S CHANGE SAYS: the notice the group is told (its subject and
 * lines) and the sentence the group's history keeps, both from one reading
 * of what the press makes true (`checkPress`). Pure.
 */

/**
 * A stored room as the notice may print it: the room, or "" (a room not
 * booked yet, which the notice says as such) when a reader could follow it
 * (`couldBeFollowed`, the function every email that prints a room asks).
 */
function roomToPrint(room: string): string {
  const text = room.trim();
  return couldBeFollowed(text) ? "" : text;
}

/**
 * Where a session meets, as a notice may print it: `online` when it is held
 * online for everybody, asked the way the rest of the site asks it
 * (`heldOnline`: the week's own mode and campus, and the room), and then no
 * room; otherwise the room as `roomToPrint` gives it.
 */
function whereToPrint(group: SessionGroup, session: ResolvedSession): { room: string; online: boolean } {
  const first = session.occurrence === 1;
  const online = heldOnline({
    mode: first ? sessionModeForWeek(group, session.weekId) : null,
    campus: first ? campusForWeek(group, session.weekId) : (group.campus ?? null),
    room: session.session.location,
  });
  return { room: online ? "" : roomToPrint(session.session.location), online };
}

/** The week's session as it will read once the press is written, or null with none. */
export function weekSessionAfter(run: CourseRunDoc, checked: CheckedPress, weekNumber: number): ResolvedSession | null {
  return sessionOfWeek(resolveSessions(run, checked.after), weekNumber);
}

/** What the notice is about, worked out from the press and the group after it. */
export function oneWeekNoticeOf(run: CourseRunDoc, checked: CheckedPress, press: ChangePress): OneWeekNotice {
  const n = press.weekNumber;
  const before = checked.session;
  const after = weekSessionAfter(run, checked, n);
  switch (press.kind) {
    case "move": {
      const moved = after ?? before;
      const campus = campusLabel(campusForWeek(checked.after, checked.weekId));
      const facts = {
        weekNumber: n,
        dateKey: moved.dateKey,
        hhmm: moved.session.startTimeLocal,
        minutes: moved.session.durationMinutes,
        room: roomToPrint(moved.session.location),
        campusLabel: campus,
      };
      return press.metAtAnotherTime
        ? { kind: "metAtAnotherTime", ...facts, wasDateKey: before.dateKey, wasHhmm: before.session.startTimeLocal }
        : { kind: "move", ...facts };
    }
    case "online":
      return { kind: "online", weekNumber: n, dateKey: before.dateKey, hhmm: before.session.startTimeLocal };
    case "cancel": {
      const sessions = resolveSessions(run, checked.after);
      const cancelled = sessionOfWeek(sessions, n);
      const next = cancelled ? nextHeldAfter(sessions, cancelled) : null;
      // Called off after its time had passed: "No session for week 2" says it
      // did not happen, and when and where the group meets next.
      if (checked.started) {
        return {
          kind: "didNotHappen",
          weekNumber: n,
          dateKey: before.dateKey,
          next: next
            ? { weekNumber: next.weekNumber, dateKey: next.dateKey, hhmm: next.session.startTimeLocal, ...whereToPrint(checked.after, next) }
            : null,
        };
      }
      return { kind: "cancel", weekNumber: n, next: next ? { weekNumber: next.weekNumber, dateKey: next.dateKey } : null };
    }
    case "push":
      return {
        kind: "push",
        weekNumber: n,
        fromDateKey: before.dateKey,
        newDateKey: checked.pushed?.newDateKey ?? "",
        lastDateKey: checked.pushed?.lastDateKey ?? "",
      };
    case "restore": {
      const back = after ?? before;
      return {
        kind: "restore",
        weekNumber: n,
        dateKey: back.dateKey,
        hhmm: back.session.startTimeLocal,
        ...whereToPrint(checked.after, back),
      };
    }
  }
}

/** The notice's subject and lines. */
export function oneWeekNoticeFor(
  run: CourseRunDoc,
  checked: CheckedPress,
  press: ChangePress,
  context: { groupName: string; incubator: boolean },
): { title: string; message: string } {
  return oneWeekNoticeWords(oneWeekNoticeOf(run, checked, press), { ...context, reason: press.reason });
}

/** The one sentence the group's history keeps of the press. */
export function oneWeekHistoryDetail(
  run: CourseRunDoc,
  checked: CheckedPress,
  press: ChangePress,
  emailed: number,
): string {
  const n = press.weekNumber;
  const before = checked.session;
  const was = {
    dateKey: before.dateKey,
    hhmm: before.session.startTimeLocal,
    room: before.session.location.trim(),
  };
  const after = weekSessionAfter(run, checked, n);
  const now = after
    ? { dateKey: after.dateKey, hhmm: after.session.startTimeLocal, room: after.session.location.trim() }
    : was;
  const tail = { reason: press.reason, emailed };
  switch (checked.auditKind) {
    case "session-moved":
      return historyDetail({ headline: movedHeadline(n, now), before: momentWords(was), ...tail });
    case "session-put-right":
      return historyDetail({ headline: putRightHeadline(n, now), before: momentWords(was), ...tail });
    case "session-online":
      return historyDetail({ headline: onlineHeadline(n, was), ...tail });
    case "session-cancelled":
      return historyDetail({ headline: cancelledHeadline(n, was.dateKey), ...tail });
    case "session-pushed":
      return historyDetail({ headline: pushedHeadline(n, was.dateKey, checked.pushed?.newDateKey ?? ""), ...tail });
    default:
      return historyDetail({ headline: restoredHeadline(n, now), before: momentWords(was), ...tail });
  }
}
