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
 *    by `openSurveyAnswersRecorded`, keyed to the surveys and never to a run.
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
  | "survey-answers";

export const RECORD_OPENING_KINDS: readonly RecordOpeningKind[] = ["sealed-predictions", "survey-answers"];

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

/** An opening of one person's answers, from one survey's Who answered tab. */
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

/** One opening of a person's survey answers, as the page lists it: never anything of the answers. */
export type SurveyAnswersOpeningRow = {
  id: string;
  actorUid: string;
  actorName: string;
  surveyIds: string[];
  /** When it was opened. */
  at: Date | null;
};

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  const stamp = value as { toDate?: () => Date };
  return typeof stamp.toDate === "function" ? stamp.toDate() : null;
}

/**
 * Every opening of one person's survey answers, newest first: one equality on
 * `subjectUid` for an account, or on `subjectSignupId` for a guest, then the
 * kind in memory. Read by the one page that opens a person's answers, for
 * its "Who has opened this", after the opening it is drawn for is recorded.
 */
export async function surveyAnswersOpeningsOf(db: Firestore, subject: OpeningSubject): Promise<SurveyAnswersOpeningRow[]> {
  const snap =
    subject.kind === "account"
      ? await db.collection(RECORD_OPENINGS_COLLECTION).where("subjectUid", "==", subject.uid).get()
      : await db.collection(RECORD_OPENINGS_COLLECTION).where("subjectSignupId", "==", subject.signupId).get();
  const rows: SurveyAnswersOpeningRow[] = [];
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    if (data.kind !== "survey-answers") continue;
    const owned = subject.kind === "account" ? data.subjectUid === subject.uid : data.subjectSignupId === subject.signupId;
    if (!owned) continue;
    rows.push({
      id: doc.id,
      actorUid: typeof data.actorUid === "string" ? data.actorUid : "",
      actorName: typeof data.actorName === "string" ? data.actorName.slice(0, MAX_ACTOR_NAME) : "",
      surveyIds: Array.isArray(data.surveyIds) ? data.surveyIds.filter((id): id is string => typeof id === "string") : [],
      at: toDate(data.openedAt),
    });
  }
  return rows.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) || a.id.localeCompare(b.id));
}
