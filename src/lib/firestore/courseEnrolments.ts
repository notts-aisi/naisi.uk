/**
 * `courseEnrolments/{runId}__{uid}` — one member's place on one course run.
 * ALL writes go through server routes (`allow write: if false` in rules):
 * enrolment is the outcome of allocation, and the group `memberCount`
 * counters must move in the same transaction.
 *
 * The deterministic doc id IS the no-double-placement invariant: one
 * enrolment per (run, uid) exists structurally, and `groupId` is a single
 * scalar — a member cannot be in two groups because there is nowhere to
 * store a second placement. Moving groups is one scalar update plus two
 * counter deltas; "everyone placed" is a count of `groupId == null` rows.
 */

export type CourseEnrolmentStatus = "active" | "withdrawn" | "removed" | "completed";

export const ENROLMENT_STATUSES: CourseEnrolmentStatus[] = [
  "active",
  "withdrawn",
  "removed",
  "completed",
];

export const ENROLMENT_STATUS_LABEL: Record<CourseEnrolmentStatus, string> = {
  active: "Active",
  withdrawn: "Withdrawn",
  removed: "Removed",
  completed: "Completed",
};

/**
 * Facilitators get a `role: "facilitator"` enrolment when assigned to a
 * group, so "every run you touch" on /learn is one query over enrolments.
 *
 * A FACILITATOR WHO HOLDS A PLACE on the run is one of its fellows too, and
 * their row is a LEARNER'S: their place, in the group they facilitate,
 * counted, marked on its register and counted towards who finished like
 * everybody else's. Their facilitating lives on the group
 * (`courseGroups.facilitatorUids`), never on the row. Still one row per
 * person per run: somebody made a facilitator before anybody placed them has
 * a facilitator's row, and the board's placement turns that row into their
 * learner's (`POST /api/courses/runs/[runId]/allocate`), in the group they
 * facilitate and no other.
 */
export type CourseEnrolmentRole = "learner" | "facilitator";

/**
 * This member's attendance across the run, as one rolled-up row.
 *
 * FULL RECOMPUTE, NEVER A DELTA. The attendance push recomputes this member's
 * whole record from their group's PUSHED registers inside the push
 * transaction, rather than adding one to a counter. That is the direct lesson
 * from `applicationCounts`, which moves only as relative increments, has no
 * recount pass anywhere, and is therefore unreconcilable once it drifts. A
 * rollup that can be rebuilt from its source at any time cannot drift at all.
 *
 * `sessionsHeld` counts only registers marked `held`, so a cancelled session
 * leaves every ratio built on this alone rather than silently deflating it.
 *
 * `lastPushedSessionKey` is the idempotency marker: a re-push of the same
 * session recomputes to the same numbers, and the key says which session the
 * figures are current as of.
 *
 * `online` counts the sessions they came to (present, late or left early)
 * that the register records them as having joined online; the rest of the
 * sessions they came to were in the room. A rollup written before the
 * register recorded where people were has none, and reads as 0: everybody
 * was in the room.
 */
export type EnrolmentAttendanceRollup = {
  sessionsHeld: number;
  attendedInFull: number;
  late: number;
  leftEarly: number;
  absent: number;
  excused: number;
  /** Of the sessions they came to, how many they joined online. */
  online: number;
  lastPushedSessionKey: string | null;
  lastComputedAt: Date | null;
};

export const EMPTY_ATTENDANCE_ROLLUP: EnrolmentAttendanceRollup = {
  sessionsHeld: 0,
  attendedInFull: 0,
  late: 0,
  leftEarly: 0,
  absent: 0,
  excused: 0,
  online: 0,
  lastPushedSessionKey: null,
  lastComputedAt: null,
};

