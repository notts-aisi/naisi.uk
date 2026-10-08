/**
 * What counts as the installed app.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The site asks one question in many places: is this window the installed
 * app's, or a browser's? The answer decides how Google's sign-in opens, what
 * an application form's first step draws for it, whether a session is
 * repaired, whether a relaunch is restored and whether the installed layout
 * is applied. It is one rule, `isStandaloneNow` in
 * `src/lib/pwa/displayMode.ts`, and the rule is written a second time, by
 * hand, in the script `StandaloneFlag.tsx` puts on every page before any
 * module runs.
 *
 *  1. THE RULE, RUN. A table of windows, and windows that change: a browser
 *     tab, a browser window in full screen, the installed app, the installed
 *     app put into full screen, the flag iOS sets, and a browser whose
 *     storage refuses. A browser window is never the app, in full screen or
 *     out of it.
 *  2. THE TWO COPIES ARE ONE RULE. The script is taken out of its file and
 *     run on the same windows as the function, in step and in turn, and both
 *     have to give the same answer and leave the same thing remembered.
 *  3. EVERY FILE THAT ASKS IS WRITTEN DOWN, with what it does with the
 *     answer, in both directions. A new one fails here until somebody has
 *     decided what a browser window in full screen should get from it. And
 *     nothing but the two copies asks the browser directly.
 *  4. WHAT THE RULE RELIES ON IS STILL TRUE. Nothing starts in full screen:
 *     the manifest asks for `standalone`, and no app wraps the site.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const { loadTs } = createLoader();

const displayMode = await loadTs(join("lib", "pwa", "displayMode.ts"));
const { isStandaloneNow, INSTALLED_WINDOW_KEY } = displayMode;

/** The script `StandaloneFlag.tsx` puts on every page, as it is written there. */
const FLAG_FILE = readFileSync(join(SRC, "features", "pwa", "StandaloneFlag.tsx"), "utf8");
const SCRIPT = /\nconst SCRIPT = `([^`]*)`;\n/.exec(FLAG_FILE)?.[1] ?? null;

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const IPAD_AS_MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15";

/** A window's own session storage, with every call counted. */
function memoryStore(initial = {}) {
  const held = new Map(Object.entries(initial));
  const calls = { getItem: 0, setItem: 0, removeItem: 0 };
  return {
    calls,
    held,
    handle: {
      getItem(key) {
        calls.getItem += 1;
        return held.has(key) ? held.get(key) : null;
      },
      setItem(key, value) {
        calls.setItem += 1;
        held.set(key, String(value));
      },
      removeItem(key) {
        calls.removeItem += 1;
        held.delete(key);
      },
    },
  };
}

/** Storage a browser refuses to hand over at all: the property itself throws. */
const REFUSED = { refused: true };

/** Storage whose one call throws, and whose others work. */
function brokenStore(method, initial = {}) {
  const store = memoryStore(initial);
  store.handle[method] = () => {
    throw new Error(`${method} refused`);
  };
  return store;
}

/**
 * A window as the two copies of the rule see one. `mode` is what the browser
 * reports: "browser", "standalone" or "fullscreen". It can be changed, the
 * way a real window's changes when it is put into full screen.
 */
function windowOf({ mode = "browser", ios = undefined, userAgent = MAC, maxTouchPoints = 0, store = memoryStore() } = {}) {
  const state = { mode, persistAsked: 0, queries: [] };
  const navigator = {
    userAgent,
    maxTouchPoints,
    storage: {
      persist() {
        state.persistAsked += 1;
      },
    },
  };
  if (ios !== undefined) navigator.standalone = ios;
  const win = {
    navigator,
    matchMedia(query) {
      state.queries.push(query);
      const asked = /^\(display-mode: ([\w-]+)\)$/.exec(query)?.[1];
      return { matches: asked !== undefined && asked === state.mode, addEventListener() {}, removeEventListener() {} };
    },
  };
  Object.defineProperty(win, "sessionStorage", {
    get() {
      if (store === REFUSED) throw new Error("The operation is insecure.");
      return store === null ? null : store.handle;
    },
  });
  return { win, state, store, set: (next) => (state.mode = next) };
}

/** The function's answer for a window. */
function asked(world) {
  globalThis.window = world.win;
  try {
    return isStandaloneNow();
  } finally {
    delete globalThis.window;
  }
}

/** What the script stamps on `<html>` for a window. */
function stamped(world) {
  const root = { dataset: {} };
  vm.runInNewContext(SCRIPT, { window: world.win, navigator: world.win.navigator, document: { documentElement: root } });
  return root.dataset;
}

const remembered = (world) =>
  world.store && world.store !== REFUSED && world.store.held ? (world.store.held.get(INSTALLED_WINDOW_KEY) ?? null) : null;

// ---------------------------------------------------------------------------
// 1. The rule
// ---------------------------------------------------------------------------

/** One window, seen once. `[name, how it is made, installed?]`. */
const WINDOWS = [
  ["a browser tab", () => windowOf({ mode: "browser" }), false],
  ["a browser window in full screen", () => windowOf({ mode: "fullscreen" }), false],
  ["the installed app", () => windowOf({ mode: "standalone" }), true],
  ["a home-screen app on an iPhone, by the flag iOS sets", () => windowOf({ mode: "browser", ios: true, userAgent: IPHONE }), true],
  ["a home-screen app on an iPhone that also reports the display mode", () => windowOf({ mode: "standalone", ios: true, userAgent: IPHONE }), true],
  ["a tab in Safari on an iPhone", () => windowOf({ mode: "browser", ios: false, userAgent: IPHONE }), false],
  ["a browser tab whose storage is refused", () => windowOf({ mode: "browser", store: REFUSED }), false],
  ["a browser window in full screen whose storage is refused", () => windowOf({ mode: "fullscreen", store: REFUSED }), false],
  ["the installed app, with storage refused", () => windowOf({ mode: "standalone", store: REFUSED }), true],
  ["the installed app, with no storage at all", () => windowOf({ mode: "standalone", store: null }), true],
  ["a browser window in full screen with no storage at all", () => windowOf({ mode: "fullscreen", store: null }), false],
  ["the installed app, where writing to storage fails", () => windowOf({ mode: "standalone", store: brokenStore("setItem") }), true],
  ["a browser window in full screen, where reading storage fails", () => windowOf({ mode: "fullscreen", store: brokenStore("getItem") }), false],
  ["a browser tab, where clearing storage fails", () => windowOf({ mode: "browser", store: brokenStore("removeItem", { "naisi.pwa.installed": "1" }) }), false],
  // Only the value the rule itself writes is believed.
  ["full screen, with something else under the key", () => windowOf({ mode: "fullscreen", store: memoryStore({ "naisi.pwa.installed": "true" }) }), false],
  ["full screen, with a nought under the key", () => windowOf({ mode: "fullscreen", store: memoryStore({ "naisi.pwa.installed": "0" }) }), false],
  // A mode the manifest does not ask for is not the app.
  ["a window with the browser's own small toolbar", () => windowOf({ mode: "minimal-ui" }), false],
];

/**
 * One window that changes. `[name, how it is made, [[what the browser reports, installed?], ...]]`.
 * Full screen never changes the answer: it is whatever the window was before.
 */
const JOURNEYS = [
  ["a browser window put into full screen and taken out again", () => windowOf(), [["browser", false], ["fullscreen", false], ["browser", false]]],
  ["the installed app put into full screen and taken out again", () => windowOf(), [["standalone", true], ["fullscreen", true], ["standalone", true]]],
  [
    "the installed app's window, then moved into the browser, then put into full screen",
    () => windowOf(),
    [["standalone", true], ["fullscreen", true], ["browser", false], ["fullscreen", false]],
  ],
  ["a window first seen in full screen, which turns out to be the app's", () => windowOf(), [["fullscreen", false], ["standalone", true], ["fullscreen", true]]],
  ["a browser window in full screen, again and again", () => windowOf(), [["fullscreen", false], ["fullscreen", false], ["browser", false], ["fullscreen", false]]],
  ["the installed app in full screen where nothing can be remembered", () => windowOf({ store: REFUSED }), [["standalone", true], ["fullscreen", false], ["standalone", true]]],
  ["a home-screen app on an iPhone, whatever the display mode says", () => windowOf({ ios: true, userAgent: IPHONE }), [["browser", true], ["fullscreen", true], ["browser", true]]],
];

describe("the rule: is this window the installed app's?", () => {
  test("the key the window is remembered under is the site's own, and one value means yes", () => {
    assert.equal(INSTALLED_WINDOW_KEY, "naisi.pwa.installed");
  });

  test("there is no window on the server, and the answer there is a browser tab", () => {
    assert.equal(typeof globalThis.window, "undefined");
    assert.equal(isStandaloneNow(), false);
  });

  for (const [name, make, installed] of WINDOWS) {
    test(`${name}: ${installed ? "installed" : "a browser window"}`, () => {
      assert.equal(asked(make()), installed);
    });
  }

  for (const [name, make, steps] of JOURNEYS) {
    test(`${name}: ${steps.map(([mode, installed]) => `${mode} ${installed ? "yes" : "no"}`).join(", ")}`, () => {
      const world = make();
      for (const [index, [mode, installed]] of steps.entries()) {
        world.set(mode);
        assert.equal(asked(world), installed, `step ${index + 1}, ${mode}`);
        // Asking again changes nothing: the answer is read on every render.
        assert.equal(asked(world), installed, `step ${index + 1}, ${mode}, asked twice`);
      }
    });
  }

  test("a browser window in full screen is asked about, and nothing is remembered of it", () => {
    const world = windowOf({ mode: "fullscreen" });
    assert.equal(asked(world), false);
    assert.equal(remembered(world), null);
    assert.deepEqual(world.state.queries, ["(display-mode: standalone)", "(display-mode: fullscreen)"]);
    assert.equal(world.store.calls.setItem + world.store.calls.removeItem, 0, "a window in full screen wrote to what is remembered");
  });

  test("the installed app is remembered once, and a browser window forgets it once", () => {
    const world = windowOf({ mode: "standalone" });
    for (let i = 0; i < 5; i += 1) assert.equal(asked(world), true);
    assert.equal(remembered(world), "1");
    assert.equal(world.store.calls.setItem, 1, "written on every ask, and it is asked on every render");
    world.set("browser");
    for (let i = 0; i < 5; i += 1) assert.equal(asked(world), false);
    assert.equal(remembered(world), null);
    assert.equal(world.store.calls.removeItem, 1);
  });

  test("the answer never reads anything but the three things the rule names", () => {
    // Not the size of the window, not the address, not who is signed in.
    const world = windowOf({ mode: "fullscreen" });
    const touched = [];
    globalThis.window = new Proxy(world.win, {
      get(target, prop) {
        touched.push(String(prop));
        return Reflect.get(target, prop);
      },
    });
    try {
      isStandaloneNow();
    } finally {
      delete globalThis.window;
    }
    assert.deepEqual([...new Set(touched)].sort(), ["matchMedia", "navigator", "sessionStorage"]);
  });
});

// ---------------------------------------------------------------------------
// 2. The two copies are one rule
// ---------------------------------------------------------------------------

describe("the script on every page and the function are one rule", () => {
  test("the script was found, whole, with nothing computed into it", () => {
    assert.ok(SCRIPT, "the script is no longer a plain template in StandaloneFlag.tsx");
    assert.equal(SCRIPT.includes("${"), false, "the script is built from pieces, and this file reads it as text");
    assert.match(FLAG_FILE, /<script dangerouslySetInnerHTML=\{\{ __html: SCRIPT \}\} \/>/);
    // It must never be the reason a page does not render.
    assert.match(SCRIPT, /^try\{.*\}catch\(e\)\{\}$/s);
  });

  test("both remember a window under the same key", () => {
    assert.equal((SCRIPT.match(/'naisi\.pwa\.installed'/g) ?? []).length, 1);
    assert.ok(SCRIPT.includes(`'${INSTALLED_WINDOW_KEY}'`));
  });

  for (const [name, make, installed] of WINDOWS) {
    test(`${name}: the script stamps <html> exactly when the function says installed`, () => {
      const forScript = make();
      const forFunction = make();
      const data = stamped(forScript);
      assert.equal(data.standalone === "true", installed);
      assert.equal(asked(forFunction), installed);
      assert.equal(remembered(forScript), remembered(forFunction), "the two left different things remembered");
      // Anything the script stamps, it stamps only on the installed app.
      if (!installed) assert.deepEqual(data, {});
    });
  }

  for (const [name, make, steps] of JOURNEYS) {
    test(`${name}: the two agree at every step, whichever is asked first`, () => {
      // Each by itself.
      const alone = make();
      for (const [index, [mode, installed]] of steps.entries()) {
        alone.set(mode);
        assert.equal(stamped(alone).standalone === "true", installed, `the script alone, step ${index + 1}, ${mode}`);
      }
      // And as a page has them: the script when the document loads, the
      // function whenever something asks afterwards, sharing one window.
      for (const first of ["script", "function"]) {
        const world = make();
        for (const [index, [mode, installed]] of steps.entries()) {
          world.set(mode);
          const answers =
            first === "script"
              ? [stamped(world).standalone === "true", asked(world)]
              : [asked(world), stamped(world).standalone === "true"];
          assert.deepEqual(answers, [installed, installed], `${first} first, step ${index + 1}, ${mode}`);
        }
      }
    });
  }

  test("the script marks an iPhone and an iPad, and only when installed", () => {
    assert.deepEqual({ ...stamped(windowOf({ ios: true, userAgent: IPHONE })) }, { standalone: "true", standaloneIos: "true" });
    assert.deepEqual({ ...stamped(windowOf({ ios: true, userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })) }, { standalone: "true", standaloneIos: "true" });
    // A laptop's installed app is not an iPad: no touch screen.
    assert.deepEqual({ ...stamped(windowOf({ mode: "standalone", userAgent: MAC })) }, { standalone: "true" });
    assert.deepEqual({ ...stamped(windowOf({ ios: false, userAgent: IPHONE })) }, {});
    assert.deepEqual({ ...stamped(windowOf({ mode: "fullscreen", userAgent: IPAD_AS_MAC, maxTouchPoints: 5 })) }, {});
  });

  test("the script asks the browser to keep the site's storage for the installed app, and for nobody else", () => {
    for (const [name, make, installed] of WINDOWS) {
      const world = make();
      stamped(world);
      assert.equal(world.state.persistAsked, installed ? 1 : 0, name);
    }
  });

  test("a browser with none of this does not stop the page", () => {
    // No matchMedia, no storage, no navigator.storage: the script ends quietly.
    const root = { dataset: {} };
    vm.runInNewContext(SCRIPT, { window: {}, navigator: { userAgent: "" }, document: { documentElement: root } });
    assert.deepEqual(root.dataset, {});
  });
});

// ---------------------------------------------------------------------------
// 3. Every file that asks
// ---------------------------------------------------------------------------

/**
 * Each file under `src` that asks the question, with what it does with the
 * answer. A browser window is never the app, so for each of these a browser
 * window in full screen gets what a browser tab gets. An entry with no
 * reason, an entry for a file that no longer asks, and a file that asks and
 * is not here all fail.
 */
const ASKERS = new Map([
  ["lib/pwa/displayMode.ts", "The rule itself: `isStandaloneNow`, and the subscription the hook listens through."],
  ["hooks/useDisplayMode.ts", "The React hook over the rule. False on the server and on the first render in a browser, then the rule's answer."],
  ["features/pwa/StandaloneFlag.tsx", "The rule's second copy, run before the first paint, which stamps the attributes the stylesheets below read."],
  [
    "components/GoogleSignInButton.tsx",
    "Chooses how Google's sign-in opens: a full-page trip to Google in the installed app, where a pop-up cannot open, and Google's pop-up in every browser window.",
  ],
  [
    "features/applications/apply/JoinStep.tsx",
    "Hands the answer to the form's account view, which draws Google's own button in a browser window and a link to the sign-in page in the installed app.",
  ],
  ["auth/SessionSanityGuard.tsx", "Repairs a session cookie that has no sign-in behind it, in the installed app only."],
  ["features/pwa/RelaunchRestore.tsx", "Returns a relaunched installed app to the page it was on. A browser window opening the home page stays there."],
  ["features/pwa/InstallCard.tsx", "The invitation to install, which is not shown to somebody who already has."],
  ["features/pwa/InstallLink.tsx", "The menu's install row, hidden for the same reason."],
  ["features/pwa/pushDevice.tsx", "On an iPhone or iPad notifications exist only in the installed app, so a tab there is told to install first."],
  ["layout/AppShell.module.css", "Shows the reload control in the phone layout's top strip, where an installed window has no reload of its own."],
  ["app/(auth)/register/registerSignIn.module.css", "Puts email and password first on the sign-in card inside an installed app on an iPhone or iPad."],
]);

/** A use, in code or in a stylesheet: the two functions, or the attributes the script stamps. */
const ASKS = /\b(?:isStandaloneNow|useIsStandalone)\s*\(|data-standalone|dataset\.standalone|display-mode/;
/** Asking the browser itself, which only the two copies of the rule may do. */
const ASKS_THE_BROWSER = /display-mode/;

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(?:tsx?|css)$/.test(name)) out.push(full);
  }
  return out;
}

/** A file as code: comments out, so the rule written in prose is not a use. */
function codeOf(file) {
  const source = readFileSync(file, "utf8");
  return file.endsWith(".css") ? source.replace(/\/\*[\s\S]*?\*\//g, " ") : stripSource(source, { keepStrings: true });
}

describe("every file that asks whether the site is installed is written down", () => {
  const files = filesUnder(SRC);
  const asking = new Map();
  for (const file of files) {
    const code = codeOf(file);
    if (ASKS.test(code)) asking.set(relative(SRC, file).split(sep).join("/"), code);
  }

  test("the tree was read", () => {
    assert.ok(files.length > 500, `only ${files.length} files under src: was the tree moved?`);
    // The reader finds a use where one is known to be, and not in a comment.
    assert.equal(ASKS.test(stripSource("const a = isStandaloneNow();", { keepStrings: true })), true);
    assert.equal(ASKS.test(stripSource("// asks isStandaloneNow() for the answer\nconst a = 1;", { keepStrings: true })), false);
    assert.equal(ASKS.test(':global(html[data-standalone="true"]) .x { display: none; }'), true);
  });

  test("each file that asks is listed with what it does, and each one listed still asks", () => {
    for (const file of asking.keys()) {
      assert.ok(
        ASKERS.has(file),
        `${file} asks whether the site is installed and is not written down here. ` +
          "Decide what a browser window gets from it (a browser window is never the app, in full screen or out of it) and add it with that.",
      );
    }
    for (const [file, why] of ASKERS) {
      assert.ok(asking.has(file), `${file} is written down and no longer asks: take the entry out`);
      assert.ok(typeof why === "string" && why.length > 40, `${file} has no reason beside it`);
    }
  });

  test("nothing but the two copies of the rule asks the browser for the display mode", () => {
    const direct = [...asking].filter(([, code]) => ASKS_THE_BROWSER.test(code)).map(([file]) => file).sort();
    assert.deepEqual(
      direct,
      ["features/pwa/StandaloneFlag.tsx", "lib/pwa/displayMode.ts"],
      "a third place reads the display mode for itself. Ask `isStandaloneNow` or `useIsStandalone`, so the answer for a window in full screen is the rule's.",
    );
  });

  test("the hook is the rule and nothing more", () => {
    const hook = asking.get("hooks/useDisplayMode.ts");
    assert.match(hook, /return useSyncExternalStore\(subscribeDisplayMode, isStandaloneNow, \(\) => false\);/);
  });

  test("Google's button takes the rule's answer, and nothing else, to choose how it opens", () => {
    const button = asking.get("components/GoogleSignInButton.tsx");
    assert.match(button, /const useRedirect = isStandaloneNow\(\);/);
    assert.match(button, /ux_mode: useRedirect \? "redirect" : "popup",/);
    assert.equal((button.match(/isStandaloneNow\(/g) ?? []).length, 1);
  });

  test("the form's account view is handed the hook's answer as it stands", () => {
    const step = asking.get("features/applications/apply/JoinStep.tsx");
    assert.match(step, /const standalone = useIsStandalone\(\);/);
    assert.match(step, /standalone=\{standalone\}/);
  });
});

// ---------------------------------------------------------------------------
// 4. What the rule relies on
// ---------------------------------------------------------------------------

describe("nothing starts in full screen", () => {
  test("the manifest asks for a standalone window, and for no other first", async () => {
    // An app that launched in `fullscreen` would be a window FIRST seen in
    // full screen, which the rule reads as a browser's. If this changes, the
    // rule's second step has to change with it.
    const manifest = (await loadTs(join("app", "manifest.ts"))).default();
    assert.equal(manifest.display, "standalone");
    assert.equal("display_override" in manifest, false);
  });

  test("no app wraps the site", () => {
    // A wrapper may launch the site in `fullscreen`, and it needs this file
    // to do so. Adding one means teaching the rule about it first.
    assert.equal(existsSync(join(REPO_ROOT, "public", ".well-known", "assetlinks.json")), false);
  });
});
