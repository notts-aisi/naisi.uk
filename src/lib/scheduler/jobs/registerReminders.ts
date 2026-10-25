import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { firstNameOfUser, readRunLead, standingUserOf, type RunLead } from "@/lib/courses/runLead";
import { resolveSessions, sessionInstants, type ResolvedSession } from "@/lib/courses/sessions";
import {
  followUpDueAt,
  isRegisterUnmarked,
  isWithinFollowUpWindow,
} from "@/lib/courses/unmarkedRegisters";
import { wantsEmailForProfile } from "@/lib/email/preferences";
import {
  sendRegisterReminderEmail,
  type RegisterReminderFacts,
} from "@/lib/email/registerReminderEmail";
import { getAdminDb } from "@/lib/firebase/admin";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import { readCoursesConfig, type CoursesConfig } from "@/lib/firestore/config";
import {
  attendanceDocId,
  normalizeCourseAttendance,
} from "@/lib/firestore/courseAttendance";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  normalizeCourseRun,
  type CourseRunDoc,
  type CourseRunStatus,
} from "@/lib/firestore/courses";
import { jobStateFor, readSchedulerConfig } from "@/lib/firestore/schedulerConfig";
import { isSuppressed } from "@/lib/firestore/suppression";
import { nextWeekEmailScheduledIn } from "@/lib/scheduler/nextWeekEmailSchedule";
import { UNMARKED_REGISTERS_JOB } from "@/lib/scheduler/registerJobs";
import {
  claim,
  isStaleWork,
  registerReminderMarker,
  stampError,
  stampSent,
  stampSkipped,
} from "../markers";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * `courses-register-reminders`: ONE EMAIL TO A GROUP'S FACILITATORS when a
 * session's register is still not finished a while after the session ENDED
 * (`config/courses.unmarkedRegisterGraceHours`, 36 by default, set in Site
 * status).
 *
 * The first of the two chases (wk-register, option B): this reminder, then,
 * later, a task for the programme's lead and the admins
 * (`courses-unmarked-registers`). Counted from the session's end, never its
 * start: the register is taken during the session.
 *
 * ── WHAT IS SCANNED ─────────────────────────────────────────────────────────
 * The same band the task job uses, at the reminder's own hours: sessions whose
 * END is between the hours and the hours plus 24, on live runs, in groups that
 * are not archived. "Not finished" is the task job's own predicate
 * (`isRegisterUnmarked`): not pushed, unless the facilitator has said the
 * session did not happen. A finished register is never reminded about.
 *
 * ── ONE EACH ────────────────────────────────────────────────────────────────
 * One marker per facilitator per session
 * (`schedulerMarkers/regremind__{groupId}__{sessionKey}__{uid}`), claimed
 * before the send and stamped after it, so a facilitator is reminded about one
 * register once and a crash re-sends nothing twice. Who is skipped, and why,
 * is stamped on their marker: no standing on the account, no address, their
 * own "Tasks and worksheets" email switch turned off, a suppressed address.
 *
 * ── IT SHIPS SWITCHED OFF ───────────────────────────────────────────────────
 * `enabledByDefault: false`: it emails people.
 */

const JOB_ID = "courses-register-reminders";

/** The same allowlist the task job and the run nudge use. */
const LIVE_STATUSES: CourseRunStatus[] = ["applications-open", "applications-closed", "running"];

const MAX_CANDIDATE_RUNS = 200;
const GROUP_PAGE_SIZE = 50;

/** This job's own share of the tick, floored by what the tick has left. */
const SCAN_BUDGET_MS = 8_000;

/** The skip reason for a suppression list that could not be read. */
const SUPPRESSION_UNREADABLE = "suppression-unreadable";

type Pass = { sent: number; skipped: number; failed: number };

