import type { ApplicationRow } from "@/lib/applications/review/types";

/**
 * What the applications list shows for a given set of filters.
 *
 * The route sends every row the caller may see, in its default order, and
 * the list filters, searches and sorts them here in the browser. Pure, so the
 * same functions are executed by the tests.
 */

export type StatusFilter = "all" | "to-review" | "accepted" | "pooled" | "declined";

export type SortKey = "newest" | "oldest" | "name" | "score";

export const SORT_LABEL: Record<SortKey, string> = {
  newest: "Sort: newest first",
  oldest: "Sort: oldest first",
  name: "Sort: name, A to Z",
  score: "Sort: highest score first",
};

/** How the footer names the order: "Showing 14 of 57, newest first". */
export const SORT_WORDS: Record<SortKey, string> = {
  newest: "newest first",
  oldest: "oldest first",
  name: "by name",
  score: "highest score first",
};

export type ListQuery = {
  status: StatusFilter;
  search: string;
  firstChoiceOnly: boolean;
  facilitatingOnly: boolean;
  sort: SortKey;
  /** A group picked from the recommendations, or null for everybody. */
  group: readonly string[] | null;
};

export const DEFAULT_QUERY: ListQuery = {
  status: "all",
  search: "",
  firstChoiceOnly: false,
  facilitatingOnly: false,
  sort: "newest",
  group: null,
};

/** How many rows the list shows before "Show more", and how many each press adds. */
export const PAGE_SIZE = 14;

function matchesStatus(row: ApplicationRow, status: StatusFilter): boolean {
  if (status === "all") return true;
  // "To review" is what the programme still owes: somebody a higher choice
  // has accepted is undecided here and is not waiting on anybody.
  if (status === "to-review") return row.standing === "to-review" && row.owesDecision;
  return row.standing === status;
}

const byName = (a: ApplicationRow, b: ApplicationRow) =>
  a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid);

const COMPARE: Record<SortKey, (a: ApplicationRow, b: ApplicationRow) => number> = {
  newest: (a, b) => (b.appliedAt ?? "").localeCompare(a.appliedAt ?? "") || byName(a, b),
  oldest: (a, b) => (a.appliedAt ?? "").localeCompare(b.appliedAt ?? "") || byName(a, b),
  name: byName,
  // Unscored applications go last, whichever way the scores run.
  score: (a, b) => (b.scoreValue ?? -1) - (a.scoreValue ?? -1) || byName(a, b),
};

export function filterRows(rows: readonly ApplicationRow[], query: ListQuery): ApplicationRow[] {
  const words = query.search.toLowerCase().split(/\s+/).filter(Boolean);
  const group = query.group ? new Set(query.group) : null;
  return rows
    .filter((row) => {
      if (!matchesStatus(row, query.status)) return false;
      if (query.firstChoiceOnly && row.choice !== 1) return false;
      if (query.facilitatingOnly && !row.wantsToFacilitate) return false;
      if (group && !group.has(row.uid)) return false;
      return words.every((word) => row.searchText.includes(word));
    })
    .sort(COMPARE[query.sort]);
}

/** "1 is" or "6 are": the verb a count takes. */
export function isOrAre(count: number): string {
  return count === 1 ? "is" : "are";
}
