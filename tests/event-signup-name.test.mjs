/**
 * A SIGNED-IN SIGN-UP SHOWS THE NAME IT STORES.
 *
 * The event sign-up form filled a signed-in person's name box from the
 * Firebase Auth display name, which is empty for anybody who made their
 * account with an email address and a password, and drew it read-only with no
 * read-only look, so it read as a blank form. The route stored the name off
 * the person's own `users` document instead, where a stored empty display name
 * did not fall through to the preferred name, so the organiser read a
 * different name from the one the person was shown.
 *
 * Now one rule decides, `accountNameOf` in `src/lib/firestore/users.ts`: the
 * preferred name when it has text, else the stored display name when it has
 * text, else nothing and the address stands in. The server applies it in
 * `getCurrentUser`, the browser in `AuthProvider`, and the form draws no boxes
 * for a signed-in person at all. This suite holds the three together:
 *
 * THE NAME PEOPLE GO BY COMES FIRST (the full names change, 1 November
 * 2026). The display name of an account made with Google is Google's name
 * for them, often their whole name, and the privacy policy says only the
 * committee sees a full name. So the name a sign-up stores, which its
 * organisers and the confirmation email use, is the name the person goes by.
 * The committee's screens look the full name up themselves
 * (tests/full-name-readers.test.mjs lists them).
 *
 *  1. THE RULE, as a table.
 *  2. THE ROUTE, executed with the REAL session reader over a fake Firestore,
 *     for a Google account, an email-and-password account and an account
 *     whose stored display name is an empty string: the row stores the rule's
 *     name, and the confirmation greets them by it.
 *  3. THE FORM, rendered: no name or email boxes when signed in, the note
 *     saying the rule's name and the address once, and the guest's boxes as
 *     they were (uncontrolled, so typing before the JavaScript lands is kept,
 *     which `tests/e2e/events-rsvp.spec.mjs` drives in a browser).
 *  4. THE PROVIDER, read: it gives the form the rule's answer off the user's
 *     own document, never the Firebase Auth name.
 */
import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { createLoader } from "./lib/tsLoader.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
/** A file's code: comments gone, strings kept, since the pins below quote some. */
const code = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

