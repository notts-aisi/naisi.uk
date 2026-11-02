import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";

/**
 * `recordOpenings/{autoId}`: ONE ROW EACH TIME AN ADMIN OPENS ONE PERSON'S
 * CONFIDENTIAL RECORD. Two kinds of record today, each with its own writer
 * here and the same order:
 *
 *  - a person's sealed predictions card on one run
 *    (`kind: "sealed-predictions"`, `src/lib/firestore/coursePredictions.ts`),
 *    written by `openRecorded`, keyed to the run;
 *  - one person's answers to a programme's surveys, or to a survey after an
 *    event (`kind: "survey-answers"`, `src/lib/firestore/surveys.ts`), written
 *    by `openSurveyAnswersRecorded`, keyed to the surveys and never to a run;
 *  - names on one survey's own pages, several people at once
 *    (`openSurveyNamesRecorded`): the people behind one bar of its results
 *    (`kind: "survey-bar"`, "See who"), whose one comment is
 *    (`"survey-comment"`, "Whose is this?"), and its Answers tab, every answer
 *    in one table (`"survey-table"`). Keyed to the survey, never to a run.
 *
 * Another kind of record joins by adding its kind below, and its ids.
 *
 * THE ORDER IS THE POINT. Each writer stores the row FIRST and reads the
 * record only once the row is stored: when the write fails, nothing of the
 * record is read and the caller refuses. So there is no way to read a record
 * through it without the opening being recorded, and an opening of a record
 * that turns out not to exist is recorded too, as an opening.
 *
 * WHAT A ROW HOLDS: the kind, who opened it (their account id and the name
 * they had then), whose record it was (an ACCOUNT ID, or for a guest of an
 * event the id of the sign-up or check-in that brought them, never a name),
 * the run the card belongs to or the surveys whose answers were shown, and
 * when. Never anything the record says.
 *
 * AN OPENING OF NAMES ON A SURVEY'S RESULTS NEVER SAYS WHICH BAR OR WHICH
 * COMMENT. Beside the people it names, the answer they gave or the comment
 * they wrote would be what they said, kept in a log that outlives their names
 * coming off the answers (below). So a row says "See who on a bar of this
 * survey, these people", and the bar is in nobody's record.
 *
 * APPEND-ONLY, AND SHUT TO EVERY BROWSER, ADMINS INCLUDED: no client reads or
 * writes a row (`firestore.rules`), the posture of `courseAudit` and
 * `dataExports`. An audit its own actor can amend is not an audit, and the
 * actor here is an admin.
 *
 * WHAT TAKES IT AWAY:
 *  - DELETING AN ACCOUNT TAKES NOTHING HERE, in either direction, as with
 *    `courseAudit` and the log of who opened an access-requirements answer.
 *    The openings of a deleted account's record stay: they name it by an id
 *    that no longer resolves to anybody, and they are the only evidence of
 *    who read it while it existed. The openings a deleted account made stay
 *    too: they are the record of what an admin did.
 *  - DESTROYING A RUN deletes every row keyed to it
 *    (`src/lib/firestore/courseDeletion.ts`, by `runId`): destroying a run
 *    destroys the cards the rows are about.
 *  - NOTHING TAKES AWAY AN OPENING OF SURVEY ANSWERS. It stores no `runId`,
 *    so no run's destroy finds it, and it is kept as the record of downloads
 *    (`dataExports`) is, because the answers outlive every run: a run's and a
 *    form's destroy leave a programme's surveys alone, a survey after an event
 *    has no run at all, and an event's deletion leaves its survey. Names
 *    coming off a survey (`src/lib/surveys/namesOff.ts`) leave its openings
 *    too: they say whose answers were opened, never what they said.
 */

export const RECORD_OPENINGS_COLLECTION = "recordOpenings";

