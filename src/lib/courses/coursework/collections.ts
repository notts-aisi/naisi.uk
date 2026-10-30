/**
 * The two records Claude and Pangram leave on a run (privacy v13), named once
 * for their writers (`bestAnswers.ts`, `pangram.ts`) and their two deleters
 * (an account's, `accountDeletion.ts`, and a run's, `courseDeletion.ts`).
 * Pure: safe anywhere.
 */

/** `courseBestAnswers/{runId}__{weekId}`: Claude's pick of one week's strongest answers. */
export const BEST_ANSWERS_COLLECTION = "courseBestAnswers";

/** `coursePangramChecks/{runId}__{uid}`: Pangram's readings of one person's answers on one run. */
export const PANGRAM_CHECKS_COLLECTION = "coursePangramChecks";
