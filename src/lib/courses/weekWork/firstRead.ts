import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { reflectionPartsOf } from "@/lib/courses/facilitatorWeek/model";
import { feedbackGate, feedbackRefusalFor, feedbackStandingIn, feedbackWeekOf, type FeedbackWeek } from "@/lib/courses/feedback/access";
import { boxesReaderFor } from "@/lib/courses/fillInBoxes/access";
import { isBlockWeek, type WeekBlock } from "@/lib/courses/weekBlocks/model";
import { londonDateKey, londonWallClockToInstant } from "@/lib/courses/weekPlan";
import { weekFillInBoxes } from "@/lib/courses/weekBlocks/reader";
import { liveGroupsOf, reviewerFactsOf } from "@/lib/courses/writtenAnswers/access";
import { isNamedWithStanding } from "@/lib/firebase/eligibility";
import type { SessionUser } from "@/lib/firebase/session";
import { exerciseResponseId, isFillInResponse, isReflectionResponse } from "@/lib/firestore/courseExercises";
import { COURSE_WEEK_WORK_COLLECTION, courseWeekWorkId } from "@/lib/firestore/courseWeekWork";
import { readRunForWork, weekWorkRef } from "./own";
import { runWeekWorkOf, type RunWeekWork } from "./readers";

/**
 * WHEN AN ANSWER WAS FIRST READ (Zach, Fri 13 Nov 2026): for each answer of a
 * person's week (a reflection, a fill-in box, the written answer), the time it
 * was first put in front of somebody who may read it, in full, on the reading
 * view of one person's week, on the page of one question across a group, or,
 * for a fill-in box, under This week's work on the facilitator's group page
 * and the programme's page for a group's week once that person's "Read it"
 * is opened.
 * NEVER WHO read it, and no count of readings. Once set, a time never changes.
 *
 * WHERE: the person's week record (`courseWeekWork`, which every browser is
 * refused and the person never reads), as a map from the answer's id (a
 * reflection's prompt, a box's id, the written answer's block) to the START
 * OF THE LONDON DAY it was first read, in the field `firstReadAt` beside
 * `reviewedVersions`. The day, not the moment: nothing shows or compares the
 * time finer than whether there is one, and a moment could be laid beside a
 * host's request log to say who made the request. Additive and optional: an
 * answer missing from it has no time kept. The record is taken whole by the
 * account deletion sweep (by `uid`) and by a run's destroy (by `runId`), so
 * the times go with it; a record this file makes carries both fields for
 * that reason.
 *
 * WHEN THE SITE BEGAN KEEPING THEM: one server-only document,
 * `config/firstReadTimes` (`keptSince`), made by the first call of the route
 * below that gets past its refusals, with the server's exact time, and never
 * moved (`readFirstReadsKeptFrom` reads it). The team read and gave feedback
 * on answers before then, on the pages there were, and nothing kept that, so
 * an answer that became readable in the words shown before that instant, with
 * no time kept, is neither read nor unread; with no document yet, no answer
 * is "not read yet". It holds the exact instant, not a day: a day's start
 * would call "not read yet" answers saved earlier that same day, which
 * somebody may have read before. It names nobody and is about nobody, so no
 * deletion sweep touches it.
 *
 * WHO SEES IT: the people who may read the answer, on the page of one
 * question across a group ("Not read yet"), and, as a flag beside a person's
 * week and on the list of answers waiting for feedback, on the programme's
 * Coursework tab (an admin or the programme's lead, never on their own row),
 * and nobody else. What counts as
 * read there is `readStateOf` (`src/lib/courses/coursework/question.ts`): a
 * time kept, or feedback on the answer; and, held against `keptSince`, an
 * answer with neither is unread only when it became readable since. This
 * file is the one reader and the one writer of the field and the document;
 * `normalizeCourseWeekWork`, which every reader of a person's own record goes
 * through, never carries the field, so nothing the person's own pages and
 * routes are sent can name it.
 *
 * HOW IT IS WRITTEN: by a POST the reading pages (the two above, and This
 * week's work's boxes once opened) make once they have drawn the answers
 * (`/api/courses/runs/[runId]/first-read`), never by a page's GET and
 * never while rendering, so a link preview or a prefetch marks nothing. For
 * each answer named, exactly what reading it asks, through the gates every
 * reading page asks:
 *  - the person's work is the reader's to read (`feedbackGate`, which asks
 *    `writtenReviewRole`): their group's facilitators, the programme's lead
 *    and admins for a fellow's; the lead and admins alone for a
 *    facilitator's own; NEVER the person themselves, an admin included;
 *  - a reflection: its row holds words;
 *  - a fill-in box: its row holds words, and `boxesReaderFor` answers;
 *  - the written answer: its readers may read it and what they read holds
 *    words (`feedbackStandingIn`, `feedbackRefusalFor`, as feedback on it
 *    asks), so an answer still hidden before the session is never marked.
 * An answer the reader may not read in full is passed over in silence, and a
 * time already there is never moved.
 */

