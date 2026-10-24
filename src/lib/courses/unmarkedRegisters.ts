import type { ResolvedSession } from "./sessions";
import type { SourceRef, TaskDoc } from "@/lib/firestore/tasks";
import { REGISTER_FOLLOW_UP_TASK_SOURCE } from "@/lib/firestore/courseTasks";

/**
 * THE UNMARKED-REGISTER FOLLOW-UP, everything about it that is arithmetic.
 *
 * A register nobody finishes (pushes) costs the group its record: every
 * member carries a session in a denominator reviewers read as a shortfall,
 * and nobody sees their mark. While next week's email is not on its schedule
 * it costs the group that email too, because the push is what sends it then.
 * Neither failure announces itself. This module is the maths behind the two
 * jobs that do: a reminder to the group's facilitators
 * (`courses-register-reminders`, after `unmarkedRegisterGraceHours`) and,
 * later, a task for the programme's lead and the admins
 * (`courses-unmarked-registers`, after `registerTaskHours`).
 *
 * PURE. No Firestore, no clock unless one is passed, no runtime imports at
 * all beyond types and one string constant, so the unit suite can transpile
 * it standalone on the repo's Node 20 (tests/unmarked-registers.test.mjs).
 * The Firestore half is `src/lib/scheduler/jobs/unmarkedRegisters.ts`.
 *
 * ── THE WINDOW IS A BAND, NOT A THRESHOLD ───────────────────────────────────
 * Each job looks only at sessions whose END instant is between its own hours
 * (the reminder's `unmarkedRegisterGraceHours`, default 36; the task's
 * `registerTaskHours`, default 60) and those hours plus 24. A threshold ("older than the grace") would re-derive every unmarked
 * session of the whole term on every tick, which is exactly the read cost the
 * 60s ceiling cannot absorb; the marker would suppress the WRITES, and the
 * reads would still happen. A 24-hour band over a tick every 15 minutes gives
 * each session roughly ninety-six chances to be seen, which is enough slack for
 * a scheduler that has been down for most of a day.
 *
 * The band's cost, stated plainly: a register still unpushed a week later has
 * one task on the board and gets no second one. That is the right shape (a
 * follow-up you cannot get rid of is nagging, not a follow-up) but it does mean
 * the board is the only record, so the task must not be silently archived by
 * anything other than the push.
 *
 * ── "UNMARKED" MEANS "NOT PUSHED" ───────────────────────────────────────────
 * Three tests were available: no register document, a register with no marks,
 * or a register with `pushedAt` null. The job uses NOT PUSHED, which subsumes
 * the first two, because the push is the thing the task asks for. A register
 * half-marked and left open has had none of the effects a pushed one has: the
 * mirrors are not rebuilt, the group's reminder has not gone, and an admin
 * reading the attendance sees nothing. Asking for marks rather than for the
 * push would close the task on a register that still owes the group its email.
 *
 * `held: false` is the exception and it is not a special case: a session the
 * facilitator has said did not happen is one nobody has to chase, and the
 * switch is exactly the statement the register is complete.
 */

/**
 * How wide the band is, past the grace. Twenty-four hours, so a scheduler down
 * for the best part of a day still catches every session it slept through.
 */
export const FOLLOW_UP_WINDOW_HOURS = 24;

const HOUR_MS = 3_600_000;

/** When the follow-up becomes due: the session's end plus the grace. */
export function followUpDueAt(endsAt: Date, graceHours: number): Date {
  return new Date(endsAt.getTime() + graceHours * HOUR_MS);
}

/**
 * Is this session inside the scan band right now?
 *
 * Inclusive at the bottom (a session that has just reached its grace is due
 * this tick, not next) and EXCLUSIVE at the top, so the band and the band
 * after it cannot both claim the same instant. Both halves are asserted in the
 * unit suite: the boundaries are where a "chased twice" and a "never chased"
 * bug live, and neither is visible in a log.
 */
export function isWithinFollowUpWindow(
  endsAt: Date | null,
  now: Date,
  graceHours: number,
  windowHours: number = FOLLOW_UP_WINDOW_HOURS,
): boolean {
  // A session with no resolvable date is "cannot say", never "now". A run
  // whose dates have not been typed yet must not raise a task per group per
  // week for a term that has not started.
  if (endsAt === null) return false;
  const ageHours = (now.getTime() - endsAt.getTime()) / HOUR_MS;
  return ageHours >= graceHours && ageHours < graceHours + windowHours;
}

