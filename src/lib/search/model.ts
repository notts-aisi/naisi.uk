/**
 * SEARCH FOR A PERSON OR A GROUP: the pure half.
 *
 * The sidebar's search box (`src/features/search/`) asks `POST /api/search`,
 * which loads the lists its reader may already open (`./load.ts`) and asks
 * this module which of their rows match. Nothing here reads a document: it is
 * handed a reader's world and a query, and it answers with at most
 * `MAX_PEOPLE` people and `MAX_GROUPS` groups.
 *
 * ## What a result carries
 *
 * A name as the reader is already shown it, one line saying what it is ("AGI
 * Strategy · Group C"), and the address of a page the reader may already
 * open. Nothing else: no email address, no university address, no role, no
 * status, no uid outside an address the reader's own pages already carry.
 * The types below have no field that could hold one.
 *
 * ## Matching
 *
 * On the name the reader is shown, folded for case and accents, every word of
 * the query in it, as the People tab's own search matches ("leo" finds Leo,
 * Leonie and Cleo); a word of one or two letters has to start a word of the
 * name, so "group c" is not every group with a c in its programme. A group
 * also matches on the programme and the run its line names, so "agi group c"
 * finds it. Never on an address: a world's `matchOn` is built from names
 * alone.
 *
 * ## The facilitator guide
 *
 * A third short list, `guides`, for somebody who facilitates: the
 * facilitator guide of each course they facilitate a live group on, matched
 * on "Facilitator guide" and the course's title, so "guide", "facilitator
 * guide" and "agi strategy" each find it. It is in the answer ONLY when
 * something matched, so every answer without a guide in it is exactly the
 * answer it always was. A guide is offered only for a course the guide's
 * own gate would admit the searcher to as a facilitator (`./load.ts`, which
 * also gives each the course's own title).
 *
 * ## Programmes
 *
 * A fourth short list, `programmes`, drawn first: each programme the reader
 * opens the Overview of (an admin every one, a lead the ones they lead;
 * `./load.ts` asks the Programmes list's own rule), matched on its names and
 * its term's, at most `MAX_PROGRAMMES`. Its line is "Fellowship · Autumn 2026
 * · Lead: Maya Rao", and a chip says where it is ("Running", "Taking
 * applications"). Like guides, it is in the answer ONLY when something
 * matched.
 *
 * Client safe: no import, so the box, the route and the tests run the same
 * rule.
 */

/** Fewer characters than this, spaces aside, and nothing is asked. */
export const SEARCH_MIN_LENGTH = 2;
/** Longer than this and the query is refused as not a name. */
export const SEARCH_MAX_LENGTH = 80;
/** The most people one answer holds. */
export const MAX_PEOPLE = 6;
/** The most groups one answer holds. */
export const MAX_GROUPS = 4;
/** The most programmes one answer holds. */
export const MAX_PROGRAMMES = 4;

/** One result, as the box draws it. */
export type SearchHit = {
  /** The name as this reader is already shown it. */
  name: string;
  /** What it is: "AGI Strategy · Group C", or "" when there is nothing to add. */
  line: string;
  /** A page this reader may already open. */
  href: string;
  /** A programme's stage beside it ("Running", "Taking applications"); absent on every other result. */
  chip?: string;
};

/** The route's answer to one query. */
export type SearchAnswer = {
  people: SearchHit[];
  groups: SearchHit[];
  /** More people matched than the answer holds. */
  morePeople: boolean;
  /** More groups matched than the answer holds. */
  moreGroups: boolean;
  /**
   * The facilitator guides that matched, one per course: present only when
   * one did (see the module comment). Never more than the courses the
   * searcher facilitates on, so never capped.
   */
  guides?: SearchHit[];
  /**
   * The programmes that matched, drawn first: present only when one did, for
   * an admin or a programme's lead (see the module comment). At most
   * `MAX_PROGRAMMES`.
   */
  programmes?: SearchHit[];
};

/** One row a reader may already list, as the world hands it in. */
export type SearchCandidate = SearchHit & {
  /** The text it is matched on: the shown name, and for a group its programme and run. Never an address. */
  matchOn: string;
  /**
   * Who or what the row is, for keeping one row of each: somebody on two of
   * the reader's lists (a lead who also facilitates their group) is one
   * result, the first list's. Never sent. Absent: the name and the page.
   */
  key?: string;
};

/** Everything one reader may find, read once per query by `./load.ts`. */
export type SearchWorld = {
  people: SearchCandidate[];
  groups: SearchCandidate[];
  /** The guides of the courses the searcher facilitates on. Absent: none. */
  guides?: SearchCandidate[];
  /** The programmes whose Overview the searcher opens. Absent: none. */
  programmes?: SearchCandidate[];
};

export const EMPTY_WORLD: SearchWorld = Object.freeze({ people: [], groups: [] }) as SearchWorld;

export const NO_ANSWER: SearchAnswer = Object.freeze({
  people: [],
  groups: [],
  morePeople: false,
  moreGroups: false,
}) as SearchAnswer;

