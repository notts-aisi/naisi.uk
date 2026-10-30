import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import SurveyEmail from "@/emails/SurveyEmail";
import { sendNotice } from "@/lib/email/notice";
import { HOUR_MS, reserveNoticeSlots } from "@/lib/email/noticeCaps";
import {
  SURVEY_ANSWERS_COLLECTION,
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  asksQuotes,
  isEventSurvey,
  isSurveyToken,
  normalizeEventAnswer,
  normalizeEventPerson,
  normalizeSurvey,
  normalizeSurveyAnswer,
  normalizeSurveyPerson,
  type EventRespondent,
  type EventSurveyDoc,
  type EventSurveyPersonDoc,
  type SurveyAnswerVia,
  type SurveyDelivery,
  type SurveyDoc,
  type SurveyPersonDoc,
} from "@/lib/firestore/surveys";
import { blankRefusal } from "./blank";
import { blankItemsOf, blanksOf, outsideBlanks, type SurveyAnswers, type SurveyBlank } from "./blanks";
import { siteAddress, surveyLink } from "./emails";
import { readEventAudience, respondentKey } from "./events/audience";
import { readEventPerson } from "./events/store";
import { EVENT_CONFIDENTIAL_LINE } from "./events/words";
import { readSurveyAnswers, storedSurveyAnswers, withoutLines } from "./items";
import { namesOf } from "./names";
import { whoOf } from "./onePersonLayout";
import { groupHasMet, hiddenLinesFor, toldGroupOf } from "./personFacts";
import { isOpen, readPerson, readSurvey } from "./repo";
import { signerOf } from "./sending";
import { mintSurveyToken } from "./token";
import {
  BLANKS_REFUSAL,
  PROGRAMME_CONFIDENTIAL_LINE,
  REFUSAL,
  SURVEY_FROM_NAME,
  SURVEY_REPLY_TO,
  blanksCountChangedWords,
  blanksEmailWords,
  blanksPressedWords,
} from "./words";

/**
 * SENDING SOMEBODY THE QUESTIONS THEY LEFT BLANK, AND KEEPING WHAT THEY SEND
 * (docs/surveys.md, "Sending the questions left blank").
 *
 *  - THE PRESS (`pressBlanks`): an admin, for one person who sent the survey
 *    with required questions left blank, while it takes answers. A new secret
 *    is minted for this person's link of blanks and written on their row with
 *    the press (who, when, how many questions) BEFORE the email goes; the
 *    first link never reopens the survey. A later press mints a new secret,
 *    and the old link opens nothing. Never in bulk, never on its own.
 *  - THE LINK (`openBlanksLink`): one equality on `blanks.token`, beside
 *    `openLink`, so nothing that asks `openLink` changes.
 *  - THE LATER SEND (`recordBlanks`): only the questions still blank, each
 *    answered, kept once beside the first send as one entry of the answer's
 *    `fills`, in a transaction that spends the link. The first send's
 *    `answers` are never written.
 *
 * THE EMAIL IS A NOTICE (`docs/notifications.md`, surface `survey-blanks`):
 * it reaches the person whatever their notification settings say, as the
 * survey's own email did, with the lane's visible line and its receipt,
 * through the one door that reads the do-not-email list. It carries the
 * survey's name, how many questions and the link: never an answer, never a
 * result.
 *
 * Nothing is kept before "Send my answers", and nothing records the link
 * being opened.
 */

/** Presses of one person's blanks in a day, at most. */
const BLANKS_PER_PERSON_PER_DAY = 3;
/** Emails of blanks one admin sends on one survey in an hour, at most: one press emails one person. */
const BLANKS_PER_HOUR = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

type Raw = Record<string, unknown>;

/** A person's row and survey, of either kind: a programme's, or a survey after an event's, who may be a guest. */
export type BlanksTarget =
  | { kind: "programme"; survey: SurveyDoc; person: SurveyPersonDoc }
  | { kind: "event"; survey: EventSurveyDoc; person: EventSurveyPersonDoc };