/** Every stylesheet a module under `src` imports, as its own class names. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
function stylesheets() {
  const found = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        for (const [, specifier] of readFileSync(full, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) {
          found.add(specifier);
        }
      }
    }
  };
  walk(SRC);
  return [...found];
}

const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    [
      "next/server",
      "export const NextResponse = { json(body, init) { return { status: (init && init.status) || 200, body }; } };",
    ],
    // The session cookie, read by the REAL `getCurrentUser`.
    [
      "next/headers",
      "export async function cookies() {\n" +
        "  return {\n" +
        "    get: (name) => (name === '__session' && globalThis.__cookie ? { value: globalThis.__cookie } : undefined),\n" +
        "    set() {},\n" +
        "    delete() {},\n" +
        "  };\n" +
        "}",
    ],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    // Both spellings: the route asks for the alias, the session reader for its
    // sibling.
    [
      "@/lib/firebase/admin",
      "export const getAdminDb = () => globalThis.__db ?? null;\n" +
        "export const getAdminAuth = () => globalThis.__adminAuth ?? null;",
    ],
    [
      "./admin",
      "export const getAdminDb = () => globalThis.__db ?? null;\n" +
        "export const getAdminAuth = () => globalThis.__adminAuth ?? null;",
    ],
    // The bot gate and the throttle, open: tests/event-rsvp-identity.test.mjs
    // says why, and tests/public-write-gating.test.mjs proves both.
    ["@/lib/recaptcha/server", "export const verifyRecaptcha = async () => true;"],
    ["@/lib/recaptcha/bypass", "export const recaptchaBypassGranted = () => false;"],
    [
      "@/lib/rateLimit",
      "export const clientIp = () => '203.0.113.1';\n" +
        "export const rateLimit = () => ({ ok: true, retryAfterSeconds: 0 });",
    ],
    [
      "@/lib/events/sendRsvpEmail",
      "export const sendRsvpEmail = async (args) => { (globalThis.__rsvpMail ||= []).push(args); };",
    ],
    // The form's world: who is signed in, and the browser hooks a render
    // cannot run.
    ["@/auth/AuthProvider", "export function useAuth() { return globalThis.__formAuth; }"],
    ["@/hooks/useHydrated", "export function useHydrated() { return true; }"],
    [
      "@/features/maintenance/useSiteNotice",
      "export function useSiteNotice() { return { paused: { eventSignups: false }, bannerMessage: '' }; }",
    ],
    [
      "next/navigation",
      "export function useRouter() { return { push() {}, replace() {}, refresh() {}, back() {} }; }",
    ],
    ["next/link", "export default function Link() { return null; }"],
    ...stylesheets().map((specifier) => [specifier, CLASS_NAMES]),
  ]),
});

const { accountNameOf } = await loadTs("lib/firestore/users.ts");
const rsvpRoute = await loadTs("app/api/events/[id]/rsvp/route.ts");
const { default: RsvpForm } = await loadTs("features/events/RsvpForm.tsx");

// ===========================================================================
// 1. The rule
// ===========================================================================

describe("the one name rule", () => {
  test("the preferred name, else the stored display name, else nothing", () => {
    const cases = [
      ["a Google account", { displayName: "Priya Shah", profile: { preferredName: "Priya" } }, "Priya"],
      ["a Google account that goes by another name", { displayName: "Priya Shah", profile: { preferredName: "Pri" } }, "Pri"],
      ["a Google account with no preferred name", { displayName: "Priya Shah", profile: { preferredName: "" } }, "Priya Shah"],
      ["a preferred name of spaces beside a display name", { displayName: "Priya Shah", profile: { preferredName: "  " } }, "Priya Shah"],
      ["a preferred name that is not text", { displayName: "Priya Shah", profile: { preferredName: 7 } }, "Priya Shah"],
      // The full name is never the name somebody goes by, whoever reads it.
      ["a full name beside the name they go by", { displayName: null, profile: { fullName: "Priya Shah", preferredName: "Pri" } }, "Pri"],
      ["a full name and nothing else", { displayName: null, profile: { fullName: "Priya Shah" } }, null],
      ["an email-and-password account", { displayName: null, profile: { preferredName: "Priya Shah" } }, "Priya Shah"],
      ["no display name stored at all", { profile: { preferredName: "Priya Shah" } }, "Priya Shah"],
      ["a stored empty display name", { displayName: "", profile: { preferredName: "Priya Shah" } }, "Priya Shah"],
      ["a display name of spaces", { displayName: "   ", profile: { preferredName: "Priya Shah" } }, "Priya Shah"],
      ["names with spaces round them", { displayName: "  Priya Shah  " }, "Priya Shah"],
      ["a preferred name of spaces", { displayName: "", profile: { preferredName: "  " } }, null],
      ["no profile", { displayName: "" }, null],
      ["a display name that is not text", { displayName: 42, profile: { preferredName: "Priya Shah" } }, "Priya Shah"],
      ["a profile that is not a map", { displayName: null, profile: "Priya" }, null],
      ["no document", null, null],
      ["not a document", "Priya Shah", null],
    ];
    for (const [label, data, expected] of cases) {
      assert.equal(accountNameOf(data), expected, label);
    }
  });
});

// ===========================================================================
// 2. The route, through the real session reader
// ===========================================================================

const ADDRESS = "priya@e2e.invalid";
const ctx = { params: Promise.resolve({ id: "event-1" }) };
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));

/** The account shapes the sign-up has to name, as their `users` documents. */
const ACCOUNTS = {
  "an account made with Google": {
    email: ADDRESS,
    displayName: "Priya Shah",
    role: "member",
    profile: { preferredName: "Priya" },
  },
  "an account made with an email address and a password": {
    email: ADDRESS,
    displayName: null,
    role: "member",
    profile: { preferredName: "Priya Shah" },
  },
  "an account whose stored display name is an empty string": {
    email: ADDRESS,
    displayName: "",
    role: "member",
    profile: { preferredName: "Priya Shah" },
  },
  "an account with no name at all": {
    email: ADDRESS,
    displayName: "",
    role: "member",
    profile: { preferredName: "  " },
  },
};

