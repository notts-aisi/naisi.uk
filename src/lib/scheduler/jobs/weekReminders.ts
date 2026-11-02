import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import WeekEmail from "@/emails/WeekEmail";
import { resolveWeekDoc } from "@/lib/courses/groupResolve";
import { coveredWeeks } from "@/lib/courses/sessionChange/model";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { weekTaskNeeds, type TaskNeeds } from "@/lib/courses/weekBlocks/progress";
import {
  WEEK_REMINDER_DAYS,
  weekEmailSendAt,
  weekLeft,
  type ReminderDays,
} from "@/lib/courses/weekEmails/model";
import { weekReminderEmailWords, type ReminderWeek } from "@/lib/courses/weekEmails/words";
import { weekAsksForWriting, weekDone } from "@/lib/courses/weekWork/model";
import {
  loadPeopleWeekFacts,
  loadRunWeekStates,
  type PersonWeekFacts,
  type RunWeekStates,
} from "@/lib/courses/weekWork/readers";
import {
  resolveNoticeAudience,
  type CohortAudience,
} from "@/lib/email/courseFacilitatorEmails";
import { courseNudgeSessionWhere, courseWeekUrl } from "@/lib/email/courseNudgeEmail";
import { sendNotice } from "@/lib/email/notice";
import { getAdminDb } from "@/lib/firebase/admin";
import { firstWord } from "@/lib/firestore/applicationEmails";
import {
  normalizeCourseGroup,
  sessionModeForWeek,
  type CourseGroupDoc,
} from "@/lib/firestore/courseGroups";
import {
  normalizeCourseRun,
  weekDocId,
  type CourseRunDoc,
  type CourseRunStatus,
} from "@/lib/firestore/courses";
import {
  SCHEDULER_MARKERS_COLLECTION,
  claim,
  isStaleWork,
  stampError,
  stampSentOrSettle,
  stampSkipped,
  weekReminderMarker,
} from "../markers";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * `courses-week-reminders`: THE REMINDERS BEFORE A SESSION. 3 days and 1 day
 * before each of a group's sessions, at 9am in London, one email to each
 * person holding a place in the group whose week is not done, listing what
 * is left of it. "Week N is open", 6 days before, goes to everybody; these go
 * only to the people who have something left to do, and finishing the week
 * stops them.
 *
 * ── A NOTICE ────────────────────────────────────────────────────────────────
 * Reminders about a person's own week's work are part of running the
 * programme (privacy policy v15, "Reminders"), so they reach everybody
 * holding a place in the group whatever they unsubscribed from
 * (`resolveNoticeAudience`), say why above their words ("our records show
 * this week's work isn't finished"), carry no unsubscribe link, and go by
 * email alone, through the notice lane's door (`sendNotice`, surface
 * `course-week-reminder`).
 *
 * ── WHOSE WEEK IS NOT DONE ──────────────────────────────────────────────────
 * The one meaning of done (`weekDone`, `src/lib/courses/weekWork/model.ts`):
 * submitted, when the week asks for anything written, and every reading and
 * step its tasks count ticked. Only weeks written as blocks and published are
 * reminded about: a week written before blocks has no Submit and no lock.
 * Asked per person at the moment the email would go, so somebody who finishes
 * after the 3-day reminder is skipped at the 1-day one. A week that no longer
 * takes work (submitted, or locked) is never reminded about: nothing listed
 * could be done in it. A session that covers two weeks (the one after a
 * cancelled session, keeping pace) reminds about each week not done, each
 * with its own list.
 *
 * ── ONE EACH ────────────────────────────────────────────────────────────────
 * One marker per person per reminder
 * (`schedulerMarkers/weekremind__{groupId}__{sessionKey}__{uid}__{3|1}`),
 * claimed before the send and stamped after it, so two ticks at once send
 * once and a crash re-sends nothing twice. Somebody claimed and not sent is
 * stamped with why: `done` (their week is), `submitted` or `locked` (it takes
 * no more work), `joined-late` (the week's session started before they were
 * told their group, so nothing locks it by the clock), `stale` (the tick was
 * down too long), and the notice audience's own reasons for leaving somebody
 * out: `no-account`, `no-address`, `same-inbox`, `suppressed`. Somebody who
 * left the programme no longer holds a place and is not in the audience at
 * all, so no marker is written for them.
 *
 * ── WHEN ────────────────────────────────────────────────────────────────────
 * A reminder is due from 9am on its day until `maxLateHours` later, and never
 * once the session has started. A reminder later than that is stamped
 * `stale` for the people it never reached, once, for a day after it went
 * stale, and then left alone: the arithmetic is redone every tick, and the
 * markers are the record.
 *
 * ── IT SHIPS SWITCHED OFF ───────────────────────────────────────────────────
 * `enabledByDefault: false`: it emails people. Prove it on dev with Run now.
 */

