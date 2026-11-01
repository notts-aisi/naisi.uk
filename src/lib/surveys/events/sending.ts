import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import SurveyEmail from "@/emails/SurveyEmail";
import { dispatchSends } from "@/lib/email/dispatch";
import { sendNotice } from "@/lib/email/notice";
import {
  DAY_MS,
  HOUR_MS,
  MAX_NOTICE_RECIPIENTS,
  NOTICES_PER_DAY,
  NOTICES_PER_HOUR,
  noticeRecipientRefusal,
  reserveNoticeSlots,
} from "@/lib/email/noticeCaps";
import {
  EVENT_AUDIENCE_KINDS,
  SURVEYS_COLLECTION,
  type EventAudience,
  type EventSurveyDoc,
  type EventSurveyPersonDoc,
  type SurveyDelivery,
  type SurveyPressKind,
} from "@/lib/firestore/surveys";
import type { NameViewer } from "@/lib/names/staffName";
import { emailWordsFor, siteAddress, surveyLink } from "../emails";
import { signerOf } from "../sending";
import { REFUSAL, SURVEY_FROM_NAME, SURVEY_REPLY_TO, countChangedWords, type SurveyEmailWords } from "../words";
import { membersOf, readEventAudience, respondentKey, type EventAudienceMember, type EventAudienceRead } from "./audience";
import { ensureSurveyCode } from "./code";
import { besideSurveyId, eventNamesOffDay } from "./records";
import { eventPeopleOf, stampEventDelivery, stampEventReminder, writeEventRows } from "./store";
import { EVENT_REFUSAL } from "./words";

/**
 * OPENING A SURVEY AFTER AN EVENT, EMAILING IT AND REMINDING (sv-send).
 *
 *  - OPEN IT, for the QR code at the event: from then on it takes answers
 *    from anybody signed in who came or signed up, and its questions, words
 *    and closing day are fixed. Emails nobody.
 *  - THE EMAIL, "Email 14 people": to the audience the press names (the
 *    people who came with an email, or everybody who signed up), less anybody
 *    who already answered at the event. It opens the survey too, if nobody
 *    opened it at the event. Refused until the presser has sent themselves a
 *    test of this wording, and claimed once: two presses send it once. It
 *    fixes who the survey emails.
 *  - "SEND TO THE 2 WHO CAME SINCE": the same email to whoever has joined the
 *    audience since (somebody added as having come, a sign-up confirmed) and
 *    has neither been sent it nor answered.
 *  - "REMIND": the reminder, to the people it was emailed to who have not
 *    answered and are still in its audience. Its own test first.
 *
 * Each press re-reads who it reaches and compares the number with the one on
 * the button it came from: when they differ nothing is sent and the page is
 * told the new number. Over the notice lane's ceiling it is refused whole.
 *
 * THE SAME PRESSES, WITH NO BUTTON, for a survey its event set up
 * (`./setUp.ts`): the `event-surveys` job's email and reminder, and an
 * organiser's "Send it now" on the event's Survey after tab. Neither waits for
 * a test (the words are fixed and the editor's step shows them, and "Send
 * a test to me" is offered beside the button). The job's press has no number
 * to compare (`emails: null`), takes no slot under the caps (each of its
 * presses is claimed once by a scheduler marker), is recorded as the job's
 * (`byJob`) and is signed by the event's author, "For NAISI".
 *
 * THE CLASS IS NOTICE (`docs/notifications.md`, surface `event-survey`): it
 * reaches the people who came or signed up whatever their notification grid
 * says, with the lane's visible line, its receipt and its caps. A guest's and
 * a walk-in's email goes to the address they gave the event; an account's to
 * its own address. A test is never a notice: it reaches its own sender
 * (`src/app/api/surveys/[surveyId]/test/route.ts`).
 *
 * One press at a time per survey (`inFlight`, lapsing after five minutes).
 */

/** How long a press's claim holds before another may start, should a request die mid-press. */
const PRESS_LEASE_MS = 5 * 60 * 1000;