/** Signs `doc` in through the session cookie and seeds a published event. */
function signIn(doc) {
  globalThis.__db = makeDb({
    "events/event-1": {
      title: "Reading group",
      status: "published",
      visibility: "members",
      location: "B52",
      signupForm: [],
      rsvpCountPending: 0,
    },
    "users/uid-priya": doc,
  });
  globalThis.__cookie = "cookie-priya";
  globalThis.__adminAuth = {
    verifySessionCookie: async (value) => {
      if (value !== "cookie-priya") throw Object.assign(new Error("no"), { code: "auth/session-cookie-revoked" });
      return { uid: "uid-priya", email: ADDRESS };
    },
  };
}

const storedRows = () =>
  globalThis.__db
    .paths()
    .filter((path) => path.startsWith("eventRsvps/"))
    .map((path) => globalThis.__db.read(path));

/** Submits as whoever is signed in, with a body naming somebody else entirely. */
async function signUp() {
  const res = await rsvpRoute.POST(
    {
      json: async () => ({ name: "Somebody Else", email: "else@e2e.invalid", answers: {} }),
      headers: new Headers(),
    },
    ctx,
  );
  await settle();
  return res;
}

beforeEach(() => {
  globalThis.__rsvpMail = [];
  globalThis.__cookie = null;
  globalThis.__adminAuth = null;
});

describe("the route stores the rule's name for a signed-in sign-up", () => {
  for (const [label, doc] of Object.entries(ACCOUNTS)) {
    test(label, async () => {
      signIn(doc);
      const res = await signUp();
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const [row] = storedRows();
      const expected = accountNameOf(doc) ?? ADDRESS;
      assert.equal(row.name, expected, "the organiser's list reads a different name from the rule's");
      assert.equal(row.email, ADDRESS, "the session's address, not the body's");
      assert.equal(row.uid, "uid-priya");
      assert.equal(globalThis.__rsvpMail[0].recipientName, expected, "the confirmation greets them by another name");
    });
  }

  test("each shape stores what the form shows it (the stored names, spelled out)", async () => {
    const stored = {};
    for (const [label, doc] of Object.entries(ACCOUNTS)) {
      signIn(doc);
      await signUp();
      stored[label] = storedRows()[0].name;
    }
    assert.deepEqual(stored, {
      // The name the person goes by, not Google's name for them, which until
      // 1 November 2026 was the one stored here.
      "an account made with Google": "Priya",
      "an account made with an email address and a password": "Priya Shah",
      // Before the rule, a stored "" did not fall through, and the row was
      // named by the address.
      "an account whose stored display name is an empty string": "Priya Shah",
      "an account with no name at all": ADDRESS,
    });
  });
});

// ===========================================================================
// 3. The form
// ===========================================================================

const FORM_PROPS = {
  eventId: "event-1",
  signupForm: [],
  visibility: "members",
  capacity: null,
  rsvpCountConfirmed: 0,
  waitlistEnabled: false,
};

function textOf(html) {
  return html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([.,)])/g, "$1")
    .replace(/\( /g, "(")
    .trim();
}

/** The form as `auth` sees it: `{ user, accountName }`, or null for nobody. */
function renderForm(auth, props = {}) {
  globalThis.__formAuth = {
    user: auth?.user ?? null,
    accountName: auth?.accountName ?? null,
    loading: false,
  };
  const html = renderToStaticMarkup(createElement(RsvpForm, { ...FORM_PROPS, ...props }));
  return { html, text: textOf(html) };
}

/** A Firebase Auth user. `displayName` is the Auth name the form must not read. */
const authUser = (displayName = null) => ({ uid: "uid-priya", email: ADDRESS, displayName });

