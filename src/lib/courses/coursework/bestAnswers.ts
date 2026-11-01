import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { claudeConfigured } from "@/lib/ai/claude";
import type { SessionUser } from "@/lib/firebase/session";
import { BEST_ANSWERS_COLLECTION } from "./collections";
import { askForBestAnswers } from "./claude";
import { fellowsOf, openCourseworkDoor, runPeopleToScrub, type CourseworkDoor, type DoorRefusal } from "./door";
import { loadAnswers } from "./gather";
import { bestAnswersInput, withFellowNames, type CourseworkKind, type CourseworkWeek } from "./input";
import { BEST_WORDS, COURSEWORK_DOOR_WORDS } from "./claudeWords";

/**
 * CLAUDE'S BEST ANSWERS TO A WEEK (privacy v13), FOR AN ADMIN ALONE (privacy
 * v15, which says what Claude returns is seen by admins only), on the
 * Coursework tab, asked for and never automatic. The route refuses anybody
 * else on the session before anything is read, and the coursework door here
 * refuses them again (`adminOnly`), so the programme's lead, who may open the
 * tab, neither asks for them nor reads them.
 *
 * `courseBestAnswers/{runId}__{weekId}`: the last answer Claude gave for one
 * week of one run. It holds what Claude picked, by the ACCOUNT each label
 * stood for (`labels`), never a name; reasons and the sentence on what was
 * hard keep Claude's labels ("Fellow 3"), and names are put back on the way
 * to the screen from who holds a place NOW: a pick whose person no longer
 * holds one, or whose account is gone, is dropped, and a label in a reason
 * nobody holds reads "a fellow". `uids` lists every account picked, so an
 * account's deletion finds its picks with one `array-contains`.
 * `fingerprint` is a hash of what was sent: the screen marks the answer out
 * of date once what would be sent changes.
 *
 * Kept until it is asked for again (one document per week, replaced) or the
 * run is destroyed (`courseDeletion.ts`, `bestAnswers`).
 */


export const bestAnswersId = (runId: string, weekId: string) => `${runId}__${weekId}`;

type Raw = Record<string, unknown>;

export type BestAnswersView = {
  claude: boolean;
  week: { weekId: string; weekNumber: number; title: string };
  result: {
    at: string;
    hard: string;
    questions: Array<{ kind: CourseworkKind; text: string; picks: Array<{ uid: string; name: string; reason: string }> }>;
  } | null;
  outOfDate: boolean;
  /** Answers that would be sent now. */
  sendable: number;
  /** Answers left out now: written before their writer agreed to privacy v13, or by somebody who has not. */
  notIncluded: number;
};

type Stored = {
  questions: Array<{ key: string; kind: CourseworkKind; text: string; picks: Array<{ uid: string; reason: string }> }>;
  hard: string;
  labels: Record<string, string>;
  fingerprint: string;
  at: string;
};

function storedOf(data: Raw | undefined): Stored | null {
  if (!data || !Array.isArray(data.questions)) return null;
  const labels = data.labels && typeof data.labels === "object" ? (data.labels as Record<string, string>) : {};
  return {
    questions: (data.questions as Raw[]).map((question) => ({
      key: String(question.key ?? ""),
      kind: (question.kind === "written" || question.kind === "fillIn" ? question.kind : "reflection") as CourseworkKind,
      text: String(question.text ?? ""),
      picks: Array.isArray(question.picks)
        ? (question.picks as Raw[]).map((pick) => ({ uid: String(pick.uid ?? ""), reason: String(pick.reason ?? "") }))
        : [],
    })),
    hard: typeof data.hard === "string" ? data.hard : "",
    labels,
    fingerprint: typeof data.fingerprint === "string" ? data.fingerprint : "",
    at: typeof data.at === "string" ? data.at : "",
  };
}

type Ready = { door: CourseworkDoor; week: CourseworkWeek };

async function openWeek(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  weekId: string,
): Promise<Ready | DoorRefusal> {
  const door = await openCourseworkDoor(db, user, roundId, programmeId, { adminOnly: BEST_WORDS.onlyAdmins });
  if (!door.ok) return door;
  const week = door.weeks.find((candidate) => candidate.weekId === weekId);
  if (!week) return { ok: false, status: 404, error: COURSEWORK_DOOR_WORDS.noWeek };
  return { door, week };
}