const JOB_ID = "courses-week-reminders";

/** The same allowlist every course job uses. An allowlist, so a status added later fails closed. */
const LIVE_STATUSES: CourseRunStatus[] = ["applications-open", "applications-closed", "running"];

/** Live runs one pass will consider. Far above anything planned; logged when hit. */
const MAX_CANDIDATE_RUNS = 200;

/** Groups read per run. Runs have single-figure group counts; logged when hit. */
const GROUP_PAGE_SIZE = 50;

/** This job's own share of the tick, floored by what the tick has left. */
const SCAN_BUDGET_MS = 10_000;

/**
 * How long after a reminder went stale it is still looked at, to stamp
 * `stale` on the markers of the people it never reached. After that it is
 * left alone, so a quiet tick does no work for a reminder long gone.
 */
const STALE_REPORT_HOURS = 24;

/** This lane's voice in the shared audience derivation, counted on one group. */
const LANE = {
  logTag: "courses week reminders",
  overCapAdvice: "split the group",
} as const;

type Pass = { sent: number; skipped: number; failed: number };

/** One run's lazily read state, shared by every group in it. */
type RunState = {
  run: CourseRunDoc;
  liveGroups: CourseGroupDoc[];
  weekStates: RunWeekStates | null;
};

type TickState = {
  db: Firestore;
  ctx: JobContext;
  appUrl: string;
  deadlineMs: number;
};

/** A reminder that is due, or freshly stale, for one session of one group. */
type DueReminder = {
  session: ResolvedSession;
  daysBefore: ReminderDays;
  sendAt: Date;
  startsAt: Date;
  stale: boolean;
};

/** One week a reminder may be about, as this group sees it. */
type ReminderWeekInfo = {
  weekNumber: number;
  blocks: readonly WeekBlock[];
  tasks: TaskNeeds[];
  writes: boolean;
  facts: Map<string, PersonWeekFacts>;
};

async function readCandidateRunIds(db: Firestore): Promise<string[]> {
  const snap = await db
    .collection("courseRuns")
    .where("status", "in", LIVE_STATUSES)
    .select()
    .limit(MAX_CANDIDATE_RUNS)
    .get();
  if (snap.size >= MAX_CANDIDATE_RUNS) {
    console.warn(`[scheduler:${JOB_ID}] candidate run cap reached; some live runs were not scanned`, snap.size);
  }
  return snap.docs.map((doc) => doc.id).sort();
}

/**
 * The reminders due now for one group, and those freshly stale: every
 * session that meets and can be dated, each of its two reminders from 9am on
 * its day until the session starts, no further back than `maxLateHours` and
 * the stale report's day.
 */
export function dueReminders(
  sessions: readonly ResolvedSession[],
  now: Date,
  maxLateHours: number,
): DueReminder[] {
  const out: DueReminder[] = [];
  for (const session of sessions) {
    if (session.cancelled) continue;
    const { startsAt } = sessionInstants(session);
    if (!startsAt || now.getTime() >= startsAt.getTime()) continue;
    for (const daysBefore of WEEK_REMINDER_DAYS) {
      const sendAt = weekEmailSendAt(session.dateKey, daysBefore);
      if (!sendAt || now.getTime() < sendAt.getTime()) continue;
      if (isStaleWork(sendAt, now, maxLateHours + STALE_REPORT_HOURS)) continue;
      out.push({ session, daysBefore, sendAt, startsAt, stale: isStaleWork(sendAt, now, maxLateHours) });
    }
  }
  return out;
}

/** What one person is owed by one reminder, or why nothing. */
type Verdict =
  | { send: true; weeks: ReminderWeek[] }
  | { send: false; why: "done" | "submitted" | "locked" | "joined-late" };

/**
 * WHETHER ONE PERSON IS REMINDED, and about which weeks: each week the
 * reminder covers that still takes work and is not done, with what is left
 * of it. Nothing to send says why: every week done, or the first week that
 * takes no more work.
 */
export function reminderVerdict(
  uid: string,
  weeks: readonly ReminderWeekInfo[],
  weekStates: RunWeekStates,
): Verdict {
  const remind: ReminderWeek[] = [];
  let why: Exclude<Verdict, { send: true }>["why"] | null = null;
  for (const week of weeks) {
    const state = weekStates.stateOf(uid, week.weekNumber);
    const own = week.facts.get(uid);
    if (!own) continue;
    const submitted = state.kind === "submitted";
    if (weekDone({ tasks: week.tasks, state: own.state, writes: week.writes, submitted })) continue;
    // Not done, and no more work can be done in it: submitted with something
    // its tasks count still unticked, or locked. Nothing listed could be done.
    if (state.kind === "submitted" || state.kind === "locked") {
      why ??= state.kind;
      continue;
    }
    if (state.kind === "open" && (state.by === "joined-late" || state.by === "no-group")) {
      why ??= "joined-late";
      continue;
    }
    remind.push({
      weekNumber: week.weekNumber,
      left: weekLeft({ blocks: week.blocks, tasks: week.tasks, state: own.state, writes: week.writes, submitted: false }),
      writes: week.writes,
    });
  }
  if (remind.length > 0) return { send: true, weeks: remind };
  return { send: false, why: why ?? "done" };
}