type TickState = {
  db: Firestore;
  ctx: JobContext;
  config: CoursesConfig;
  /** Whether next week's email is on its schedule: which button to name. */
  scheduled: boolean;
  /** Whether the task job is switched on: whether to say a task follows. */
  tasksOn: boolean;
  appUrl: string;
  deadlineMs: number;
  leads: Map<string, RunLead | null>;
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
 * Everything one facilitator's email needs, or the reason not to send it.
 * Each reason lands on their marker verbatim.
 */
async function resolveFacilitator(
  db: Firestore,
  uid: string,
  facilitatorUids: string[],
): Promise<{ to: string; name: string } | { skip: string }> {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) return { skip: "no-account" };
  const data = (snap.data() ?? {}) as Record<string, unknown>;
  // The bar a facilitator is appointed behind, asked again: a name left on a
  // group after the account lost its standing is not somebody to email.
  if (!isNamedWithStanding(standingUserOf(uid, data), "courseGroups.facilitatorUids", facilitatorUids)) {
    return { skip: "no-standing" };
  }
  const email = typeof data.email === "string" ? data.email.trim() : "";
  if (!email) return { skip: "no-address" };
  // Their own "Tasks and worksheets" email switch: a reminder about work they
  // took on, like a worksheet's due-soon reminder.
  if (!wantsEmailForProfile(data.profile, "tasks")) return { skip: "opted-out" };
  try {
    if (await isSuppressed(db, email)) return { skip: "suppressed" };
  } catch {
    return { skip: SUPPRESSION_UNREADABLE };
  }
  return { to: email, name: firstNameOfUser(data) };
}

/** One session's facilitators, each reminded once. */
async function remindForSession(
  state: TickState,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  session: ResolvedSession,
  startsAt: Date,
  endsAt: Date,
  pass: Pass,
): Promise<"done" | "out-of-time"> {
  const { db, ctx, config } = state;
  const dueAt = followUpDueAt(endsAt, config.unmarkedRegisterGraceHours);
  let facts: RegisterReminderFacts | null = null;

  for (const uid of [...new Set(group.facilitatorUids)]) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) return "out-of-time";
    const marker = registerReminderMarker(group.id, session.sessionKey, uid);
    const outcome = await claim(db, marker, { job: JOB_ID, policy: ctx.policy });
    if (!outcome.claimed) continue;
    try {
      // The band already excludes anything this late. Belt to its braces.
      if (isStaleWork(dueAt, ctx.now, ctx.maxLateHours)) {
        await stampSkipped(db, marker.id, "stale", ctx.now);
        pass.skipped += 1;
        continue;
      }
      const person = await resolveFacilitator(db, uid, group.facilitatorUids);
      if ("skip" in person) {
        await stampSkipped(db, marker.id, person.skip, ctx.now);
        pass.skipped += 1;
        continue;
      }
      if (!facts) {
        let leadName = "";
        if (state.tasksOn) {
          if (!state.leads.has(run.id)) state.leads.set(run.id, await readRunLead(db, run.id));
          leadName = state.leads.get(run.id)?.firstName ?? "";
        }
        facts = {
          groupName: group.name,
          sessionStartsAt: startsAt,
          scheduled: state.scheduled,
          task: state.tasksOn ? { hours: config.registerTaskHours, leadName } : null,
        };
      }
      const sent = await sendRegisterReminderEmail({
        to: person.to,
        name: person.name,
        uid,
        runId: run.id,
        registerLink: `${state.appUrl}/learn/${encodeURIComponent(run.id)}/group/${encodeURIComponent(group.id)}`,
        facts,
      });
      if (sent === "sent") {
        await stampSent(db, marker.id, ctx.now);
        pass.sent += 1;
      } else {
        // Left unsent, so the re-claim rule tries again and, after three
        // tries, it is listed under Stuck sends.
        await stampError(db, marker.id, new Error("the reminder email did not send"));
        pass.failed += 1;
      }
    } catch (err) {
      console.error(`[scheduler:${JOB_ID}] reminder failed`, {
        runId: run.id,
        groupId: group.id,
        sessionKey: session.sessionKey,
        err,
      });
      await stampError(db, marker.id, err).catch(() => {});
      pass.failed += 1;
    }
  }
  return "done";
}

