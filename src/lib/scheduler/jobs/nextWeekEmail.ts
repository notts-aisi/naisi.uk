import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { buildHeldEmailTask, heldEmailTaskId } from "@/lib/courses/heldEmailTask";
import { nextWeekEmailMarkerId, sendNextWeekEmail } from "@/lib/courses/nextWeekEmail";
import { nextWeekEmailTiming } from "@/lib/courses/registerChase";
import { missingWeekOpenWords } from "@/lib/courses/weekEmails/words";
import { readAdminUids, registerTaskPeople } from "@/lib/courses/registerTaskPeople";
import type { RunLead } from "@/lib/courses/programmeLead";
import { resolveSessions, type ResolvedSession } from "@/lib/courses/sessions";
import { isOurFollowUpTask } from "@/lib/courses/unmarkedRegisters";
import { getAdminDb } from "@/lib/firebase/admin";
import { readCoursesConfig, type CoursesConfig } from "@/lib/firestore/config";
import { normalizeCourseGroup, type CourseGroupDoc } from "@/lib/firestore/courseGroups";
import {
  normalizeCourseRun,
  type CourseRunDoc,
  type CourseRunStatus,
} from "@/lib/firestore/courses";
import { TASK_FIELD_LIMITS } from "@/lib/firestore/tasks";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * `courses-next-week-email`: "WEEK N IS OPEN" ON A SCHEDULE (wk-register,
 * option B). The id is the one the job shipped with as next week's email, so
 * the switch an admin set on Site status still means what it meant.
 *
 * Each group is sent "Week N is open" (the week, when and where it meets,
 * what the week asks for) 6 days before each of its sessions, at 9am in
 * London, whatever happens to the register. While this job is switched off,
 * pushing the register sends the email instead; switching it on moves the
 * email here and makes the register's button "Finish the register", which
 * emails nobody. How the two never both send is written at the top of
 * `src/lib/courses/nextWeekEmail.ts`: one switch, one shared claim.
 *
 * ── WHAT IS DUE ─────────────────────────────────────────────────────────────
 * A session is due from its send instant until it starts
 * (`nextWeekEmailTiming`). Every tick in that window asks again, so:
 *
 *  - a week that is not PUBLISHED holds the email (published stands in for
 *    "ready" until the weeks have an owner and a Ready switch), and the first
 *    tick after it is published sends it, if the session is still ahead;
 *  - a week published only after its session has started is never sent
 *    about: the window has closed;
 *  - a fact the email carries that is EMPTY (the group's room, the week's
 *    title, what the week asks for) holds the email whole rather than sending
 *    it without, and puts one card on the boards of the programme's lead and
 *    the admins saying what is missing. Filling it in sends the email on the
 *    next tick and archives the card.
 *
 * The group's FIRST session is mailed about like every other: "Week 1 is
 * open" goes 6 days before it, to the people told their group by then.
 *
 * ── ONE SEND PER GROUP PER SESSION ──────────────────────────────────────────
 * Claimed with `.create()` on the group's `gnudge__` marker in
 * `courseNudges`, the same document the push reads. Two ticks at once aim at
 * one document, and one of them sends.
 *
 * ── IT SHIPS SWITCHED OFF ───────────────────────────────────────────────────
 * `enabledByDefault: false`: it emails whole groups. It may only be switched on
 * where the scheduler is actually running, because switching it on also stops
 * the push from sending: on a copy of the site with nothing calling the tick,
 * nobody would get the email at all.
 */

const JOB_ID = "courses-next-week-email";

/**
 * A live cohort's statuses, the same allowlist the register follow-up and the
 * reminders before a session use. An allowlist, so a status added later fails
 * closed.
 */
const LIVE_STATUSES: CourseRunStatus[] = ["applications-open", "applications-closed", "running"];

/** Live runs one pass will consider. Far above anything planned; logged when hit. */
const MAX_CANDIDATE_RUNS = 200;

/** Groups read per run. Runs have single-figure group counts; logged when hit. */
const GROUP_PAGE_SIZE = 50;

/**
 * This job's own share of the tick, floored by what the tick has left. The
 * window is a few days wide and every tick inside it asks again, so stopping
 * early costs a quarter of an hour, never an email.
 */