/**
 * WHAT A LINK OF BLANKS OPENS: the one row whose link it is, and its survey,
 * or nothing. A secret of the wrong shape is looked up nowhere, and one that
 * more than one row claims opens nothing.
 */
export async function openBlanksLink(db: Firestore, token: string): Promise<BlanksTarget | null> {
  if (!isSurveyToken(token)) return null;
  const snap = await db.collection(SURVEY_PEOPLE_COLLECTION).where("blanks.token", "==", token).get();
  if (snap.docs.length !== 1) return null;
  const doc = snap.docs[0];
  const row = normalizeEventPerson(doc.id, (doc.data() ?? {}) as Raw);
  if (!row || row.blanks?.token !== token) return null;
  const survey = await readSurvey(db, row.surveyId);
  if (!survey) return null;
  if (isEventSurvey(survey)) return { kind: "event", survey, person: row };
  // Any other survey's row holds an account.
  const person = normalizeSurveyPerson(doc.id, (doc.data() ?? {}) as Raw);
  return person && person.surveyId === survey.id ? { kind: "programme", survey, person } : null;
}

/** The person's row on a survey, read signed in by their own uid: a programme's or an event's. */
export async function ownRowFor(db: Firestore, survey: SurveyDoc, uid: string): Promise<BlanksTarget | null> {
  if (isEventSurvey(survey)) {
    const person = await readEventPerson(db, survey.id, { kind: "account", uid });
    return person ? { kind: "event", survey, person } : null;
  }
  const person = await readPerson(db, survey.id, { kind: "account", uid });
  return person ? { kind: "programme", survey, person } : null;
}

/**
 * A person's own answer to a survey, merged, or null: none sent, or their
 * name has come off it. One equality on the person (`respondent.uid`, or
 * `respondent.signupId` for a guest), then the survey in memory; the first
 * sent, should a second ever be stored. Read to work out what is blank, and
 * never handed to anybody: the admins' button shows a count.
 */
async function answerFor(db: Firestore, target: BlanksTarget): Promise<{ id: string; answers: SurveyAnswers } | null> {
  const respondent: EventRespondent = target.person.respondent;
  const id = respondent.kind === "account" ? respondent.uid : respondent.signupId;
  if (!id || id.includes("/")) return null;
  const snap =
    respondent.kind === "account"
      ? await db.collection(SURVEY_ANSWERS_COLLECTION).where("respondent.uid", "==", respondent.uid).get()
      : await db.collection(SURVEY_ANSWERS_COLLECTION).where("respondent.signupId", "==", respondent.signupId).get();
  const read = (raw: unknown) => storedSurveyAnswers(target.survey.items, raw);
  const answers = snap.docs
    .map((doc) =>
      target.kind === "event"
        ? normalizeEventAnswer(doc.id, (doc.data() ?? {}) as Raw, read)
        : normalizeSurveyAnswer(doc.id, (doc.data() ?? {}) as Raw, read),
    )
    .filter((answer) => answer.surveyId === target.survey.id && sameRespondent(respondent, answer.respondent))
    .sort((a, b) => (a.sentAt?.getTime() ?? Infinity) - (b.sentAt?.getTime() ?? Infinity) || a.id.localeCompare(b.id));
  return answers[0] ? { id: answers[0].id, answers: answers[0].answers } : null;
}

/** Whether a stored answer's person is this one. Null, once names have come off, is nobody. */
function sameRespondent(respondent: EventRespondent, other: EventRespondent | null): boolean {
  if (other === null) return false;
  return respondent.kind === "account"
    ? other.kind === "account" && other.uid === respondent.uid
    : other.kind === "guest" && other.signupId === respondent.signupId;
}

