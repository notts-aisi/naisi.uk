import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type { CourseRunStatus } from "@/lib/firestore/courses";
import type { CheckInSurveyDoc } from "@/lib/firestore/surveys";
import { reminderDueAt, sendCheckInReminder, stillOwed, unansweredOf } from "@/lib/surveys/checkIns/remind";
import { checkInsOfRun, isOpen } from "@/lib/surveys/repo";
import {
  SCHEDULER_MARKERS_COLLECTION,
  checkInReminderMarker,
  claim,
  isStaleWork,
  stampError,
  stampSentOrSettle,
  stampSkipped,
} from "../markers";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * `surveys-check-in-reminders`: THE CHECK-IN'S ONE REMINDER, THE MORNING
 * AFTER. At 9am in London the day after a session, one email to each person
 * its check-in reached who has not sent it, while it is still open
 * (`src/lib/surveys/checkIns/remind.ts`, docs/surveys.md, "Check-ins at the
 * end of a session").
 *
 * ── WHICH ───────────────────────────────────────────────────────────────────
 * The check-ins of every live run (`checkInsOfRun`, one equality on `runId`)
 * that are open, were opened on their session's own day, and whose reminder
 * is due: from 9am the day after the session until `maxLateHours` later, and
 * never once the check-in has closed.
 *
 * ── A NOTICE ────────────────────────────────────────────────────────────────
 * About the person's own programme, like the reminders before a session: it
 * reaches them whatever their settings say, through the notice lane's door
 * (`sendNotice`, surface `course-check-in-reminder`), with their own link.
 *
 * ── ONE EACH ────────────────────────────────────────────────────────────────
 * One marker per person per check-in
 * (`schedulerMarkers/ciremind__{groupId}__{sessionKey}__{uid}`), claimed
 * before the send and stamped after it, so two ticks at once send once and a
 * crash re-sends nothing twice. Somebody claimed and not sent is stamped with
 * why: `answered` (they sent it first), `left` (their seat on the run is no
 * longer live), `closed` (it closed first), `no-address`, `suppressed`, or
 * `stale` (the tick was down too long).
 *
 * ── IT SHIPS SWITCHED OFF ───────────────────────────────────────────────────
 * `enabledByDefault: false`: it emails people.
 */

const JOB_ID = "surveys-check-in-reminders";

/** The same allowlist every course job uses. An allowlist, so a status added later fails closed. */
const LIVE_STATUSES: CourseRunStatus[] = ["applications-open", "applications-closed", "running"];

/** Live runs one pass will consider. Far above anything planned; logged when hit. */
const MAX_CANDIDATE_RUNS = 200;

/** This job's own share of the tick, floored by what the tick has left. */
const SCAN_BUDGET_MS = 10_000;

type Pass = { sent: number; skipped: number; failed: number };

type TickState = { db: Firestore; ctx: JobContext; deadlineMs: number };

async function readCandidateRunIds(db: Firestore): Promise<string[]> {
  const snap = await db.collection("courseRuns").where("status", "in", LIVE_STATUSES).select().limit(MAX_CANDIDATE_RUNS).get();
  if (snap.size >= MAX_CANDIDATE_RUNS) {
    console.warn(`[scheduler:${JOB_ID}] candidate run cap reached; some live runs were not scanned`, snap.size);
  }
  return snap.docs.map((doc) => doc.id).sort();
}

/** A check-in whose reminder is due now, open, and with when it fell due. */
export function dueNow(survey: CheckInSurveyDoc, now: Date): Date | null {
  if (!isOpen(survey, now)) return null;
  const dueAt = reminderDueAt(survey);
  if (!dueAt || now.getTime() < dueAt.getTime()) return null;
  return dueAt;
}

/** The account address of one person, or "". */
async function addressOf(db: Firestore, uid: string): Promise<string> {
  if (!uid || uid.includes("/")) return "";
  const snap = await db.collection("users").doc(uid).get();
  const email = snap.exists ? (snap.data() ?? {}).email : null;
  return typeof email === "string" ? email.trim() : "";
}

/** One check-in's reminder: each person who has not sent it claimed once, then sent or stamped with why not. */
async function remindFor(state: TickState, survey: CheckInSurveyDoc, dueAt: Date, pass: Pass): Promise<"done" | "out-of-time"> {
  const { db, ctx } = state;
  const people = await unansweredOf(db, survey);
  if (people.length === 0) return "done";
  const stale = isStaleWork(dueAt, ctx.now, ctx.maxLateHours);
  const everybody = people.map((person) => ({
    person,
    marker: checkInReminderMarker(survey.audience.groupId, survey.audience.sessionKey, person.respondent.uid),
  }));
  // One round trip for this check-in's markers: a settled one is a person this
  // reminder is finished with, and costs nothing more.
  const markers = await db.getAll(...everybody.map((each) => db.collection(SCHEDULER_MARKERS_COLLECTION).doc(each.marker.id)));
  const waiting = everybody.filter((_, index) => {
    const data = markers[index].exists ? (markers[index].data() ?? {}) : null;
    return !data || !(data.sentAt || data.skippedReason || data.failedAt);
  });

  for (const { person, marker } of waiting) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) return "out-of-time";
    const claimed = await claim(db, marker, { job: JOB_ID, policy: ctx.policy });
    if (!claimed.claimed) continue;
    try {
      if (stale) {
        await stampSkipped(db, marker.id, "stale", ctx.now);
        pass.skipped += 1;
        continue;
      }
      const owed = await stillOwed(db, survey, person, ctx.now);
      if (!owed.owed) {
        await stampSkipped(db, marker.id, owed.why, ctx.now);
        pass.skipped += 1;
        continue;
      }
      const to = await addressOf(db, owed.person.respondent.uid);
      if (!to) {
        await stampSkipped(db, marker.id, "no-address", ctx.now);
        pass.skipped += 1;
        continue;
      }
      const delivery = await sendCheckInReminder(db, { survey, person: owed.person, to, actorUid: JOB_ID });
      if (delivery === "suppressed") {
        await stampSkipped(db, marker.id, "suppressed", ctx.now);
        pass.skipped += 1;
        continue;
      }
      await stampSentOrSettle(db, marker.id, ctx.now);
      pass.sent += 1;
    } catch (err) {
      // A uid, never an address or a secret.
      console.error(`[scheduler:${JOB_ID}] reminder failed`, { surveyId: survey.id, uid: person.respondent.uid, err });
      // Left unsent, so the re-claim rule tries again and, after three tries,
      // it is listed under Stuck sends.
      await stampError(db, marker.id, err).catch(() => {});
      pass.failed += 1;
    }
  }
  return "done";
}