const SCAN_BUDGET_MS = 10_000;

type Pass = {
  /** Groups emailed this tick. */
  sent: number;
  /** Emails held for an empty value, with a card raised or already standing. */
  heldMissing: number;
  /** Emails waiting for their week to be published. */
  heldUnpublished: number;
  /** Units of work that threw and were carried past. */
  failed: number;
};

/** One tick's lazily read state, shared by every group it reaches. */
type TickState = {
  db: Firestore;
  ctx: JobContext;
  config: CoursesConfig;
  appUrl: string;
  deadlineMs: number;
  /** Read the first time a card is needed, then kept. */
  adminUids: string[] | null;
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
 * One card per group per session, telling the programme's lead and the admins
 * which value holds the email. Created once at a deterministic id; a card
 * already there (from an earlier tick) is left as it is.
 */
async function raiseHeldCard(
  state: TickState,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  session: ResolvedSession,
  missing: string[],
  startsAt: Date,
): Promise<void> {
  const { db } = state;
  const ref = db.collection("tasks").doc(heldEmailTaskId(run.id, group.id, session.sessionKey));
  if ((await ref.get()).exists) return;
  if (state.adminUids === null) state.adminUids = await readAdminUids(db, `scheduler:${JOB_ID}`);
  const people = await registerTaskPeople(db, run.id, state.adminUids, state.leads);
  if (!people) {
    state.ctx.log("no admin accounts, nothing to file a held email's card under");
    return;
  }
  const payload = buildHeldEmailTask({
    runId: run.id,
    groupId: group.id,
    session,
    courseTitle: run.courseTitle || run.label,
    groupName: group.name,
    missing,
    completerUids: people.completerUids,
    creatorUid: people.creatorUid,
    dueDate: startsAt,
    now: state.ctx.now,
    limits: { title: TASK_FIELD_LIMITS.title, description: TASK_FIELD_LIMITS.description },
  });
  try {
    await ref.create(payload);
  } catch (err) {
    // Another tick made it between the read and here, which is the card this
    // one meant to make. Anything else is logged; the email stays held either
    // way and the next tick tries the card again.
    const code = (err as { code?: unknown } | null)?.code;
    if (code !== 6 && code !== "already-exists" && code !== "ALREADY_EXISTS") throw err;
  }
}

/**
 * The email went, so a card that said it was held has done its job. Archived,
 * never deleted, and only when it is the card this job made.
 */
async function archiveHeldCard(
  state: TickState,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  session: ResolvedSession,
): Promise<void> {
  const { db } = state;
  try {
    const ref = db.collection("tasks").doc(heldEmailTaskId(run.id, group.id, session.sessionKey));
    const snap = await ref.get();
    if (!snap.exists) return;
    const data = snap.data();
    if (state.adminUids === null) state.adminUids = await readAdminUids(db, `scheduler:${JOB_ID}`);
    if (!isOurFollowUpTask(data, { runId: run.id, adminUids: state.adminUids })) return;
    if (data?.archived === true) return;
    await ref.update({ archived: true, updatedAt: state.ctx.now });
  } catch (err) {
    console.error(`[scheduler:${JOB_ID}] could not archive a held email's card`, {
      runId: run.id,
      groupId: group.id,
      sessionKey: session.sessionKey,
      err,
    });
  }
}

/** One group: its due sessions, each sent once or held with a reason. */
async function sendForGroup(
  state: TickState,
  run: CourseRunDoc,
  group: CourseGroupDoc,
  pass: Pass,
): Promise<"done" | "out-of-time"> {
  const { db, ctx, config } = state;
  const sessions = resolveSessions(run, group);
  const due: { session: ResolvedSession; startsAt: Date; markerId: string }[] = [];
  sessions.forEach((session, index) => {
    const timing = nextWeekEmailTiming(sessions, index, ctx.now);
    const markerId = nextWeekEmailMarkerId(run.id, group.id, session);
    // A due session always has a date, and so a marker id; the check is for
    // the type, and for a plan somebody broke by hand.
    if (timing.state === "due" && markerId) {
      due.push({ session, startsAt: timing.startsAt, markerId });
    }
  });
  if (due.length === 0) return "done";

  // One round trip for the group's claims. A claim that exists is a send that
  // happened (the push or an earlier tick), and costs nothing more.
  const markerSnaps = await db.getAll(
    ...due.map(({ markerId }) => db.collection("courseNudges").doc(markerId)),
  );

  for (let i = 0; i < due.length; i += 1) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) return "out-of-time";
    if (markerSnaps[i].exists) continue;
    const { session, startsAt } = due[i];
    try {
      const outcome = await sendNextWeekEmail({
        db,
        run,
        group,
        session,
        pushedSessionKey: null,
        by: { kind: "schedule", jobId: JOB_ID },
        force: false,
        whole: true,
        config,
        now: ctx.now,
        appUrl: state.appUrl,
      });
      if (outcome.held === null) {
        pass.sent += 1;
        await archiveHeldCard(state, run, group, session);
      } else if (outcome.held === "missing") {
        pass.heldMissing += 1;
        await raiseHeldCard(
          state,
          run,
          group,
          session,
          missingWeekOpenWords(outcome.missing, session.weekNumber),
          startsAt,
        );
      } else if (outcome.held === "unpublished") {
        pass.heldUnpublished += 1;
      } else if (outcome.held !== "claimed") {
        // Nobody deliverable, a group too big for one send, no dates: each is
        // asked again next tick, and each is said here once per tick.
        ctx.log("next week's email not sent", {
          runId: run.id,
          groupId: group.id,
          sessionKey: session.sessionKey,
          held: outcome.held,
        });
      }
    } catch (err) {
      console.error(`[scheduler:${JOB_ID}] a group's email failed`, {
        runId: run.id,
        groupId: group.id,
        sessionKey: session.sessionKey,
        err,
      });
      pass.failed += 1;
    }
  }
  return "done";
}