/** What the job knows about a register before it decides to chase it. */
export type RegisterState = {
  /** Does the `courseAttendance` document exist at all? */
  exists: boolean;
  /** `held: false` means the facilitator has said the session did not happen. */
  held: boolean;
  pushedAt: Date | null;
};

/**
 * The one predicate. See "UNMARKED" MEANS "NOT PUSHED" above: a missing
 * document and a half-marked one are the same answer, and a not-held session
 * is nobody's to chase.
 */
export function isRegisterUnmarked(state: RegisterState): boolean {
  if (state.exists && !state.held) return false;
  return state.pushedAt === null;
}

// ---------------------------------------------------------------------------
// The resumable cursor
// ---------------------------------------------------------------------------

/**
 * The runs still to scan this pass, given the run ids that matched and the
 * cursor the last tick left behind.
 *
 * NO WRAP-AROUND, deliberately. The cursor is the last run scanned to
 * completion; a tick resumes AFTER it and runs to the end of the list, and the
 * job clears the cursor when it gets there so the next tick starts from the
 * top again. Wrapping would look fairer for one tick and would make "have we
 * been all the way round" unanswerable, which is the question an operator asks
 * when a group was not chased.
 *
 * A cursor naming a run that has since been settled, renamed or destroyed is
 * not an error and must not stall the scan: the id simply is not in the list,
 * `indexOf` returns -1, and the pass starts from the beginning. That is the
 * safe direction (a repeated scan is suppressed by the markers; a stalled one
 * is silence).
 */
export function runsToScan(
  runIds: readonly string[],
  cursor: string | null,
): string[] {
  const ordered = [...runIds].sort();
  if (!cursor) return ordered;
  const at = ordered.indexOf(cursor);
  return at < 0 ? ordered : ordered.slice(at + 1);
}

/**
 * Where the cursor should be left at the end of a pass.
 *
 * Three cases, and the third is the one that is easy to get wrong:
 *  - the pass reached the end of its queue (`hasMore` false): CLEARED, so the
 *    next pass starts from the top of the list;
 *  - the pass stopped part-way and finished at least one run: the last run it
 *    finished END TO END;
 *  - the pass stopped part-way having finished NOTHING (a tick that entered
 *    with a sliver of budget left, or one whose first run was interrupted):
 *    the cursor it came in with, UNCHANGED. Writing null here would quietly
 *    restart the whole list on every such tick, and the tail of the list is
 *    then never reached, which is exactly the silence the cursor exists to
 *    prevent.
 */
export function nextScanCursor(
  hasMore: boolean,
  lastFinished: string | null,
  current: string | null,
): string | null {
  if (!hasMore) return null;
  return lastFinished ?? current;
}

// ---------------------------------------------------------------------------
// The task
// ---------------------------------------------------------------------------

/**
 * `course-register__{runId}__{groupId}__{sessionKey}`.
 *
 * CONSTRUCT-ONLY, never parsed: run and group ids are `slugId()` values
 * carrying their own `__`, so this string has no second valid split. Every
 * component that matters is on the task's `sourceRef` as data.
 */
export function registerFollowUpTaskId(
  runId: string,
  groupId: string,
  sessionKeyValue: string,
): string {
  return `${REGISTER_FOLLOW_UP_TASK_SOURCE}__${runId}__${groupId}__${sessionKeyValue}`;
}

/**
 * Where the task goes when the id above is already taken.
 *
 * Still deterministic, because the marker is claimed before the write and
 * stamped after it: a crash in between leaves a later tick re-deriving the
 * same unit of work, and a random id would put a second card on the board
 * every time that happened.
 */
export function registerFollowUpFallbackTaskId(
  runId: string,
  groupId: string,
  sessionKeyValue: string,
): string {
  return `${registerFollowUpTaskId(runId, groupId, sessionKeyValue)}__alt`;
}

/**
 * Who a register task is for: the lead of the programme that names the run,
 * when there is one standing behind the name, then every admin.
 *
 * The LEAD FIRST, so the completer cap (the tasks rules' ten) can never drop
 * the one person the task is most about; the admins after, in the stable
 * order the caller read them in, deduplicated (a lead may be an admin too).
 */
export function registerTaskCompleters(
  leadUid: string | null,
  adminUids: readonly string[],
  cap: number,
): string[] {
  const out: string[] = [];
  for (const uid of [leadUid, ...adminUids]) {
    if (!uid || out.includes(uid)) continue;
    out.push(uid);
  }
  return out.slice(0, Math.max(0, cap));
}

