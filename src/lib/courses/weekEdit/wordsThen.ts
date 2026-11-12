import { allBlocks, type When, type WeekBlock, type WordRange } from "../weekBlocks/model";
import { proseText } from "../weekBlocks/prose";

/**
 * THE WORDS A QUESTION HAD WHEN IT WAS ANSWERED.
 *
 * A reflection's prompt or a written answer's question can be reworded in
 * place while people are answering it. No copy of the words is stored on an
 * answer. Instead every save of a week keeps, beside the week's blocks, the
 * words each prompt and each written answer had after that save (`asked`,
 * `askedOf`), and this reader answers "what did this question say at the
 * moment this piece of work was first written" from those saves alone.
 *
 * WHICH SAVE WAS IN FORCE. The saves of a week in order (`seq`); the one in
 * force at a moment is the last saved at or before it. A moment before every
 * save is answered by the first: a week's first row is the week as it was
 * before its first change here (the history's "as found" row), so it held
 * from before anybody could write anything until that change. A week with no
 * history has never been changed here, so its words today are the words it
 * always had, and the reader says nothing.
 *
 * Pure: the loaders read the saves once per week and ask this per answer.
 */

/** What a question said: a reflection prompt's words, or a written answer's question, range and due rule. */
export type AskedWords =
  | { kind: "prompt"; text: string }
  | { kind: "writtenAnswer"; question: string; words: WordRange | null; due: When };

/** Every prompt's and written answer's words in a week, by item id: what one save keeps. */
export type AskedMap = Record<string, AskedWords>;

/** One save of a week, as this reader needs it. */
export type AskedVersion = { seq: number; at: Date | null; asked: AskedMap };

/** The words of every prompt and written answer in a week's blocks, by id: what a save stores beside them. */
export function askedOf(blocks: readonly WeekBlock[]): AskedMap {
  const out: AskedMap = {};
  for (const block of allBlocks(blocks)) {
    if (block.type === "reflection") {
      for (const prompt of block.prompts) out[prompt.id] = { kind: "prompt", text: prompt.text };
    } else if (block.type === "writtenAnswer") {
      out[block.id] = {
        kind: "writtenAnswer",
        question: proseText(block.prompt),
        words: block.words ? { min: block.words.min, max: block.words.max } : null,
        due: block.due,
      };
    }
  }
  return out;
}

function sameWords(a: AskedWords, b: AskedWords): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The save in force at `at`: the last at or before it, else the first. Null with no saves. */
export function versionInForce(versions: readonly AskedVersion[], at: Date | null): AskedVersion | null {
  if (versions.length === 0) return null;
  const ordered = [...versions].sort((a, b) => a.seq - b.seq);
  if (!at) return ordered[0];
  let found: AskedVersion | null = null;
  for (const version of ordered) {
    if (version.at && version.at.getTime() <= at.getTime()) found = version;
  }
  return found ?? ordered[0];
}

/** The words `itemId` had at `at`, from the week's saves; null when no save holds the item. */
export function wordsInForce(versions: readonly AskedVersion[], itemId: string, at: Date | null): AskedWords | null {
  return versionInForce(versions, at)?.asked[itemId] ?? null;
}

/**
 * The words `itemId` had when a piece of work was first written (`writtenAt`),
 * ONLY when they differ from the words it has now (`now`, from the week as
 * stored). Null when they are the same, when the week has no history, or
 * when the item was not in the week then: a page shows the earlier words
 * beside an answer only when the answer was written to different ones.
 */
export function earlierWords(
  versions: readonly AskedVersion[],
  now: AskedMap,
  itemId: string,
  writtenAt: Date | null,
): AskedWords | null {
  const then = wordsInForce(versions, itemId, writtenAt);
  const current = now[itemId];
  if (!then || !current || then.kind !== current.kind) return null;
  return sameWords(then, current) ? null : then;
}