async function handler(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };

  // Each reminder carries the person's own link, built from this.
  if (!(process.env.NEXT_PUBLIC_APP_URL ?? "").trim()) {
    ctx.log("NEXT_PUBLIC_APP_URL is not set, so no reminder can carry a link");
    return { processed: 0, hasMore: false, note: "no site address" };
  }

  const state: TickState = { db, ctx, deadlineMs: Date.now() + Math.max(0, Math.min(SCAN_BUDGET_MS, ctx.budget.remainingMs())) };
  const pass: Pass = { sent: 0, skipped: 0, failed: 0 };
  let hasMore = false;

  runs: for (const runId of await readCandidateRunIds(db)) {
    if (Date.now() >= state.deadlineMs || pass.sent >= ctx.maxPerTick) {
      hasMore = true;
      break;
    }
    // One bad run never stops the pass: it is logged, counted and stepped past.
    try {
      for (const survey of await checkInsOfRun(db, runId)) {
        const dueAt = dueNow(survey, ctx.now);
        if (!dueAt) continue;
        if ((await remindFor(state, survey, dueAt, pass)) === "out-of-time") {
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

export const surveyCheckInRemindersJob: JobRegistration = {
  id: "surveys-check-in-reminders",
  label: "Check-in reminders",
  description:
    "At 9am the day after a session, emails each person its check-in reached who hasn’t sent it, while it’s still open. Once each. Turning it off means nobody is reminded.",
  // Reminders sent per tick, one per person. The budget is the real bound.
  maxPerTick: 100,
  // Half a day: a 9am reminder may go until 9pm, and never once the check-in has closed.
  maxLateHours: 12,
  reclaimAfterMinutes: 20,
  // It emails people.
  enabledByDefault: false,
  handler,
};