/** The field on a person's week record. */
export const FIRST_READ_FIELD = "firstReadAt";

/** The one document saying when this site began keeping read times, in the server-only `config` collection. */
export const FIRST_READ_TIMES_DOC = { collection: "config", doc: "firstReadTimes", field: "keptSince" } as const;

/** At most this many people, and this many answers each, in one call: more than any group, or any week, has. */
export const MAX_PEOPLE = 60;
export const MAX_IDS = 60;
/** The longest id a call may name: an account's id is at most 128 characters, and a block's far shorter. */
export const MAX_ID_LENGTH = 128;

/**
 * The instant, once found, by database handle: it never moves once set, so a
 * server keeps it rather than reading it again. Nothing is kept while there is
 * none, so the first one made is found on the next read.
 */
const keptFromSeen = new WeakMap<object, Date>();

/** A stored time, read. */
function instantOf(stamp: unknown): Date | null {
  const at = stamp instanceof Date ? stamp : typeof (stamp as { toDate?: unknown })?.toDate === "function" ? (stamp as { toDate: () => Date }).toDate() : null;
  return at && !Number.isNaN(at.getTime()) ? at : null;
}

/**
 * WHEN THIS SITE BEGAN KEEPING READ TIMES (`config/firstReadTimes`,
 * `keptSince`), or null before it has: nothing is then "not read yet". For
 * the reading pages' loaders, after their gates. One addressed read, the
 * first time only.
 */
export async function readFirstReadsKeptFrom(db: Firestore): Promise<Date | null> {
  const seen = keptFromSeen.get(db);
  if (seen) return seen;
  const snap = await db.collection(FIRST_READ_TIMES_DOC.collection).doc(FIRST_READ_TIMES_DOC.doc).get();
  const at = snap.exists ? instantOf((snap.data() ?? {})[FIRST_READ_TIMES_DOC.field]) : null;
  if (at) keptFromSeen.set(db, at);
  return at;
}

/**
 * Makes the document saying when this site began keeping read times, with
 * the server's time, where there is none; never moves one that is there. Asked
 * by the route before any time is kept on anybody's record.
 */
async function startKeepingReadTimes(db: Firestore): Promise<void> {
  if (await readFirstReadsKeptFrom(db)) return;
  const ref = db.collection(FIRST_READ_TIMES_DOC.collection).doc(FIRST_READ_TIMES_DOC.doc);
  try {
    await ref.create({ [FIRST_READ_TIMES_DOC.field]: FieldValue.serverTimestamp() });
  } catch (err) {
    // Already made, by an earlier call or one landing at the same moment: it stays as it is.
    if ((err as { code?: unknown })?.code !== 6) throw err;
  }
}

/** The start of the London day `now` falls on: the grain a read time is kept at. */
export function readDayOf(now: Date): Date {
  return londonWallClockToInstant(londonDateKey(now), "00:00");
}

/** The times stored on a record, by answer id. Never throws. */
export function firstReadsOf(data: Record<string, unknown> | undefined | null): Map<string, Date> {
  const out = new Map<string, Date>();
  const value = data?.[FIRST_READ_FIELD];
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [id, stamp] of Object.entries(value as Record<string, unknown>)) {
    const at = instantOf(stamp);
    if (at) out.set(id, at);
  }
  return out;
}