/** The weeks one session's reminder is about: each it covers, written as blocks and published. */
async function reminderWeeks(
  db: Firestore,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  sessions: readonly ResolvedSession[],
  session: ResolvedSession,
  uids: readonly string[],
): Promise<ReminderWeekInfo[]> {
  const out: ReminderWeekInfo[] = [];
  for (const weekNumber of coveredWeeks(sessions, session)) {
    const { week } = await resolveWeekDoc(db, run.id, group.id, weekDocId(weekNumber));
    if (!week || !week.published || !isBlockWeek(week)) continue;
    const facts = await loadPeopleWeekFacts(db, { runId: run.id, weekNumber, blocks: week.blocks, uids });
    out.push({
      weekNumber,
      blocks: week.blocks,
      tasks: weekTaskNeeds(week.blocks),
      writes: weekAsksForWriting(week.blocks),
      facts,
    });
  }
  return out;
}

/** One reminder of one session: each person in the group claimed once, then sent or stamped with why not. */
async function remindForSession(
  state: TickState,
  runState: RunState,
  group: CourseGroupDoc,
  sessions: readonly ResolvedSession[],
  due: DueReminder,
  audience: CohortAudience,
  pass: Pass,
): Promise<"done" | "out-of-time"> {
  const { db, ctx } = state;
  const { run } = runState;
  const everybody = [
    ...audience.members.map((member) => ({ uid: member.uid, member, dropped: null })),
    ...(audience.dropped ?? []).map((drop) => ({ uid: drop.uid, member: null, dropped: drop.why })),
  ].map((person) => ({
    ...person,
    marker: weekReminderMarker(group.id, due.session.sessionKey, person.uid, due.daysBefore),
  }));
  if (everybody.length === 0) return "done";

  // One round trip for this reminder's markers. A settled one (sent, skipped,
  // or given up on) is a person this reminder is finished with, and costs
  // nothing more; every tick of the reminder's day would otherwise claim each
  // of them again only to be told so.
  const markers = await db.getAll(
    ...everybody.map((person) => db.collection(SCHEDULER_MARKERS_COLLECTION).doc(person.marker.id)),
  );
  const people = everybody.filter((_, index) => {
    const data = markers[index].exists ? (markers[index].data() ?? {}) : null;
    return !data || !(data.sentAt || data.skippedReason || data.failedAt);
  });
  if (people.length === 0) return "done";

  const weeks = due.stale
    ? []
    : await reminderWeeks(db, run, group, sessions, due.session, people.map((person) => person.uid));
  if (!due.stale && weeks.length === 0) return "done";
  if (!due.stale && !runState.weekStates) {
    runState.weekStates = await loadRunWeekStates(db, { run, liveGroups: runState.liveGroups, now: ctx.now });
  }
  const where = courseNudgeSessionWhere(due.session.session, sessionModeForWeek(group, due.session.weekId));

  for (const person of people) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) return "out-of-time";
    const { marker } = person;
    const claimed = await claim(db, marker, { job: JOB_ID, policy: ctx.policy });
    if (!claimed.claimed) continue;
    try {
      if (due.stale) {
        await stampSkipped(db, marker.id, "stale", ctx.now);
        pass.skipped += 1;
        continue;
      }
      if (!person.member) {
        await stampSkipped(db, marker.id, person.dropped ?? "no-address", ctx.now);
        pass.skipped += 1;
        continue;
      }
      const verdict = reminderVerdict(person.uid, weeks, runState.weekStates as RunWeekStates);
      if (!verdict.send) {
        await stampSkipped(db, marker.id, verdict.why, ctx.now);
        pass.skipped += 1;
        continue;
      }
      const words = weekReminderEmailWords(
        {
          courseTitle: run.courseTitle,
          daysBefore: due.daysBefore,
          sessionAt: due.startsAt,
          where,
          weeks: verdict.weeks,
          weekUrl: courseWeekUrl(state.appUrl, run.id, verdict.weeks[0].weekNumber),
        },
        firstWord(person.member.ownName),
      );
      // ONE address. One message. Never an array, never a Cc.
      const result = await sendNotice({
        to: person.member.address,
        subject: words.subject,
        surface: "course-week-reminder",
        actorUid: JOB_ID,
        referenceId: run.id,
        render: (notice) => WeekEmail({ words, notice }),
      });
      if (result.suppressed.length > 0) {
        await stampSkipped(db, marker.id, "suppressed", ctx.now);
        pass.skipped += 1;
        continue;
      }
      await stampSentOrSettle(db, marker.id, ctx.now);
      pass.sent += 1;
    } catch (err) {
      // Uid only: an address must not reach the logs.
      console.error(`[scheduler:${JOB_ID}] reminder failed`, {
        runId: run.id,
        groupId: group.id,
        sessionKey: due.session.sessionKey,
        uid: person.uid,
        err,
      });
      // Left unsent, so the re-claim rule tries again and, after three
      // tries, it is listed under Stuck sends.
      await stampError(db, marker.id, err).catch(() => {});
      pass.failed += 1;
    }
  }
  return "done";
}

