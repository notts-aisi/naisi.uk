import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  SURVEY_ANSWERS_COLLECTION,
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  asksQuotes,
  eventPersonId,
  normalizeEventAnswer,
  normalizeEventPerson,
  normalizeSurvey,
  type EventRespondent,
  type EventSurveyAnswerDoc,
  type EventSurveyDoc,
  type EventSurveyPersonDoc,
  type SurveyAnswerVia,
} from "@/lib/firestore/surveys";
import { readSurveyAnswers, storedSurveyAnswers } from "../items";
import { isOpen } from "../repo";
import { mintSurveyToken } from "../token";
import { REFUSAL } from "../words";
import { EVENT_REFUSAL } from "./words";

/**
 * WHO A SURVEY AFTER AN EVENT WAS SENT TO, AND WHAT THEY ANSWERED: its rows
 * in `surveyPeople` and `surveyAnswers`, read and written here alone, for a
 * person who may be a guest (`{ kind: "guest", signupId }`).
 *
 * A row is made for each person before their email goes, with the secret
 * their link carries, as for every survey; and, for somebody who answers
 * signed in with the QR code before any email, as they answer, so the email
 * skips them. One row per person per survey, by its fixed id
 * (`eventPersonId`), so nobody answers twice.
 *
 * WHAT AN ANSWER KEEPS: the survey, the event, the person (null once names
 * come off), the answers, when "Send my answers" was pressed and how (their
 * own link, or signed in). Nothing before that press, no record of the
 * survey being opened, and never an IP address.
 */

type Raw = Record<string, unknown>;

/** The people a survey after an event was sent to or answered by, as stored. */
export async function eventPeopleOf(db: Firestore, surveyId: string): Promise<EventSurveyPersonDoc[]> {
  const snap = await db.collection(SURVEY_PEOPLE_COLLECTION).where("surveyId", "==", surveyId).get();
  const out: EventSurveyPersonDoc[] = [];
  for (const doc of snap.docs) {
    const person = normalizeEventPerson(doc.id, (doc.data() ?? {}) as Raw);
    if (person && person.surveyId === surveyId) out.push(person);
  }
  return out;
}

