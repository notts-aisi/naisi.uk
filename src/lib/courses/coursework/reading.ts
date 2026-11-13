/**
 * THE READING VIEW, ONE PERSON AND ONE WEEK: the pure pieces the loaders and
 * the page share. No reads, no clock, nothing server-only, so the page in the
 * browser and the tests import it as it is.
 *
 *  - WHICH WEEK OPENS when the address names none (`openingWeek`).
 *  - PREVIOUS AND NEXT, for people and for weeks (`neighboursOf`).
 *  - THE ADDRESS of one person's week on either door (`readingHref`).
 *  - WHAT CHANGED in a written answer since the version a piece of feedback
 *    was about, word by word (`wordChanges`): what was taken out, what was
 *    added and what stayed, so the page can strike through the one and
 *    underline the other, and say both in words.
 *
 * Who may open the view, and what each reader is handed, is decided by the
 * gates the loaders ask (`./load.ts`, `./readingLoad.ts`), never here.
 */

// ---------------------------------------------------------------------------
// Which week opens
// ---------------------------------------------------------------------------

/**
 * THE WEEK THE VIEW OPENS ON. The week the address names, when it is one of
 * the weeks the view has (`columns`, the run's weeks written as blocks);
 * otherwise the newest week the person has anything in (a reflection, a box,
 * a tick or a written answer started: `withWork`); otherwise the newest week
 * that has begun on the calendar of the group whose weeks they read
 * (`reached`, 0 before any); otherwise the first. `asked` says whether the
 * address chose it. Null for a run with no week written as blocks.
 */
export function openingWeek(input: {
  columns: readonly number[];
  asked: unknown;
  withWork: ReadonlySet<number>;
  reached: number;
}): { weekNumber: number; asked: boolean } | null {
  const columns = [...new Set(input.columns)].sort((a, b) => a - b);
  if (columns.length === 0) return null;
  const wanted = typeof input.asked === "string" && /^\d{1,3}$/.test(input.asked) ? Number(input.asked) : null;
  if (wanted !== null && columns.includes(wanted)) return { weekNumber: wanted, asked: true };
  const written = columns.filter((weekNumber) => input.withWork.has(weekNumber)).at(-1);
  if (written !== undefined) return { weekNumber: written, asked: false };
  const begun = columns.filter((weekNumber) => weekNumber <= input.reached).at(-1);
  return { weekNumber: begun ?? columns[0], asked: false };
}

// ---------------------------------------------------------------------------
// Previous and next
// ---------------------------------------------------------------------------

/** The one before and the one after `key` in `list`; both null when it is not in it. */
export function neighboursOf<T>(list: readonly T[], keyOf: (item: T) => string | number, key: string | number): { previous: T | null; next: T | null } {
  const at = list.findIndex((item) => keyOf(item) === key);
  if (at === -1) return { previous: null, next: null };
  return { previous: at > 0 ? list[at - 1] : null, next: at < list.length - 1 ? list[at + 1] : null };
}

/** People in one order for both doors: by the name the reader is shown, then by account. */
export function byShownName<T extends { uid: string; name: string }>(people: readonly T[]): T[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name, "en-GB", { sensitivity: "base" }) || a.uid.localeCompare(b.uid));
}

/** One person's week on a door: `base` is the door's path before the person (".../coursework"). */
export function readingHref(base: string, uid: string, weekNumber: number): string {
  return `${base}/${encodeURIComponent(uid)}?week=${weekNumber}`;
}

// ---------------------------------------------------------------------------
// What changed, word by word
// ---------------------------------------------------------------------------

/** One run of words: kept as it was, taken out of the earlier words, or added in the later. */
export type WordChange = { kind: "same" | "out" | "in"; text: string };

/** A word and the space written after it, so the words put back together read as written, line breaks and all. */
type Token = { word: string; text: string };

function tokensOf(text: string): Token[] {
  return [...text.replace(/^\s+/, "").matchAll(/\S+\s*/g)].map((match) => ({ word: match[0].trim(), text: match[0] }));
}

