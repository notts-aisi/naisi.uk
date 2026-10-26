/**
 * The programme crests are the design handoff of 26 Oct 2026, drawn by
 * nobody again (run via `npm test`, Node's built-in runner).
 *
 * A crest is four outlines and five themes written into
 * `src/components/ProgrammeCrest.tsx` as data, and a copy of artwork drifts:
 * a path tidied by hand, a colour nudged, an offset rounded. Nothing in a
 * build notices. So this file holds the drawing still from five sides:
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
 *  4. THE TOKENS ARE THE COMPONENT'S OWN FALLBACKS. A page reads the colour
 *     from `src/theme/tokens.css`; a crest drawn without the stylesheet
 *     reads the hex behind it. The two are one list.
 *  5. THE 32 FILES ARE THE HANDOFF'S, AND DRAW WHAT THE COMPONENT DRAWS.
 *     `public/brand/crests/` holds exactly the names the handoff's rule
 *     makes, each byte for byte (by its SHA-256, pinned once), and each
 *     file's view box, outlines, offset and inks are the component's in the
 *     same theme and cut.
 *
 * Changing a number below is a decision about the brand, made with a new
 * handoff, never a way to make this file pass.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
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

describe("the colour tokens", () => {
  const css = readFileSync(join(REPO_ROOT, "src/theme/tokens.css"), "utf8");
  const declared = [...css.matchAll(/(--programme-[a-z-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]);

  test("each programme's token is declared once, with the component's own fallback as its value", () => {
    assert.deepEqual(
      declared,
      CREST_KEYS.map((key) => [`--programme-${key}`, CREST_COLOURS[key]]),
      "tokens.css and CREST_COLOURS disagree: the page and a crest drawn without the stylesheet would differ",
    );
  });

  test("the governance crest's colour is its own value, not the marker's token", () => {
    // `--color-marker` is the homepage's, for one aside a page. A crest that
    // read it would change colour whenever the marker was retuned.
    for (const [, value] of declared) assert.doesNotMatch(value, /var\(/);
  });
});

describe("the 32 files in public/brand/crests", () => {
  const DIR = "public/brand/crests";

  /**
   * Each file's SHA-256, computed once from the handoff of 26 Oct 2026. The
   * files are for the places a component cannot go (link previews, emails,
   * print), so they are served as they were drawn and never edited here.
   */
  const FILES = {
    "naisi-crest-agi-strategy-navy.svg": "e1560ce60b2f3b9c2734a8304228d8ff6e7ca8e5a4d7689a89156cee85ccbf56",
    "naisi-crest-agi-strategy-night-small.svg": "e2d82690fb933451b2321f928a2a595769c1e50c4412223287d4a2650bc52a6f",
    "naisi-crest-agi-strategy-night.svg": "f3b785a68dc6ffbcbe585cc6d3ba6010ce3106b0efa75c11e1f6d8c2adfda1ab",
    "naisi-crest-agi-strategy-paper-small.svg": "6080e4085ae1e6cb56a95a828e9a0b6a3c20b19201c77f783baaf6b8cae53ceb",
    "naisi-crest-agi-strategy-paper.svg": "663eb17790ac3f8d4311e2ffbc58f1a4eab33905b193e04ac553725137e45676",
    "naisi-crest-agi-strategy-solid-small.svg": "1df1108e93c42a5d18cffe04786c46de24f262fc35769422272715e160141665",
    "naisi-crest-agi-strategy-solid.svg": "27518cc2246669512f31b3c58b29c8d71b797ed73cd0607185bde44ecf69a106",
    "naisi-crest-agi-strategy-white.svg": "f2aee00961ba621a94cffcd8e930a4e528d833e7702abe6fbb14b2bf2e281eb5",
    "naisi-crest-alignment-navy.svg": "e00129bee2bb2104110b59d2613c54d4c2128fc9a03b90b9a994953c2f7a19bd",
    "naisi-crest-alignment-night-small.svg": "3d0c78c3aef6ce8fae3336f9b601df2cdfae2f2bade50bcdd4e0e8aa9a311f6b",
    "naisi-crest-alignment-night.svg": "7967bb1f5cc75279d8e729884ddfbc46b3806164cbfe1220ba3e8de626f63e30",
    "naisi-crest-alignment-paper-small.svg": "76e84a0878c1c927e9ffa237fbb915adcd30635d3593e3969bd9d86bf1cd6a5c",
    "naisi-crest-alignment-paper.svg": "23c13525becce12243bc217b5b202191cc793ed8a811be4a252e776281369172",
    "naisi-crest-alignment-solid-small.svg": "882a07dabdccb82c7d3bb41e691e9287346d87271b8b5183392cf9a92f3bae39",
    "naisi-crest-alignment-solid.svg": "a299a1746908d403de0efc7376a811a3c98ccd6a1217e407874e6925ca3c4e7d",
    "naisi-crest-alignment-white.svg": "0fe117e64d9648a3cbf70aade7334b4a045a4c64d4666230c789e71a0a3617f7",
    "naisi-crest-governance-macrostrategy-navy.svg": "65413bf03cae0abd706c795a7e8894233322a66ecaf1632666a2543104193000",
    "naisi-crest-governance-macrostrategy-night-small.svg": "5b442c244dfc95687a1bcb9fa6d95bf98eaff57dd2f0bea2170f59dfe2e1e751",
    "naisi-crest-governance-macrostrategy-night.svg": "fe8f42f17467a37aa337e6a27aae549708b801d6c5dfb7442d27499eec5518b6",
    "naisi-crest-governance-macrostrategy-paper-small.svg": "11df8975cd90577674bcc6c3c6ef6fbe496bd57b9bb78e58b8b29f634d74f905",
    "naisi-crest-governance-macrostrategy-paper.svg": "1dd95935a01ddd213f54059269b65defcad8b845a706ca746722f81005b67cdd",
    "naisi-crest-governance-macrostrategy-solid-small.svg": "8f032479db8c9802274065d4ec8760ccbf9eabf2a16c506f7f218eadd52516fa",
    "naisi-crest-governance-macrostrategy-solid.svg": "90cab55913352e9a090674009619b4ee461545b1a90a70170e74abd818134705",
    "naisi-crest-governance-macrostrategy-white.svg": "430b22bff3e0c730cfe629b43e3a684e71745f68b8d1eef115af3b5555ebb3d5",
    "naisi-crest-technical-ai-safety-navy.svg": "0b626e362c5b17fbe053f4ae24281efeb4aeafec407876711e3d9f6ca8b3602b",
    "naisi-crest-technical-ai-safety-night-small.svg": "48de9b328f028882c9d261241a4b482f6e9cc4c4a4190802a37ee7c1b5a5feac",
    "naisi-crest-technical-ai-safety-night.svg": "68fa9e5b1fd3eabdc03a2b4d5c20b88147a02f79859487b497f763d90e6c2dae",
    "naisi-crest-technical-ai-safety-paper-small.svg": "fb1bd02f3dbad62f8b0d72e7c7b7881b1772f0c773445a062c07e42e589d2239",
    "naisi-crest-technical-ai-safety-paper.svg": "790bf8583d417beb4d8877689485bf99af51d611e98883dbd8cff516bbdf87b5",
    "naisi-crest-technical-ai-safety-solid-small.svg": "4e7db099e0dd42e8e0adcde28e4ac9dc47c1e67176b6849c07ca3078cd59fa5b",
    "naisi-crest-technical-ai-safety-solid.svg": "5dde39d668cd7d8f40e8a13b0d63ff1a71460a4602a044c0c00d26e40c0bdfe0",
    "naisi-crest-technical-ai-safety-white.svg": "9c390037d6e41cec0b16f31f23ec7989d53a7cf49461bc8d2b64873ac083f8fd",
  };

  /** What each name says it is: `naisi-crest-<key>-<theme>[-small].svg`. */
  function described(name) {
    for (const key of CREST_KEYS) {
      const prefix = `naisi-crest-${key}-`;
      if (!name.startsWith(prefix)) continue;
      const rest = name.slice(prefix.length).replace(/\.svg$/, "");
      const [theme, cut] = rest.split("-");
      return { key, theme, small: cut === "small" };
    }
    return null;
  }

  /** The names the handoff's rule makes: night, solid and paper in two cuts, white and navy in one. */
  const EXPECTED = CREST_KEYS.flatMap((key) => [
    ...["night", "solid", "paper"].flatMap((theme) => [
      `naisi-crest-${key}-${theme}.svg`,
      `naisi-crest-${key}-${theme}-small.svg`,
    ]),
    `naisi-crest-${key}-white.svg`,
    `naisi-crest-${key}-navy.svg`,
  ]).sort();

  const on = readdirSync(join(REPO_ROOT, DIR)).filter((name) => name !== ".DS_Store").sort();
  const read = (name) => readFileSync(join(REPO_ROOT, DIR, name));

  test("the folder holds the 32 files the handoff made, and nothing else", () => {
    assert.equal(EXPECTED.length, 32);
    assert.deepEqual(Object.keys(FILES).sort(), EXPECTED, "the pinned list is not the handoff's 32");
    assert.deepEqual(on, EXPECTED, `${DIR} and the handoff's 32 files disagree`);
  });

  test("each file is the handoff's, byte for byte", () => {
    for (const name of on) {
      assert.equal(createHash("sha256").update(read(name)).digest("hex"), FILES[name], `${DIR}/${name} has changed`);
    }
  });

  test("each file draws exactly what the component draws in that theme and cut", () => {
    /** An ink, whether written as an attribute or as the component's token with its fallback. */
    const ink = (value) => value?.match(/#[0-9a-f]{6}/i)?.[0].toLowerCase() ?? null;
    for (const name of on) {
      const { key, theme, small } = described(name);
      const file = read(name).toString("utf8");
      const fileSvg = file.match(/<svg\b[^>]*>/)[0];
      const filePaths = [...file.matchAll(/<path\b[^>]*>/g)].map(([tag]) => ({
        d: attr(tag, "d"),
        transform: attr(tag, "transform"),
        fillRule: attr(tag, "fill-rule"),
        ink: ink(attr(tag, "fill")),
      }));
      const size = small ? 48 : 240;
      const html = render({ crest: key, theme, size });
      const drawn = pathsOf(html).map((path) => ({
        d: path.d,
        transform: path.transform,
        fillRule: path.fillRule,
        ink: ink(path.style),
      }));
      assert.equal(attr(fileSvg, "viewBox"), attr(svgTag(html), "viewBox"), `${name}: the view box`);
      assert.deepEqual(filePaths, drawn, `${name}: the outlines, the offset or the inks`);
      assert.equal(attr(fileSvg, "aria-label"), `${crestName(key)} crest`, `${name}: its name`);
    }
  });
});
