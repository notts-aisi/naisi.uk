import type { AdmissionApplicationCounts } from "@/lib/firestore/admissionRounds";

/**
 * WHEN THE QUESTIONS LOCK.
 *
 * Questions lock once anybody has sent an application. Editing a question set
 * after that would change what an answer already given was an answer to, so a
 * set cannot be edited, reordered or deleted from then on, and the form stops
 * being able to drop the facilitating question.
 *
 * The decision is taken from the round's own `applicationCounts`, which move
 * in the same transaction as each application's status. The routes that write
 * a question set read the round inside their own transaction, so a send that
 * lands while a set is being saved makes that save start again and meet the
 * lock.
 *
 * Pure, so the editor's routes, its pages and the browser all ask the same
 * function.
 */

/**
 * How many people have sent an application to this form.
 *
 * Every status but `draft`. Each of the others is reached from a sent
 * application, with one exception this counts on purpose: a draft that was
 * withdrawn is counted too, because the counter cannot tell it from an
 * application that was sent first. Locking a little early costs nothing that
 * cannot be put right; an edit under an answer of record cannot be put right
 * at all.
 */
export function sentCount(counts: AdmissionApplicationCounts): number {
  let total = 0;
  for (const [status, count] of Object.entries(counts)) {
    if (status !== "draft" && typeof count === "number" && count > 0) total += count;
  }
  return total;
}

/** True once anybody has sent an application. */
export function questionsLocked(counts: AdmissionApplicationCounts): boolean {
  return sentCount(counts) > 0;
}

/** "57 people have applied, so the questions are locked." */
export function lockedSentence(applied: number): string {
  return applied === 1
    ? "1 person has applied, so the questions are locked."
    : `${applied} people have applied, so the questions are locked.`;
}
