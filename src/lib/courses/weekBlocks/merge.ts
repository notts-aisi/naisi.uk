import {
  ID_PREFIX,
  isWeekItemId,
  newWeekItemId,
  partsOf,
  weekItems,
  type CasesBlock,
  type IdPrefix,
  type ItemKind,
  type ThisWeekTask,
  type WeekBlock,
  type WeekItem,
} from "./model";

/**
 * KEEPING IDS ACROSS A PASTE (K16: "Pasting again replaces the week. Answers
 * stay with their blocks; if a block that has answers would go, it says how
 * many first.").
 *
 * Ticks, answers and per-person records key on the ids inside a week. A
 * week copied out as Markdown carries them (`markdownWrite.ts`), and when it
 * is pasted back each id is matched against the week as stored:
 *
 *  - an id the stored week has, on the same kind of thing, is kept, so its
 *    answers stay with it, wherever in the week it has moved to;
 *  - an id the stored week does not have, an id on a different kind of
 *    thing, or the second use of one id, gets a fresh id instead, so a paste
 *    can never point one person's answers at somebody else's question, nor
 *    copy another week's ids into this one;
 *  - a thing with no id gets a fresh one;
 *  - whatever the stored week has that the paste does not is `removed`. The
 *    loader counts the answers on those before anything is saved and asks
 *    first when there are any.
 *
 * Pure: the store is read by the loader's route, not here.
 */

/** What a paste must keep an id on: the same kind of thing. */
function family(kind: ItemKind): string {
  return kind;
}

function prefixOf(kind: ItemKind): IdPrefix {
  switch (kind) {
    case "block:source":
      return ID_PREFIX.source;
    case "answerBox":
      return ID_PREFIX.answerBox;
    case "prompt":
      return ID_PREFIX.prompt;
    case "pack":
      return ID_PREFIX.pack;
    case "case":
      return ID_PREFIX.case;
    case "box":
      return ID_PREFIX.box;
    case "checkItem":
      return ID_PREFIX.checkItem;
    default:
      return ID_PREFIX[kind.slice("block:".length) as keyof typeof ID_PREFIX];
  }
}

type Holder = { id: string };

/** Every object holding an id in a week, in page order, with the kind of thing it is. */
function holders(blocks: WeekBlock[]): Array<{ holder: Holder; kind: ItemKind }> {
  const out: Array<{ holder: Holder; kind: ItemKind }> = [];
  const visit = (block: WeekBlock) => {
    out.push({ holder: block, kind: `block:${block.type}` });
    switch (block.type) {
      case "part":
        block.blocks.forEach(visit);
        break;
      case "reflection":
        for (const prompt of block.prompts) out.push({ holder: prompt, kind: "prompt" });
        break;
      case "chooseOne":
        for (const pack of block.packs) out.push({ holder: pack, kind: "pack" });
        break;
      case "writtenAnswer":
        for (const box of block.boxes) out.push({ holder: box, kind: "answerBox" });
        break;
      case "cases":
        for (const group of block.groups) for (const item of group.cases) out.push({ holder: item, kind: "case" });
        break;
      case "fillIn":
        for (const group of block.groups) for (const box of group.boxes) out.push({ holder: box, kind: "box" });
        break;
      case "checklist":
        for (const item of block.items) out.push({ holder: item, kind: "checkItem" });
        break;
      default:
        break;
    }
  };
  blocks.forEach(visit);
  return out;
}

export type IdMerge = {
  /** The pasted blocks with every id settled. */
  blocks: WeekBlock[];
  /** How many ids were kept from the stored week. */
  kept: number;
  /** How many fresh ids were minted. */
  minted: number;
  /** What the stored week has that the paste takes out, with the words to name it by. */
  removed: WeekItem[];
};

/**
 * Settle the ids of `parsed` (a paste, read) against `stored` (the week's
 * blocks as stored, or none). `mint` makes a fresh id; tests pass their own.
 */
export function mergeWeekIds(
  stored: readonly WeekBlock[] | null | undefined,
  parsed: readonly WeekBlock[],
  mint: (prefix: IdPrefix) => string = newWeekItemId,
): IdMerge {
  const before = new Map<string, string>();
  for (const item of weekItems(stored ?? [])) before.set(item.id, family(item.kind));
  const blocks = structuredClone(parsed) as WeekBlock[];
  const used = new Set<string>();
  let kept = 0;
  let minted = 0;
  for (const { holder, kind } of holders(blocks)) {
    const wanted = holder.id;
    if (isWeekItemId(wanted) && !used.has(wanted) && before.get(wanted) === family(kind)) {
      used.add(wanted);
      kept += 1;
      continue;
    }
    let fresh = mint(prefixOf(kind));
    while (used.has(fresh) || before.has(fresh)) fresh = mint(prefixOf(kind));
    holder.id = fresh;
    used.add(fresh);
    minted += 1;
  }
  const removed = weekItems(stored ?? []).filter((item) => !used.has(item.id));
  return { blocks, kept, minted, removed };
}

