import "server-only";
import { closesAtInstant } from "./definition";
import { readState, stageAt, surveyDb } from "./store";

/**
 * Whether the AI at Nottingham survey has closed, for the page that draws its
 * start screen.
 *
 * The page a printed code lands on must not wait on a slow datastore, and
 * must not fail with it. So the answer is given within a deadline, and when
 * the stage cannot be read in time the calendar decides: closed once the
 * closing time has passed, open before. The routes check the stage again for
 * themselves, so a start screen shown in error starts nothing.
 */
const DEADLINE_MS = 2500;

export async function surveyIsClosed(now: number = Date.now()): Promise<boolean> {
  const byCalendar = now >= closesAtInstant().getTime();
  const db = surveyDb();
  if (!db) return byCalendar;
  try {
    const state = await Promise.race([
      readState(db),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), DEADLINE_MS)),
    ]);
    if (!state) return byCalendar;
    return stageAt(state, now).stage === "closed";
  } catch {
    return byCalendar;
  }
}
