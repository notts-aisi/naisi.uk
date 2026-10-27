import { RouteRefusal } from "../routeRefusal";

/**
 * WHAT A WEEK PAGE SAYS WHEN A TICK DID NOT SAVE, and the box has gone back.
 *
 * Three cases, told apart by what came back:
 *
 *  - A ROUTE REFUSED IT (week 1's door, for somebody holding a place before
 *    groups go out): the route's own sentence, as the reflection boxes say
 *    theirs. Somebody who gave their place back with week 1 open in a tab is
 *    told "Week 1 isn’t open to you yet.", never to check their connection.
 *  - THE DATABASE'S RULES REFUSED THE BROWSER'S OWN WRITE (everybody told
 *    their group ticks client-direct): the rules give no reason, and what
 *    changed is the page's picture of the person (they left, or were taken
 *    off the run, in another tab), so the page says to reload it.
 *  - NOTHING CAME BACK: the connection.
 *
 * Every line is listed in the build notes for the boards' designers to
 * confirm: no board draws a refused tick.
 */

/** No answer came back. */
export const TICK_NOT_SAVED = "That tick didn’t save, so it has been undone. Check your connection and try again.";

/** The rules refused the browser's own write. */
export const TICK_REFUSED_RELOAD = "That tick didn’t save, so it has been undone. Reload the page.";

/** What the page says for a tick that did not save, from what its write threw. */
export function tickNotSavedWords(err: unknown): string {
  if (err instanceof RouteRefusal) return err.message;
  if (typeof err === "object" && err !== null && (err as { code?: unknown }).code === "permission-denied") {
    return TICK_REFUSED_RELOAD;
  }
  return TICK_NOT_SAVED;
}
