import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
  checkWriting,
  pangramConfigured,
  PANGRAM_MIN_WORDS,
  readingsForParts,
  worthALook,
  type PangramReading,
} from "@/lib/ai/pangram";
import type { SessionUser } from "@/lib/firebase/session";
import { PANGRAM_CHECKS_COLLECTION } from "./collections";
import { openCourseworkDoor, type CourseworkDoor, type DoorRefusal } from "./door";
import { loadAnswers } from "./gather";
import { fingerprintOf, pangramPartsOf, type CourseworkKind, type PangramPart } from "./input";
import { COURSEWORK_DOOR_WORDS, PANGRAM_WORDS } from "./claudeWords";

/**
 * PANGRAM ON COURSEWORK (privacy v13): ADMINS ONLY, everywhere. The lead is
 * turned away at the door (`adminOnly`) before anything is read, and no page
 * or route a lead reaches carries a reading: the chip beside a written answer
 * on its review page (`readAnswerReading`) is read for an admin alone.
 *
 * What is sent: one person's counted written answers and reflections of 50
 * words or more (`pangramPartsOf`), never a fill-in box, joined into ONE
 * text and sent ONCE (Pangram charges by the request), each answer's reading
 * read back from the stretches that cover it (`readingsForParts`). For a week
 * on the tab, the browser sends one person at a time, after saying how many
 * it will send (`weekPlan`).
 *
 * `coursePangramChecks/{runId}__{uid}`: each answer's last reading, by the
 * row's id, with a hash of the words it read (`hash`): a reading whose
 * answer's words have changed shows as out of date. A flag reads "worth a
 * look", never a verdict. Deleted with the run and with the account.
 */


export const pangramCheckId = (runId: string, uid: string) => `${runId}__${uid}`;

type Raw = Record<string, unknown>;

type StoredReading = PangramReading & { hash: string; worthALook: boolean; at: string };

export type PangramPartView = {
  rowId: string;
  weekId: string;
  weekNumber: number;
  kind: CourseworkKind;
  question: string;
  words: number;
  reading: { label: string; headline: string; fractionAi: number; fractionAiAssisted: number; worthALook: boolean; at: string } | null;
  outOfDate: boolean;
};

export type PangramPersonView = {
  pangram: boolean;
  parts: PangramPartView[];
  tooShort: number;
  notCounted: number;
};

function readingsOf(data: Raw | undefined): Record<string, StoredReading> {
  const parts = data?.parts && typeof data.parts === "object" ? (data.parts as Record<string, Raw>) : {};
  const out: Record<string, StoredReading> = {};
  for (const [rowId, raw] of Object.entries(parts)) {
    if (!raw || typeof raw !== "object" || typeof raw.label !== "string") continue;
    const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);
    out[rowId] = {
      label: raw.label,
      headline: typeof raw.headline === "string" ? raw.headline : "",
      fractionAi: number(raw.fractionAi),
      fractionAiAssisted: number(raw.fractionAiAssisted),
      fractionHuman: number(raw.fractionHuman),
      hash: typeof raw.hash === "string" ? raw.hash : "",
      worthALook: raw.worthALook === true,
      at: typeof raw.at === "string" ? raw.at : "",
    };
  }
  return out;
}

async function openAdminDoor(db: Firestore, user: SessionUser, roundId: string, programmeId: string) {
  return openCourseworkDoor(db, user, roundId, programmeId, { adminOnly: PANGRAM_WORDS.onlyAdmins });
}

/** Whether somebody's coursework belongs to this programme: they hold a place on it, or facilitate on its run. */
function onProgramme(door: CourseworkDoor, uid: string): boolean {
  return door.holders.some((holder) => holder.uid === uid) || door.people.facilitators.has(uid);
}

async function partsFor(db: Firestore, door: CourseworkDoor, uid: string, weekId: string | null) {
  const answers = await loadAnswers(db, door.runId, door.weeks, new Set([uid]));
  return pangramPartsOf(answers, PANGRAM_MIN_WORDS, weekId);
}

function viewOf(door: CourseworkDoor, parts: readonly PangramPart[], stored: Record<string, StoredReading>, tooShort: number, notCounted: number): PangramPersonView {
  const questionOf = new Map(door.weeks.flatMap((week) => week.questions.map((question) => [`${week.weekId} ${question.key}`, question.text] as const)));
  const weekNumberOf = new Map(door.weeks.map((week) => [week.weekId, week.weekNumber]));
  return {
    pangram: pangramConfigured(),
    parts: parts.map((part) => {
      const reading = stored[part.key] ?? null;
      return {
        rowId: part.key,
        weekId: part.weekId,
        weekNumber: weekNumberOf.get(part.weekId) ?? 0,
        kind: part.kind,
        question: questionOf.get(`${part.weekId} ${part.questionKey}`) ?? "",
        words: part.words,
        reading: reading
          ? {
              label: reading.label,
              headline: reading.headline,
              fractionAi: reading.fractionAi,
              fractionAiAssisted: reading.fractionAiAssisted,
              worthALook: reading.worthALook,
              at: reading.at,
            }
          : null,
        outOfDate: reading !== null && reading.hash !== part.hash,
      };
    }),
    tooShort,
    notCounted,
  };
}

/** Pangram's last reading of one answer, as the chip beside it on the review page says it. */
export type AnswerReading = { worthALook: boolean; outOfDate: boolean };

