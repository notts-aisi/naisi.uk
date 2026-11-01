/**
 * RUN NAISI › SURVEYS' TWO TABS, by their addresses: By programme is the
 * page's own, and Events is the same page asked for `?tab=events`. One page,
 * so one gate and one entry in every registry of pages.
 *
 * Pure, with no imports, so a survey's own head (drawn inside a browser's
 * bundle too) can lead back to the tab its survey is on.
 */

/** Which tab the page shows. */
export type HubTab = "programmes" | "events";

/** The tab an address asks for: `?tab=events`, or By programme for anything else. */
export function hubTabOf(asked: unknown): HubTab {
  return asked === "events" ? "events" : "programmes";
}

/** The address of a tab. */
export function hubTabHref(tab: HubTab): string {
  return tab === "events" ? "/admin/surveys?tab=events" : "/admin/surveys";
}
