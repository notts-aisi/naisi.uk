import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { getCurrentUser } from "@/lib/firebase/session";
import { londonDateKey, type CurrentWeek, type WeekPlanEntry } from "@/lib/courses/weekPlan";
import {
  resolveGroupCalendar,
  resolveGroupCalendars,
  resolveWeekDocs,
  type GroupCalendar,
  type WeekSource,
} from "@/lib/courses/groupResolve";
import { runProgrammeOf } from "@/lib/applications/handover/runProgramme";
import { runCrests } from "@/lib/crests/runs";
import type { ShownCrest } from "@/lib/crests/resolve";
import type { ProgrammeKind } from "@/lib/applications/model";
import { finishedForMember } from "@/lib/courses/finishing/record";
import { resolveSessions, sessionInstants, sessionRange, type ResolvedSession } from "@/lib/courses/sessions";
import { cardChangeFacts } from "@/lib/courses/sessionChange/model";
import { isOpenAt, weekOpening } from "@/lib/courses/weekOpening";
import { weekOneDoorFor, type PlaceBeforeGroups } from "@/lib/courses/weekOne/door";
import { groupsGoOutDay, weekOneOpenWords } from "@/lib/courses/groupsGoOut";
import type { WeekBlock } from "@/lib/courses/weekBlocks/model";
import { dueMoment } from "@/lib/courses/weekBlocks/due";
import type { When } from "@/lib/courses/weekBlocks/model";
import { taskNeeds, taskSubject, thisWeekOf, type TaskNeeds } from "@/lib/courses/weekBlocks/progress";
import { taskLabelWords } from "@/lib/courses/memberPageWords";
import { isReflectionResponse } from "@/lib/firestore/courseExercises";
import {
  ownAttendanceSessions,
  sessionsFromJoinWeek,
  type OwnAttendanceSession,
} from "@/lib/courses/ownAttendance";
import { attendanceDocId } from "@/lib/firestore/courseAttendance";
import {
  courseEnrolmentId,
  normalizeCourseEnrolment,
  placementIsShownTo,
  type CourseEnrolmentDoc,
  type CourseEnrolmentRole,
  type CourseEnrolmentStatus,
} from "@/lib/firestore/courseEnrolments";
import {
  normalizeCourseGroup,
  sessionForWeek,
  sessionModesOf,
  type CourseGroupDoc,
  type GroupSession,
  type GroupSessionMode,
} from "@/lib/firestore/courseGroups";
import {
  normalizeCourse,
  normalizeCourseRun,
  normalizeCourseWeek,
  weekDocId,
  type CourseRunDoc,
  type CourseRunStatus,
} from "@/lib/firestore/courses";
import type { SessionUser } from "@/lib/firebase/session";

/**
 * The learning space's one round trip: everything `/learn/[runId]` needs to
 * render — the run, its recomputed current week, the week index the WeekRail
 * draws, the caller's own enrolment, and their group's session card.
 *
 * ── WHO MAY READ (locked product decision) ──────────────────────────────────
 * Enrolled members of the run ∪ its facilitators ∪ admins. Admissions
 * reviewers and TRACK LEADS get 403 unless they also hold one of those:
 * admissions is a separate lane from the cohort, and staffing a run is not
 * membership of it. A track lead who wants the cohort view gets a facilitator
 * enrolment like everyone else. This is the same boundary the applications
 * route states from the other side — reviewing applications grants no access
 * to the cohort, facilitating grants no sight of applications.
 *
 * An enrolled member is one whose placement has been TOLD: an admin's
 * placement is shown to its owner once Publish has emailed them their group
 * (`placementIsShownTo`). Until then they are answered as before they were
 * placed. A facilitator reads their group's day, time and room from the
 * start, and no member's name is in this payload either way.
 *
 * WEEK 1 BEFORE GROUPS GO OUT (Q35 B) is the one change to that, on purpose:
 * somebody holding a place whom Publish has not told is answered week 1 and
 * nothing else once week 1's door is open to them (`weekOneDoorFor`, the one
 * answer; `beforeGroupsPayload` below). Their group, its sessions and every
 * other week still wait for Publish.
 *
 * `completed` enrolments read too: a finished cohort is the member's own
 * history, and nothing here is more sensitive to them than it was on their
 * last active day. Writing is unaffected — the courseProgress rules gate the
 * check-off path on an ACTIVE enrolment, so a completed run is read-only by
 * construction rather than by a flag in this payload.
 *
 * ── WHY THIS ROUTE EXISTS AT ALL ────────────────────────────────────────────
 * `courseGroups` is read-locked to the authoring tier in firestore.rules
 * because group docs carry the MEETING LINK; an enumerable meet link is an
 * open door onto a cohort call. So a member's own group card cannot come from
 * the client SDK — it comes from here, scoped to the one group they belong to,
 * with `meetingUrl` gated separately below.
 *
 * PII: facilitators travel as NAMES only (displayNameOf, never an email), and
 * no other member of the cohort appears in this payload at all.
 *
 * ── V2-3: THIS PAYLOAD IS THE MEMBER'S VIEW, NOT THE RUN'S ──────────────────
 * Per-group autonomy (copy-on-write) means a group can run its own calendar
 * and its own version of individual weeks. `run.startDate`, `run.weekPlan`,
 * `run.totalWeeks`, `currentWeek` and the `weeks` index below are therefore
 * all RESOLVED FOR THE CALLER through `groupResolve.ts` — their group's
 * override when it has one, the run canonical otherwise — rather than being
 * the run document's raw fields.
 *
 * That is deliberate and it is the cheap way to hold THE ONE DESIGN RULE:
 * every surface fed by this route (the run home, the WeekRail, the pacing
 * banner, the week page's session date, the Continue CTA) becomes group-aware
 * without any of them learning that groups can diverge. `calendarSource` says
 * WHICH calendar answered so a surface can disclose it; `forkedWeekIds` says
 * which weeks the caller must read out of their group's subcollection instead
 * of the run's (the client SDK can address either, and `useWeek` picks using
 * exactly this list).
 *
 * A caller with no group — unallocated, an admin, a facilitator of two groups
 * — resolves to the run canonical by construction, because `ownGroup` is null
 * and `resolveCalendar(run, null)` is the run's own calendar.
 *
 * ── ONE CALENDAR PER GROUP, NOT ONE PER CALLER ──────────────────────────────
 * The paragraph above is still true of the TOP-LEVEL fields, and it was once
 * the whole story: the page drew at most one group card, so the caller's
 * calendar and that card's calendar were the same object. They are not the
 * same thing, and a facilitator holding two groups is where the difference
 * shows. Their `ownGroup` is null, so every top-level field resolves to the
 * run canonical, and a card drawn off that would show a group three weeks
 * behind the run its own start date, its own week number and the wrong week's
 * session override, twice, identically, with nothing on the page to say which
 * of the two rooms was being described.
 *
 * So every entry in `groups[]` carries its OWN resolved calendar
 * (`OverviewGroup.calendar`) and every slot field on that entry is resolved
 * through it. `resolveGroupCalendar` is the same helper the singular path
 * uses, called once per group on one clock.
 *
 * `group` (singular) stays NULL for a multi-group facilitator rather than
 * becoming `groups[0]`. `ownGroup` is resolved BEFORE the calendar and that
 * ordering is load-bearing: picking an arbitrary group there would anchor the
 * whole run home, the rail, the pacing banner and the week forks to one of
 * two rooms.
 *
 * ── THE CALLER'S OWN ATTENDANCE ─────────────────────────────────────────────
 * `ownAttendance` is a learner's own row out of their group's registers, and
 * it is the only place a member ever sees one. `courseAttendance` stays
 * `read: if false` because one register holds the whole room's marks plus the
 * facilitator's private notes about named students; `ownAttendanceSessions`
 * projects four fields out of each register and copies nothing.
 *
 * GATED ON `pushedAt`, so a register the facilitator is still filling in
 * during the session is invisible here by construction rather than by a flag
 * a later edit could forget.
 * ────────────────────────────────────────────────────────────────────────────
 */