async function inputOf(db: Firestore, door: CourseworkDoor, week: CourseworkWeek) {
  const writers = fellowsOf(door);
  const [answers, people] = await Promise.all([
    loadAnswers(db, door.runId, [week], writers),
    runPeopleToScrub(db, door),
  ]);
  return { input: bestAnswersInput({ programme: door.programmeName, week, answers, writers, people }), answers };
}

function viewOf(door: CourseworkDoor, week: CourseworkWeek, stored: Stored | null, now: ReturnType<typeof bestAnswersInput>): BestAnswersView {
  const nameOf = new Map(door.holders.filter((holder) => !door.people.facilitators.has(holder.uid)).map((holder) => [holder.uid, holder.name]));
  const labelNames: Record<string, string> = {};
  for (const [label, uid] of Object.entries(stored?.labels ?? {})) {
    const name = nameOf.get(uid);
    if (name) labelNames[label] = name;
  }
  const named = (text: string) => withFellowNames(text, labelNames);
  return {
    claude: claudeConfigured(),
    week: { weekId: week.weekId, weekNumber: week.weekNumber, title: week.title },
    result: stored
      ? {
          at: stored.at,
          hard: named(stored.hard),
          questions: stored.questions.map((question) => ({
            kind: question.kind,
            text: question.text,
            picks: question.picks.flatMap((pick) => {
              const name = nameOf.get(pick.uid);
              return name ? [{ uid: pick.uid, name, reason: named(pick.reason) }] : [];
            }),
          })),
        }
      : null,
    outOfDate: stored !== null && stored.fingerprint !== now.fingerprint,
    sendable: now.sent,
    notIncluded: now.leftOut,
  };
}

/** What Claude found for one week, for an admin. Writes nothing and sends nothing. */
export async function loadBestAnswers(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  weekId: string,
): Promise<{ ok: true; view: BestAnswersView } | DoorRefusal> {
  const ready = await openWeek(db, user, roundId, programmeId, weekId);
  if ("ok" in ready) return ready;
  const { door, week } = ready;
  const [snap, now] = await Promise.all([
    db.collection(BEST_ANSWERS_COLLECTION).doc(bestAnswersId(door.runId, week.weekId)).get(),
    inputOf(db, door, week),
  ]);
  return { ok: true, view: viewOf(door, week, snap.exists ? storedOf(snap.data() as Raw) : null, now.input) };
}

/** Ask Claude for one week's best answers, keep what came back, and answer with the view. */
export async function askBestAnswers(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
  weekId: string,
): Promise<{ ok: true; view: BestAnswersView } | DoorRefusal> {
  const ready = await openWeek(db, user, roundId, programmeId, weekId);
  if ("ok" in ready) return ready;
  const { door, week } = ready;
  if (!claudeConfigured()) return { ok: false, status: 409, error: BEST_WORDS.notSetUp };
  const { input, answers: counted } = await inputOf(db, door, week);
  if (input.sent === 0) return { ok: false, status: 409, error: BEST_WORDS.nothingToSend };

  // Which labels answered each question: Claude's picks are kept only among them.
  const answered = new Map<string, Set<string>>();
  const uidToLabel = new Map(Object.entries(input.labels).map(([label, uid]) => [uid, label]));
  for (const question of input.questions) {
    answered.set(
      question.label,
      new Set(counted.filter((answer) => answer.counted && answer.questionKey === question.key).map((answer) => uidToLabel.get(answer.uid) ?? "")),
    );
  }
  const asked = await askForBestAnswers(input.message, answered);
  if (!asked.ok) return { ok: false, status: 502, error: asked.reason };

  const questions = input.questions.map((question) => ({
    key: question.key,
    kind: question.kind,
    text: question.text,
    picks: (asked.answer.picks[question.label] ?? []).map((pick) => ({ uid: input.labels[pick.label], reason: pick.reason })),
  }));
  const at = new Date().toISOString();
  const stored = {
    runId: door.runId,
    weekId: week.weekId,
    weekNumber: week.weekNumber,
    questions,
    hard: asked.answer.hard,
    labels: input.labels,
    // Every account a label stands for, picked or not: an account's deletion
    // finds this document by it and takes the account out of both.
    uids: Object.values(input.labels),
    fingerprint: input.fingerprint,
    sent: input.sent,
    leftOut: input.leftOut,
    model: asked.answer.model,
    askedByUid: user.uid,
    at,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // One answer per week, replacing the last.
  await db.collection(BEST_ANSWERS_COLLECTION).doc(bestAnswersId(door.runId, week.weekId)).set(stored);
  return { ok: true, view: viewOf(door, week, storedOf(stored as unknown as Raw), input) };
}
