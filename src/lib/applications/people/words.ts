import type { PeopleFilter, PersonComing, PersonFree, PersonStatus } from "./views";

/**
 * THE WORDS OF A PROGRAMME'S PEOPLE TAB (board st-people), in one place.
 *
 * The board's own words are kept exactly, apostrophes included; every name,
 * date, group and count in them is a slot the server fills from a record.
 * Words the board does not draw (an invitation's line, somebody who left the
 * run, the page before decisions go out, an empty filter) are written in the
 * same voice and listed in the build notes for the boards' designers to
 * confirm.
 *
 * No gendered pronoun, and no dash of either kind. Pure, so the server, the
 * table in the browser and the tests read the same sentences.
 */

/** The filters' own words, in the board's order. */
export const FILTER_LABEL: Readonly<Record<PeopleFilter, string>> = {
  everyone: "Everyone",
  coming: "Coming",
  "havent-said": "Haven’t said",
  "not-said-free": "Not said when they’re free",
  "gave-back": "Gave their place back",
  invited: "Invited",
};

/** The group of filters, for assistive technology: the board's own label. */
export const FILTERS_LABEL = "Show";

/** The table's caption, read by assistive technology. */
export const TABLE_CAPTION = "Everyone who holds a place or gave it back";

/** The columns, in the board's order. "More" is read, not shown. */
export const COLUMNS = {
  name: "Name",
  group: "Group",
  coming: "Coming?",
  free: "When they’re free",
  status: "Status",
  more: "More",
} as const;

export const SEARCH_LABEL = "Search names or degrees";

/** The line beside the search: what a lead is and is not shown. */
export const WHO_SEES =
  "Leads see names, degrees and replies. Email addresses and access requirements stay with admins.";

export const NOT_IN_A_GROUP = "Not in a group";
export const SHOW_MORE = "Show more";

/** How many rows are drawn before "Show more", and how many more each press shows. */
export const PAGE_SIZE = 12;

/** "Showing 12 of 32". */
export function showingWords(shown: number, of: number): string {
  return `Showing ${shown} of ${of}`;
}

/** "30 hold a place; 2 gave theirs back." The board's sentence, from the two counts. */
export function placesSentence(holding: number, gaveBack: number): string {
  if (holding === 0 && gaveBack === 0) return "Nobody holds a place yet.";
  const held = `${holding} ${holding === 1 ? "holds" : "hold"} a place`;
  return gaveBack === 0 ? `${held}.` : `${held}; ${gaveBack} gave theirs back.`;
}

/** "Yes, Mon 26 Oct", "Not yet", "No". */
export function comingWords(coming: PersonComing): string {
  if (coming.kind === "yes") return coming.on ? `Yes, ${coming.on}` : "Yes";
  return coming.kind === "not-yet" ? "Not yet" : "No";
}

/** "Fits A, B, D", "Fits none of the 4 times", "Not said". */
export function freeWords(free: PersonFree): string {
  switch (free.kind) {
    case "fits":
      return `Fits ${free.tags.join(", ")}`;
    case "fits-none":
      return `Fits none of the ${free.times === 1 ? "1 time" : `${free.times} times`}`;
    case "not-said":
      return "Not said";
    case "no-times":
      return "No group times yet";
  }
}

/** The Status column's chip. */
export function statusWords(status: PersonStatus): string {
  switch (status.kind) {
    case "holding":
      return "Holding a place";
    case "gave-back":
      return "Gave their place back";
    case "left":
      return "Left the programme";
    case "invited":
      return "Invited";
  }
}

/** The line under an invitation's chip: "Has until Thu 29 Oct". */
export function invitedUntilWords(until: string): string {
  return `Has until ${until}`;
}

/** What the More menu calls each thing it offers, by the person's first name. */
export function seeApplicationWords(firstName: string): string {
  return `See ${firstName}’s application`;
}

export const OPEN_PEOPLE_IN_GROUPS = "Open People in groups";

/** "More for Amara Okafor": the button's accessible name, the board's. */
export function moreForWords(name: string): string {
  return `More for ${name}`;
}

/** Said in the table when a filter or a search leaves nobody. */
export const NOBODY_HERE = "Nobody here.";

/** Said in place of the table before decisions go out. */
export function notSentWords(programmeName: string): string {
  return `Nobody holds a place on ${programmeName} until decisions go out. Everyone who does, and everyone who gives a place back, is listed here from then.`;
}

/** The refusal's words, for a reviewer: the tab is the lead's and an admin's. */
export const NOT_YOURS_TITLE = "Only the programme’s lead and admins can open People";
export const NOT_YOURS_WHY =
  "People lists everyone who holds a place or gave it back, by name, with their replies and when they’re free, so only the programme’s lead or an admin can open it.";
