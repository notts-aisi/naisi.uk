/**
 * The public menus: the header's pages, the account entries, the footer's
 * columns and the row under its hairline.
 *
 * The menus are data in `src/layout/publicNav.ts`. An entry is drawn only
 * while its `live` is true, and the file's own rule is that an entry is
 * switched on in the pull request that adds its page. Nothing held that rule
 * to the tree: a switch is one word, and it is somebody remembering. This
 * file holds it, in both directions.
 *
 * 1. EVERY ADDRESS A MENU LEADS TO TODAY IS A PAGE. An entry that is drawn
 *    (switched on, or with somewhere to lead meanwhile) and stays on this
 *    site names an address with a `page.tsx` behind it. Switching one on
 *    before its page exists, or moving a page from under its entry, fails.
 *
 * 2. A PART OF A PAGE AN ENTRY JUMPS TO IS ON THAT PAGE. An address ending
 *    `#name` needs `id="name"` once in that page's own file.
 *
 * 3. AN ENTRY IS OFF ONLY WHILE ITS PAGE IS MISSING. A page that exists with
 *    its entry still switched off is a page nobody is led to. Switch it on,
 *    or write down below why it stays off.
 *
 * 4. ONE PAGE, ONE ANSWER. The header and the footer both name some pages.
 *    Two entries with one key lead to one address and are on or off together.
 *
 * 5. THE NAME FORWARDS TO THE PAGE. The menus call the page at /courses
 *    "Fellowships", and /fellowships forwards to wherever that entry leads.
 *    The forward is temporary, because a permanent one is kept by a browser
 *    for good and the page may one day move to that address.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP = join(REPO_ROOT, "src", "app");

const { loadTs } = createLoader({ stubs: [] });
const { HEADER_PAGES, ACCOUNT_ENTRIES, FOOTER_COLUMNS, LEGAL_ENTRIES, addressOf } =
  await loadTs("layout/publicNav.ts");

/**
 * An entry kept off although its page exists, with the reason. Checked both
 * ways: a key here has to name an entry that is off and whose page is there.
 */
const OFF_ON_PURPOSE = new Map([]);

const posix = (path) => path.split(sep).join("/");

function walk(dir, keep) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, keep));
    else if (keep(name)) out.push(full);
  }
  return out;
}

/** The address a page file answers at: route groups dropped. */
function routeOf(pageFile) {
  const segments = posix(relative(APP, dirname(pageFile)))
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s));
  return `/${segments.join("/")}`;
}

const PAGE_FILES = walk(APP, (name) => name === "page.tsx");
const PAGE_AT = new Map(PAGE_FILES.map((file) => [routeOf(file), file]));

const ENTRIES = [
  ...HEADER_PAGES.map((entry) => ["header", entry]),
  ...Object.values(ACCOUNT_ENTRIES).map((entry) => ["account", entry]),
  ...FOOTER_COLUMNS.flatMap((column) => column.entries.map((entry) => [`footer, ${column.heading}`, entry])),
  ...LEGAL_ENTRIES.map((entry) => ["footer, legal row", entry]),
];

/** An address on this site, as the path of its page and the part it jumps to. */
function onSite(address) {
  const [path, anchor] = address.split("#");
  return { path: path.split("?")[0], anchor: anchor ?? null };
}

/** Where an entry leads off this site: a full address, or a letter to us. */
const leavesTheSite = (entry, address) => entry.external === true || address.startsWith("mailto:");

