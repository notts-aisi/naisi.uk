import { WHO_CHOOSES } from "../weekEdit/pageWords";
import { allBlocks, GIVEN_BY, type CasesBlock, type ChooseOneBlock, type GivenBy, type WeekBlock } from "./model";

/**
 * WHO CHOOSES, IN A PASTED WEEK: each Choose one and each Cases block is
 * either given out by the facilitator or picked by each person (`givenBy`,
 * a field both blocks have always stored). The pasted week's own words
 * decide it, by the reader's rules (`markdownRead.ts`), and the paste's
 * check says which rule decided each block and lets the author change it
 * before saving.
 *
 * THE CHANGE TRAVELS WITH THE PASTE. "Read it" and "Save" both read the
 * Markdown again, so the author's choice is sent beside it as an override
 * by the block's PLACE: its number among the week's Choose ones and Cases
 * blocks in page order (`choiceBlocks`), with its kind, so an override can
 * never land on a block of another kind. It is applied to the blocks as
 * read, before their ids are settled, by the same gate as the paste.
 * Nothing new is stored: a saved week copies out with the words that read
 * back the same (`markdownWrite.ts`, "given out by your facilitator" and
 * "picked by each person"), so a round trip keeps the choice.
 *
 * WHAT CAN BE CHANGED (decided Fri 20 Nov 2026):
 *  - a Choose one written as a table: either way;
 *  - a Choose one written as a list: never, since copying a week out writes
 *    no words for it and the reader always reads a list as picked, so a
 *    change would be lost at the next copy and paste;
 *  - Cases with cases in them: only to "given out", since no page lets a
 *    member pick a case, so "picked" would leave everybody without one;
 *  - a talk with no cases (a pitch): not listed at all, since nothing is
 *    given out or picked in it, and who chooses changes nothing anybody sees.
 *
 * A FACILITATOR'S OWN PICK STAYS THEIRS. While a Choose one is picked, a
 * pack picked by somebody who facilitates a group is read by the lead and
 * admins only; given out, the draw shows it to the group's other
 * facilitators. So a save that turns a Choose one from picked to given out
 * is refused while any such pick is on it (`facilitatorPickProblems`), and
 * the check says so before Save.
 *
 * Pure: the route counts the people a change reaches (`packHolders` in
 * `src/lib/courses/weekEdit/counts.ts`).
 */

/** Why the reader set who chooses a block. */
export type ChooserRule =
  /** The block's own line says it: "given out" or "picked by". */
  | { rule: "said"; line: "chooseOne" | "cases"; words: string }
  /** A Choose one table whose line, if it has one, says neither: the part's own words. */
  | { rule: "partWords"; line: boolean; asks: string | null; but: string | null }
  /** A Choose one written as a list: always picked. */
  | { rule: "list" }
  /** A case study under its own heading, its Talk line saying neither: given out. */
  | { rule: "heading"; heading: string }
  /** A Talk line inside a part, saying neither: picked. */
  | { rule: "inPart" }
  /** A talk taken from a part's title: follows the part's Choose one, or picked when it has none. */
  | { rule: "partTitle"; followsChooseOne: boolean };

export type ChoiceBlock = ChooseOneBlock | CasesBlock;
export type ChoiceKind = ChoiceBlock["type"];

/** Every Choose one and Cases block of a week, in page order: index is the block's place. */
export function choiceBlocks(blocks: readonly WeekBlock[]): ChoiceBlock[] {
  return allBlocks(blocks).filter((block): block is ChoiceBlock => block.type === "chooseOne" || block.type === "cases");
}

/** Does a Cases block hold any case to give out? */
function hasCases(block: CasesBlock): boolean {
  return block.groups.some((group) => group.cases.length > 0);
}

/** Which answers the check offers for a block: both, only "given out", or none (shown, not changeable), or not listed. */
export type Changeable = "both" | "given" | "none";

export function changeableOf(block: ChoiceBlock): Changeable | null {
  if (block.type === "chooseOne") return block.form === "table" ? "both" : "none";
  return hasCases(block) ? "given" : null;
}

/** The author's change to one block, by place. */
export type WhoChoosesOverride = { place: number; kind: ChoiceKind; givenBy: GivenBy };

/** The refusal for an override that names no block the check offers. */
export const WHO_CHOOSES_REFUSAL = {
  elsewhere: "Who chooses was changed on a block where this paste can’t change it. Read it again, then save.",
  shape: "Who chooses each block was sent in a form the site can’t read. Read it again, then save.",
} as const;

/** The most overrides one request may carry: well past any week. */
export const MAX_WHO_CHOOSES = 60;

