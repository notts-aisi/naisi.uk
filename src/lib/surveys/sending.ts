import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import SurveyEmail from "@/emails/SurveyEmail";
import { openAnonymousForm } from "@/lib/anonymousFeedback/forms";
import type { PlaceHolder } from "@/lib/applications/handover/holders";
import { firstNameOfUser } from "@/lib/courses/programmeLead";
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
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  programmeOf,
  surveyPersonId,
  type SurveyDelivery,
  type SurveyDoc,
  type SurveyEmailKind,
  type SurveyPersonDoc,
  type SurveyPressKind,
} from "@/lib/firestore/surveys";
import { readAudience, type AudienceRead } from "./audience";
import { emailWordsFor, siteAddress, surveyLink, testStateOf, wordingFingerprint, type TestState } from "./emails";
import { peopleOf } from "./repo";
import { mintSurveyToken } from "./token";
import {
  REFUSAL,
  SURVEY_FROM_NAME,
  SURVEY_REPLY_TO,
  TEST_LINE,
  countChangedWords,
  testSubject,
  type SurveyEmailWords,
} from "./words";

/**
 * SENDING A PROGRAMME SURVEY, AND REMINDING, BY HAND (sv-send-programme).
 *
 * Three presses, each made by an admin and each saying on its button how many
 * people it reaches:
 *
 *  - THE FIRST SEND, "Email 30 people": everybody holding a place. Refused
 *    until the presser has sent themselves a test of this wording (the
 *    Publish lock), and claimed once (`firstSentAt`), so two admins pressing
 *    at once send it once. From then on the questions, the words and the
 *    closing date are fixed.
 *  - "SEND TO THE 2 WHO JOINED SINCE": the same email to everybody holding a
 *    place it has not been sent to.
 *  - "REMIND": the reminder, to the people it was sent to who have not
 *    answered and still hold a place. Refused until the presser has sent
 *    themselves a test of the reminder's wording.
 *
 * Each press re-reads who it reaches and compares the number with the one on
 * the button it came from: when they differ nothing is sent and the page is
 * told the new number. Over the notice lane's ceiling it is refused whole,
 * never cut short.
 *
 * THE CLASS IS NOTICE (`docs/notifications.md`): the survey reaches everybody
 * holding a place, whatever their notification grid says, with the lane's
 * visible line and its receipt (`course-survey`), and its caps. A follow-up
 * reaches the people who said yes to follow-ups, and its line and receipt say
 * that (`course-follow-up`). A test is never a notice: it reaches its own
 * sender.
 *
 * Each person's own row (`surveyPeople`) is written BEFORE their email, with
 * the secret their link carries; the email is then sent, one address per
 * message, and the row stamped with what became of it. A send that throws
 * leaves the row unstamped, so they are still owed it and the next press of
 * "joined since" reaches them.
 *
 * One press at a time per survey (`inFlight`, released at the end, and lapsing
 * after five minutes should a request die), so two presses never overlap.
 */

/** How long a press's claim holds before another may start, should a request die mid-press. */
const PRESS_LEASE_MS = 5 * 60 * 1000;

/** A new secret for a personal link: `./token.ts`, the one place one is made. */
export { mintSurveyToken };

/** Who a survey reaches now, read fresh every time a button is drawn or pressed. */
export type SendPlan = {
  /** The form, or its programme, has gone: nothing more can be sent. */
  gone: boolean;
  holders: PlaceHolder[];
  people: SurveyPersonDoc[];
  /** Holding a place, and not sent it yet: everybody before the first send, then whoever joined since. */
  owed: PlaceHolder[];
  /** Sent it, not answered, and still holding a place. */
  unanswered: SurveyPersonDoc[];
  /** Sent it, not answered, and no longer in its audience (left, or no longer saying yes), so Remind does not reach them. */
  notReached: number;
  /** People it was sent to. */
  sent: number;
  /** People who have answered. */
  answered: number;
};

/**
 * WHO "REMIND" REACHES: the people it was sent to who have not answered and
 * are still in its audience, by uid. The one answer the Send tab's button,
 * its press and the survey list's "Remind 12 haven’t answered" all give.
 */
export function remindReach(people: readonly SurveyPersonDoc[], audience: AudienceRead): SurveyPersonDoc[] {
  const holding = new Set((audience.status === "ok" ? audience.holders : []).map((holder) => holder.uid));
  return people
    .filter((person) => person.sentAt !== null && !person.answered && holding.has(person.respondent.uid))
    .sort((a, b) => a.respondent.uid.localeCompare(b.respondent.uid));
}