/** Who a survey after an event reaches now, read fresh every time a button is drawn or pressed. */
export type EventSendPlan = {
  /** The event has gone: nothing more can be sent. */
  gone: boolean;
  read: EventAudienceRead | null;
  rows: EventSurveyPersonDoc[];
  /** For each audience, everybody in it, and who its email would reach now. */
  audiences: Record<EventAudience["kind"], { members: EventAudienceMember[]; owed: EventAudienceMember[] }>;
  /** Sent the email, not answered, and still in the survey's audience. */
  unanswered: EventSurveyPersonDoc[];
  /** People the email went to. */
  emailed: number;
  /** People it went to who have answered. */
  answeredEmail: number;
  /** People who answered before any email reached them: signed in, with the QR code. */
  answeredAtEvent: number;
  /** Whether the email has gone. */
  firstEmailed: boolean;
};

const KINDS: readonly EventAudience["kind"][] = EVENT_AUDIENCE_KINDS;

export async function readEventSendPlan(db: Firestore, survey: EventSurveyDoc, viewer: NameViewer = null): Promise<EventSendPlan> {
  // The one question for people who weren't checked in skips anybody who has
  // answered the survey it is beside: they came, and the door missed them.
  const beside = survey.audience.kind === "event-missed" ? besideSurveyId(survey.id) : null;
  const [read, rows, besideRows] = await Promise.all([
    readEventAudience(db, survey.audience.eventId, viewer),
    eventPeopleOf(db, survey.id),
    beside ? eventPeopleOf(db, beside) : Promise.resolve([]),
  ]);
  const reached = new Set(rows.filter((row) => row.sentAt !== null || row.answered).map((row) => respondentKey(row.respondent)));
  for (const row of besideRows) if (row.answered) reached.add(respondentKey(row.respondent));
  const audiences = Object.fromEntries(
    KINDS.map((kind) => {
      const members = read ? membersOf(read, kind) : [];
      return [kind, { members, owed: members.filter((member) => member.address !== null && !reached.has(member.key)) }];
    }),
  ) as EventSendPlan["audiences"];
  const inAudience = new Set(audiences[survey.audience.kind].members.map((member) => member.key));
  const emailedRows = rows.filter((row) => row.sentAt !== null);
  return {
    gone: read === null,
    read,
    rows,
    audiences,
    unanswered: emailedRows
      .filter((row) => !row.answered && inAudience.has(respondentKey(row.respondent)))
      .sort((a, b) => a.id.localeCompare(b.id)),
    emailed: emailedRows.length,
    answeredEmail: emailedRows.filter((row) => row.answered).length,
    answeredAtEvent: rows.filter((row) => row.answered && row.sentAt === null).length,
    firstEmailed: survey.presses.some((press) => press.kind === "first"),
  };
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

type Claim = { ok: true; pressId: string } | { ok: false; status: number; error: string };

/**
 * Claim the survey for one press, in one transaction: refused while another
 * press holds it, and the first email refused once it has gone. The press
 * that first opens the survey (an opening at the event, or the first email)
 * stamps `firstSentAt`, which fixes its questions, and the day names come off
 * as it stands then. The first email also fixes who the survey emails.
 */
async function claim(
  db: Firestore,
  surveyId: string,
  kind: SurveyPressKind | "open",
  now: Date,
  fixes: { namesOffOn: string | null; audience?: EventAudience },
): Promise<Claim> {
  const ref = db.collection(SURVEYS_COLLECTION).doc(surveyId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: REFUSAL.noSurvey } as const;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const held = data.inFlight as { at?: unknown } | null | undefined;
    const heldAt = held?.at instanceof Date ? held.at : (held?.at as { toDate?: () => Date } | undefined)?.toDate?.();
    if (heldAt && now.getTime() - heldAt.getTime() < PRESS_LEASE_MS) return { ok: false, status: 409, error: REFUSAL.inFlight } as const;
    const presses = Array.isArray(data.presses) ? (data.presses as { kind?: unknown }[]) : [];
    if (kind === "open" && data.firstSentAt) return { ok: false, status: 409, error: EVENT_REFUSAL.opened } as const;
    if (kind === "first" && presses.some((press) => press.kind === "first")) {
      return { ok: false, status: 409, error: EVENT_REFUSAL.emailedOnce } as const;
    }
    const pressId = randomBytes(9).toString("base64url");
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (kind !== "open") patch.inFlight = { id: pressId, kind, at: now };
    if ((kind === "open" || kind === "first") && !data.firstSentAt) {
      patch.firstSentAt = FieldValue.serverTimestamp();
      patch.namesOffOn = fixes.namesOffOn;
    }
    if (kind === "first" && fixes.audience) patch.audience = { ...fixes.audience };
    tx.update(ref, patch);
    return { ok: true, pressId } as const;
  });
}