// ---------------------------------------------------------------------------
// What points at what, worked out once the ids are settled
// ---------------------------------------------------------------------------

/** The part numbers a This week task names: "Part 4", "Parts 1 to 3", "Parts 1 and 2", or every part ("the parts below"). */
function partsNamed(what: string): number[] | "all" | null {
  const range = new RegExp(`\\bparts?\\s+(\\d+)\\s*(?:to|-|${String.fromCharCode(0x2013)})\\s*(\\d+)`, "i").exec(what);
  if (range) {
    const [from, to] = [Number(range[1]), Number(range[2])];
    if (from >= 1 && to >= from && to - from < 60) return Array.from({ length: to - from + 1 }, (_, i) => from + i);
  }
  const list = /\bparts?\s+(\d+(?:\s*(?:,|and|&)\s*\d+)*)/i.exec(what);
  if (list) return list[1].split(/\s*(?:,|and|&)\s*/).map(Number).filter((n) => Number.isInteger(n) && n >= 1);
  if (/\bparts\s+below\b|\ball\s+(?:the\s+)?parts\b|\bevery\s+part\b/i.test(what)) return "all";
  return null;
}

/**
 * What a This week task covers, from its words: the parts it names; or, when
 * it names none, the case study ("Your case study"), the written answer, a
 * pitch or talk inside a part, or getting ready for the session ("Get ready
 * for the hands-on session": In the session's "Before you come").
 */
export function coversFor(what: string, blocks: readonly WeekBlock[]): string[] {
  const parts = partsOf(blocks);
  const named = partsNamed(what);
  if (named === "all") return parts.map((part) => part.id);
  if (named) return named.map((n) => parts[n - 1]?.id).filter((id): id is string => Boolean(id));
  const out: string[] = [];
  for (const block of blocks) {
    if (block.type === "cases" && /\bcase\b/i.test(what)) out.push(block.id);
    if (block.type === "inTheSession" && /\bget ready\b|\bbefore you come\b/i.test(what)) out.push(block.id);
    const children = block.type === "part" ? block.blocks : [];
    for (const child of children) {
      if (child.type === "writtenAnswer" && /\bwritten answer\b/i.test(what)) out.push(child.id);
      if (child.type === "cases" && child.talk && new RegExp(`\\b${child.talk.name}\\b`, "i").test(what)) out.push(child.id);
    }
  }
  return out;
}

/**
 * The links inside a week that only make sense once its ids are settled:
 * each This week task's covers (from its words), each case group's pack (a
 * pack of the same name), and a case study's talk when the guide names it
 * only in This week ("Your case study: a 3-minute talk on ..."). Returns new
 * blocks; `blocks` is not changed.
 */
export function finishWeekBlocks(blocks: readonly WeekBlock[]): WeekBlock[] {
  const out = structuredClone(blocks) as WeekBlock[];
  const packs = new Map<string, string>();
  for (const block of out) {
    for (const child of block.type === "part" ? block.blocks : [block]) {
      if (child.type === "chooseOne") for (const pack of child.packs) packs.set(pack.name.trim().toLowerCase(), pack.id);
    }
  }
  const tasks: ThisWeekTask[] = [];
  for (const block of out) {
    if (block.type === "thisWeek") for (const row of block.rows) if (row.type === "task") tasks.push(row);
  }
  for (const task of tasks) task.covers = [...new Set(coversFor(task.what, out))];
  const talks: CasesBlock[] = [];
  for (const block of out) {
    for (const child of block.type === "part" ? block.blocks : [block]) if (child.type === "cases") talks.push(child);
  }
  for (const cases of talks) {
    for (const group of cases.groups) group.packId = packs.get(group.name.trim().toLowerCase()) ?? null;
    if (!cases.talk) {
      const task = tasks.find((row) => row.covers.includes(cases.id));
      const found = task ? /(\d+)[\s-]*minutes?\s+(talk|pitch)\b/i.exec(task.what) : null;
      if (found) cases.talk = { minutes: Number(found[1]), name: found[2].toLowerCase() };
    }
  }
  return out;
}
