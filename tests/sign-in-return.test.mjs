/**
 * Where a sign-in comes back to, and how that survives a trip to Google.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The sign-in page is opened with a return address. In a browser window
 * Google signs people in through a pop-up and the address is simply still
 * there. In the installed app the whole window goes to Google and comes back
 * through `/api/auth/google/callback`, so the address is carried three ways
 * (Google's `state`, a cookie, the tab), and one guard decides whether any
 * copy of it is a path on this site. The rules are
 * `src/lib/signInReturn.ts`, and they are executed here:
 *
 *  1. THE GUARD. A table of addresses, and every short string a browser
 *     could read as another site's, each put to a URL parser as well: what
 *     the guard passes, a browser keeps on this site.
 *  2. THE COOKIE. Written so it can ride a POST from another site wherever
 *     the page is https, and read back by the framework's own cookie reader.
 *  3. THE TAB'S COPY. Believed for as long as the cookie lives, and never
 *     for anything but a path on this site.
 *  4. WHAT THE SIGN-IN PAGE TAKES WHEN IT OPENS, and what the callback route
 *     puts back.
 *  5. THE CALLBACK ROUTE, RUN, with the framework's real request and
 *     response and Google's signature check stood in for: it restores an
 *     address it was handed, drops one that is not this site's, and never
 *     clears a cookie it did not receive.
 *  6. THE FILES THAT USE THE RULES, read: the sign-in page, Google's button,
 *     the route and the function that loads a document. And two walks of
 *     the tree, so a new reader of a return address, or a new document load
 *     at an address that is not written in its file, is one somebody had to
 *     write down.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

/**
 * The framework's own request and response, so the cookies this file reads
 * and the ones the route writes are parsed and written by the code that runs
 * in production. (`next/server` has no file a bare import can find from
 * here, so the route's import of it is pointed at the file by name.)
 */
const NEXT_SERVER = pathToFileURL(join(REPO_ROOT, "node_modules", "next", "server.js")).href;

/** The one credential "Google signed". Every other string fails the check. */
const SIGNED = "a-credential-google-signed";
const CLIENT_ID = "client-id.apps.example";
const SITE = "https://naisi.example";

// The route reads both when its module is first run.
process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = CLIENT_ID;
process.env.NEXT_PUBLIC_APP_URL = SITE;

const { loadTs } = createLoader({
  stubs: [
    ["next/server", `export { NextRequest, NextResponse } from "${NEXT_SERVER}";`],
    [
      // Nobody but Google can sign a credential, so the check is the one door
      // closed here. It records what it was asked, and passes one string.
      "google-auth-library",
      "export class OAuth2Client {\n" +
        "  constructor(clientId) { this.clientId = clientId; }\n" +
        "  async verifyIdToken({ idToken, audience }) {\n" +
        "    (globalThis.__googleAsked ||= []).push({ idToken, audience, clientId: this.clientId });\n" +
        `    if (idToken !== ${JSON.stringify(SIGNED)}) throw new Error("not signed by Google");\n` +
        "    return {};\n" +
        "  }\n" +
        "}",
    ],
  ],
});

const rules = await loadTs(join("lib", "signInReturn.ts"));
const joinRules = await loadTs(join("lib", "applications", "applicant", "join.ts"));
const authReturn = await loadTs(join("lib", "authReturn.ts"));
const route = await loadTs(join("app", "api", "auth", "google", "callback", "route.ts"));
const { NextRequest } = await import(NEXT_SERVER);

const FORM = "/apply/autumn-2026__k3f9a2b1";
const MARKED = `${FORM}?join=1`;

/** Where a browser would go for `path`, asked of a URL parser: this site, or another. */
function staysOnSite(path) {
  const base = `${SITE}/login?next=x`;
  try {
    return new URL(path, base).origin === SITE;
  } catch {
    return true; // Not an address a browser can follow anywhere.
  }
}

// ---------------------------------------------------------------------------
// 1. The guard
// ---------------------------------------------------------------------------

