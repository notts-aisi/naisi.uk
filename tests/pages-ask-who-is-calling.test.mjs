/**
 * A SERVER PAGE THAT READS ANYTHING ASKS WHO IS CALLING ITSELF.
 *
 * WHY. Next's authentication guide ("Layouts and auth checks",
 * `node_modules/next/dist/docs/01-app/02-guides/authentication.md`) says a
 * layout is not rendered again on every navigation, and that a layout does
 * not decide whether the segments below it render: the router renders them.
 * So the check belongs beside the data. The rule this file holds: a server
 * component page or layout under `src/app` whose render can read with the
 * Admin SDK calls a gate from `GATES` in the same file, before its first
 * read, and reads nothing for somebody the gate refuses. The trees under
 * `src/app/(app)/admin` still gate in their layouts
 * (`tests/no-admin-gating.test.mjs`); each page in them that reads also asks
 * for itself, with its tree's own gate.
 *
 * WHAT IT CHECKS, for every `page.tsx` and `layout.tsx` under `src/app`
 * outside `src/app/api`:
 *
 *  1. WHETHER IT READS. A file that opens with `"use client"` reads through
 *     the Firestore rules and is out of scope. For the rest, its imports are
 *     followed by value (tests/lib/clientGraph.mjs, the walk the boundary
 *     guard uses) through every module that is not `"use client"`, and it
 *     reads when the walk reaches `src/lib/firebase/admin.ts` or the
 *     `firebase-admin` package. `session.ts` and `pageGates.ts` are not
 *     walked into: reaching only the session is asking, not reading. An
 *     import the walk cannot resolve fails.
 *  2. THE ORDER. In the component (the default export) and in
 *     `generateMetadata` if there is one, calls are read in order, the
 *     helpers the file defines folded in where they are called. The first
 *     call to a gate in `GATES` has to come before the first Firestore method
 *     (`.collection`, `.doc`, ...) and before the first call to any other
 *     function imported from this repository, except those in `PURE`, each
 *     with the reason it reads nothing. A gate awaited in one `Promise.all`
 *     with a read does not count as first: the read starts before the gate
 *     answers. Awaiting `params` and `searchParams` is not a read.
 *  3. THE TREE'S OWN GATE. A page in one of the admin trees calls that
 *     tree's gate (`TREE_GATES`), so it asks the same question its layout
 *     asks rather than only whether somebody is signed in.
 *  4. THE OPEN PAGES ARE WRITTEN DOWN. A page that reads with no gate first
 *     is in `OPEN`, with the reason. Both directions: an entry for a file
 *     that is gone, that no longer reads, or that now passes the rule above
 *     fails as stale. A directory entry covers the pages under it that read
 *     with no gate, and is stale when none is left.
 *  5. THE GATES ARE WHAT THEY SAY. Each entry in `GATES` is found in its
 *     module and its own body is checked for the proof it claims (it
 *     verifies the session cookie, or calls a gate that does). Each entry in
 *     `PURE` is checked to touch no Firestore method.
 *
 * The scanner's own reading is exercised on synthetic components at the
 * bottom of this file, so a pattern that quietly stopped matching fails
 * rather than passes.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";
import { balancedEnd, functionSpan, moduleScope } from "./lib/routeScan.mjs";
import { isClientModule, walkEachFrom } from "./lib/clientGraph.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(REPO_ROOT, "src");
const APP_DIR = join(SRC_DIR, "app");
const API_DIR = join(APP_DIR, "api");
const ADMIN_MODULE = join(SRC_DIR, "lib", "firebase", "admin.ts");

/** Modules a page may reach without that counting as a read: they ask who is calling. */
const ASKING_MODULES = [
  join(SRC_DIR, "lib", "firebase", "session.ts"),
  join(SRC_DIR, "lib", "firebase", "pageGates.ts"),
];

// ---------------------------------------------------------------------------
// The registries
// ---------------------------------------------------------------------------

/**
 * A function whose call establishes who is calling. `from` is the module it is
 * defined in; `proof` is what its own body must contain, checked below.
 */
