import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { admissionAssessmentId, ASSESSMENTS_COLLECTION } from "@/lib/firestore/admissionAssessments";
import { storedReadFor } from "../assessment/stored";
import type { ReadNote } from "./advice";

/**
 * CLAUDE'S AND PANGRAM'S EARLIER READS OF AN APPLICATION, for an admin: the
 * one reader Circles, an arrangement and a person's page under a programme
 * share. It asks nobody who is reading, so every caller decides first that
 * the reader is an admin (the policy: what Claude and Pangram return is seen
 * by admins only). Kept apart from `./advise.ts` so a page that reads these
 * does not take in everything an arrangement needs.
 */

export type Note = { read: ReadNote; flags: number | null };

/** Claude's earlier read for this programme, and how many answers Pangram thought worth a look, for each person. */
export async function notesFor(db: Firestore, roundId: string, programmeId: string, uids: readonly string[]): Promise<Map<string, Note>> {
  const notes = new Map<string, Note>();
  for (let i = 0; i < uids.length; i += 100) {
    const refs = uids.slice(i, i + 100).map((uid) => db.collection(ASSESSMENTS_COLLECTION).doc(admissionAssessmentId(roundId, uid)));
    if (refs.length === 0) continue;
    for (const snap of await db.getAll(...refs)) {
      const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
      const uid = typeof data?.uid === "string" ? data.uid : "";
      if (!data || !uids.includes(uid)) continue;
      const read = storedReadFor(data, programmeId);
      // A check with an answer Pangram could not take is not a check.
      const pangram = data.pangram as { answers?: unknown; failed?: unknown } | null | undefined;
      const flags =
        pangram && Array.isArray(pangram.answers) && !(Array.isArray(pangram.failed) && pangram.failed.length > 0)
          ? (pangram.answers as { worthALook?: unknown }[]).filter((answer) => answer?.worthALook === true).length
          : null;
      notes.set(uid, {
        read:
          read && typeof read.summary === "string"
            ? {
                lean: read.lean ?? null,
                summary: read.summary,
                strengths: Array.isArray(read.strengths) ? read.strengths : [],
                concerns: Array.isArray(read.concerns) ? read.concerns : [],
                thin: Array.isArray(read.thinAnswers) ? read.thinAnswers.length : 0,
              }
            : null,
        flags,
      });
    }
  }
  return notes;
}