describe("every address a public menu leads to is a page", () => {
  test("the tree and the menus were read", () => {
    assert.ok(PAGE_FILES.length > 60, `expected the pages under ${APP}: was the tree moved?`);
    assert.ok(HEADER_PAGES.length >= 3 && FOOTER_COLUMNS.length === 3 && LEGAL_ENTRIES.length >= 2, "publicNav.ts lost its lists");
    assert.equal(typeof addressOf, "function");
  });

  test("every entry either leaves the site in a way a browser can follow, or names a path here", () => {
    for (const [where, entry] of ENTRIES) {
      assert.equal(typeof entry.live, "boolean", `${where}: ${entry.key} carries no live switch`);
      if (entry.external === true) {
        assert.match(entry.href, /^https:\/\//, `${where}: ${entry.key} is marked external and is not a full address`);
      } else if (!entry.href.startsWith("mailto:")) {
        assert.match(entry.href, /^\/(?!\/)/, `${where}: ${entry.key} is neither a path on this site nor marked external`);
      }
      if (entry.meanwhile !== undefined) {
        assert.match(entry.meanwhile, /^\/(?!\/)/, `${where}: ${entry.key} leads somewhere off this site meanwhile`);
      }
    }
  });

  test("an entry that is drawn names an address with a page file", () => {
    const missing = [];
    let checked = 0;
    for (const [where, entry] of ENTRIES) {
      const address = addressOf(entry);
      if (address === null || leavesTheSite(entry, address)) continue;
      checked += 1;
      if (!PAGE_AT.has(onSite(address).path)) missing.push(`${where} | ${entry.label} | ${address}`);
    }
    assert.ok(checked >= 10, "the walk found too few entries to mean anything");
    assert.deepEqual(
      missing,
      [],
      "these are drawn in a menu and lead to an address no page.tsx under src/app answers at. " +
        "Switch the entry off until its page exists:\n  " + missing.join("\n  "),
    );
  });

  test("a part of a page an entry jumps to is on that page, once", () => {
    let jumps = 0;
    for (const [where, entry] of ENTRIES) {
      const address = addressOf(entry);
      if (address === null || leavesTheSite(entry, address)) continue;
      const { path, anchor } = onSite(address);
      if (anchor === null) continue;
      jumps += 1;
      const file = PAGE_AT.get(path);
      assert.ok(file, `${where}: ${entry.label} jumps to a part of ${path}, which has no page file`);
      const count = readFileSync(file, "utf8").split(`id="${anchor}"`).length - 1;
      assert.equal(
        count,
        1,
        `${where}: ${entry.label} leads to ${address}, and ${posix(relative(REPO_ROOT, file))} writes ` +
          `id="${anchor}" ${count} times. The id has to be written in the page's own file, once.`,
      );
    }
    assert.ok(jumps >= 1, "no entry jumps to a part of a page any more: this test reads nothing");
  });
});

describe("an entry is off only while its page is missing", () => {
  const OFF = ENTRIES.filter(([, entry]) => entry.live === false && !leavesTheSite(entry, entry.href));

  test("a page that exists has its entry switched on, or a reason written here", () => {
    const forgotten = OFF.filter(([, entry]) => PAGE_AT.has(onSite(entry.href).path) && !OFF_ON_PURPOSE.has(entry.key)).map(
      ([where, entry]) => `${where} | ${entry.label} | ${entry.href}`,
    );
    assert.deepEqual(
      forgotten,
      [],
      "these pages exist and their menu entries are still off, so no menu leads to them. Set " +
        "`live: true` in src/layout/publicNav.ts, or add the key to OFF_ON_PURPOSE with the reason:\n  " +
        forgotten.join("\n  "),
    );
  });

  test("every written reason is still about an entry that is off with its page there", () => {
    for (const [key, why] of OFF_ON_PURPOSE) {
      assert.ok(typeof why === "string" && why.trim().length >= 30, `${key}: say why in a sentence`);
      const still = OFF.some(([, entry]) => entry.key === key && PAGE_AT.has(onSite(entry.href).path));
      assert.ok(still, `${key} is no longer an entry that is off with its page there: remove it from OFF_ON_PURPOSE`);
    }
  });
});

describe("one page, one answer", () => {
  test("two entries with one key lead to one address and are on or off together", () => {
    const byKey = new Map();
    for (const [where, entry] of ENTRIES) {
      const seen = byKey.get(entry.key);
      if (!seen) {
        byKey.set(entry.key, [where, entry]);
        continue;
      }
      const [firstWhere, first] = seen;
      assert.equal(entry.href, first.href, `${entry.key}: ${firstWhere} and ${where} lead to different addresses`);
      assert.equal(entry.live, first.live, `${entry.key}: on in one of ${firstWhere} and ${where}, off in the other`);
    }
    assert.ok(byKey.size < ENTRIES.length, "no page is named by both the header and the footer any more");
  });
});

describe("/fellowships forwards to the page the menus call Fellowships", () => {
  const config = readFileSync(join(REPO_ROOT, "next.config.ts"), "utf8");
  const fellowships = HEADER_PAGES.find((entry) => entry.key === "fellowships");

  test("the header has the entry, by that name", () => {
    assert.ok(fellowships, "the header no longer has an entry with the key fellowships");
    assert.equal(fellowships.label, "Fellowships");
    assert.notEqual(fellowships.href, "/fellowships", "the page moved to /fellowships: the forward now loops, remove it");
  });

  test("the forward leads where the entry leads, and is temporary", () => {
    const entry = config.match(/\{\s*source: "\/fellowships",\s*destination: "([^"]*)",\s*permanent: (true|false),?\s*\}/);
    assert.ok(entry, "next.config.ts has no redirect from /fellowships");
    assert.equal(entry[1], fellowships.href, "the forward and the menu entry lead to different pages");
    assert.equal(entry[2], "false", "a permanent redirect is kept by a browser for good, and this page may move");
  });

  test("no page sits at /fellowships, where the forward would hide it", () => {
    assert.ok(!PAGE_AT.has("/fellowships"), "a redirect is matched before the page, so this page can never be reached");
  });
});
