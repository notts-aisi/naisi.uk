import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import type { EventDoc } from "@/lib/firestore/events";
import { SURVEYS_COLLECTION, isEventSurvey, normalizeSurvey, type EventSurveyDoc } from "@/lib/firestore/surveys";
import { getAdminDb } from "@/lib/firebase/admin";
import { dueStep, firstPressOf, timesOf, type DueStep } from "@/lib/surveys/events/after";
import { missedSurveyOf, readEventFor } from "@/lib/surveys/events/records";
import { openAtEvent, sendSurveyAfter, type EventPressOutcome } from "@/lib/surveys/events/sending";
import { pressFirstEmails, refreshFromEvent, sendNowCount, settleAuto } from "@/lib/surveys/events/setUp";
import {
  claim,
  eventSurveyMarker,
  isStaleWork,
  stampError,
  stampSentOrSettle,
  stampSkipped,
} from "../markers";
import type { JobContext, JobRegistration, JobResult } from "../registry";

/**
 * `event-surveys`: THE SURVEY AFTER AN EVENT GOES BY ITSELF.
 *
 * For every survey an event's Survey after step set up
 * (`src/lib/surveys/events/setUp.ts`), each tick:
 *
 *  - OPENS IT AT THE EVENT'S START, so its QR code works at the end (its
 *    short link is made then, not at publish, so an event whose survey never
 *    opens mints no permanent code). Emails nobody.
 *  - EMAILS IT when it is due: the chosen number of whole hours after the
 *    event ends (12 unless the step chose 1 to 96), never when it goes only by
 *    hand. With it goes the one question for the people who had a place and
 *    weren't checked in, where the step asked for it and the event's door was
 *    opened. Signed by the event's author, "For NAISI".
 *  - REMINDS ONCE, 3 days after it went (by itself or by somebody's "Send it
 *    now"), the people it reached who haven't answered, and the one
 *    question's too.
 *
 * Nothing happens for an event published before the step existed: only a
 * stored setting sets a survey up. Everything it sends is a
 * notice on the `event-survey` surface, through the same door and the same
 * presses as an admin's (`sendSurveyAfter`).
 *
 * ── ONE READ, AND THE EVENT AS IT STANDS ────────────────────────────────────
 * The surveys it still has work for carry `auto.pending`, so a tick reads
 * them by one equality and nothing else (no declared index); a survey drops
 * out once nothing is left, or when it closes a week after the event. The
 * times are worked out from the event each tick (`timesOf`), so an event
 * moved after publishing moves its survey with it, and the survey's words
 * follow the event until it opens (`refreshFromEvent`).
 *
 * ── ONE EACH ────────────────────────────────────────────────────────────────
 * The email and the reminder are each claimed once per survey by a scheduler
 * marker (`evsurvey__{surveyId}__send|remind`) before the press and stamped
 * after it, and the press keeps the survey's own claim, so two ticks at once
 * and a tick racing an organiser's "Send it now" send once. A marker settled
 * without a send says why: `nobody` (nobody to send it to: nobody checked
 * in, or everybody has answered), `stale`, or the press's own refusal. An
 * event cancelled or deleted leaves its survey unsent and the job finished
 * with it.
 *
 * ── LATE ────────────────────────────────────────────────────────────────────
 * The email and the reminder are due from their time until `maxLateHours`
 * later. Later than that (the job was off, or the tick down) nothing is sent
 * by itself, the survey says so on the event's Survey after tab, and its
 * organisers can still send it there while it is open.
 *
 * ── IT SHIPS SWITCHED OFF ───────────────────────────────────────────────────
 * `enabledByDefault: false`: it emails people. While it is off the
 * editor's step says nothing goes by itself, and surveys are sent from the
 * Survey after tab. Prove it on dev with Run now.
 */

const JOB_ID = "event-surveys";

/** Surveys one pass will read. A term has tens of events; logged when hit. */
const MAX_PENDING = 200;

/** This job's own share of the tick, floored by what the tick has left. */
const SCAN_BUDGET_MS = 20_000;

type Pass = { sent: number; skipped: number; failed: number; opened: number };

type TickState = { db: Firestore; ctx: JobContext; deadlineMs: number; pass: Pass };

/** A press's refusal, as a marker's reason: the words a person would read are too long, so a short code. */
function reasonOf(outcome: Extract<EventPressOutcome, { ok: false }>): string {
  if (outcome.status === 400) return "nobody";
  if (outcome.status === 429) return "capped";
  if (outcome.status === 503) return "no-site-address";
  return "refused";
}