async function handler(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };

  // The email's link to the week's page is built from this. Without it every
  // group's email would be held for the same reason, and that is one line in
  // the log, not a card per group.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/+$/, "");
  if (!appUrl) {
    ctx.log("NEXT_PUBLIC_APP_URL is not set, so no email can link to its week");
    return { processed: 0, hasMore: false, note: "no site address" };
  }

  const config = await readCoursesConfig(db);
  const state: TickState = {
    db,
    ctx,
    config,
    appUrl,
    deadlineMs: Date.now() + Math.max(0, Math.min(SCAN_BUDGET_MS, ctx.budget.remainingMs())),
    adminUids: null,
    leads: new Map(),
  };
  const pass: Pass = { sent: 0, heldMissing: 0, heldUnpublished: 0, failed: 0 };
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
      for (const groupDoc of groupsSnap.docs) {
        const group = normalizeCourseGroup(groupDoc.id, groupDoc.data() ?? {});
        // An archived group is closed: nobody is meeting in it.
        if (group.archived) continue;
        if ((await sendForGroup(state, run, group, pass)) === "out-of-time") {
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
    `${pass.sent} ${pass.sent === 1 ? "group" : "groups"} emailed`,
    pass.heldMissing > 0 ? `${pass.heldMissing} held for a missing value` : null,
    pass.heldUnpublished > 0 ? `${pass.heldUnpublished} waiting for a week to be published` : null,
    pass.failed > 0 ? `${pass.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return { processed: pass.sent, hasMore, note };
}

export const nextWeekEmailJob: JobRegistration = {
  id: "courses-next-week-email",
  label: "Week N is open",
  description:
    "Emails everyone in each group “Week N is open” (the week, when and where the group meets, and what the week asks for) 6 days before each session at 9am, and holds it while that week is unpublished or a value is missing. Turning it on also stops pushing a register from sending the email: only turn it on where the scheduler is running.",
  // Groups emailed per tick, each one a message per member. The budget is the
  // real bound; this one stops a misdated run mailing every group at once.
  maxPerTick: 25,
  // A week, longer than the longest lead time. The real cut-off is the
  // session's own start, after which nothing is sent.
  maxLateHours: 168,
  // It claims no scheduler marker (its claim is the group's `gnudge__`
  // marker, shared with the push), so nothing here is ever re-claimed. The
  // field is the registration's, and the floor applies to it like any other.
  reclaimAfterMinutes: 20,
  // It emails whole groups. See the header.
  enabledByDefault: false,
  handler,
};
