/**
 * Where a run's week keeps its in-place editing records, both server-only
 * subcollections of `courseRuns/{runId}/weeks/{weekId}`:
 *  - `history/{saveId}`: one record per save of the week (`history.ts`);
 *  - `editLock/current`: who is editing the week now (`lock.ts`).
 *
 * No imports, so the run's destroy cascade (`src/lib/firestore/courseDeletion.ts`)
 * and the end-to-end fixtures can name them without loading the editor.
 */
export const WEEK_HISTORY_SUBCOLLECTION = "history";
export const WEEK_LOCK_SUBCOLLECTION = "editLock";
export const WEEK_LOCK_DOC = "current";