const GATES = {
  getCurrentUser: {
    from: "@/lib/firebase/session",
    proves: "a verified session cookie, with the live role and permissions read off the user's document; null for no session",
    proof: /verifySessionCookie\(/,
    why: "every other session gate is built on it",
  },
  getSessionUid: {
    from: "@/lib/firebase/session",
    proves: "a verified session cookie, uid and address only",
    proof: /verifySessionCookie\(/,
    why: "for a page that runs before a users document exists",
  },
  getCurrentCollaborator: {
    from: "@/lib/firebase/session",
    proves: "a verified session cookie resolved to its collaborator record; null for anybody else",
    proof: /verifySessionCookie\(|getSessionUid\(/,
    why: "the collaborator area is its own audience, not a member's",
  },
  getSessionUser: {
    from: "@/features/courses/runAccess",
    proves: "getCurrentUser, memoised for the request",
    proof: /cache\(getCurrentUser\)/,
    why: "the course pages ask once and read the answer in several places",
  },
  getRunAccess: {
    from: "@/features/courses/runAccess",
    proves: "the session, then the caller's own place on the run: their enrolment addressed by run and uid; null for no session",
    proof: /getSessionUser\(\)/,
    why: "the session is asked before the run is read, and the place is the caller's own",
  },
  openGuidePage: {
    from: "@/features/courses/guide/pageGate",
    proves: "getRunAccess, then the guide's own door, redirecting everybody it refuses",
    proof: /getRunAccess\(/,
    why: "the run's guide pages share one door",
  },
  surveyAdmin: {
    from: "@/lib/aiSurvey/adminStore",
    proves: "the session, then whether the AI at Nottingham survey's admin side is the caller's",
    proof: /getCurrentUser\(\)/,
    why: "that survey's admin pages answer to their own list of admins",
  },
  requireAdminPage: {
    from: "@/lib/firebase/pageGates",
    proves: "a full admin; everybody else is redirected",
    proof: /getCurrentUser\(\)[\s\S]*redirect\(/,
    why: "the (admin-only) tree's gate",
  },
  requireCourseAuthorPage: {
    from: "@/lib/firebase/pageGates",
    proves: "an admin or a holder of draftCourse or approveCourse; everybody else is redirected",
    proof: /getCurrentUser\(\)[\s\S]*redirect\(/,
    why: "the course authoring tree's gate",
  },
  requireAdmissionsPage: {
    from: "@/lib/firebase/pageGates",
    proves: "an author of admission rounds or an appointed reviewer; everybody else is redirected",
    proof: /getCurrentUser\(\)[\s\S]*redirect\(/,
    why: "the admissions tree's gate",
  },
  requireMembershipPage: {
    from: "@/lib/firebase/pageGates",
    proves: "an admin or a holder of manageMembership; everybody else is redirected",
    proof: /getCurrentUser\(\)[\s\S]*redirect\(/,
    why: "the membership tree's gate",
  },
  requireEventsPage: {
    from: "@/lib/firebase/pageGates",
    proves: "an admin, a committee member, or a holder of draftEvent or approveEvent; everybody else is redirected",
    proof: /getCurrentUser\(\)[\s\S]*redirect\(/,
    why: "the events area's gate, which its layout calls too",
  },
};

/**
 * Functions imported from this repository that a component may call before
 * its gate, each with the reason it reads nothing. The claim is checked: the
 * function's own body must contain no Firestore method.
 */
const PURE = {
  getAdminDb: {
    from: "@/lib/firebase/admin",
    why: "obtains the Firestore handle; nothing is read until a method is called on it",
  },
  isAddressableId: {
    from: "@/lib/addressableId",
    why: "a string test on a path segment",
  },
};

/**
 * Each admin tree's own gate: a page in the tree that reads calls one of
 * these. `refusal` is the one other form accepted, a session read whose very
 * next statement redirects everybody the tree's gate would.
 */
const TREE_GATES = [
  {
    dir: "src/app/(app)/admin/(admin-only)/",
    gates: ["requireAdminPage"],
    refusal: /await\s+getCurrentUser\(\);\s*if\s*\(\s*!(\w+)\s*\|\|\s*(?:!canRunSurveys\(\1\)|\1\.role\s*!==\s*"")\s*\)\s*redirect\(/,
    why: "full admins only",
  },
  {
    dir: "src/app/(app)/admin/courses/",
    gates: ["requireCourseAuthorPage", "requireAdminPage"],
    why: "course authors; a page for full admins only may ask the narrower gate",
  },
  {
    dir: "src/app/(app)/admin/admissions/",
    gates: ["requireAdmissionsPage"],
    why: "round authors and appointed reviewers",
  },
  {
    dir: "src/app/(app)/admin/membership/",
    gates: ["requireMembershipPage"],
    why: "admins and manageMembership holders",
  },
];

/**
 * Pages and layouts that read with no gate first, ON PURPOSE. A key ending in
 * `/` is a directory and covers every page under it that reads with no gate.
 */
const OPEN = new Map([
  [
    "src/app/(public)/",
    "The public site: the landing page, events, courses, news, sources, the members directory and the " +
      "application pages. What each reads is published, or is the caller's own once a session is " +
      "asked for, and the fetchers in src/features project what a stranger may be shown.",
  ],
  [
    "src/app/survey/[token]/page.tsx",
    "A survey answered from the personal link in an email, which has no session to send: the random " +
      "secret in the address is the gate, and an unknown one reads nothing more (openLink).",
  ],
  [
    "src/app/feedback/[token]/page.tsx",
    "A programme's anonymous form, which reads no session by design: the random secret in the " +
      "programme's link is the gate (formScreenFor), and the form names nobody.",
  ],
  [
    "src/app/verify-email/[tokenId]/page.tsx",
    "The landing page of an emailed verification link: the signed token in the address is the gate, " +
      "checked before the record it names is read; the session is asked only to say where to go next.",
  ],
  [
    "src/app/links/page.tsx",
    "The public page most printed codes land on: upcoming published events and the page's own " +
      "content, which the fetcher projects (hidden rows and the editor's uid never leave the server).",
  ],
  [
    "src/app/ai-survey/page.tsx",
    "The anonymous AI at Nottingham survey, which reads no session by design: it asks only whether " +
      "the survey is closed. Its admin pages ask surveyAdmin().",
  ],
  [
    "src/app/events/[id]/calendar/page.tsx",
    "Where an event's calendar code lands: getEventForViewer returns an event only to somebody it is " +
      "for, and anybody else is told it is not listed.",
  ],
  [
    "src/app/events/[id]/check-in/page.tsx",
    "Where an event's door code lands, signed in or not: it reads the event's public facts first, as " +
      "the event's own page does, then the session; who may check in is decided by decideSelf and asked " +
      "again by the route behind the button.",
  ],
  [
    "src/app/(app)/anonymous-feedback/page.tsx",
    "The programmes' anonymous form, which reads nothing about its reader on purpose, so that nothing " +
      "it hands the browser can tie an answer to a person: it hands over only this term's programmes, " +
      "each one's round and programme ids, its name and how many weeks it runs. The (app) layout above " +
      "it asks for the session; the route behind the form does not.",
  ],
]);

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

const DATA_METHODS = new Set([
  "collection",
  "collectionGroup",
  "doc",
  "runTransaction",
  "batch",
  "getAll",
  "bulkWriter",
]);
const CALL = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
const METHOD_CALL = /\.([A-Za-z_$][\w$]*)\s*\(/g;
const PROMISE_ALL = /\bPromise\s*\.\s*all\s*\(/g;

const toRepo = (file) => relative(REPO_ROOT, file).split(sep).join("/");
const isRepositoryModule = (specifier) => specifier.startsWith("@/") || specifier.startsWith(".");

/**
 * The first gate and the first read in a body, read in call order, the
 * file's own helpers folded in at the offset of the call to them.
 *
 * Returns `{ gate, read }`, each `{ at, name }` or null. A read is a
 * Firestore method, or a call to a repository import that is neither a gate
 * nor in PURE. A gate inside a `Promise.all` that also starts a read is not
 * taken as the gate: the read inside it is.
 */
export function readComponent(body, scope, seen = new Set()) {
  const events = [];
  let match;
  CALL.lastIndex = 0;
  while ((match = CALL.exec(body)) !== null) events.push({ at: match.index, name: match[1], method: false });
  METHOD_CALL.lastIndex = 0;
  while ((match = METHOD_CALL.exec(body)) !== null) events.push({ at: match.index, name: match[1], method: true });
  events.sort((a, b) => a.at - b.at);

  // The spans of every Promise.all's argument list, for the concurrency rule.
  const alls = [];
  PROMISE_ALL.lastIndex = 0;
  while ((match = PROMISE_ALL.exec(body)) !== null) {
    const open = match.index + match[0].length - 1;
    alls.push({ start: open, end: balancedEnd(body, open) });
  }
  const allAround = (at) => alls.find((span) => span.start < at && at < span.end) ?? null;

  const classified = [];
  const fold = (at, inner, length) => at + inner.at / (length + 1);
  for (const event of events) {
    if (event.method) {
      if (DATA_METHODS.has(event.name)) classified.push({ at: event.at, kind: "read", name: `.${event.name}(` });
      continue;
    }
    if (event.name in GATES && scope.imports.has(event.name)) {
      classified.push({ at: event.at, kind: "gate", name: event.name });
      continue;
    }
    if (scope.locals.has(event.name) && !seen.has(event.name)) {
      const span = scope.locals.get(event.name);
      const inner = readComponent(span.text, scope, new Set([...seen, event.name]));
      for (const kind of ["gate", "read"]) {
        if (inner[kind]) {
          classified.push({
            at: fold(event.at, inner[kind], span.text.length),
            kind,
            name: `${event.name} -> ${inner[kind].name}`,
            outer: event.at,
          });
        }
      }
      continue;
    }
    const specifier = scope.imports.get(event.name);
    if (!specifier || !isRepositoryModule(specifier)) continue;
    if (event.name in PURE) continue;
    classified.push({ at: event.at, kind: "read", name: `${event.name} (${specifier})` });
  }
  classified.sort((a, b) => a.at - b.at);

  let gate = null;
  let read = null;
  for (const event of classified) {
    if (event.kind === "read") {
      if (!read) read = event;
      continue;
    }
    if (gate) continue;
    const span = allAround(event.outer ?? event.at);
    const alongside = span
      ? classified.find((other) => other.kind === "read" && span.start < other.at && other.at < span.end)
      : null;
    if (alongside) {
      if (!read || alongside.at < read.at) read = { ...alongside, name: `${alongside.name}, in one Promise.all with ${event.name}` };
      continue;
    }
    gate = event;
  }
  return { gate, read };
}

/** Every page.tsx and layout.tsx under src/app outside src/app/api. */
function routeFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (full !== API_DIR) routeFiles(full, out);
    } else if (entry.name === "page.tsx" || entry.name === "layout.tsx") {
      out.push(full);
    }
  }
  return out;
}

/** The functions Next renders from a page or layout: the default export and generateMetadata. */
function renderers(source) {
  const out = [];
  const declared = /export\s+default\s+(?:async\s+)?function\b[^(]*\(/.exec(source);
  if (declared) {
    out.push({ name: "default", span: functionSpan(source, declared.index) });
  } else {
    const named = /export\s+default\s+([A-Za-z_$][\w$]*)\s*;/.exec(source);
    out.push({ name: "default", span: named ? moduleScope(source).locals.get(named[1]) ?? null : null });
  }
  const metadata = /export\s+(?:async\s+)?function\s+generateMetadata\s*\(/.exec(source);
  if (metadata) out.push({ name: "generateMetadata", span: functionSpan(source, metadata.index) });
  return out;
}

function scanPages() {
  const files = routeFiles(APP_DIR);
  const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const server = files.filter((file) => !isClientModule(sources.get(file)));
  const { unresolved, walks } = walkEachFrom(server, {
    stopAt: (file, source) => ASKING_MODULES.includes(file) || isClientModule(source),
  });
  const pages = [];
  const unreadable = [];
  for (const file of server) {
    const { reached, packages } = walks.get(file);
    const adminChain = reached.get(ADMIN_MODULE) ?? [...packages].find(([s]) => /^firebase-admin(?:\/|$)/.test(s))?.[1];
    // A chain that ends in a module the walk stopped at (the session) is not a read.
    const reads = Boolean(adminChain) && !adminChain.slice(0, -1).some((f) => ASKING_MODULES.includes(f));
    const raw = sources.get(file);
    const source = stripSource(raw);
    const scope = moduleScope(source, stripSource(raw, { keepStrings: true }));
    const path = toRepo(file);
    const found = renderers(source).map(({ name, span }) => {
      if (!span) {
        unreadable.push(`${path}#${name}`);
        return { name, gate: null, read: null, body: "" };
      }
      return { name, body: span.text, ...readComponent(span.text, scope) };
    });
    pages.push({ path, reads, chain: adminChain ? adminChain.map(toRepo) : null, renderers: found, scope });
  }
  return { files, server, pages, unresolved, unreadable };
}

/** Does this page pass the rule on its own, with no OPEN entry? */
function passes(page) {
  if (!page.reads) return true;
  return page.renderers.every((r) => {
    if (r.name === "generateMetadata" && !r.read) return true;
    return Boolean(r.gate) && (!r.read || r.gate.at < r.read.at);
  });
}

function openEntryFor(path) {
  if (OPEN.has(path)) return path;
  for (const key of OPEN.keys()) if (key.endsWith("/") && path.startsWith(key)) return key;
  return null;
}

function treeFor(path) {
  return TREE_GATES.find((tree) => path.startsWith(tree.dir)) ?? null;
}

/** Find a function's own text in the module it is exported from. */
function bodyOfExport(specifier, name) {
  const base = join(SRC_DIR, specifier.slice(2));
  const file = [`${base}.ts`, `${base}.tsx`].find((candidate) => existsSync(candidate));
  if (!file) return null;
  const source = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
  const start = new RegExp(`export\\s+(?:async\\s+function|function|const)\\s+${name}\\b`).exec(source);
  if (!start) return null;
  const next = source.slice(start.index + 1).search(/\nexport\s/);
  return source.slice(start.index, next === -1 ? undefined : start.index + 1 + next);
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

const { files, server, pages, unresolved, unreadable } = scanPages();

describe("every server page that reads asks who is calling first", () => {
  test("the scan is not vacuous, and it could read and resolve everything", () => {
    assert.ok(files.length > 150, `only ${files.length} pages and layouts found under src/app`);
    assert.ok(server.length > 150, `only ${server.length} server pages and layouts found`);
    const reading = pages.filter((p) => p.reads).length;
    assert.ok(reading > 100, `only ${reading} pages found that reach the Admin SDK; the walk is broken`);
    assert.deepEqual(unresolved, [], "an import the walk cannot follow is a page it has not checked");
    assert.deepEqual(
      unreadable,
      [],
      "a component this scan cannot find is a component it cannot check. Use `export default " +
        "async function Name(...)`, or teach this file the new form.",
    );
  });

  test("the first gate comes before the first read, or the page is in OPEN", () => {
    const failures = [];
    for (const page of pages) {
      if (passes(page) || openEntryFor(page.path)) continue;
      for (const r of page.renderers) {
        if (r.name === "generateMetadata" && !r.read) continue;
        if (r.gate && r.read && r.read.at < r.gate.at) {
          failures.push(`${page.path}#${r.name} reads (${r.read.name}) before its gate (${r.gate.name}).`);
        } else if (!r.gate) {
          failures.push(
            `${page.path}#${r.name} reaches the Admin SDK (${page.chain.join(" -> ")}) and calls no gate` +
              (r.read ? ` before it reads (${r.read.name}).` : "."),
          );
        }
      }
    }
    assert.deepEqual(
      failures,
      [],
      `\n${failures.join("\n")}\n\nCall a gate from GATES first (its tree's gate in an admin tree), ` +
        "or add an OPEN entry with the reason the page is open.\n",
    );
  });

  test("a page in an admin tree asks its tree's own question", () => {
    const failures = [];
    for (const page of pages) {
      const tree = treeFor(page.path);
      if (!tree || !page.reads) continue;
      const component = page.renderers.find((r) => r.name === "default");
      const own = component?.gate && tree.gates.some((g) => component.gate.name.endsWith(g));
      const refused = tree.refusal?.test(component?.body ?? "");
      if (!own && !refused) {
        failures.push(
          `${page.path} reads and does not call ${tree.gates.join(" or ")} (${tree.why}); it asks ` +
            `${component?.gate?.name ?? "nothing"}.`,
        );
      }
    }
    assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
  });

  test("every OPEN entry is still needed, in both directions", () => {
    const failures = [];
    for (const [key, why] of OPEN) {
      assert.ok(why.length > 60, `OPEN["${key}"] needs its reason written out.`);
      const covered = pages.filter((p) => (key.endsWith("/") ? p.path.startsWith(key) : p.path === key));
      if (!key.endsWith("/")) {
        const page = covered[0];
        if (!page) failures.push(`${key} is in OPEN but is not a server page or layout any more. Delete the entry.`);
        else if (!page.reads) failures.push(`${key} is in OPEN but no longer reaches the Admin SDK. Delete the entry.`);
        else if (passes(page)) failures.push(`${key} is in OPEN but now asks who is calling first. Delete the entry.`);
        continue;
      }
      if (!covered.some((p) => !passes(p))) {
        failures.push(`${key} is in OPEN but no page under it reads with no gate first. Delete the entry.`);
      }
    }
    assert.deepEqual(failures, [], `\n${failures.join("\n")}\n`);
  });

  test("every gate's own body holds the proof it claims", () => {
    for (const [name, gate] of Object.entries(GATES)) {
      const body = bodyOfExport(gate.from, name);
      assert.ok(body, `GATES["${name}"] says it is exported from ${gate.from}, and it is not.`);
      assert.match(body, gate.proof, `GATES["${name}"] claims ${gate.proves}, and its body does not show it.`);
      assert.ok(gate.why.length > 15, `GATES["${name}"] needs a reason.`);
    }
  });

  test("every PURE function reads nothing", () => {
    for (const [name, entry] of Object.entries(PURE)) {
      const body = bodyOfExport(entry.from, name);
      assert.ok(body, `PURE["${name}"] says it is exported from ${entry.from}, and it is not.`);
      const touch = [...body.matchAll(METHOD_CALL)].find((m) => DATA_METHODS.has(m[1]));
      assert.equal(touch, undefined, `PURE["${name}"] calls .${touch?.[1]}(, so it reads.`);
      assert.ok(entry.why.length > 15, `PURE["${name}"] needs a reason.`);
    }
  });
});

// ---------------------------------------------------------------------------
// The scanner, on synthetic components
// ---------------------------------------------------------------------------

describe("the scanner reads order the way the rule means it", () => {
  const scopeOf = (text) => moduleScope(stripSource(text), stripSource(text, { keepStrings: true }));
  const read = (text) => {
    const source = stripSource(text);
    const span = renderers(source)[0].span;
    return readComponent(span.text, scopeOf(text));
  };
  const header =
    'import { requireAdminPage } from "@/lib/firebase/pageGates";\n' +
    'import { getAdminDb } from "@/lib/firebase/admin";\n' +
    'import { loadThing } from "@/lib/thing";\n';

  test("a gate first, then a read, passes", () => {
    const r = read(`${header}export default async function P({ params }: { params: Promise<{ id: string }> }) {
      const { id } = await params;
      await requireAdminPage();
      const db = getAdminDb();
      return await loadThing(db, id);
    }`);
    assert.equal(r.gate?.name, "requireAdminPage");
    assert.ok(r.gate.at < r.read.at);
  });

  test("a read before the gate is seen as one", () => {
    const r = read(`${header}export default async function P() {
      const db = getAdminDb();
      const thing = await db.collection("x").get();
      await requireAdminPage();
      return thing;
    }`);
    assert.ok(r.read.at < r.gate.at);
  });

  test("a gate awaited beside params counts; a gate awaited beside a read does not", () => {
    const beside = read(`${header}export default async function P({ params }: { params: Promise<{ id: string }> }) {
      const [{ id }, user] = await Promise.all([params, requireAdminPage()]);
      return loadThing(getAdminDb(), id, user);
    }`);
    assert.ok(beside.gate && beside.gate.at < beside.read.at);
    const together = read(`${header}export default async function P() {
      const [user, thing] = await Promise.all([requireAdminPage(), loadThing(getAdminDb())]);
      return [user, thing];
    }`);
    assert.equal(together.gate, null);
    assert.match(together.read.name, /in one Promise\.all/);
  });

  test("a helper the file defines is read where it is called", () => {
    const r = read(`${header}async function ask() {
      return requireAdminPage();
    }
    export default async function P() {
      await ask();
      return loadThing(getAdminDb());
    }`);
    assert.equal(r.gate?.name, "ask -> requireAdminPage");
    assert.ok(r.gate.at < r.read.at);
  });

  test("a gate named in a comment or a string is not a gate", () => {
    const r = read(`${header}export default async function P() {
      // requireAdminPage() is asked by the layout
      const label = "requireAdminPage()";
      return loadThing(getAdminDb(), label);
    }`);
    assert.equal(r.gate, null);
  });

  test("the admin tree's refusal form matches only a refusal", () => {
    const tree = TREE_GATES[0];
    assert.match(
      stripSource('const viewer = await getCurrentUser();\n  if (!viewer || !canRunSurveys(viewer)) redirect("/dashboard");'),
      tree.refusal,
    );
    assert.match(
      stripSource('const viewer = await getCurrentUser();\n  if (!viewer || viewer.role !== "admin") redirect("/dashboard");'),
      tree.refusal,
    );
    assert.doesNotMatch(stripSource("const viewer = await getCurrentUser();\n  const db = getAdminDb();"), tree.refusal);
    assert.doesNotMatch(
      stripSource('const viewer = await getCurrentUser();\n  if (!viewer) redirect("/dashboard");'),
      tree.refusal,
    );
  });
});
