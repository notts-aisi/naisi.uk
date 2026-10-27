import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { liveGroupsOf, runEndOf } from "@/lib/courses/finishing/runEnd";
import { normalizeCourseGroup } from "@/lib/firestore/courseGroups";
import { normalizeCourseRun } from "@/lib/firestore/courses";
import {
  SURVEY_ANSWERS_COLLECTION,
  SURVEY_PEOPLE_COLLECTION,
  SURVEYS_COLLECTION,
  type SurveyDoc,
} from "@/lib/firestore/surveys";

/**
 * NAMES COME OFF. A confidential survey keeps who answered, so the before, the
 * end and the follow-ups can be compared person by person, and only for as
 * long as the person was told: until two years after the programme's last
 * session (Zach, 26 Oct 2026: "2 years for everyone"), or at once when their
 * account is deleted. Every stage of a programme comes off on the same day.
 * Taking a name off:
 *
 *  - sets `respondent` to null on each of the person's answers, which stay,
 *    so the totals stay;
 *  - deletes the person's rows (`surveyPeople`): who it was sent to, their
 *    personal link, whether they answered.
 *
 * Whatever kind of person the record holds (an account today), the whole
 * `respondent` map goes, so a later kind is taken off by the same write.
 *
 * Nobody is emailed by any of it.
 */

/** Firestore takes at most 500 writes in one batch; a page stays well under it. */
const PAGE = 200;

/** How long names are kept after a programme's last session, in years. */
export const NAMES_KEPT_YEARS = 2;

/** "2028-12-09" for "2026-12-09": the same day two years on, and 28 February for the 29th. */
export function twoYearsAfter(key: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]) + NAMES_KEPT_YEARS;
  const month = Number(match[2]);
  let day = Number(match[3]);
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (month === 2 && day === 29 && !leap) day = 28;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * The day names come off a programme survey: two years after the run's last
 * session, worked out from each live group's own calendar (`runEndOf`, the
 * answer who finished asks). Null while the run, or its last session, cannot
 * be dated.
 */
export async function namesOffDayFor(db: Firestore, runId: string, now: Date): Promise<string | null> {
  if (!runId || runId.includes("/")) return null;
  const runSnap = await db.collection("courseRuns").doc(runId).get();
  if (!runSnap.exists) return null;
  const run = normalizeCourseRun(runSnap.id, runSnap.data() ?? {});
  const groupsSnap = await db.collection("courseGroups").where("runId", "==", runId).get();
  const groups = liveGroupsOf(
    runId,
    groupsSnap.docs.map((doc) => normalizeCourseGroup(doc.id, doc.data() ?? {})),
  );
  const last = runEndOf(run, groups, now).lastDateKey;
  return last ? twoYearsAfter(last) : null;
}

export type NamesOffDone = { answers: number; people: number };

async function inPages<T>(items: readonly T[], write: (batch: FirebaseFirestore.WriteBatch, item: T) => void, db: Firestore): Promise<void> {
  for (let i = 0; i < items.length; i += PAGE) {
    const batch = db.batch();
    for (const item of items.slice(i, i + PAGE)) write(batch, item);
    await batch.commit();
  }
}

/**
 * Take the names off one survey: every answer's person, and every people row.
 * Then the survey is stamped, so the job does not come back to it. Safe to run
 * twice: a second run finds no names and deletes nothing.
 */
export async function takeNamesOffSurvey(db: Firestore, survey: Pick<SurveyDoc, "id">): Promise<NamesOffDone> {
  const [answers, people] = await Promise.all([
    db.collection(SURVEY_ANSWERS_COLLECTION).where("surveyId", "==", survey.id).get(),
    db.collection(SURVEY_PEOPLE_COLLECTION).where("surveyId", "==", survey.id).get(),
  ]);
  const named = answers.docs.filter((doc) => (doc.data() ?? {}).respondent != null);
  await inPages(named, (batch, doc) => batch.update(doc.ref, { respondent: null }), db);
  await inPages(people.docs, (batch, doc) => batch.delete(doc.ref), db);
  await db.collection(SURVEYS_COLLECTION).doc(survey.id).update({ namesOffAt: FieldValue.serverTimestamp() });
  return { answers: named.length, people: people.docs.length };
}

/**
 * Take one account's name off every survey at once, with the account
 * (`deleteAccountCascade`): their people rows are deleted and their answers
 * stay without them. One equality on `respondent.uid` each.
 */
export async function takeNamesOffForAccount(db: Firestore, uid: string): Promise<NamesOffDone> {
  const [answers, people] = await Promise.all([
    db.collection(SURVEY_ANSWERS_COLLECTION).where("respondent.uid", "==", uid).get(),
    db.collection(SURVEY_PEOPLE_COLLECTION).where("respondent.uid", "==", uid).get(),
  ]);
  await inPages(answers.docs, (batch, doc) => batch.update(doc.ref, { respondent: null }), db);
  await inPages(people.docs, (batch, doc) => batch.delete(doc.ref), db);
  return { answers: answers.docs.length, people: people.docs.length };
}

/** Whether a survey's names are due to come off on `today` ("YYYY-MM-DD", London). */
export function namesDueOff(survey: Pick<SurveyDoc, "namesOffOn" | "namesOffAt">, today: string): boolean {
  return survey.namesOffOn !== null && survey.namesOffAt === null && survey.namesOffOn <= today;
}
