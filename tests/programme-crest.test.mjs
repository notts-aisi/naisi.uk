/**
 * The programme crests are the design handoff of 26 Oct 2026, drawn by
 * nobody again (run via `npm test`, Node's built-in runner).
 *
 * A crest is four outlines and five themes written into
 * `src/components/ProgrammeCrest.tsx` as data, and a copy of artwork drifts:
 * a path tidied by hand, a colour nudged, an offset rounded. Nothing in a
 * build notices. So this file holds the drawing still from three sides:
 *
 *  1. THE COMPONENT DRAWS WHAT THE HANDOFF DREW. Every crest, in every theme,
 *     at each side of the cut and at the cut itself, is rendered for real and
 *     the drawing (view box, size, every outline, its offset and its ink) is
 *     reduced to one SHA-256. The number below was computed once, on 26 Oct
 *     2026, by rendering the handoff's own component file through this
 *     repository's loader, and this copy of it gives the same number. The
 *     handoff itself is not in the repository and is not read here.
 *  2. THE RULES THE HANDOFF STATES ARE TRUE OF WHAT IS DRAWN: the small cut
 *     under 72px with the offset further out, one ink and no offset in white
 *     and navy, the programme's colour as a token with its own hex behind it,
 *     and a crest hidden from assistive technology unless it is given a name.
 *  3. A CREST IS ONLY EVER ONE OF THE FOUR KEYS. `isCrestKey` is what every
 *     reader and writer of a stored `crest` asks, so it is held to exactly
 *     the four, and nothing that merely resembles one.
 *
 * Changing the number below is a decision about the brand, made with a new
 * handoff, never a way to make this file pass.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";

const { loadTs } = createLoader({ stubs: new Map() });
const crests = await loadTs("components/ProgrammeCrest.tsx");
const { CREST_KEYS, CREST_COLOURS, ProgrammeCrest, crestName, isCrestKey } = crests;

/**
 * SHA-256 of the drawing below, computed once from the handoff of 26 Oct
 * 2026 (its own `ProgrammeCrest.tsx`, rendered through `tests/lib/tsLoader.mjs`).
 */
const HANDOFF_DRAWING_SHA256 = "e827829a10b86b5bb5876332a4d8bfcc7090806c02c462f1ddd3000cdc933a59";

const THEMES = ["night", "solid", "paper", "white", "navy"];
/** Large, the cut itself, the first size of the small cut, and a small size. */
const SIZES = [240, 72, 71, 48];

const render = (props) => renderToStaticMarkup(createElement(ProgrammeCrest, props));
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1] ?? null;
const svgTag = (html) => html.match(/^<svg\b[^>]*>/)[0];
const pathsOf = (html) =>
  [...html.matchAll(/<path\b[^>]*>/g)].map(([tag]) => ({
    d: attr(tag, "d"),
    transform: attr(tag, "transform"),
    fillRule: attr(tag, "fill-rule"),
    style: attr(tag, "style"),
  }));

/** Everything the component draws, in a fixed order, as one value. */
function drawing() {
  const out = [];
  for (const crest of CREST_KEYS) {
    for (const theme of THEMES) {
      for (const size of SIZES) {
        const html = render({ crest, theme, size });
        const svg = svgTag(html);
        out.push({
          crest,
          theme,
          size,
          viewBox: attr(svg, "viewBox"),
          width: attr(svg, "width"),
          height: attr(svg, "height"),
          paths: pathsOf(html),
        });
      }
    }
  }
  return out;
}

describe("the component draws the handoff", () => {
  test("the drawing, the colours, the names and the keys are the handoff's, to the character", () => {
    const names = Object.fromEntries(CREST_KEYS.map((key) => [key, crestName(key)]));
    const digest = createHash("sha256")
      .update(JSON.stringify({ drawing: drawing(), colours: CREST_COLOURS, names, keys: CREST_KEYS }))
      .digest("hex");
    assert.equal(
      digest,
      HANDOFF_DRAWING_SHA256,
      "ProgrammeCrest.tsx no longer draws what the handoff of 26 Oct 2026 drew. The crests are never redrawn: put the outline, the offset or the colour back.",
    );
  });

  test("the four programmes, their names and their colours", () => {
    assert.deepEqual([...CREST_KEYS], ["agi-strategy", "technical-ai-safety", "governance-macrostrategy", "alignment"]);
    assert.deepEqual(
      CREST_KEYS.map((key) => crestName(key)),
      [
        "AGI Strategy Fellowship",
        "Technical AI Safety Fellowship",
        "Governance and Macrostrategy Research Incubator",
        "Alignment Research Incubator",
      ],
    );
    assert.deepEqual(CREST_COLOURS, {
      "agi-strategy": "#ffc530",
      "technical-ai-safety": "#4d8eff",
      "governance-macrostrategy": "#ff4b1f",
      alignment: "#3ddc97",
    });
  });
});

