import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import {
  SURVEY_ANSWERS_COLLECTION,
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  isSurveyToken,
  normalizeSurvey,
  normalizeSurveyAnswer,
  normalizeSurveyPerson,
  surveyPersonId,
  type SurveyAnswerDoc,
  type SurveyDoc,
  type SurveyPersonDoc,
  type SurveyRespondent,
} from "@/lib/firestore/surveys";
import type { SessionUser } from "@/lib/firebase/session";
import { storedSurveyAnswers } from "./items";

/**
 * READING SURVEYS, on the Admin SDK. Every read is one document by its id or
 * one equality on one field, so nothing here needs a declared index, and
 * lists are sorted in memory.
 *
 * WHO MAY ASK is the caller's business: these functions read, and the routes
 * and pages decide first. `canRunSurveys` is the one predicate they ask.
 */

/** Making, sending, reminding, closing and reading a survey's answers: admins only. */
export function canRunSurveys(user: Pick<SessionUser, "role"> | null): boolean {
  return user?.role === "admin";
}

/** A survey id this site could have made: Firestore's automatic ids, and nothing with a separator. */
export function isSurveyId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

export async function readSurvey(db: Firestore, surveyId: string): Promise<SurveyDoc | null> {
  if (!isSurveyId(surveyId)) return null;
  const snap = await db.collection(SURVEYS_COLLECTION).doc(surveyId).get();
  return snap.exists ? normalizeSurvey(snap.id, snap.data() ?? {}) : null;
}

/** Every survey, newest first. A handful a term, so the whole collection is read. */
export async function listSurveys(db: Firestore): Promise<SurveyDoc[]> {
  const snap = await db.collection(SURVEYS_COLLECTION).get();
  return snap.docs
    .map((doc) => normalizeSurvey(doc.id, doc.data() ?? {}))
    .sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

/** The people a survey is for, as stored. */
export async function peopleOf(db: Firestore, surveyId: string): Promise<SurveyPersonDoc[]> {
  const snap = await db.collection(SURVEY_PEOPLE_COLLECTION).where("surveyId", "==", surveyId).get();
  const out: SurveyPersonDoc[] = [];
  for (const doc of snap.docs) {
    const person = normalizeSurveyPerson(doc.id, doc.data() ?? {});
    if (person && person.surveyId === surveyId) out.push(person);
  }
  return out;
}

/** One person's row on a survey, or null. */
export async function readPerson(db: Firestore, surveyId: string, respondent: SurveyRespondent): Promise<SurveyPersonDoc | null> {
  const snap = await db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(surveyId, respondent)).get();
  if (!snap.exists) return null;
  const person = normalizeSurveyPerson(snap.id, snap.data() ?? {});
  return person && person.surveyId === surveyId ? person : null;
}

/** A survey's answers, each read against its questions. */
export async function answersOf(db: Firestore, survey: SurveyDoc): Promise<SurveyAnswerDoc[]> {
  const snap = await db.collection(SURVEY_ANSWERS_COLLECTION).where("surveyId", "==", survey.id).get();
  const read = (raw: unknown) => storedSurveyAnswers(survey.items, raw);
  return snap.docs
    .map((doc) => normalizeSurveyAnswer(doc.id, doc.data() ?? {}, read))
    .filter((answer) => answer.surveyId === survey.id)
    .sort((a, b) => (a.sentAt?.getTime() ?? 0) - (b.sentAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

/**
 * The surveys this one pairs back to, oldest first: for a follow-up a year
 * on, the before survey, the one at the end and the first follow-up, as far
 * as each was made. Three steps at most, and a pair that loops stops it.
 */
export async function chainOf(db: Firestore, survey: Pick<SurveyDoc, "id" | "pairOf">): Promise<SurveyDoc[]> {
  const out: SurveyDoc[] = [];
  const seen = new Set([survey.id]);
  let next = survey.pairOf;
  while (next && !seen.has(next) && out.length < 3) {
    seen.add(next);
    const earlier = await readSurvey(db, next);
    if (!earlier) break;
    out.unshift(earlier);
    next = earlier.pairOf;
  }
  return out;
}

/**
 * One person's own answers to one survey, or null: read for that person
 * alone, to show them what they said (an earlier answer above a later
 * question). One equality on `respondent.uid`.
 */
export async function ownAnswerOf(db: Firestore, survey: SurveyDoc, uid: string): Promise<SurveyAnswerDoc | null> {
  if (!uid || uid.includes("/")) return null;
  const snap = await db.collection(SURVEY_ANSWERS_COLLECTION).where("respondent.uid", "==", uid).get();
  const read = (raw: unknown) => storedSurveyAnswers(survey.items, raw);
  for (const doc of snap.docs) {
    const answer = normalizeSurveyAnswer(doc.id, doc.data() ?? {}, read);
    if (answer.surveyId === survey.id && answer.respondent?.uid === uid) return answer;
  }
  return null;
}

/** What a link's secret opens: a person's own row, a survey's test, or nothing. */
export type LinkTarget =
  | { kind: "person"; person: SurveyPersonDoc; survey: SurveyDoc }
  | { kind: "test"; survey: SurveyDoc }
  | { kind: "none" };

/**
 * WHAT A SECRET OPENS. A secret of the wrong shape is looked up nowhere; one
 * that more than one row claims opens nothing, which no writer here makes.
 * One equality on `token`, then one on `testToken`, each served by the
 * automatic index.
 */
export async function openLink(db: Firestore, token: string): Promise<LinkTarget> {
  if (!isSurveyToken(token)) return { kind: "none" };
  const people = await db.collection(SURVEY_PEOPLE_COLLECTION).where("token", "==", token).get();
  if (people.docs.length === 1) {
    const doc = people.docs[0];
    const person = normalizeSurveyPerson(doc.id, doc.data() ?? {});
    if (person && person.token === token) {
      const survey = await readSurvey(db, person.surveyId);
      if (survey) return { kind: "person", person, survey };
    }
    return { kind: "none" };
  }
  if (people.docs.length > 1) return { kind: "none" };
  const tests = await db.collection(SURVEYS_COLLECTION).where("testToken", "==", token).get();
  if (tests.docs.length !== 1) return { kind: "none" };
  const survey = normalizeSurvey(tests.docs[0].id, tests.docs[0].data() ?? {});
  return survey.testToken === token ? { kind: "test", survey } : { kind: "none" };
}

/**
 * Whether a survey takes answers now: sent, not closed by hand, and before its
 * closing time. A leaving survey is never sent and has no closing time: it
 * takes answers from when an admin opened it (`firstSentAt`) until one closes
 * it by hand. Any other survey with no closing time takes none.
 */
export function isOpen(survey: Pick<SurveyDoc, "kind" | "firstSentAt" | "closedAt" | "closesAt">, now: Date): boolean {
  if (!survey.firstSentAt || survey.closedAt) return false;
  if (survey.kind === "leaving") return true;
  return survey.closesAt !== null && now.getTime() < survey.closesAt.getTime();
}

/** When it closed, or will: the hand's close, else the closing time. */
export function closedOn(survey: Pick<SurveyDoc, "closedAt" | "closesAt">): Date | null {
  return survey.closedAt ?? survey.closesAt;
}

/** A survey's state, as its chip says it. */
export function surveyState(survey: Pick<SurveyDoc, "kind" | "firstSentAt" | "closedAt" | "closesAt">, now: Date): "draft" | "open" | "closed" {
  if (!survey.firstSentAt) return "draft";
  return isOpen(survey, now) ? "open" : "closed";
}