// ---------------------------------------------------------------------------
// Wire types (the contract the run home renders from)
// ---------------------------------------------------------------------------

/**
 * The next session a group holds that has not finished yet, or null once its
 * term is over. Resolved from `resolveSessions` + `sessionRange`, so a group
 * that meets twice a week gets its NEXT meeting rather than its next week.
 */
export type OverviewNextSession = {
  weekNumber: number;
  /** 1-based. 2 and up are the week's later meetings. */
  occurrence: number;
  /** `sessionKey(weekNumber, occurrence)`, the register's own key. */
  sessionKey: string;
  /** Civil date "YYYY-MM-DD" (Europe/London). Never empty on a next session. */
  dateKey: string;
  /** Wall-clock start in Europe/London, "HH:MM" 24h. */
  startTimeLocal: string;
  durationMinutes: number;
  /**
   * The weeks this session covers: its own, and those of the cancelled
   * sessions straight before it (Q25): `[4, 5]` after week 4's was cancelled
   * and the group kept pace. `[5]` otherwise.
   */
  weekNumbers: number[];
  /** Its room, resolved for its own week (a one-week move included). */
  location: string;
  /**
   * Its joining link, resolved for its own week, under the same gate as the
   * group's `meetingUrl`: null for anybody that one is null for. The link is
   * on the site only (Q23): no email or calendar feed carries it.
   */
  meetingUrl: string | null;
};

/**
 * A cancelled evening the group's people must read about before their next
 * session (Q25, wk-changes): "No session tonight", why, and what to do
 * instead. Worked out by `sessionNoticeFor`.
 */
export type OverviewSessionNotice = {
  /** "cancelled": the group keeps pace. "pushed": every session from that week moved back one. */
  kind: "cancelled" | "pushed";
  /** The evening nobody meets, "YYYY-MM-DD". */
  dateKey: string;
  /** When it would have started, "HH:MM", for "tonight" or "today". */
  startTimeLocal: string;
  weekNumber: number;
  /** What the group was told: one line, never a link. */
  reason: string;
  /** The next session and the weeks it covers, or the pushed week's new session. */
  next: { dateKey: string; weekNumbers: number[] } | null;
};

/** A session of the group that was cancelled and kept pace, for a page that draws that week. */
export type OverviewCancelledSession = {
  weekNumber: number;
  dateKey: string;
  reason: string;
};

/**
 * ONE TAUGHT WEEK OF THE CALLER'S OWN CALENDAR, as the pages a member uses
 * every week draw it (boards wk-programme, st-programme, wk-week-phone): the
 * week's session as their group holds it, and whether its page is open to
 * them.
 *
 * THE SESSION IS THE WEEK'S OWN, read off the group's calendar with "Change a
 * session" applied: a one-week move's day, time and room, an online week, a
 * cancelled evening. Never the group's usual slot dated to another week.
 *
 * OPEN (C17): for somebody taking part, a published week opens straight after
 * the group's previous session (`weekOpening`); the first waits on nothing.
 * Facilitators and admins are shown every published week as open, as they
 * always were. `opensAfter` is the session a shut week waits on, so a page can
 * say "Opens tonight, after your session"; null when it waits on none, and
 * always null for staff.
 */
export type OverviewWeekSchedule = {
  weekNumber: number;
  /** The first day of the week's seven, "YYYY-MM-DD"; "" on an undated calendar. */
  slotStartKey: string;
  /** The day the caller's group meets that week, "YYYY-MM-DD"; "" when there is no session to date. */
  dateKey: string;
  /** "HH:MM" in London; "" with no session. */
  startTimeLocal: string;
  durationMinutes: number;
  /** The room that week, a one-week move applied; "" for none. */
  location: string;
  /** That week's room is not the group's usual one. */
  roomChanged: boolean;
  /** How that week meets, when somebody has said; null when nothing is set. */
  sessionMode: GroupSessionMode | null;
  /** Cancelled through "Change a session", the group keeping pace. */
  cancelled: boolean;
  /** The session has ended. A cancelled one is over once its evening has passed. */
  over: boolean;
  /** The session a shut week waits on, for somebody taking part. */
  opensAfter: { dateKey: string; startTimeLocal: string } | null;
  /** Whether the week's page is open to the caller now. */
  open: boolean;
};

/**
 * ONE GROUP'S OWN CALENDAR: the fix this shape exists for.
 *
 * Every group on `groups[]` carries its own, resolved through the group's
 * pacing overrides rather than the caller's. Two groups on different pacing
 * therefore report different current weeks and different date ranges on the
 * same payload, which is what a facilitator holding both needs to read.
 *
 * `source` is the same disclosure `calendarSource` makes at the top level, per
 * group: `"group"` means this room has left the run's clock.
 */
export type OverviewGroupCalendar = {
  source: WeekSource;
  /** Civil date "YYYY-MM-DD", empty on a half-authored calendar. */
  startDate: string;
  /** Taught weeks in THIS group's plan, breaks excluded. */
  totalWeeks: number;
  /** Null on a draft run or one with no usable start date. */
  currentWeek: CurrentWeek | null;
  /** First taught session's civil date, empty when none can be dated. */
  firstSessionDate: string;
  /** Last taught session's civil date, empty when none can be dated. */
  lastSessionDate: string;
  nextSession: OverviewNextSession | null;
};

