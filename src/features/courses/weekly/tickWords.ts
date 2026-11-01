import { RouteRefusal } from "../routeRefusal";

/**
 * WHAT A WEEK PAGE SAYS WHEN A TICK DID NOT SAVE, and the box has gone back.
 *
 * Three cases, told apart by what came back:
 *
 *  - THE TICK ROUTE REFUSED IT (every tick goes through it): the route's own
 *    sentence, as the reflection boxes say theirs. A week that locked while
 *    the page was open, or somebody who left the run in another tab, is told
 *    so, never to check their connection.
 *  - THE DATABASE'S RULES REFUSED A WRITE FROM THE BROWSER (a tab opened
 *    before ticks went through the route): the rules give no reason, so the
 *    page says to reload it.
 *  - NOTHING CAME BACK: the connection.
 *
 * Every line is listed in the build notes for the boards' designers to
 * confirm: no board draws a refused tick.
 */

/** No answer came back. */
export const TICK_NOT_SAVED = "That tick didn’t save, so it has been undone. Check your connection and try again.";

/** The rules refused a write from the browser. */
export const TICK_REFUSED_RELOAD = "That tick didn’t save, so it has been undone. Reload the page.";

/** What the page says for a tick that did not save, from what its write threw. */
export function tickNotSavedWords(err: unknown): string {
  if (err instanceof RouteRefusal) return err.message;
  if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "permission-denied") {
    return TICK_REFUSED_RELOAD;
  }
  return TICK_NOT_SAVED;
}
