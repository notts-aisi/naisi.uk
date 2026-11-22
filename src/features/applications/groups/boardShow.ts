/**
 * HOW PEOPLE IN GROUPS IS SHOWN: as Columns (the allocation board's columns,
 * which a link with no choice in it opens) or as Rings (each group drawn as
 * a ring round its time, with the same toolbar, counts, panel, moves and
 * Publish).
 *
 * THE CHOICE LIVES IN THE PAGE'S ADDRESS AND NOWHERE ELSE: `?show=rings`. No
 * key in the browser's storage, no cookie and no stored field remembers it,
 * so a reload and a shared link keep it, and the Groups tab's own links carry
 * it on (`withShow`). Anything but the one word, a list of words included,
 * opens Columns.
 *
 * Pure, so the server pages, the board in the browser and the tests read the
 * same answer.
 */

export type BoardShow = "columns" | "rings";

/** The address's own name for the choice. */
export const SHOW_PARAM = "show";

/** What an address's `?show=` asks for: Rings only for the one word, Columns for anything else. */
export function boardShowOf(value: unknown): BoardShow {
  return value === "rings" ? "rings" : "columns";
}

/** An address of the Groups tab, carrying the choice on: Columns adds nothing, so a plain link opens Columns. */
export function withShow(href: string, show: BoardShow | undefined): string {
  if (show !== "rings") return href;
  return `${href}${href.includes("?") ? "&" : "?"}${SHOW_PARAM}=rings`;
}