/**
 * EACH PERSON'S FIRST READS OF ONE WEEK, by uid then answer id: for the page
 * of one question across a group, after its gate and only for the people it
 * lists. One addressed read per person, no query.
 */
export async function readFirstReads(
  db: Firestore,
  input: { runId: string; weekId: string; uids: readonly string[] },
): Promise<Map<string, Map<string, Date>>> {
  const uids = [...new Set(input.uids.filter(Boolean))];
  const out = new Map<string, Map<string, Date>>();
  if (uids.length === 0) return out;
  const snaps = await db.getAll(...uids.map((uid) => db.collection(COURSE_WEEK_WORK_COLLECTION).doc(courseWeekWorkId(input.runId, uid, input.weekId))));
  uids.forEach((uid, index) => {
    const snap = snaps[index];
    const data = snap?.exists ? ((snap.data() ?? {}) as Record<string, unknown>) : null;
    // A record is the person's only when it says so.
    out.set(uid, data && data.uid === uid && data.runId === input.runId ? firstReadsOf(data) : new Map());
  });
  return out;
}

/**
 * EVERY WEEK RECORD ON A RUN, AND THE FIRST READS KEPT ON THEM, from ONE read
 * (one equality on the run, no declared index): for the Coursework tab, after
 * its gate, which reads the records anyway for where each person's weeks
 * stand. `records` is every record as every other reader reads one
 * (`runWeekWorkOf`, through `normalizeCourseWeekWork`, which never carries the
 * times), handed on to the tab's other reads so the run's records are read
 * once; `firstReads` the times, by uid, then week id, then answer id. A
 * record is a person's only when it says so. Never who read anything: nothing
 * of that is kept.
 */
export async function readRunWeekRecords(
  db: Firestore,
  runId: string,
): Promise<{ records: RunWeekWork; firstReads: Map<string, Map<string, Map<string, Date>>> }> {
  const snap = await db.collection(COURSE_WEEK_WORK_COLLECTION).where("runId", "==", runId).get();
  const firstReads = new Map<string, Map<string, Map<string, Date>>>();
  for (const doc of snap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === "string" ? data.uid : "";
    const weekId = typeof data.weekId === "string" ? data.weekId : "";
    if (!uid || !weekId || data.runId !== runId) continue;
    const times = firstReadsOf(data);
    if (times.size === 0) continue;
    const own = firstReads.get(uid) ?? new Map<string, Map<string, Date>>();
    own.set(weekId, times);
    firstReads.set(uid, own);
  }
  return { records: runWeekWorkOf(snap.docs, runId), firstReads };
}

/** The answers one call names: whose, and which of their week's answers. */
export type FirstReadAsk = { uid: string; ids: string[] };

export type FirstReadOutcome = { ok: true } | { ok: false; status: 403 | 404 };

/**
 * Whether `actor` reads anybody's work on this run at all: an admin, the
 * programme's lead, or a live facilitator of one of its groups who stands.
 * Asked before any person named is read, so somebody who reads nobody's work
 * costs the call one look at the run.
 */
function readsWorkOnRun(actor: SessionUser, facts: { isAdmin: boolean; isLead: boolean }, liveGroups: readonly { facilitatorUids: string[] }[]): boolean {
  return facts.isAdmin || facts.isLead || liveGroups.some((group) => isNamedWithStanding(actor, "courseGroups.facilitatorUids", group.facilitatorUids));
}

/** The kind of answer each id of a person's copy of the week is, or nothing for an id the week does not ask. */
function kindsOf(week: FeedbackWeek): Map<string, "reflection" | "box" | "answer"> {
  const out = new Map<string, "reflection" | "box" | "answer">();
  if (!isBlockWeek(week.week)) return out;
  for (const part of reflectionPartsOf((week.week as { blocks: WeekBlock[] }).blocks)) for (const prompt of part.prompts) out.set(prompt.id, "reflection");
  for (const box of weekFillInBoxes(week.week)) out.set(box.id, "box");
  for (const id of week.answerIds) out.set(id, "answer");
  return out;
}