/** An override list from a request's body, or null when it is not one. Absent is none. */
export function whoChoosesOf(value: unknown): WhoChoosesOverride[] | null {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_WHO_CHOOSES) return null;
  const out: WhoChoosesOverride[] = [];
  const places = new Set<number>();
  for (const entry of value) {
    const raw = entry as { place?: unknown; kind?: unknown; givenBy?: unknown } | null;
    if (!raw || typeof raw !== "object") return null;
    const { place, kind, givenBy } = raw;
    if (typeof place !== "number" || !Number.isInteger(place) || place < 0 || place >= 1000 || places.has(place)) return null;
    if (kind !== "chooseOne" && kind !== "cases") return null;
    if (!GIVEN_BY.includes(givenBy as GivenBy)) return null;
    places.add(place);
    out.push({ place, kind, givenBy: givenBy as GivenBy });
  }
  return out;
}

/**
 * The blocks as read, with the author's changes applied, and what stops the
 * changes being saved. With no overrides the blocks are handed back as they
 * came, the same list: a paste nobody changed reads exactly as it always has.
 */
export function applyWhoChooses(blocks: WeekBlock[], overrides: readonly WhoChoosesOverride[]): { blocks: WeekBlock[]; problems: string[] } {
  if (overrides.length === 0) return { blocks, problems: [] };
  const out = structuredClone(blocks) as WeekBlock[];
  const choices = choiceBlocks(out);
  const problems: string[] = [];
  for (const override of overrides) {
    const block = choices[override.place];
    const can = block && block.type === override.kind ? changeableOf(block) : null;
    if (!block || can === null || block.type !== override.kind) {
      problems.push(WHO_CHOOSES_REFUSAL.elsewhere);
    } else if (can === "none" && override.givenBy !== block.givenBy) {
      problems.push(WHO_CHOOSES.list);
    } else if (can === "given" && override.givenBy !== "facilitator") {
      problems.push(WHO_CHOOSES.casesOnlyGiven);
    } else {
      block.givenBy = override.givenBy;
    }
  }
  return { blocks: out, problems: [...new Set(problems)] };
}

/** One row of the check's "Who chooses?". */
export type WhoChoosesRow = {
  /** The block's place among the week's Choose ones and Cases blocks. */
  place: number;
  kind: ChoiceKind;
  /** The block's id once settled: what people's records are keyed on. */
  blockId: string;
  /** "Part 3: Your pathway", "Your case study". */
  label: string;
  /** "Choose one · 4 packs", "Cases · 22, by pathway". */
  detail: string;
  /** Who chooses as the pasted words read. */
  start: GivenBy;
  /** Who chooses as it will be saved. */
  givenBy: GivenBy;
  can: Changeable;
  /** Why it starts that way. */
  why: string;
  /** The line under a block with one answer or none: a list, Cases. */
  only: string | null;
  /** Who chooses on the same block as stored now, or null when the week has no such block yet. */
  stored: GivenBy | null;
};

/** The words for the rule that decided a block. */
export function whyWords(rule: ChooserRule): string {
  switch (rule.rule) {
    case "said":
      return WHO_CHOOSES.said(rule.line, rule.words);
    case "partWords":
      if (rule.asks && !rule.but) return WHO_CHOOSES.partAsks(rule.asks);
      if (rule.asks && rule.but) return WHO_CHOOSES.partAsksBut(rule.asks, rule.but);
      return rule.line ? WHO_CHOOSES.partSilentWithLine : WHO_CHOOSES.partSilent;
    case "list":
      return WHO_CHOOSES.list;
    case "heading":
      return WHO_CHOOSES.heading(rule.heading);
    case "inPart":
      return WHO_CHOOSES.inPart;
    case "partTitle":
      return WHO_CHOOSES.partTitle(rule.followsChooseOne);
  }
}

/** The part a block is in, numbered as the found list numbers them. */
function partLabels(blocks: readonly WeekBlock[]): Map<string, string> {
  const out = new Map<string, string>();
  let n = 0;
  for (const block of blocks) {
    if (block.type !== "part") continue;
    n += 1;
    for (const child of block.blocks) out.set(child.id, `Part ${n}: ${block.title}`);
  }
  return out;
}

/**
 * The rows of "Who chooses?": `read` the blocks as they will be saved (the
 * changes applied, the ids settled), `start` the blocks as the words read
 * them, `rules` the reader's rule for each by place, `stored` the week as
 * stored. A talk with no cases has no row. Both lists hold the same blocks in
 * the same order: settling ids and applying a change alter no block's place.
 */
