import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  SURVEY_PEOPLE_COLLECTION,
  isProgrammeAudience,
  normalizeSurveyPerson,
  programmeOf,
  surveyPersonId,
  type SurveyDoc,
  type SurveyPersonDoc,
  type SurveyRespondent,
} from "@/lib/firestore/surveys";
import { CONSENT_PURPOSES, consentPurposesOf, type SurveyConsentPurpose } from "./items";
import { listSurveys, readPerson } from "./repo";
import { REFUSAL } from "./words";

/**
 * CHANGING A CONSENT LATER, by the person and nobody else.
 *
 * A consent box (the before survey's "Contact me at 6 and 12 months") is
 * answered with the survey, and kept on the person's row there. The person
 * can change it afterwards from their own survey's page, through their link
 * or signed in, while that row is there (until names come off).
 *
 * ONE ROW HOLDS EACH PERSON'S WORD about follow-ups (`followUpsHolderFor`):
 *
 *  - their row on the programme's before survey, once it says yes or no;
 *  - otherwise their row on the survey at the end, which asks the same box of
 *    people the before survey never asked (they missed it, or joined after
 *    it), once that says yes or no;
 *  - otherwise whichever of the two rows they have, where their word would go.
 *
 * So "Stop the follow-ups" on any of the programme's surveys changes the one
 * row that decides, and the follow-ups' audience reads the same two rows. The
 * change is the person's own row, in a transaction, with when it was said.
 * Nobody is emailed.
 */

/** The survey whose rows hold a purpose's consent, for a person answering `survey`, or null when it asks none. */
export function consentSurveyIdFor(survey: Pick<SurveyDoc, "id" | "items" | "audience">, purpose: SurveyConsentPurpose): string | null {
  if (consentPurposesOf(survey.items).includes(purpose)) return survey.id;
  if (purpose === "followUps" && survey.audience.kind === "followUps") return survey.audience.consentFrom;
  return null;
}

export function isConsentPurpose(value: unknown): value is SurveyConsentPurpose {
  return typeof value === "string" && (CONSENT_PURPOSES as readonly string[]).includes(value);
}

/** The programme's before survey and its survey at the end, as far as each was made, for any of its surveys. */
async function stagesOf(db: Firestore, survey: SurveyDoc): Promise<{ before: string | null; after: string | null }> {
  const { roundId, programmeId } = programmeOf(survey.audience);
  const same = (each: SurveyDoc) => isProgrammeAudience(each.audience, roundId, programmeId);
  const oldest = (kind: SurveyDoc["kind"], all: readonly SurveyDoc[]) =>
    all
      .filter((each) => each.kind === kind && same(each))
      .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) || a.id.localeCompare(b.id))[0]?.id ?? null;
  if (survey.kind === "before") return { before: survey.id, after: oldest("after", await listSurveys(db)) };
  const all = await listSurveys(db);
  const before = survey.audience.kind === "followUps" ? survey.audience.consentFrom : oldest("before", all);
  return { before, after: survey.kind === "after" ? survey.id : oldest("after", all) };
}

/** Whether a row has said yes or no to follow-ups. */
const saysFollowUps = (row: SurveyPersonDoc | null): row is SurveyPersonDoc => row !== null && row.consents.followUps !== undefined;

/**
 * The survey whose row holds this person's word about follow-ups, as reached
 * from any survey of the programme, and that row; null when they have no row
 * on either.
 */
export async function followUpsHolderFor(
  db: Firestore,
  survey: SurveyDoc,
  respondent: SurveyRespondent,
): Promise<{ surveyId: string; row: SurveyPersonDoc } | null> {
  const { before, after } = await stagesOf(db, survey);
  const beforeRow = before ? await readPerson(db, before, respondent) : null;
  if (before && saysFollowUps(beforeRow)) return { surveyId: before, row: beforeRow };
  const afterRow = after ? await readPerson(db, after, respondent) : null;
  if (after && saysFollowUps(afterRow)) return { surveyId: after, row: afterRow };
  if (before && beforeRow) return { surveyId: before, row: beforeRow };
  if (after && afterRow) return { surveyId: after, row: afterRow };
  return null;
}

/**
 * The consent boxes this person is asked on this survey's form: the before
 * survey's own, and the survey at the end's only when their before survey has
 * not had their word on it. A test link is asked everything the survey holds.
 */
export async function consentsAskedOf(db: Firestore, survey: SurveyDoc, respondent: SurveyRespondent | null): Promise<SurveyConsentPurpose[]> {
  const purposes = consentPurposesOf(survey.items);
  if (!respondent || survey.kind !== "after" || !purposes.includes("followUps")) return purposes;
  const { before } = await stagesOf(db, survey);
  const beforeRow = before ? await readPerson(db, before, respondent) : null;
  return saysFollowUps(beforeRow) ? purposes.filter((purpose) => purpose !== "followUps") : purposes;
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
  if (!consentSurveyIdFor(survey, purpose)) return { ok: false, status: 409, error: REFUSAL.consentNotAsked };
  // The row that holds the person's word, wherever on the programme's surveys it is.
  const holder = (await followUpsHolderFor(db, survey, person.respondent))?.surveyId ?? consentSurveyIdFor(survey, purpose)!;
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
