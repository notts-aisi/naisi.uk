import "server-only";
import { randomBytes } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { ANONYMOUS_FORMS_COLLECTION, isFormOpen, isFormToken, isRecordId, normaliseForm, type AnonymousForm } from "./model";

/**
 * ONE PROGRAMME'S ANONYMOUS FORM: opened, closed and found.
 *
 * The form follows the survey at the programme's end, and that is all the two
 * share. The survey's first send opens it (`openAnonymousForm`), with the
 * survey's closing time, which the first send has just fixed; closing the
 * survey by hand closes it (`closeAnonymousForm`). Nothing here reads a
 * survey: survey code calls these two with what they need, and the form
 * keeps its own copy.
 *
 * ONE LINK PER PROGRAMME. The secret in it is minted once, when the form
 * opens, and is the same for everybody on the programme, so the link says
 * nothing about who opened it. It is never logged.
 */

/** A new secret for the form's link: 32 bytes from the platform's secure source. */
export function mintFormToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the survey at a programme's end hands over when it is first sent. */
export type FormOpening = {
  surveyId: string;
  roundId: string;
  programmeId: string;
  runId: string;
  programmeName: string;
  programmeKind: "fellowship" | "incubator";
  closesAt: Date;
};

/**
 * Open the programme's anonymous form, once. A second call for the same
 * survey changes nothing, so the link never changes once it has been shown.
 */
export async function openAnonymousForm(db: Firestore, opening: FormOpening, now: Date): Promise<void> {
  if (!isRecordId(opening.surveyId)) return;
  const ref = db.collection(ANONYMOUS_FORMS_COLLECTION).doc(opening.surveyId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) return;
    tx.set(ref, {
      roundId: opening.roundId,
      programmeId: opening.programmeId,
      runId: opening.runId,
      programmeName: opening.programmeName,
      programmeKind: opening.programmeKind,
      token: mintFormToken(),
      opensAt: now,
      closesAt: opening.closesAt,
      closedAt: null,
    });
  });
}

/** Close the form that follows this survey, if there is one and it is still open. Nothing else. */
export async function closeAnonymousForm(db: Firestore, surveyId: string): Promise<void> {
  if (!isRecordId(surveyId)) return;
  const ref = db.collection(ANONYMOUS_FORMS_COLLECTION).doc(surveyId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    if (data.closedAt) return;
    tx.update(ref, { closedAt: FieldValue.serverTimestamp() });
  });
}

/**
 * The form a link opens: one equality on the secret. A malformed secret
 * reads nothing, and so does a secret two forms somehow share.
 */
export async function formByToken(db: Firestore, token: unknown): Promise<AnonymousForm | null> {
  if (!isFormToken(token)) return null;
  const found = await db.collection(ANONYMOUS_FORMS_COLLECTION).where("token", "==", token).get();
  if (found.docs.length !== 1) return null;
  const doc = found.docs[0];
  return normaliseForm(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
}

/** The form that follows this survey, if it has one. */
export async function formOfSurvey(db: Firestore, surveyId: string): Promise<AnonymousForm | null> {
  if (!isRecordId(surveyId)) return null;
  const snap = await db.collection(ANONYMOUS_FORMS_COLLECTION).doc(surveyId).get();
  return snap.exists ? normaliseForm(snap.id, (snap.data() ?? {}) as Record<string, unknown>) : null;
}

/** The programme's form, for its readers: one equality on the form it was on, filtered in memory. */
export async function formOfProgramme(db: Firestore, roundId: string, programmeId: string): Promise<AnonymousForm | null> {
  const found = await db.collection(ANONYMOUS_FORMS_COLLECTION).where("roundId", "==", roundId).get();
  const forms = found.docs
    .map((doc) => normaliseForm(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter((form): form is AnonymousForm => form !== null && form.programmeId === programmeId);
  return forms[0] ?? null;
}

/** The form's address on this site: the same for everybody on the programme. */
export function formPath(form: Pick<AnonymousForm, "token">): string {
  return `/feedback/${form.token}`;
}

/**
 * Where the end of a survey links: the anonymous form that follows it, while
 * that form takes answers, or null (every other survey, and a closed form).
 */
export async function anonymousFormLinkFor(db: Firestore, surveyId: string, now: Date): Promise<string | null> {
  const form = await formOfSurvey(db, surveyId);
  return form && isFormOpen(form, now) ? formPath(form) : null;
}
