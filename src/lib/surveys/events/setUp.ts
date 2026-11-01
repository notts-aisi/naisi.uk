import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { addLaterUntil, openingOf } from "@/lib/events/checkIns";
import { readSurveyAfter, type StoredSurveyAfter } from "@/lib/events/surveyAfter";
import type { EventDoc } from "@/lib/firestore/events";
import {
  SURVEYS_COLLECTION,
  isEventSurvey,
  normalizeSurvey,
  type EventSurveyDoc,
  type SurveyAuto,
} from "@/lib/firestore/surveys";
import { sanitizeSurveyItems, surveyQuestionsOf, type SurveyItem } from "../items";
import { eventStandardItems } from "../questionSetsStore";
import { REFUSAL } from "../words";
import { asksMissed, audienceKindOf, firstPressOf, minutesFor, questionProblems, settingsOf, stillPending, whoAt } from "./after";
import { readEventSendPlan, sendSurveyAfter, type EventPressOutcome, type EventPressTally } from "./sending";
import { missedTemplateItems } from "./template";
import { alignWalkInEmails, eventNamesOffOn, eventSurveyOf, missedSurveyId, missedSurveyOf, readEventFor } from "./records";
import {
  EVENT_REFUSAL,
  eventIntro,
  eventSurveyName,
  eventSurveyTitle,
  missedIntro,
  missedSurveyName,
  missedSurveyTitle,
} from "./words";

/**
 * THE SURVEY AFTER AN EVENT THAT ITS EVENT SETS UP: the
 * writers behind the editor's Survey after step.
 *
 *  - PUBLISHING SETS IT UP (`setUpEventSurvey`, from the publish route): the
 *    survey is made as `createEventSurvey` makes one, with the step's
 *    questions, who it goes to, and `auto`: when it goes, the reminder, the
 *    QR code and the question for people who didn't come. It is a draft until
 *    the event starts. An event with no stored setting, or one switched off,
 *    has none set up: only a stored setting counts.
 *  - ITS WORDS AND DAYS FOLLOW THE EVENT until it opens (`refreshFromEvent`):
 *    a published event's day or name can still change, and the survey names
 *    both.
 *  - THE ONE QUESTION FOR PEOPLE WHO DIDN'T COME (`ensureMissedSurvey`) is a
 *    survey of its own beside it, audience `event-missed`, made as the
 *    survey's email goes, at an event whose door was opened (otherwise
 *    nobody was checked in, and everybody with a place would look as if they
 *    didn't come).
 *  - "SEND IT NOW" (`sendItNow`), for its organisers and admins until it has
 *    gone, and changing it after publishing (`changeSurveyAfter`): the
 *    questions until it opens, who gets it and when until it goes.
 *
 * The `event-surveys` job (`src/lib/scheduler/jobs/eventSurveys.ts`) opens it
 * at the event's start, emails it when it is due and reminds once, through
 * the same door (`sendSurveyAfter`). Every route that calls these has held
 * its caller to its gate first.
 */

type Refusal = { ok: false; status: number; error: string };
const refuse = (status: number, error: string): Refusal => ({ ok: false, status, error });

/** The words and days a survey takes from its event, and its minutes from its questions. */
function fromEvent(event: Pick<EventDoc, "title" | "startAt" | "endAt">, items: readonly SurveyItem[]) {
  const title = event.title.trim() || "Untitled event";
  const questions = surveyQuestionsOf(items).length;
  const minutes = minutesFor(questions);
  return {
    name: eventSurveyName(title),
    title: eventSurveyTitle(title),
    intro: event.startAt ? eventIntro(event.startAt, questions, minutes) : "",
    minutes,
    event: { title, startAt: event.startAt, endAt: event.endAt },
    // A week after the event, when a walk-in's address goes and nobody can
    // be added as having come any more.
    closesAt: addLaterUntil(event),
    namesOffOn: eventNamesOffOn(event),
  };
}

/** The `auto` a setting writes, keeping where the job has got to. */
function autoOf(setting: StoredSurveyAfter, noSignup: boolean, was: SurveyAuto | null): SurveyAuto {
  return {
    when: setting.when,
    hours: setting.hours,
    reminder: setting.reminder,
    showCode: setting.showCode,
    missed: asksMissed(setting, noSignup),
    pending: true,
    remindedAt: was?.remindedAt ?? null,
    skipped: was?.skipped ?? { send: null, remind: null },
  };
}

// ---------------------------------------------------------------------------
// Setting it up
// ---------------------------------------------------------------------------