export function whoChoosesRows(input: {
  read: readonly WeekBlock[];
  start: readonly WeekBlock[];
  rules: ReadonlyArray<ChooserRule | null>;
  stored: readonly WeekBlock[] | null | undefined;
}): WhoChoosesRow[] {
  const read = choiceBlocks(input.read);
  const start = choiceBlocks(input.start);
  const stored = new Map(choiceBlocks(input.stored ?? []).map((block) => [block.id, block]));
  const parts = partLabels(input.read);
  const rows: WhoChoosesRow[] = [];
  read.forEach((block, place) => {
    const can = changeableOf(block);
    const rule = input.rules[place];
    const before = start[place];
    if (can === null || !rule || !before || before.type !== block.type) return;
    const was = stored.get(block.id);
    const common = { place, blockId: block.id, start: before.givenBy, givenBy: block.givenBy, can, why: whyWords(rule), stored: was && was.type === block.type ? was.givenBy : null };
    if (block.type === "chooseOne") {
      rows.push({
        ...common,
        kind: "chooseOne",
        label: parts.get(block.id) ?? "Choose one",
        detail: WHO_CHOOSES.chooseOneDetail(block.packs.length, block.form === "list"),
        only: null,
      });
    } else {
      const cases = block.groups.reduce((sum, group) => sum + group.cases.length, 0);
      rows.push({
        ...common,
        kind: "cases",
        label: block.heading || "Your case study",
        detail: WHO_CHOOSES.casesDetail(cases, block.groupLabel, block.groups.length),
        only: block.givenBy === "facilitator" ? WHO_CHOOSES.casesOnlyGiven : WHO_CHOOSES.casesPicked,
      });
    }
  });
  return rows;
}

/** The Choose ones whose chooser a save changes from the week as stored: the ones whose people a change reaches. */
export function switchedChooseOnes(rows: readonly WhoChoosesRow[], read: readonly WeekBlock[]): ChooseOneBlock[] {
  const ids = new Set(rows.filter((row) => row.kind === "chooseOne" && row.stored !== null && row.stored !== row.givenBy).map((row) => row.blockId));
  return choiceBlocks(read).filter((block): block is ChooseOneBlock => block.type === "chooseOne" && ids.has(block.id));
}

/** How many hold a pack in one Choose one, and how many of those facilitate a group (`packHolders`). */
export type Holders = { people: number; facilitating: number };

/** Does a save turn this row's Choose one from picked to given out, on a block people may already hold a pack in? */
function turnsGiven(row: WhoChoosesRow): boolean {
  return row.kind === "chooseOne" && row.stored === "fellow" && row.givenBy === "facilitator";
}

/**
 * The sentences that stop a save: a Choose one turned from picked to given
 * out while somebody who facilitates a group holds a pick in it. While it is
 * picked, that pick is their own work, read by the lead and admins only;
 * given out, the draw would show it to the group's other facilitators. The
 * block can still be saved as picked. Whichever way the change came, the
 * check's switch or the pasted words, it is refused the same.
 */
export function facilitatorPickProblems(rows: readonly WhoChoosesRow[], holders: ReadonlyMap<string, Holders>): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const held = holders.get(row.blockId);
    if (turnsGiven(row) && held && held.facilitating > 0) out.push(WHO_CHOOSES.facilitatorsPicked(held.facilitating));
  }
  return [...new Set(out)];
}

/**
 * What a row says to the page: its words, its answers, and what the change
 * does to people already on the week. `holders` names every Choose one it
 * counted; a switched block it did not count says nothing about people.
 * `wholeRun`: the count is of everybody on the programme (the run's own
 * week), which the line says.
 */
export function whoChoosesWire(row: WhoChoosesRow, holders: ReadonlyMap<string, Holders>, wholeRun: boolean) {
  const switched = row.kind === "chooseOne" && row.stored !== null && row.stored !== row.givenBy;
  const held = switched ? (holders.get(row.blockId) ?? null) : null;
  const people =
    held === null
      ? null
      : row.givenBy === "facilitator"
        ? turnsGiven(row) && held.facilitating > 0
          ? WHO_CHOOSES.facilitatorsPicked(held.facilitating)
          : WHO_CHOOSES.nowGiven(held.people, wholeRun)
        : WHO_CHOOSES.nowPicked(held.people, wholeRun);
  return {
    place: row.place,
    kind: row.kind,
    label: row.label,
    detail: row.detail,
    start: row.start,
    givenBy: row.givenBy,
    can: row.can,
    why: row.why,
    only: row.only,
    changed: row.givenBy !== row.start ? WHO_CHOOSES.changed : null,
    people,
  };
}

export type WhoChoosesWire = ReturnType<typeof whoChoosesWire>;
