/**
 * THE LINE ON HOME THAT SAYS THE PRIVACY POLICY CHANGED (`policyUpdateLine` in
 * `src/lib/legal/updateLine.ts`), and its dismissal
 * (`src/lib/legal/updateLineDismissal.ts`, drawn by Home's
 * `PolicyUpdate.tsx`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * A change to how somebody's information is used is told on the site
 * ("Changes to this policy"), and this line is how: one short sentence, the
 * same for every version, and a link to what changed. What changed is said
 * in the policy and never on Home.
 *
 *  - WHICH VERSIONS. Only a version marked `toldOnHome` in
 *    `src/lib/legal/policies.ts`. The marked versions are listed here, so
 *    marking another is a change to this file, made on purpose.
 *  - FOR HOW LONG. A week from the version's date, by London days, run here
 *    on the real policy list and on stubbed ones, across the change of the
 *    clocks. A version without the mark neither shows a line nor ends one.
 *  - DISMISSED ONCE. The version dismissed is kept in the person's own
 *    browser under one key the privacy policy names, and nowhere else. The
 *    store is run here against a browser's storage, one that refuses, and
 *    another tab's change.
 *  - /privacy carries no line: a version's own first paragraph says what it
 *    changed.
 */
import { after, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const updateLine = await loadTs("lib/legal/updateLine.ts");
const policies = await loadTs("lib/legal/policies.ts");

/** The same function over a policy list of the versions given, newest first. */
async function lineOver(versions) {
  const { loadTs: loadStubbed } = createLoader({
    stubs: [
      ["server-only", "export {};"],
      [
        "./policies",
        `export const POLICIES = { privacy: { versions: ${JSON.stringify(versions)} } };\n` +
          "export function currentPolicy(key) { return POLICIES[key].versions[0]; }",
      ],
    ],
  });
  return (await loadStubbed("lib/legal/updateLine.ts")).policyUpdateLine;
}

/** Every file under `dir`, at any depth. */
function filesUnder(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) filesUnder(full, out);
    else out.push(full);
  }
  return out;
}

/** What every line says and where it goes, whichever version it is about. */
const SAID = { words: "We've updated our privacy policy.", link: "Read what's changed", href: "/privacy#whats-changed" };

/** The civil day `offset` days after `key` ("YYYY-MM-DD"). */
function dayAt(key, offset) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + offset)).toISOString().slice(0, 10);
}

const { londonWallClockToInstant } = await loadTs("lib/courses/weekPlan.ts");
/** The instant a London wall clock shows `clock` on `day`. */
const londonAt = (day, clock) => londonWallClockToInstant(day, clock);

describe("what the line says, and which versions have one", () => {
  test("one short sentence, the same for every version, a link to what changed, and a week", () => {
    assert.equal(updateLine.UPDATE_LINE_WORDS, "We've updated our privacy policy.");
    assert.equal(updateLine.UPDATE_LINE_LINK, "Read what's changed");
    assert.equal(updateLine.UPDATE_LINE_HREF, "/privacy#whats-changed");
    assert.equal(updateLine.UPDATE_LINE_DAYS, 7);
    // Nothing of what changed is said on Home: no version carries words of its own for the line.
    for (const version of policies.POLICIES.privacy.versions) {
      assert.deepEqual(
        Object.keys(version).filter((key) => !["version", "lastUpdated", "toldOnHome"].includes(key)),
        [],
        `privacy version ${version.version} carries something beside its number, its date and whether it is told on Home`,
      );
    }
  });

  test("versions 17 and 18 are told on Home, and no other: version 19 changed nothing about how information is used", () => {
    const told = policies.POLICIES.privacy.versions.filter((version) => version.toldOnHome !== undefined);
    assert.deepEqual(
      told.map((version) => [version.version, version.toldOnHome]),
      [
        [18, true],
        [17, true],
      ],
      "a version is told on Home only when it changes how people's information is used. Marking another, or " +
        "taking a mark off, is the owner's decision for that version: make it here on purpose, with the version's own words.",
    );
    assert.equal(policies.currentPolicy("privacy").version, 19);
    assert.equal(policies.currentPolicy("privacy").toldOnHome, undefined);
    assert.equal(policies.POLICIES.terms.versions.some((version) => version.toldOnHome !== undefined), false);
  });

  test("the link lands on what changed: the current policy's first paragraph, with versions 18's and 17's changes kept under it", () => {
    const current = read(`src/content/legal/privacy/v${policies.currentPolicy("privacy").version}.tsx`).replace(/\s+/g, " ");
    const anchor = current.indexOf('<p id="whats-changed"> <strong>What&apos;s changed in version 19:</strong>');
    const eighteen = current.indexOf("<strong>What changed in version 18, on 13 November 2026:</strong>");
    const seventeen = current.indexOf("<strong>What changed in version 17, on 12 November 2026:</strong>");
    const summary = current.indexOf('<h2 id="in-short">');
    assert.ok(anchor !== -1 && anchor < eighteen && eighteen < seventeen && seventeen < summary, "what each told version changed is not at the anchor the line links to, newest first, before the summary");
    assert.equal(current.split('id="whats-changed"').length, 2, "the anchor is on the page more than once, or not at all");
  });
});