/** The survey as stored now. */
async function reread(db: Firestore, surveyId: string): Promise<EventSurveyDoc | null> {
  const snap = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();
  if (!snap.exists) return null;
  const survey = normalizeSurvey(snap.id, snap.data() ?? {});
  return isEventSurvey(survey) ? survey : null;
}

/** The survey's first email, and the one question beside it, when it is due. */
async function sendStep(state: TickState, survey: EventSurveyDoc, event: EventDoc, due: DueStep): Promise<void> {
  const { db, ctx, pass } = state;
  if (isStaleWork(due.dueAt, ctx.now, ctx.maxLateHours)) {
    await settleAuto(db, survey.id, ctx.now, { "auto.skipped.send": "stale" });
    pass.skipped += 1;
    return;
  }
  const marker = eventSurveyMarker(survey.id, "send");
  const claimed = await claim(db, marker, { job: JOB_ID, policy: ctx.policy });
  if (!claimed.claimed) return;
  try {
    const count = await sendNowCount(db, survey, event);
    if (count.main === 0) {
      // Nobody to send the survey to: nobody was checked in, or everybody
      // answered with the QR code. The one question still goes to the people
      // who had a place, where it is asked.
      await settleAuto(db, survey.id, ctx.now, { "auto.skipped.send": "nobody" });
    }
    if (count.emails === 0) {
      await stampSkipped(db, marker.id, "nobody", ctx.now);
      pass.skipped += 1;
      return;
    }
    const outcome = await pressFirstEmails(db, { survey, event, presserUid: JOB_ID, byJob: true, count, now: ctx.now });
    if (!outcome.ok) {
      const reason = reasonOf(outcome);
      await stampSkipped(db, marker.id, reason, ctx.now);
      // Somebody's "Send it now" won the claim a moment ago: it went, and
      // nothing is skipped. Anything else leaves it for its organisers.
      if (!firstPressOf((await reread(db, survey.id)) ?? survey)) {
        await settleAuto(db, survey.id, ctx.now, { "auto.skipped.send": reason });
      }
      pass.skipped += 1;
      return;
    }
    await stampSentOrSettle(db, marker.id, ctx.now);
    pass.sent += outcome.tally.sent + outcome.tally.held;
  } catch (err) {
    // A survey id, never an address.
    console.error(`[scheduler:${JOB_ID}] email failed`, { surveyId: survey.id, err });
    // Left unsent, so the re-claim rule tries again and, after three tries,
    // it is listed under Stuck sends.
    await stampError(db, marker.id, err).catch(() => {});
    pass.failed += 1;
  }
}

/** The one reminder, 3 days after it went, to the people it reached who haven't answered. */
async function remindStep(state: TickState, survey: EventSurveyDoc, event: EventDoc, due: DueStep): Promise<void> {
  const { db, ctx, pass } = state;
  if (isStaleWork(due.dueAt, ctx.now, ctx.maxLateHours)) {
    await settleAuto(db, survey.id, ctx.now, { "auto.skipped.remind": "stale" });
    pass.skipped += 1;
    return;
  }
  const marker = eventSurveyMarker(survey.id, "remind");
  const claimed = await claim(db, marker, { job: JOB_ID, policy: ctx.policy });
  if (!claimed.claimed) return;
  try {
    const press = { presserUid: JOB_ID, byJob: true, signerUid: event.authorUid, emails: null, audience: null, now: ctx.now };
    const reminded = await sendSurveyAfter(db, "remind", { ...press, survey });
    let sent = reminded.ok ? reminded.tally.sent + reminded.tally.held : 0;
    // The one question's people, where it went, are reminded with it.
    const missed = await missedSurveyOf(db, survey);
    if (missed && firstPressOf(missed)) {
      const second = await sendSurveyAfter(db, "remind", { ...press, survey: missed });
      if (second.ok) sent += second.tally.sent + second.tally.held;
    }
    await settleAuto(db, survey.id, ctx.now, { "auto.remindedAt": ctx.now });
    if (sent === 0) {
      await stampSkipped(db, marker.id, reminded.ok ? "nobody" : reasonOf(reminded), ctx.now);
      pass.skipped += 1;
      return;
    }
    await stampSentOrSettle(db, marker.id, ctx.now);
    pass.sent += sent;
  } catch (err) {
    console.error(`[scheduler:${JOB_ID}] reminder failed`, { surveyId: survey.id, err });
    await stampError(db, marker.id, err).catch(() => {});
    pass.failed += 1;
  }
}