/**
 * Hand the claim back and write the press, and who pressed it, into the
 * survey's record of what went: an account's uid, or for the `event-surveys`
 * job its id and `byJob`.
 */
async function release(
  db: Firestore,
  surveyId: string,
  pressId: string,
  kind: SurveyPressKind,
  count: number,
  byUid: string,
  byJob: boolean,
): Promise<void> {
  const ref = db.collection(SURVEYS_COLLECTION).doc(surveyId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const presses = Array.isArray(data.presses) ? [...data.presses] : [];
    // A press that reached nobody is no line in the record, except the first
    // email, whose claim has fixed who the survey emails.
    if (count > 0 || kind === "first") presses.push({ id: pressId, kind, at: new Date(), count, byUid, ...(byJob ? { byJob: true } : {}) });
    const held = data.inFlight as { id?: unknown } | null | undefined;
    const patch: Record<string, unknown> = { presses, updatedAt: FieldValue.serverTimestamp() };
    if (held?.id === pressId) patch.inFlight = FieldValue.delete();
    tx.update(ref, patch);
  });
}

/** The notice lane's two windows for this survey: three presses an hour for one admin, ten a day in all. */
async function claimCaps(db: Firestore, surveyId: string, presserUid: string) {
  return reserveNoticeSlots(db, {
    hour: { key: `survey__${surveyId}__${presserUid}`, limit: NOTICES_PER_HOUR, windowMs: HOUR_MS },
    day: { key: `surveyday__${surveyId}`, limit: NOTICES_PER_DAY, windowMs: DAY_MS },
    noun: "emails about this survey",
  });
}

// ---------------------------------------------------------------------------
// The presses
// ---------------------------------------------------------------------------

export type EventPressTally = { sent: number; held: number; suppressed: number; failed: number; noAddress: number };

export type EventPressOutcome =
  | { ok: true; tally: EventPressTally }
  | { ok: false; status: number; error: string; emails?: number; retryAfterSeconds?: number };

const emptyTally = (): EventPressTally => ({ sent: 0, held: 0, suppressed: 0, failed: 0, noAddress: 0 });

/** Open it for the QR code at the event. Emails nobody. The route has held the caller to admin. */
export async function openAtEvent(
  db: Firestore,
  survey: EventSurveyDoc,
  presserUid: string,
  now: Date,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (survey.firstSentAt) return { ok: false, status: 409, error: EVENT_REFUSAL.opened };
  if (survey.closedAt || !survey.closesAt || survey.closesAt.getTime() <= now.getTime()) {
    return { ok: false, status: 409, error: REFUSAL.closesPast };
  }
  const namesOffOn = await eventNamesOffDay(db, survey);
  if (!namesOffOn) return { ok: false, status: 409, error: EVENT_REFUSAL.undated };
  // The code it is opened for, made now should making it with the survey have failed.
  await ensureSurveyCode(db, { id: survey.audience.eventId, title: survey.event.title }, presserUid);
  const claimed = await claim(db, survey.id, "open", now, { namesOffOn });
  return claimed.ok ? { ok: true } : claimed;
}

/** One email to one person, through the notice door. Never a list, never a Cc. */
async function sendOne(survey: EventSurveyDoc, words: SurveyEmailWords, to: string, token: string, presserUid: string): Promise<SurveyDelivery> {
  const link = surveyLink(token) ?? "";
  const result = await sendNotice({
    to,
    subject: words.subject,
    surface: "event-survey",
    actorUid: presserUid,
    referenceId: survey.id,
    replyTo: SURVEY_REPLY_TO,
    fromName: SURVEY_FROM_NAME,
    render: (marker) => SurveyEmail({ ...words, link, notice: marker }),
  });
  return result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
}

export type EventPressInput = {
  survey: EventSurveyDoc;
  /** Who pressed it: an account's uid, or the job's id when it went by itself. */
  presserUid: string;
  /** Sent by the `event-surveys` job: no button, no slot under the caps, recorded as the job's. */
  byJob?: boolean;
  /** Whose first name signs the email: the presser's, unless the job sends it (the event's author). */
  signerUid?: string;
  /** The number on the button that was pressed; null for the job, which has none. */
  emails: number | null;
  /** The first email's audience, as the Send tab's choice named it; null keeps the survey's. */
  audience: EventAudience["kind"] | null;
  now: Date;
};