/** Lower case, accents off, runs of spaces as one, trimmed. */
export function foldForSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * The words of a query, folded, or null when it is too short to ask (fewer
 * than `SEARCH_MIN_LENGTH` letters, spaces aside) or is not text.
 */
export function queryWords(query: unknown): string[] | null {
  if (typeof query !== "string") return null;
  const folded = foldForSearch(query);
  if (folded.replace(/ /g, "").length < SEARCH_MIN_LENGTH) return null;
  return folded.split(" ").filter(Boolean);
}

/** Whether a query is one the route will take: text, and not longer than a name could be. */
export function isAskableQuery(query: unknown): query is string {
  return typeof query === "string" && query.length <= SEARCH_MAX_LENGTH;
}

/** Shorter than this, a word typed has to start a word of the text: "a" is not every name with an a in it. */
const ANYWHERE_FROM = 3;

/**
 * Every word typed is in the folded text: a word of three letters or more
 * anywhere ("leo" in Cleo), a shorter one at the start of a word ("c" in
 * "Group C", not in "Strategy").
 */
function matches(words: readonly string[], folded: string): boolean {
  const parts = folded.split(" ");
  return words.every((word) =>
    word.length >= ANYWHERE_FROM ? folded.includes(word) : parts.some((part) => part.startsWith(word)),
  );
}

/**
 * How well a candidate matches, lower first: its name starts with what was
 * typed; then a word of its name starts with the first word typed; then
 * anything else that matched.
 */
function rankOf(words: readonly string[], name: string): number {
  const folded = foldForSearch(name);
  if (folded.startsWith(words.join(" "))) return 0;
  if (folded.split(" ").some((part) => part.startsWith(words[0]))) return 1;
  return 2;
}

/** The matching candidates, best first, each once, as hits. */
function pick(
  candidates: readonly SearchCandidate[],
  words: readonly string[],
  cap: number,
): { hits: SearchHit[]; more: boolean } {
  const seen = new Set<string>();
  const ranked: { hit: SearchHit; rank: number }[] = [];
  for (const candidate of candidates) {
    if (!matches(words, foldForSearch(candidate.matchOn))) continue;
    // One row per person or group, or per name and page: the same person on two lists is one result.
    const key = candidate.key ?? `${candidate.href}\u0000${candidate.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    ranked.push({ hit: { name: candidate.name, line: candidate.line, href: candidate.href }, rank: rankOf(words, candidate.name) });
  }
  ranked.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.hit.name.localeCompare(b.hit.name, "en-GB") ||
      a.hit.line.localeCompare(b.hit.line, "en-GB") ||
      a.hit.href.localeCompare(b.hit.href),
  );
  return { hits: ranked.slice(0, cap).map((entry) => entry.hit), more: ranked.length > cap };
}

/**
 * The answer to one query over one reader's world. A query too short to ask
 * is answered with nothing, the same answer as a name nobody holds.
 */
export function searchWorld(world: SearchWorld, query: unknown): SearchAnswer {
  const words = queryWords(query);
  if (!words) return NO_ANSWER;
  const people = pick(world.people, words, MAX_PEOPLE);
  const groups = pick(world.groups, words, MAX_GROUPS);
  const answer: SearchAnswer = { people: people.hits, groups: groups.hits, morePeople: people.more, moreGroups: groups.more };
  const guides = pick(world.guides ?? [], words, Number.POSITIVE_INFINITY).hits;
  const programmes = pick(world.programmes ?? [], words, MAX_PROGRAMMES).hits;
  return {
    ...answer,
    ...(guides.length > 0 ? { guides } : {}),
    ...(programmes.length > 0 ? { programmes } : {}),
  };
}

/** The answer with no `guides` in it: the shape every answer without a guide has. Programmes that matched stay. */
export function withoutGuides(answer: SearchAnswer): SearchAnswer {
  const base = { people: answer.people, groups: answer.groups, morePeople: answer.morePeople, moreGroups: answer.moreGroups };
  return answer.programmes && answer.programmes.length > 0 ? { ...base, programmes: answer.programmes } : base;
}

/** The name a facilitator guide is offered by: the guide's own name. */
export const GUIDE_HIT_NAME = "Facilitator guide";

/**
 * One course's facilitator guide as a candidate: "Facilitator guide", the
 * course's title under it, to the guide's page, matched on both. One per
 * course (`key`).
 */
export function guideCandidate(courseId: string, courseTitle: string, href: string): SearchCandidate {
  const title = courseTitle.trim();
  return { name: GUIDE_HIT_NAME, line: title, href, matchOn: `${GUIDE_HIT_NAME} ${title}`, key: `guide:${courseId}` };
}

/** "AGI Strategy · Group C": the parts that have something in them, joined. */
export function lineOf(parts: readonly (string | null | undefined)[]): string {
  return parts
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter(Boolean)
    .join(" · ");
}
