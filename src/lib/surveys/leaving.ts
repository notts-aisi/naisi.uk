import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  normalizeSurvey,
  normalizeSurveyPerson,
  surveyPersonId,
  type SurveyDoc,
} from "@/lib/firestore/surveys";
import { surveyLink } from "./emails";
import { surveyQuestionsOf } from "./items";
import { namesOffDayFor } from "./namesOff";
import { isOpen, readSurvey } from "./repo";
import { mintSurveyToken } from "./token";
import { REFUSAL, leavingEmailWords } from "./words";

/**
 * THE LEAVING SURVEY (Q46): confidential, like every survey on the site, one
 * per programme, made by an admin from its own template, and never sent.
 *
 *  - OPENED, NOT SENT. An admin opens it (`openLeavingSurvey`), which fixes
 *    its questions and words and the day names come off, as a first send
 *    does (`firstSentAt`). Nobody is emailed by the press.
 *  - IT NEVER CLOSES on a day: it takes answers until an admin closes it by
 *    hand (`isOpen`).
 *  - IT REACHES EACH PERSON AS THEY LEAVE the programme by their own hand,
 *    through their own link, made when they leave: on the page that says
 *    they left, and in the email that says so. Nothing reaches somebody who
 *    did not leave.
 *  - ONE ANSWER PER PERSON PER PROGRAMME: the person's row is the one row of
 *    that survey for them, and a second leave makes no second row.
 */

export type Refused = { ok: false; status: number; error: string };

/**
 * Open a leaving survey: from now on it reaches whoever leaves its programme.
 * Claimed once, in a transaction, so two presses open it once. The caller has
 * held the presser to admin.
 */
export async function openLeavingSurvey(db: Firestore, surveyId: string, now: Date): Promise<{ ok: true } | Refused> {
  const survey = await readSurvey(db, surveyId);
  if (!survey) return { ok: false, status: 404, error: REFUSAL.noSurvey };
  if (survey.kind !== "leaving") return { ok: false, status: 409, error: REFUSAL.notLeaving };
  if (survey.firstSentAt) return { ok: false, status: 409, error: REFUSAL.alreadyOpen };
  if (survey.closedAt) return { ok: false, status: 409, error: REFUSAL.closed };
  // The day names come off is promised on the survey's page, and fixed now.
  const namesOffOn = await namesOffDayFor(db, survey.runId, now);
  if (!namesOffOn) return { ok: false, status: 409, error: REFUSAL.noNamesOff };
  const ref = db.collection(SURVEYS_COLLECTION).doc(survey.id);
  return db.runTransaction(async (tx): Promise<{ ok: true } | Refused> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, status: 404, error: REFUSAL.noSurvey };
    const fresh = normalizeSurvey(snap.id, snap.data() ?? {});
    if (fresh.kind !== "leaving") return { ok: false, status: 409, error: REFUSAL.notLeaving };
    if (fresh.firstSentAt) return { ok: false, status: 409, error: REFUSAL.alreadyOpen };
    if (fresh.closedAt) return { ok: false, status: 409, error: REFUSAL.closed };
    tx.update(ref, { firstSentAt: FieldValue.serverTimestamp(), namesOffOn, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true };
  });
}

/** The programme's open leaving survey, or null: one equality on the form's surveys, the rest in memory. */
export async function leavingSurveyOf(db: Firestore, roundId: string, programmeId: string, now: Date): Promise<SurveyDoc | null> {
  if (!roundId || roundId.includes("/")) return null;
  const snap = await db.collection(SURVEYS_COLLECTION).where("roundId", "==", roundId).get();
  for (const doc of snap.docs) {
    const survey = normalizeSurvey(doc.id, doc.data() ?? {});
    if (survey.kind !== "leaving" || survey.audience.kind !== "leaving") continue;
    if (survey.audience.roundId !== roundId || survey.audience.programmeId !== programmeId) continue;
    if (isOpen(survey, now)) return survey;
  }
  return null;
}

/**
 * What reaching a leaver made: their own link, whole, for the leaving email
 * (null when the site does not know its own address), the email's line
 * around it, and whether they had answered it already (somebody who left,
 * was put back and left again keeps their one answer, and is not asked twice).
 */
export type Reached = {
  surveyId: string;
  link: string | null;
  answered: boolean;
  email: { before: string; text: string; after: string };
};

/**
 * REACH SOMEBODY WHO HAS JUST LEFT the programme by their own hand: when the
 * programme has an open leaving survey, their own row on it, with the secret
 * in their own link, made now, and counted once (`reached`). Their row is
 * the one row of that survey for them, so somebody who leaves twice is
 * reached once and answers once: a second leave keeps their row, its secret
 * and whether they answered, and counts nothing again.
 *
 * Called by `leaveRun` after the leave has committed, and only by it: nobody
 * presses send, and nothing reaches anybody who did not leave. Null when the
 * programme has no open leaving survey.
 */
export async function reachLeaver(
  db: Firestore,
  input: { roundId: string; programmeId: string; uid: string; now: Date },
): Promise<Reached | null> {
  const { uid, now } = input;
  if (!uid || uid.includes("/")) return null;
  const survey = await leavingSurveyOf(db, input.roundId, input.programmeId, now);
  if (!survey) return null;
  const respondent = { kind: "account" as const, uid };
  const rowRef = db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(survey.id, respondent));
  const surveyRef = db.collection(SURVEYS_COLLECTION).doc(survey.id);
  const made = await db.runTransaction(async (tx): Promise<{ token: string; answered: boolean } | null> => {
    const [rowSnap, surveySnap] = await tx.getAll(rowRef, surveyRef);
    // Closed by hand since it was read: it reaches nobody now.
    if (!surveySnap.exists || !isOpen(normalizeSurvey(surveySnap.id, surveySnap.data() ?? {}), now)) return null;
    const existing = rowSnap.exists ? normalizeSurveyPerson(rowSnap.id, rowSnap.data() ?? {}) : null;
    if (existing && existing.respondent.uid === uid) return { token: existing.token, answered: existing.answered };
    const minted = mintSurveyToken();
    tx.set(rowRef, {
      surveyId: survey.id,
      roundId: survey.audience.roundId,
      respondent,
      token: minted,
      pressId: "",
      sentAt: FieldValue.serverTimestamp(),
      delivery: null,
      remindedAt: null,
      reminders: 0,
      answered: false,
    });
    tx.update(surveyRef, { reached: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    return { token: minted, answered: false };
  });
  if (!made) return null;
  return {
    surveyId: survey.id,
    link: surveyLink(made.token),
    answered: made.answered,
    email: leavingEmailWords(surveyQuestionsOf(survey.items).length, survey.minutes),
  };
}