/**
 * MARKS THE ANSWERS NAMED AS FIRST READ NOW, where they were not already and
 * where `actor` may read each in full (see the module comment). The caller
 * has refused a view-as session, asked for a session and read the body.
 * Answers ok once past the run and the caller's own refusals, whatever was
 * written, so the answer never says whose work, or which answer, there is.
 */
export async function markFirstRead(
  db: Firestore,
  actor: SessionUser,
  input: { runId: string; weekId: string; weekNumber: number; people: readonly FirstReadAsk[]; now: Date },
): Promise<FirstReadOutcome> {
  // A person never marks their own work: the call is refused, an admin's included.
  if (input.people.some((person) => person.uid === actor.uid)) return { ok: false, status: 403 };
  const run = await readRunForWork(db, input.runId);
  if (!run) return { ok: false, status: 404 };
  const [liveGroups, facts] = await Promise.all([liveGroupsOf(db, run.id), reviewerFactsOf(db, actor, run.id)]);
  if (!readsWorkOnRun(actor, facts, liveGroups)) return { ok: false, status: 403 };

  // When this site began keeping read times, made before the first time is kept on anybody's record.
  await startKeepingReadTimes(db);
  // Each person apart, side by side: nothing one person's answers say bears on another's.
  await Promise.all(input.people.map((person) => markOnePerson(db, actor, { ...input, runId: run.id, person })));
  return { ok: true };
}

/** One person's answers named, after the run-wide refusals. */
async function markOnePerson(
  db: Firestore,
  actor: SessionUser,
  input: { runId: string; weekId: string; weekNumber: number; person: FirstReadAsk; now: Date },
): Promise<void> {
  const { runId, weekId, weekNumber, person, now } = input;
  // The one gate on whose work a reader may act on, asked before anything of theirs is read.
  const gate = await feedbackGate(db, actor, runId, person.uid);
  if (!gate.ok) return;
  const week = await feedbackWeekOf(db, gate, weekId);
  if (!week) return;
  const kinds = kindsOf(week);
  const named = [...new Set(person.ids)].filter((id) => kinds.has(id));
  if (named.length === 0) return;
  // A box is read only by those its own gate admits.
  const boxesRead = named.some((id) => kinds.get(id) === "box") ? (await boxesReaderFor(db, actor, runId, person.uid)) !== null : false;
  const ref = weekWorkRef(db, runId, person.uid, weekId);
  await db.runTransaction(async (tx) => {
    const [record, ...rows] = await Promise.all([
      tx.get(ref),
      ...named.map((id) =>
        kinds.get(id) === "answer"
          ? Promise.resolve(null)
          : tx.get(db.collection("courseExerciseResponses").doc(exerciseResponseId(runId, person.uid, weekId, id))),
      ),
    ]);
    const stored = record.exists ? ((record.data() ?? {}) as Record<string, unknown>) : null;
    // A time already there is never moved.
    const already = stored && stored.uid === person.uid ? firstReadsOf(stored) : new Map<string, Date>();
    const missing: string[] = [];
    for (const [index, id] of named.entries()) {
      if (already.has(id)) continue;
      const kind = kinds.get(id);
      if (kind === "answer") {
        // What feedback on it asks: its readers may read it, and what they read holds words.
        const standing = await feedbackStandingIn(tx, db, { runId, uid: person.uid, weekId, weekNumber, answerId: id, source: week.source, now });
        if (feedbackRefusalFor("writtenAnswer", standing, { notReadable: "", answerEmpty: "" }) === null) missing.push(id);
        continue;
      }
      if (kind === "box" && !boxesRead) continue;
      const row = rows[index];
      const data = row?.exists ? ((row.data() ?? {}) as Record<string, unknown>) : null;
      const isKind = kind === "reflection" ? isReflectionResponse(data) : isFillInResponse(data);
      const text = typeof data?.text === "string" ? data.text.trim() : "";
      if (data && isKind && data.uid === person.uid && data.runId === runId && text) missing.push(id);
    }
    if (missing.length === 0) return;
    tx.set(
      ref,
      // The day it was first read, never the moment.
      { runId, uid: person.uid, weekId, weekNumber, [FIRST_READ_FIELD]: Object.fromEntries(missing.map((id) => [id, readDayOf(now)])) },
      { merge: true },
    );
  });
}