export const ENROLMENT_LIMITS = {
  /** Free text a member types when they leave. Optional, and never shown
      back to the cohort: the programme's lead and admins read it. */
  dropOutReason: 500,
  /** Why their group's time does not work, with the answer "No, I need a
      different time". Required with it; the programme's lead and admins read it. */
  timeAnswerReason: 500,
  /** Which other times would, from the same form. Required with it. */
  timeAnswerAlternatives: 300,
  /**
   * How many of the group's sessions one "Most weeks, not all" answer may
   * name. A run's plan holds at most 60 weeks and a group meets at most
   * twice a week, so no real answer comes near it: it bounds a body, and a
   * stored list read back.
   */
  timeAnswerSessions: 120,
} as const;

/**
 * A session's key as `sessionKey` in `src/lib/firestore/courses.ts` makes it,
 * and as a register's id ends: "w03", or "w03-2" for a week's second session.
 * The same pattern the ticket's "Can't make it" reads a press by
 * (`src/lib/courses/cantMakeIt/model.ts`).
 */
const SESSION_KEY = /^w\d{2,3}(?:-[2-9])?$/;

/** Whether a value is a session's key ("w03", "w03-2"). */
export function isSessionKey(value: unknown): value is string {
  return typeof value === "string" && SESSION_KEY.test(value);
}

/** Where a session key sorts: its week, then its occurrence, so "w03" < "w03-2" < "w10". */
function sessionOrder(key: string): number {
  const [week, occurrence] = key.slice(1).split("-");
  return Number(week) * 10 + (occurrence ? Number(occurrence) : 1);
}

/** Session keys once each, in the group's order, the way an answer keeps them. */
export function orderedSessionKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)].sort((a, b) => sessionOrder(a) - sessionOrder(b));
}

/**
 * "CAN YOU MAKE THIS TIME MOST WEEKS?" (Zach, 29 Oct 2026, three answers
 * from 5 Nov 2026): the person's own answer about the group Publish told
 * them, kept on their seat.
 *
 *  - `yes`: they can make it.
 *  - `mostWeeks`: they can make it most weeks, not all. `sessionKeys` are
 *    the group's sessions they said they can't make, by their registers'
 *    keys, in the group's order (none is an answer too). Each is recorded as
 *    excused on its register, the way the ticket's "Can't make it" records
 *    it (`src/lib/courses/cantMakeIt/seat.ts`), and the ticket keeps this
 *    list in step when it records or takes one back. They can make the
 *    group's time: nobody moves them for it.
 *  - `cant`: they need a different time most weeks, why, and which other
 *    times would. It KEEPS their place and their seat and asks to be moved.
 *    It is not leaving (`src/lib/courses/leaveRun.ts`), which gives the
 *    place back, and nothing about it touches that path.
 *
 * Until 5 Nov 2026 the question had two answers, and some people who could
 * not make one week answered `cant`. An admin or the programme's lead can
 * read such an answer as `mostWeeks` ("They meant some weeks",
 * `src/lib/courses/timeAnswer/someWeeks.ts`): the answer keeps the words the
 * person wrote, so a `mostWeeks` answer has `reason` and `alternatives` only
 * then.
 *
 * `forGroupId` is the group the answer was given about. Every writer that
 * clears Publish's stamp deletes the answer in the same write. A told seat
 * keeps both through a move, and a reader shows an answer only while it is
 * about the seat's group now (`currentTimeAnswer` in
 * `src/lib/courses/timeAnswer/model.ts`), so a stale answer can never show,
 * and somebody moved by mistake and moved back has their answer again.
 *
 * Written by `POST /api/courses/runs/[runId]/time-answer` on the caller's
 * own seat, by the ticket's "Can't make it" (only a `mostWeeks` answer's
 * list), and by staff reading a `cant` as `mostWeeks`. Read by the person,
 * the programme's lead and admins, never by facilitators or the rest of the
 * group, who see only the register. Kept with the seat, so it is deleted
 * with the account and with the run.
 */
export type TimeAnswerKind = "yes" | "mostWeeks" | "cant";

