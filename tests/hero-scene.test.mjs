/**
 * The homepage's animated scene: `src/features/hero/`.
 *
 * Run with `npm test` (Node's built-in runner, no browser, no emulator).
 *
 * The scene is a script the design ships, wrapped so the site can start and
 * stop it. Four things about that arrangement can go wrong without anything
 * else noticing, and each is held here.
 *
 *  1. THE ENGINE IS KEPT AS SHIPPED. `engine.js` carries the design's script
 *     between two marker comments. Its checksum is recorded below, so a tidy,
 *     a reformat or a "small fix" inside the block fails. To take a new
 *     version of the scene, replace the block and the checksum together, then
 *     read the rest of this file: the checks after it say what the new script
 *     has to keep doing.
 *
 *  2. THE CONTRACT WITH THE PAGE IS THE ONE THE ENGINE READS. The engine
 *     finds things on the page by attribute. The attributes it looks for are
 *     read out of its own text and compared with the ones the site's pieces
 *     write, in both directions, and the emblem the page draws is compared
 *     with the emblem the scene is registered to.
 *
 *  3. THE SCRIPT STAYS OUT OF THE PAGE'S FIRST LOAD, AND BEHIND ITS WORDS.
 *     Only `scene.ts` imports the engine, only `mount.ts` imports `scene.ts`,
 *     and `HeroScene.tsx` reaches `mount.ts` by a dynamic import alone. The
 *     component is a client component and its canvas is hidden from assistive
 *     technology.
 *
 *  4. IT STOPS WHEN IT SHOULD, AND GIVES BACK WHAT IT TOOK. The shipping
 *     modules are executed here against a page made of plain objects: under
 *     reduced motion the scene paints one still frame and never asks for an
 *     animation frame; with motion it asks for one at a time; stopping it
 *     cancels the frame, removes every listener, disconnects every observer
 *     and leaves the page's markup as the server sent it. The rules about
 *     when a drag on the hero is held are executed the same way.
 *
 * What this cannot see: anything a browser decides. Whether a held drag
 * really keeps the page still, whether a link is still followed by touch and
 * whether the layout moves when the script arrives are checked in a browser,
 * by hand or by an end-to-end spec.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const HERO = join(SRC, "features", "hero");
const read = (name) => readFileSync(join(HERO, name), "utf8");
const repoPath = (file) => file.slice(REPO_ROOT.length + 1).split(sep).join("/");

const ENGINE = read("engine.js");
const BEGIN = "/* engine:begin */\n";
const END = "\n/* engine:end */";

/**
 * SHA-256 of the block between the two markers in `engine.js`: the design's
 * script exactly as it shipped.
 */
const ENGINE_SHA256 = "e1979800c011b423aa9cf5b8130657bd5a1bb45a84dc356bde0170ff7800c59a";

/** The engine as a module. Loading it touches nothing: it only acts when asked to create a scene. */
const engineModule = `data:text/javascript;base64,${Buffer.from(ENGINE, "utf8").toString("base64")}`;
const { default: NH } = await import(engineModule);

// ---------------------------------------------------------------------------
// 1. Kept as shipped
// ---------------------------------------------------------------------------

describe("the engine is kept as shipped", () => {
  test("the block between the markers is the design's script, unchanged", () => {
    const from = ENGINE.indexOf(BEGIN);
    const to = ENGINE.indexOf(END);
    assert.ok(from !== -1 && to > from, "engine.js has lost one of its two marker comments");
    const block = ENGINE.slice(from + BEGIN.length, to);
    assert.equal(
      createHash("sha256").update(block, "utf8").digest("hex"),
      ENGINE_SHA256,
      "the script between the markers in src/features/hero/engine.js has changed. It is kept exactly " +
        "as the design ships it. If this is a new version of the scene, replace the whole block and " +
        "record its checksum here; otherwise undo the edit.",
    );
  });

  test("outside the markers there is one export and nothing else that runs", () => {
    const from = ENGINE.indexOf(BEGIN);
    const to = ENGINE.indexOf(END);
    const outside = (ENGINE.slice(0, from) + ENGINE.slice(to + END.length))
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .trim();
    assert.equal(outside, "export default NH;");
  });

  test("one lint rule is switched off for the file, with its reason", () => {
    const directives = [...ENGINE.matchAll(/eslint-disable[^\n]*/g)].map((m) => m[0]);
    assert.equal(directives.length, 1, "engine.js should carry exactly one eslint-disable comment");
    assert.match(directives[0], /^eslint-disable @typescript-eslint\/no-unused-vars -- \S/);
  });
});