/** The lines of a lines question this person is not shown: a programme survey's facilitators line, to a facilitator. */
async function hiddenFor(db: Firestore, target: BlanksTarget): Promise<string[]> {
  return target.kind === "programme" ? hiddenLinesFor(db, target.survey, target.person.respondent.uid) : [];
}

/** What is still blank for one person, with the answer it was worked out from, or null when they have no answer. */
export async function blanksFor(
  db: Firestore,
  target: BlanksTarget,
): Promise<{ answerId: string; blanks: SurveyBlank[]; hidden: string[] } | null> {
  const [answer, hidden] = await Promise.all([answerFor(db, target), hiddenFor(db, target)]);
  if (!answer) return null;
  return { answerId: answer.id, blanks: blanksOf(target.survey.items, answer.answers, { hiddenLines: hidden }), hidden };
}

// ---------------------------------------------------------------------------
// The later send
// ---------------------------------------------------------------------------

export type BlanksOutcome = { ok: true } | { ok: false; status: number; error: string; missing?: string[] };

/**
 * "SEND MY ANSWERS" ON A LINK OF BLANKS: the one writer of a later send.
 * Refused when the link is spent or there is none, when the survey has
 * closed, when an answer is to a question that was not blank, and when a
 * question still blank is left blank again. Kept once, in a transaction that
 * reads the row, the answer and the survey again and spends the link.
 *
 * `token` is the link's secret it came by, which must still be the row's;
 * signed in there is none, and the row's own link is the one spent.
 */
export async function recordBlanks(
  db: Firestore,
  input: { target: BlanksTarget; token: string | null; raw: unknown; via: SurveyAnswerVia; now: Date },
): Promise<BlanksOutcome> {
  const { target, via, now } = input;
  const { survey, person } = target;
  const link = person.blanks;
  if (!link || !person.answered) return { ok: false, status: 409, error: BLANKS_REFUSAL.nothingLeft };
  if (input.token !== null && link.token !== input.token) return { ok: false, status: 404, error: REFUSAL.noLink };
  if (link.spentAt) return { ok: false, status: 409, error: BLANKS_REFUSAL.spent };
  if (!isOpen(survey, now)) return { ok: false, status: 409, error: REFUSAL.closed };
  if (!input.raw || typeof input.raw !== "object" || Array.isArray(input.raw)) return { ok: false, status: 400, error: REFUSAL.body };

  const found = await blanksFor(db, target);
  if (!found || found.blanks.length === 0) return { ok: false, status: 409, error: BLANKS_REFUSAL.nothingLeft };
  const outside = outsideBlanks(input.raw as Raw, found.blanks);
  if (outside) return { ok: false, status: 400, error: outside };
  const shown = blankItemsOf(survey.items, found.blanks);
  const read = readSurveyAnswers(shown, input.raw, { quotes: asksQuotes(survey) });
  if (read.problems.length > 0) return { ok: false, status: 400, error: read.problems[0].message };
  const answers = withoutLines(read.answers, found.hidden);
  // Every question on the link is required: one left blank again is refused, naming it by its number on
  // the link, in the words and the shape both answer routes use (`blankRefusal`).
  const blank = blankRefusal(shown, answers, found.hidden);
  if (blank) return blank;

  // Whether their group had met: worked out now, kept with this send. A survey after an event keeps no group.
  const afterFirstSession =
    target.kind === "programme" ? groupHasMet(await toldGroupOf(db, survey.runId, target.person.respondent.uid), now) : null;

  const personRef = db.collection(SURVEY_PEOPLE_COLLECTION).doc(person.id);
  const answerRef = db.collection(SURVEY_ANSWERS_COLLECTION).doc(found.answerId);
  const surveyRef = db.collection(SURVEYS_COLLECTION).doc(survey.id);
  return db.runTransaction(async (tx): Promise<BlanksOutcome> => {
    const [personSnap, answerSnap, surveySnap] = await tx.getAll(personRef, answerRef, surveyRef);
    const fresh = personSnap.exists ? normalizeEventPerson(personSnap.id, (personSnap.data() ?? {}) as Raw) : null;
    if (!fresh || !fresh.blanks || fresh.blanks.token !== link.token) return { ok: false, status: 404, error: REFUSAL.noLink };
    if (fresh.blanks.spentAt) return { ok: false, status: 409, error: BLANKS_REFUSAL.spent };
    if (!surveySnap.exists || !isOpen(normalizeSurvey(surveySnap.id, (surveySnap.data() ?? {}) as Raw), now)) {
      return { ok: false, status: 409, error: REFUSAL.closed };
    }
    if (!answerSnap.exists) return { ok: false, status: 409, error: BLANKS_REFUSAL.nothingLeft };
    const readStored = (raw: unknown) => storedSurveyAnswers(survey.items, raw);
    const stored = target.kind === "event"
      ? normalizeEventAnswer(answerSnap.id, (answerSnap.data() ?? {}) as Raw, readStored)
      : normalizeSurveyAnswer(answerSnap.id, (answerSnap.data() ?? {}) as Raw, readStored);
    if (stored.surveyId !== survey.id || !sameRespondent(person.respondent, stored.respondent)) return { ok: false, status: 409, error: BLANKS_REFUSAL.nothingLeft };
    // Held to what is blank now, so nothing a send already holds is ever answered again.
    if (outsideBlanks(answers, blanksOf(survey.items, stored.answers, { hiddenLines: found.hidden }))) {
      return { ok: false, status: 409, error: BLANKS_REFUSAL.spent };
    }
    const fill: Raw = { answers, sentAt: now, via };
    if (afterFirstSession !== null) fill.afterFirstSession = afterFirstSession;
    tx.update(answerRef, { fills: FieldValue.arrayUnion(fill) });
    tx.update(personRef, { "blanks.spentAt": FieldValue.serverTimestamp() });
    return { ok: true };
  });
}