/**
 * Pangram's last reading of one written answer, for the chip beside it on its
 * review page: whether it is worth a look, and whether the answer has changed
 * since (`words` are its words as Pangram is sent them, `writtenAnswerWords`,
 * hashed as the check hashes them). Null when it was never checked. ADMINS
 * ONLY: the review page asks for it for an admin alone, and nothing else here
 * is read. Writes nothing and sends nothing.
 */
export async function readAnswerReading(
  db: Firestore,
  input: { runId: string; uid: string; rowId: string; words: string },
): Promise<AnswerReading | null> {
  const snap = await db.collection(PANGRAM_CHECKS_COLLECTION).doc(pangramCheckId(input.runId, input.uid)).get();
  const reading = readingsOf(snap.data() as Raw | undefined)[input.rowId] ?? null;
  if (!reading) return null;
  return { worthALook: reading.worthALook, outOfDate: reading.hash !== fingerprintOf(input.words) };
}

/** What Pangram found in one person's coursework on the programme, for an admin. Writes nothing and sends nothing. */
export async function loadPersonPangram(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  uid: string,
): Promise<{ ok: true; view: PangramPersonView } | DoorRefusal> {
  const door = await openAdminDoor(db, user, roundId, programmeId);
  if (!door.ok) return door;
  if (!onProgramme(door, uid)) return { ok: false, status: 404, error: COURSEWORK_DOOR_WORDS.notOnRun };
  const [{ parts, tooShort, notCounted }, snap] = await Promise.all([
    partsFor(db, door, uid, null),
    db.collection(PANGRAM_CHECKS_COLLECTION).doc(pangramCheckId(door.runId, uid)).get(),
  ]);
  return { ok: true, view: viewOf(door, parts, readingsOf(snap.data() as Raw | undefined), tooShort, notCounted) };
}

/** What goes between two answers in the one text Pangram is sent. */
const BETWEEN_ANSWERS = "\n\n";

/**
 * Ask Pangram about one person's counted answers (one week's, or all of them),
 * in one request, keep each answer's reading, and answer with their view.
 */
export async function checkPersonPangram(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  uid: string,
  weekId: string | null,
): Promise<{ ok: true; view: PangramPersonView } | DoorRefusal> {
  const door = await openAdminDoor(db, user, roundId, programmeId);
  if (!door.ok) return door;
  if (!onProgramme(door, uid)) return { ok: false, status: 404, error: COURSEWORK_DOOR_WORDS.notOnRun };
  if (weekId && !door.weeks.some((week) => week.weekId === weekId)) return { ok: false, status: 404, error: COURSEWORK_DOOR_WORDS.noWeek };
  if (!pangramConfigured()) return { ok: false, status: 409, error: PANGRAM_WORDS.notSetUp };

  const sending = await partsFor(db, door, uid, weekId);
  if (sending.parts.length === 0) return { ok: false, status: 409, error: PANGRAM_WORDS.nothingToSend };

  const spans: Array<{ start: number; end: number }> = [];
  let text = "";
  for (const part of sending.parts) {
    if (text) text += BETWEEN_ANSWERS;
    spans.push({ start: text.length, end: text.length + part.text.length });
    text += part.text;
  }
  const result = await checkWriting(text, Date.now() + 150_000);
  if (!result.ok) return { ok: false, status: 502, error: result.reason };
  const readings = readingsForParts(spans, result.reading, result.windows);
  const at = new Date().toISOString();
  const update: Raw = {};
  sending.parts.forEach((part, index) => {
    update[part.key] = { ...readings[index], hash: part.hash, worthALook: worthALook(readings[index]), at, weekId: part.weekId, kind: part.kind, words: part.words };
  });
  const ref = db.collection(PANGRAM_CHECKS_COLLECTION).doc(pangramCheckId(door.runId, uid));
  await ref.set({ runId: door.runId, uid, parts: update, updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  const [all, snap] = await Promise.all([partsFor(db, door, uid, null), ref.get()]);
  return { ok: true, view: viewOf(door, all.parts, readingsOf(snap.data() as Raw | undefined), all.tooShort, all.notCounted) };
}

export type PangramWeekPlan = {
  pangram: boolean;
  /** Each person with something Pangram may be sent this week, and how many answers. */
  people: Array<{ uid: string; answers: number }>;
  answers: number;
};

/**
 * Before the tab's "Check N people with Pangram": who would be sent, one
 * request each, and how many answers. Admins only. Writes nothing and sends
 * nothing.
 */
export async function pangramWeekPlan(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  weekId: string,
): Promise<{ ok: true; plan: PangramWeekPlan } | DoorRefusal> {
  const door = await openAdminDoor(db, user, roundId, programmeId);
  if (!door.ok) return door;
  const week = door.weeks.find((candidate) => candidate.weekId === weekId);
  if (!week) return { ok: false, status: 404, error: COURSEWORK_DOOR_WORDS.noWeek };
  const writers = new Set([...door.holders.map((holder) => holder.uid), ...door.people.facilitators]);
  const answers = await loadAnswers(db, door.runId, [week], writers);
  const people: PangramWeekPlan["people"] = [];
  for (const uid of [...writers].sort()) {
    const { parts } = pangramPartsOf(answers.filter((answer) => answer.uid === uid), PANGRAM_MIN_WORDS, weekId);
    if (parts.length > 0) people.push({ uid, answers: parts.length });
  }
  return {
    ok: true,
    plan: { pangram: pangramConfigured(), people, answers: people.reduce((sum, person) => sum + person.answers, 0) },
  };
}
