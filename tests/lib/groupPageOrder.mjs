/**
 * THE ORDER OF A FACILITATOR'S GROUP PAGE, read off its drawn markup, for
 * the suites that draw the page in a world (`tests/course-facilitators-week`
 * on a week of the summer's kind, `tests/course-hub-facilitator-week` on a
 * week written as blocks).
 *
 * One order in the markup serves both widths: a phone reads it top to
 * bottom, and a laptop reads each block of two columns (`.columns`, its
 * `.colMain` then its `.colSide`) left then right, with everything else
 * across the page. So the checks are three:
 *
 *  1. PHONE: each card named once, in the order given, in the markup.
 *  2. NOTHING REORDERS IT: no rule of the page's sheets that lays out the
 *     page or its cards moves a card away from its place in the markup
 *     (`order`, a reversed flex direction, a grid row or area), the page
 *     takes none of the run home's `orderN` classes, and on a page narrower
 *     than 820px each block folds into one column.
 *  3. LAPTOP: which cards sit in which column of which block, and which sit
 *     across the page between them.
 *
 * Class names are the stylesheet's own, as the suites' stub hands them on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const SHEETS = ["facilitator/facilitator.module.css", "groupPage/GroupPage.module.css", "weekly/weekly.module.css"];

/**
 * Where each card starts in `html`, by the attribute that names it, after
 * holding it to be drawn exactly once and the cards to come in the order
 * given (the phone's order). `cards` is `[[name, marker], …]`.
 */
export function phoneOrder(html, cards) {
  const at = {};
  for (const [name, marker] of cards) {
    assert.equal(html.split(marker).length, 2, `${name} is not drawn exactly once`);
    at[name] = html.indexOf(marker);
  }
  for (const [index, [name]] of cards.entries()) {
    if (index > 0) assert.ok(at[name] > at[cards[index - 1][0]], `${name} is above ${cards[index - 1][0]}`);
  }
  return at;
}

/** No rule and no class moves a card off its place in the markup, and each block folds into one column on a phone. */
export function assertNothingReorders(html) {
  assert.doesNotMatch(html, /class="(?:[^"]* )?order\d+[ "]/, "a card takes the run home's reordering classes");
  const css = SHEETS.map((sheet) => readFileSync(join(SRC, "features", "courses", sheet), "utf8")).join("\n");
  const LAYOUT = /\.(?:page|groupRows|columns|colMain|colSide|card|facCard|ticket)(?![\w-])/;
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, selector]) => LAYOUT.test(selector.split("*/").pop()));
  assert.ok(rules.length > 5, "the page's layout rules were not found");
  for (const [, selector, body] of rules) {
    assert.doesNotMatch(
      body,
      /(?:^|[\s;])order\s*:|row-reverse|column-reverse|grid-row\s*:|grid-area\s*:/,
      `${selector.trim()} moves a card away from its place in the markup`,
    );
  }
  const narrow = /@container facilitator \(max-width: 51\.24rem\) \{\s*\.groupRows \{[^}]*\}\s*\.columns \{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(narrow, /flex-direction: column;/, "the columns do not fold into one on a phone");
}

/**
 * The laptop's layout: the rows under the head, and its blocks of two
 * columns, each as `{ from, to }` in `html`; `column(block, "colMain" |
 * "colSide")` one column of a block, or null when the block draws none; and
 * `inside(range, at)` whether a card named at `at` is in it; `card(at)`
 * the whole element of the card named at `at`; and `where(at)` where a
 * laptop draws that card ("across", or "block 1 left" and so on).
 */
export function laptopLayout(html) {
  const elementAt = (from) => {
    const tag = /^<([a-z]+)/.exec(html.slice(from))[1];
    const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
    re.lastIndex = from;
    let depth = 0;
    for (let m = re.exec(html); m; m = re.exec(html)) {
      depth += m[0].startsWith("</") ? -1 : 1;
      if (depth === 0) return { from, to: m.index + m[0].length };
    }
    throw new Error(`no end to the element at ${from}`);
  };
  const start = html.indexOf('<div class="groupRows">');
  assert.ok(start >= 0, "the page has no rows under its head");
  const rows = elementAt(start);
  const blocks = [...html.slice(rows.from, rows.to).matchAll(/<div class="columns">/g)].map((m) => elementAt(rows.from + m.index));
  const column = (block, side) => {
    const at = html.indexOf(`<div class="${side}">`, block.from);
    return at >= 0 && at < block.to ? elementAt(at) : null;
  };
  const inside = (range, at) => Boolean(range) && at > range.from && at < range.to;
  /** The whole element of the card whose naming attribute is at `at`. */
  const card = (at) => elementAt(html.lastIndexOf("<", at));
  /**
   * Where a laptop draws the card named at `at`: "across" the page (under the
   * head, outside every block), or "block N left" / "block N right".
   */
  const where = (at) => {
    assert.ok(inside(rows, at), "the card is not under the head");
    for (const [index, block] of blocks.entries()) {
      if (!inside(block, at)) continue;
      if (inside(column(block, "colMain"), at)) return `block ${index + 1} left`;
      if (inside(column(block, "colSide"), at)) return `block ${index + 1} right`;
      return `block ${index + 1}, in no column`;
    }
    return "across";
  };
  return { rows, blocks, column, inside, card, where };
}