export type StoredTimeAnswer =
  | {
      kind: "yes" | "cant";
      /** Why the time does not work: set with `cant`, null with `yes`. */
      reason: string | null;
      /** Which other times would: set with `cant`, null with `yes`. */
      alternatives: string | null;
      /** The group it was given about. */
      forGroupId: string;
      at: Date | null;
    }
  | {
      kind: "mostWeeks";
      /** Their own words, kept when staff read a `cant` as most weeks; null otherwise. */
      reason: string | null;
      alternatives: string | null;
      /** The sessions they can't make, by register key, in the group's order. */
      sessionKeys: string[];
      forGroupId: string;
      at: Date | null;
    };

/**
 * ONE ENTRY OF A PLACE'S RECORD OF GROUPS BY WEEK: the group they were in
 * from `fromWeek` (a cohort week, 1 and up) until the next entry's week, or
 * for good when it is the last.
 *
 * THE RECORD (`groupsByWeek`) is what lets a person's group differ from week
 * to week: moved from Group C to Group F from week 3, their weeks 1 and 2 are
 * Group C's (the session they were due at, their marks, the register their
 * line is on) and their weeks from 3 are Group F's. Written only by
 * `moveFromWeek` (`src/lib/courses/moveFromWeek.ts`), which sets the place's
 * group and the record in one transaction, and kept consistent there:
 * entries in week order, no two from the same week, no two in a row naming
 * the same group, and the last entry's group the place's group. Every other
 * writer of a place's group deletes the record whenever it changes the
 * group, so the record can never disagree with it.
 *
 * Who reads whose work is NOT this record's business: their facilitators
 * now, the roster and who reads their work read the place's group
 * (`groupId`), the group they are in now.
 */
export type GroupFromWeek = { groupId: string; fromWeek: number };

/**
 * Bounds on a stored record: a run's plan holds at most 60 weeks, so no
 * real record has more entries than that, nor a week past it.
 */
export const GROUPS_BY_WEEK_LIMITS = { entries: 60, week: 60 } as const;