/** One group: its reminders due now, each person once. */
async function remindForGroup(
  state: TickState,
  runState: RunState,
  group: CourseGroupDoc,
  pass: Pass,
): Promise<"done" | "out-of-time"> {
  const { db, ctx } = state;
  const sessions = resolveSessions(runState.run, group);
  const due = dueReminders(sessions, ctx.now, ctx.maxLateHours);
  if (due.length === 0) return "done";
  // Everybody holding a place in the group, read once for its reminders.
  const audience = await resolveNoticeAudience(db, runState.run.id, LANE, { groupId: group.id });
  if (audience.refusal) {
    ctx.log("reminders not sent", { runId: runState.run.id, groupId: group.id, refusal: audience.refusal });
    return "done";
  }
  for (const reminder of due) {
    if ((await remindForSession(state, runState, group, sessions, reminder, audience, pass)) === "out-of-time") {
      return "out-of-time";
    }
  }
  return "done";
}

async function handler(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };

  // The button in each reminder links to the week's page, built from this.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!appUrl) {
    ctx.log("NEXT_PUBLIC_APP_URL is not set, so no reminder can link to its week");
    return { processed: 0, hasMore: false, note: "no site address" };
  }

  const state: TickState = {
    db,
    ctx,
    appUrl,
    deadlineMs: Date.now() + Math.max(0, Math.min(SCAN_BUDGET_MS, ctx.budget.remainingMs())),
  };
  const pass: Pass = { sent: 0, skipped: 0, failed: 0 };
  let hasMore = false;

  runs: for (const runId of await readCandidateRunIds(db)) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) {
      hasMore = true;
      break;
    }
    // One bad run never stops the pass: it is logged, counted and stepped past.
    try {
      const runSnap = await db.collection("courseRuns").doc(runId).get();
      if (!runSnap.exists) continue;
      const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
      if (!LIVE_STATUSES.includes(run.status)) continue;
      const groupsSnap = await db
        .collection("courseGroups")
        .where("runId", "==", runId)
        .limit(GROUP_PAGE_SIZE)
        .get();
      if (groupsSnap.size >= GROUP_PAGE_SIZE) {
        console.warn(`[scheduler:${JOB_ID}] group cap reached, some groups were not scanned`, {
          runId,
          cap: GROUP_PAGE_SIZE,
        });
      }
      // An archived group is closed: nobody is meeting in it.
      const liveGroups = groupsSnap.docs
        .map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {}))
        .filter((group) => !group.archived);
      const runState: RunState = { run, liveGroups, weekStates: null };
      for (const group of liveGroups) {
        if ((await remindForGroup(state, runState, group, pass)) === "out-of-time") {
          hasMore = true;
          break runs;
        }
      }
    } catch (err) {
      console.error(`[scheduler:${JOB_ID}] run scan failed`, { runId, err });
      pass.failed += 1;
    }
  }

  ctx.log("pass finished", { ...pass, hasMore });
  const note = [
    `${pass.sent} ${pass.sent === 1 ? "reminder" : "reminders"} sent`,
    pass.skipped > 0 ? `${pass.skipped} skipped` : null,
    pass.failed > 0 ? `${pass.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return { processed: pass.sent, hasMore, note };
}

export const weekRemindersJob: JobRegistration = {
  id: "courses-week-reminders",
  label: "Reminders before a session",
  description:
    "3 days and 1 day before each session, at 9am, emails each person in the group whose week isn’t done, listing what’s left of it. Finishing the week stops them.",
  // Reminders sent per tick, one per person. The budget is the real bound.
  maxPerTick: 100,
  // Half a day: a 9am reminder may go until 9pm, and never once the session
  // has started.
  maxLateHours: 12,
  reclaimAfterMinutes: 20,
  // It emails people.
  enabledByDefault: false,
  handler,
};
