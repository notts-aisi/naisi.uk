import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { claudeConfigured } from "@/lib/ai/claude";
import { checkWriting, pangramConfigured, PANGRAM_MIN_WORDS, wordCount, worthALook } from "@/lib/ai/pangram";
import type { SessionUser } from "@/lib/firebase/session";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { canRunTerm } from "../access";
import { own } from "../keys";
import { loadProgrammeBoard, loadReview, loadStaffNames } from "../review/load";
import { UNNAMED_STAFF } from "../review/people";
import { refuse } from "../review/refusals";
import type { Refusal, ReviewPayload } from "../review/types";
import { askForClaudeRead } from "./claudeRead";
import { assessmentInputFrom, withNames, type LongAnswer } from "./input";
import type {
  AssessmentMark,
  AssessmentPart,
  AssessmentView,
  ClaudeRead,
  PangramAnswer,
  PangramCheck,
  StoredClaudeRead,
} from "./types";

/**
 * ASKING FOR, AND READING BACK, AN ASSESSMENT OF ONE APPLICATION.
 *
 * The order is the review screens' order, with one step in front:
 *
 *  1. ONLY AN ADMIN, refused before anything is read. An admin is the person
 *     who decides, and is never blind to other reviews, so an assessment that
 *     draws every reviewer's view together is theirs and nobody else's. A
 *     lead scores blind first and never sees one.
 *  2. `loadReview`, exactly as the review screen calls it, so whatever the
 *     screen would refuse (no such form, no sent application, the caller's
 *     own application) is refused here in the same words.
 *  3. What is sent is built from that payload alone (`input.ts`).
 *
 * Claude and Pangram are two parts, asked for one at a time, because each has
 * to finish inside the backend's 60-second request limit and Claude's part
 * takes most of it. The screen asks for both.
 */

const ONLY_ADMINS = "Only an admin can ask for an assessment.";

type Raw = Record<string, unknown>;

const asRecord = (value: unknown): Raw =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};

function assessmentRef(db: Firestore, roundId: string, uid: string) {
  return db.collection(ASSESSMENTS_COLLECTION).doc(admissionAssessmentId(roundId, uid));
}

function storedReadOf(data: Raw, programmeId: string): StoredClaudeRead | null {
  const read = asRecord(own(asRecord(data.claude), programmeId));
  return typeof read.summary === "string" && typeof read.lean === "string"
    ? (read as unknown as StoredClaudeRead)
    : null;
}

function storedPangramOf(data: Raw): PangramCheck | null {
  const check = asRecord(data.pangram);
  return Array.isArray(check.answers) ? (check as unknown as PangramCheck) : null;
}

/** A stored read with first names where Claude wrote "Reviewer A". */
async function shownRead(db: Firestore, stored: StoredClaudeRead): Promise<ClaudeRead> {
  const uids = Object.values(stored.reviewerUids ?? {}).filter((uid): uid is string => Boolean(uid));
  const staffNames = await loadStaffNames(db, uids);
  const names: Record<string, string> = {};
  for (const [label, uid] of Object.entries(stored.reviewerUids ?? {})) {
    if (uid) names[label] = staffNames.get(uid) ?? UNNAMED_STAFF;
  }
  const named = (text: string) => withNames(text, names);
  return {
    lean: stored.lean,
    leanReason: named(stored.leanReason),
    summary: named(stored.summary),
    strengths: stored.strengths.map(named),
    concerns: stored.concerns.map(named),
    reviewers: named(stored.reviewers),
    fit: named(stored.fit),
    toWeigh: stored.toWeigh.map(named),
    thinAnswers: stored.thinAnswers.map(named),
    model: stored.model,
    at: stored.at,
  };
}

async function viewOf(
  db: Firestore,
  user: SessionUser,
  review: ReviewPayload,
  data: Raw,
): Promise<AssessmentView> {
  const stored = storedReadOf(data, review.programme.id);
  return {
    claudeConfigured: claudeConfigured(),
    pangramConfigured: pangramConfigured(),
    claude: stored ? await shownRead(db, stored) : null,
    claudeOutOfDate: stored ? stored.fingerprint !== assessmentInputFrom(review, user.uid).fingerprint : false,
    pangram: storedPangramOf(data),
  };
}

type Gated = { ok: true; review: ReviewPayload } | Refusal;

async function gate(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  uid: string,
  programmeId: string | null,
): Promise<Gated> {
  if (!canRunTerm(user)) return refuse(403, ONLY_ADMINS);
  const loaded = await loadReview(db, user, roundId, uid, programmeId);
  if (!loaded.ok) return loaded;
  return { ok: true, review: loaded.review };
}

export type AssessmentResult = { ok: true; assessment: AssessmentView } | Refusal;