describe("a week from a told version's date, on the real policy list", () => {
  const from18 = updateLine.civilDayOf(policies.POLICIES.privacy.versions.find((v) => v.version === 18).lastUpdated);
  const from17 = updateLine.civilDayOf(policies.POLICIES.privacy.versions.find((v) => v.version === 17).lastUpdated);
  const end18 = dayAt(from18, 7);
  const end17 = dayAt(from17, 7);
  /** The newest told version whose week `day` is inside, or null. */
  const expectedOn = (day) => (day >= from18 && day < end18 ? 18 : day >= from17 && day < end17 ? 17 : null);

  test("the two dates, as they went live", () => {
    assert.equal(from17, "2026-11-12");
    assert.equal(from18, "2026-11-13");
  });

  test("every day from the day before version 17's date to the day after version 18's last: nothing, version 17's line, version 18's, nothing", () => {
    const seen = new Set();
    for (let day = dayAt(from17, -1); day <= dayAt(end18, 1); day = dayAt(day, 1)) {
      // Noon in London.
      const line = updateLine.policyUpdateLine(londonAt(day, "12:00"));
      const expected = expectedOn(day);
      assert.deepEqual(line, expected === null ? null : { version: expected, ...SAID }, day);
      seen.add(expected);
    }
    for (const version of [null, 17, 18]) assert.ok(seen.has(version), `the run never reached ${version}`);
  });

  test("the first and last moment of each period, in London", () => {
    const told = (day, clock) => updateLine.policyUpdateLine(londonAt(day, clock))?.version ?? null;
    const last = (day) => told(dayAt(day, -1), "23:59");
    // Before version 17's date: nothing. Version 17's line, from its date until version 18's.
    assert.equal(last(from17), null);
    assert.equal(told(from17, "00:00"), 17);
    assert.equal(last(from18), 17);
    // Version 18's line, from its date to its seventh day; then nothing, and version 17's does not come back.
    assert.equal(told(from18, "00:00"), 18);
    assert.equal(last(end18), 18);
    assert.equal(told(end18, "00:00"), null);
    // 19 November 2026 is the last day anybody is shown a line for these two versions.
    assert.equal(told("2026-11-19", "23:59"), 18);
    assert.equal(told("2026-11-20", "00:00"), null);
  });

  test("the current version, which is not told on Home, neither shows a line of its own nor ends version 18's", () => {
    const current = policies.currentPolicy("privacy");
    const from19 = updateLine.civilDayOf(current.lastUpdated);
    assert.ok(from19, "the current version's date cannot be read");
    // On the current version's own first day the line is still the newest told version's, if its week runs.
    const line = updateLine.policyUpdateLine(londonAt(from19, "12:00"));
    assert.equal(line?.version ?? null, expectedOn(from19));
    assert.notEqual(line?.version, current.version);
  });
});