// ---------------------------------------------------------------------------
// 2. The contract with the page
// ---------------------------------------------------------------------------

/** One fresh copy of the hero's own modules, with the real engine behind `scene.ts`. */
async function loadHero() {
  const { loadTs } = createLoader({ stubs: [["./engine.js", ENGINE]] });
  return {
    mount: await loadTs("features/hero/mount.ts"),
    keepOut: await loadTs("features/hero/keepOut.ts"),
    markArt: await loadTs("features/hero/markArt.ts"),
  };
}

describe("the page gives the engine what it looks for", () => {
  test("the engine finds four things on the page, and the README's contract is about those four", () => {
    const found = new Set([...ENGINE.matchAll(/querySelector(?:All)?\('\[(data-[a-z-]+)\]'\)/g)].map((m) => m[1]));
    assert.deepEqual(
      [...found].sort(),
      ["data-accent-text", "data-keepout", "data-mark", "data-word"],
      "the engine now looks for a different set of attributes. Update parts.tsx and the contract in " +
        "src/features/hero/README.md to match, then this list.",
    );
    const readme = read("README.md");
    for (const name of found) assert.ok(readme.includes(`### \`${name}`), `README.md has no section for ${name}`);
  });

  test("a zone carries exactly the attributes the engine reads from it", async () => {
    const read = new Set([...ENGINE.matchAll(/getAttribute\('(data-[a-z-]+)'\)/g)].map((m) => m[1]));
    const { keepOut } = (await loadHero()).keepOut;
    assert.deepEqual(Object.keys(keepOut("lede")).sort(), [...read].sort());
    for (const value of Object.values(keepOut("lede"))) assert.equal(typeof value, "string");
  });

  test("every named zone is drawn by a piece, and the two the engine reads by name exist", async () => {
    const { KEEP_OUT } = (await loadHero()).keepOut;
    const pieces = stripSource(read("parts.tsx") + read("HeroScene.tsx"), { keepStrings: true });
    for (const name of Object.keys(KEEP_OUT)) {
      assert.ok(pieces.includes(`keepOut("${name}")`), `no piece draws the zone "${name}"`);
    }
    // The scene takes the top of its network from one zone and its floor from another.
    const byName = new Set([...ENGINE.matchAll(/\bR\.([a-z]+)\b/g)].map((m) => m[1]));
    assert.deepEqual([...byName].sort(), ["header", "tagline"]);
    for (const name of byName) assert.ok(name in KEEP_OUT, `the engine reads a zone named "${name}" that no piece draws`);
  });

  test("the emblem the page draws is the emblem the scene is registered to", async () => {
    const { MARK_SHAPES, MARK_VIEW_BOX } = (await loadHero()).markArt;
    assert.deepEqual(MARK_SHAPES.map((shape) => shape.d), [...NH.BODY_D]);
    assert.equal(MARK_VIEW_BOX, NH.MARK_VB.join(" "));
    const pieces = read("parts.tsx");
    assert.ok(pieces.includes('data-mark=""'), "the emblem has lost the attribute the scene finds it by");
    assert.ok(pieces.includes('data-accent-text=""'), "the accent has lost the attribute the scene types into");
  });
});

// ---------------------------------------------------------------------------
// 3. Out of the first load, behind the words
// ---------------------------------------------------------------------------

function sourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, out);
    else if (/\.(?:tsx?|m?js)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

/** Every file under src that imports `target` (a path without its extension), and how. */
function importersOf(target) {
  const STATIC = /(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/g;
  const DYNAMIC = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
  const hits = new Set();
  for (const file of sourceFiles(SRC)) {
    if (file === join(HERO, "engine.js")) continue;
    const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
    for (const [pattern, how] of [[STATIC, "static"], [DYNAMIC, "dynamic"]]) {
      for (const [, specifier] of code.matchAll(pattern)) {
        if (!specifier.startsWith(".") && !specifier.startsWith("@/")) continue;
        const base = specifier.startsWith("@/") ? join(SRC, specifier.slice(2)) : resolve(dirname(file), specifier);
        if (base.replace(/\.(?:tsx?|js)$/, "") === target) hits.add(`${repoPath(file)} (${how})`);
      }
    }
  }
  return [...hits].sort();
}

describe("the scene's script is fetched after the page, through one door", () => {
  test("only scene.ts imports the engine", () => {
    assert.deepEqual(importersOf(join(HERO, "engine")), ["src/features/hero/scene.ts (static)"]);
  });

  test("only mount.ts imports scene.ts", () => {
    assert.deepEqual(importersOf(join(HERO, "scene")), ["src/features/hero/mount.ts (static)"]);
  });

  test("only HeroScene.tsx reaches mount.ts, and only by a dynamic import", () => {
    assert.deepEqual(importersOf(join(HERO, "mount")), ["src/features/hero/HeroScene.tsx (dynamic)"]);
  });

  test("HeroScene is a client component and its canvas is hidden from assistive technology", () => {
    const source = read("HeroScene.tsx");
    assert.match(source, /^["']use client["'];/, 'HeroScene.tsx must open with "use client"');
    const canvases = [...source.matchAll(/<canvas\b[^>]*>/g)].map((m) => m[0]);
    assert.equal(canvases.length, 1, "HeroScene draws one canvas");
    assert.match(canvases[0], /aria-hidden="true"/);
  });

  test("the pieces a page puts inside are not client components", () => {
    for (const name of ["parts.tsx", "keepOut.ts", "markArt.ts"]) {
      assert.doesNotMatch(read(name), /["']use client["']/, `${name} is rendered on the server and ships no script`);
    }
  });
});

// ---------------------------------------------------------------------------
// The script and the stylesheet agree
// ---------------------------------------------------------------------------

describe("the script and the stylesheet pick the same form", () => {
  const css = read("HeroScene.module.css");
  const mediaConditions = [...css.matchAll(/@media\s*([^{]+?)\s*\{/g)].map((m) => m[1]);

  test("the two conditions mount.ts reads are the ones the stylesheet lays the hero out on", async () => {
    const { PHONE_QUERY, STACKED_QUERY } = (await loadHero()).mount;
    assert.equal(PHONE_QUERY, "(max-width: 48rem)");
    assert.equal(STACKED_QUERY, "(max-width: 60rem), (orientation: portrait)");
    assert.ok(mediaConditions.includes(PHONE_QUERY), "the stylesheet has no block for the phone condition");
    assert.ok(mediaConditions.includes(STACKED_QUERY), "the stylesheet has no block for the stacked condition");
  });

  test("the stylesheet ends with the house mobile block, and no condition reads a custom property", () => {
    assert.equal(mediaConditions.at(-1), "(max-width: 48rem)");
    for (const condition of mediaConditions) assert.ok(!condition.includes("var("), `a media condition reads a custom property: ${condition}`);
  });

  test("a drag is held by one rule, which cannot apply under reduced motion", () => {
    assert.equal(css.split("touch-action").length - 1, 1, "touch-action is set in exactly one place");
    const at = css.indexOf("touch-action");
    const block = css.lastIndexOf("@media", at);
    assert.match(css.slice(block, at), /^@media \(prefers-reduced-motion: no-preference\) \{\s*\.root\[data-hold\] \{\s*$/);
  });
});

// ---------------------------------------------------------------------------
// 4. A page made of plain objects, for executing the shipping modules
// ---------------------------------------------------------------------------

const QUERIES = {
  reduced: "(prefers-reduced-motion: reduce)",
  phone: "(max-width: 48rem)",
  stacked: "(max-width: 60rem), (orientation: portrait)",
};

function listeners() {
  const list = [];
  return {
    list,
    addEventListener(type, fn, capture = false) {
      list.push({ type, fn, capture: Boolean(capture) });
    },
    removeEventListener(type, fn, capture = false) {
      const at = list.findIndex((l) => l.type === type && l.fn === fn && l.capture === Boolean(capture));
      if (at !== -1) list.splice(at, 1);
    },
    fire(type, event) {
      for (const l of [...list].sort((a, b) => Number(b.capture) - Number(a.capture))) {
        if (l.type === type) l.fn(event);
      }
    },
  };
}

/**
 * A hero on a screen: a root with the pieces the engine measures, a canvas
 * that counts what is drawn on it, and the handful of window and document
 * members the hero's modules touch. `form` sets which media conditions hold.
 */
function fakePage({ form = "phone", reduced = false, width = 390, height = 844, screen = height, accentOpacity = "1" } = {}) {
  const log = { frames: new Map(), asked: 0, nextFrame: 1, cleared: 0, drawn: 0, observers: [], dispatched: [] };
  const all = [];
  const events = () => {
    const l = listeners();
    all.push(l);
    return l;
  };

  const context = new Proxy(
    {},
    {
      get(target, key) {
        if (key in target) return target[key];
        if (key === "createRadialGradient" || key === "createLinearGradient") return () => ({ addColorStop() {} });
        return () => {
          log.drawn += 1;
          if (key === "clearRect") log.cleared += 1;
        };
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    },
  );
  const canvasLike = () => ({ width: 0, height: 0, getContext: () => context });

  const matches = { [QUERIES.reduced]: reduced, [QUERIES.phone]: form === "phone", [QUERIES.stacked]: form !== "desktop" };
  const media = new Map();
  const matchMedia = (query) => {
    if (!media.has(query)) {
      const l = events();
      media.set(query, {
        media: query,
        get matches() {
          return Boolean(matches[query]);
        },
        addEventListener: l.addEventListener,
        removeEventListener: l.removeEventListener,
        fire: l.fire,
      });
    }
    return media.get(query);
  };

  class Observer {
    constructor(callback) {
      this.callback = callback;
      this.watching = new Set();
      this.disconnected = false;
      log.observers.push(this);
    }
    observe(el) {
      this.watching.add(el);
    }
    disconnect() {
      this.watching.clear();
      this.disconnected = true;
    }
  }

  const docEvents = events();
  const winEvents = events();
  const viewEvents = events();
  const rootEvents = events();

  const doc = { hidden: false, documentElement: { clientHeight: screen }, createElement: canvasLike, ...docEvents };
  const win = {
    matchMedia,
    devicePixelRatio: 1,
    innerHeight: screen,
    getComputedStyle: (el) => ({ opacity: el.opacity ?? "1" }),
    visualViewport: { scale: 1, ...viewEvents },
    ResizeObserver: class extends Observer {},
    IntersectionObserver: class extends Observer {},
    PointerEvent: class {
      constructor(type, init) {
        Object.assign(this, { type }, init);
      }
    },
    ...winEvents,
  };
  doc.defaultView = win;

  const attrs = new Map();
  const style = new Map();
  const captured = new Set();
  const inside = new Set();
  const root = {
    ownerDocument: doc,
    parentElement: null,
    opacity: "1",
    offsetWidth: width,
    offsetHeight: height,
    clientWidth: width,
    clientHeight: height,
    style: { setProperty: (k, v) => style.set(k, v), removeProperty: (k) => style.delete(k) },
    getAttribute: (name) => (attrs.has(name) ? attrs.get(name) : null),
    setAttribute: (name, value) => attrs.set(name, String(value)),
    removeAttribute: (name) => attrs.delete(name),
    hasAttribute: (name) => attrs.has(name),
    getBoundingClientRect: () => ({ left: 0, top: 0, width, height }),
    contains: (node) => inside.has(node),
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
    dispatchEvent(event) {
      log.dispatched.push(event.type);
      rootEvents.fire(event.type, event);
      return true;
    },
    ...rootEvents,
  };

  const zone = (name, top, boxHeight) => ({
    offsetParent: root,
    offsetLeft: 16,
    offsetTop: top,
    offsetWidth: width - 32,
    offsetHeight: boxHeight,
    getAttribute: (attr) => ({ "data-keepout": name, "data-pad": "12", "data-feather": "40", "data-strength": "0.8" })[attr] ?? null,
    getBoundingClientRect: () => ({ left: 16, top, width: width - 32, height: boxHeight }),
  });
  const mark = { ...zone("mark", 236, 170), offsetLeft: width - 155, offsetWidth: 139 };
  const zones = [zone("header", 0, 64), mark, zone("tagline", 426, 20), zone("headline", 458, 84)];
  const wrap = { opacity: accentOpacity, parentElement: root };
  const accent = { textContent: "From Nottingham.", parentElement: wrap };
  const link = { closest: () => link };
  const words = { closest: () => null };
  inside.add(link).add(words).add(accent);
  root.querySelectorAll = (selector) => (selector === "[data-keepout]" ? zones : []);
  root.querySelector = (selector) => (selector === "[data-mark]" ? mark : selector === "[data-accent-text]" ? accent : null);

  return {
    log,
    root,
    doc,
    win,
    canvas: canvasLike(),
    accent,
    link,
    words,
    attrs,
    style,
    captured,
    listenersLeft: () => all.reduce((sum, l) => sum + l.list.length, 0),
    /** Put this page's window and document where the engine looks for them. */
    use() {
      globalThis.window = win;
      globalThis.document = doc;
      globalThis.ResizeObserver = win.ResizeObserver;
      globalThis.IntersectionObserver = win.IntersectionObserver;
      globalThis.Path2D = class {};
      globalThis.requestAnimationFrame = (callback) => {
        const id = log.nextFrame++;
        log.asked += 1;
        log.frames.set(id, callback);
        return id;
      };
      globalThis.cancelAnimationFrame = (id) => log.frames.delete(id);
    },
    /** Give the scene the frame it asked for. */
    runFrame() {
      const due = [...log.frames.values()];
      log.frames.clear();
      for (const callback of due) callback(performance.now() + 16);
    },
    /** Change the screen so that a different form applies, and tell the listeners. */
    setForm(next) {
      matches[QUERIES.phone] = next === "phone";
      matches[QUERIES.stacked] = next !== "desktop";
      matchMedia(QUERIES.phone).fire("change", {});
      matchMedia(QUERIES.stacked).fire("change", {});
    },
    clickOn(target) {
      rootEvents.fire("click", { target, stopPropagation() {} });
    },
  };
}

async function mounted(options) {
  const page = fakePage(options);
  page.use();
  const { mountHero } = (await loadHero()).mount;
  const unmount = mountHero(page.root, page.canvas);
  return { page, mountHero, unmount };
}

describe("the scene runs only when it should", () => {
  test("under reduced motion it paints one still frame and never asks for an animation frame", async () => {
    const { page, unmount } = await mounted({ form: "phone", reduced: true });
    assert.equal(page.attrs.get("data-scene"), "still");
    assert.ok(page.log.cleared >= 1 && page.log.drawn > 50, "the still frame was not painted");
    assert.equal(page.log.asked, 0, "a frame was asked for under reduced motion");
    // The whole accent is on the page, underlined, with no caret.
    assert.equal(page.accent.textContent, "From Nottingham.");
    assert.equal(page.attrs.get("data-ul"), "full");
    assert.equal(page.attrs.get("data-caret"), "off");
    unmount();
    assert.equal(page.log.asked, 0);
  });

  test("with motion it asks for one frame at a time", async () => {
    const { page, unmount } = await mounted({ form: "desktop", width: 1440, height: 810 });
    assert.equal(page.attrs.get("data-scene"), "running");
    assert.equal(page.log.frames.size, 1);
    const before = page.log.cleared;
    page.runFrame();
    assert.equal(page.log.cleared, before + 1, "a frame draws the scene once");
    assert.equal(page.log.frames.size, 1, "each frame asks for exactly one more");
    unmount();
  });

  test("stopping it cancels the frame and gives back every listener, observer and attribute", async () => {
    const { page, unmount } = await mounted({ form: "tablet", width: 834, height: 1194 });
    assert.ok(page.listenersLeft() > 10, "the scene and its controller listen while they run");
    assert.ok(page.log.observers.length >= 3, "the engine observes its size and whether it is on screen");
    page.runFrame();
    unmount();
    assert.equal(page.log.frames.size, 0, "the pending frame was not cancelled");
    assert.equal(page.listenersLeft(), 0, "a listener was left behind");
    assert.ok(page.log.observers.every((observer) => observer.disconnected), "an observer was left watching");
    assert.deepEqual([...page.attrs.keys()], [], "the root kept an attribute the scene wrote");
    assert.equal(page.style.size, 0, "the root kept a style the engine wrote");
    assert.equal(page.accent.textContent, "From Nottingham.");
    // A frame that was already on its way does nothing and asks for nothing.
    const asked = page.log.asked;
    unmount();
    assert.equal(page.log.asked, asked);
  });

  test("a screen that changes form gets the scene started again in the new one", async () => {
    const { page, unmount } = await mounted({ form: "desktop", width: 1440, height: 810 });
    assert.equal(page.attrs.get("data-form"), "desktop");
    const listening = page.listenersLeft();
    page.setForm("tablet");
    assert.equal(page.attrs.get("data-form"), "tablet");
    assert.equal(page.log.frames.size, 1, "the old scene's frame was cancelled and the new scene asked for one");
    assert.equal(page.listenersLeft(), listening, "the scene that was replaced left listeners behind");
    unmount();
    assert.equal(page.listenersLeft(), 0);
  });
});

describe("the typed headline never takes away words a visitor has read", () => {
  test("words that are already showing are left alone", async () => {
    const { page, unmount } = await mounted({ form: "desktop", width: 1440, height: 810, accentOpacity: "1" });
    assert.equal(page.accent.textContent, "From Nottingham.");
    assert.equal(page.attrs.has("data-typing"), false);
    page.runFrame();
    assert.equal(page.accent.textContent, "From Nottingham.");
    unmount();
  });

  test("words that have not appeared yet are typed in by the scene, and put back when it stops", async () => {
    const { page, unmount } = await mounted({ form: "desktop", width: 1440, height: 810, accentOpacity: "0" });
    assert.equal(page.accent.textContent, "");
    assert.equal(page.attrs.has("data-typing"), true);
    assert.equal(page.attrs.get("data-ul"), "none");
    unmount();
    assert.equal(page.accent.textContent, "From Nottingham.");
  });
});

describe("a drag on the hero is held only where the owner asked for it", () => {
  const held = (page) => page.attrs.has("data-hold");

  test("held on the phone and tablet forms, never on the desktop form", async () => {
    for (const [form, expected] of [["phone", true], ["tablet", true], ["desktop", false]]) {
      const { page, unmount } = await mounted({ form });
      assert.equal(held(page), expected, `${form} form`);
      unmount();
    }
  });

  test("never under reduced motion", async () => {
    const { page, unmount } = await mounted({ form: "phone", reduced: true });
    assert.equal(held(page), false);
    unmount();
  });

  test("never when the hero does not end on the first screen, or the page is zoomed in", async () => {
    const tall = await mounted({ form: "phone", height: 900, screen: 700 });
    assert.equal(held(tall.page), false, "the words would be out of reach");
    tall.unmount();

    // A notice above the header pushes a hero that is one screen high off the foot of the screen.
    const pushed = fakePage({ form: "phone" });
    pushed.root.offsetTop = 40;
    pushed.use();
    const stop = (await loadHero()).mount.mountHero(pushed.root, pushed.canvas);
    assert.equal(held(pushed), false, "the foot of the hero is off the screen");
    stop();

    const zoomed = await mounted({ form: "phone" });
    assert.equal(held(zoomed.page), true);
    zoomed.page.win.visualViewport.scale = 2;
    zoomed.page.win.visualViewport.fire("resize", {});
    assert.equal(held(zoomed.page), false, "one finger has to be able to move a zoomed page");
    zoomed.unmount();
  });

  test("a press on the words changes nothing; a press on a link lets go for the rest of the visit", async () => {
    const { page, mountHero, unmount } = await mounted({ form: "phone" });
    page.clickOn(page.words);
    assert.equal(held(page), true);
    page.clickOn(page.link);
    assert.equal(held(page), false);
    unmount();

    // The same script, a later look at the homepage: still let go.
    const again = fakePage({ form: "phone" });
    again.use();
    const stop = mountHero(again.root, again.canvas);
    assert.equal(held(again), false);
    stop();
  });

  test("a finger that goes down on a link is not kept captured, and the engine is told when it lifts elsewhere", async () => {
    const { page, unmount } = await mounted({ form: "phone" });
    const down = { pointerId: 7, pointerType: "touch", clientX: 100, clientY: 700, target: page.link };
    page.root.fire("pointerdown", down);
    assert.equal(page.captured.has(7), true, "the engine captures a finger on the root");
    page.doc.fire("pointerdown", down);
    assert.equal(page.captured.has(7), false, "the capture was not handed back, so the link may not be followed");
    page.doc.fire("pointerup", { pointerId: 7, pointerType: "touch", composedPath: () => [] });
    assert.deepEqual(page.log.dispatched, ["pointercancel"]);

    // A finger on the words stays captured: the drag is the engine's to follow.
    const onWords = { pointerId: 8, pointerType: "touch", clientX: 100, clientY: 500, target: page.words };
    page.root.fire("pointerdown", onWords);
    page.doc.fire("pointerdown", onWords);
    assert.equal(page.captured.has(8), true);
    unmount();
  });
});