/** The email to a list of people, each with their own link, after the claim. */
async function emailPeople(
  db: Firestore,
  survey: EventSurveyDoc,
  plan: EventSendPlan,
  owed: readonly EventAudienceMember[],
  words: SurveyEmailWords,
  pressId: string,
  presserUid: string,
): Promise<EventPressTally> {
  const tally = emptyTally();
  const reachable = owed.filter((member) => member.address !== null);
  tally.noAddress += owed.length - reachable.length;
  const rows = await writeEventRows(db, survey, reachable, plan.rows, pressId);
  const sends = rows.map((row, at) => ({ ...row, address: reachable[at].address as string }));
  await dispatchSends(sends, async (row) => {
    let delivery: SurveyDelivery;
    try {
      delivery = await sendOne(survey, words, row.address, row.token, presserUid);
    } catch (err) {
      // A row's id, never an address or a secret.
      console.error("[surveys] event send failed", survey.id, row.id, err);
      tally.failed += 1;
      return;
    }
    tally[delivery] += 1;
    await stampEventDelivery(db, row.id, delivery);
  });
  return tally;
}

/**
 * The first email ("first") or the email to people who joined the audience
 * since ("joined"). The route has already held the caller to admin, the survey
 * to its closing day and, for the first email, the presser's test.
 */
export async function pressEventSend(db: Firestore, kind: "first" | "joined", input: EventPressInput): Promise<EventPressOutcome> {
  const { presserUid, now } = input;
  const byJob = input.byJob === true;
  // The one question for people who weren't checked in keeps its own
  // audience: nothing a press names moves it.
  const survey: EventSurveyDoc =
    kind === "first" && input.audience && input.survey.audience.kind !== "event-missed"
      ? { ...input.survey, audience: { kind: input.audience, eventId: input.survey.audience.eventId } }
      : input.survey;
  if (!siteAddress()) return { ok: false, status: 503, error: REFUSAL.noAddress };
  const plan = await readEventSendPlan(db, survey);
  if (plan.gone) return { ok: false, status: 409, error: EVENT_REFUSAL.noEvent };
  if (kind === "first" && survey.audience.kind === "event-signups" && plan.read?.event.noSignup) {
    return { ok: false, status: 409, error: EVENT_REFUSAL.noSignup };
  }
  if (kind === "joined" && !plan.firstEmailed) return { ok: false, status: 409, error: EVENT_REFUSAL.notEmailed };
  const owed = plan.audiences[survey.audience.kind].owed;
  if (input.emails !== null && owed.length !== input.emails) {
    return { ok: false, status: 409, error: countChangedWords(owed.length), emails: owed.length };
  }
  if (owed.length === 0) return { ok: false, status: 400, error: REFUSAL.nobody };
  if (owed.length > MAX_NOTICE_RECIPIENTS) {
    return {
      ok: false,
      status: 400,
      error: noticeRecipientRefusal(owed.length, MAX_NOTICE_RECIPIENTS, "ask whoever looks after the site to send it in parts"),
    };
  }
  const words = emailWordsFor(survey, "survey", await signerOf(db, input.signerUid ?? presserUid));
  if (!words) return { ok: false, status: 409, error: REFUSAL.closesPast };
  const namesOffOn = survey.firstSentAt ? survey.namesOffOn : await eventNamesOffDay(db, survey);
  if (!namesOffOn) return { ok: false, status: 409, error: EVENT_REFUSAL.undated };

  // The job's press is claimed once by its scheduler marker, so it takes no
  // slot under the lane's caps; a person's press does.
  if (!byJob) {
    const caps = await claimCaps(db, survey.id, presserUid);
    if (!caps.ok) return { ok: false, status: 429, error: caps.refusal ?? REFUSAL.inFlight, retryAfterSeconds: caps.retryAfterSeconds };
  }
  const claimed = await claim(db, survey.id, kind, now, { namesOffOn, audience: kind === "first" ? survey.audience : undefined });
  if (!claimed.ok) return { ok: false, status: claimed.status, error: claimed.error };

  let tally = emptyTally();
  try {
    tally = await emailPeople(db, survey, plan, owed, words, claimed.pressId, presserUid);
  } finally {
    await release(db, survey.id, claimed.pressId, kind, tally.sent + tally.held + tally.suppressed, presserUid, byJob);
  }
  return { ok: true, tally };
}