export type SetUpOutcome = { ok: true; surveyId: string | null; made: boolean } | Refusal;

/**
 * Set up an event's survey from its stored setting, once: nothing when the
 * setting is missing or off, the survey it has when it has one, else a new
 * draft. Never more than a week after the event (`addLaterUntil`).
 */
export async function setUpEventSurvey(db: Firestore, eventId: string, byUid: string, now: Date): Promise<SetUpOutcome> {
  const event = await readEventFor(db, eventId);
  if (!event) return refuse(404, EVENT_REFUSAL.noEvent);
  const setting = event.surveyAfter;
  if (!setting?.on) return { ok: true, surveyId: null, made: false };
  if (event.status !== "published") return refuse(409, EVENT_REFUSAL.notPublished);
  if (!event.startAt) return refuse(409, EVENT_REFUSAL.undated);
  const until = addLaterUntil(event);
  if (until && until.getTime() <= now.getTime()) return refuse(409, EVENT_REFUSAL.tooLate);
  // The standard set as it stands now, when the step chose none: the survey
  // keeps what it copies here, whatever the set says later.
  const standard = await eventStandardItems(db);
  const settings = settingsOf(setting, standard);
  const problem = questionProblems(settings.items, standard)[0];
  if (problem) return refuse(400, problem);

  const words = fromEvent(event, settings.items);
  const ref = db.collection(SURVEYS_COLLECTION).doc();
  // One survey per event, decided inside one transaction: a survey the event
  // has already (made by an admin, or by an earlier press) is the one.
  const made = await db.runTransaction(async (tx) => {
    const existing = await tx.get(db.collection(SURVEYS_COLLECTION).where("eventId", "==", event.id));
    const found = existing.docs
      .map((doc) => normalizeSurvey(doc.id, doc.data() ?? {}))
      .find((survey) => isEventSurvey(survey) && survey.audience.eventId === event.id && survey.audience.kind !== "event-missed");
    if (found) return { id: found.id, made: false };
    tx.set(ref, {
      kind: "event",
      privacy: "confidential",
      name: words.name,
      title: words.title,
      intro: words.intro,
      items: settings.items,
      minutes: words.minutes,
      audience: { kind: audienceKindOf(whoAt(setting, event.noSignup)), eventId: event.id },
      eventId: event.id,
      event: words.event,
      runId: "",
      pairOf: null,
      strand: null,
      closesAt: words.closesAt,
      closedAt: null,
      namesOffOn: words.namesOffOn,
      namesOffAt: null,
      firstSentAt: null,
      presses: [],
      tests: { survey: null, reminder: null },
      testToken: null,
      auto: autoOf(setting, event.noSignup, null),
      createdByUid: byUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { id: ref.id, made: true };
  });
  // The walk-ins' emails go no later than it closes. Its QR code is made when
  // it opens, at the event's start, so an event with no survey mints no code.
  if (made.made) await alignWalkInEmails(db, made.id, now);
  return { ok: true, surveyId: made.id, made: made.made };
}

/** The survey as stored now. */
async function reread(db: Firestore, surveyId: string): Promise<EventSurveyDoc | null> {
  const snap = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();
  if (!snap.exists) return null;
  const survey = normalizeSurvey(snap.id, snap.data() ?? {});
  return isEventSurvey(survey) ? survey : null;
}

const sameInstant = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

/**
 * Until it opens, the survey's words and days follow its event: a name or a
 * day that changed after publishing is the survey's too (its name, title and
 * intro, the event it keeps, when it closes and when names come off). An
 * admin's own words stand until the event itself changes. Once it has opened
 * it is fixed, as every survey is.
 */
export async function refreshFromEvent(db: Firestore, survey: EventSurveyDoc, event: EventDoc, now: Date): Promise<EventSurveyDoc> {
  if (survey.firstSentAt) return survey;
  const title = event.title.trim() || "Untitled event";
  const same =
    survey.event.title === title && sameInstant(survey.event.startAt, event.startAt) && sameInstant(survey.event.endAt, event.endAt);
  if (same) return survey;
  const missed = survey.audience.kind === "event-missed";
  const words = fromEvent(event, survey.items);
  await db
    .collection(SURVEYS_COLLECTION)
    .doc(survey.id)
    .update({
      name: missed ? missedSurveyName(title) : words.name,
      title: missed ? missedSurveyTitle(title) : words.title,
      intro: missed ? (event.startAt ? missedIntro(title, event.startAt) : survey.intro) : words.intro,
      event: words.event,
      closesAt: words.closesAt,
      namesOffOn: words.namesOffOn,
      updatedAt: FieldValue.serverTimestamp(),
    });
  await alignWalkInEmails(db, survey.id, now);
  return (await reread(db, survey.id)) ?? survey;
}

// ---------------------------------------------------------------------------
// The one question for people who didn't come
// ---------------------------------------------------------------------------

/** Whether the survey asks the people who had a place and weren't checked in, at this event as it stands. */
export function asksMissedNow(survey: Pick<EventSurveyDoc, "auto" | "audience">, event: EventDoc): boolean {
  return survey.auto?.missed === true && survey.audience.kind === "event-came" && !event.noSignup && openingOf(event) !== null;
}

/**
 * The one question for people who didn't come, made beside `survey` the first
 * time it is needed, at its fixed id, so two presses at once make one.
 */
export async function ensureMissedSurvey(db: Firestore, survey: EventSurveyDoc, event: EventDoc, byUid: string): Promise<EventSurveyDoc | null> {
  if (!asksMissedNow(survey, event) || !event.startAt) return null;
  const existing = await missedSurveyOf(db, survey);
  if (existing) return existing;
  const title = event.title.trim() || "Untitled event";
  const ref = db.collection(SURVEYS_COLLECTION).doc(missedSurveyId(survey.id));
  try {
    await ref.create({
      kind: "event",
      privacy: "confidential",
      name: missedSurveyName(title),
      title: missedSurveyTitle(title),
      intro: missedIntro(title, event.startAt),
      items: missedTemplateItems(),
      minutes: 1,
      audience: { kind: "event-missed", eventId: event.id },
      eventId: event.id,
      event: { title, startAt: event.startAt, endAt: event.endAt },
      runId: "",
      pairOf: null,
      strand: null,
      // It closes, and its names come off, with the survey it is beside.
      closesAt: survey.closesAt,
      closedAt: null,
      namesOffOn: survey.namesOffOn,
      namesOffAt: null,
      firstSentAt: null,
      presses: [],
      tests: { survey: null, reminder: null },
      testToken: null,
      auto: null,
      createdByUid: byUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Somebody else made it a moment ago: theirs is the one.
    const code = (err as { code?: unknown } | null)?.code;
    if (code !== 6 && code !== "already-exists") throw err;
  }
  return missedSurveyOf(db, survey);
}

// ---------------------------------------------------------------------------
// Who "Send it now" reaches
// ---------------------------------------------------------------------------

/** How many the first email reaches now: the survey's own people, and the people asked the one question instead. */
export type SendNowCount = { main: number; missed: number; emails: number };

export async function sendNowCount(db: Firestore, survey: EventSurveyDoc, event: EventDoc): Promise<SendNowCount> {
  const plan = await readEventSendPlan(db, survey);
  const main = plan.audiences[survey.audience.kind].owed.length;
  let missed = 0;
  if (asksMissedNow(survey, event)) {
    const beside = await missedSurveyOf(db, survey);
    missed = beside
      ? (await readEventSendPlan(db, beside)).audiences["event-missed"].owed.length
      : plan.audiences["event-missed"].owed.length;
  }
  return { main, missed, emails: main + missed };
}

/** Two presses' counts as one. */
function addTallies(a: EventPressTally, b: EventPressTally): EventPressTally {
  return {
    sent: a.sent + b.sent,
    held: a.held + b.held,
    suppressed: a.suppressed + b.suppressed,
    failed: a.failed + b.failed,
    noAddress: a.noAddress + b.noAddress,
  };
}

const EMPTY: EventPressTally = { sent: 0, held: 0, suppressed: 0, failed: 0, noAddress: 0 };

/**
 * After a press or a step: whether the job has anything left to do with the
 * survey (`stillPending`), written so a survey it is finished with drops out
 * of its one read.
 */
export async function settleAuto(db: Firestore, surveyId: string, now: Date, patch: Record<string, unknown> = {}): Promise<void> {
  if (Object.keys(patch).length > 0) {
    await db.collection(SURVEYS_COLLECTION).doc(surveyId).update({ ...patch, updatedAt: FieldValue.serverTimestamp() });
  }
  const survey = await reread(db, surveyId);
  if (!survey?.auto) return;
  const pending = stillPending(survey, now);
  if (pending !== survey.auto.pending) {
    await db.collection(SURVEYS_COLLECTION).doc(surveyId).update({ "auto.pending": pending });
  }
}

/**
 * The first email of a survey its event set up, and the one question beside
 * it, pressed now by `presserUid` (the job's id when it goes by itself). The
 * caller has held the presser to the gate and the survey to its state; the
 * survey's own claim still makes two presses send once.
 */
export async function pressFirstEmails(
  db: Firestore,
  input: { survey: EventSurveyDoc; event: EventDoc; presserUid: string; byJob: boolean; count: SendNowCount; now: Date },
): Promise<EventPressOutcome> {
  const { survey, event, presserUid, byJob, count, now } = input;
  // The job's email is signed by the event's author; a person's by themselves.
  const signerUid = byJob ? event.authorUid : presserUid;
  let tally = EMPTY;
  if (count.main > 0) {
    const first = await sendSurveyAfter(db, "first", {
      survey,
      presserUid,
      byJob,
      signerUid,
      emails: byJob ? null : count.main,
      audience: null,
      now,
    });
    if (!first.ok) return first;
    tally = first.tally;
  }
  if (count.missed > 0) {
    const missed = await ensureMissedSurvey(db, survey, event, presserUid);
    if (missed && !missed.presses.some((press) => press.kind === "first")) {
      const second = await sendSurveyAfter(db, "first", { survey: missed, presserUid, byJob, signerUid, emails: null, audience: null, now });
      // The survey's own email has gone; the one question's refusal is
      // logged and its people are left owed, never sent twice.
      if (second.ok) tally = addTallies(tally, second.tally);
      else console.error("[surveys] the question about not coming was refused", missed.id, second.status);
    }
  }
  await settleAuto(db, survey.id, now);
  return { ok: true, tally };
}

/**
 * "SEND IT NOW": the survey its event set up, emailed now by one of the
 * event's organisers or an admin, until its email has gone, with no test
 * first. `emails` is the number on the button: when the people it
 * reaches have changed, nothing is sent and the page is told the new number.
 */
export async function sendItNow(
  db: Firestore,
  input: { event: EventDoc; presserUid: string; emails: number; now: Date },
): Promise<EventPressOutcome> {
  const { event, presserUid, emails, now } = input;
  if (event.status === "cancelled") return refuse(409, SURVEY_AFTER_REFUSAL.cancelled);
  const found = await eventSurveyOf(db, event.id);
  if (!found) return refuse(409, SURVEY_AFTER_REFUSAL.noSurvey);
  if (!found.auto) return refuse(409, SURVEY_AFTER_REFUSAL.adminMade);
  if (firstPressOf(found)) return refuse(409, EVENT_REFUSAL.emailedOnce);
  if (found.closedAt || !found.closesAt || found.closesAt.getTime() <= now.getTime()) return refuse(409, REFUSAL.closesPast);
  if (!event.startAt || now.getTime() < event.startAt.getTime()) return refuse(409, SURVEY_AFTER_REFUSAL.notStarted);
  const survey = await refreshFromEvent(db, found, event, now);
  const count = await sendNowCount(db, survey, event);
  if (count.emails !== emails) {
    return { ok: false, status: 409, error: countChangedWords(count.emails), emails: count.emails };
  }
  if (count.emails === 0) return refuse(400, REFUSAL.nobody);
  return pressFirstEmails(db, { survey, event, presserUid, byJob: false, count, now });
}

/** "The number of people it reaches changed: it's 14 now." */
function countChangedWords(n: number): string {
  return `The people it reaches have changed: it’s ${n} now. Check, then press again.`;
}

// ---------------------------------------------------------------------------
// Changing it after publishing
// ---------------------------------------------------------------------------

/** The refusals a person can act on, word for word. */
export const SURVEY_AFTER_REFUSAL = {
  body: "That setting didn’t arrive in a shape this page understands. Reload and try again.",
  noSurvey: "This event has no survey set up.",
  adminMade: "An admin made this event’s survey from Surveys, so it’s sent from there.",
  cancelled: "This event is cancelled, so its survey won’t go.",
  notStarted: "The event hasn’t started yet, so there’s nobody to ask how it went.",
  opened: "Its questions are fixed now it has opened.",
  sent: "It has gone, so who got it and when it went are fixed.",
  reminded: "Its reminder has gone already.",
  offOpened: "It has opened, so it can’t be switched off now. An admin can close it from Surveys.",
  notPublished: "Publish the event first. Until then, change it in the editor’s Survey after step.",
} as const;

/** A setting as a request carries it, read strictly, or null for one in no shape the step sends. */
export function parseSurveyAfter(raw: unknown): (StoredSurveyAfter & { items: SurveyItem[] }) | null {
  const stored = readSurveyAfter(raw);
  if (!stored || !raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  // Every field the step sends, of the kind it sends: nothing is filled in for a field left out.
  if (typeof r.on !== "boolean" || typeof r.missed !== "boolean" || typeof r.reminder !== "boolean" || typeof r.showCode !== "boolean") return null;
  if (r.who !== "came" && r.who !== "signups") return null;
  if (r.when !== "standard" && r.when !== "after" && r.when !== "hand") return null;
  if (r.hours !== stored.hours) return null;
  if (!Array.isArray(r.items)) return null;
  return { ...stored, items: sanitizeSurveyItems(r.items) };
}

export type ChangeOutcome = { ok: true; surveyId: string | null } | Refusal;

/**
 * CHANGE THE SURVEY AFTER A PUBLISHED EVENT (the Survey after tab's Save):
 * its questions until it opens; who gets it, when it goes and the question
 * for people who didn't come until its email has gone; the reminder until it
 * has gone; whether its code shows at any time. Switched on, it is set up if
 * the event has none; switched off before it opens, its draft goes. The
 * event keeps the setting too, so its editor says what is set.
 */
export async function changeSurveyAfter(
  db: Firestore,
  input: { event: EventDoc; setting: StoredSurveyAfter & { items: SurveyItem[] }; byUid: string; now: Date },
): Promise<ChangeOutcome> {
  const { event, setting, byUid, now } = input;
  if (event.status !== "published") return refuse(409, SURVEY_AFTER_REFUSAL.notPublished);
  const problem = setting.on ? questionProblems(setting.items, await eventStandardItems(db))[0] : undefined;
  if (problem) return refuse(400, problem);
  const eventRef = db.collection("events").doc(event.id);
  const stored = { ...setting, items: JSON.parse(JSON.stringify(setting.items)) as unknown[] };
  const survey = await eventSurveyOf(db, event.id);

  if (!survey) {
    if (!setting.on) {
      await eventRef.update({ surveyAfter: stored, updatedAt: FieldValue.serverTimestamp() });
      return { ok: true, surveyId: null };
    }
    await eventRef.update({ surveyAfter: stored, updatedAt: FieldValue.serverTimestamp() });
    const set = await setUpEventSurvey(db, event.id, byUid, now);
    return set.ok ? { ok: true, surveyId: set.surveyId } : set;
  }
  if (!survey.auto) return refuse(409, SURVEY_AFTER_REFUSAL.adminMade);

  const opened = survey.firstSentAt !== null;
  const went = firstPressOf(survey) !== null;
  if (!setting.on) {
    if (opened) return refuse(409, SURVEY_AFTER_REFUSAL.offOpened);
    // A draft that never opened has no rows, no answers and no code: it goes whole.
    await db.collection(SURVEYS_COLLECTION).doc(survey.id).delete();
    await eventRef.update({ surveyAfter: stored, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, surveyId: null };
  }

  const patch: Record<string, unknown> = {};
  const itemsChanged = JSON.stringify(sanitizeSurveyItems(setting.items)) !== JSON.stringify(survey.items);
  if (itemsChanged) {
    if (opened) return refuse(409, SURVEY_AFTER_REFUSAL.opened);
    patch.items = setting.items;
    const words = fromEvent(event, setting.items);
    patch.minutes = words.minutes;
    patch.intro = words.intro;
  }
  const audience = audienceKindOf(whoAt(setting, event.noSignup));
  const auto = autoOf(setting, event.noSignup, survey.auto);
  const sendChanged =
    audience !== survey.audience.kind ||
    auto.when !== survey.auto.when ||
    auto.hours !== survey.auto.hours ||
    auto.missed !== survey.auto.missed;
  if (sendChanged) {
    if (went) return refuse(409, SURVEY_AFTER_REFUSAL.sent);
    patch.audience = { kind: audience, eventId: event.id };
    // A send the job let go stale is due again at its new time.
    patch["auto.skipped.send"] = null;
  }
  if (auto.reminder !== survey.auto.reminder) {
    if (survey.auto.remindedAt) return refuse(409, SURVEY_AFTER_REFUSAL.reminded);
  }
  patch["auto.when"] = auto.when;
  patch["auto.hours"] = auto.hours;
  patch["auto.missed"] = auto.missed;
  patch["auto.reminder"] = auto.reminder;
  patch["auto.showCode"] = auto.showCode;
  await settleAuto(db, survey.id, now, patch);
  await eventRef.update({ surveyAfter: stored, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true, surveyId: survey.id };
}
