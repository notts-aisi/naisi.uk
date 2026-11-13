import { addDaysToKey, londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import {
  cameBy,
  type AttendanceStatus,
  type CourseAttendanceDoc,
  type FacilitatorPresence,
  type LineSetterHow,
  type RegisterCover,
} from "@/lib/firestore/courseAttendance";

/**
 * COVERING A REGISTER, as arithmetic: who took a register in whose place,
 * until when somebody given one session holds it, which lines a save
 * changed, whether each facilitator was there, who the register chase
 * emails, and what a finished register said.
 *
 * PURE. No Firestore and no clock unless one is passed, so the unit suites
 * run it standalone, and every route that asks one of these questions asks
 * it here.
 *
 * ## The rules it holds
 *
 *  - A cover a lead or an admin TOOK THEMSELVES (`self`) holds for as long as
 *    the register is a draft. A session GIVEN to somebody holds until the end
 *    of the London day on which the later of the grant and the session's
 *    start falls (`coverUntil`), and for that session only.
 *  - A save stamps a line only when its stored mark, or where somebody who
 *    came was (in the room or online), moved; a line a save did not move
 *    keeps its stamp.
 *  - A facilitator recorded not there because somebody covered for them is
 *    recorded late, at that moment, by their first save during the session;
 *    a save after the session has ended is the paperwork, not an arrival,
 *    and changes nothing.
 */

// ---------------------------------------------------------------------------
// Covers
// ---------------------------------------------------------------------------

/**
 * When a session given to somebody stops being theirs: the end of the London
 * day on which the later of `now` and the session's start falls (midnight,
 * the start of the next day). A session with no start counts from `now`.
 */
export function coverUntil(now: Date, startsAt: Date | null): Date {
  const later = startsAt && startsAt.getTime() > now.getTime() ? startsAt : now;
  return londonWallClockToInstant(addDaysToKey(londonDateKey(later), 1), "00:00");
}

/**
 * HOW OFTEN A SESSION MAY BE GIVEN, each give being one email to the person
 * given it: by one person on one group in an hour, on one group in a day,
 * and to one person in a day across every group. Set so that handing one
 * person up to twelve sessions in one sitting (the rest of a ten-week term,
 * and a change of mind or two) is not refused, while a press repeated over
 * and over is; the cover route claims all three on stored counters before
 * anything is written.
 */
export const GIVE_LIMITS = {
  /** Gives by one person on one group, in an hour. */
  perGiverHour: 12,
  /** Gives on one group, by anybody, in a day. */
  perGroupDay: 20,
  /** Sessions given to one person, on any group, in a day. */
  perPersonDay: 12,
} as const;

/** Whether a cover still holds at `now`: one taken by a lead or an admin always; one given, until its `until`. */
export function coverIsLive(cover: RegisterCover | null, now: Date): boolean {
  if (!cover) return false;
  if (cover.kind === "self") return true;
  return cover.until !== undefined && cover.until.getTime() > now.getTime();
}

/** Whether `uid` holds this register's cover at `now`: they took it, and it still holds. */
export function holdsCover(cover: RegisterCover | null, uid: string, now: Date): boolean {
  return Boolean(cover && uid && cover.byUid === uid && coverIsLive(cover, now));
}

/** Whether `uid` holds a live GIVEN cover: somebody given this one session, today. */
export function holdsGivenCover(cover: RegisterCover | null, uid: string, now: Date): boolean {
  return Boolean(cover && cover.kind === "given" && holdsCover(cover, uid, now));
}

/**
 * WHAT A CHANGE THAT MOVES A SESSION'S START TAKES OFF ITS REGISTER, when
 * nobody has taken that register but somebody holds its cover: the cover
 * (who was covering it, and a given one's `until`) and the entries it wrote
 * in the record of whether each facilitator was there (`how: "cover"`).
 * Both were about the old evening: left on, the facilitator who runs the
 * session at its new time would be recorded as not there, the reminders
 * would go to the wrong person, and a given session would end on the old
 * day. Null when the register is taken (`taken`, `registerIsTaken` of the
 * stored register: nothing may move it) or holds no cover. The person's own
 * words before the session stay with it, as every change keeps them.
 */
export function coverOffOnMove(
  register: Pick<CourseAttendanceDoc, "cover" | "facilitatorRecord"> | null,
  taken: boolean,
): { byUid: string; kind: RegisterCover["kind"]; entries: string[] } | null {
  if (!register || !register.cover || taken) return null;
  const entries = Object.entries(register.facilitatorRecord)
    .filter(([, entry]) => entry.how === "cover")
    .map(([uid]) => uid)
    .sort();
  return { byUid: register.cover.byUid, kind: register.cover.kind, entries };
}

// ---------------------------------------------------------------------------
// Who set each line
// ---------------------------------------------------------------------------

/** One person's line as stored: their mark, and where they were when they came (`true` online, `false` in the room). */
export type StoredLine = { mark: AttendanceStatus | null; online: boolean | undefined };

/**
 * Whether a save moved a line: its mark, or where somebody who came was. A
 * line that says nobody came carries no place, so a place left over beside
 * it is not compared.
 */
export function lineMoved(before: StoredLine, after: StoredLine): boolean {
  if (before.mark !== after.mark) return true;
  if (!cameBy(after.mark)) return false;
  return (before.online === true) !== (after.online === true);
}

/** How the person saving a line is stamped: a facilitator of the group, or somebody who is not. */
export function setterHow(facilitates: boolean): LineSetterHow {
  return facilitates ? "facilitator" : "cover";
}

/**
 * Whether one line's stamp says a facilitator of the group took the register
 * up: set as a facilitator, or by one of them. A person's OWN word before
 * the session (`self`: "Can't make it", "Joining online") never counts,
 * whoever said it: a facilitator who also holds a place in the group and
 * says they can't make it has not started the register, and is exactly the
 * person somebody may need to cover for. A line an admin's approval of a
 * request to be excused wrote (`approval`) is the same: it is the person's
 * own request, decided, and never a facilitator taking the register up,
 * even when the admin who approved it also facilitates the group.
 */
export function stampStartsIt(entry: { byUid: string; how: LineSetterHow }, facilitators: ReadonlySet<string>): boolean {
  if (entry.how === "self" || entry.how === "approval") return false;
  return entry.how === "facilitator" || facilitators.has(entry.byUid);
}

/**
 * WHETHER A SAVE BY SOMEBODY WHO IS NOT ONE OF THE GROUP'S FACILITATORS
 * TAKES THE REGISTER IN THEIR PLACE: it changed a line, the register has no
 * cover yet, and none of the group's facilitators has started it (saved a
 * mark, or set a line; their own word before the session is not starting
 * it). A facilitator who has started it is there, and somebody helping them
 * is not covering for them.
 */
export function saveTakesCover(input: {
  changedLines: number;
  cover: RegisterCover | null;
  markedByUid: string;
  setBy: Readonly<Record<string, { byUid: string; how: LineSetterHow }>>;
  facilitatorUids: readonly string[];
}): boolean {
  if (input.changedLines === 0 || input.cover) return false;
  const facilitators = new Set(input.facilitatorUids);
  if (input.markedByUid && facilitators.has(input.markedByUid)) return false;
  return !Object.values(input.setBy).some((entry) => stampStartsIt(entry, facilitators));
}

/**
 * WHETHER ONE OF THE GROUP'S FACILITATORS HAS STARTED THIS REGISTER: saved a
 * mark, or set a line. Their own word before the session ("Can't make it",
 * "Joining online", stamped `self`) is not starting it. Then there is nobody
 * to cover for: the cover route refuses it, and the pages offer the register
 * itself, to help.
 */
export function startedByFacilitator(
  register: Pick<CourseAttendanceDoc, "markedByUid" | "setBy"> | null,
  facilitatorUids: readonly string[],
): boolean {
  if (!register) return false;
  const facilitators = new Set(facilitatorUids);
  if (register.markedByUid && facilitators.has(register.markedByUid)) return true;
  return Object.values(register.setBy).some((entry) => stampStartsIt(entry, facilitators));
}

// ---------------------------------------------------------------------------
// Whether each facilitator was there
// ---------------------------------------------------------------------------

/**
 * Whether a session has ended at `now`. A cover taken or given before then
 * records the facilitators whose place it takes as not there; one taken
 * after it (catching up an old register) records nobody, because nobody
 * taking it then knows who was there. A session with no end is not over.
 */
export function sessionHasEnded(endsAt: Date | null, now: Date): boolean {
  return endsAt !== null && now.getTime() >= endsAt.getTime();
}

/** What becomes of one facilitator's entry when they save the register: late from now, or unchanged (null). */
export function presenceOnSave(input: {
  uid: string;
  cover: RegisterCover | null;
  entry: FacilitatorPresence | undefined;
  now: Date;
  endsAt: Date | null;
}): { state: "late"; arrivedAt: Date } | null {
  const { uid, cover, entry, now, endsAt } = input;
  if (!cover || !cover.covering.includes(uid)) return null;
  if (entry && entry.state !== "not-there") return null;
  // After the session ended, a save is the paperwork, not an arrival.
  if (!endsAt || now.getTime() >= endsAt.getTime()) return null;
  return { state: "late", arrivedAt: now };
}

/**
 * The facilitator record a Finish writes, by uid: only entries it makes,
 * never one it overwrites.
 *
 *  - The finisher, when they facilitate the group: there, unless they have
 *    an entry already. Recorded not there because somebody covered for them
 *    and finishing during the session: late, from now.
 *  - With the list of who was here (a group with more than one facilitator,
 *    ticked at Finish): each ticked facilitator with no entry is there, each
 *    one not ticked with no entry is not there. Without the list, the others
 *    get no entry.
 */
export function presenceAtFinish(input: {
  finisherUid: string;
  finisherFacilitates: boolean;
  facilitatorUids: readonly string[];
  here: readonly string[] | null;
  record: Readonly<Record<string, FacilitatorPresence>>;
  cover: RegisterCover | null;
  now: Date;
  endsAt: Date | null;
}): Record<string, { state: FacilitatorPresence["state"]; arrivedAt?: Date }> {
  const out: Record<string, { state: FacilitatorPresence["state"]; arrivedAt?: Date }> = {};
  const { finisherUid, record, now } = input;
  if (input.finisherFacilitates) {
    const entry = record[finisherUid];
    if (!entry) {
      out[finisherUid] = { state: "there" };
    } else {
      const late = presenceOnSave({ uid: finisherUid, cover: input.cover, entry, now, endsAt: input.endsAt });
      if (late) out[finisherUid] = late;
    }
  }
  if (input.here) {
    const here = new Set(input.here);
    for (const uid of input.facilitatorUids) {
      if (uid === finisherUid || record[uid] || out[uid]) continue;
      out[uid] = { state: here.has(uid) ? "there" : "not-there" };
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The register chase
// ---------------------------------------------------------------------------

/** Who the reminder about an unfinished register goes to, and why. */
export type ChaseTargets =
  | { kind: "facilitators"; uids: string[] }
  | { kind: "last-saver"; uids: string[] }
  | { kind: "cover-taker"; uids: string[] }
  | { kind: "cover-giver"; uids: string[] };

/**
 * THE PEOPLE A REGISTER'S REMINDER IS ABOUT, before any account is read.
 *
 *  - Covered: never the facilitators whose place was taken. The person who
 *    took it, when they took it themselves; the person who gave it, when it
 *    was given (by then the grant has ended).
 *  - Not covered: the facilitator with standing who last saved it, when one
 *    did; otherwise every facilitator with standing, as before covers existed
 *    (nobody has saved it, or the last to save it is not one of them).
 */
export function chaseTargets(input: {
  cover: RegisterCover | null;
  markedByUid: string;
  facilitatorsWithStanding: readonly string[];
}): ChaseTargets {
  const { cover, markedByUid } = input;
  const facilitators = [...new Set(input.facilitatorsWithStanding)];
  if (cover) {
    if (cover.kind === "self") return { kind: "cover-taker", uids: [cover.byUid] };
    return { kind: "cover-giver", uids: cover.grantedByUid ? [cover.grantedByUid] : [] };
  }
  if (markedByUid && facilitators.includes(markedByUid)) return { kind: "last-saver", uids: [markedByUid] };
  return { kind: "facilitators", uids: facilitators };
}

// ---------------------------------------------------------------------------
// What a finished register said
// ---------------------------------------------------------------------------

export type FinishCounts = { room: number; online: number; absent: number; excused: number };

/** The register's marks, counted the way its summary says them: who came in the room, online, absent, excused. */
export function finishCounts(
  records: Readonly<Record<string, AttendanceStatus>>,
  online: Readonly<Record<string, boolean>>,
): FinishCounts {
  const counts: FinishCounts = { room: 0, online: 0, absent: 0, excused: 0 };
  for (const [uid, mark] of Object.entries(records)) {
    if (cameBy(mark)) {
      if (online[uid] === true) counts.online += 1;
      else counts.room += 1;
    } else if (mark === "absent") counts.absent += 1;
    else if (mark === "excused") counts.excused += 1;
  }
  return counts;
}