export type CourseEnrolmentDoc = {
  /** Firestore doc id: `courseEnrolmentId(runId, uid)`. */
  id: string;
  runId: string;
  courseId: string;
  uid: string;
  /**
   * The single group placement — scalar by design (see module comment).
   * Null = accepted but not yet allocated to a group.
   */
  groupId: string | null;
  status: CourseEnrolmentStatus;
  role: CourseEnrolmentRole;
  /**
   * The run stream this member is on (`courseRuns.streams[].id`), or null on
   * a run with no streams. Scopes which of a week's materials, exercises and
   * checklist items they see, through `src/lib/courses/streamScope.ts`.
   *
   * The whole collection is `allow write: if false`, so this is server-owned
   * by construction. The ids stored here point into the run's `streams` list,
   * which is server-owned too.
   */
  streamId: string | null;
  /**
   * Rolled-up attendance (see `EnrolmentAttendanceRollup`). Living here, on a
   * row the member can already read, is what lets a learner see their own
   * attendance without any new read rule: the registers themselves stay
   * `read: if false` because one register carries the whole group's marks.
   */
  attendance: EnrolmentAttendanceRollup;
  /** Whether this member has cleared the run's submission bar
      (`courseRuns.submissionExerciseRef`). */
  submissionDone: boolean;
  /**
   * WHEN THEY LEFT THE RUN: by themselves (the enrol route's leave, which
   * cannot be undone by the person taking it), or taken off by staff (the
   * remove route). Somebody who left by themselves is never removed (the
   * remove route refuses them), so the day they left stays. Every page that
   * says "Left Fri 13 Nov" reads it from here, and
   * putting somebody back (reinstate, or a placement on the board) clears it.
   * Null on every enrolment that has not left, and on a row removed before
   * the remove route recorded the day.
   */
  droppedOutAt: Date | null;
  /**
   * WHEN STAFF LAST PUT THEM BACK on the run after they had left it (by
   * themselves or by Remove), where the application form had no place to
   * give them again: the allocate route writes it as it brings the seat back.
   * Putting somebody back is a deliberate act on a card that says they left,
   * so from then on they are not somebody who gave their place back
   * (`gaveTheirPlaceBack` in `src/lib/courses/placeGivenBack.ts`), and the
   * next Publish tells them their group. Where the form's place could be
   * given to them again it is, and the form says they hold it, so this is
   * cleared instead. Null on a seat never put back, or put back with its place.
   */
  putBackAt: Date | null;
  /**
   * Optional free text from the leave form (see `ENROLMENT_LIMITS`). Read by
   * the programme's lead and admins (the programme's Overview), and by nobody
   * else; the leave form says so.
   */
  dropOutReason: string | null;
  /**
   * True when the member enrolled themselves on an OPEN-mode run, false when
   * a seat was allocated to them out of admissions. Kept as its own field
   * rather than derived from `applicationId == null`, because a direct
   * admin-created enrolment is also application-less and is not self-service.
   */
  selfEnrolled: boolean;
  /** The application this enrolment came from; null for direct enrolments. */
  applicationId: string | null;
  /**
   * The cohort week at which this member joined. Scopes every progress
   * percentage and the attendance grid so mid-run joiners aren't shown as
   * "behind" on weeks that predate them.
   */
  joinedWeekNumber: number;
  /**
   * High-water mark for the lazy My Work task mirroring (see courseTasks.ts):
   * the sync-tasks route short-circuits when this already equals the current
   * anchor week, so the common case is one doc read and zero writes.
   */
  lastTaskSyncedWeek?: number;
  /**
   * When Publish last emailed its owner about a group: the first email about
   * their group ("Your group"), or "You’ve moved" once they were moved since.
   * The group that email was about is `toldGroupId`.
   *
   * It is what lets a placement be SHOWN: an allocated seat without it is
   * somebody nobody has told yet, and `placementIsTold` below keeps it to the
   * board until Publish has. And it is the idempotency guard for Publish's
   * first email: a press never sends that email to a seat that is told.
   *
   * ONCE TOLD, A SEAT STAYS TOLD THROUGH ANY MOVE. No change of `groupId` on
   * a told seat clears it, to another group, to no group, or back: the
   * person is shown the group they are in now at once, and the next Publish
   * owes them "You’ve moved" only while they sit in a group other than the
   * one they were told about (`movedSinceTold`). A move of a seat nobody has
   * told clears nothing, because there is nothing to clear, and Publish tells
   * them. Leaving keeps it; Remove, and putting back somebody who left,
   * clear it, and the next Publish tells them afresh.
   */
  allocatedEmailAt?: Date | null;
  /**
   * What became of that email, written beside the stamp by Publish: handed
   * to the mail provider, held because this copy of the site may not write
   * to the address, or stopped by the do-not-email list. Absent on a stamp
   * written before Publish recorded it. Read only beside the stamp.
   */
  allocatedEmailDelivery?: "sent" | "held" | "suppressed";
  /**
   * THE GROUP ITS OWNER WAS TOLD ABOUT, written beside `allocatedEmailAt`
   * wherever that is written (Publish's first email, and its "You’ve moved"
   * email), and deleted beside it wherever that is deleted. Null on a seat
   * nobody has told, and on a seat told before this was kept, which is read
   * as told about the group it is in (`groupToldAbout`); the first move of such
   * a seat writes the group it leaves here, in the same write.
   */
  toldGroupId: string | null;
  /**
   * WHICH GROUP THEY WERE IN, FROM WHICH WEEK (see `GroupFromWeek`): the
   * groups of a place moved during the run, in week order, the last being
   * the group they are in now. Absent on every place nobody has moved from a
   * week, and on a stored value that is not a whole record: such a place
   * reads as it always has, the group it is in now for every week
   * (`groupForWeek`).
   */
  groupsByWeek?: GroupFromWeek[];
  /**
   * The person's answer to "can you make this time?" (see
   * `StoredTimeAnswer`). Absent until they answer, and on a stored value
   * that is not a whole answer.
   */
  timeAnswer?: StoredTimeAnswer;
  createdAt?: Date | null;
  updatedAt?: Date | null;
};

