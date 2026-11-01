import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { COURSE_FEEDBACK_COLLECTION, normalizeCourseFeedback, type CourseFeedbackDoc } from "@/lib/firestore/courseFeedback";
import { firstNameOfUser, fullNameOfUser } from "../programmeLead";
import type { CardNames, CardRole } from "./model";

/**
 * THE READS BEHIND FEEDBACK'S CARDS, on the server, each after its caller's
 * own gate: the pieces on one week of a run, on a whole run, or about one
 * person, and the names the cards sign them with.
 *
 * Every query is equalities only (one on `runId`, with `weekId` or `uid`
 * beside it), filtered again in memory, so nothing needs a declared index.
 */

function piecesOf(docs: ReadonlyArray<{ id: string; data: () => unknown }>, keep: (piece: CourseFeedbackDoc) => boolean): CourseFeedbackDoc[] {
  return docs
    .map((doc) => normalizeCourseFeedback(doc.id, (doc.data() ?? {}) as Record<string, unknown>))
    .filter(keep);
}

/** Every piece on one week of a run, everybody's. */
export async function readWeekFeedback(db: Firestore, runId: string, weekId: string): Promise<CourseFeedbackDoc[]> {
  const snap = await db.collection(COURSE_FEEDBACK_COLLECTION).where("runId", "==", runId).where("weekId", "==", weekId).get();
  return piecesOf(snap.docs, (piece) => piece.runId === runId && piece.weekId === weekId);
}

/** Every piece on a run, everybody's and every week's. */
export async function readRunFeedback(db: Firestore, runId: string): Promise<CourseFeedbackDoc[]> {
  const snap = await db.collection(COURSE_FEEDBACK_COLLECTION).where("runId", "==", runId).get();
  return piecesOf(snap.docs, (piece) => piece.runId === runId);
}

/** Every piece about one person on a run: theirs alone, by their uid. */
export async function readOwnFeedback(db: Firestore, runId: string, uid: string): Promise<CourseFeedbackDoc[]> {
  const snap = await db.collection(COURSE_FEEDBACK_COLLECTION).where("uid", "==", uid).where("runId", "==", runId).get();
  return piecesOf(snap.docs, (piece) => piece.runId === runId && piece.uid === uid);
}

/** The names cards are signed with, for these writers: one read of their accounts. A name not on record is "". */
export async function cardNamesOf(db: Firestore, uids: Iterable<string>): Promise<CardNames> {
  const wanted = [...new Set([...uids].filter(Boolean))];
  const first = new Map<string, string>();
  const full = new Map<string, string>();
  for (const snap of wanted.length ? await db.getAll(...wanted.map((uid) => db.collection("users").doc(uid))) : []) {
    if (!snap.exists) continue;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    full.set(snap.id, fullNameOfUser(data));
    first.set(snap.id, firstNameOfUser(data) || fullNameOfUser(data));
  }
  return { firstName: (uid) => first.get(uid) ?? "", fullName: (uid) => full.get(uid) ?? "" };
}

/**
 * Who signs feedback given before pieces existed, which stored no role: one
 * of the person's group's facilitators signs as their facilitator, anybody
 * else as the team.
 */
export function legacyRoleOf(byUid: string, groupFacilitatorUids: readonly string[]): CardRole {
  return byUid && groupFacilitatorUids.includes(byUid) ? "facilitator" : "admin";
}