/**
 * Past this many cells (words before times words after, once what both share
 * at their start and their end is set aside), the middle is said as taken out
 * whole and added whole rather than worked out word by word: the page stays
 * quick, and nothing is ever said to have stayed that did not.
 */
const MOST_CELLS = 2_000_000;

/**
 * WHAT CHANGED FROM `before` TO `after`, word by word, in order: each run of
 * words either kept (`same`, as it reads in `after`), taken out (`out`, as it
 * read in `before`) or added (`in`). Words are told apart by their letters
 * alone, so a change of spacing alone is no change. Where a run was both taken
 * out and added at one place, the taken-out words come first.
 *
 * The longest run of words the two share is kept (a longest common
 * subsequence), after setting aside what they share at their start and at
 * their end, which is most of a typical change.
 */
export function wordChanges(before: string, after: string): WordChange[] {
  const a = tokensOf(before);
  const b = tokensOf(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start].word === b[start].word) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1].word === b[endB - 1].word) {
    endA -= 1;
    endB -= 1;
  }
  const out: Array<{ kind: WordChange["kind"]; token: Token }> = [];
  for (let i = 0; i < start; i += 1) out.push({ kind: "same", token: b[i] });
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  if (midA.length * midB.length > MOST_CELLS) {
    for (const token of midA) out.push({ kind: "out", token });
    for (const token of midB) out.push({ kind: "in", token });
  } else {
    // lengths[i][j]: the longest run shared by midA from i and midB from j.
    const width = midB.length + 1;
    const lengths = new Uint32Array((midA.length + 1) * width);
    for (let i = midA.length - 1; i >= 0; i -= 1) {
      for (let j = midB.length - 1; j >= 0; j -= 1) {
        lengths[i * width + j] =
          midA[i].word === midB[j].word ? lengths[(i + 1) * width + j + 1] + 1 : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i].word === midB[j].word) {
        out.push({ kind: "same", token: midB[j] });
        i += 1;
        j += 1;
      } else if (lengths[(i + 1) * width + j] >= lengths[i * width + j + 1]) {
        out.push({ kind: "out", token: midA[i] });
        i += 1;
      } else {
        out.push({ kind: "in", token: midB[j] });
        j += 1;
      }
    }
    for (; i < midA.length; i += 1) out.push({ kind: "out", token: midA[i] });
    for (; j < midB.length; j += 1) out.push({ kind: "in", token: midB[j] });
  }
  for (let j = endB; j < b.length; j += 1) out.push({ kind: "same", token: b[j] });

  // One run per kind in a row, a taken-out run before an added one at the same place.
  const runs: WordChange[] = [];
  for (const { kind, token } of out) {
    const last = runs.at(-1);
    if (last && last.kind === kind) last.text += token.text;
    else runs.push({ kind, text: token.text });
  }
  for (let k = 1; k < runs.length; k += 1) {
    if (runs[k].kind === "out" && runs[k - 1].kind === "in") [runs[k - 1], runs[k]] = [runs[k], runs[k - 1]];
  }
  // A swap can set two runs of one kind side by side: one run each, again.
  return runs.reduce<WordChange[]>((merged, run) => {
    const last = merged.at(-1);
    if (last && last.kind === run.kind) last.text += run.text;
    else merged.push({ ...run });
    return merged;
  }, []);
}

/** How many words a change took out and added: what the line beside the two versions says. */
export function changeCounts(changes: readonly WordChange[]): { out: number; in: number } {
  const count = (kind: WordChange["kind"]) =>
    changes.filter((change) => change.kind === kind).reduce((sum, change) => sum + tokensOf(change.text).length, 0);
  return { out: count("out"), in: count("in") };
}

/** The earlier version as the changes show it: what stayed and what was taken out. */
export function beforeOf(changes: readonly WordChange[]): WordChange[] {
  return changes.filter((change) => change.kind !== "in");
}

/** The later version as the changes show it: what stayed and what was added. */
export function afterOf(changes: readonly WordChange[]): WordChange[] {
  return changes.filter((change) => change.kind !== "out");
}
