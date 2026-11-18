import { ROOM_TO_BE_CONFIRMED, historyDetail } from "../groupChange/words";
import { dayWords, hoursWords, roomAndCampusWords, whyWords } from "./words";

/**
 * THE WORDS OF A ROOM-ONLY CHANGE OF ONE WEEK: the notice its group is told,
 * the sentence its History row keeps, and its refusals. No imports beyond the
 * one-week change's own words, so the browser and the server say the same.
 *
 * The notice's words live in ONE place, `ROOM_ONLY_NOTICE_WORDS`, and only
 * `roomNoticeWords` reads them: they are the only words a member receives from
 * a room-only change, so they can be changed here and nowhere else.
 */

export const ROOM_ONLY_NOTICE_WORDS = {
  /** A room set, or changed: "Week 5 is in George Green B06". */
  roomSubject: (weekNumber: number, room: string) => `Week ${weekNumber} is in ${room}`,
  /** The room taken off: "Week 5: room to be confirmed". */
  clearedSubject: (weekNumber: number) => `Week ${weekNumber}: room to be confirmed`,
  /** "Group A’s week 5 session, Thu 26 Nov, 6pm to 7:30pm, is in George Green B06 (University Park)." */
  setLine: (owner: string, weekNumber: number, when: string, where: string) =>
    `${owner} week ${weekNumber} session, ${when}, is in ${where}.`,
  /** "... is now in George Green B06 (University Park), not Portland A21." */
  changedLine: (owner: string, weekNumber: number, when: string, where: string, was: string) =>
    `${owner} week ${weekNumber} session, ${when}, is now in ${where}, not ${was}.`,
  /** "... has no room yet." */
  clearedLine: (owner: string, weekNumber: number, when: string) => `${owner} week ${weekNumber} session, ${when}, has no room yet.`,
  booked: "We’ll email you as soon as it’s booked.",
  sameDayAndTime: "The day and time are the same.",
} as const;

/** What a room-only notice is about. `room` "" is a room taken off; `wasRoom` "" is a week that had none. */
export type RoomNotice = {
  weekNumber: number;
  dateKey: string;
  hhmm: string;
  /** The session's length; 0 when it has none, and the end time is left out. */
  minutes: number;
  room: string;
  /** "University Park", or "" when the week has no campus. */
  campusLabel: string;
  wasRoom: string;
};

export type RoomNoticeKind = "set" | "changed" | "cleared";

export function roomNoticeKind(notice: Pick<RoomNotice, "room" | "wasRoom">): RoomNoticeKind {
  if (!notice.room.trim()) return "cleared";
  return notice.wasRoom.trim() ? "changed" : "set";
}

/**
 * THE NOTICE A ROOM-ONLY CHANGE SENDS: its subject and lines, one paragraph a
 * line. `owner` is the group's name, or "Your" for an incubator's people, who
 * are never told the word group, as every one-week notice says it. "Why: ..."
 * follows only when a reason was given. A fact the session lacks (its campus,
 * its length) drops out of the sentence and nothing else changes.
 */
export function roomNoticeWords(
  notice: RoomNotice,
  context: { groupName: string; incubator: boolean; reason: string },
): { title: string; message: string } {
  const D = ROOM_ONLY_NOTICE_WORDS;
  const owner = context.incubator ? "Your" : `${context.groupName}’s`;
  const n = notice.weekNumber;
  const when = `${dayWords(notice.dateKey)}, ${hoursWords(notice.hhmm, notice.minutes)}`;
  const lines = (...parts: string[]) => parts.filter(Boolean).join("\n\n");
  const why = whyWords(context.reason);
  const room = notice.room.trim();
  switch (roomNoticeKind(notice)) {
    case "cleared":
      return {
        title: D.clearedSubject(n),
        message: lines(`${D.clearedLine(owner, n, when)} ${D.booked} ${D.sameDayAndTime}`, why),
      };
    case "set":
      return {
        title: D.roomSubject(n, room),
        message: lines(D.setLine(owner, n, when, roomAndCampusWords(room, notice.campusLabel)), why),
      };
    case "changed":
      return {
        title: D.roomSubject(n, room),
        message: lines(
          `${D.changedLine(owner, n, when, roomAndCampusWords(room, notice.campusLabel), notice.wasRoom.trim())} ${D.sameDayAndTime}`,
          why,
        ),
      };
  }
}

// ---------------------------------------------------------------------------
// History, and the refusals (staff only)
// ---------------------------------------------------------------------------

/** "Set week 5’s room to George Green B06, for that week only." and its kin. */
export function roomHeadline(weekNumber: number, room: string, wasRoom: string): string {
  const kind = roomNoticeKind({ room, wasRoom });
  if (kind === "cleared") return `Took week ${weekNumber}’s room off, for that week only: ${ROOM_TO_BE_CONFIRMED}.`;
  if (kind === "changed") return `Changed week ${weekNumber}’s room to ${room.trim()}, for that week only.`;
  return `Set week ${weekNumber}’s room to ${room.trim()}, for that week only.`;
}

/** The History row's one sentence: the headline, the room before, the reason, and who was emailed. */
export function roomHistoryDetail(input: {
  weekNumber: number;
  room: string;
  wasRoom: string;
  reason: string;
  emailed: number;
}): string {
  return historyDetail({
    headline: roomHeadline(input.weekNumber, input.room, input.wasRoom),
    before: input.wasRoom.trim() || ROOM_TO_BE_CONFIRMED,
    reason: input.reason,
    emailed: input.emailed,
  });
}

export const ROOM_REFUSAL = {
  weeks: "Say which weeks, each once, with the room for each.",
  tellOneWeek: "Tell the group is for one week at a time.",
  previewOneWeek: "A preview is for one week at a time.",
  started: "That session has started, so its room can’t change now.",
  cancelled: "That session is called off, so it has no room to change.",
  online: "That session is held online, so it has no room to change.",
  room: "A room is one line of at most 200 characters.",
  roomLink: "A room can’t be a link.",
  sameAsNow: "That’s already this week’s room.",
} as const;
