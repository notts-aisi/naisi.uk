/**
 * WHETHER A WEEK IS READY (board pr-weeks, Q35): the one answer, for every
 * page and route that asks.
 *
 * Ready is the lead's word that a week is finished, stored on the RUN's week
 * by one route (`PUT /api/courses/runs/[runId]/weeks/[weekId]/ready`, for the
 * programme's lead and admins) and by nothing else: the rules keep every
 * browser off `ready`, `readyAt` and `readyByUid`. It counts only on a
 * PUBLISHED week, whoever wrote what, so a week taken down is not ready
 * however it was marked (`normalizeCourseWeek` reads it the same way).
 * Marking a week ready publishes it in the same write (Zach, 26 October
 * 2026), and a week with nothing in it cannot be marked.
 *
 * WHAT IT OPENS. Week 1, to everybody holding a place, before groups go out
 * (Q35 B: `src/lib/courses/weekOne/door.ts`). After groups go out every week
 * opens on Published, as it always has (`weekOpening.ts`), so a week that is
 * published and not ready still opens to its groups.
 *
 * Who asks: week 1's door, the programme's Overview ("Week 1 isn’t ready"),
 * the run's week editor, the lead's list of weeks (`weekReadiness` in
 * `weekBlocks/reader.ts`), and the readiness check and checklist that come
 * later. Each asks this function and nothing else, so no page can count a
 * week ready that another page counts not ready.
 *
 * Pure, with no server import, so a page and a route ask the same function.
 */
export function weekIsReady(week: { published?: boolean; ready?: boolean } | null | undefined): boolean {
  return week !== null && week !== undefined && week.published === true && week.ready === true;
}

/** pr-weeks' words for the press. */
export const MARK_READY = "Mark ready";

/**
 * Taking it back. The boards draw nothing for it: listed in the build notes
 * for the boards' designers to confirm.
 */
export const NOT_READY = "Not ready";

/** pr-weeks' line beside the weeks: what Ready opens, and what it does not. */
export const READY_OPENS =
  "Week 1 opens to everyone holding a place once it’s marked ready. Each later week opens to a group straight after its previous session.";
