import { weekReadiness, type ReadableWeek } from "./weekBlocks/reader";
import { weekIsReady } from "./weekReady";

/**
 * WHAT IS SAID ABOUT WEEK 1 BEFORE ANY GROUP HAS MET: the one line, for every
 * page that says it.
 *
 * Week 1 opens to everybody holding a place once it is marked ready (Q35 B),
 * so until a group has met, the programme's lead is told whether it is,
 * through the one answer (`weekIsReady`), and what stands in the way. Three
 * readers say it, and each says exactly this:
 *
 *  - the Overview once the run is under way says "Week 1 isn’t ready" under
 *    Needs attention (`buildProgrammeOverview`);
 *  - the Overview before the start says it on the checklist's "Write week 1"
 *    (`src/lib/courses/getReady/model.ts`);
 *  - Publish's own page says it under "Worth checking".
 *
 * Marking a week ready publishes it in the same write (Zach, 26 October
 * 2026), and a week with nothing in it cannot be marked: so "Mark ready" is
 * offered once week 1 holds something, published or not, and while it has no
 * page or nothing in it the way to its page on the Weeks tab is offered, where
 * its Markdown is pasted.
 *
 * Pure, with no server import, so the server and a test ask the same thing.
 */

export type WeekOneLine =
  | { ready: true }
  | {
      ready: false;
      /** What stands in the way, in a sentence. */
      detail: string;
      /** The way to week 1's page on the Weeks tab is offered: it has no page, or nothing in it. */
      open: boolean;
      /** "Mark ready" is offered: it holds something. */
      markReady: boolean;
    };

/** The title of the Overview's item. */
export const WEEK_ONE_NOT_READY = "Week 1 isn’t ready";

/** The link to week 1's page, while it has no page or nothing in it. */
export const OPEN_WEEK_ONE = "Open week 1";

export function weekOneLine(week: (ReadableWeek & { published?: boolean; ready?: boolean }) | null): WeekOneLine {
  if (weekIsReady(week)) return { ready: true };
  const empty = !week || weekReadiness(week) === "empty";
  return {
    ready: false,
    detail: !week
      ? "Week 1 has no page yet. Paste its Markdown on the Weeks tab, then mark it ready."
      : empty
        ? "Week 1 has nothing in it yet. Paste its Markdown on the Weeks tab, then mark it ready."
        : !week.published
          ? "Week 1 isn’t published yet: marking it ready publishes it, and everyone holding a place can open it."
          : "Everyone holding a place can open week 1 once it’s marked ready.",
    open: empty,
    markReady: !empty,
  };
}