// ---------------------------------------------------------------------------
// The press
// ---------------------------------------------------------------------------

export type BlanksPressOutcome =
  /** `pressed` is the line the admins' pages now show beside the person: "Sent Fri 30 Oct, 2:05pm by Zach Levin". */
  | { ok: true; delivery: SurveyDelivery; pressed: string }
  | { ok: false; status: number; error: string; questions?: number; retryAfterSeconds?: number };

/** Where the email goes: an account's own address, or the address a guest gave the event. */
async function addressFor(db: Firestore, target: BlanksTarget): Promise<string | null> {
  if (target.kind === "event") {
    const read = await readEventAudience(db, target.survey.audience.eventId);
    const key = respondentKey(target.person.respondent);
    return read?.people.find((member) => member.key === key)?.address ?? null;
  }
  const uid = target.person.respondent.uid;
  if (!uid || uid.includes("/")) return null;
  const snap = await db.collection("users").doc(uid).get();
  const address = snap.exists ? (snap.data() ?? {}).email : null;
  return typeof address === "string" && address.trim() ? address.trim() : null;
}

/**
 * "SEND THE QUESTIONS THEY LEFT BLANK", for one person. The route has already
 * held the caller to admin (view-as refused first), the body to a whole
 * number and the survey to one that takes answers. `questions` is the number
 * the confirmation named: when it is not the number blank now, nothing is
 * sent and the answer carries the new number.
 */