export async function readSendPlan(db: Firestore, survey: SurveyDoc): Promise<SendPlan> {
  const [audience, people] = await Promise.all([readAudience(db, survey.audience), peopleOf(db, survey.id)]);
  const holders = audience.status === "ok" ? audience.holders : [];
  const sentTo = new Set(people.filter((person) => person.sentAt !== null).map((person) => person.respondent.uid));
  const unanswered = remindReach(people, audience);
  const waiting = people.filter((person) => person.sentAt !== null && !person.answered).length;
  return {
    gone: audience.status !== "ok",
    holders,
    people,
    owed: holders.filter((holder) => !sentTo.has(holder.uid)),
    unanswered,
    notReached: waiting - unanswered.length,
    sent: sentTo.size,
    answered: people.filter((person) => person.answered).length,
  };
}

/** The presser's first name, which signs the email, from their account. */
export async function signerOf(db: Firestore, uid: string): Promise<string> {
  const snap = await db.collection("users").doc(uid).get();
  return snap.exists ? firstNameOfUser((snap.data() ?? {}) as Record<string, unknown>) : "";
}

/** Where one email stands on its test for this presser now. */
export function testStateFor(survey: SurveyDoc, email: SurveyEmailKind, signer: string): TestState {
  const words = emailWordsFor(survey, email, signer);
  if (!words) return "none";
  return testStateOf(survey.tests[email], wordingFingerprint(words));
}

// ---------------------------------------------------------------------------
// A test, to the presser alone
// ---------------------------------------------------------------------------

/** A test, ready for the mail door, and the wording it is a test of. */
export type PreparedTest =
  | {
      ok: true;
      message: {
        to: string;
        subject: string;
        react: ReturnType<typeof SurveyEmail>;
        replyTo: string;
        fromName: string;
        actorUid: string;
        referenceId: string;
      };
      wording: string;
    }
  | { ok: false; status: number; error: string };

/**
 * "Send a test to me", written: the email as it would go now, signed by the
 * presser, to the address on their own session and nobody else's, marked as a
 * test. Its button opens the survey through the survey's test secret, made
 * here the first time, where nothing sent is kept. The route hands it to the
 * mail door itself, and records it (`recordSurveyTest`) only when it reached
 * them.
 */
export async function prepareSurveyTest(
  db: Firestore,
  survey: SurveyDoc,
  email: SurveyEmailKind,
  presser: { uid: string; address: string },
): Promise<PreparedTest> {
  const signer = await signerOf(db, presser.uid);
  const words = emailWordsFor(survey, email, signer);
  if (!words) return { ok: false, status: 409, error: REFUSAL.closesPast };
  const token = survey.testToken ?? mintSurveyToken();
  const link = surveyLink(token);
  if (!link) return { ok: false, status: 503, error: REFUSAL.noAddress };
  if (!survey.testToken) {
    await db.collection(SURVEYS_COLLECTION).doc(survey.id).update({ testToken: token });
  }
  return {
    ok: true,
    message: {
      to: presser.address,
      subject: testSubject(words.subject),
      react: SurveyEmail({ ...words, link, testLine: TEST_LINE }),
      replyTo: SURVEY_REPLY_TO,
      fromName: SURVEY_FROM_NAME,
      actorUid: presser.uid,
      referenceId: survey.id,
    },
    wording: wordingFingerprint(words),
  };
}

/** Record a test that reached whoever sent it, with the wording it was of. */
export async function recordSurveyTest(
  db: Firestore,
  surveyId: string,
  email: SurveyEmailKind,
  presserUid: string,
  wording: string,
): Promise<void> {
  await db
    .collection(SURVEYS_COLLECTION)
    .doc(surveyId)
    .update({ [`tests.${email}`]: { byUid: presserUid, at: FieldValue.serverTimestamp(), wording } });
}

// ---------------------------------------------------------------------------
// The presses
// ---------------------------------------------------------------------------

export type PressTally = { sent: number; held: number; suppressed: number; failed: number; noAddress: number };

export type PressOutcome =
  | { ok: true; tally: PressTally }
  | { ok: false; status: number; error: string; emails?: number; retryAfterSeconds?: number };

type Claim = { ok: true; pressId: string } | { ok: false; error: string };

/**
 * Claim the survey for one press, in one transaction: refused while another
 * press holds it, and the first send refused once it has been sent. The first
 * send stamps `firstSentAt` here, which is what fixes the questions, and the
 * day names come off as it stood when the press was made.
 */