describe("the rules the handoff states", () => {
  test("72px and up is the large cut: offset 6, the body moved down and to the left", () => {
    for (const crest of CREST_KEYS) {
      const html = render({ crest, size: 72 });
      const [offset, body] = pathsOf(html);
      assert.equal(offset.transform, "translate(-6 6)", crest);
      assert.equal(offset.d, body.d, `${crest}: the offset is the whole body, repeated`);
      assert.match(attr(svgTag(html), "viewBox"), /^-6 0 /, crest);
    }
  });

  test("under 72px is the small cut: offset 9, drawn in place with the glyph knocked through", () => {
    for (const crest of CREST_KEYS) {
      const html = render({ crest, size: 71 });
      const [offset, body] = pathsOf(html);
      assert.equal(offset.transform, null, crest);
      assert.notEqual(offset.d, body.d, crest);
      assert.match(attr(svgTag(html), "viewBox"), /^-9 0 /, crest);
      assert.match(offset.d, /^M-9 /, `${crest}: the small cut's offset starts 9 to the left`);
    }
  });

  test("the height is the size asked for, and the width follows the crest", () => {
    for (const crest of CREST_KEYS) {
      for (const size of [128, 64, 48, 44, 28]) {
        const svg = svgTag(render({ crest, size }));
        assert.equal(attr(svg, "height"), String(size));
        const [, , w, h] = attr(svg, "viewBox").split(" ").map(Number);
        const width = Number(attr(svg, "width"));
        assert.ok(Math.abs(width - (size * w) / h) < 0.01, `${crest} at ${size}: ${width} wide`);
      }
    }
  });

  test("white and navy are one ink with no offset", () => {
    for (const crest of CREST_KEYS) {
      for (const [theme, ink] of [
        ["white", "#ffffff"],
        ["navy", "#1b5577"],
      ]) {
        const html = render({ crest, theme, size: 240 });
        const paths = pathsOf(html);
        assert.equal(paths.length, 1, `${crest} ${theme}`);
        assert.equal(paths[0].style, `fill:${ink}`);
        assert.match(attr(svgTag(html), "viewBox"), /^0 0 /);
      }
    }
  });

  test("the programme's colour is its token, with the token's own value behind it", () => {
    for (const crest of CREST_KEYS) {
      const token = `fill:var(--programme-${crest}, ${CREST_COLOURS[crest]})`;
      const [nightOffset, nightBody] = pathsOf(render({ crest, theme: "night", size: 128 }));
      assert.deepEqual([nightOffset.style, nightBody.style], [token, "fill:#ffffff"], `${crest} night`);
      const [solidOffset, solidBody] = pathsOf(render({ crest, theme: "solid", size: 128 }));
      assert.deepEqual([solidOffset.style, solidBody.style], ["fill:#ffffff", token], `${crest} solid`);
      const [paperOffset, paperBody] = pathsOf(render({ crest, theme: "paper", size: 128 }));
      assert.deepEqual([paperOffset.style, paperBody.style], [token, "fill:#1b5577"], `${crest} paper`);
    }
  });

  test("night is the default theme", () => {
    for (const crest of CREST_KEYS) {
      assert.equal(render({ crest, size: 44 }), render({ crest, theme: "night", size: 44 }));
    }
  });

  test("with no title the crest is hidden from assistive technology; with one it is a named picture", () => {
    for (const crest of CREST_KEYS) {
      const quiet = svgTag(render({ crest, size: 44 }));
      assert.equal(attr(quiet, "aria-hidden"), "true");
      assert.equal(attr(quiet, "role"), null);
      assert.equal(attr(quiet, "aria-label"), null);
      const named = svgTag(render({ crest, size: 128, title: crestName(crest) }));
      assert.equal(attr(named, "role"), "img");
      assert.equal(attr(named, "aria-label"), crestName(crest));
      assert.equal(attr(named, "aria-hidden"), null);
    }
  });
});

describe("a crest is one of the four keys and nothing else", () => {
  test("each key is one", () => {
    for (const key of CREST_KEYS) assert.equal(isCrestKey(key), true, key);
  });

  test("nothing that resembles one is", () => {
    const near = [
      "",
      "Alignment",
      " alignment",
      "alignment ",
      "agi_strategy",
      "agi-strategy-fellowship",
      "governance",
      "technical",
      "__proto__",
      "constructor",
      "toString",
      "hasOwnProperty",
      null,
      undefined,
      0,
      1,
      true,
      {},
      ["alignment"],
      { crest: "alignment" },
      new String("alignment"),
    ];
    for (const value of near) assert.equal(isCrestKey(value), false, JSON.stringify(value));
  });
});
