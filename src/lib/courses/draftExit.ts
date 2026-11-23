import { sanitizeWeekPlan, weekDocId, type CourseRunStatus } from "@/lib/firestore/courses";

/**
 * LEAVING DRAFT IS A ONE-WAY DOOR FOR THE WEEK PLAN, and this is its last
 * check, asked by every way a run leaves draft: the status route
 * (`runStatusMove.ts`) and the first hand-over, which starts a draft run
 * running (`src/lib/applications/handover/handOver.ts`).
 *
 * Pure: a route and the hand-over share it, and a route may not import the
 * "use client" module (`courseMutations.weekAddressDrift()`) that computes
 * the same count for the builder's panel.
 */

/**
 * The number of taught slots whose plan `weekId` is not the id their own week
 * number resolves to.
 */
export function weekAddressDriftCount(rawPlan: unknown): number {
  let taught = 0;
  let drifted = 0;
  for (const entry of sanitizeWeekPlan(rawPlan)) {
    if (entry.kind !== "week") continue;
    taught += 1;
    if (entry.weekId !== weekDocId(taught)) drifted += 1;
  }
  return drifted;
}

/**
 * The refusal that makes the draft boundary mean something.
 *
 * A reorder in the week plan builder preserves each slot's `weekId` and
 * renumbers positionally, so the plan can say "slot 2 is week 2, document w05"
 * while every member-facing surface opens `weekDocId(2)`. That is reconcilable
 * for free in draft and nowhere else: the normalise route refuses outside
 * draft, and `weekPlanLockRespected()` in firestore.rules pins the plan for
 * non-admins from the same boundary. So a run allowed to leave draft with the
 * two spellings disagreeing has that mismatch frozen into it for the whole of
 * the cohort's life, and every learner opens a different document than the one
 * the admin arranged.
 *
 * The window to fix it is open right up to the move out of draft and shut
 * immediately after, which is exactly where the check belongs.
 */
export function draftExitBlocker(
  from: CourseRunStatus,
  to: CourseRunStatus,
  rawPlan: unknown,
  named = false,
): string | null {
  if (from !== "draft" || to === "draft") return null;
  const drifted = weekAddressDriftCount(rawPlan);
  if (drifted === 0) return null;
  const which = drifted === 1 ? "One week is" : `${drifted} weeks are`;
  // On a run a programme names the plan is changed only on the programme's
  // Weeks tab (`src/lib/courses/weekPlanEdit/`), where a plan out of step with
  // its pages offers Match the plan to the pages, which rewrites the plan to
  // the pages people see, moves no page and deletes nothing; the older
  // editor's builder is words pointing there. Anywhere else the builder's
  // Normalise week ids is the press.
  if (named) {
    return `${which} listed under another week’s page in this run’s week plan, and leaving draft would keep it that way for good. Press Match the plan to the pages on the programme’s Weeks tab first: it moves no page and deletes nothing.`;
  }
  return `${which} addressed two different ways in this run's week plan, and leaving draft freezes that for good. Open the run's Week plan section and use Normalise week ids first.`;
}