/** One survey: whatever is due now, in order, each step once. */
async function tickSurvey(state: TickState, found: EventSurveyDoc): Promise<void> {
  const { db, ctx, pass } = state;
  const event = await readEventFor(db, found.audience.eventId);
  // An event that is gone or cancelled sends nothing more by itself, and the
  // job is finished with its survey.
  if (!event || event.status === "cancelled") {
    const why = event ? "cancelled" : "gone";
    await db
      .collection(SURVEYS_COLLECTION)
      .doc(found.id)
      .update({
        "auto.pending": false,
        ...(firstPressOf(found) ? {} : { "auto.skipped.send": why }),
        ...(found.auto?.remindedAt ? {} : { "auto.skipped.remind": why }),
      });
    pass.skipped += 1;
    return;
  }
  // Published events only: anything else waits (an event is never set up
  // before it is published, but its status is read as it stands).
  if (event.status !== "published") return;
  let survey = await refreshFromEvent(db, found, event, ctx.now);
  const dueNow = (each: EventSurveyDoc) => (each.auto ? dueStep(each, timesOf(event, each.auto), ctx.now) : null);
  // Each step at most once a tick, in order: opening, then the email, then
  // the reminder, should a tick find them all due (the job was off).
  const done = new Set<DueStep["step"]>();
  for (let due = dueNow(survey); due && !done.has(due.step); due = dueNow(survey)) {
    if (Date.now() >= state.deadlineMs) return;
    done.add(due.step);
    if (due.step === "open") {
      const opened = await openAtEvent(db, survey, JOB_ID, ctx.now);
      if (!opened.ok) {
        ctx.log("not opened", { surveyId: survey.id, refusal: opened.error });
        break;
      }
      pass.opened += 1;
    } else if (due.step === "send") {
      await sendStep(state, survey, event, due);
    } else {
      await remindStep(state, survey, event, due);
    }
    const next = await reread(db, survey.id);
    if (!next) return;
    survey = next;
  }
  await settleAuto(db, survey.id, ctx.now);
}

async function handler(ctx: JobContext): Promise<JobResult> {
  const db = getAdminDb();
  if (!db) return { processed: 0, hasMore: false, note: "no database" };
  const state: TickState = {
    db,
    ctx,
    deadlineMs: Date.now() + Math.max(0, Math.min(SCAN_BUDGET_MS, ctx.budget.remainingMs())),
    pass: { sent: 0, skipped: 0, failed: 0, opened: 0 },
  };
  const snap = await db.collection(SURVEYS_COLLECTION).where("auto.pending", "==", true).limit(MAX_PENDING).get();
  if (snap.size >= MAX_PENDING) {
    console.warn(`[scheduler:${JOB_ID}] pending cap reached; some surveys were not looked at`, snap.size);
  }
  const surveys = snap.docs
    .map((doc) => normalizeSurvey(doc.id, doc.data() ?? {}))
    .filter((survey): survey is EventSurveyDoc => isEventSurvey(survey) && survey.auto !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  let hasMore = false;
  for (const survey of surveys) {
    if (Date.now() >= state.deadlineMs || state.pass.sent >= ctx.maxPerTick) {
      hasMore = true;
      break;
    }
    // One survey that fails never stops the pass: logged, counted, stepped past.
    try {
      await tickSurvey(state, survey);
    } catch (err) {
      console.error(`[scheduler:${JOB_ID}] survey failed`, { surveyId: survey.id, err });
      state.pass.failed += 1;
    }
  }
  const { pass } = state;
  ctx.log("pass finished", { ...pass, hasMore });
  const note = [
    `${pass.sent} ${pass.sent === 1 ? "email" : "emails"} sent`,
    pass.opened > 0 ? `${pass.opened} opened` : null,
    pass.skipped > 0 ? `${pass.skipped} skipped` : null,
    pass.failed > 0 ? `${pass.failed} failed` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return { processed: pass.sent, hasMore, note };
}

export const eventSurveysJob: JobRegistration = {
  id: "event-surveys",
  label: "Surveys after events",
  description:
    "Opens each event's survey when the event starts, emails it by itself when its event's Survey after step said, and reminds once 3 days later the people who haven’t answered.",
  // Emails sent per tick. The budget is the real bound.
  maxPerTick: 300,
  // A day: an email or a reminder later than that is not sent by itself, and
  // the event's organisers can still send it from the Survey after tab.
  maxLateHours: 24,
  reclaimAfterMinutes: 20,
  // It emails people.
  enabledByDefault: false,
  handler,
};