async function claimPress(
  db: Firestore,
  surveyId: string,
  kind: SurveyPressKind,
  now: Date,
  namesOffOn: string | null,
): Promise<Claim> {
  const ref = db.collection(SURVEYS_COLLECTION).doc(surveyId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, error: REFUSAL.noSurvey } as const;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const held = data.inFlight as { at?: unknown } | null | undefined;
    const heldAt = held?.at instanceof Date ? held.at : (held?.at as { toDate?: () => Date } | undefined)?.toDate?.();
    if (heldAt && now.getTime() - heldAt.getTime() < PRESS_LEASE_MS) return { ok: false, error: REFUSAL.inFlight } as const;
    if (kind === "first" && data.firstSentAt) return { ok: false, error: REFUSAL.alreadySent } as const;
    const pressId = randomBytes(9).toString("base64url");
    const patch: Record<string, unknown> = { inFlight: { id: pressId, kind, at: now }, updatedAt: FieldValue.serverTimestamp() };
    if (kind === "first") {
      patch.firstSentAt = FieldValue.serverTimestamp();
      patch.namesOffOn = namesOffOn;
    }
    tx.update(ref, patch);
    return { ok: true, pressId } as const;
  });
}

/** Hand the claim back and write the press into the survey's record of what went. */
async function releasePress(db: Firestore, surveyId: string, pressId: string, kind: SurveyPressKind, count: number): Promise<void> {
  const ref = db.collection(SURVEYS_COLLECTION).doc(surveyId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const presses = Array.isArray(data.presses) ? [...data.presses] : [];
    // A press that reached nobody is no line in the record, except the first,
    // whose stamp has already fixed the survey.
    if (count > 0 || kind === "first") presses.push({ id: pressId, kind, at: new Date(), count });
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

async function addressesOf(db: Firestore, uids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const wanted = uids.filter((uid) => uid && !uid.includes("/"));
  if (wanted.length === 0) return out;
  const docs = await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid)));
  for (const doc of docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const address = typeof data.email === "string" ? data.email.trim() : "";
    if (doc.exists && address) out.set(doc.id, address);
  }
  return out;
}

const emptyTally = (): PressTally => ({ sent: 0, held: 0, suppressed: 0, failed: 0, noAddress: 0 });

/** One email to one person, through the notice door. Never a list, never a Cc. */
async function sendOne(
  survey: SurveyDoc,
  words: SurveyEmailWords,
  to: string,
  token: string,
  presserUid: string,
): Promise<SurveyDelivery> {
  const link = surveyLink(token) ?? "";
  const result = await sendNotice({
    to,
    subject: words.subject,
    // A follow-up reached the person because they said yes to it, not because they hold a place now.
    surface: survey.audience.kind === "followUps" ? "course-follow-up" : "course-survey",
    actorUid: presserUid,
    referenceId: survey.id,
    replyTo: SURVEY_REPLY_TO,
    fromName: SURVEY_FROM_NAME,
    render: (marker) => SurveyEmail({ ...words, link, notice: marker }),
  });
  return result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
}

export type PressInput = {
  survey: SurveyDoc;
  presserUid: string;
  /** The number on the button that was pressed. */
  emails: number;
  /** The day names come off, worked out just now (the first send fixes it). */
  namesOffOn: string | null;
  now: Date;
};

/**
 * The first send ("first") or the send to people who joined since ("joined").
 * The route has already held the caller to admin, the survey to open and, for
 * the first send, the presser's test.
 */
