import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  SURVEY_ANSWERS_COLLECTION,
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  normalizeSurvey,
  normalizeSurveyPerson,
  type SurveyAnswerVia,
  type SurveyDoc,
  type SurveyPersonDoc,
} from "@/lib/firestore/surveys";
import { readSurveyAnswers, readSurveyConsents } from "./items";
import { groupHasMet, toldGroupOf } from "./personFacts";
import { isOpen } from "./repo";
import { REFUSAL } from "./words";

/**
 * "SEND MY ANSWERS": one person's answers, kept once.
 *
 * Nothing is kept before this: no draft, no record of the survey being opened,
 * nothing about how long somebody spent. What is kept is the answers, the
 * survey, the person, the day and time they were sent, whether by their
 * personal link or signed in, and whether their group had met for the first
 * time by then.
 *
 * ONE ANSWER PER PERSON, in a transaction on their own row: the row says
 * whether they have answered, and the answer is written beside the stamp, so
 * two presses at once keep one and refuse the other. The survey is read again
 * inside it, so an answer sent as the survey closes is held to the moment it
 * was sent.
 *
 * WHAT A CONSENT BLOCK'S BOXES SAY goes on the person's row, never into the
 * answers: a yes or a no for each box the survey asks (a box left unticked is
 * a no), with when it was said. The row is where the person can change it
 * later, and where a follow-up survey reads who said yes; an answer can never
 * change once sent.
 */

export type AnswerOutcome = { ok: true } | { ok: false; status: number; error: string };

export async function recordAnswer(
  db: Firestore,
  input: { survey: SurveyDoc; person: SurveyPersonDoc; raw: unknown; consents?: unknown; via: SurveyAnswerVia; now: Date },
): Promise<AnswerOutcome> {
  const { survey, person, via, now } = input;
  if (person.answered) return { ok: false, status: 409, error: REFUSAL.answered };
  if (!isOpen(survey, now)) return { ok: false, status: 409, error: REFUSAL.closed };

  const read = readSurveyAnswers(survey.items, input.raw);
  if (read.problems.length > 0) return { ok: false, status: 400, error: read.problems[0].message };
  const said = readSurveyConsents(survey.items, input.consents);
  if (said.problem) return { ok: false, status: 400, error: said.problem };
  const consented = Object.keys(said.consents).length > 0;

  // Whether their group had met: worked out now, kept with the answers.
  const afterFirstSession = groupHasMet(await toldGroupOf(db, survey.runId, person.respondent.uid), now);

  const personRef = db.collection(SURVEY_PEOPLE_COLLECTION).doc(person.id);
  const surveyRef = db.collection(SURVEYS_COLLECTION).doc(survey.id);
  const answerRef = db.collection(SURVEY_ANSWERS_COLLECTION).doc();
  return db.runTransaction(async (tx): Promise<AnswerOutcome> => {
    const [personSnap, surveySnap] = await tx.getAll(personRef, surveyRef);
    const fresh = personSnap.exists ? normalizeSurveyPerson(personSnap.id, personSnap.data() ?? {}) : null;
    if (!fresh || fresh.token !== person.token) return { ok: false, status: 404, error: REFUSAL.noLink };
    if (fresh.answered) return { ok: false, status: 409, error: REFUSAL.answered };
    if (!surveySnap.exists) return { ok: false, status: 404, error: REFUSAL.noLink };
    if (!isOpen(normalizeSurvey(surveySnap.id, surveySnap.data() ?? {}), now)) {
      return { ok: false, status: 409, error: REFUSAL.closed };
    }
    tx.set(answerRef, {
      surveyId: survey.id,
      roundId: survey.audience.roundId,
      respondent: { kind: fresh.respondent.kind, uid: fresh.respondent.uid },
      answers: read.answers,
      sentAt: FieldValue.serverTimestamp(),
      via,
      afterFirstSession,
    });
    tx.update(
      personRef,
      consented ? { answered: true, consents: said.consents, consentsAt: FieldValue.serverTimestamp() } : { answered: true },
    );
    return { ok: true };
  });
}
