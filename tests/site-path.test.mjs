/**
 * What counts as a path on this site is decided in one place.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Code is handed a string and has to know whether it names a page here: a
 * return address after signing in, the page an installed app is put back on,
 * the page a notification opens. That is one decision, `safeReturnPath` in
 * `src/lib/safeReturnPath.ts`, and its own table is in
 * `tests/sign-in-return.test.mjs`. This file holds that it is the ONLY place
 * the decision is made:
 *
 *  1. THE TREE IS WALKED. Every file under `src`, and the service worker,
 *     is read for the shapes the decision is written in by hand: a test for
 *     a leading slash, a test of the first characters, a pattern for a path
 *     that does not start with two slashes, an origin compared. A file that
 *     holds one is the helper's own, or is written down below with what it
 *     decides instead and how many of each shape it holds. Both directions:
 *     a file that is listed and no longer holds what is written fails too.
 *  2. THE THREE ASKERS THAT ARE NOT ABOUT SIGNING IN ARE RUN, so moving them
 *     onto the helper is known to have kept what each does with an address
 *     it is refused: no page to go back to, a notification that is not
 *     sent, the task board.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const { loadTs } = createLoader({
  stubs: [
    ["server-only", "export {};"],
    // The three doors of the two notification modules. Every one answers yes,
    // and what would have been sent is kept to be looked at.
    ["./config", "export function isPushConfigured() {\n  return true;\n}"],
    ["./preferences", "export async function wantsPushFor() {\n  return true;\n}"],
    [
      "./send",
      "export async function sendPushToUid(uid, notification) {\n" +
        "  (globalThis.__handedToDevices ||= []).push({ uid, ...notification });\n" +
        "  return { sent: 1, pruned: 0, deferred: 0, failed: 0, retried: 0 };\n" +
        "}",
    ],
  ],
});

const { safeReturnPath } = await loadTs(join("lib", "safeReturnPath.ts"));
const signInReturn = await loadTs(join("lib", "signInReturn.ts"));
const lastRoute = await loadTs(join("features", "pwa", "lastRoute.ts"));
const taskPush = await loadTs(join("lib", "push", "taskNotifications.ts"));
const noticePush = await loadTs(join("lib", "push", "noticeNotifications.ts"));

/** Addresses that are not a path on this site, each in a way a quick check by hand lets through or not. */
const NOT_THIS_SITE = [
  "//elsewhere.example",
  "/\\elsewhere.example",
  "/\t/elsewhere.example",
  "/\n/elsewhere.example",
  "https://elsewhere.example/tasks",
  "elsewhere.example",
  "javascript:alert(1)",
  "",
];

// ---------------------------------------------------------------------------
// 1. The walk
// ---------------------------------------------------------------------------

/**
 * The shapes the decision is written in by hand, each read from code with
 * its comments taken out.
 */