describe("the guard: is this a path on this site?", () => {
  const { safeReturnPath, RETURN_MAX_LENGTH } = rules;

  test("a path on this site is handed back as it came", () => {
    for (const path of [
      "/",
      "/dashboard",
      "/tasks?task=abc&view=list",
      FORM,
      MARKED,
      `${MARKED}#account`,
      "/courses/intro/apply",
      "/a b",
      "/café",
      "/a/../b",
      "/?x=1",
      "/#top",
      "/a//b",
      `/${"a".repeat(RETURN_MAX_LENGTH - 1)}`,
    ]) {
      assert.equal(safeReturnPath(path), path, path);
      assert.equal(staysOnSite(path), true, `a browser leaves the site for ${JSON.stringify(path)}`);
    }
  });

  test("anything a browser reads as another site's address is refused", () => {
    for (const other of [
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "\\/evil.example",
      "\\\\evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/\r/evil.example",
      "/\t\\evil.example",
      "https://evil.example",
      "https:evil.example",
      "javascript:alert(1)",
      "evil.example",
      " //evil.example",
    ]) {
      assert.equal(safeReturnPath(other), null, JSON.stringify(other));
    }
  });

  test("a backslash or a control character is refused wherever it stands", () => {
    // No path this site makes holds either, and both are what such an
    // address is built from.
    for (const odd of ["/a\\b", "/apply\\..\\admin", "/a\tb", "/a\nb", "/a\rb", "/a\u0000b", "/a\u001fb", "/a\u007fb", "/dashboard\n"]) {
      assert.equal(safeReturnPath(odd), null, JSON.stringify(odd));
    }
  });

  test("no address, an address that is not text, and one too long to carry are refused", () => {
    for (const nothing of [null, undefined, "", 0, 42, true, [MARKED], { toString: () => MARKED }, "dashboard", " /dashboard"]) {
      assert.equal(safeReturnPath(nothing), null, String(nothing));
    }
    assert.equal(safeReturnPath(`/${"a".repeat(RETURN_MAX_LENGTH)}`), null);
    assert.ok(RETURN_MAX_LENGTH >= 512 && RETURN_MAX_LENGTH <= 2048, "the longest address carried is not between 512 and 2,048 characters");
  });

  test("every short string the guard passes, a URL parser keeps on this site", () => {
    // Every string of up to four of these characters, in front of a host
    // name. The characters are the ones an address of another site can be
    // spelt with, and the ones a browser drops or rewrites before it reads.
    const pieces = ["/", "\\", "\t", "\n", "\r", " ", ".", "a", ":", "@", "?", "#", "%2f", "\u0000"];
    let passed = 0;
    let tried = 0;
    const walk = (prefix, depth) => {
      for (const piece of pieces) {
        const start = prefix + piece;
        for (const candidate of [start, `${start}evil.example`, `${start}evil.example/apply/x`]) {
          tried += 1;
          const kept = safeReturnPath(candidate);
          if (kept === null) continue;
          passed += 1;
          assert.equal(kept, candidate);
          assert.equal(staysOnSite(candidate), true, `the guard passed ${JSON.stringify(candidate)}, and a browser leaves the site for it`);
        }
        if (depth > 1) walk(start, depth - 1);
      }
    };
    walk("", 4);
    assert.ok(tried > 100000, `only ${tried} strings were tried`);
    assert.ok(passed > 1500, `only ${passed} strings passed, so the table proves little`);
  });

  test("it is at least as narrow as the list registration keeps, wherever both answer", () => {
    // Whatever survives registration is a path on this site too.
    for (const path of [FORM, MARKED, "/courses/intro/apply", "/apply/../admin", "/courses/a\\b", "/apply/x\n", "//evil.example/apply/x"]) {
      if (authReturn.safeFunnelReturn(path) !== null) assert.equal(safeReturnPath(path), path, path);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The cookie
// ---------------------------------------------------------------------------

/** A cookie's text as a browser reads it: the pair, then its attributes. */
function readCookieText(text) {
  const [pair, ...rest] = text.split(/;\s*/);
  const eq = pair.indexOf("=");
  const attributes = new Map(rest.map((part) => part.split("=")).map(([key, value]) => [key.toLowerCase(), value ?? true]));
  return { name: pair.slice(0, eq), value: pair.slice(eq + 1), attributes };
}

describe("the cookie the callback route reads", () => {
  const { returnCookieText, RETURN_COOKIE, RETURN_MAX_AGE_SECONDS } = rules;

  test("its name and its life are the ones the privacy page gives", () => {
    assert.equal(RETURN_COOKIE, "__auth_next");
    assert.equal(RETURN_MAX_AGE_SECONDS, 600);
    // The policy that is current today names it and says ten minutes.
    const policies = readdirSync(join(SRC, "content", "legal", "privacy")).filter((name) => /^v\d+\.tsx$/.test(name));
    const latest = policies.sort((a, b) => Number(a.slice(1, -4)) - Number(b.slice(1, -4))).at(-1);
    const policy = readFileSync(join(SRC, "content", "legal", "privacy", latest), "utf8").replace(/\s+/g, " ");
    assert.match(policy, /<code>__auth_next<\/code> remembers which page to send you to once you have signed in\. Ten minutes\./);
  });

  test("over https it can ride a POST from another site", () => {
    const cookie = readCookieText(returnCookieText(MARKED, true));
    assert.equal(cookie.name, RETURN_COOKIE);
    assert.equal(decodeURIComponent(cookie.value), MARKED);
    assert.equal(cookie.attributes.get("samesite"), "none");
    assert.equal(cookie.attributes.get("secure"), true);
    assert.equal(cookie.attributes.get("path"), "/");
    assert.equal(cookie.attributes.get("max-age"), String(RETURN_MAX_AGE_SECONDS));
  });

  test("over plain http it is the cookie it always was", () => {
    const cookie = readCookieText(returnCookieText(MARKED, false));
    assert.equal(decodeURIComponent(cookie.value), MARKED);
    assert.equal(cookie.attributes.get("samesite"), "lax");
    assert.equal(cookie.attributes.has("secure"), false);
    assert.equal(cookie.attributes.get("path"), "/");
    assert.equal(cookie.attributes.get("max-age"), String(RETURN_MAX_AGE_SECONDS));
  });

  test("it never says None without Secure, which a browser refuses outright", () => {
    for (const overHttps of [true, false]) {
      const { attributes } = readCookieText(returnCookieText("/dashboard", overHttps));
      if (attributes.get("samesite") === "none") assert.equal(attributes.get("secure"), true);
    }
  });

  test("whatever the path holds, the framework's cookie reader hands back the same path", () => {
    for (const path of [MARKED, "/tasks?task=a&b=c;d", "/a b", "/café?x=%2F", "/a=b", "/x,y", '/"quoted"']) {
      const { name, value } = readCookieText(returnCookieText(path, true));
      assert.match(value, /^[A-Za-z0-9%._~!'()*-]+$/, `the cookie's value for ${path} holds a character a cookie cannot`);
      const request = new NextRequest(`${SITE}/api/auth/google/callback`, { headers: { cookie: `g_csrf_token=t; ${name}=${value}` } });
      assert.equal(request.cookies.get(RETURN_COOKIE)?.value, path);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. The tab's copy
// ---------------------------------------------------------------------------

describe("the copy the tab keeps", () => {
  const { packTabReturn, readTabReturn, RETURN_MAX_AGE_SECONDS, RETURN_TAB_KEY } = rules;
  const NOW = Date.UTC(2026, 9, 7, 12, 0, 0);
  const LIFE = RETURN_MAX_AGE_SECONDS * 1000;

  test("it is kept under the site's own prefix", () => {
    assert.equal(RETURN_TAB_KEY, "naisi.auth.next");
  });

  test("what was kept comes back as it went in", () => {
    for (const path of ["/dashboard", MARKED, "/tasks?task=abc"]) {
      assert.equal(readTabReturn(packTabReturn(path, NOW), NOW), path);
      assert.equal(readTabReturn(packTabReturn(path, NOW), NOW + 1000), path);
    }
  });

  test("it is believed for as long as the cookie lives and no longer, and never from the future", () => {
    const kept = packTabReturn(MARKED, NOW);
    assert.equal(readTabReturn(kept, NOW + LIFE), MARKED);
    assert.equal(readTabReturn(kept, NOW + LIFE + 1), null);
    assert.equal(readTabReturn(kept, NOW - 1), null);
  });

  test("text that is not ours is not believed", () => {
    for (const raw of [
      null,
      undefined,
      "",
      MARKED,
      "not json",
      "[]",
      "42",
      "null",
      JSON.stringify({ v: 2, at: NOW, next: MARKED }),
      JSON.stringify({ at: NOW, next: MARKED }),
      JSON.stringify({ v: 1, next: MARKED }),
      JSON.stringify({ v: 1, at: String(NOW), next: MARKED }),
      JSON.stringify({ v: 1, at: null, next: MARKED }),
      JSON.stringify({ v: 1, at: NOW }),
      JSON.stringify([{ v: 1, at: NOW, next: MARKED }]),
    ]) {
      assert.equal(readTabReturn(raw, NOW), null, String(raw));
    }
  });

  test("an address that is not this site's does not come back, however it got in", () => {
    for (const other of ["//evil.example", "/\\evil.example", "https://evil.example/apply/x", "/\t/evil.example", 42, [MARKED]]) {
      assert.equal(readTabReturn(JSON.stringify({ v: 1, at: NOW, next: other }), NOW), null, JSON.stringify(other));
    }
  });
});

// ---------------------------------------------------------------------------
// 4. What each end of the trip takes
// ---------------------------------------------------------------------------

/** The address a page was opened at, as the page reads it. */
const addressOf = (search) => new URLSearchParams(search);

/** A tab's copy, and how often it was asked for. */
function tabHolding(value) {
  const tab = { asked: 0 };
  tab.copy = () => {
    tab.asked += 1;
    return value;
  };
  return tab;
}

describe("what the sign-in page takes as its return address when it opens", () => {
  const { returnOnArrival } = rules;

  test("the address it was opened with, and the tab is not asked", () => {
    for (const search of [
      `next=${encodeURIComponent(MARKED)}`,
      `from=google-redirect&next=${encodeURIComponent(MARKED)}`,
      `google_error=invalid-token&next=${encodeURIComponent(MARKED)}`,
    ]) {
      const tab = tabHolding("/somewhere/else");
      assert.equal(returnOnArrival(addressOf(search), tab.copy), MARKED, search);
      assert.equal(tab.asked, 0, `${search}: the tab's copy was read although the address had its own`);
    }
  });

  test("back from Google with no address of its own, the copy the tab kept", () => {
    const tab = tabHolding(MARKED);
    assert.equal(returnOnArrival(addressOf("from=google-redirect"), tab.copy), MARKED);
    assert.equal(tab.asked, 1);
  });

  test("back from a trip that failed, the same copy, so the next try still comes back", () => {
    for (const error of ["invalid-token", "csrf-cookie-missing", "csrf-mismatch", "bad-request", "missing-credential", "misconfigured"]) {
      assert.equal(returnOnArrival(addressOf(`google_error=${error}`), tabHolding(MARKED).copy), MARKED, error);
    }
  });

  test("a page somebody simply opened has no return address, whatever the tab is keeping", () => {
    for (const search of ["", "type=collaborator", "from=impersonation-exit", "from=subscriber", "from=", "google_error="]) {
      const tab = tabHolding(MARKED);
      assert.equal(returnOnArrival(addressOf(search), tab.copy), null, search);
      assert.equal(tab.asked, 0, `${search}: the tab's copy was read on a page nobody was sent back to`);
    }
  });

  test("an address that is not this site's is no address, on the page or in the tab", () => {
    const hostile = encodeURIComponent("/\\evil.example");
    // Opened with one: none. The tab is not consulted to make up for it.
    assert.equal(returnOnArrival(addressOf(`next=${hostile}`), tabHolding(MARKED).copy), null);
    assert.equal(returnOnArrival(addressOf("next=%2F%2Fevil.example"), tabHolding(MARKED).copy), null);
    // Sent back with one: the tab's copy, which is this site's own.
    assert.equal(returnOnArrival(addressOf(`from=google-redirect&next=${hostile}`), tabHolding(MARKED).copy), MARKED);
    // Sent back, and the tab's copy is the hostile one: none.
    for (const kept of ["//evil.example", "/\\evil.example", "https://evil.example", null, undefined, 42]) {
      assert.equal(returnOnArrival(addressOf("from=google-redirect"), tabHolding(kept).copy), null, String(kept));
    }
  });

  test("where a new account goes is still decided by the form's own rule, from whichever address came back", () => {
    // The address is restored here. What an account with no join request
    // does with it is `newAccountReturn`, and nothing in this module sends
    // anybody anywhere.
    const restored = returnOnArrival(addressOf("from=google-redirect"), tabHolding(MARKED).copy);
    assert.deepEqual(joinRules.newAccountReturn(restored), { to: "form", href: MARKED });
    const bare = returnOnArrival(addressOf("from=google-redirect"), tabHolding(FORM).copy);
    assert.deepEqual(joinRules.newAccountReturn(bare), { to: "ask", roundId: FORM.slice("/apply/".length), href: MARKED });
    assert.deepEqual(joinRules.newAccountReturn(returnOnArrival(addressOf("from=google-redirect"), tabHolding(null).copy)), { to: "register" });
    assert.deepEqual(joinRules.newAccountReturn(returnOnArrival(addressOf(""), tabHolding(MARKED).copy)), { to: "register" });
  });
});

describe("what the callback route puts back", () => {
  const { returnFromTrip } = rules;

  test("the state Google posted, before the cookie", () => {
    assert.equal(returnFromTrip({ state: MARKED, cookie: "/dashboard" }), MARKED);
    assert.equal(returnFromTrip({ state: MARKED, cookie: undefined }), MARKED);
  });

  test("the cookie, when no state came back", () => {
    assert.equal(returnFromTrip({ state: null, cookie: MARKED }), MARKED);
    assert.equal(returnFromTrip({ state: undefined, cookie: MARKED }), MARKED);
    assert.equal(returnFromTrip({ state: "", cookie: MARKED }), MARKED);
  });

  test("a copy that is not this site's is passed over for the one that is", () => {
    assert.equal(returnFromTrip({ state: "//evil.example", cookie: MARKED }), MARKED);
    assert.equal(returnFromTrip({ state: "/\\evil.example", cookie: MARKED }), MARKED);
    assert.equal(returnFromTrip({ state: MARKED, cookie: "//evil.example" }), MARKED);
    // A form field can be a file, and a file is not an address.
    assert.equal(returnFromTrip({ state: { name: "state.txt" }, cookie: MARKED }), MARKED);
  });

  test("nothing, when nothing that arrived is this site's", () => {
    for (const handed of [
      { state: null, cookie: undefined },
      { state: "//evil.example", cookie: "/\\evil.example" },
      { state: "https://evil.example", cookie: "" },
      { state: 42, cookie: [MARKED] },
    ]) {
      assert.equal(returnFromTrip(handed), null, JSON.stringify(handed));
    }
  });
});

/** A browser as `carryReturn` and `tabReturn` see one. */
function browserOf({ protocol = "https:", cookies = "work", storage = "works" } = {}) {
  const written = { cookies: [], tab: new Map() };
  const document = {};
  Object.defineProperty(document, "cookie", {
    set(text) {
      if (cookies === "refused") throw new Error("cookies are refused");
      written.cookies.push(text);
    },
  });
  const window = { location: { protocol } };
  Object.defineProperty(window, "sessionStorage", {
    get() {
      if (storage === "refused") throw new Error("The operation is insecure.");
      return {
        getItem: (key) => (written.tab.has(key) ? written.tab.get(key) : null),
        setItem: (key, value) => {
          if (storage === "full") throw new Error("QuotaExceededError");
          written.tab.set(key, String(value));
        },
      };
    },
  });
  return { window, document, written };
}

function inBrowser(browser, work) {
  globalThis.window = browser.window;
  globalThis.document = browser.document;
  try {
    return work();
  } finally {
    delete globalThis.window;
    delete globalThis.document;
  }
}

describe("leaving the address for the trip, and finding it again", () => {
  const { carryReturn, tabReturn, RETURN_COOKIE, RETURN_TAB_KEY } = rules;

  test("over https: the cookie that can make the trip, and the tab's copy", () => {
    const browser = browserOf({ protocol: "https:" });
    inBrowser(browser, () => carryReturn(MARKED));
    assert.equal(browser.written.cookies.length, 1);
    const cookie = readCookieText(browser.written.cookies[0]);
    assert.equal(cookie.name, RETURN_COOKIE);
    assert.equal(decodeURIComponent(cookie.value), MARKED);
    assert.equal(cookie.attributes.get("samesite"), "none");
    assert.equal(cookie.attributes.get("secure"), true);
    assert.deepEqual([...browser.written.tab.keys()], [RETURN_TAB_KEY]);
    assert.equal(inBrowser(browser, () => tabReturn()), MARKED);
  });

  test("over plain http: the cookie as it always was, and the tab's copy", () => {
    const browser = browserOf({ protocol: "http:" });
    inBrowser(browser, () => carryReturn(MARKED));
    const cookie = readCookieText(browser.written.cookies[0]);
    assert.equal(cookie.attributes.get("samesite"), "lax");
    assert.equal(cookie.attributes.has("secure"), false);
    assert.equal(inBrowser(browser, () => tabReturn()), MARKED);
  });

  test("an address that is not this site's is carried nowhere", () => {
    for (const other of ["//evil.example", "/\\evil.example", "https://evil.example", "", "/a\nb"]) {
      const browser = browserOf();
      inBrowser(browser, () => carryReturn(other));
      assert.deepEqual(browser.written.cookies, [], JSON.stringify(other));
      assert.equal(browser.written.tab.size, 0, JSON.stringify(other));
    }
  });

  test("a browser that refuses one copy still makes the other, and nothing throws", () => {
    const noCookies = browserOf({ cookies: "refused" });
    inBrowser(noCookies, () => carryReturn(MARKED));
    assert.equal(inBrowser(noCookies, () => tabReturn()), MARKED);

    for (const storage of ["refused", "full"]) {
      const noStorage = browserOf({ storage });
      inBrowser(noStorage, () => carryReturn(MARKED));
      assert.equal(noStorage.written.cookies.length, 1, storage);
      assert.equal(inBrowser(noStorage, () => tabReturn()), null, storage);
    }
  });

  test("on a server there is no browser: nothing is written and nothing is found", () => {
    assert.equal(typeof globalThis.window, "undefined");
    assert.doesNotThrow(() => carryReturn(MARKED));
    assert.equal(tabReturn(), null);
  });

  test("reading the tab's copy changes nothing", () => {
    const browser = browserOf();
    inBrowser(browser, () => carryReturn(MARKED));
    const before = browser.written.tab.get(RETURN_TAB_KEY);
    for (let i = 0; i < 3; i += 1) assert.equal(inBrowser(browser, () => tabReturn()), MARKED);
    assert.equal(browser.written.tab.get(RETURN_TAB_KEY), before);
    assert.equal(browser.written.cookies.length, 1);
  });
});

// ---------------------------------------------------------------------------
// 5. The callback route, run
// ---------------------------------------------------------------------------

/**
 * Google's POST as the route receives it. `cookies` is what the browser
 * sent, `fields` what the form carried. The request's own address is the
 * hosting's internal one, as it is in production.
 */
function googlePost({ cookies = {}, fields = {} } = {}) {
  const cookie = Object.entries(cookies)
    .map(([name, value]) => `${name}=${encodeURIComponent(value)}`)
    .join("; ");
  return new NextRequest("http://internal-revision.example:8080/api/auth/google/callback", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(cookie ? { cookie } : {}) },
    body: new URLSearchParams(fields).toString(),
  });
}

/** A POST Google would make after a sign-in that worked. */
const good = ({ cookies = {}, fields = {} } = {}) =>
  googlePost({
    cookies: { g_csrf_token: "the-same-token", ...cookies },
    fields: { credential: SIGNED, g_csrf_token: "the-same-token", select_by: "btn", ...fields },
  });

/** What the route answered: where it sends the browser, and every cookie it set. */
async function answer(request) {
  const response = await route.POST(request);
  const location = new URL(response.headers.get("location"));
  const set = new Map(response.headers.getSetCookie().map((text) => {
    const cookie = readCookieText(text);
    return [cookie.name, cookie];
  }));
  return { status: response.status, location, next: location.searchParams.get("next"), set };
}

describe("the callback route", () => {
  const { RETURN_COOKIE } = rules;

  test("with nothing carried: back to the sign-in page with no address, and the cookie it never saw is left alone", async () => {
    const got = await answer(good());
    assert.equal(got.status, 303);
    assert.equal(`${got.location.origin}${got.location.pathname}`, `${SITE}/login`);
    assert.equal(got.location.searchParams.get("from"), "google-redirect");
    assert.equal(got.next, null);
    assert.deepEqual([...got.location.searchParams.keys()], ["from"]);
    // The credential is handed on, and that is the only cookie touched.
    assert.deepEqual([...got.set.keys()], ["__google_credential"]);
    assert.equal(got.set.has(RETURN_COOKIE), false, "the route cleared a cookie the browser did not send");
  });

  test("the cookie arrived: its address is restored, and the cookie, having been read, is cleared", async () => {
    const got = await answer(good({ cookies: { [RETURN_COOKIE]: MARKED } }));
    assert.equal(got.status, 303);
    assert.equal(got.next, MARKED);
    assert.equal(got.location.searchParams.get("from"), "google-redirect");
    assert.deepEqual([...got.set.keys()].sort(), ["__auth_next", "__google_credential"]);
    const cleared = got.set.get(RETURN_COOKIE);
    assert.equal(cleared.value, "");
    assert.equal(cleared.attributes.get("max-age"), "0");
    assert.equal(cleared.attributes.get("path"), "/");
  });

  test("Google posted the state back: its address is restored, with no cookie at all", async () => {
    const got = await answer(good({ fields: { state: MARKED } }));
    assert.equal(got.next, MARKED);
    assert.equal(got.set.has(RETURN_COOKIE), false, "the route cleared a cookie the browser did not send");
  });

  test("both arrived and differ: the state made this trip, so it is the one restored", async () => {
    const got = await answer(good({ cookies: { [RETURN_COOKIE]: "/dashboard" }, fields: { state: MARKED } }));
    assert.equal(got.next, MARKED);
    assert.equal(got.set.get(RETURN_COOKIE)?.attributes.get("max-age"), "0");
  });

  test("an address that is not this site's is dropped, from the cookie and from the state", async () => {
    for (const hostile of ["//evil.example", "/\\evil.example", "https://evil.example/apply/x", "/\t/evil.example", "evil.example"]) {
      const fromCookie = await answer(good({ cookies: { [RETURN_COOKIE]: hostile } }));
      assert.equal(fromCookie.next, null, `cookie ${JSON.stringify(hostile)}`);
      assert.equal(fromCookie.location.origin, SITE);
      const fromState = await answer(good({ fields: { state: hostile } }));
      assert.equal(fromState.next, null, `state ${JSON.stringify(hostile)}`);
      // And a hostile one does not hide a good one.
      assert.equal((await answer(good({ cookies: { [RETURN_COOKIE]: MARKED }, fields: { state: hostile } }))).next, MARKED);
      assert.equal((await answer(good({ cookies: { [RETURN_COOKIE]: hostile }, fields: { state: MARKED } }))).next, MARKED);
    }
  });

  test("whatever is restored, the browser is sent to this site's own sign-in page and nowhere else", async () => {
    for (const carried of [MARKED, "/dashboard", "//evil.example", "/\\evil.example"]) {
      const got = await answer(good({ cookies: { [RETURN_COOKIE]: carried }, fields: { state: carried } }));
      // Built from the site's own address, never from the request's, which
      // on the hosting is an internal one.
      assert.equal(`${got.location.origin}${got.location.pathname}`, `${SITE}/login`, carried);
    }
  });

  test("the credential is handed on in a cookie only the sign-in page is sent, for a minute", async () => {
    const got = await answer(good({ fields: { state: MARKED } }));
    const handOff = got.set.get("__google_credential");
    assert.equal(handOff.value, SIGNED);
    assert.equal(handOff.attributes.get("path"), "/login");
    assert.equal(handOff.attributes.get("max-age"), "60");
    assert.equal(handOff.attributes.get("samesite"), "lax");
  });

  test("a POST that fails a check restores nothing and touches no cookie", async (t) => {
    // The route says why on the server's own log, with the error and its
    // stack. That line is expected here and is not printed.
    t.mock.method(console, "warn", () => {});
    t.mock.method(console, "error", () => {});
    const carried = { cookies: { [RETURN_COOKIE]: MARKED }, fields: { state: MARKED } };
    const cases = [
      ["no credential", googlePost({ cookies: { g_csrf_token: "t", ...carried.cookies }, fields: { g_csrf_token: "t", ...carried.fields } }), "missing-credential"],
      ["no token cookie", googlePost({ cookies: carried.cookies, fields: { credential: SIGNED, g_csrf_token: "t", ...carried.fields } }), "csrf-cookie-missing"],
      [
        "the two tokens differ",
        googlePost({ cookies: { g_csrf_token: "one", ...carried.cookies }, fields: { credential: SIGNED, g_csrf_token: "another", ...carried.fields } }),
        "csrf-mismatch",
      ],
      ["a credential Google did not sign", good({ ...carried, fields: { ...carried.fields, credential: "made-up" } }), "invalid-token"],
    ];
    for (const [what, request, error] of cases) {
      const got = await answer(request);
      assert.equal(got.status, 303, what);
      assert.equal(`${got.location.origin}${got.location.pathname}`, `${SITE}/login`, what);
      assert.deepEqual([...got.location.searchParams.entries()], [["google_error", error]], what);
      assert.equal(got.set.size, 0, `${what}: a cookie was set or cleared`);
    }
  });

  test("the credential is checked before anything is restored or handed on", async (t) => {
    t.mock.method(console, "warn", () => {});
    globalThis.__googleAsked = [];
    await answer(good({ cookies: { [RETURN_COOKIE]: MARKED }, fields: { state: MARKED } }));
    assert.deepEqual(globalThis.__googleAsked, [{ idToken: SIGNED, audience: CLIENT_ID, clientId: CLIENT_ID }]);
    // A credential that fails the check is never put in a cookie.
    const refused = await answer(good({ fields: { credential: "made-up", state: MARKED } }));
    assert.equal(refused.set.has("__google_credential"), false);
  });
});

// ---------------------------------------------------------------------------
// 6. The files that use the rules
// ---------------------------------------------------------------------------

const fileCode = (...parts) => stripSource(readFileSync(join(SRC, ...parts), "utf8"), { keepStrings: true });

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

describe("the sign-in page, Google's button and the route keep to the rules", () => {
  test("the sign-in page takes its return address from the one function, and guards it with the one guard", () => {
    // HELD BY READING THE FILE. The page is a component, and nothing here
    // can draw it. The functions it calls are run above.
    const entry = fileCode("app", "(auth)", "AuthEntry.tsx");
    assert.match(entry, /import \{ carryReturn, returnOnArrival, safeReturnPath, tabReturn \} from "@\/lib\/signInReturn";/);
    assert.match(entry, /const \[next\] = useState\(\(\) => returnOnArrival\(params, tabReturn\)\);/);
    assert.match(entry, /const safeNext = safeReturnPath\(next\) \?\? "\/dashboard";/);
    // It reads `next` off its address nowhere else, and tests an address no other way.
    assert.equal(/\.get\("next"\)/.test(entry), false, "the sign-in page reads `next` for itself again");
    assert.equal(/startsWith\("\/\/?"\)/.test(entry), false, "the sign-in page tests an address with a check of its own");
  });

  test("the sign-in page leaves its address for the trip once, when it has one", () => {
    const entry = fileCode("app", "(auth)", "AuthEntry.tsx");
    assert.match(entry, /useEffect\(\(\) => \{\s*if \(next\) carryReturn\(next\);\s*\}, \[next\]\);/);
    assert.equal((entry.match(/carryReturn\(/g) ?? []).length, 1);
    // The cookie is written by that function and by nothing on the page.
    assert.equal(/__auth_next/.test(entry), false, "the sign-in page spells the cookie's name");
    const writes = [...entry.matchAll(/document\.cookie\s*=(?!=)\s*("[^"]*"|`[^`]*`|[^;\n]+)/g)].map((match) => match[1]);
    assert.deepEqual(writes, ['"__google_credential=; path=/login; max-age=0"'], "the sign-in page writes a cookie of its own");
  });

  test("the sign-in page hands Google's button the same address", () => {
    const entry = fileCode("app", "(auth)", "AuthEntry.tsx");
    assert.match(
      entry,
      /<GoogleSignInButton\s+onCredential=\{onCredential\}\s+onScriptError=\{onGoogleScriptError\}\s+onReady=\{handleGisReady\}\s+returnTo=\{next\}\s+\/>/,
    );
  });

  test("Google's button sends the address only where it leaves for Google, and only through the guard", () => {
    // HELD BY READING THE FILE: the button waits on another site's script.
    const button = fileCode("components", "GoogleSignInButton.tsx");
    assert.match(button, /const state = useRedirect \? safeReturnPath\(returnToRef\.current\) : null;/);
    assert.match(button, /width,\s*\.\.\.\(state \? \{ state \} : \{\}\),\s*\}\);/);
    assert.equal((button.match(/\bstate\b/g) ?? []).length, 3, "the address is handed to Google somewhere else as well");
    assert.equal((button.match(/returnToRef\.current/g) ?? []).length, 2, "the address is read somewhere other than where it is kept and where it is sent");
    // The form's own button is given no address: it is drawn only in a
    // browser window, where the page never leaves.
    const account = fileCode("features", "applications", "apply", "JoinAccount.tsx");
    assert.match(account, /<GoogleSignInButton onCredential=\{onGoogle\} onScriptError=\{scriptProblem\} \/>/);
  });

  test("the route restores through the one function, and clears only what it was handed", () => {
    const code = fileCode("app", "api", "auth", "google", "callback", "route.ts");
    assert.match(code, /import \{ CAME_BACK_FROM_GOOGLE, RETURN_COOKIE, returnFromTrip \} from "@\/lib\/signInReturn";/);
    assert.match(code, /const carried = request\.cookies\.get\(RETURN_COOKIE\);/);
    assert.match(code, /const next = returnFromTrip\(\{ state, cookie: carried\?\.value \}\);\s*if \(next\) params\.next = next;/);
    assert.match(code, /if \(carried\) res\.cookies\.set\(RETURN_COOKIE, "", \{ path: "\/", maxAge: 0 \}\);/);
    assert.equal((code.match(/cookies\.set\(RETURN_COOKIE/g) ?? []).length, 1);
    assert.equal(/startsWith\(/.test(code), false, "the route tests an address with a check of its own");
    // Everything above comes after the credential has been checked.
    assert.ok(code.indexOf("verifyIdToken({") < code.indexOf("returnFromTrip("), "the address is restored before the credential is checked");
  });

  test("a document is loaded only at an address the guard passes", () => {
    const code = fileCode("lib", "navigation", "hardNavigate.ts");
    assert.match(code, /const safe = safeReturnPath\(dest\) \?\? "\/";/);
    assert.match(code, /if \(mode === "replace"\) window\.location\.replace\(safe\);\s*else window\.location\.assign\(safe\);/);
    assert.equal((code.match(/window\.location\./g) ?? []).length, 2);
  });
});

describe("every reader of a return address, and every document load, is one somebody decided", () => {
  const files = sourceFiles(SRC).map((file) => [relative(SRC, file).split(sep).join("/"), file]);
  const codeByFile = new Map(files.map(([name, file]) => [name, stripSource(readFileSync(file, "utf8"), { keepStrings: true })]));

  test("the tree was read", () => {
    assert.ok(files.length > 500, `only ${files.length} files under src: was the tree moved?`);
  });

  /**
   * Each file that reads a return address out of an address, a request or a
   * cookie, with the guard it passes it through. A new reader fails here
   * until it is written down with its guard, and its code has to call it.
   */
  const READERS = new Map([
    ["lib/signInReturn.ts", ["safeReturnPath(", "The rules themselves: `returnOnArrival` reads `next` off the sign-in page's address for the page."]],
    [
      "app/(auth)/register/page.tsx",
      ["safeFunnelReturn(", "The register page: where finishing a profile lands. Only an address on registration's own narrower list, from the address or the cookie."],
    ],
    ["app/api/register/route.ts", ["safeFunnelReturn(", "The register route: the return address the emailed link will carry. The same narrower list."]],
  ]);
  const READS = /\.get\(\s*"next"\s*\)|\bbody\.next\b|__auth_next/;

  test("each file that reads a return address is listed with its guard, and calls it", () => {
    const found = [...codeByFile]
      .filter(([name, code]) => !name.startsWith("content/legal/") && READS.test(code))
      .map(([name]) => name)
      .sort();
    assert.deepEqual(
      found,
      [...READERS.keys()].sort(),
      "the files that read a return address are not the ones written down. A new reader passes the address through " +
        "`safeReturnPath` (or `returnOnArrival`), or through registration's narrower `safeFunnelReturn`, and is listed here with which.",
    );
    for (const [name, [guard, why]] of READERS) {
      assert.ok(codeByFile.get(name).includes(guard), `${name} is written down as using ${guard}) and does not call it`);
      assert.ok(typeof why === "string" && why.length > 40, `${name} has no reason beside it`);
    }
    // The privacy page names the cookie in its list, in every version it
    // keeps. That is words, not a reader, and is why those files are left out.
    assert.ok([...codeByFile.keys()].some((name) => name.startsWith("content/legal/privacy/")));
  });

  /**
   * A document load: the window's own address assigned to. Unlike a move
   * inside the site, it goes wherever the string says, another site
   * included. So an address that is not written out in the file is loaded
   * through `hardNavigate`, which asks the guard, or is listed here.
   */
  const LOADS = /\b(?:window|document|top|self|globalThis)\.location(?:\.href)?\s*=(?!=)|\blocation\.(?:assign|replace)\s*\(/g;
  const LOADS_ELSEWHERE = new Map([
    [
      "lib/campaign/forwardingDocument.ts",
      "Not this app's own code: the text of a small page the short-link route answers with, whose destination was parsed and held to its rules before the page was written.",
    ],
  ]);

  test("a document is loaded at a computed address only by the one function", () => {
    const computed = [];
    for (const [name, code] of codeByFile) {
      if (name === "lib/navigation/hardNavigate.ts") continue;
      for (const match of code.matchAll(LOADS)) {
        const after = code.slice(match.index + match[0].length).trimStart();
        // An address written out in the file is a string with nothing computed into it.
        if (/^"[^"$]*"|^'[^'$]*'/.test(after)) continue;
        computed.push(name);
      }
    }
    assert.deepEqual(
      [...new Set(computed)].sort(),
      [...LOADS_ELSEWHERE.keys()].sort(),
      "a document is loaded at an address that is not written in the file. Use `hardNavigate` (src/lib/navigation/hardNavigate.ts), " +
        "which loads only a path on this site, or list the file here with why its address is safe.",
    );
    for (const [name, why] of LOADS_ELSEWHERE) {
      assert.ok(typeof why === "string" && why.length > 40, `${name} has no reason beside it`);
    }
    // The reader finds a load where one is known to be, and tells a written address from a computed one.
    const sample = 'window.location.href = "/dashboard"; window.location.assign(dest); location.replace(`/a/${b}`); const location = place();';
    assert.deepEqual([...sample.matchAll(LOADS)].map((m) => m[0]), ["window.location.href =", "location.assign(", "location.replace("]);
  });
});