/** One group: the sessions in the band whose registers are not finished. */
async function remindForGroup(
  state: TickState,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  pass: Pass,
): Promise<"done" | "out-of-time"> {
  const { db, ctx, config } = state;
  if (group.facilitatorUids.length === 0) return "done";
  const due = resolveSessions(run, group)
    .map((session) => ({ session, ...sessionInstants(session) }))
    .filter(
      (entry): entry is { session: ResolvedSession; startsAt: Date; endsAt: Date } =>
        entry.startsAt !== null &&
        entry.endsAt !== null &&
        isWithinFollowUpWindow(entry.endsAt, ctx.now, config.unmarkedRegisterGraceHours),
    );
  if (due.length === 0) return "done";

  const registers = await db.getAll(
    ...due.map(({ session }) =>
      db
        .collection("courseAttendance")
        .doc(attendanceDocId(run.id, group.id, session.weekNumber, session.occurrence)),
    ),
  );
  for (let i = 0; i < due.length; i += 1) {
    const snap = registers[i];
    const register = snap.exists ? normalizeCourseAttendance(snap.id, snap.data() ?? {}) : null;
    const unfinished = isRegisterUnmarked({
      exists: snap.exists,
      held: register ? register.held : true,
      pushedAt: register?.pushedAt ?? null,
    });
    if (!unfinished) continue;
    const { session, startsAt, endsAt } = due[i];
    if ((await remindForSession(state, run, group, session, startsAt, endsAt, pass)) === "out-of-time") {
      return "out-of-time";
    }
  }
  return "done";
}

async function handler(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!appUrl) {
    ctx.log("NEXT_PUBLIC_APP_URL is not set, so no reminder can link to its register");
    return { processed: 0, hasMore: false, note: "no site address" };
  }

  const [config, scheduler] = await Promise.all([readCoursesConfig(db), readSchedulerConfig(db)]);
  const state: TickState = {
    db,
    ctx,
    config,
    scheduled: nextWeekEmailScheduledIn(scheduler),
    tasksOn: jobStateFor(
      scheduler,
      UNMARKED_REGISTERS_JOB.id,
      UNMARKED_REGISTERS_JOB.enabledByDefault,
    ).enabled,
    appUrl,
    deadlineMs: Date.now() + Math.max(0, Math.min(SCAN_BUDGET_MS, ctx.budget.remainingMs())),
    leads: new Map(),
  };
  const pass: Pass = { sent: 0, skipped: 0, failed: 0 };
  let hasMore = false;

  runs: for (const runId of await readCandidateRunIds(db)) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) {
      hasMore = true;
      break;
    }
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
      for (const groupDoc of groupsSnap.docs) {
        const group = normalizeCourseGroup(groupDoc.id, groupDoc.data() ?? {});
        // An archived group is unstaffed: its facilitators are not chased.
        if (group.archived) continue;
        if ((await remindForGroup(state, run, group, pass)) === "out-of-time") {
          hasMore = true;
          break runs;
        }
      }
    } catch (err) {
      // One bad run never stops the pass.
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

export const registerRemindersJob: JobRegistration = {
  id: "courses-register-reminders",
  label: "Register reminders",
  description:
    "Emails a group's facilitators once when a session's register is still not finished a set number of hours after the session ended (Course settings, below). Turning it off means the first anybody hears of an unfinished register is the task for the lead and admins.",
  // Reminders sent per tick, one per facilitator.
  maxPerTick: 25,
  // Three days, as the task job's: the 24-hour band means nothing normally gets
  // near it; it guards a band somebody widens later.
  maxLateHours: 72,
  reclaimAfterMinutes: 20,
  // It emails people.
  enabledByDefault: false,
  handler,
};