/** What has already been made of one application, for its review screen. */
export async function loadAssessment(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  uid: string,
  programmeId: string | null,
): Promise<AssessmentResult> {
  const gated = await gate(db, user, roundId, uid, programmeId);
  if (!gated.ok) return gated;
  const snap = await assessmentRef(db, roundId, uid).get();
  return { ok: true, assessment: await viewOf(db, user, gated.review, asRecord(snap.data())) };
}

/** Under `PANGRAM_MIN_WORDS`: answers somebody typed that are too short to check. */
function shortAnswerCount(review: ReviewPayload): number {
  let count = 0;
  const motivation = review.applicant.about.motivation;
  if (motivation.trim() && wordCount(motivation) < PANGRAM_MIN_WORDS) count += 1;
  for (const section of review.sections) {
    for (const answer of section.answers) {
      if (answer.answered && answer.text && wordCount(answer.text) < PANGRAM_MIN_WORDS) count += 1;
    }
  }
  return count;
}

/** Pangram on every long answer, four at a time, all inside one deadline. */
async function checkLongAnswers(answers: readonly LongAnswer[]): Promise<Omit<PangramCheck, "tooShort" | "at">> {
  const deadline = Date.now() + 45_000;
  const checked: PangramAnswer[] = [];
  const failed: PangramCheck["failed"] = [];
  const queue = [...answers];
  const worker = async () => {
    for (let answer = queue.shift(); answer; answer = queue.shift()) {
      const result = await checkWriting(answer.text, deadline);
      if (result.ok) {
        checked.push({
          key: answer.key,
          question: answer.question,
          words: answer.words,
          ...result.reading,
          worthALook: worthALook(result.reading),
        });
      } else {
        failed.push({ key: answer.key, question: answer.question, reason: result.reason });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, answers.length) }, worker));
  const order = new Map(answers.map((answer, i) => [answer.key, i]));
  const byOrder = (a: { key: string }, b: { key: string }) => (order.get(a.key) ?? 0) - (order.get(b.key) ?? 0);
  return { answers: checked.sort(byOrder), failed: failed.sort(byOrder) };
}

/** Ask Claude or Pangram, keep what came back, and answer with the screen's view. */
export async function runAssessmentPart(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  uid: string,
  programmeId: string | null,
  part: AssessmentPart,
): Promise<AssessmentResult> {
  const gated = await gate(db, user, roundId, uid, programmeId);
  if (!gated.ok) return gated;
  const { review } = gated;
  const input = assessmentInputFrom(review, user.uid);
  const ref = assessmentRef(db, roundId, uid);
  const at = new Date().toISOString();

  if (part === "claude") {
    if (!claudeConfigured()) return refuse(409, "Claude isn’t set up on this site yet.");
    const answer = await askForClaudeRead(input.message);
    if (!answer.ok) return refuse(500, answer.reason);
    const stored: StoredClaudeRead = {
      ...answer.read,
      at,
      fingerprint: input.fingerprint,
      reviewerUids: input.reviewerUids,
    };
    await ref.set(
      { roundId, uid, claude: { [review.programme.id]: stored }, updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } else {
    if (!pangramConfigured()) return refuse(409, "Pangram isn’t set up on this site yet.");
    const checked = await checkLongAnswers(input.longAnswers);
    const check: PangramCheck = { ...checked, tooShort: shortAnswerCount(review), at };
    await ref.set({ roundId, uid, pangram: check, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  const snap = await ref.get();
  return { ok: true, assessment: await viewOf(db, user, review, asRecord(snap.data())) };
}

export type MarksResult =
  | { ok: true; marks: Record<string, AssessmentMark>; configured: Record<AssessmentPart, boolean> }
  | Refusal;

/** Each application's marks on one programme's list, for an admin. */
export async function loadProgrammeMarks(
  db: Firestore,
  user: SessionUser,
  roundId: string,
  programmeId: string,
): Promise<MarksResult> {
  if (!canRunTerm(user)) return refuse(403, ONLY_ADMINS);
  const board = await loadProgrammeBoard(db, user, roundId, programmeId);
  if (!board.ok) return board;
  const uids = board.board.rows.map((row) => row.uid);
  const marks: Record<string, AssessmentMark> = {};
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((uid) => assessmentRef(db, roundId, uid));
    if (refs.length === 0) continue;
    for (const snap of await db.getAll(...refs)) {
      if (!snap.exists) continue;
      const data = asRecord(snap.data());
      const uid = typeof data.uid === "string" ? data.uid : "";
      if (!uids.includes(uid)) continue;
      const read = storedReadOf(data, programmeId);
      const pangram = storedPangramOf(data);
      marks[uid] = {
        lean: read?.lean ?? null,
        worthALook: pangram ? pangram.answers.filter((answer) => answer.worthALook).length : null,
      };
    }
  }
  return { ok: true, marks, configured: { claude: claudeConfigured(), pangram: pangramConfigured() } };
}
