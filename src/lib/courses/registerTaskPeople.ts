import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { readRunLead, type RunLead } from "@/lib/courses/runLead";
import { registerTaskCompleters } from "@/lib/courses/unmarkedRegisters";
import { TASK_FIELD_LIMITS } from "@/lib/firestore/tasks";

/**
 * WHO A REGISTER TASK GOES TO: the lead of the programme that names the run,
 * and every admin.
 *
 * Read by the two jobs that mint register cards (the unfinished register's
 * and the held next-week email's), so the two always land on the same boards.
 */

/**
 * Every admin uid, sorted, capped at `TASK_FIELD_LIMITS.maxCompleters`.
 *
 * The cap is the tasks rules': `completerUids.size() <= 10` on both the create
 * and the committee update lane. A task minted with eleven completers would be
 * one no SU-committee member could ever edit, so an eleventh admin would
 * quietly make every card admin-only to change. Sorted so the ten are the same
 * ten on every tick, and the overflow is logged rather than hidden.
 */
export async function readAdminUids(db: Firestore, logTag: string): Promise<string[]> {
  const snap = await db
    .collection("users")
    .where("role", "==", "admin")
    // Ids only. Nothing here needs a profile field, and an admin's document is
    // the most PII-dense one this platform holds.
    .select()
    .get();
  const uids = snap.docs.map((doc) => doc.id).sort();
  if (uids.length > TASK_FIELD_LIMITS.maxCompleters) {
    console.warn(
      `[${logTag}] more admins than a task may carry; assigning the first`,
      TASK_FIELD_LIMITS.maxCompleters,
      "of",
      uids.length,
    );
  }
  return uids.slice(0, TASK_FIELD_LIMITS.maxCompleters);
}

export type RegisterTaskPeople = {
  /** The lead, then the admins, deduplicated and capped. */
  completerUids: string[];
  /** Who the card is filed as created by: the first admin, never "". */
  creatorUid: string;
  lead: RunLead | null;
};

/**
 * The people one run's register cards go to. `leads` caches each run's lead
 * for the length of one tick, so a run with several cards reads the forms
 * once. A run no programme names has no lead and its cards go to the admins.
 *
 * Null when there is no admin at all: a card needs a creator who is a real
 * account, and the admins are the one audience that is always somebody.
 */
export async function registerTaskPeople(
  db: Firestore,
  runId: string,
  adminUids: readonly string[],
  leads: Map<string, RunLead | null>,
): Promise<RegisterTaskPeople | null> {
  if (adminUids.length === 0) return null;
  if (!leads.has(runId)) leads.set(runId, await readRunLead(db, runId));
  const lead = leads.get(runId) ?? null;
  return {
    completerUids: registerTaskCompleters(
      lead?.uid ?? null,
      adminUids,
      TASK_FIELD_LIMITS.maxCompleters,
    ),
    creatorUid: adminUids[0],
    lead,
  };
}