/**
 * Deterministic doc id — see module comment for why this is the invariant.
 * CONSTRUCT-ONLY: `runId` and `uid` are stored as fields, so lookups use
 * queries or this constructor, never id parsing. Also the O(1) existence
 * check rules use for `isEnrolledActive()` (a `get()` on the exact path,
 * no array scan).
 */
export function courseEnrolmentId(runId: string, uid: string): string {
  return `${runId}__${uid}`;
}

/**
 * WHETHER AN ENROLMENT HAS LEFT THE RUN: withdrawn by its owner, or removed
 * by staff. Somebody who has left keeps their row on the run's own list,
 * where it may still say Accepted (changing that is an admin's step), so
 * every reader that counts who is still to place asks this first: the
 * allocation board names them as having left, Publish does not wait for
 * them, and the Attendance tab and the Overview list them as "Left".
 *
 * Takes the bare status, so the board's own row (whose status may also be
 * "none", for somebody with no enrolment yet) asks the same question.
 */
export function enrolmentHasLeft(status: string): boolean {
  return status === "withdrawn" || status === "removed";
}

/**
 * WHETHER STAFF HAVE PUT THIS SEAT BACK ON THE RUN since it left, and it is
 * on the run still (`putBackAt`, written by the allocate route as it brings
 * the seat back). The allocation board's row and Publish's plan both read it
 * here, and hand it to `gaveTheirPlaceBack` (`src/lib/courses/placeGivenBack.ts`):
 * somebody put back is not somebody who gave their place back. A seat that
 * has left again is not back.
 */
export function enrolmentIsPutBack(enrolment: Pick<CourseEnrolmentDoc, "putBackAt" | "status">): boolean {
  return enrolment.putBackAt !== null && !enrolmentHasLeft(enrolment.status);
}

/**
 * WHETHER A PLACEMENT HAS BEEN TOLD, and so may be shown.
 *
 * A placement is somebody's seat in a group. Who may learn of it depends on
 * whether its owner has been told:
 *
 *  - A seat somebody took for themselves on an open run is theirs from the
 *    moment they take it: they chose the group (`selfEnrolled`).
 *  - A seat an admin allocated is told once Publish has emailed its owner
 *    about a group (`allocatedEmailAt`). Until then it is the board's working
 *    copy: moving people around on the board tells nobody anything. Once
 *    told, it stays told whatever group it is moved to, so its owner is never
 *    hidden by a move: they see the group they are in now at once, and the
 *    next Publish emails them about it ("You’ve moved") while it is not the
 *    group they were told about (`movedSinceTold`).
 *  - A facilitator's own enrolment is not a placement in a group, and is
 *    always told: a facilitator sees the group they run, its day, time and
 *    room from the moment they are added.
 *
 * An untold placement is shown to nobody but an admin (`placementIsShownTo`).
 * Its owner reads their member area as they did before they were placed, the
 * group's facilitators and other members are not shown their name, and no
 * email or notification about their group reaches them.
 *
 * Every reader of placements asks one of these two functions, or one of the
 * two made of the first below (`groupToldAbout`, `movedSinceTold`);
 * `tests/course-hub-group-published-readers.test.mjs` lists them all.
 */
export function placementIsTold(
  enrolment: Pick<CourseEnrolmentDoc, "role" | "selfEnrolled" | "allocatedEmailAt">,
): boolean {
  if (enrolment.role !== "learner") return true;
  if (enrolment.selfEnrolled) return true;
  return enrolment.allocatedEmailAt instanceof Date;
}