/** What was opened. One kind per kind of confidential record. */
export type RecordOpeningKind =
  /** One person's sealed predictions card on one run: both cards' answers. */
  | "sealed-predictions"
  /** One person's answers to a programme's surveys, or to a survey after an event. */
  | "survey-answers"
  /** The people behind one bar of a survey's results ("See who"). */
  | "survey-bar"
  /** Whose one comment on a survey's results is ("Whose is this?"). */
  | "survey-comment"
  /** A survey's Answers tab: every answer, with names, in one table. */
  | "survey-table";

export const RECORD_OPENING_KINDS: readonly RecordOpeningKind[] = ["sealed-predictions", "survey-answers", "survey-bar", "survey-comment", "survey-table"];

/** The longest name a row keeps. */
const MAX_ACTOR_NAME = 120;

/** An opening of a record that belongs to a run: a sealed predictions card. */
export type RecordOpening = {
  kind: "sealed-predictions";
  /** The admin who opened it. */
  actorUid: string;
  /** Their name when they opened it, so the row still says who after their account is gone. */
  actorName: string;
  /** Whose record it is, by account id. */
  subjectUid: string;
  /** The run the record belongs to: the axis a run's destroy deletes by. */
  runId: string;
};

export type OpenedRecord<T> = { ok: true; value: T } | { ok: false };

/**
 * Record that `opening.actorUid` opened `opening.subjectUid`'s record, THEN
 * read it with `read`. When the row cannot be written, `read` is never called
 * and the answer is `{ ok: false }`: the caller refuses, and says the record
 * stays closed.
 */
export async function openRecorded<T>(db: Firestore, opening: RecordOpening, read: () => Promise<T>): Promise<OpenedRecord<T>> {
  try {
    await db
      .collection(RECORD_OPENINGS_COLLECTION)
      .doc()
      .create({
        kind: opening.kind,
        actorUid: opening.actorUid,
        actorName: opening.actorName.replace(/\s+/g, " ").trim().slice(0, MAX_ACTOR_NAME),
        subjectUid: opening.subjectUid,
        runId: opening.runId,
        openedAt: FieldValue.serverTimestamp(),
      });
  } catch (err) {
    console.error("[record openings] could not record an opening, so nothing was read", opening.kind, opening.runId, err);
    return { ok: false };
  }
  return { ok: true, value: await read() };
}

// ---------------------------------------------------------------------------
// One person's survey answers
// ---------------------------------------------------------------------------

/**
 * Whose answers were opened: an account, or somebody with no account who
 * answered a survey after an event, by the sign-up or the check-in that
 * brought them (the surveys' own `{ kind: "guest", signupId }`).
 */
export type OpeningSubject = { kind: "account"; uid: string } | { kind: "guest"; signupId: string };

/** An opening of one person's answers, from one survey's Answers tab. */
export type SurveyAnswersOpening = {
  /** The admin who opened them. */
  actorUid: string;
  /** Their name when they opened them. */
  actorName: string;
  subject: OpeningSubject;
  /** The survey they were opened from. */
  surveyId: string;
  /** Every survey whose answers of the person's the page shows, that one included. */
  surveyIds: readonly string[];
};

export type OpenedSurveyAnswers<T> = { ok: true; value: T; openingId: string } | { ok: false };

/** The most surveys one opening names: a programme has at most its four stages and its leaving survey. */
const MAX_SURVEYS = 10;

/**
 * Record that `opening.actorUid` opened `opening.subject`'s answers to
 * `opening.surveyIds`, THEN read them with `read`: the same order as
 * `openRecorded`. When the row cannot be written, `read` is never called and
 * the answer is `{ ok: false }`, so the caller shows nothing of the answers.
 *
 * The row holds no `runId`, so no run's destroy takes it (see the head of
 * this file). Its id comes back with what `read` answers, so the page can say
 * when this opening was.
 */