/**
 * Is the document already at the deterministic id the tick's OWN task?
 *
 * A task's id says nothing about who made it, so the job reads the task back
 * and checks its identity before trusting it.
 *
 * THE TEST IS IDENTITY, NOT SHAPE, and it is three-legged on purpose:
 *  - `source` is the register follow-up source;
 *  - `sourceRef.cohortId` names this run;
 *  - an admin is among the completers, which is what the task is FOR.
 * All three must hold.
 *
 * A document that has VANISHED between the create and the read counts as NOT
 * ours, the same failing-closed choice the sync-tasks read-back makes: the cost
 * is one extra card.
 */
export function isOurFollowUpTask(
  data: Record<string, unknown> | undefined,
  expect: { runId: string; adminUids: readonly string[] },
): boolean {
  if (!data) return false;
  if (data.source !== REGISTER_FOLLOW_UP_TASK_SOURCE) return false;
  const ref = data.sourceRef;
  if (!ref || typeof ref !== "object") return false;
  if ((ref as Record<string, unknown>).cohortId !== expect.runId) return false;
  const completers = data.completerUids;
  if (!Array.isArray(completers)) return false;
  return expect.adminUids.some((uid) => completers.includes(uid));
}

// ---------------------------------------------------------------------------
// The copy
// ---------------------------------------------------------------------------

/**
 * "Tuesday 29 September". Noon UTC, far enough from either boundary that no
 * London offset can move the civil date this label names, the same trick
 * `courseNudgeSessionWhen` uses. "" when there is no usable date, and every
 * caller drops the phrase whole rather than printing half of one.
 */
