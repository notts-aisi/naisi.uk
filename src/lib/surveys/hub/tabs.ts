/**
 * RUN NAISI › SURVEYS' THREE TABS, by their addresses: By programme is the
 * page's own, Events is the same page asked for `?tab=events`, and Question
 * sets (the questions each kind of survey starts with) for
 * `?tab=question-sets`. One page, so one gate and one entry in every registry
 * of pages.
 *
 * Pure, with no imports, so a survey's own head (drawn inside a browser's
 * bundle too) can lead back to the tab its survey is on.
 */

/** Which tab the page shows. */
export type HubTab = "programmes" | "events" | "question-sets";

/** The tab an address asks for: `?tab=events`, `?tab=question-sets`, or By programme for anything else. */
export function hubTabOf(asked: unknown): HubTab {
  return asked === "events" || asked === "question-sets" ? asked : "programmes";
}

/** The address of a tab. */
export function hubTabHref(tab: HubTab): string {
  return tab === "programmes" ? "/admin/surveys" : `/admin/surveys?tab=${tab}`;
}
