/**
 * The public layout's <main> must not become the box its fixed-position
 * descendants are placed in.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * An element with a transform (or a filter, a perspective, `will-change` of
 * one of those, or paint or layout containment) is the containing block for
 * every `position: fixed` element inside it. "Fixed" then means fixed to that
 * element and not to the window.
 *
 * Until October 2026 the public pages' entrance animation ended on
 * `transform: translateY(0)` and held it, so <main> stayed a transformed
 * element for good. Three things inside public pages are fixed: the
 * spam-check badge a form with reCAPTCHA renders, a page's detail popup, and
 * a toast. The badge is fixed with most of itself past the right edge of the
 * window by design. Inside a transformed <main> it sat at the foot of the
 * page instead of the window, and its hidden part widened the document: on a
 * 375px phone the event page was 561px wide and scrolled sideways.
 *
 * The browser suite measures that page on a phone, but only once the badge
 * has arrived, which depends on the network. This test holds the cause
 * instead: the stylesheet and the component that draw <main> never leave it
 * with a property that would make it that box.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS_PATH = join(REPO_ROOT, "src", "layout", "PublicMain.module.css");
const TSX_PATH = join(REPO_ROOT, "src", "layout", "PublicMain.tsx");

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, " ");

/** Top-level blocks of a stylesheet: `{ prelude, body }`, nesting respected. */
function blocks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  let prelude = "";
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) {
        prelude = css.slice(start, i).trim();
        start = i + 1;
      }
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        out.push({ prelude, body: css.slice(start, i) });
        start = i + 1;
      }
    }
  }
  return out;
}

/** Declarations of a flat rule body, as `[property, value]` pairs. */
function declarations(body) {
  return body
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.includes(":") && !part.includes("{"))
    .map((part) => {
      const at = part.indexOf(":");
      return [part.slice(0, at).trim().toLowerCase(), part.slice(at + 1).trim().toLowerCase()];
    });
}

/** Does this declaration make its element the box for fixed descendants? */
function makesAFixedBox([property, value]) {
  if (["transform", "filter", "backdrop-filter", "perspective", "translate", "rotate", "scale"].includes(property)) {
    return value !== "none";
  }
  if (property === "will-change") return /transform|filter|perspective|translate|rotate|scale/.test(value);
  if (property === "contain") return /paint|layout|strict|content/.test(value);
  if (property === "container-type") return value !== "normal";
  return false;
}

const css = stripComments(readFileSync(CSS_PATH, "utf8"));
const top = blocks(css);

/** Every keyframes block, wherever it is declared, by name. */
function keyframes() {
  const found = new Map();
  const visit = (list) => {
    for (const block of list) {
      const named = /^@keyframes\s+([\w-]+)/.exec(block.prelude);
      if (named) found.set(named[1], blocks(block.body));
      else if (block.prelude.startsWith("@")) visit(blocks(block.body));
    }
  };
  visit(top);
  return found;
}

/** Every plain rule, wherever it is declared (inside a media block too). */
function rules() {
  const found = [];
  const visit = (list) => {
    for (const block of list) {
      if (block.prelude.startsWith("@keyframes")) continue;
      if (block.prelude.startsWith("@")) visit(blocks(block.body));
      else found.push(block);
    }
  };
  visit(top);
  return found;
}

test("the stylesheet was read, and has the rule and the entrances this test is about", () => {
  assert.ok(rules().some((rule) => rule.prelude.split(",").some((s) => s.trim() === ".main")));
  assert.ok(keyframes().size >= 2, "expected the entrance and exit keyframes");
});

test("no rule leaves <main> a transformed or contained element at rest", () => {
  const offenders = [];
  for (const rule of rules()) {
    // `.exiting` is the page leaving: nothing is read or pressed while it runs.
    if (/\.exiting\b/.test(rule.prelude)) continue;
    for (const declaration of declarations(rule.body)) {
      if (makesAFixedBox(declaration)) offenders.push(`${rule.prelude} { ${declaration.join(": ")} }`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "this would make <main> the box its fixed-position descendants are placed in, " +
      "and the spam-check badge would widen the page on a phone. For a stacking context use `isolation: isolate`.",
  );
});

test("an entrance that is held after it ends, ends on no transform", () => {
  const held = [];
  for (const rule of rules()) {
    if (/\.exiting\b/.test(rule.prelude)) continue;
    for (const [property, value] of declarations(rule.body)) {
      if (property !== "animation" && property !== "animation-name") continue;
      // `both` and `forwards` keep the last keyframe's values for good.
      const holds = property === "animation-name" || /\b(both|forwards)\b/.test(value);
      const name = [...keyframes().keys()].find((key) => new RegExp(`(^|\\s)${key}(\\s|$)`).test(value));
      if (holds && name) held.push([rule.prelude, name]);
    }
  }
  assert.ok(held.length > 0, "expected <main>'s entrance to be found");
  for (const [prelude, name] of held) {
    const frames = keyframes().get(name);
    const last = frames.filter((frame) => /(^|,)\s*(to|100%)\s*(,|$)/.test(frame.prelude));
    assert.ok(last.length > 0, `${name} has no last keyframe`);
    for (const frame of last) {
      const offenders = declarations(frame.body).filter(makesAFixedBox);
      assert.deepEqual(
        offenders,
        [],
        `${prelude} holds the last keyframe of ${name}, which must end on \`transform: none\` (not an identity transform)`,
      );
    }
  }
});

test("the component gives <main> an inline transform only for the frame before the entrance", () => {
  const source = readFileSync(TSX_PATH, "utf8");
  const inline = [...source.matchAll(/transform:\s*"([^"]+)"/g)].map((found) => found[1]);
  // One inline transform, the entrance's own first frame, set only while the
  // page is about to animate in and dropped when the animation class lands.
  assert.deepEqual(inline, ["translateY(4px)"]);
  assert.match(source, /arrivedByNavigation && !animate && !exiting\s*\?\s*\(\{ opacity: 0, transform: "translateY\(4px\)" \} as const\)\s*:\s*undefined/);
});