export function sessionDateLabel(dateKey: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return "";
  const at = new Date(`${dateKey}T12:00:00Z`);
  if (Number.isNaN(at.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(at);
}

export type FollowUpCopyArgs = {
  courseTitle: string;
  groupName: string;
  weekNumber: number;
  occurrence: number;
  dateKey: string;
  /**
   * True when next week's email goes on its schedule, so the register's
   * button is "Finish the register" and finishing it emails nobody. False
   * while the push still sends that email.
   */
  scheduled: boolean;
};

/** Title, clamped by the caller to `TASK_FIELD_LIMITS.title`. */
export function registerFollowUpTitle(args: FollowUpCopyArgs): string {
  const where = args.groupName || "a group";
  return `Register not finished: ${where}, week ${args.weekNumber}`;
}

/**
 * The card's body. Plain text, rendered as text nodes by the task UI, and it
 * says the same three things every follow-up says: what has not happened, what
 * that costs, and the one press that fixes it.
 *
 * Which press, and what it costs, depend on whether next week's email is on
 * its schedule: while it is, the button is "Finish the register" and the
 * email is not waiting on it; while it is not, the button is "Push
 * attendance" and the group has heard nothing about next week either.
 */
export function registerFollowUpDescription(args: FollowUpCopyArgs): string {
  const day = sessionDateLabel(args.dateKey);
  const when = day
    ? `week ${args.weekNumber} on ${day}`
    : `week ${args.weekNumber}`;
  const occurrence =
    args.occurrence > 1 ? ` (session ${args.occurrence} of that week)` : "";
  const course = args.courseTitle || "a course";
  const group = args.groupName || "this group";
  const button = args.scheduled ? "Finish the register" : "Push attendance";
  return [
    `${group} on ${course} has not had its register finished for ${when}${occurrence}.`,
    "",
    args.scheduled
      ? "Until it is, the session is missing from the attendance record, which reviewers read as evidence of who took part, and nobody in the group can see their mark. Next week's email goes on its own schedule and is not waiting on this."
      : "Two things are waiting on that press: the attendance record, which reviewers read as evidence of who took part, and the reminder email for the next session, which the push is what sends. Until it happens the group looks like a room full of absences and has heard nothing about next week.",
    "",
    `What to do: ask the group's facilitator to open the register and press ${button}. If the session did not happen, the Didn't happen switch on the column says so, and the button then works as normal. An admin can do either from the group's register page.`,
  ].join("\n");
}

export type FollowUpTaskArgs = {
  runId: string;
  groupId: string;
  session: Pick<
    ResolvedSession,
    "weekNumber" | "occurrence" | "sessionKey" | "dateKey"
  >;
  courseTitle: string;
  groupName: string;
  /**
   * Who the task is for, from `registerTaskCompleters`: the run's lead when
   * it has one, then every admin, deduplicated and capped. Completers.
   */
  completerUids: readonly string[];
  /** Who the task is filed as having created it. An admin uid, never "". */
  creatorUid: string;
  /** The session's end plus the task's hours. */
  dueDate: Date;
  now: Date;
  /** Whether next week's email is on its schedule; see `FollowUpCopyArgs`. */
  scheduled: boolean;
  /** `TASK_FIELD_LIMITS.title` / `.description`, passed so this stays pure. */
  limits: { title: number; description: number };
};

/**
 * The `tasks/{id}` payload, ready for `.create()`.
 *
 * WHY THESE FIELDS ARE WHAT THEY ARE:
 *  - `visibility: "committee"`, so the whole SU-recognised committee can see a
 *    cohort being chased. It is operational, not personal.
 *  - completers are the programme's LEAD and the ADMINS
 *    (`registerTaskCompleters`). The lead is who the programme belongs to;
 *    "every admin" is the one audience that is always somebody, so a run no
 *    programme names still lands on a board.
 *  - `reviewerUids: []`. The contract's prose asks for the admins as reviewers
 *    too; the rules cap `reviewerUids` at 5 while `completerUids` is capped at
 *    10, so on a committee of six admins a reviewer-mirrored task falls
 *    outside the band every non-admin update path checks. A chase needs no
 *    signoff ritual either: it is done when the register is pushed, and the
 *    push archives it.
 *  - `initialNotifyAt: now`, born already notified, so the task-email
 *    machinery never mails about it. The follow-up is a board card; a job that
 *    emailed every admin per unmarked group per week would be muted inside a
 *    fortnight.
 *  - `sourceRef` carries the group and the session ALONGSIDE the (cohortId,
 *    weekNumber) pair every other consumer reads, so the destroy sweep and the
 *    push's archive can both find this card by data rather than by parsing an
 *    id. Absent rather than null on a mirror, per the pinned-map rule.
 */
export function buildRegisterFollowUpTask(
  args: FollowUpTaskArgs,
): Omit<TaskDoc, "id"> {
  const copy: FollowUpCopyArgs = {
    courseTitle: args.courseTitle,
    groupName: args.groupName,
    weekNumber: args.session.weekNumber,
    occurrence: args.session.occurrence,
    dateKey: args.session.dateKey,
    scheduled: args.scheduled,
  };
  const sourceRef: SourceRef = {
    cohortId: args.runId,
    weekNumber: args.session.weekNumber,
    groupId: args.groupId,
    sessionKey: args.session.sessionKey,
  };
  return registerTaskPayload({
    title: registerFollowUpTitle(copy).slice(0, args.limits.title),
    description: registerFollowUpDescription(copy).slice(0, args.limits.description),
    creatorUid: args.creatorUid,
    completerUids: args.completerUids,
    dueDate: args.dueDate,
    sourceRef,
    now: args.now,
  });
}

/**
 * The `tasks/{id}` payload every register task shares: the unfinished
 * register's and the held email's. One shape, so the two cannot drift on the
 * fields the board, the rules and the run's destroy sweep read.
 */
export function registerTaskPayload(args: {
  title: string;
  description: string;
  creatorUid: string;
  completerUids: readonly string[];
  dueDate: Date;
  sourceRef: SourceRef;
  now: Date;
}): Omit<TaskDoc, "id"> {
  return {
    title: args.title,
    description: args.description,
    source: REGISTER_FOLLOW_UP_TASK_SOURCE,
    kind: "generic",
    projectId: null,
    creatorUid: args.creatorUid,
    completerUids: [...args.completerUids],
    reviewerUids: [],
    status: "todo",
    priority: "normal",
    dueDate: args.dueDate,
    archived: false,
    visibility: "committee",
    subtasks: [],
    blocks: [],
    blockConsents: {},
    subtaskStats: { done: 0, total: 0 },
    attachmentCount: 0,
    commentCount: 0,
    tags: [],
    sourceRef: args.sourceRef,
    // Not about a worksheet response, and about nothing else the artefact
    // union names. Written rather than omitted, like `sourceRef` above.
    artefact: null,
    sourceTemplateId: null,
    createdAt: args.now,
    updatedAt: args.now,
    completedAt: null,
    initialNotifyAt: args.now,
    pendingNotifyUids: [],
  };
}