export type OverviewGroup = {
  id: string;
  name: string;
  /**
   * THIS group's calendar, never the caller's. Every slot field below is
   * resolved through it. See the module header.
   */
  calendar: OverviewGroupCalendar;
  /** e.g. "Tuesdays 18:00–19:30"; empty when the slot isn't set up yet. */
  sessionLabel: string;
  /** 0 = Sunday .. 6 = Saturday (JS `Date.getDay()` convention). */
  weekday: number;
  /** Wall-clock start in Europe/London, "HH:MM" 24h. */
  startTimeLocal: string;
  durationMinutes: number;
  location: string;
  /**
   * Null unless the caller is an active member of THIS group, a facilitator of
   * it, or an admin — see `canSeeMeetingUrl` below. Also null when the group
   * simply meets in person.
   */
  meetingUrl: string | null;
  /**
   * HOW EACH WEEK MEETS (v2 decision 7), by week doc id: `{ w03: "virtual" }`.
   * `"virtual"` = the link is the destination and the room is not;
   * `"in-person"` = the reverse; a MISSING key = the facilitator has never set
   * one for that week and the card shows whatever the slot carries (the legacy
   * state, and NOT the same thing as `"in-person"`).
   *
   * THE WHOLE MAP, not the current week's answer, and that is the fix for a
   * real bug: the slot fields above are resolved for ONE week (the current
   * one), but the week page renders ANY week, so a single resolved `mode`
   * rendered week 5's "Online this week" over week 3's evening and hid week
   * 3's room with it. Every surface now picks the week IT is drawing —
   * `WeekView` the viewed week, the run home the current one — through
   * `sessionModesOf`, which is also where the ≤20 bound lives.
   *
   * This travels because the flip is a MEMBER-FACING promise: the facilitator
   * editor says in as many words that switching it "changes what your group
   * sees on the week page and in the reminder emails". Without this field the
   * setting was written, audited and read by nobody but staff.
   *
   * It is NOT a second meeting-link gate, and widening it from one week to all
   * of them does not make it one: a mode is a display fact of the same tier as
   * `sessionLabel`, `meetingUrl` is redacted above by `canSeeMeetingUrl`
   * exactly as before, and a caller who may not see the link still may not see
   * it on a `"virtual"` week.
   */
  sessionModes: Record<string, GroupSessionMode>;
  /** Names only. */
  facilitatorNames: string[];
  /**
   * The group's usual weekly slot, with no week's own arrangement applied:
   * what "Group B · Tuesdays 6pm · Room C20" says at the head of a member's
   * programme page, where a room changed for one week must not read as the
   * group's room. The link is not part of it.
   */
  usualSlot: { weekday: number; startTimeLocal: string; durationMinutes: number; location: string };
  /**
   * A cancelled evening to tell the card's reader about (Q25), or null. The
   * reason travels because "the group sees this": it is written for exactly
   * the people this card is for, and it can hold no link.
   */
  sessionNotice: OverviewSessionNotice | null;
  /** The group's sessions that are cancelled and kept pace, in week order. */
  cancelledSessions: OverviewCancelledSession[];
};

/**
 * THIS WEEK ON A WEEK WRITTEN AS BLOCKS (boards st-week1-phone, wk-week-phone,
 * wk-programme): its rows in order, each task with what it needs to be done
 * (`taskNeeds`, ids only), which of its reflection boxes the caller has
 * written in, and the day it is due for the caller's group. Every page that
 * says "N of M done" of a block week counts from this through
 * `src/lib/courses/weekBlocks/progress.ts`, the one place "done" is worked
 * out, with the caller's own live ticks.
 */
export type OverviewThisWeek = {
  rows: OverviewThisWeekRow[];
  /** "About 2¼ hours" ("In all"), or "". */
  total: string;
  /**
   * The course's time for work due the day before a session
   * (`CourseDoc.dayBeforeDueTime`, "12:00"), or null for by the end of that
   * day: what a page says for a task due the day before.
   */
  dayBeforeTime: string | null;
};

export type OverviewThisWeekRow =
  | {
      type: "task";
      what: string;
      /** "About 80 minutes": words, so it can be a range. */
      time: string;
      when: When;
      /** The when as the guide writes it ("Before session 1, if you can"), or "". */
      whenText: string;
      /** The programme page's short line: "Parts 1 to 3", "Your written answer", "Your case talk". */
      label: string;
      needs: TaskNeeds;
      /** Which of `needs.promptIds` the caller has written in. Empty for anybody not taking part. */
      written: string[];
      /**
       * The day it is due for the caller's own group (`dueMoment`), or null
       * while there is none to give ("Due dates wait for the group").
       * `moved`: the week's session is cancelled and it is due by the next.
       */
      due: { dateKey: string; moved: boolean } | null;
    }
  | { type: "none"; what: string; time: string; note: string }
  /** Offered, not set (the hands-on route): outside "In all", never counted. */
  | { type: "optional"; what: string; time: string; note: string };