const SHAPES = {
  // `x.startsWith("/")`, `x.startsWith("//")`: a path told from an address by its first slash.
  leadingSlash: /\.startsWith\(\s*(["'`])\/\/?\1\s*[,)]/g,
  // `x[0] === "/"`, `x.charAt(1) !== "/"`: the same, a character at a time.
  firstCharacters: /(?:\[\s*[01]\s*\]|\.charAt\(\s*[01]\s*\)|\.at\(\s*[01]\s*\))\s*[!=]==?\s*(["'`])(?:\/|\\\\)\1/g,
  // `/^\/(?!\/)/`, `/^\/[^/]/`: the same, as a pattern.
  pathPattern: /\/\^\\\/(?:\(\?!|\[\^)/g,
  // `url.origin !== here`: an address resolved and its site compared.
  originCompared: /\.origin\s*[!=]==?|[!=]==?\s*[\w$.]+\.origin\b/g,
};

/** The one home of the decision: the function, which reads the first two characters. */
const HOME = "src/lib/safeReturnPath.ts";

/**
 * Every other file that holds one of the shapes, with how many of each and
 * what it decides instead. None of these is asked "is this a path on this
 * site" by anything: each answers a different question, and says so here.
 */
const DECIDES_SOMETHING_ELSE = new Map([
  [
    "src/lib/firestore/trackedLinks.ts",
    {
      holds: { leadingSlash: 2, originCompared: 1 },
      why:
        "What an admin may save as a short link's destination, which may be another site's full address as well as a page here. " +
        "It answers each refusal with a sentence of its own, hands back the address as a URL parser rewrote it, and has its own rules " +
        "on top (never another short link, never an API route). tests/tracked-links.test.mjs holds what it answers.",
    },
  ],
  [
    "src/lib/firestore/coursePages.ts",
    {
      holds: { leadingSlash: 1 },
      why:
        "Which KINDS of address a course page's picture may carry: an http or https address, or one beginning with a single slash. " +
        "Another site's https address is allowed, so it does not ask whether an address is this site's.",
    },
  ],
  [
    "public/sw.js",
    {
      holds: { originCompared: 1 },
      why:
        "The service worker's fetch handler, asking whether a REQUEST the browser handed it is this site's own. It compares two " +
        "addresses the browser has already parsed and is handed no text to read as a path. The page a notification opens is decided " +
        "on the server, by the helper, before the notification is sent.",
    },
  ],
]);

function filesUnder(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(?:tsx?|m?js)$/.test(name)) out.push(full);
  }
  return out;
}

/** What a file holds of each shape. Comments out, so the decision described in prose is not the decision made. */
function shapesIn(code) {
  const found = {};
  for (const [name, pattern] of Object.entries(SHAPES)) {
    const count = (code.match(pattern) ?? []).length;
    if (count > 0) found[name] = count;
  }
  return found;
}

describe("nothing decides by hand whether an address is a path on this site", () => {
  const files = [...filesUnder(SRC), join(REPO_ROOT, "public", "sw.js")];
  const holding = new Map();
  for (const file of files) {
    const found = shapesIn(stripSource(readFileSync(file, "utf8"), { keepStrings: true }));
    if (Object.keys(found).length > 0) holding.set(relative(REPO_ROOT, file).split(sep).join("/"), found);
  }

  test("the tree was read, and the reader finds each shape where one is known to be", () => {
    assert.ok(files.length > 800, `only ${files.length} files were read: was the tree moved?`);
    const read = (code) => shapesIn(stripSource(code, { keepStrings: true }));
    assert.deepEqual(read('if (!url.startsWith("/") || url.startsWith("//")) return null;'), { leadingSlash: 2 });
    assert.deepEqual(read("if (next.startsWith('/', 0)) go(next);"), { leadingSlash: 1 });
    assert.deepEqual(read('if (raw[0] !== "/" || raw.charAt(1) === "/" || raw.at(1) === "\\\\") return null;'), { firstCharacters: 3 });
    assert.deepEqual(read("const ok = /^\\/(?!\\/)/.test(path) || /^\\/[^/]/.test(path);"), { pathPattern: 2 });
    assert.deepEqual(read("if (new URL(next, here).origin === here.origin) go(next);"), { originCompared: 1 });
    assert.deepEqual(read("if (location.origin !== url.origin) return;"), { originCompared: 1 });
    // And leaves alone what only looks like one.
    assert.deepEqual(read('if (pathname.startsWith("/api/")) return; // not startsWith("/")'), {});
    assert.deepEqual(read('const base = window.location.origin; const first = list[0] === "a";'), {});
    assert.deepEqual(read("/* if (x.startsWith('//')) */ const y = 1;"), {});
  });

  test("the helper's own file holds the decision once, in the one function, and nothing else", () => {
    assert.deepEqual(holding.get(HOME), { firstCharacters: 2 });
    const home = stripSource(readFileSync(join(REPO_ROOT, HOME), "utf8"), { keepStrings: true });
    const from = home.indexOf("export function safeReturnPath(");
    const body = home.slice(from, home.indexOf("\n}\n", from));
    assert.ok(from !== -1 && body.includes('if (raw[0] !== "/" || raw[1] === "/") return null;'), "the decision has left the helper");
    // It imports nothing, so a route, a component, a job and a test can all
    // import it, and none of them is handed anything else by doing so.
    assert.equal(/\bimport\b/.test(home), false, "the helper's file imports something");
    assert.deepEqual([...home.matchAll(/export (?:function|const) (\w+)/g)].map((match) => match[1]).sort(), ["RETURN_MAX_LENGTH", "safeReturnPath"]);
  });

  test("the sign-in rules hand on the same function, and do not keep one of their own", () => {
    assert.equal(signInReturn.safeReturnPath, safeReturnPath);
    assert.equal(holding.has("src/lib/signInReturn.ts"), false, "the sign-in rules decide it by hand as well");
  });

  test("every other file that holds one of the shapes is written down, with what it decides instead", () => {
    const others = new Map([...holding].filter(([file]) => file !== HOME));
    for (const [file, found] of others) {
      assert.ok(
        DECIDES_SOMETHING_ELSE.has(file),
        `${file} decides by hand whether an address is a path on this site (${JSON.stringify(found)}). ` +
          "Ask `safeReturnPath` (src/lib/safeReturnPath.ts), which is the one place that is decided, and do with a refusal what the " +
          "code did before. If the file decides something else, write it down in this test with what, and why the helper does not fit.",
      );
      assert.deepEqual(
        found,
        DECIDES_SOMETHING_ELSE.get(file).holds,
        `${file} does not hold the shapes written down for it. If it has gained one, that is a new decision made by hand: use the helper. ` +
          "If it has lost one, bring the entry up to date.",
      );
    }
    for (const [file, { why }] of DECIDES_SOMETHING_ELSE) {
      assert.ok(others.has(file), `${file} is written down and no longer holds any of the shapes: take the entry out`);
      assert.ok(typeof why === "string" && why.length > 80, `${file} has no reason beside it`);
    }
  });

  test("the three that used to decide it by hand ask the helper", () => {
    for (const file of ["src/features/pwa/lastRoute.ts", "src/lib/push/noticeNotifications.ts", "src/lib/push/taskNotifications.ts"]) {
      const code = stripSource(readFileSync(join(REPO_ROOT, file), "utf8"), { keepStrings: true });
      assert.match(code, /import \{ safeReturnPath \} from "@\/lib\/safeReturnPath";/, file);
      assert.equal((code.match(/safeReturnPath\(/g) ?? []).length, 1, `${file} asks the helper in more or fewer places than one`);
      assert.equal(holding.has(file), false, `${file} decides it by hand as well`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The three askers that are not about signing in
// ---------------------------------------------------------------------------

/** A browser holding `stored` as the last page a member had open. */
function withLastRoute(stored, work) {
  globalThis.window = { localStorage: { getItem: (key) => (key === "naisi.lastRoute" ? stored : null), setItem() {} } };
  try {
    return work();
  } finally {
    delete globalThis.window;
  }
}
const storedRoute = (path, agedMs = 0) => JSON.stringify({ path, ts: Date.now() - agedMs });

describe("the page an installed app is put back on", () => {
  test("a page of this site that was open within the week", () => {
    for (const path of ["/dashboard", "/committee/tasks", "/learn/run-1/weeks/3", "/worksheets/respond/circulation-1"]) {
      assert.equal(withLastRoute(storedRoute(path), () => lastRoute.readLastRoute()), path);
      assert.equal(safeReturnPath(path), path);
    }
  });

  test("an address that is not a path on this site is no page to go back to", () => {
    for (const other of NOT_THIS_SITE) {
      assert.equal(withLastRoute(storedRoute(other), () => lastRoute.readLastRoute()), null, JSON.stringify(other));
    }
  });

  test("what it always refused, it still refuses", () => {
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    assert.equal(withLastRoute(storedRoute("/dashboard", WEEK + 60_000), () => lastRoute.readLastRoute()), null, "a page from more than a week ago");
    assert.equal(withLastRoute(null, () => lastRoute.readLastRoute()), null, "nothing stored");
    assert.equal(withLastRoute("not json", () => lastRoute.readLastRoute()), null);
    assert.equal(withLastRoute(JSON.stringify({ path: 42, ts: Date.now() }), () => lastRoute.readLastRoute()), null);
    assert.equal(withLastRoute(JSON.stringify({ path: "/dashboard" }), () => lastRoute.readLastRoute()), null, "no time beside the page");
  });
});

/** Everything the two modules handed on to a member's devices during `work`. */
async function handedToDevices(work) {
  globalThis.__handedToDevices = [];
  const answered = await work();
  return { answered, handed: globalThis.__handedToDevices };
}

describe("the page a task's notification opens", () => {
  const about = { title: "A task", body: "Something changed.", taskId: "task 1/a" };
  const BOARD = "/committee/tasks?task=task%201%2Fa";

  test("the task board, when the caller names no page", async () => {
    const { handed } = await handedToDevices(() => taskPush.mirrorTaskEmailToPush("ada", about));
    assert.deepEqual(handed, [{ uid: "ada", title: "A task", body: "Something changed.", url: BOARD }]);
  });

  test("the page the caller names, when it is a path on this site", async () => {
    for (const url of ["/worksheets/respond/circulation-1", "/tasks?task=task-1"]) {
      const { handed } = await handedToDevices(() => taskPush.mirrorTaskEmailToPush("ada", { ...about, url }));
      assert.equal(handed.length, 1);
      assert.equal(handed[0].url, url);
    }
  });

  test("the task board again, when what the caller names is not a path on this site: the member still hears", async () => {
    for (const other of NOT_THIS_SITE) {
      const { handed } = await handedToDevices(() => taskPush.mirrorTaskEmailToPush("ada", { ...about, url: other }));
      assert.equal(handed.length, 1, JSON.stringify(other));
      assert.equal(handed[0].url, BOARD, JSON.stringify(other));
    }
  });
});

describe("the page a notice's notification opens", () => {
  const notice = { title: "We have moved rooms", body: "B52 from tonight." };

  test("the page the caller names, when it is a path on this site", async () => {
    const { answered, handed } = await handedToDevices(() => noticePush.sendNoticePush("ada", { ...notice, url: "/learn/run-1" }));
    assert.equal(answered, true);
    assert.deepEqual(handed, [{ uid: "ada", ...notice, url: "/learn/run-1" }]);
  });

  test("no notification at all, when it is not: the email carries the same message", async (t) => {
    // The module says so on the server's log. That line is expected here.
    const warned = t.mock.method(console, "warn", () => {});
    for (const other of NOT_THIS_SITE) {
      const { answered, handed } = await handedToDevices(() => noticePush.sendNoticePush("ada", { ...notice, url: other }));
      assert.equal(answered, false, JSON.stringify(other));
      assert.deepEqual(handed, [], JSON.stringify(other));
    }
    assert.equal(warned.mock.callCount(), NOT_THIS_SITE.length);
  });
});