describe("the form, signed in, draws no boxes and says who is signing up", () => {
  test("with a name: the name, then the address once", () => {
    const { html, text } = renderForm({ user: authUser(), accountName: "Priya Shah" });
    assert.doesNotMatch(html, /id="rsvp-name"/);
    assert.doesNotMatch(html, /id="rsvp-email"/);
    assert.match(html, /<strong>Priya Shah<\/strong>/);
    assert.match(
      text,
      /Signing up as Priya Shah \(priya@e2e\.invalid\)\. Sign out to RSVP with a different account\./,
    );
  });

  test("with no name: the address, once, as the name", () => {
    const { html, text } = renderForm({ user: authUser(), accountName: null });
    assert.doesNotMatch(html, /id="rsvp-name"|id="rsvp-email"/);
    assert.match(html, /<strong>priya@e2e\.invalid<\/strong>/);
    assert.match(text, /Signing up as priya@e2e\.invalid\. Sign out to RSVP with a different account\./);
    assert.equal(text.split(ADDRESS).length - 1, 1, "the address is shown twice");
  });

  test("never the Firebase Auth name, which an email-and-password account does not have", () => {
    const named = renderForm({ user: authUser("Google Name"), accountName: "Priya Shah" });
    assert.match(named.text, /Signing up as Priya Shah \(/);
    assert.doesNotMatch(named.html, /Google Name/);
    const unnamed = renderForm({ user: authUser("Google Name"), accountName: null });
    assert.doesNotMatch(unnamed.html, /Google Name/);
  });

  test("the form shows each account the name the route stores for it", async () => {
    for (const [label, doc] of Object.entries(ACCOUNTS)) {
      signIn(doc);
      await signUp();
      const stored = storedRows()[0].name;
      // `accountNameOf` on the user's own document is what AuthProvider hands
      // the form (section 4 holds the provider to that).
      const { html } = renderForm({ user: authUser(), accountName: accountNameOf(doc) });
      const shown = /<strong>([^<]*)<\/strong>/.exec(html)?.[1];
      assert.equal(shown, stored, `${label}: the form says ${shown}, the organiser reads ${stored}`);
    }
  });
});

describe("the form, signed out, keeps the guest's boxes as they were", () => {
  test("both boxes, uncontrolled, editable and required, and no note", () => {
    const { html, text } = renderForm(null, { visibility: "public" });
    for (const id of ["rsvp-name", "rsvp-email"]) {
      const box = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html)?.[0];
      assert.ok(box, `the ${id} box is gone for a guest`);
      // Uncontrolled: React writes no value, so a guest typing before the
      // JavaScript lands keeps every character.
      assert.doesNotMatch(box, /\svalue=/, `the ${id} box is controlled`);
      assert.doesNotMatch(box, /readonly/i, `the ${id} box is read-only for a guest`);
      assert.match(box, /required/);
    }
    assert.doesNotMatch(text, /Signing up as/);
  });

  test("the guest's one name box asks for a first and last name, under its old id", () => {
    const { html } = renderForm(null, { visibility: "public" });
    // The people at the door tell two guests called Sam apart by the second
    // name. One box, so the stored name stays one string, and `#rsvp-name`
    // is what tests/e2e/events-rsvp.spec.mjs fills.
    assert.match(html, /<label[^>]*for="rsvp-name"[^>]*>Your first and last name<\/label>/);
    assert.equal((html.match(/<input[^>]*id="rsvp-name"/g) ?? []).length, 1);
    assert.match(/<input[^>]*id="rsvp-name"[^>]*>/.exec(html)?.[0] ?? "", /autoComplete="name"|autocomplete="name"/);
  });

  test("a session with no address keeps the boxes, so the form is never bricked", () => {
    const { html } = renderForm({ user: { uid: "uid-x", email: null, displayName: null }, accountName: "X" });
    assert.match(html, /id="rsvp-name"/);
    assert.match(html, /id="rsvp-email"/);
  });
});

// ===========================================================================
// 4. The provider and the session reader, read
// ===========================================================================

describe("both sides ask the same rule", () => {
  test("AuthProvider gives the form the rule's answer off the user's own document", () => {
    const provider = code("auth/AuthProvider.tsx");
    assert.match(provider, /import \{ accountNameOf, type UserPermissions \} from "@\/lib\/firestore\/users";/);
    // From the snapshot of `users/{uid}`, beside the role it already reads.
    assert.match(provider, /const data = snap\.exists\(\) \? snap\.data\(\) : null;\s*setAccountName\(accountNameOf\(data\)\);/);
    // Cleared when the read fails and when nobody is signed in.
    assert.equal(provider.match(/setAccountName\(null\)/g)?.length, 2);
    // And handed to every page.
    assert.match(provider, /accountName,\s*role,/);
  });

  test("getCurrentUser names the session by the same rule", () => {
    assert.match(code("lib/firebase/session.ts"), /displayName: accountNameOf\(data\) \?\? undefined,/);
  });

  test("the form reads the account's name, never the Firebase Auth one", () => {
    const form = code("features/events/RsvpForm.tsx");
    assert.match(form, /const \{ user, accountName, loading: authLoading \} = useAuth\(\);/);
    assert.doesNotMatch(form, /\.displayName/);
  });
});