export type OverviewPayload = {
  run: {
    id: string;
    courseId: string;
    courseTitle: string;
    label: string;
    academicYear: string;
    status: CourseRunStatus;
    /**
     * Civil date "YYYY-MM-DD" (Europe/London), empty on a half-authored run.
     *
     * THE CALLER'S EFFECTIVE calendar, not necessarily the run's — see the
     * module header. `calendarSource` says which one answered.
     */
    startDate: string;
    weekPlan: WeekPlanEntry[];
    /** Taught weeks in the EFFECTIVE plan (breaks excluded). */
    totalWeeks: number;
  };
  /**
   * Which calendar the three fields above came from. `"group"` means the
   * caller's group has set its own pacing and is no longer tracking the run;
   * surfaces that say "your cohort" should say "your group" when they read it.
   */
  calendarSource: "run" | "group";
  /** Recomputed here on every request; null for a draft/undated run. */
  currentWeek: CurrentWeek | null;
  /**
   * The authored week index the WeekRail draws. Each row carries `published`,
   * which the rail's "week 6 is ready" affordance reads.
   *
   * Group forks are laid OVER the canonical index by week id, so a rail row
   * whose group has personalised that week shows the group's title, its
   * estimate and its own `published` flag — the same document the week page
   * will open.
   */
  weeks: Array<{
    id: string;
    weekNumber: number;
    title: string;
    published: boolean;
    estimatedMinutes: number | null;
    /** True when this row came from the caller's group's forked copy. */
    forked: boolean;
    /**
     * The ids of what a member ticks off in the week, the ones its count of
     * "done" is out of: every material that is not optional, then every
     * checklist item, as the week page counts them. Ids only, so a page can
     * say "1 of 3 done" beside a week without reading the week. A week
     * written as blocks counts by `thisWeek` instead, and has none here.
     */
    countableIds: string[];
    /** A week written as blocks: This week's rows and what each task needs. Null on any other week. */
    thisWeek: OverviewThisWeek | null;
  }>;
  /**
   * The caller's own calendar's taught weeks, in its order, with each week's
   * session and whether its page is open to them. See `OverviewWeekSchedule`.
   */
  weekSchedule: OverviewWeekSchedule[];
  /**
   * The programme on the application form that names this run, as a member's
   * pages name it ("AGI Strategy", a fellowship), or null when no programme
   * names it. Nothing else of the form travels but its lead's first name,
   * which a week page says when it tells someone who reads their reflections
   * (Q30); null when no lead stands.
   */
  programme: { name: string; kind: ProgrammeKind; leadFirstName: string | null } | null;
  /**
   * The crest the run's page shows beside its name: `crestForRun`'s answer
   * (the programme that names the run, else its course's), or null for the
   * NAISI emblem. Only the key travels.
   */
  shownCrest: ShownCrest;
  /**
   * Week doc ids that exist under `courseGroups/{ownGroup}/weeks` — i.e. the
   * weeks this caller must read from their group rather than from the run.
   * Always empty for a caller with no group of their own.
   *
   * The client CANNOT derive this: a group's forked weeks are the only thing
   * distinguishing "read the fork" from "read the canonical", and a wrong
   * guess shows the wrong curriculum. So the list travels, and `useWeek`
   * resolves against it rather than probing for a document that usually isn't
   * there.
   */
  forkedWeekIds: string[];
  /** The caller's OWN enrolment summary; null when they read as facilitator/admin. */
  enrolment: {
    status: CourseEnrolmentStatus;
    role: CourseEnrolmentRole;
    groupId: string | null;
    joinedWeekNumber: number;
  } | null;
  /**
   * @deprecated Read `groups[]` instead. REMOVED IN PR38, which rebuilds the
   * learn hub's structure and is the last consumer that needs it.
   *
   * The card the run home has always drawn: the caller's own placement, or the
   * single group they facilitate. Still the group the TOP-LEVEL fields are
   * resolved through (the run calendar, `currentWeek`, `forkedWeekIds`), which
   * is why it cannot simply be deleted today.
   *
   * NULL FOR A MULTI-GROUP FACILITATOR, never `groups[0]`. `ownGroup` is the
   * anchor of every top-level resolution below it, so naming one of two rooms
   * here would silently pace the whole page by that room. A caller who wants a
   * group's dates reads them off that group's own `calendar` entry.
   *
   * When set, it is `groups[0]`, but the implication runs one way only.
   */
  group: OverviewGroup | null;
  /**
   * EVERY group this caller has staff or member standing in: their placement
   * first, then each group they facilitate, deduped by id.
   *
   * `group` alone was the bug. A facilitator holding two groups had no
   * "current" one, so the single field was null and the run home drew nothing
   * for the person who most needs it: no roster, no register, no review queue,
   * no group email. Running two sessions is ordinary here, so the payload
   * carries the list and the page draws a card each.
   *
   * Never empty when `group` is set, and `group`, when set, is its first
   * entry.
   */
  groups: OverviewGroup[];
  /**
   * THE CALLER'S OWN ATTENDANCE, and nobody else's. Null for anyone without a
   * live learner enrolment placed in a group: a facilitator, an admin reading
   * over the cohort's shoulder, an unallocated member.
   *
   * `sessions` lists only the sessions whose register has been PUSHED (see the
   * module header); `rollup` is the mirror already stored on the caller's own
   * enrolment row, recomputed by the push. The two can disagree on an unmarked
   * cell on purpose: the rollup counts it as an absence, the session list
   * leaves it null so a page can say "not marked" rather than accuse anyone.
   */
  ownAttendance: {
    sessions: OwnAttendanceSession[];
    rollup: {
      sessionsHeld: number;
      attendedInFull: number;
      late: number;
      leftEarly: number;
      absent: number;
      excused: number;
      lastPushedSessionKey: string | null;
      /** ISO 8601, or null before the first push. */
      lastComputedAt: string | null;
    };
  } | null;
  /**
   * WHETHER THE CALLER FINISHED THIS RUN: true only once its last session is
   * over and their own finished record says so (`finishedForMember`, the one
   * answer every page asks). False says nothing more: not over yet, not
   * decided, not finished, or not a learner here, so a page told false says
   * the run has ended and claims nothing. Never the rule, and never the
   * suggestion apart from the record.
   */
  finished: boolean;
  access: {
    isAdmin: boolean;
    /** An active or completed LEARNER enrolment — `enrolment.status` distinguishes. */
    isEnrolled: boolean;
    isFacilitator: boolean;
    isReviewer: boolean;
    isTrackLead: boolean;
  };
  /**
   * WEEK 1 BEFORE GROUPS GO OUT (Q35 B): set only for somebody answered
   * through week 1's door (`weekOneDoorFor`), who holds a place and has not
   * been told a group. They are answered week 1 and nothing else: `weeks`
   * holds week 1 alone, with no due day, and there is no group, no session,
   * no schedule and no current week. `line` is st-week1-phone's sentence,
   * worded here from the run's planned day groups go out. Null for everybody
   * else.
   */
  beforeGroups: { line: string } | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Read cap on the caller's own registers. A course is a term long, and the
 * week plan is already bounded at 60 entries by the rules, but a group that
 * meets twice a week doubles the session count and this route runs on the page
 * members open daily. Ninety sessions is far past any real cohort and still a
 * bounded `getAll`.
 */
const MAX_OWN_ATTENDANCE_SESSIONS = 90;

/**
 * The caller's own rows of the run's answers read for their reflection boxes:
 * a run's weeks of answers and boxes for one person, with room to spare.
 */
const MAX_OWN_ANSWER_ROWS = 600;

/** Index = `GroupSession.weekday` (`Date.getDay()`, 0 = Sunday). */
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function endTimeLabel(start: string, minutes: number): string | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(start);
  if (!m || minutes <= 0) return null;
  const total = (Number(m[1]) * 60 + Number(m[2]) + minutes) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * "Tuesdays 18:00–19:30" — byte-for-byte the label the apply page, the
 * admissions queue and the allocation board render, so a member reads the same
 * string everywhere their slot appears. Deliberately duplicated: route
 * handlers don't import from one another (the plan's integration checklist
 * owns the eventual shared extraction). The format is the contract; change all
 * copies together.
 */
function sessionLabel(session: GroupSession): string {
  const day = WEEKDAY_NAMES[session.weekday];
  if (!day || !session.startTimeLocal) return "";
  const end = endTimeLabel(session.startTimeLocal, session.durationMinutes);
  return `${day}s ${session.startTimeLocal}${end ? `–${end}` : ""}`;
}

/**
 * Display-name fallback chain: preferred name, then account name, then a
 * neutral placeholder — NEVER an email address, which is what makes this safe
 * for a member-facing payload. (Same local helper P1/P5/P6 carry.)
 */
function displayNameOf(data: Record<string, unknown>): string {
  const profile = (data.profile as Record<string, unknown> | undefined) ?? {};
  const preferred = profile.preferredName;
  const display = data.displayName;
  return (
    (typeof preferred === "string" && preferred.trim()) ||
    (typeof display === "string" && display.trim()) ||
    "NAISI member"
  );
}

/**
 * The week id whose session override applies right now. Breaks and the
 * before/after phases have no week doc of their own, so they fall back to the
 * anchor (the last taught week that started) — a cohort on reading week still
 * sees the slot it will return to. An empty string means "no override", which
 * `sessionForWeek` resolves to the recurring slot.
 */
function currentWeekId(currentWeek: CurrentWeek | null): string {
  if (!currentWeek) return "";
  const n = currentWeek.weekNumber ?? currentWeek.anchorWeekNumber;
  return n >= 1 ? weekDocId(n) : "";
}

/** "weekId::promptId" of every reflection box `uid` has written in, out of their own rows. */
function writtenBoxesOf(docs: ReadonlyArray<{ data: () => unknown }>, uid: string): Set<string> {
  const written = new Set<string>();
  for (const doc of docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    if (!isReflectionResponse(data) || data.uid !== uid) continue;
    if (typeof data.text !== "string" || !data.text.trim()) continue;
    if (typeof data.weekId === "string" && typeof data.exerciseId === "string") {
      written.add(`${data.weekId}::${data.exerciseId}`);
    }
  }
  return written;
}

