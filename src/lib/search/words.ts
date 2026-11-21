/**
 * THE WORDS OF SEARCH, for the people who run things: admins, a programme's
 * lead and a group's facilitator. No member sees any of them, because the box
 * is drawn for nobody else.
 *
 * Client safe: the box, the route and the tests read the same words.
 */

/** The box's label, its button's words and the dialog's name. */
export const SEARCH_LABEL = "Search people and groups";

/** The key that opens it, drawn on the button. */
export const SEARCH_KEY = "/";

/**
 * The lists' headings. Guides is drawn only when a facilitator guide matched,
 * for somebody who facilitates (`src/lib/search/model.ts`).
 */
export const SEARCH_HEADINGS = { people: "People", groups: "Groups", guides: "Guides" } as const;

/** The line under the results. */
export const SEARCH_HELP = "Up and down to move, Enter to open, Esc to close. Press / anywhere to search.";

/** Before anything is asked. */
export const SEARCH_TYPE_MORE = "Type two letters or more.";

/** While the answer is on its way. */
export const SEARCH_WAITING = "Searching…";

/** Nobody matched. The same words whether nobody holds the name or nobody the reader may see does. */
export function noPeopleWords(query: string): string {
  return `Nobody’s name matches “${query.trim()}”.`;
}

/** No group matched. */
export function noGroupsWords(query: string): string {
  return `No group matches “${query.trim()}”.`;
}

/** More matched than the list holds. */
export const SEARCH_MORE = {
  people: "More people match. Type more of the name.",
  groups: "More groups match. Type more of the name.",
} as const;

/** What the route answers, and what the box says when it cannot ask. */
export const SEARCH_REFUSAL = {
  /**
   * Everybody the route does not answer, signed in or not: one answer, so
   * nobody learns from it whether they are signed in as somebody who runs
   * nothing, or anything about anybody else.
   */
  notYours: "Search isn’t available.",
  notConfigured: "Search isn’t set up on this copy of the site.",
  badQuery: "That isn’t something search can look for.",
  tooMany: "That’s a lot of searches in a short time. Wait a minute, then try again.",
  failed: "Search isn’t working just now. Try again in a moment.",
} as const;