/** A survey after an event's answers, each read against its questions. */
export async function eventAnswersOf(db: Firestore, survey: Pick<EventSurveyDoc, "id" | "items">): Promise<EventSurveyAnswerDoc[]> {
  const snap = await db.collection(SURVEY_ANSWERS_COLLECTION).where("surveyId", "==", survey.id).get();
  const read = (raw: unknown) => storedSurveyAnswers(survey.items, raw);
  return snap.docs
    .map((doc) => normalizeEventAnswer(doc.id, (doc.data() ?? {}) as Raw, read))
    .filter((answer) => answer.surveyId === survey.id)
    .sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

/** One person's row, or null. */
export async function readEventPerson(db: Firestore, surveyId: string, respondent: EventRespondent): Promise<EventSurveyPersonDoc | null> {
  const snap = await db.collection(SURVEY_PEOPLE_COLLECTION).doc(eventPersonId(surveyId, respondent)).get();
  if (!snap.exists) return null;
  const person = normalizeEventPerson(snap.id, (snap.data() ?? {}) as Raw);
  return person && person.surveyId === surveyId ? person : null;
}

/**
 * ONE PERSON'S ROW AND ANSWERS ON A SURVEY AFTER AN EVENT, an account or a
 * guest, for the one admins' page that opens them
 * (`src/lib/surveys/onePerson.ts`), which records the opening before it calls
 * this. Their row by its fixed id; their answers by one equality on
 * `respondent.uid`, or on `respondent.signupId` for a guest, then the survey
 * in memory. An answer whose name has come off is nobody's and is never found.
 */
export async function eventPersonOn(
  db: Firestore,
  survey: Pick<EventSurveyDoc, "id" | "items">,
  respondent: EventRespondent,
): Promise<{ row: EventSurveyPersonDoc | null; answer: EventSurveyAnswerDoc | null }> {
  const answersSnap =
    respondent.kind === "account"
      ? await db.collection(SURVEY_ANSWERS_COLLECTION).where("respondent.uid", "==", respondent.uid).get()
      : await db.collection(SURVEY_ANSWERS_COLLECTION).where("respondent.signupId", "==", respondent.signupId).get();
  const read = (raw: unknown) => storedSurveyAnswers(survey.items, raw);
  const same = (other: EventRespondent | null) =>
    other !== null &&
    (respondent.kind === "account"
      ? other.kind === "account" && other.uid === respondent.uid
      : other.kind === "guest" && other.signupId === respondent.signupId);
  const answers = answersSnap.docs
    .map((doc) => normalizeEventAnswer(doc.id, (doc.data() ?? {}) as Raw, read))
    .filter((answer) => answer.surveyId === survey.id && same(answer.respondent))
    .sort((a, b) => (a.sentAt?.getTime() ?? Infinity) - (b.sentAt?.getTime() ?? Infinity) || a.id.localeCompare(b.id));
  return { row: await readEventPerson(db, survey.id, respondent), answer: answers[0] ?? null };
}

/** A person an email is about to go to: their row's fixed id and the secret their link carries. */
export type EventRow = { id: string; token: string };

/**
 * Each person's row, with the secret their link carries, written before any
 * email: kept where it is (a send that failed earlier is owed again, with the
 * same link), made where there is none.
 */
export async function writeEventRows(
  db: Firestore,
  survey: Pick<EventSurveyDoc, "id" | "audience">,
  people: readonly { respondent: EventRespondent }[],
  existing: readonly EventSurveyPersonDoc[],
  pressId: string,
): Promise<EventRow[]> {
  const byId = new Map(existing.map((row) => [row.id, row]));
  const rows: EventRow[] = [];
  const batch = db.batch();
  for (const person of people) {
    const id = eventPersonId(survey.id, person.respondent);
    const ref = db.collection(SURVEY_PEOPLE_COLLECTION).doc(id);
    const was = byId.get(id);
    if (was) {
      batch.update(ref, { pressId });
      rows.push({ id, token: was.token });
    } else {
      const token = mintSurveyToken();
      batch.set(ref, {
        surveyId: survey.id,
        eventId: survey.audience.eventId,
        respondent: { ...person.respondent },
        token,
        pressId,
        sentAt: null,
        delivery: null,
        remindedAt: null,
        reminders: 0,
        answered: false,
      });
      rows.push({ id, token });
    }
  }
  if (rows.length > 0) await batch.commit();
  return rows;
}

/** What became of one person's email. */
export async function stampEventDelivery(db: Firestore, rowId: string, delivery: "sent" | "held" | "suppressed"): Promise<void> {
  await db.collection(SURVEY_PEOPLE_COLLECTION).doc(rowId).update({ sentAt: FieldValue.serverTimestamp(), delivery });
}

/** One person reminded. */
export async function stampEventReminder(db: Firestore, rowId: string): Promise<void> {
  await db
    .collection(SURVEY_PEOPLE_COLLECTION)
    .doc(rowId)
    .update({ remindedAt: FieldValue.serverTimestamp(), reminders: FieldValue.increment(1) });
}

export type EventAnswerOutcome = { ok: true } | { ok: false; status: number; error: string };

/**
 * "SEND MY ANSWERS" ON A SURVEY AFTER AN EVENT: the one writer of its
 * answers. Kept once, in a transaction on the person's own row, refused when
 * the survey has closed (read again inside it, so an answer sent as it closes
 * is held to the moment it was sent) and refused a second time.
 *
 * `token` is the secret of the link it came by, which must still be the
 * row's; signed in there is none, and the row is made here when the person
 * has none yet (they answered with the QR code before any email). Whether a
 * signed-in person may answer at all (they signed up or came) is the caller's
 * to decide first.
 */
export async function recordEventAnswer(
  db: Firestore,
  input: {
    survey: EventSurveyDoc;
    respondent: EventRespondent;
    token: string | null;
    raw: unknown;
    via: SurveyAnswerVia;
    now: Date;
  },
): Promise<EventAnswerOutcome> {
  const { survey, respondent, via, now } = input;
  if (!survey.firstSentAt) return { ok: false, status: 409, error: EVENT_REFUSAL.notOpen };
  if (!isOpen(survey, now)) return { ok: false, status: 409, error: REFUSAL.closed };
  // A tick under a long answer is kept with it, as the form drew the box (`asksQuotes`).
  const read = readSurveyAnswers(survey.items, input.raw, { quotes: asksQuotes(survey) });
  if (read.problems.length > 0) return { ok: false, status: 400, error: read.problems[0].message };

  const personRef = db.collection(SURVEY_PEOPLE_COLLECTION).doc(eventPersonId(survey.id, respondent));
  const surveyRef = db.collection(SURVEYS_COLLECTION).doc(survey.id);
  const answerRef = db.collection(SURVEY_ANSWERS_COLLECTION).doc();
  return db.runTransaction(async (tx): Promise<EventAnswerOutcome> => {
    const [personSnap, surveySnap] = await tx.getAll(personRef, surveyRef);
    const fresh = personSnap.exists ? normalizeEventPerson(personSnap.id, (personSnap.data() ?? {}) as Raw) : null;
    if (input.token !== null && (!fresh || fresh.token !== input.token)) return { ok: false, status: 404, error: REFUSAL.noLink };
    if (fresh?.answered) return { ok: false, status: 409, error: REFUSAL.answered };
    if (!surveySnap.exists || !isOpen(normalizeSurvey(surveySnap.id, (surveySnap.data() ?? {}) as Raw), now)) {
      return { ok: false, status: 409, error: REFUSAL.closed };
    }
    tx.set(answerRef, {
      surveyId: survey.id,
      eventId: survey.audience.eventId,
      respondent: { ...respondent },
      answers: read.answers,
      sentAt: FieldValue.serverTimestamp(),
      via,
    });
    if (fresh) {
      tx.update(personRef, { answered: true });
    } else {
      tx.set(personRef, {
        surveyId: survey.id,
        eventId: survey.audience.eventId,
        respondent: { ...respondent },
        token: mintSurveyToken(),
        pressId: "",
        sentAt: null,
        delivery: null,
        remindedAt: null,
        reminders: 0,
        answered: true,
      });
    }
    return { ok: true };
  });
}
