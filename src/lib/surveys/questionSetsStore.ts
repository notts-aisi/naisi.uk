import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import type { ReportQuestionWords } from "@/lib/courses/sessionReports/words";
import {
  QUESTION_SET_KINDS,
  SURVEY_QUESTION_SETS_COLLECTION,
  isQuestionSetKind,
  normalizeQuestionSet,
  type QuestionSetKind,
  type SurveyQuestionSetDoc,
} from "@/lib/firestore/surveyQuestionSets";
import { checkInItems, type CheckInWeek } from "./checkIns/template";
import type { SurveyItem } from "./items";
import { eventSetItems, isCodeEventSet, sessionReportWordsWith, setOfTemplate, withSetWords } from "./questionSets";
import { templateItems, type IncubatorStrand, type SurveyTemplate } from "./templates";

/**
 * THE QUESTION SETS, ON THE ADMIN SDK: reading a set, keeping an admin's
 * change, and the readers every survey takes its questions through when it
 * is made (`./questionSets.ts` holds the rules; `surveyQuestionSets` is
 * server-only in both directions).
 *
 * THE READERS ARE THE ONE WAY A SURVEY IS MADE FROM A TEMPLATE: a programme's
 * survey (`./create.ts`), a check-in as it opens (`./checkIns/open.ts`), a
 * survey after an event, by an admin (`./events/create.ts`) or set up by its
 * event (`./events/setUp.ts`), and the session report's form
 * (`src/lib/courses/sessionReports/page.ts`). Each reads its set once, at
 * that moment, and the survey keeps what it copied:
 * `tests/survey-question-sets.test.mjs` walks the tree for anything else
 * that makes a survey from the code's template, and changes each set under
 * a survey already made to prove it stays.
 *
 * Who may change a set is the route's to decide (admins only); these read
 * and write.
 */

/** One set as stored, or null while it is the code's. */
export async function readQuestionSet(db: Firestore, kind: QuestionSetKind): Promise<SurveyQuestionSetDoc | null> {
  const snap = await db.collection(SURVEY_QUESTION_SETS_COLLECTION).doc(kind).get();
  return snap.exists ? normalizeQuestionSet(kind, snap.data() ?? {}) : null;
}

/** Every stored set, by kind: the collection whole, six documents at most. */
export async function readQuestionSets(db: Firestore): Promise<Map<QuestionSetKind, SurveyQuestionSetDoc>> {
  const snap = await db.collection(SURVEY_QUESTION_SETS_COLLECTION).get();
  const found = new Map(snap.docs.flatMap((doc) => (isQuestionSetKind(doc.id) ? [[doc.id, doc.data() ?? {}] as const] : [])));
  const out = new Map<QuestionSetKind, SurveyQuestionSetDoc>();
  for (const kind of QUESTION_SET_KINDS) {
    const data = found.get(kind);
    if (data) out.set(kind, normalizeQuestionSet(kind, data));
  }
  return out;
}

/** A change a route has checked: a words-only set's changed words, or the survey after an event's questions. */
export type QuestionSetChange = { words: Record<string, string> } | { items: SurveyItem[] };

/**
 * Keep an admin's change to one set, the route having checked it
 * (`checkWordsChange`, `checkWholeChange`). A set that has come back to the
 * code's (no word changed, or the code's questions exactly) is deleted, so
 * the code's own are read again, later changes to them included. Answers
 * what became of it.
 */
export async function saveQuestionSet(db: Firestore, kind: QuestionSetKind, change: QuestionSetChange, byUid: string): Promise<"kept" | "original"> {
  // Each kind keeps one shape: a mismatch is a caller's mistake, never a change to keep.
  if (("items" in change) !== (kind === "event")) throw new Error(`The ${kind} question set keeps ${kind === "event" ? "its questions" : "its words"} alone.`);
  const ref = db.collection(SURVEY_QUESTION_SETS_COLLECTION).doc(kind);
  const original = "items" in change ? isCodeEventSet(change.items) : Object.keys(change.words).length === 0;
  if (original) {
    await ref.delete();
    return "original";
  }
  await ref.set({
    kind,
    ...("words" in change ? { words: change.words } : { items: JSON.parse(JSON.stringify(change.items)) as unknown[] }),
    updatedAt: FieldValue.serverTimestamp(),
    updatedByUid: byUid,
  });
  return "kept";
}

// ---------------------------------------------------------------------------
// The readers a survey is made through
// ---------------------------------------------------------------------------

/**
 * A programme survey's questions as it is made: the stage's template with its
 * set's words over the code's. A follow-up has no set, and asks in the
 * code's words.
 */
export async function programmeTemplateItems(
  db: Firestore,
  stage: SurveyTemplate,
  programmeKind: "fellowship" | "incubator",
  strand: IncubatorStrand | null,
): Promise<SurveyItem[]> {
  const items = templateItems(stage, programmeKind, strand);
  const set = setOfTemplate(stage);
  return set ? withSetWords(set, items, (await readQuestionSet(db, set))?.words) : items;
}

/** The questions every survey after an event starts with now: the stored set, else the code's. */
export async function eventStandardItems(db: Firestore): Promise<SurveyItem[]> {
  return eventSetItems(await readQuestionSet(db, "event"));
}

/** A check-in's questions for its week as it opens, in its set's words. */
export async function checkInSetItems(db: Firestore, week: CheckInWeek): Promise<SurveyItem[]> {
  return withSetWords("check-in", checkInItems(week), (await readQuestionSet(db, "check-in"))?.words);
}

/** The words a session report's form asks in now. */
export async function sessionReportWords(db: Firestore): Promise<ReportQuestionWords> {
  return sessionReportWordsWith((await readQuestionSet(db, "session-report"))?.words);
}