/**
 * This week of one week written as blocks, for the caller: each task with
 * what it needs, which of its boxes the caller has written in, and the day it
 * is due (`dueOf`, null while there is none to give). Null for a week with no
 * This week.
 */
function thisWeekPayload(
  blocks: WeekBlock[],
  weekId: string,
  dayBeforeTime: string | null,
  writtenBoxes: ReadonlySet<string>,
  dueOf: (when: When) => { dateKey: string; moved: boolean } | null,
): OverviewThisWeek | null {
  const block = thisWeekOf(blocks);
  if (!block) return null;
  return {
    total: block.total,
    dayBeforeTime,
    rows: block.rows.map((row): OverviewThisWeekRow => {
      if (row.type === "none") return { type: "none", what: row.what, time: row.time, note: row.note };
      if (row.type === "optional") return { type: "optional", what: row.what, time: row.time, note: row.note };
      const needs = taskNeeds(blocks, row);
      const due = dueOf(row.when);
      return {
        type: "task",
        what: row.what,
        time: row.time,
        when: row.when,
        whenText: row.whenText,
        label: taskLabelWords(taskSubject(blocks, row), row.what),
        needs,
        written: needs.promptIds.filter((id) => writtenBoxes.has(`${weekId}::${id}`)),
        due: due ? { dateKey: due.dateKey, moved: due.moved } : null,
      };
    }),
  };
}

/**
 * WEEK 1, AND NOTHING ELSE, for somebody through week 1's door (Q35 B): the
 * run's own facts a week page names (its course, label and how many weeks it
 * has), week 1 as the run holds it, This week with what the caller has
 * written and no due day (due dates wait for the group), the programme as
 * the pages name it, and st-week1-phone's line. No group, no session, no
 * schedule, no other week, no current week, no attendance: those wait for
 * Publish. Built field by field.
 */
