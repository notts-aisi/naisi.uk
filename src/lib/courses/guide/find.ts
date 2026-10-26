import { runsText } from "../weekBlocks/prose";
import type { GlossaryTerm } from "./model";

/**
 * The Glossary's find box (wk-glossary): which terms it keeps for what was
 * typed. Pure, so the page and its tests ask the same question.
 */

/** Text folded for matching: lower case, accents and curly quotes plain, space folded. */
export function foldForFind(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * The terms whose words or definition hold what was typed (case and accents
 * aside), each with its place in the guide's table, in the table's order.
 * Every term for an empty box.
 */
export function findTerms(terms: readonly GlossaryTerm[], query: string): Array<{ entry: GlossaryTerm; place: number }> {
  const needle = foldForFind(query);
  return terms
    .map((entry, place) => ({ entry, place }))
    .filter(({ entry }) => !needle || foldForFind(runsText(entry.term)).includes(needle) || foldForFind(runsText(entry.definition)).includes(needle));
}