/**
 * Whether one placement may be shown to one viewer: to an admin always (the
 * admin places people, and sees the board), and to anybody else, its owner
 * included, only once it has been told. The viewer is the session's own
 * role, so an admin viewing the site as a member is the member here.
 */
export function placementIsShownTo(
  enrolment: Pick<CourseEnrolmentDoc, "role" | "selfEnrolled" | "allocatedEmailAt">,
  viewer: { isAdmin: boolean },
): boolean {
  return viewer.isAdmin || placementIsTold(enrolment);
}

/**
 * THE GROUP A TOLD SEAT'S OWNER WAS TOLD ABOUT: `toldGroupId`, or, on a seat
 * told before that was kept, the group it is in now. Asked only of a seat
 * that is told (`placementIsTold`).
 */
export function groupToldAbout(enrolment: Pick<CourseEnrolmentDoc, "groupId" | "toldGroupId">): string | null {
  return enrolment.toldGroupId ?? enrolment.groupId;
}

/**
 * WHETHER A TOLD SEAT HAS MOVED SINCE ITS OWNER WAS TOLD: a learner's active
 * seat, in a group, told (`placementIsTold`), in a group other than the one
 * they were told about (`groupToldAbout`). It is what the next Publish owes
 * them: "You’ve moved", about the group they are in now, and never the
 * first email about a group.
 *
 * DERIVED, NEVER STORED. Moving them back to the group they were told about
 * owes nothing, with no write beyond the move itself; a move from A to B to
 * C owes one email, about C; and Publish, once that email has gone, writes
 * the group it was about into `toldGroupId`, so it is owed no more.
 */
export function movedSinceTold(
  enrolment: Pick<CourseEnrolmentDoc, "role" | "status" | "groupId" | "toldGroupId" | "selfEnrolled" | "allocatedEmailAt">,
): boolean {
  return (
    enrolment.role === "learner" &&
    enrolment.status === "active" &&
    enrolment.groupId !== null &&
    placementIsTold(enrolment) &&
    enrolment.groupId !== groupToldAbout(enrolment)
  );
}

/**
 * WHICH GROUP A PERSON WAS IN FOR ONE WEEK OF THE RUN: the one question every
 * reader of a WEEK's group asks (the session they were due at, their mark
 * for the week, the register their line is on).
 *
 *  - No record (every place nobody has moved from a week, and every place
 *    moved before the record existed): the group they are in now, for every
 *    week, exactly as every reader read it before.
 *  - A record: the group of its last entry from that week or earlier; a week
 *    before its first entry reads the first entry's group, the group they
 *    joined, since nothing says they were anywhere else. Whether they had
 *    joined by then is the reader's own floor (`joinedWeekNumber`), as it
 *    always was.
 *
 * It answers the group the record names whether or not that group still
 * meets: a reader that finds no live group for the answer has no session,
 * no register and no mark for that week. A reader that means the group they
 * are in NOW (their facilitators, the roster, who reads their work) reads
 * `groupId` and never this.
 */
export function groupForWeek(
  place: Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek">,
  weekNumber: number,
): string | null {
  const record = place.groupsByWeek;
  if (!record || record.length === 0 || !Number.isFinite(weekNumber)) return place.groupId;
  let found = record[0].groupId;
  for (const entry of record) {
    if (entry.fromWeek > weekNumber) break;
    found = entry.groupId;
  }
  return found;
}

/** The group the place BELONGS to in that week: its copy of the week, and whose member they are. Never a one-week visit's host. */
export function ownGroupForWeek(
  place: Pick<CourseEnrolmentDoc, "groupId" | "groupsByWeek">,
  weekNumber: number,
): string | null {
  const record = place.groupsByWeek;
  if (!record || record.length === 0 || !Number.isFinite(weekNumber)) return place.groupId;
  let found = record[0].groupId;
  for (const entry of record) {
    if (entry.fromWeek > weekNumber) break;
    found = entry.groupId;
  }
  return found;
}