describe("which version's line, on stubbed lists", () => {
  const v18 = { version: 18, lastUpdated: "13 November 2026", toldOnHome: true };
  const at = (iso) => new Date(iso);

  test("a version without the mark on top of a told one changes nothing: same line, same number, same last day", async () => {
    const alone = await lineOver([v18]);
    for (const newer of [
      { version: 19, lastUpdated: "13 November 2026" },
      { version: 19, lastUpdated: "16 November 2026" },
      { version: 19, lastUpdated: "1 January 2027" },
      { version: 19, lastUpdated: "soon" },
    ]) {
      const under = await lineOver([newer, v18]);
      for (const moment of ["2026-11-12T23:59:59Z", "2026-11-13T00:00:00Z", "2026-11-16T12:00:00Z", "2026-11-19T23:59:59Z", "2026-11-20T00:00:00Z", "2027-01-02T12:00:00Z"]) {
        assert.deepEqual(under(at(moment)), alone(at(moment)), `${newer.lastUpdated} at ${moment}`);
      }
    }
    assert.deepEqual(alone(at("2026-11-16T12:00:00Z")), { version: 18, ...SAID });
  });

  test("a later told version takes the line from its own date, and the earlier one keeps it until then", async () => {
    const v20 = { version: 20, lastUpdated: "17 November 2026", toldOnHome: true };
    const line = await lineOver([v20, { version: 19, lastUpdated: "14 November 2026" }, v18]);
    assert.equal(line(at("2026-11-12T12:00:00Z")), null);
    assert.equal(line(at("2026-11-16T23:59:59Z")).version, 18);
    assert.equal(line(at("2026-11-17T00:00:00Z")).version, 20);
    // Version 18's week ends on 19 November inside version 20's: the line stays version 20's, to its own seventh day.
    assert.equal(line(at("2026-11-21T12:00:00Z")).version, 20);
    assert.equal(line(at("2026-11-23T23:59:59Z")).version, 20);
    assert.equal(line(at("2026-11-24T00:00:00Z")), null);
  });

  test("a later told version whose week is over leaves an earlier one's line, while that one's week still runs", async () => {
    // Dated out of order, which the real list never is: the rule is still the newest told version INSIDE its week.
    const line = await lineOver([{ version: 20, lastUpdated: "1 November 2026", toldOnHome: true }, v18]);
    assert.equal(line(at("2026-11-07T12:00:00Z")).version, 20);
    assert.equal(line(at("2026-11-08T12:00:00Z")), null);
    assert.equal(line(at("2026-11-14T12:00:00Z")).version, 18);
  });

  test("only a mark that is exactly true counts, and a told version whose date cannot be read has no line", async () => {
    const moment = at("2026-11-14T12:00:00Z");
    for (const mark of [undefined, false, null, "true", 1, "yes", {}]) {
      assert.equal((await lineOver([{ version: 18, lastUpdated: "13 November 2026", toldOnHome: mark }]))(moment), null, String(mark));
    }
    assert.equal((await lineOver([]))(moment), null);
    for (const date of ["soon", "13 Nov 2026", "31 February 2027", "2026-11-13", "13 november 2026"]) {
      assert.equal(updateLine.civilDayOf(date), null, date);
      assert.equal((await lineOver([{ ...v18, lastUpdated: date }]))(moment), null, date);
      // An unreadable date above a readable one does not hide the readable one's line.
      assert.equal((await lineOver([{ version: 19, lastUpdated: date, toldOnHome: true }, v18]))(moment).version, 18, date);
    }
    assert.equal(updateLine.civilDayOf("12 November 2026"), "2026-11-12");
    assert.equal(updateLine.civilDayOf("1 March 2027"), "2027-03-01");
  });
});

describe("the week, by London days", () => {
  const told = (lastUpdated) => lineOver([{ version: 20, lastUpdated, toldOnHome: true }]);

  test("in winter: from midnight on the date to the end of the sixth day after it", async () => {
    const line = await told("12 November 2026");
    // November is GMT, so London midnight is UTC midnight.
    assert.equal(line(new Date("2026-11-11T23:59:59Z")), null);
    assert.ok(line(new Date("2026-11-12T00:00:00Z")));
    assert.ok(line(new Date("2026-11-18T23:59:59Z")));
    assert.equal(line(new Date("2026-11-19T00:00:00Z")), null);
  });

  test("in summer the day is London's, not the server's", async () => {
    const line = await told("1 July 2027");
    // 23:30 UTC on 30 June is 00:30 on 1 July in London (BST).
    assert.ok(line(new Date("2027-06-30T23:30:00Z")), "the line waits for the UTC day, not London's");
    assert.equal(line(new Date("2027-06-30T22:30:00Z")), null);
    // 7 July is the last day; 23:30 UTC on 7 July is already 8 July in London.
    assert.ok(line(new Date("2027-07-07T22:30:00Z")));
    assert.equal(line(new Date("2027-07-07T23:30:00Z")), null);
  });

  test("across the clocks going back, still seven London days", async () => {
    // The clocks go back on Sunday 31 October 2027, inside this week.
    const line = await told("27 October 2027");
    assert.equal(line(new Date("2027-10-26T22:59:59Z")), null, "26 October, 23:59 in London (BST)");
    assert.ok(line(new Date("2027-10-26T23:00:00Z")), "27 October, 00:00 in London (BST)");
    assert.ok(line(new Date("2027-11-02T23:59:59Z")), "2 November, the seventh day, 23:59 in London (GMT)");
    assert.equal(line(new Date("2027-11-03T00:00:00Z")), null);
  });
});