export async function openSurveyAnswersRecorded<T>(
  db: Firestore,
  opening: SurveyAnswersOpening,
  read: () => Promise<T>,
): Promise<OpenedSurveyAnswers<T>> {
  const surveyIds = [...new Set([opening.surveyId, ...opening.surveyIds])].slice(0, MAX_SURVEYS);
  const subject =
    opening.subject.kind === "account" ? { subjectUid: opening.subject.uid } : { subjectSignupId: opening.subject.signupId };
  const ref = db.collection(RECORD_OPENINGS_COLLECTION).doc();
  try {
    await ref.create({
      kind: "survey-answers",
      actorUid: opening.actorUid,
      actorName: opening.actorName.replace(/\s+/g, " ").trim().slice(0, MAX_ACTOR_NAME),
      ...subject,
      surveyId: opening.surveyId,
      surveyIds,
      openedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[record openings] could not record an opening of survey answers, so nothing was read", opening.surveyId, err);
    return { ok: false };
  }
  const value = await read();
  return { ok: true, value, openingId: ref.id };
}

// ---------------------------------------------------------------------------
// Names on one survey's own pages, several people at once
// ---------------------------------------------------------------------------

/** The openings of names on one survey's own pages: a bar's people, a comment's writer, the Answers tab. */
export type SurveyNamesKind = "survey-bar" | "survey-comment" | "survey-table";

export const SURVEY_NAMES_KINDS: readonly SurveyNamesKind[] = ["survey-bar", "survey-comment", "survey-table"];

/** An opening of names on one survey's pages. Never which bar or which comment: see the head of this file. */
export type SurveyNamesOpening = {
  kind: SurveyNamesKind;
  /** The admin who opened them. */
  actorUid: string;
  /** Their name when they opened them. */
  actorName: string;
  /** The survey they were opened on. */
  surveyId: string;
  /** Whose answers it shows, by id: accounts, and on a survey after an event, guests. */
  subjects: readonly OpeningSubject[];
};

/**
 * Record that `opening.actorUid` opened `opening.subjects`' names on one
 * survey's pages, THEN read them with `read`: the same order as
 * `openSurveyAnswersRecorded`. When the row cannot be written, `read` is never
 * called and the answer is `{ ok: false }`, so the caller names nobody.
 *
 * Whose, by two lists of ids (`subjectUids`, `subjectSignupIds`), so one
 * person's page finds every opening that named them by one `array-contains`.
 * The row holds no `runId`, so no run's destroy takes it.
 */
export async function openSurveyNamesRecorded<T>(
  db: Firestore,
  opening: SurveyNamesOpening,
  read: () => Promise<T>,
): Promise<OpenedSurveyAnswers<T>> {
  const subjectUids = [...new Set(opening.subjects.flatMap((subject) => (subject.kind === "account" ? [subject.uid] : [])))];
  const subjectSignupIds = [...new Set(opening.subjects.flatMap((subject) => (subject.kind === "guest" ? [subject.signupId] : [])))];
  const ref = db.collection(RECORD_OPENINGS_COLLECTION).doc();
  try {
    await ref.create({
      kind: opening.kind,
      actorUid: opening.actorUid,
      actorName: opening.actorName.replace(/\s+/g, " ").trim().slice(0, MAX_ACTOR_NAME),
      surveyId: opening.surveyId,
      subjectUids,
      subjectSignupIds,
      openedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[record openings] could not record an opening of names on a survey, so nobody was named", opening.kind, opening.surveyId, err);
    return { ok: false };
  }
  const value = await read();
  return { ok: true, value, openingId: ref.id };
}

// ---------------------------------------------------------------------------
// Reading the openings back
// ---------------------------------------------------------------------------

/** The kinds a survey's openings come in: one person's answers, or names on its own pages. */
export type SurveyOpeningKind = "survey-answers" | SurveyNamesKind;

function isSurveyOpeningKind(kind: unknown): kind is SurveyOpeningKind {
  return kind === "survey-answers" || SURVEY_NAMES_KINDS.includes(kind as SurveyNamesKind);
}

/** One opening of survey answers, as a page lists it: never anything of the answers, and never whose. */
export type SurveyAnswersOpeningRow = {
  id: string;
  kind: SurveyOpeningKind;
  actorUid: string;
  actorName: string;
  surveyIds: string[];
  /** How many people's answers it showed. */
  people: number;
  /** When it was opened. */
  at: Date | null;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);

/** A stored opening of survey answers, of any of its kinds, or null for anything else. */
function surveyOpeningRow(id: string, data: Record<string, unknown>): SurveyAnswersOpeningRow | null {
  if (!isSurveyOpeningKind(data.kind)) return null;
  const surveyId = typeof data.surveyId === "string" ? data.surveyId : "";
  const named = data.kind === "survey-answers" ? 1 : ids(data.subjectUids).length + ids(data.subjectSignupIds).length;
  return {
    id,
    kind: data.kind,
    actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
    actorName: typeof data.actorName === "string" ? data.actorName.slice(0, MAX_ACTOR_NAME) : "",
    surveyIds: data.kind === "survey-answers" ? ids(data.surveyIds) : surveyId ? [surveyId] : [],
    people: named,
    at: toDate(data.openedAt),
  };
}

const newestFirst = (a: SurveyAnswersOpeningRow, b: SurveyAnswersOpeningRow) =>
  (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) || a.id.localeCompare(b.id);

/**
 * Every opening of one person's survey answers, newest first, of every kind:
 * their answers opened alone (one equality on `subjectUid`, or on
 * `subjectSignupId` for a guest), and every bar, comment or Answers tab that
 * named them (one `array-contains` on `subjectUids`, or `subjectSignupIds`),
 * then the kind and the person checked in memory. Read by the one page that
 * opens a person's answers, for its "Who has opened this", after the opening
 * it is drawn for is recorded.
 */
export async function surveyAnswersOpeningsOf(db: Firestore, subject: OpeningSubject): Promise<SurveyAnswersOpeningRow[]> {
  const openings = db.collection(RECORD_OPENINGS_COLLECTION);
  const [alone, named] =
    subject.kind === "account"
      ? await Promise.all([openings.where("subjectUid", "==", subject.uid).get(), openings.where("subjectUids", "array-contains", subject.uid).get()])
      : await Promise.all([
          openings.where("subjectSignupId", "==", subject.signupId).get(),
          openings.where("subjectSignupIds", "array-contains", subject.signupId).get(),
        ]);
  const rows = new Map<string, SurveyAnswersOpeningRow>();
  for (const doc of alone.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    if (data.kind !== "survey-answers") continue;
    const owned = subject.kind === "account" ? data.subjectUid === subject.uid : data.subjectSignupId === subject.signupId;
    const row = owned ? surveyOpeningRow(doc.id, data) : null;
    if (row) rows.set(row.id, row);
  }
  for (const doc of named.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    if (!SURVEY_NAMES_KINDS.includes(data.kind as SurveyNamesKind)) continue;
    const owned = subject.kind === "account" ? ids(data.subjectUids).includes(subject.uid) : ids(data.subjectSignupIds).includes(subject.signupId);
    const row = owned ? surveyOpeningRow(doc.id, data) : null;
    if (row) rows.set(row.id, row);
  }
  return [...rows.values()].sort(newestFirst);
}

/**
 * Every opening of answers on one survey, newest first, for its log: one
 * person's answers opened from it or shown with it (one equality on
 * `surveyId`, one `array-contains` on `surveyIds`), and every bar, comment
 * and Answers tab opened on it. Each row says who opened what kind and how
 * many people it named, never whose: the log is read without an opening of
 * its own, so it names nobody.
 */
export async function surveyOpeningsOf(db: Firestore, surveyId: string): Promise<SurveyAnswersOpeningRow[]> {
  const openings = db.collection(RECORD_OPENINGS_COLLECTION);
  const [from, shown] = await Promise.all([
    openings.where("surveyId", "==", surveyId).get(),
    openings.where("surveyIds", "array-contains", surveyId).get(),
  ]);
  const rows = new Map<string, SurveyAnswersOpeningRow>();
  for (const doc of [...from.docs, ...shown.docs]) {
    const row = surveyOpeningRow(doc.id, (doc.data() ?? {}) as Record<string, unknown>);
    if (row && row.surveyIds.includes(surveyId)) rows.set(row.id, row);
  }
  return [...rows.values()].sort(newestFirst);
}
