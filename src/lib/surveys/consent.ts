import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  SURVEY_PEOPLE_COLLECTION,
  normalizeSurveyPerson,
  surveyPersonId,
  type SurveyDoc,
  type SurveyPersonDoc,
} from "@/lib/firestore/surveys";
import { CONSENT_PURPOSES, consentPurposesOf, type SurveyConsentPurpose } from "./items";
import { REFUSAL } from "./words";

/**
 * CHANGING A CONSENT LATER, by the person and nobody else.
 *
 * A consent box (the before survey's "Contact me at 6 and 12 months") is
 * answered with the survey, and kept on the person's row there. The person
 * can change it afterwards from their own survey's page, through their link
 * or signed in, while that row is there (until names come off):
 *
 *  - on the survey that asks it, the row is that survey's own;
 *  - on a follow-up, the row is on the before survey it came from
 *    (`audience.consentFrom`), so "Stop the follow-ups" on the six-month one
 *    stops the one a year on.
 *
 * The change is the person's own row, in a transaction, with when it was
 * said. A follow-up's audience reads it at every press, so the next send and
 * every reminder follow it. Nobody is emailed.
 */

/** The survey whose rows hold a purpose's consent, for a person answering `survey`, or null. */
export function consentSurveyIdFor(survey: Pick<SurveyDoc, "id" | "items" | "audience">, purpose: SurveyConsentPurpose): string | null {
  if (consentPurposesOf(survey.items).includes(purpose)) return survey.id;
  if (purpose === "followUps" && survey.audience.kind === "followUps") return survey.audience.consentFrom;
  return null;
}

export function isConsentPurpose(value: unknown): value is SurveyConsentPurpose {
  return typeof value === "string" && (CONSENT_PURPOSES as readonly string[]).includes(value);
}

export type ConsentOutcome = { ok: true; given: boolean } | { ok: false; status: number; error: string };

/**
 * Set one purpose's consent on the person's own row, as reached from
 * `survey`, which their link or their session opened.
 */
export async function changeConsent(
  db: Firestore,
  input: { survey: SurveyDoc; person: SurveyPersonDoc; purpose: SurveyConsentPurpose; given: boolean },
): Promise<ConsentOutcome> {
  const { survey, person, purpose, given } = input;
  const holder = consentSurveyIdFor(survey, purpose);
  if (!holder) return { ok: false, status: 409, error: REFUSAL.consentNotAsked };
  const ref = db.collection(SURVEY_PEOPLE_COLLECTION).doc(surveyPersonId(holder, person.respondent));
  return db.runTransaction(async (tx): Promise<ConsentOutcome> => {
    const snap = await tx.get(ref);
    const row = snap.exists ? normalizeSurveyPerson(snap.id, snap.data() ?? {}) : null;
    if (!row || row.surveyId !== holder || row.respondent.uid !== person.respondent.uid) {
      return { ok: false, status: 404, error: REFUSAL.consentNoRow };
    }
    tx.update(ref, { [`consents.${purpose}`]: given, consentsAt: FieldValue.serverTimestamp() });
    return { ok: true, given };
  });
}
