import { PEOPLE_FILTERS, type PeopleCounts, type PeopleFilter, type PersonRow } from "./views";

/**
 * WHO IS UNDER EACH OF THE PEOPLE TAB'S FILTERS: the one function.
 *
 * The server counts each filter with it (the numbers on the buttons, and the
 * sentence over the table), and the table in the browser filters its rows
 * with it, so a filter's number is always the number of rows it shows.
 *
 *  - Everyone: everybody who holds a place or gave it back (the board's 32 is
 *    its 30 and its 2). Somebody invited and not answered yet is neither,
 *    and is under Invited alone.
 *  - Coming and Haven't said: the people holding a place, split by whether
 *    they have said they are coming (`comingReplyOf`, the one reading of the
 *    reply). The two always add up to the people holding a place.
 *  - Not said when they're free: the people holding a place who sent no week.
 *  - Gave their place back, and Invited: those two kinds of person.
 *
 * Pure, with type-only imports, so the server and the browser share it.
 */
export function rowMatches(row: Pick<PersonRow, "category" | "coming" | "free">, filter: PeopleFilter): boolean {
  switch (filter) {
    case "everyone":
      return row.category !== "invited";
    case "coming":
      return row.category === "holding" && row.coming.kind === "yes";
    case "havent-said":
      return row.category === "holding" && row.coming.kind !== "yes";
    case "not-said-free":
      return row.category === "holding" && row.free.kind === "not-said";
    case "gave-back":
      return row.category === "gave-back";
    case "invited":
      return row.category === "invited";
  }
}

/** Every filter's count, by `rowMatches`. */
export function countRows(rows: readonly Pick<PersonRow, "category" | "coming" | "free">[]): PeopleCounts {
  const counts = {} as PeopleCounts;
  for (const filter of PEOPLE_FILTERS) counts[filter] = rows.filter((row) => rowMatches(row, filter)).length;
  return counts;
}

/**
 * Does the search match this row: every word typed, in the name or the
 * degree line, ignoring case and accents. An empty search matches everybody.
 */
export function rowMatchesSearch(row: Pick<PersonRow, "name" | "detail">, search: string): boolean {
  const fold = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const words = fold(search).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fold(`${row.name} ${row.detail}`);
  return words.every((word) => haystack.includes(word));
}