type Raw = Record<string, unknown>;

/** A group id a document can be addressed by: some text, and no path separator. */
function isGroupId(v: unknown): v is string {
  return typeof v === "string" && v !== "" && !v.includes("/") && v !== "." && v !== "..";
}

/**
 * A stored record of groups by week, or undefined to read the place as it
 * always has. A RECORD IS READ WHOLE OR NOT AT ALL: every entry a group id
 * and a whole week from 1 to `GROUPS_BY_WEEK_LIMITS.week`, the weeks rising
 * strictly in the stored order, no more entries than the limit, and the last
 * entry's group the place's group. A record that contradicts the place (its
 * last group is not the group they are in now, or they are in no group) is
 * not read: the place's group is the truth every reader of "now" goes by,
 * and a record that disagrees with it cannot be trusted about the weeks
 * before. Two entries in a row naming one group are read as one, and a
 * record naming one group says nothing the place does not, so it reads as
 * none.
 */
function asGroupsByWeek(v: unknown, groupId: string | null): GroupFromWeek[] | undefined {
  if (!Array.isArray(v) || v.length === 0 || v.length > GROUPS_BY_WEEK_LIMITS.entries) return undefined;
  if (!isGroupId(groupId)) return undefined;
  const out: GroupFromWeek[] = [];
  let lastWeek = 0;
  for (const item of v) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const entry = item as Raw;
    const week = entry.fromWeek;
    if (!isGroupId(entry.groupId)) return undefined;
    if (typeof week !== "number" || !Number.isInteger(week) || week < 1 || week > GROUPS_BY_WEEK_LIMITS.week) return undefined;
    if (week <= lastWeek) return undefined;
    lastWeek = week;
    if (out.length > 0 && out[out.length - 1].groupId === entry.groupId) continue;
    out.push({ groupId: entry.groupId, fromWeek: week });
  }
  if (out[out.length - 1].groupId !== groupId) return undefined;
  return out.length > 1 ? out : undefined;
}

function tsToDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const obj = v as { toDate?: () => Date };
  return typeof obj?.toDate === "function" ? obj.toDate() : null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function asCount(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return 0;
  return Math.floor(v);
}

function asAttendanceRollup(v: unknown): EnrolmentAttendanceRollup {
  const raw = (v ?? {}) as Raw;
  return {
    sessionsHeld: asCount(raw.sessionsHeld),
    attendedInFull: asCount(raw.attendedInFull),
    late: asCount(raw.late),
    leftEarly: asCount(raw.leftEarly),
    absent: asCount(raw.absent),
    excused: asCount(raw.excused),
    // Absent on every rollup computed before the register recorded where
    // people were: 0, everybody in the room.
    online: asCount(raw.online),
    lastPushedSessionKey:
      typeof raw.lastPushedSessionKey === "string" && raw.lastPushedSessionKey
        ? raw.lastPushedSessionKey
        : null,
    lastComputedAt: tsToDate(raw.lastComputedAt),
  };
}