async function beforeGroupsPayload(
  db: NonNullable<ReturnType<typeof getAdminDb>>,
  run: CourseRunDoc,
  actor: SessionUser,
  place: PlaceBeforeGroups,
  roles: { isReviewer: boolean; isTrackLead: boolean },
): Promise<OverviewPayload> {
  const weekId = weekDocId(1);
  const [weekSnap, programme, ownAnswerSnap, courseSnap] = await Promise.all([
    db.collection("courseRuns").doc(run.id).collection("weeks").doc(weekId).get(),
    runProgrammeOf(db, run.id).catch(() => null),
    // Their own rows on the run, for the boxes they have written in:
    // equalities on (uid, runId), the existing composite.
    db
      .collection("courseExerciseResponses")
      .where("uid", "==", actor.uid)
      .where("runId", "==", run.id)
      .limit(MAX_OWN_ANSWER_ROWS)
      .get(),
    run.courseId ? db.collection("courses").doc(run.courseId).get() : Promise.resolve(null),
  ]);
  const dayBeforeTime =
    courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}).dayBeforeDueTime : null;
  const week = weekSnap.exists ? normalizeCourseWeek(weekSnap.id, weekSnap.data() ?? {}) : null;
  const written = writtenBoxesOf(ownAnswerSnap.docs, actor.uid);
  const taught = run.weekPlan.filter((entry) => entry.kind === "week").length;
  return {
    run: {
      id: run.id,
      courseId: run.courseId,
      courseTitle: run.courseTitle,
      label: run.label,
      academicYear: run.academicYear,
      status: run.status,
      startDate: "",
      weekPlan: [],
      totalWeeks: taught,
    },
    calendarSource: "run",
    currentWeek: null,
    weeks: week
      ? [
          {
            id: week.id,
            weekNumber: 1,
            title: week.title,
            published: week.published,
            estimatedMinutes: week.estimatedMinutes,
            forked: false,
            countableIds: Array.isArray(week.blocks)
              ? []
              : [...week.materials.filter((m) => !m.optional).map((m) => m.id), ...week.checklist.map((c) => c.id)],
            thisWeek: Array.isArray(week.blocks)
              ? thisWeekPayload(week.blocks, week.id, dayBeforeTime, written, () => null)
              : null,
          },
        ]
      : [],
    weekSchedule: [],
    programme: programme ? { name: programme.shortName, kind: programme.kind, leadFirstName: programme.leadFirstName } : null,
    forkedWeekIds: [],
    enrolment: null,
    group: null,
    groups: [],
    ownAttendance: null,
    finished: false,
    access: {
      isAdmin: false,
      isEnrolled: false,
      isFacilitator: false,
      isReviewer: roles.isReviewer,
      isTrackLead: roles.isTrackLead,
    },
    beforeGroups: {
      line: weekOneOpenWords(groupsGoOutDay(place.groupsGoOutOn, londonDateKey(new Date()))),
    },
  };
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ runId: string }> },
) {
  const { runId } = await ctx.params;

  const actor = await getCurrentUser();
  if (!actor) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const db = getAdminDb();
  if (!db) return NextResponse.json({ error: "Server not configured" }, { status: 500 });

  // One round trip for all four reads — this is the run home's only fetch, and
  // the access decision below needs three of them anyway (the group query
  // resolves group-level facilitation, which the run's arrays don't cover).
  // Nothing is returned before the 403; the payload is the boundary, not the
  // individual reads.
  //
  // The enrolment is addressed by construction (`courseEnrolmentId`), never
  // by query — one doc read, and no way to spell another member's row.
  const [runSnap, enrolSnap, groupSnap] = await Promise.all([
    db.collection("courseRuns").doc(runId).get(),
    db.collection("courseEnrolments").doc(courseEnrolmentId(runId, actor.uid)).get(),
    db.collection("courseGroups").where("runId", "==", runId).limit(50).get(),
  ]);

  if (!runSnap.exists) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const isAdmin = actor.role === "admin";

  const stored: CourseEnrolmentDoc | null = enrolSnap.exists
    ? normalizeCourseEnrolment(enrolSnap.id, enrolSnap.data() ?? {})
    : null;
  // A placement Publish has not told its owner about is not there for them:
  // they are answered as they were before an admin placed them, and nothing
  // below, the payload's own `enrolment` included, carries their group.
  const enrolment =
    stored && placementIsShownTo(stored, { isAdmin }) ? stored : null;
  // Withdrawn / removed enrolments lose access the moment they are written,
  // whatever the member's open tab still shows.
  // The enrolment is an authority like the arrays are, and it is the first of
  // the three paths below. `isNamedWithStanding` asks the same roster floor of
  // it, so an account that was rejected loses the run whichever path put it
  // there.
  const liveEnrolment =
    enrolment &&
    (enrolment.status === "active" || enrolment.status === "completed") &&
    isNamedWithStanding(actor, "courseEnrolments.uid", enrolment.uid)
      ? enrolment
      : null;

  const groups: CourseGroupDoc[] = groupSnap.docs
    .map((d) => normalizeCourseGroup(d.id, d.data() ?? {}))
    .filter((g) => !g.archived);
  const facilitates = groups.filter((g) =>
    isNamedWithStanding(actor, "courseGroups.facilitatorUids", g.facilitatorUids),
  );

  const isEnrolled = liveEnrolment?.role === "learner";
  // Three routes to facilitator access: staffed onto a group (the usual one —
  // the facilitators route upserts a `role: "facilitator"` enrolment at the
  // same time), named on the run itself, or holding the group directly.
  const isFacilitator =
    (liveEnrolment?.role === "facilitator" && liveEnrolment.status === "active") ||
    isNamedWithStanding(actor, "courseRuns.runFacilitatorUids", run.runFacilitatorUids) ||
    facilitates.length > 0;
  const isReviewer = isNamedWithStanding(
    actor,
    "courseRuns.admissionsReviewerUids",
    run.admissionsReviewerUids,
  );
  const isTrackLead = isNamedWithStanding(
    actor,
    "courseRuns.trackLeadUids",
    run.trackLeadUids,
  );

  // Reviewer and track lead are deliberately NOT access grants here.
  if (!isAdmin && !liveEnrolment && !isFacilitator) {
    // Week 1 before groups go out (Q35 B): somebody holding a place whom
    // Publish has not told is answered week 1, once it is ready, and nothing
    // else of the run. Everybody else is refused as before.
    const door = await weekOneDoorFor(db, actor, run.id);
    if (!door.open) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    return NextResponse.json(await beforeGroupsPayload(db, run, actor, door.place, { isReviewer, isTrackLead }));
  }

  // The caller's OWN group: their placement if they have one, otherwise the
  // single group they facilitate. Facilitating two groups leaves this null
  // deliberately: there is no "current" one to resolve a calendar or a week
  // fork through, so those stay run-level. The CARDS are a separate question,
  // answered by `groupCards` below, which does cover that case.
  //
  // RESOLVED BEFORE THE CALENDAR, and that ordering is now load-bearing: the
  // group is the first half of every resolution below it (V2-3).
  const ownGroup =
    (liveEnrolment?.groupId
      ? (groups.find((g) => g.id === liveEnrolment.groupId) ?? null)
      : null) ?? (facilitates.length === 1 ? facilitates[0] : null);

  // ONE CLOCK for every resolution in this request. Two groups resolved a
  // millisecond apart across a midnight would land in different cohort weeks,
  // and the page would be reporting its own timing rather than their pacing.
  const now = new Date();

  /**
   * Every group that earns a card, in the order they are drawn: the caller's
   * own placement first (so a learner who also facilitates still leads with
   * their own room), then each group they facilitate, deduped by id.
   *
   * Built BEFORE the calendars because it is the list they are resolved over.
   */
  const groupCards: CourseGroupDoc[] = [];
  const seenGroupIds = new Set<string>();
  for (const candidate of [ownGroup, ...facilitates]) {
    if (!candidate || seenGroupIds.has(candidate.id)) continue;
    seenGroupIds.add(candidate.id);
    groupCards.push(candidate);
  }

  /**
   * ONE GROUP'S CALENDAR, THROUGH THE ONE HELPER: resolved ONCE PER GROUP over
   * the card list, plus one run-level resolution for the caller's top-level
   * fields when they hold no group.
   *
   * `resolveGroupCalendars` is that per-group pass, and it is the shared clock
   * in one place rather than a `now` threaded through a closure: every entry in
   * the map was resolved from the same instant, so no card can report the
   * request's timing as pacing. `calendarFor` then READS the map, which is why
   * the caller's own group is resolved once here and not again per card.
   *
   * `resolveGroupCalendar` returns the group's pacing override when it has set
   * one and the run's calendar otherwise, so an unallocated member and a group
   * that has never touched its pacing are byte-identical to the pre-V2-3
   * payload.
   *
   * SERVERS ALWAYS RECOMPUTE, and a half-authored run (created, no start date
   * chosen) is a legitimate state: the helper already returns a null week for
   * an unusable RESOLVED start date, since a group's own start date is just as
   * capable of being half-authored as the run's. The DRAFT suppression is this
   * route's own rule and is applied here so every group gets it identically.
   */
  const groupCalendars = resolveGroupCalendars(run, groupCards, now);
  const scheduled = run.status !== "draft";
  const asScheduled = (resolved: GroupCalendar): GroupCalendar =>
    scheduled ? resolved : { ...resolved, currentWeek: null };
  // The run canonical, for a caller with no group of their own. Resolved once,
  // on the same clock, and never re-derived per card.
  const runCalendar = asScheduled(resolveGroupCalendar(run, null, now));
  const calendarFor = (group: CourseGroupDoc | null): GroupCalendar => {
    if (!group) return runCalendar;
    const resolved = groupCalendars.get(group.id);
    // Every group `calendarFor` is called with is a card, so the map answers.
    return resolved ? asScheduled(resolved) : asScheduled(resolveGroupCalendar(run, group, now));
  };

  const own = calendarFor(ownGroup);
  const calendar = own.calendar;
  const currentWeek = own.currentWeek;

  // Per group, not once: an admin sees every link, a member sees their own
  // room's, and a facilitator sees the link for each room they hold. The
  // answer for `ownGroup` is byte-identical to what it was before.
  const canSeeMeetingUrlFor = (group: CourseGroupDoc): boolean =>
    isAdmin ||
    (liveEnrolment?.status === "active" && liveEnrolment.groupId === group.id) ||
    isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids);

  // The union across every card, deduped, so two groups sharing a facilitator
  // cost one user read rather than two.
  const facilitatorUids = [
    ...new Set(groupCards.flatMap((group) => group.facilitatorUids)),
  ];
  // One round trip for both: the facilitator names and the caller's own week
  // index, canonical with their group's forks laid over it by doc id. The fork
  // read is scoped to the ONE group this caller belongs to (never the run's
  // groups), so a member learns nothing about how anybody else's room has been
  // personalised.
  //
  // `resolveWeekDocs` is THE overlay — the same one every other week reader
  // resolves through — rather than a second merge written out here. A forked
  // week REPLACES its canonical row (same id, same number, the group's own
  // title and published flag), which is what makes the rail agree with the
  // page each row links to.
  /**
   * The caller's own registers, when they are a LEARNER placed in a group.
   *
   * A facilitator's own attendance is not a thing (they run the room), and an
   * admin reading over the cohort's shoulder has no row of their own either,
   * so both resolve to no reads at all rather than to an empty list built out
   * of documents nobody needed.
   *
   * ADDRESSED, never queried: the ids are `attendanceDocId`, which is
   * construct-only by contract, and there is no way to spell another group's
   * register from here. Bounded by the group's own taught sessions and capped
   * again below, so a corrupt plan cannot turn one page load into a hundred
   * reads.
   */
  /*
   * THEIR OWN PLACEMENT, never merely `ownGroup`. `ownGroup` falls back to the
   * single group the caller FACILITATES, so a learner whose own group has been
   * archived (it is filtered out above) would otherwise have their attendance
   * read out of the registers of a room they teach rather than sit in: real
   * marks, belonging to somebody, under the wrong group's dates. The id has to
   * match the enrolment for these registers to be theirs.
   */
  const ownLearnerGroup =
    liveEnrolment?.role === "learner" &&
    liveEnrolment.groupId &&
    ownGroup?.id === liveEnrolment.groupId
      ? ownGroup
      : null;
  // From the week they JOINED, then capped: a mid-run joiner has no row for
  // the weeks before their placement, and the read is bounded from that week
  // too rather than spending the cap on sessions about to be dropped.
  const ownSessions = ownLearnerGroup
    ? sessionsFromJoinWeek(
        resolveSessions(run, ownLearnerGroup, own.calendar),
        liveEnrolment?.joinedWeekNumber ?? 1,
      ).slice(0, MAX_OWN_ATTENDANCE_SESSIONS)
    : [];

  // The caller's own rows of the run's answers, for which reflection boxes
  // they have written in (a block week's This week counts them). Only for
  // somebody taking part, and only their own: `uid` is the session's.
  // Equalities on (uid, runId), the existing composite.
  const readsOwnAnswers = liveEnrolment?.role === "learner";
  const [userDocs, weekEntries, ownRegisterDocs, programme, ownAnswerSnap, courseSnap, shownCrests] = await Promise.all([
    facilitatorUids.length
      ? db.getAll(...facilitatorUids.map((uid) => db.collection("users").doc(uid)))
      : Promise.resolve([]),
    resolveWeekDocs(db, runId, ownGroup?.id ?? null),
    ownLearnerGroup && ownSessions.length
      ? db.getAll(
          ...ownSessions.map((s) =>
            db
              .collection("courseAttendance")
              .doc(
                attendanceDocId(
                  runId,
                  ownLearnerGroup.id,
                  s.weekNumber,
                  s.occurrence,
                ),
              ),
          ),
        )
      : Promise.resolve([]),
    // The programme that names the run, for the pages' words. A form that
    // cannot be read leaves the pages naming the course instead.
    runProgrammeOf(db, runId).catch(() => null),
    readsOwnAnswers
      ? db
          .collection("courseExerciseResponses")
          .where("uid", "==", actor.uid)
          .where("runId", "==", runId)
          .limit(MAX_OWN_ANSWER_ROWS)
          .get()
      : Promise.resolve(null),
    // The run's course, for one setting only: when work set for the day
    // before a session is due (`dayBeforeDueTime`). Nothing else of it travels.
    run.courseId ? db.collection("courses").doc(run.courseId).get() : Promise.resolve(null),
    // The crest beside the run's name. A read that fails shows the emblem.
    runCrests(db, [{ id: run.id, courseId: run.courseId }]).catch(() => new Map<string, ShownCrest>()),
  ]);
  const dayBeforeTime =
    courseSnap?.exists ? normalizeCourse(courseSnap.id, courseSnap.data() ?? {}).dayBeforeDueTime : null;
  // "weekId::promptId" of every reflection box the caller has written in.
  const writtenBoxes = writtenBoxesOf(ownAnswerSnap?.docs ?? [], actor.uid);
  const nameByUid = new Map<string, string>();
  for (const doc of userDocs) {
    if (doc.exists) nameByUid.set(doc.id, displayNameOf(doc.data() ?? {}));
  }

  const forkedWeekIds: string[] = [];
  const weeks = weekEntries
    .map(({ source, week: w }) => {
      if (source === "group") forkedWeekIds.push(w.id);
      return {
        id: w.id,
        weekNumber: w.weekNumber,
        title: w.title,
        published: w.published,
        estimatedMinutes: w.estimatedMinutes,
        forked: source === "group",
        // A week written as blocks counts by This week's tasks (`thisWeek`, set
        // below once the caller's sessions are known), never by these.
        countableIds: Array.isArray(w.blocks)
          ? []
          : [...w.materials.filter((m) => !m.optional).map((m) => m.id), ...w.checklist.map((c) => c.id)],
        thisWeek: null as OverviewThisWeek | null,
      };
    })
    .sort((a, b) => a.weekNumber - b.weekNumber || a.id.localeCompare(b.id));
  const blocksByWeekId = new Map(
    weekEntries.flatMap(({ week: w }) => (Array.isArray(w.blocks) ? [[w.id, w.blocks] as const] : [])),
  );

  /**
   * ONE CARD, ON ITS OWN GROUP'S CLOCK.
   *
   * The week key for the slot fields is THIS group's current week, not the
   * caller's. That is the bug this PR closes: the key used to be resolved once
   * from the caller's `currentWeek`, so a facilitator holding a group paced
   * three weeks behind the run saw the run's week's session override rendered
   * over that group's card: the wrong room, on the wrong date, with no way to
   * tell from the page.
   *
   * The modes deliberately do NOT collapse to this key: see `sessionModes` on
   * the wire type. A surface that draws another week reads that map and gets
   * the room-vs-link swap for the week it is actually showing.
   */
  const toCard = (source: CourseGroupDoc): OverviewGroup => {
    const groupCalendar = calendarFor(source);
    const session = sessionForWeek(source, currentWeekId(groupCalendar.currentWeek));
    // The group's own sessions, resolved off the calendar just resolved rather
    // than off a second one: `resolveSessions` would otherwise re-derive it,
    // and a second derivation is a second chance to disagree.
    const resolved = resolveSessions(run, source, groupCalendar.calendar);
    const range = sessionRange(resolved, now);
    // What "Change a session" did, told to the people this card is for: the
    // next session's own weeks, room and link, and any evening that is off.
    const changes = cardChangeFacts(resolved, source, range.next, londonDateKey(now));
    return {
      id: source.id,
      name: source.name,
      calendar: {
        source: groupCalendar.calendar.source,
        startDate: groupCalendar.calendar.startDate,
        totalWeeks: groupCalendar.totalWeeks,
        currentWeek: groupCalendar.currentWeek,
        firstSessionDate: range.firstDateKey,
        lastSessionDate: range.lastDateKey,
        nextSession: range.next
          ? {
              weekNumber: range.next.weekNumber,
              occurrence: range.next.occurrence,
              sessionKey: range.next.sessionKey,
              dateKey: range.next.dateKey,
              startTimeLocal: range.next.session.startTimeLocal,
              durationMinutes: range.next.session.durationMinutes,
              weekNumbers: changes.next?.weekNumbers ?? [range.next.weekNumber],
              location: changes.next?.location ?? "",
              // The same gate as the group's own link, below.
              meetingUrl: canSeeMeetingUrlFor(source) ? (changes.next?.meetingUrl ?? null) : null,
            }
          : null,
      },
      sessionLabel: sessionLabel(session),
      weekday: session.weekday,
      startTimeLocal: session.startTimeLocal,
      durationMinutes: session.durationMinutes,
      location: session.location,
      meetingUrl: canSeeMeetingUrlFor(source) ? session.meetingUrl : null,
      sessionModes: sessionModesOf(source),
      facilitatorNames: source.facilitatorUids.map(
        (uid) => nameByUid.get(uid) ?? "NAISI member",
      ),
      usualSlot: {
        weekday: source.session.weekday,
        startTimeLocal: source.session.startTimeLocal,
        durationMinutes: source.session.durationMinutes,
        location: source.session.location,
      },
      sessionNotice: changes.notice,
      cancelledSessions: changes.cancelled,
    };
  };

  const groupCardPayloads = groupCards.map(toCard);
  // `group` is the first card when there is one, which for every caller who
  // had a card before is the same object they had before. NULL for a
  // multi-group facilitator, because `ownGroup` is. See the wire type.
  const group: OverviewGroup | null =
    (ownGroup ? groupCardPayloads.find((c) => c.id === ownGroup.id) : null) ?? null;

  /*
   * THE CALLER'S WEEKS (`OverviewWeekSchedule`): each taught week of their own
   * calendar, its session as their group holds it, and whether its page is
   * open to them. Resolved through `ownGroup`, the group every top-level
   * field above is resolved through, so the weeks and the head agree.
   *
   * The opening rule (C17) is for somebody taking part and nobody else: a
   * facilitator of any group of the run and an admin are shown every
   * published week, as they always were.
   */
  const takesPart = isEnrolled && !isFacilitator && !isAdmin;
  const ownSessionsAll = resolveSessions(run, ownGroup, calendar);
  const publishedWeeks = new Set(weeks.filter((w) => w.published).map((w) => w.weekNumber));
  const ownModes = ownGroup ? sessionModesOf(ownGroup) : {};
  const usualRoom = ownGroup?.session.location.trim() ?? "";
  const scheduleOf = (session: ResolvedSession): OverviewWeekSchedule => {
    const { endsAt } = sessionInstants(session);
    const published = publishedWeeks.has(session.weekNumber);
    const opening = weekOpening(ownSessionsAll, session.weekNumber);
    const open = published && (!takesPart || isOpenAt(opening, now));
    const dated = ownGroup !== null && session.dateKey !== "";
    const room = ownGroup ? session.session.location.trim() : "";
    return {
      weekNumber: session.weekNumber,
      slotStartKey: session.slotStartKey,
      dateKey: dated ? session.dateKey : "",
      startTimeLocal: dated ? session.session.startTimeLocal : "",
      durationMinutes: dated ? session.session.durationMinutes : 0,
      location: room,
      roomChanged: room !== "" && room !== usualRoom,
      sessionMode: ownModes[session.weekId] ?? null,
      cancelled: session.cancelled,
      over: dated && endsAt !== null && endsAt.getTime() < now.getTime(),
      opensAfter:
        takesPart && published && !open && opening.after
          ? { dateKey: opening.after.dateKey, startTimeLocal: opening.after.startTimeLocal }
          : null,
      open,
    };
  };
  const weekSchedule = ownSessionsAll.filter((session) => session.occurrence === 1).map(scheduleOf);

  /*
   * THIS WEEK OF EACH WEEK WRITTEN AS BLOCKS (`OverviewThisWeek`): what each
   * task needs, the boxes the caller has written in, and the day it is due on
   * the caller's own calendar, a session moved or cancelled through "Change
   * a session" included (`dueMoment`), "the day before" read by the course's
   * own setting. Nothing is dated for somebody with no group: their week has
   * no session to be due by. A row with nothing to do and a row that is only
   * offered (the hands-on route) travel as they are, and count for nothing.
   */
  for (const entry of weeks) {
    const blocks = blocksByWeekId.get(entry.id);
    if (!blocks) continue;
    entry.thisWeek = thisWeekPayload(blocks, entry.id, dayBeforeTime, writtenBoxes, (when) =>
      ownGroup ? dueMoment(ownSessionsAll, entry.weekNumber, when, dayBeforeTime) : null,
    );
  }

  /**
   * THE PROJECTION, keyed by session key rather than by array position.
   * `getAll` does answer in request order, but a register landing under the
   * wrong session would be a silent, plausible-looking lie about which evening
   * somebody missed, and `attendanceDocId` makes the id-to-session map free.
   *
   * `ownAttendanceSessions` reads four fields out of each register and copies
   * nothing: the whole room's marks and the facilitator's private participant
   * notes never enter this payload, and cannot start to when a field is added.
   */
  const ownRegisters = new Map<string, Record<string, unknown>>();
  if (ownLearnerGroup) {
    const sessionByDocId = new Map(
      ownSessions.map((s) => [
        attendanceDocId(runId, ownLearnerGroup.id, s.weekNumber, s.occurrence),
        s.sessionKey,
      ]),
    );
    for (const snap of ownRegisterDocs) {
      const key = sessionByDocId.get(snap.id);
      if (!snap.exists || !key) continue;
      ownRegisters.set(key, snap.data() ?? {});
    }
  }

  const rollup = liveEnrolment?.attendance ?? null;
  const ownAttendance: OverviewPayload["ownAttendance"] =
    ownLearnerGroup && rollup
      ? {
          sessions: ownAttendanceSessions(actor.uid, ownSessions, ownRegisters),
          rollup: {
            sessionsHeld: rollup.sessionsHeld,
            attendedInFull: rollup.attendedInFull,
            late: rollup.late,
            leftEarly: rollup.leftEarly,
            absent: rollup.absent,
            excused: rollup.excused,
            lastPushedSessionKey: rollup.lastPushedSessionKey,
            lastComputedAt: rollup.lastComputedAt
              ? rollup.lastComputedAt.toISOString()
              : null,
          },
        }
      : null;

  // The run's groups are already read, so while the run is going this costs
  // no read at all: the answer is "not over" before anything else is asked.
  const finished =
    isEnrolled && liveEnrolment ? await finishedForMember(db, run, liveEnrolment, new Date(), groups) : false;

  const payload: OverviewPayload = {
    run: {
      id: run.id,
      courseId: run.courseId,
      courseTitle: run.courseTitle,
      label: run.label,
      academicYear: run.academicYear,
      status: run.status,
      // THE RESOLVED calendar, not the run document's own — see the module
      // header. Identical to the run's for every caller without a group that
      // has overridden its pacing.
      startDate: calendar.startDate,
      weekPlan: calendar.weekPlan,
      totalWeeks: own.totalWeeks,
    },
    calendarSource: calendar.source,
    currentWeek,
    weeks,
    weekSchedule,
    programme: programme
      ? { name: programme.shortName, kind: programme.kind, leadFirstName: programme.leadFirstName }
      : null,
    shownCrest: shownCrests.get(run.id) ?? null,
    forkedWeekIds,
    enrolment: enrolment
      ? {
          status: enrolment.status,
          role: enrolment.role,
          groupId: enrolment.groupId,
          joinedWeekNumber: enrolment.joinedWeekNumber,
        }
      : null,
    group,
    groups: groupCardPayloads,
    ownAttendance,
    finished,
    access: {
      isAdmin,
      isEnrolled,
      isFacilitator,
      isReviewer,
      isTrackLead,
    },
    beforeGroups: null,
  };

  return NextResponse.json(payload);
}