export async function pressBlanks(
  db: Firestore,
  input: { survey: SurveyDoc; subject: EventRespondent; presserUid: string; questions: number; now: Date },
): Promise<BlanksPressOutcome> {
  const { survey, subject, presserUid, now } = input;
  if (!siteAddress()) return { ok: false, status: 503, error: REFUSAL.noAddress };
  let target: BlanksTarget | null = null;
  if (isEventSurvey(survey)) {
    const person = await readEventPerson(db, survey.id, subject);
    target = person ? { kind: "event", survey, person } : null;
  } else if (subject.kind === "account") {
    const person = await readPerson(db, survey.id, subject);
    target = person ? { kind: "programme", survey, person } : null;
  }
  if (!target) return { ok: false, status: 404, error: BLANKS_REFUSAL.nobody };
  if (!target.person.answered) return { ok: false, status: 409, error: BLANKS_REFUSAL.notAnswered };
  const found = await blanksFor(db, target);
  if (!found) return { ok: false, status: 409, error: BLANKS_REFUSAL.namesOff };
  const count = found.blanks.length;
  if (count === 0) return { ok: false, status: 409, error: BLANKS_REFUSAL.nothingLeft };
  if (count !== input.questions) return { ok: false, status: 409, error: blanksCountChangedWords(count), questions: count };
  const today = target.person.blanksPresses.filter((press) => press.at && now.getTime() - press.at.getTime() < DAY_MS);
  if (today.length >= BLANKS_PER_PERSON_PER_DAY) return { ok: false, status: 429, error: BLANKS_REFUSAL.tooMany };
  const address = await addressFor(db, target);
  if (!address) return { ok: false, status: 409, error: BLANKS_REFUSAL.noAddress };

  const caps = await reserveNoticeSlots(db, {
    hour: { key: `surveyblanks__${survey.id}__${presserUid}`, limit: BLANKS_PER_HOUR, windowMs: HOUR_MS },
    noun: "emails of questions left blank",
  });
  if (!caps.ok) return { ok: false, status: 429, error: caps.refusal ?? BLANKS_REFUSAL.tooMany, retryAfterSeconds: caps.retryAfterSeconds };

  // The row, with the new secret and the press, before the email.
  const token = mintSurveyToken();
  const personRef = db.collection(SURVEY_PEOPLE_COLLECTION).doc(target.person.id);
  const written = await db.runTransaction(async (tx) => {
    const snap = await tx.get(personRef);
    const fresh = snap.exists ? normalizeEventPerson(snap.id, (snap.data() ?? {}) as Raw) : null;
    if (!fresh || !fresh.answered) return false;
    tx.update(personRef, {
      blanks: { token, sentAt: null, delivery: null, spentAt: null },
      blanksPresses: FieldValue.arrayUnion({ at: now, byUid: presserUid, count }),
    });
    return true;
  });
  if (!written) return { ok: false, status: 409, error: BLANKS_REFUSAL.namesOff };

  const signer = await signerOf(db, presserUid);
  const words = blanksEmailWords({
    title: survey.title,
    about: isEventSurvey(survey) ? survey.event.title : survey.programmeName,
    questions: count,
    closesAt: survey.closesAt,
    confidential: isEventSurvey(survey) ? EVENT_CONFIDENTIAL_LINE : PROGRAMME_CONFIDENTIAL_LINE,
    signer,
  });
  const link = surveyLink(token) ?? "";
  let delivery: SurveyDelivery;
  try {
    const result = await sendNotice({
      to: address,
      subject: words.subject,
      surface: "survey-blanks",
      actorUid: presserUid,
      referenceId: survey.id,
      replyTo: SURVEY_REPLY_TO,
      fromName: SURVEY_FROM_NAME,
      render: (marker) => SurveyEmail({ ...words, link, notice: marker }),
    });
    delivery = result.held.length > 0 ? "held" : result.suppressed.length > 0 ? "suppressed" : "sent";
  } catch (err) {
    // An id, never an address or a secret.
    console.error("[surveys] blanks email failed", survey.id, whoOf(target.person.respondent), err);
    return { ok: false, status: 502, error: BLANKS_REFUSAL.failed };
  }
  await personRef.update({ "blanks.sentAt": FieldValue.serverTimestamp(), "blanks.delivery": delivery });
  const by = (await namesOf(db, [presserUid])).get(presserUid) ?? "";
  return { ok: true, delivery, pressed: blanksPressedWords({ at: now, by, delivery }) };
}