/**
 * A browser's storage for the store to run against: `storage` is what
 * `window.localStorage` holds, and `events` the listeners `window` was given.
 */
function fakeWindow({ refuses = false } = {}) {
  const storage = new Map();
  const events = new Map();
  const writes = [];
  return {
    storage,
    events,
    writes,
    window: {
      localStorage: {
        getItem(key) {
          if (refuses) throw new Error("storage refused");
          return storage.has(key) ? storage.get(key) : null;
        },
        setItem(key, value) {
          if (refuses) throw new Error("storage refused");
          writes.push([key, value]);
          storage.set(key, String(value));
        },
      },
      addEventListener(type, listener) {
        events.set(type, [...(events.get(type) ?? []), listener]);
      },
      removeEventListener(type, listener) {
        events.set(type, (events.get(type) ?? []).filter((kept) => kept !== listener));
      },
    },
  };
}

/**
 * The store as a page loads it: an instance of its own, with nothing dismissed
 * on the page yet.
 *
 * The loader gives two modules of the same text one instance, as a bundle
 * does, and the store keeps what was dismissed on its page in the module. So
 * each page here is the store's own source with one line added that names the
 * page, which is a module of its own, loaded from a directory that goes when
 * the file is done.
 */
const PAGES_DIR = mkdtempSync(join(tmpdir(), "naisi-policy-line-"));
after(() => rmSync(PAGES_DIR, { recursive: true, force: true }));
let pages = 0;
async function freshStore() {
  pages += 1;
  const file = join(PAGES_DIR, `updateLineDismissal.page${pages}.ts`);
  writeFileSync(file, `${read("src/lib/legal/updateLineDismissal.ts")}\nexport const PAGE = ${pages};\n`);
  const { loadTs: loadFresh } = createLoader({ stubs: [] });
  const store = await loadFresh(file);
  assert.equal(store.PAGE, pages);
  return store;
}

