/**
 * PUBLISH'S PRESS LOCK, by name and by age: the document a press of Publish
 * holds while it works (`courseNudges/publishing__<runId>`), and how long a
 * hold counts before another press may take it. Its own file, with no
 * imports, so that what has to know whether a Publish is under way (the
 * run's details on a programme's Settings, which refuse a new start date
 * while one is) can ask without importing Publish and everything it sends.
 * `allocationPublish.ts` takes and gives the lock, and re-exports both.
 */

/** How long a press in progress holds the run before another may take it. */
export const PRESS_STALE_MS = 5 * 60_000;

export function pressLockId(runId: string): string {
  return `publishing__${runId}`;
}