/** A line of the person's own, trimmed and capped, or null for nothing written. */
function ownWords(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/**
 * A stored answer, or undefined when it is not a whole one: a known kind, the
 * group it is about, for `cant` both of what they wrote, and for `mostWeeks`
 * a list of the sessions they can't make (empty is a list). A `yes` carries
 * no words, whatever the document holds; a `mostWeeks` keeps what staff kept
 * of a `cant`'s words, and lists only session keys, once each, in order.
 */
function asTimeAnswer(v: unknown): StoredTimeAnswer | undefined {
  if (!v || typeof v !== "object" || Array.isArray(v)) return undefined;
  const raw = v as Raw;
  if (raw.kind !== "yes" && raw.kind !== "cant" && raw.kind !== "mostWeeks") return undefined;
  if (typeof raw.forGroupId !== "string" || !raw.forGroupId) return undefined;
  if (raw.kind === "yes") {
    return { kind: "yes", reason: null, alternatives: null, forGroupId: raw.forGroupId, at: tsToDate(raw.at) };
  }
  if (raw.kind === "mostWeeks") {
    if (!Array.isArray(raw.sessionKeys)) return undefined;
    return {
      kind: "mostWeeks",
      reason: ownWords(raw.reason, ENROLMENT_LIMITS.timeAnswerReason),
      alternatives: ownWords(raw.alternatives, ENROLMENT_LIMITS.timeAnswerAlternatives),
      sessionKeys: orderedSessionKeys(raw.sessionKeys.filter(isSessionKey)).slice(0, ENROLMENT_LIMITS.timeAnswerSessions),
      forGroupId: raw.forGroupId,
      at: tsToDate(raw.at),
    };
  }
  const reason = ownWords(raw.reason, ENROLMENT_LIMITS.timeAnswerReason);
  const alternatives = ownWords(raw.alternatives, ENROLMENT_LIMITS.timeAnswerAlternatives);
  if (!reason || !alternatives) return undefined;
  return { kind: "cant", reason, alternatives, forGroupId: raw.forGroupId, at: tsToDate(raw.at) };
}

export function normalizeCourseEnrolment(id: string, data: Raw): CourseEnrolmentDoc {
  const status = data.status as CourseEnrolmentStatus;
  const doc: CourseEnrolmentDoc = {
    id,
    runId: str(data.runId),
    courseId: str(data.courseId),
    uid: str(data.uid),
    groupId: (data.groupId as string | null | undefined) ?? null,
    status: ENROLMENT_STATUSES.includes(status) ? status : "active",
    role: data.role === "facilitator" ? "facilitator" : "learner",
    streamId:
      typeof data.streamId === "string" && data.streamId ? data.streamId : null,
    attendance: asAttendanceRollup(data.attendance),
    submissionDone: data.submissionDone === true,
    droppedOutAt: tsToDate(data.droppedOutAt),
    putBackAt: tsToDate(data.putBackAt),
    dropOutReason:
      typeof data.dropOutReason === "string" && data.dropOutReason
        ? data.dropOutReason.slice(0, ENROLMENT_LIMITS.dropOutReason)
        : null,
    selfEnrolled: data.selfEnrolled === true,
    applicationId: (data.applicationId as string | null | undefined) ?? null,
    joinedWeekNumber:
      typeof data.joinedWeekNumber === "number" && Number.isFinite(data.joinedWeekNumber)
        ? Math.max(1, Math.floor(data.joinedWeekNumber))
        : 1,
    toldGroupId: typeof data.toldGroupId === "string" && data.toldGroupId ? data.toldGroupId : null,
    createdAt: tsToDate(data.createdAt),
    updatedAt: tsToDate(data.updatedAt),
  };
  if (
    typeof data.lastTaskSyncedWeek === "number" &&
    Number.isFinite(data.lastTaskSyncedWeek)
  ) {
    doc.lastTaskSyncedWeek = Math.floor(data.lastTaskSyncedWeek);
  }
  const allocatedEmailAt = tsToDate(data.allocatedEmailAt);
  if (allocatedEmailAt) doc.allocatedEmailAt = allocatedEmailAt;
  const delivery = data.allocatedEmailDelivery;
  if (delivery === "sent" || delivery === "held" || delivery === "suppressed") {
    doc.allocatedEmailDelivery = delivery;
  }
  const timeAnswer = asTimeAnswer(data.timeAnswer);
  if (timeAnswer) doc.timeAnswer = timeAnswer;
  const groupsByWeek = asGroupsByWeek(data.groupsByWeek, doc.groupId);
  if (groupsByWeek) doc.groupsByWeek = groupsByWeek;
  return doc;
}