export async function pressSend(db: Firestore, kind: "first" | "joined", input: PressInput): Promise<PressOutcome> {
  const { survey, presserUid, now } = input;
  if (!siteAddress()) return { ok: false, status: 503, error: REFUSAL.noAddress };
  const plan = await readSendPlan(db, survey);
  if (plan.gone) return { ok: false, status: 409, error: REFUSAL.formGone };
  const owed = plan.owed;
  if (owed.length !== input.emails) {
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
  const signer = await signerOf(db, presserUid);
  const words = emailWordsFor(survey, "survey", signer);
  if (!words) return { ok: false, status: 409, error: REFUSAL.closesPast };

  const caps = await claimCaps(db, survey.id, presserUid);
  if (!caps.ok) return { ok: false, status: 429, error: caps.refusal ?? REFUSAL.inFlight, retryAfterSeconds: caps.retryAfterSeconds };
  const claim = await claimPress(db, survey.id, kind, now, input.namesOffOn);
  if (!claim.ok) return { ok: false, status: 409, error: claim.error };

  const tally = emptyTally();
  try {
    // The survey at a programme's end opens the programme's anonymous keep,
    // change and drop form with its first send, with the closing time that
    // send has just fixed (docs/surveys.md). Asked again by "joined since",
    // which changes nothing once it is open, so a first send that failed
    // here still opens it on the next press.
    if (survey.kind === "after" && survey.closesAt) {
      await openAnonymousForm(
        db,
        {
          surveyId: survey.id,
          ...programmeOf(survey.audience),
          runId: survey.runId,
          programmeName: survey.programmeName,
          programmeKind: survey.programmeKind,
          closesAt: survey.closesAt,
        },
        now,
      );
    }
    const addresses = await addressesOf(db, owed.map((holder) => holder.uid));
    // Each person's row, with the secret their link carries, before any email.
    const byUid = new Map(plan.people.map((person) => [person.respondent.uid, person]));
    const rows: { uid: string; token: string; address: string }[] = [];
    const batch = db.batch();
    for (const holder of owed) {
      const address = addresses.get(holder.uid);
      if (!address) {
        tally.noAddress += 1;
        continue;
      }
      const existing = byUid.get(holder.uid);
      const respondent = { kind: "account" as const, uid: holder.uid };
      const ref = db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(survey.id, respondent));
      if (existing) {
        batch.update(ref, { pressId: claim.pressId });
        rows.push({ uid: holder.uid, token: existing.token, address });
      } else {
        const token = mintSurveyToken();
        batch.set(ref, {
          surveyId: survey.id,
          roundId: programmeOf(survey.audience).roundId,
          respondent,
          token,
          pressId: claim.pressId,
          sentAt: null,
          delivery: null,
          remindedAt: null,
          reminders: 0,
          answered: false,
        });
        rows.push({ uid: holder.uid, token, address });
      }
    }
    await batch.commit();

    await dispatchSends(rows, async (row) => {
      const ref = db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(survey.id, { kind: "account", uid: row.uid }));
      let delivery: SurveyDelivery;
      try {
        delivery = await sendOne(survey, words, row.address, row.token, presserUid);
      } catch (err) {
        // A uid, never an address or a secret.
        console.error("[surveys] send failed", survey.id, row.uid, err);
        tally.failed += 1;
        return;
      }
      tally[delivery] += 1;
      await ref.update({ sentAt: FieldValue.serverTimestamp(), delivery });
    });
  } finally {
    await releasePress(db, survey.id, claim.pressId, kind, tally.sent + tally.held + tally.suppressed);
  }
  return { ok: true, tally };
}

/**
 * "Remind": the reminder, to the people it was sent to who have not answered
 * and still hold a place. The route has already held the caller to admin,
 * the survey to open and sent, and the presser to a test of the reminder.
 */
export async function pressRemind(db: Firestore, input: PressInput): Promise<PressOutcome> {
  const { survey, presserUid, now } = input;
  if (!siteAddress()) return { ok: false, status: 503, error: REFUSAL.noAddress };
  const plan = await readSendPlan(db, survey);
  if (plan.gone) return { ok: false, status: 409, error: REFUSAL.formGone };
  const owed = plan.unanswered;
  if (owed.length !== input.emails) {
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
  const signer = await signerOf(db, presserUid);
  const words = emailWordsFor(survey, "reminder", signer);
  if (!words) return { ok: false, status: 409, error: REFUSAL.closesPast };

  const caps = await claimCaps(db, survey.id, presserUid);
  if (!caps.ok) return { ok: false, status: 429, error: caps.refusal ?? REFUSAL.inFlight, retryAfterSeconds: caps.retryAfterSeconds };
  const claim = await claimPress(db, survey.id, "remind", now, null);
  if (!claim.ok) return { ok: false, status: 409, error: claim.error };

  const tally = emptyTally();
  try {
    const addresses = await addressesOf(db, owed.map((person) => person.respondent.uid));
    await dispatchSends(owed, async (person) => {
      const address = addresses.get(person.respondent.uid);
      if (!address) {
        tally.noAddress += 1;
        return;
      }
      let delivery: SurveyDelivery;
      try {
        delivery = await sendOne(survey, words, address, person.token, presserUid);
      } catch (err) {
        console.error("[surveys] reminder failed", survey.id, person.respondent.uid, err);
        tally.failed += 1;
        return;
      }
      tally[delivery] += 1;
      await db
        .collection(SURVEY_PEOPLE_COLLECTION)
        .doc(person.id)
        .update({ remindedAt: FieldValue.serverTimestamp(), reminders: FieldValue.increment(1) });
    });
  } finally {
    await releasePress(db, survey.id, claim.pressId, "remind", tally.sent + tally.held + tally.suppressed);
  }
  return { ok: true, tally };
}