describe("a dismissal is kept in the person's own browser, under one key, against the line's version", () => {
  const KEY = "naisi.policyNotice.dismissed";

  test("the key is the one the privacy policy lists", async () => {
    const store = await freshStore();
    assert.equal(store.UPDATE_LINE_DISMISSED_KEY, KEY);
    const policy = read(`src/content/legal/privacy/v${policies.currentPolicy("privacy").version}.tsx`).replace(/\s+/g, " ");
    assert.ok(policy.includes(`<code>${KEY}</code> (that you dismissed the line saying this policy changed)`), "the current policy does not list the key the dismissal is kept under");
  });

  test("a stored value is a version number or nothing", async () => {
    const store = await freshStore();
    assert.equal(store.dismissedVersionFrom("18"), 18);
    assert.equal(store.dismissedVersionFrom("7"), 7);
    assert.equal(store.dismissedVersionFrom("999999"), 999999);
    for (const stored of [null, "", "0", "-1", "1.5", "abc", "18abc", " 18", "18 ", "1e3", "0018", "9999999", "true", "NaN", "Infinity"]) {
      assert.equal(store.dismissedVersionFrom(stored), 0, JSON.stringify(stored));
    }
  });

  test("dismissing writes the version under that key and nothing else, and it is read back on a later visit", async () => {
    const browser = fakeWindow();
    globalThis.window = browser.window;
    try {
      const store = await freshStore();
      assert.equal(store.dismissedUpdateLineVersion(), 0);
      assert.deepEqual(browser.writes, [], "reading wrote something");
      store.dismissUpdateLine(18);
      assert.deepEqual(browser.writes, [[KEY, "18"]]);
      assert.deepEqual([...browser.storage], [[KEY, "18"]]);
      assert.equal(store.dismissedUpdateLineVersion(), 18);
      // A later visit is another page, with nothing dismissed on it yet: the browser's storage is all it has.
      const later = await freshStore();
      assert.notEqual(later, store);
      assert.equal(later.dismissedUpdateLineVersion(), 18);
    } finally {
      delete globalThis.window;
    }
  });

  test("the kept number never goes down, and a later version's dismissal moves it up", async () => {
    const browser = fakeWindow();
    browser.storage.set(KEY, "18");
    globalThis.window = browser.window;
    try {
      const store = await freshStore();
      store.dismissUpdateLine(17);
      assert.equal(browser.storage.get(KEY), "18");
      assert.equal(store.dismissedUpdateLineVersion(), 18);
      store.dismissUpdateLine(20);
      assert.equal(browser.storage.get(KEY), "20");
      assert.equal(store.dismissedUpdateLineVersion(), 20);
    } finally {
      delete globalThis.window;
    }
  });

  test("something else under the key reads as nothing dismissed", async () => {
    const browser = fakeWindow();
    browser.storage.set(KEY, "1");
    globalThis.window = browser.window;
    try {
      const store = await freshStore();
      assert.equal(store.dismissedUpdateLineVersion(), 1);
      for (const stored of ["yes", "", "18.5", "-3"]) {
        browser.storage.set(KEY, stored);
        assert.equal(store.dismissedUpdateLineVersion(), 0, JSON.stringify(stored));
      }
    } finally {
      delete globalThis.window;
    }
  });

  test("a browser that refuses storage still dismisses for the page it is on, and throws nothing", async () => {
    const browser = fakeWindow({ refuses: true });
    globalThis.window = browser.window;
    try {
      const store = await freshStore();
      assert.equal(store.dismissedUpdateLineVersion(), 0);
      store.dismissUpdateLine(18);
      assert.equal(store.dismissedUpdateLineVersion(), 18);
      assert.deepEqual([...browser.storage], []);
      // Its next visit has nothing to go by, so it is shown the line again until the line's week ends.
      assert.equal((await freshStore()).dismissedUpdateLineVersion(), 0);
    } finally {
      delete globalThis.window;
    }
  });

  test("the page hears a dismissal made on it or in another tab, and stops hearing when it leaves", async () => {
    const browser = fakeWindow();
    globalThis.window = browser.window;
    try {
      const store = await freshStore();
      let heard = 0;
      const stop = store.subscribeUpdateLineDismissal(() => {
        heard += 1;
      });
      assert.equal((browser.events.get("storage") ?? []).length, 1);
      store.dismissUpdateLine(18);
      assert.equal(heard, 1);
      // Another tab of this browser: its own key, or the whole storage cleared; never somebody else's key.
      const [onStorage] = browser.events.get("storage");
      onStorage({ key: KEY });
      assert.equal(heard, 2);
      onStorage({ key: null });
      assert.equal(heard, 3);
      onStorage({ key: "naisi.sidebar.collapsed" });
      assert.equal(heard, 3);
      stop();
      assert.deepEqual(browser.events.get("storage"), []);
      store.dismissUpdateLine(20);
      assert.equal(heard, 3, "a page that left still hears");
    } finally {
      delete globalThis.window;
    }
  });

  test("nothing but the browser's own storage: no cookie, no request, nothing on the account, and no clock", () => {
    const source = code("src/lib/legal/updateLineDismissal.ts");
    assert.doesNotMatch(source, /document\.cookie|cookies\(|fetch\(|XMLHttpRequest|sendBeacon|firebase|firestore|sessionStorage|indexedDB|Date\.now|new Date\(/);
    assert.deepEqual([...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]), [], "the store imports something");
    assert.equal((source.match(/\blocalStorage\.(?:setItem|getItem)\(UPDATE_LINE_DISMISSED_KEY\b/g) ?? []).length, 2, "the store reaches local storage under another key, or more than once each way");
    assert.equal((source.match(/\blocalStorage\b/g) ?? []).length, 2);
  });
});

describe("worked out from the date alone, and drawn on Home only", () => {
  test("which line: nothing stored, nothing about a person, and the clock is the caller's", () => {
    const source = code("src/lib/legal/updateLine.ts");
    assert.doesNotMatch(source, /firebase|getAdminDb|cookies\(|document\.cookie|localStorage|sessionStorage|Date\.now|new Date\(\)/);
    const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    assert.deepEqual(imports, ["@/lib/datetime/siteTime", "./policies"]);
  });

  test("Home draws it under the greeting on every form, from the page's own clock", () => {
    const page = code("src/app/(app)/dashboard/page.tsx");
    assert.match(page, /const invite = \(\s*<>\s*<PolicyUpdate line=\{policyUpdateLine\(now\)\} \/>/);
    for (const form of ["HomeAdmin", "HomeMember"]) assert.match(page, new RegExp(`<${form}[\\s\\S]*?invite=\\{invite\\}`), `${form} is not handed the line`);
  });

  test("the line is the sentence, the link and Dismiss, and nothing else", () => {
    const line = code("src/app/(app)/dashboard/PolicyUpdate.tsx");
    assert.match(read("src/app/(app)/dashboard/PolicyUpdate.tsx"), /^["']use client["'];$/m);
    assert.match(line, /<span>\{line\.words\}<\/span>\s*<Link href=\{line\.href\} className=\{homeStyles\.textLink\}>\s*\{line\.link\}\s*<\/Link>\s*<button type="button" className=\{homeStyles\.policyDismiss\} onClick=\{\(\) => dismissUpdateLine\(line\.version\)\}>\s*Dismiss<span className=\{homeStyles\.srOnly\}> the note that our privacy policy changed<\/span>\s*<\/button>/);
    // Its words are `policyUpdateLine`'s: the component adds none of its own beside Dismiss.
    assert.doesNotMatch(line, /Claude|register|session|sent or not/i);
    // The browser's storage is reached through the store alone.
    assert.doesNotMatch(line, /localStorage|sessionStorage|document\.cookie/);
  });

  test("no line until the browser has been asked: the server's markup carries none, and one dismissed is never drawn first", async () => {
    const line = code("src/app/(app)/dashboard/PolicyUpdate.tsx");
    assert.match(line, /const NOT_ASKED = null;/);
    assert.match(line, /useSyncExternalStore<number \| null>\(\s*subscribeUpdateLineDismissal,\s*dismissedUpdateLineVersion,\s*\(\) => NOT_ASKED,\s*\)/);
    assert.match(line, /if \(!line \|\| dismissed === NOT_ASKED \|\| dismissed >= line\.version\) return null;/);
    // Rendered as the server renders it, with a line to say and no browser to ask.
    const { loadTs: loadPage } = createLoader({
      stubs: [
        ["server-only", "export {};"],
        // A stub is written outside the repository and imports nothing, so React's element maker is handed over.
        ["next/link", "export default ({ href, className, children }) => globalThis.__policyLine.h('a', { href, className }, children);"],
        ["./home.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
      ],
    });
    globalThis.__policyLine = { h: createElement };
    const { default: PolicyUpdate } = await loadPage("app/(app)/dashboard/PolicyUpdate.tsx");
    assert.equal(renderToStaticMarkup(createElement(PolicyUpdate, { line: { version: 18, ...SAID } })), "");
    assert.equal(renderToStaticMarkup(createElement(PolicyUpdate, { line: null })), "");
  });

  test("/privacy carries no line: the archived notice is the banner's only use, and the page reads no clock", () => {
    const legal = code("src/components/legal/LegalPolicyPage.tsx");
    assert.doesNotMatch(legal, /policyUpdateLine|updateLine|new Date\(|Date\.now/);
    assert.match(legal, /const banner = archived \? \(\s*<Notice tone="info" role="note" className=\{styles\.archivedBanner\}>[\s\S]*?\) : undefined;/);
    assert.doesNotMatch(code("src/app/(public)/privacy/page.tsx"), /revalidate|policyUpdateLine/);
    assert.doesNotMatch(read("src/content/legal/legal.module.css"), /updateBanner/);
    // An archived version keeps its own notice.
    assert.match(code("src/app/(public)/privacy/v/[version]/page.tsx"), /<LegalPolicyPage policy="privacy" version=\{n\} archived \/>/);
  });

  test("the line is read nowhere else in the app", () => {
    // Home's page works it out and Home's component draws it: no other page, layout or route says the policy changed.
    const walk = (dir) =>
      filesUnder(join(REPO_ROOT, dir))
        .filter((file) => /\.(?:ts|tsx)$/.test(file))
        .map((file) => file.slice(REPO_ROOT.length + 1).split(sep).join("/"));
    const readers = walk("src").filter((file) => /\bpolicyUpdateLine\(|\bUPDATE_LINE_WORDS\b/.test(code(file)));
    assert.deepEqual(readers.sort(), ["src/app/(app)/dashboard/page.tsx", "src/lib/legal/updateLine.ts"]);
    const dismissers = walk("src").filter((file) => /\bupdateLineDismissal\b/.test(code(file)));
    assert.deepEqual(dismissers.sort(), ["src/app/(app)/dashboard/PolicyUpdate.tsx"]);
  });
});

describe("the browser suite reads the same rule", () => {
  // tests/e2e/member-journey.spec.mjs holds Home to the line or to no line on the day it runs, and drives
  // Dismiss when one is due. Which of the two it expects is worked out by its fixture from the product's
  // own files, in plain JavaScript; held here to the product's function, so the two cannot drift apart.
  test("which version's line is due: the fixture's answer is the product's, every day around both weeks and either side of each midnight", async () => {
    const { policyLineAt } = await import("../scripts/e2e-fixtures/member-journey.mjs");
    for (let day = "2026-11-10"; day <= "2026-11-22"; day = dayAt(day, 1)) {
      for (const clock of ["00:00", "00:11", "12:00", "23:49", "23:59"]) {
        const at = londonAt(day, clock);
        assert.equal(policyLineAt(at).version, updateLine.policyUpdateLine(at)?.version ?? null, `${day} ${clock}`);
      }
    }
    // In summer, London's day, and no line.
    assert.deepEqual(policyLineAt(new Date("2027-06-30T23:30:00Z")), { version: null, settled: true });
  });

  test("it holds Home to neither answer only within ten minutes of a midnight at which the answer changes", async () => {
    const { policyLineAt } = await import("../scripts/e2e-fixtures/member-journey.mjs");
    const settled = (day, clock) => policyLineAt(londonAt(day, clock)).settled;
    // Version 18's week ends with 19 November.
    assert.equal(settled("2026-11-19", "23:49"), true);
    assert.equal(settled("2026-11-19", "23:51"), false);
    assert.equal(settled("2026-11-20", "00:09"), false);
    assert.equal(settled("2026-11-20", "00:11"), true);
    // Version 17's line gives way to version 18's at the start of 13 November.
    assert.equal(settled("2026-11-12", "23:55"), false);
    assert.equal(settled("2026-11-13", "00:05"), false);
    // A midnight inside a week changes nothing.
    assert.equal(settled("2026-11-15", "23:59"), true);
    assert.equal(settled("2026-11-16", "00:00"), true);
  });

  test("what it looks for is what Home draws: the sentence, the link, the button's name and the key", async () => {
    const { POLICY_LINE } = await import("../scripts/e2e-fixtures/member-journey.mjs");
    assert.deepEqual({ words: POLICY_LINE.words, link: POLICY_LINE.link, href: POLICY_LINE.href }, SAID);
    assert.equal(POLICY_LINE.dismissedKey, (await freshStore()).UPDATE_LINE_DISMISSED_KEY);
    // The button's name is its word and the words only a screen reader is given, which the fixture's reader does not pin.
    const [, hidden] = /Dismiss<span className=\{homeStyles\.srOnly\}>([^<]+)<\/span>/.exec(read("src/app/(app)/dashboard/PolicyUpdate.tsx")) ?? [];
    assert.equal(POLICY_LINE.dismiss, `Dismiss${hidden}`);
    const spec = read("tests/e2e/member-journey.spec.mjs");
    assert.match(spec, /const expected = policyLineAt\(new Date\(\)\);/);
    // Where the link lands: the spec's pattern for the paragraph's first words is run on the words the
    // current policy renders there (`&apos;` is a straight apostrophe on the page, never a curly one).
    const landed = /assert\.match\(await changed\.innerText\(\), \/(.+)\/\);/.exec(spec);
    assert.ok(landed, "the spec no longer reads the paragraph the link lands on");
    const current = policies.currentPolicy("privacy").version;
    const [, heading] = /<p id="whats-changed">\s*<strong>([^<]+)<\/strong>/.exec(read(`src/content/legal/privacy/v${current}.tsx`)) ?? [];
    assert.equal(heading, `What&apos;s changed in version ${current}:`);
    assert.match(`${heading.replace(/&apos;/g, "'")} the site keeps`, new RegExp(landed[1]), "the spec's pattern does not match what the policy page renders at the anchor");
    assert.match(spec, /assert\.equal\(await line\.textContent\(\), `\$\{POLICY_LINE\.words\}\$\{POLICY_LINE\.link\}\$\{POLICY_LINE\.dismiss\}`\);/);
  });
});