/**
 * "Remind": the reminder, to the people the email went to who have not
 * answered and are still in its audience. The route has already held the
 * caller to admin, the survey to open and emailed, and the presser to a test
 * of the reminder.
 */
export async function pressEventRemind(db: Firestore, input: EventPressInput): Promise<EventPressOutcome> {
  const { survey, presserUid, now } = input;
  const byJob = input.byJob === true;
  if (!siteAddress()) return { ok: false, status: 503, error: REFUSAL.noAddress };
  const plan = await readEventSendPlan(db, survey);
  if (plan.gone) return { ok: false, status: 409, error: EVENT_REFUSAL.noEvent };
  const owed = plan.unanswered;
  if (input.emails !== null && owed.length !== input.emails) {
    return { ok: false, status: 409, error: countChangedWords(owed.length), emails: owed.length };
  }
  if (owed.length === 0) return { ok: false, status: 400, error: REFUSAL.nobody };
  if (owed.length > MAX_NOTICE_RECIPIENTS) {
    return {
      ok: false,
      status: 400,
      error: noticeRecipientRefusal(owed.length, MAX_NOTICE_RECIPIENTS, "ask whoever looks after the site to send it in parts"),
    };
  }
  const words = emailWordsFor(survey, "reminder", await signerOf(db, input.signerUid ?? presserUid));
  if (!words) return { ok: false, status: 409, error: REFUSAL.closesPast };

  if (!byJob) {
    const caps = await claimCaps(db, survey.id, presserUid);
    if (!caps.ok) return { ok: false, status: 429, error: caps.refusal ?? REFUSAL.inFlight, retryAfterSeconds: caps.retryAfterSeconds };
  }
  const claimed = await claim(db, survey.id, "remind", now, { namesOffOn: survey.namesOffOn });
  if (!claimed.ok) return { ok: false, status: claimed.status, error: claimed.error };

  const tally = emptyTally();
  const members = new Map((plan.read?.people ?? []).map((member) => [member.key, member]));
  try {
    await dispatchSends(owed, async (row) => {
      // The address the audience holds now: a walk-in's goes when the survey
      // closes or a week after the event, whichever comes first.
      const address = members.get(respondentKey(row.respondent))?.address ?? null;
      if (!address) {
        tally.noAddress += 1;
        return;
      }
      let delivery: SurveyDelivery;
      try {
        delivery = await sendOne(survey, words, address, row.token, presserUid);
      } catch (err) {
        console.error("[surveys] event reminder failed", survey.id, row.id, err);
        tally.failed += 1;
        return;
      }
      tally[delivery] += 1;
      await stampEventReminder(db, row.id);
    });
  } finally {
    await release(db, survey.id, claimed.pressId, "remind", tally.sent + tally.held + tally.suppressed, presserUid, byJob);
  }
  return { ok: true, tally };
}

/**
 * THE DOOR A SURVEY ITS EVENT SET UP GOES OUT THROUGH, with no button: its
 * first email (`first`) or its reminder (`remind`), pressed by the
 * `event-surveys` job when it is due or by an organiser's "Send it now"
 * (`./setUp.ts`). The same presses as an admin's, through the same notice
 * door, each person with their own link; never a test first.
 */
export async function sendSurveyAfter(db: Firestore, step: "first" | "remind", input: EventPressInput): Promise<EventPressOutcome> {
  return step === "remind" ? pressEventRemind(db, input) : pressEventSend(db, "first", input);
}

/** A press's outcome as a route answers it: counts, never an address. */
export function pressAnswer(outcome: EventPressOutcome): { status: number; body: Record<string, unknown>; headers?: Record<string, string> } {
  if (!outcome.ok) {
    return {
      status: outcome.status,
      body: outcome.emails === undefined ? { error: outcome.error } : { error: outcome.error, emails: outcome.emails },
      headers: outcome.retryAfterSeconds ? { "Retry-After": String(outcome.retryAfterSeconds) } : undefined,
    };
  }
  const { sent, held, suppressed, failed, noAddress } = outcome.tally;
  return { status: 200, body: { ok: true, sent, held, suppressed, failed, noAddress } };
}
