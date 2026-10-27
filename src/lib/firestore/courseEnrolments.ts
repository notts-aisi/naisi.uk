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
 */
export type EnrolmentAttendanceRollup = {
  sessionsHeld: number;
  attendedInFull: number;
  late: number;
  leftEarly: number;
  absent: number;
  excused: number;
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
  lastPushedSessionKey: null,
  lastComputedAt: null,
};

export const ENROLMENT_LIMITS = {
  /** Free text a member types when they leave. Optional, and never shown
      back to the cohort: the programme's lead and admins read it. */
  dropOutReason: 500,
} as const;

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
   * When the "you've been placed" email for the CURRENT `groupId` was sent.
   * The idempotency guard for allocation publish: re-publishing a run emails
   * only enrolments lacking this stamp, so newly placed people get their
   * email and everyone already told does not get it twice. The allocate route
   * clears it whenever `groupId` changes — the stamp certifies "emailed about
   * their current group", and a move invalidates that.
   *
   * It is also what lets a placement be SHOWN: an allocated seat without it
   * is somebody nobody has told yet, and `placementIsTold` below keeps it to
   * the board until Publish has.
   */
  allocatedEmailAt?: Date | null;
  /**
   * What became of that email, written beside the stamp by Publish: handed
   * to the mail provider, held because this copy of the site may not write
   * to the address, or stopped by the do-not-email list. Absent on a stamp
   * written before Publish recorded it. Read only beside the stamp: a move
   * clears the stamp and leaves this for the next Publish to overwrite.
   */
  allocatedEmailDelivery?: "sent" | "held" | "suppressed";
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
 *  - A seat an admin allocated is told when Publish has emailed its owner the
 *    group they are in NOW (`allocatedEmailAt`). Until then it is the board's
 *    working copy: moving people around on the board tells nobody anything.
 *    A move clears the stamp, so somebody moved after Publish is untold again
 *    until Publish is pressed again and emails them their new group.
 *  - A facilitator's own enrolment is not a placement in a group, and is
 *    always told: a facilitator sees the group they run, its day, time and
 *    room from the moment they are added.
 *
 * An untold placement is shown to nobody but an admin (`placementIsShownTo`).
 * Its owner reads their member area as they did before they were placed, the
 * group's facilitators and other members are not shown their name, and no
 * email or notification about their group reaches them.
 *
 * Every reader of placements asks one of these two functions;
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

type Raw = Record<string, unknown>;

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
    lastPushedSessionKey:
      typeof raw.lastPushedSessionKey === "string" && raw.lastPushedSessionKey
        ? raw.lastPushedSessionKey
        : null,
    lastComputedAt: tsToDate(raw.lastComputedAt),
  };
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
  return doc;
}
