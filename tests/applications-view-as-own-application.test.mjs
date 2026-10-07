/**
 * A view-as session is not the applicant.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET /api/admissions/forms/[roundId]/application     the caller's own application
 *   GET /api/admissions/applications/me                 every application the caller has
 *   /apply/[roundId]             the form
 *   /applications                the list
 *   /applications/[roundId]      one application, read back
 *   /dashboard                   the card that leads to the list
 *
 * ## The rule this guards
 *
 * Admin "view as" borrows a member's session, so every read addressed by "the
 * caller's own uid" would be the member's. An application is its owner's to
 * read: the people who review it read what was sent and never the draft, and
 * some of what it asks is asked on the promise that no reader is shown the
 * answer. So while a view-as session is live:
 *
 *  - THE PERSON'S OWN APPLICATION IS NOT SHOWN. The form, the list and the
 *    page for one application each draw a notice in its place.
 *  - IT IS NOT READ EITHER. The check comes before the read, on every one of
 *    them, so nothing of the application is fetched to be left out
 *    afterwards and nothing of it is in the page.
 *  - THE ROUTES REFUSE, the reads included, as every write already does.
 *  - A MARKER LEFT OVER FROM A SESSION THAT HAS ENDED IS NOT A SESSION. An
 *    admin signed in as themselves again reads their own application.
 *
 * ## The two halves of this file
 *
 * THE TREE. Every function under `src/app` and `src/features` that calls
 * one of the reads of the caller's own application is listed with how it is
 * held to the check, and each entry is read out of the source.
 *
 * THE SCREENS AND THE ROUTES, run for real against a small term: the two
 * handlers, and the four server components, each drawn to HTML for a member,
 * for an admin viewing as that member, and for an admin with a marker left
 * over.
 *
 * Real: the handlers, the server components, the applicant's gate, the
 * loaders, and the view-as module itself (`getImpersonator`, `markerIsLive`,
 * `assertNotImpersonating`), which reads the cookie this file sets. Faked:
 * `next/server`, `next/headers`, `next/link`, `next/navigation`, the
 * sentinels `firebase-admin/firestore` supplies, the session, the Admin SDK
 * handle (`tests/lib/applicationsStore.mjs`), every stylesheet, and the
 * client components a server component hands its props to, each of which
 * records what it was handed.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  ROUND,
  TAIS,
  WHILE_OPEN,
  applicationDoc,
  applicationPath,
  seedTerm,
  stringsIn,
} from "./lib/applicationsSmallTerm.mjs";
import { calls, firstCall, scanModule, walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const posix = (path) => path.split(sep).join("/");
const inSrc = (file) => posix(relative(SRC, file));

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/**
 * THE READS OF THE CALLER'S OWN APPLICATION, by the module each is imported
 * from. A function of the same name from anywhere else is another function.
 */
const OWN_READS = {
  loadOwnApplication: "@/lib/applications/repo",
  loadApplicantView: "@/lib/applications/applicant/store",
  loadStatus: "@/lib/applications/status/load",
  loadListWords: "@/lib/applications/status/load",
  loadStatusRows: "@/lib/admissions/statusHubData",
  loadStatusRowForRound: "@/lib/admissions/statusHubData",
};

const GUARD_FIRST = /^\{\s*const blocked = await assertNotImpersonating\(\);\s*if \(blocked\) return blocked;/;

/**
 * EVERY FUNCTION UNDER `src/app` AND `src/features` THAT CALLS ONE, and how
 * it is held to the check.
 *
 *  - `refuses-first`: a route handler whose first statement is the view-as
 *    guard, so it answers before it has read anything.
 *  - `notice-first`: a screen that leaves when a view-as session is live,
 *    before the read. `leaves` is the statement that does it.
 *  - `after-the-form`: reached only once the form's own screen has answered
 *    that the round is not an application form.
 */
const HELD = {
  "app/api/admissions/forms/[roundId]/application/route.ts#GET": {
    how: "refuses-first",
    why: "the caller's own application, draft and all",
  },
  "app/api/admissions/forms/[roundId]/application/route.ts#PUT": {
    how: "refuses-first",
    why: "a save answers with the application as it now stands",
  },
  "app/api/admissions/forms/[roundId]/application/send/route.ts#POST": {
    how: "refuses-first",
    why: "a send answers with the application it sent",
  },
  "app/api/admissions/forms/[roundId]/application/reply/route.ts#POST": {
    how: "refuses-first",
    why: "a reply answers with where the application stands afterwards",
  },
  "app/api/admissions/applications/me/route.ts#GET": {
    how: "refuses-first",
    why: "every application the caller has, which is what the list page draws",
  },
  "features/applications/apply/ApplyScreen.tsx#renderApplicationForm": {
    how: "notice-first",
    leaves: "if (viewingAs) {",
    why: "the form, which opens on the caller's own draft",
  },
  "features/applications/status/renderApplicationStatus.tsx#renderApplicationStatus": {
    how: "notice-first",
    leaves: "if (viewingAs) {",
    why: "one application read back, with where it stands",
  },
  "app/(public)/applications/page.tsx#ApplicationsPage": {
    how: "notice-first",
    leaves: "if (markerIsLive(await getImpersonator(), user.uid)) return <ViewingAs />;",
    why: "the list of everything the caller has applied to",
  },
  "app/(app)/dashboard/page.tsx#applicationsOf": {
    how: "notice-first",
    leaves: "if (viewingAs) return null;",
    why: "the dashboard card, which names each application",
  },
  "app/(public)/applications/[roundId]/page.tsx#ApplicationDetailPage": {
    how: "after-the-form",
    why: "the older read-back, for a round of the older kind, which keeps the rule its own page states",
  },
};

const modules = new Map();
const scan = (file) => {
  if (!modules.has(file)) modules.set(file, scanModule(file));
  return modules.get(file);
};
/** The own reads a function calls: those its module imports from where they are declared. */
function ownReadsOf(mod, fn) {
  return Object.entries(OWN_READS)
    .filter(([name, from]) => mod.imports.get(name) === from && calls(fn.body, name))
    .map(([name]) => name);
}

describe("every read of the caller's own application is held to the view-as check before it reads", () => {
  const found = new Map();
  for (const dir of ["app", "features"]) {
    for (const file of walkSource(join(SRC, dir))) {
      const mod = scan(file);
      for (const fn of mod.functions.values()) {
        const reads = ownReadsOf(mod, fn);
        if (reads.length > 0) found.set(`${inSrc(file)}#${fn.name}`, { mod, fn, reads });
      }
    }
  }

  test("the list is the tree: nothing missing from it, and nothing on it that has gone", () => {
    assert.deepEqual(
      [...found.keys()].filter((key) => !Object.hasOwn(HELD, key)),
      [],
      "something reads the caller's own application and is not on the list. In a view-as session the caller is not the applicant: hold it to the check before it reads, and add it to HELD.",
    );
    assert.deepEqual(Object.keys(HELD).filter((key) => !found.has(key)), []);
    for (const [key, entry] of Object.entries(HELD)) {
      assert.ok(["refuses-first", "notice-first", "after-the-form"].includes(entry.how), key);
      assert.ok(typeof entry.why === "string" && entry.why.length > 20, `${key} needs its reason written down`);
    }
  });

  test("the reads are declared where this file says, so no other function of the same name is one", () => {
    for (const [name, from] of Object.entries(OWN_READS)) {
      const file = join(SRC, `${from.slice(2)}.ts`);
      assert.ok(scan(file).functions.get(name)?.exported, `${name} is not an exported function of ${from}`);
    }
  });

  for (const [key, entry] of Object.entries(HELD)) {
    const at = found.get(key);
    if (!at) continue;
    const { fn, reads } = at;
    const firstRead = Math.min(...reads.map((name) => firstCall(fn.body, name)));

    if (entry.how === "refuses-first") {
      test(`${key} refuses a view-as session as its first statement`, () => {
        assert.match(fn.body, GUARD_FIRST, `${key} does something before the view-as guard`);
      });
    }
    if (entry.how === "notice-first") {
      test(`${key} leaves before it reads`, () => {
        const left = fn.body.indexOf(entry.leaves);
        assert.ok(left !== -1, `${key} no longer has the statement that leaves: ${entry.leaves}`);
        assert.ok(left < firstRead, `${key} reads the caller's own application before it has asked whether this is a view-as session`);
      });
    }
    if (entry.how === "after-the-form") {
      test(`${key} asks the form's own screen first, and returns what it answers`, () => {
        const asked = fn.body.indexOf("const formStatus = await renderApplicationStatus({ roundId, user });");
        const returned = fn.body.indexOf("if (formStatus) return formStatus;");
        assert.ok(asked !== -1 && returned > asked && returned < firstRead);
      });
    }
  }

  test("whether a session is a view-as session is asked one way, of the cookie and the session in hand", () => {
    const code = (...parts) => readFileSync(join(SRC, ...parts), "utf8").replace(/\s+/g, " ");
    // The form is handed the answer by its page, which works it out before anything else.
    const applyPage = code("app", "(public)", "apply", "[roundId]", "page.tsx");
    const worked = applyPage.indexOf("const viewingAs = markerIsLive(await getImpersonator(), user?.uid ?? null);");
    const handed = applyPage.indexOf("const applicationForm = await renderApplicationForm({ roundId, user, viewingAs,");
    assert.ok(worked !== -1 && handed > worked);
    assert.ok(code("features", "applications", "status", "renderApplicationStatus.tsx").includes("const viewingAs = markerIsLive(await getImpersonator(), user.uid);"));
    const dashboard = code("app", "(app)", "dashboard", "page.tsx");
    assert.ok(dashboard.includes("const viewingAs = markerIsLive(await getImpersonator(), user?.uid ?? null);"));
    assert.ok(dashboard.includes("const applications = user ? await applicationsOf(user.uid, viewingAs) : [];"));
  });
});

// ---------------------------------------------------------------------------
// The screens and the routes
// ---------------------------------------------------------------------------

// A stand-in below cannot import a package, so the one function they all
// draw with is handed to them here.
const world = { db: null, user: null, cookie: null, touched: [], handed: {}, createElement };
globalThis.__viewAsOwn = world;

/** A stylesheet: every class it is asked for is its own name. */
const STYLES = "export default new Proxy({}, { get: (_, name) => String(name) });";
/** A client component: it draws a mark and records what it was handed. */
const records = (name) =>
  `export default function ${name}(props) {\n` +
  `  globalThis.__viewAsOwn.handed.${name} = props;\n` +
  `  return globalThis.__viewAsOwn.createElement('div', { 'data-drawn': '${name}' });\n` +
  "}";
const NOTHING = (name) => `export default function ${name}() { return null; }\nexport function InstallCard() { return null; }`;
const BOX =
  "export default function Box({ children }) {\n" +
  "  return globalThis.__viewAsOwn.createElement('div', null, children);\n" +
  "}";
/** One of Home's forms: it draws the two things it is handed about applications. */
const HOME_FORM = (name) =>
  `export default function ${name}({ applications, nothingYet }) {\n` +
  "  return globalThis.__viewAsOwn.createElement('div', null, applications, nothingYet);\n" +
  "}";

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "next/server",
    "export class NextResponse {\n" +
      "  constructor(body, init) {\n" +
      "    this.body = body;\n" +
      "    this.status = (init && init.status) || 200;\n" +
      "  }\n" +
      "  static json(body, init) { return new NextResponse(body, init); }\n" +
      "}",
  ],
  [
    // The cookie jar of one request: the view-as marker is the one cookie in it.
    "next/headers",
    "export async function cookies() {\n" +
      "  const w = globalThis.__viewAsOwn;\n" +
      "  return {\n" +
      "    get: (name) => (w.cookie === null ? undefined : { name, value: w.cookie }),\n" +
      "    set: (name, value) => { w.cookie = value; },\n" +
      "    delete: () => { w.cookie = null; },\n" +
      "  };\n" +
      "}",
  ],
  [
    "next/link",
    "export default function Link({ href, children }) {\n" +
      "  return globalThis.__viewAsOwn.createElement('a', { href }, children);\n" +
      "}",
  ],
  [
    "next/navigation",
    "export function redirect(to) { throw new Error('redirect to ' + to); }\n" +
      "export function notFound() { throw new Error('not found'); }",
  ],
  ["firebase-admin/firestore", FIELD_VALUE_STUB],
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__viewAsOwn.db;\n}"],
  [
    "@/lib/firebase/session",
    "export async function getCurrentUser() {\n  return globalThis.__viewAsOwn.user;\n}\n" +
      "export async function getCurrentCollaborator() {\n  return null;\n}",
  ],
  // The view-as module's own import of the session, by the name it writes.
  ["./session", "export async function getCurrentUser() {\n  return globalThis.__viewAsOwn.user;\n}"],
  ["./form.module.css", STYLES],
  ["./status.module.css", STYLES],
  ["./applications.module.css", STYLES],
  ["@/features/applications/kit/kit.module.css", STYLES],
  ["@/features/applications/kit/ApplicationsRoot", BOX],
  ["@/components/ui/Card", BOX],
  ["@/components/ui/Badge", BOX],
  ["./ApplicationForm", records("ApplicationForm")],
  ["./JoinStep", records("JoinStep")],
  ["./StatusPage", records("StatusPage")],
  ["@/features/applications/home/YourApplications", records("YourApplications")],
  ["@/features/pwa/InstallCard", NOTHING("Install")],
  // Home's own pieces. The two forms draw what they are handed about
  // applications and nothing else; the rest of the page (the term, the
  // events, the profile card and its read of the member's profile) is not
  // about an application and is stood in for.
  ["./HomeMember", HOME_FORM("HomeMember")],
  ["./HomeAdmin", HOME_FORM("HomeAdmin")],
  [
    "./HomeAside",
    "export function FinishProfile() { return null; }\n" +
      "export function NoApplicationsYet(props) {\n" +
      "  globalThis.__viewAsOwn.handed.NoApplicationsYet = props;\n" +
      "  return globalThis.__viewAsOwn.createElement('div', { 'data-drawn': 'NoApplicationsYet' });\n" +
      "}",
  ],
  ["./ComingUp", NOTHING("ComingUp")],
  ["./TermCard", NOTHING("TermCard")],
  ["./home.module.css", STYLES],
  [
    "./homeData",
    "export async function homeEvents() {\n" +
      "  return { upcoming: [], week: { range: null, events: [], startsAt: null, endsAt: null } };\n" +
      "}\n" +
      "export async function profileSteps() { return null; }",
  ],
  [
    // Applications are open, which is when Home says "Nothing yet" to a member who has not applied.
    "@/features/term/fetchPublicTerm",
    "export async function fetchPublicTerm() {\n" +
      "  return { stage: 'open', closesAt: null, decisionsByDate: null };\n" +
      "}",
  ],
]);
const { loadTs } = createLoader({ stubs: STUBS });

const ownRoute = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "application", "route.ts"));
const listRoute = await loadTs(join("app", "api", "admissions", "applications", "me", "route.ts"));
const { renderApplicationForm } = await loadTs(join("features", "applications", "apply", "ApplyScreen.tsx"));
const { renderApplicationStatus } = await loadTs(
  join("features", "applications", "status", "renderApplicationStatus.tsx"),
);
const { default: ApplicationsPage } = await loadTs(join("app", "(public)", "applications", "page.tsx"));
const { default: DashboardPage } = await loadTs(join("app", "(app)", "dashboard", "page.tsx"));
const { IMPERSONATION_BLOCKED_MESSAGE } = await loadTs(join("lib", "firebase", "impersonation.ts"));
const { VIEW_AS_NOTICE } = await loadTs(join("features", "applications", "viewAsNotice.ts"));

/** What Amara has typed and not sent, and what she sent: none of it is an admin's to be handed. */
const UNSENT = "Still deciding how to put this.";
const HERS = [UNSENT, "To find out which arguments hold up.", "A new law came into force.", "amara@students.example.com"];
/** A form whose window no test machine's clock is outside of. */
const ALWAYS_OPEN = { opensAt: new Date("2020-01-01T00:00:00Z"), closesAt: new Date("2099-01-01T00:00:00Z") };

/** The store, with `limit` on a query, which the list's loader asks for. */
function withLimit(query) {
  return {
    ...query,
    where: (...filter) => withLimit(query.where(...filter)),
    limit: () => withLimit(query),
  };
}

function term({ round = {}, over = {} } = {}) {
  const amara = applicationDoc("amara", [AGI, TAIS]);
  amara.draft = {
    ...amara.draft,
    suMembership: "not-yet",
    answers: { ...amara.draft.answers, fellowships: { why: UNSENT } },
  };
  const db = makeDb(
    seedTerm({ round: { ...ALWAYS_OPEN, ...round }, over: { [applicationPath("amara")]: amara, ...over } }),
    { now: WHILE_OPEN },
  );
  const collection = db.collection;
  db.collection = (name) => {
    world.touched.push(name);
    return withLimit(collection(name));
  };
  world.db = db;
  world.touched = [];
  world.handed = {};
  return db;
}

/** Who the session says is signed in, and the marker in the request's cookies. */
function signedIn(uid, marker = null) {
  world.user = CAST[uid];
  world.cookie = marker === null ? null : JSON.stringify(marker);
  world.touched = [];
  world.handed = {};
}
/** The admin started a view-as session and is in it: the session is the member's. */
const VIEWING = { actorUid: "zach", actorName: "Zach Levin", actorEmail: "zach@example.com", auditId: "audit-1" };
const viewingAs = (uid) => signedIn(uid, VIEWING);
/** The admin is signed in as themselves again, and the marker was never cleared. */
const leftOver = () => signedIn("zach", VIEWING);

const request = () => new Request("http://naisi.invalid/api", { method: "GET" });
const getOwn = () => ownRoute.GET(request(), { params: Promise.resolve({ roundId: ROUND }) });
/** Which of her things a page or a payload carries. */
const hersIn = (value) => {
  const text = typeof value === "string" ? value : stringsIn(value).join("\n");
  return HERS.filter((mark) => text.includes(mark));
};
/** The collections a request touched that hold something of a person's own. */
const READ_OF_HERS = ["admissionApplications", "admissionApplicationPrivate", "users"];
const readOfHers = () => world.touched.filter((name) => READ_OF_HERS.includes(name));
const formProps = { roundId: ROUND, step: null, fromJoinLink: false };

describe("the applicant's own read refuses a view-as session", () => {
  test("to the member it is their application, draft and all", async () => {
    term();
    signedIn("amara");
    const response = await getOwn();
    assert.equal(response.status, 200);
    assert.deepEqual(hersIn(response.body).sort(), [...HERS].sort());
    assert.equal(response.body.application.draft.suMembership, "not-yet");
  });

  test("to an admin viewing as the member it is a refusal, and nothing was read", async () => {
    term();
    viewingAs("amara");
    const response = await getOwn();
    assert.deepEqual([response.status, response.body], [403, { error: IMPERSONATION_BLOCKED_MESSAGE }]);
    assert.deepEqual(world.touched, [], "the refusal read something first");
    assert.notEqual(world.cookie, null, "the marker of a live session is left alone");
  });

  test("a marker left over from a session that has ended is not a session", async () => {
    term({ over: { [applicationPath("zach")]: applicationDoc("zach", [AGI]) } });
    leftOver();
    const response = await getOwn();
    assert.equal(response.status, 200, "an admin signed in as themselves reads their own application");
    assert.equal(response.body.application.sent.rankedProgrammeIds[0], AGI);
    assert.equal(world.cookie, null, "and the marker is cleared");
  });

  test("the list of somebody's applications refuses the same way", async () => {
    term();
    signedIn("amara");
    const mine = await listRoute.GET();
    assert.equal(mine.status, 200);
    assert.deepEqual(mine.body.rows.map((row) => row.round.id), [ROUND]);

    viewingAs("amara");
    const borrowed = await listRoute.GET();
    assert.deepEqual([borrowed.status, borrowed.body], [403, { error: IMPERSONATION_BLOCKED_MESSAGE }]);
    assert.deepEqual(world.touched, []);
  });
});

describe("the form draws a notice in place of the member's application", () => {
  test("to the member it is the form, opened on their own draft", async () => {
    term();
    signedIn("amara");
    const html = renderToStaticMarkup(await renderApplicationForm({ ...formProps, user: world.user, viewingAs: false }));
    assert.ok(html.includes('data-drawn="ApplicationForm"'));
    assert.deepEqual(hersIn(world.handed.ApplicationForm).sort(), [...HERS].sort(), "the form is handed her draft and what she sent");
  });

  test("in a view-as session nothing of the application is read, handed on or in the page", async () => {
    term();
    viewingAs("amara");
    const html = renderToStaticMarkup(await renderApplicationForm({ ...formProps, user: world.user, viewingAs: true }));
    assert.ok(html.includes(VIEW_AS_NOTICE.title), "the notice's title is in the page");
    assert.ok(html.includes(VIEW_AS_NOTICE.body), "and what it says");
    assert.equal(html.includes("data-drawn"), false, "the form, or its first step, was drawn");
    assert.deepEqual(world.handed, {});
    assert.deepEqual(hersIn(html), []);
    assert.deepEqual(readOfHers(), [], "something of the member's was read");
  });

  test("a round that is not a form an applicant may see is still answered as it always was", async () => {
    term();
    viewingAs("amara");
    assert.equal(await renderApplicationForm({ ...formProps, roundId: "older-round", user: world.user, viewingAs: true }), null);
    assert.equal(await renderApplicationForm({ ...formProps, roundId: "no-such-round", user: world.user, viewingAs: true }), null);
    term({ round: { status: "draft" } });
    viewingAs("amara");
    assert.equal(await renderApplicationForm({ ...formProps, user: world.user, viewingAs: true }), null);
    assert.deepEqual(readOfHers(), []);
  });
});

describe("the page for one application draws a notice in its place", () => {
  const draw = async (roundId = ROUND) => {
    const answer = await renderApplicationStatus({ roundId, user: world.user });
    return answer === null ? null : renderToStaticMarkup(answer);
  };

  test("to the member it is their own page", async () => {
    term();
    signedIn("amara");
    const html = await draw();
    assert.ok(html.includes('data-drawn="StatusPage"'));
    assert.equal(world.handed.StatusPage.viewingAs, false);
    assert.ok(readOfHers().includes("admissionApplications"));
  });

  test("in a view-as session nothing of the application is read, handed on or in the page", async () => {
    term();
    viewingAs("amara");
    const html = await draw();
    assert.ok(html.includes(VIEW_AS_NOTICE.title));
    assert.equal(html.includes("data-drawn"), false);
    assert.deepEqual(world.handed, {});
    assert.deepEqual(hersIn(html), []);
    assert.deepEqual(readOfHers(), []);
  });

  test("so is a form that has since been archived, which only its applicants are told about", async () => {
    term({ round: { archived: true } });
    viewingAs("amara");
    assert.ok((await draw()).includes(VIEW_AS_NOTICE.title));
    assert.deepEqual(readOfHers(), []);
  });

  test("a round that is not an application form is handed back to the page, with nothing read", async () => {
    term();
    viewingAs("amara");
    assert.equal(await draw("older-round"), null);
    assert.equal(await draw("no-such-round"), null);
    assert.deepEqual(readOfHers(), []);
  });

  test("a marker left over is not a session: the admin reads their own page", async () => {
    term({ over: { [applicationPath("zach")]: applicationDoc("zach", [AGI]) } });
    leftOver();
    assert.ok((await draw()).includes('data-drawn="StatusPage"'));
  });
});

describe("the list draws a notice in its place", () => {
  test("to the member it is their applications", async () => {
    term();
    signedIn("amara");
    const html = renderToStaticMarkup(await ApplicationsPage());
    assert.ok(html.includes("Autumn 2026"));
    assert.equal(html.includes(VIEW_AS_NOTICE.title), false);
  });

  test("in a view-as session the query is never made", async () => {
    term();
    viewingAs("amara");
    const html = renderToStaticMarkup(await ApplicationsPage());
    assert.ok(html.includes(VIEW_AS_NOTICE.title));
    assert.equal(html.includes("Autumn 2026"), false, "a row of the list is in the page");
    assert.deepEqual(world.touched, [], "the page read something before it left");
  });

  test("a marker left over is not a session: the admin reads their own list", async () => {
    term({ over: { [applicationPath("zach")]: applicationDoc("zach", [AGI]) } });
    leftOver();
    const html = renderToStaticMarkup(await ApplicationsPage());
    assert.ok(html.includes("Autumn 2026"));
    assert.equal(html.includes(VIEW_AS_NOTICE.title), false);
  });
});

describe("the dashboard card names nothing in a view-as session", () => {
  /** What Home is handed about applications: the card's rows, and whether "Nothing yet" is drawn. */
  const home = async () => {
    renderToStaticMarkup(await DashboardPage());
    return { rows: world.handed.YourApplications.rows, nothingYet: "NoApplicationsYet" in world.handed };
  };
  /** The profile card's read of the member's own profile is stood in for above: it is not an application. */
  const readOfAnApplication = () => world.touched.filter((name) => name.startsWith("admissionApplication"));

  test("to the member it names each application", async () => {
    term();
    signedIn("amara");
    assert.deepEqual(await home(), { rows: [{ roundId: ROUND, label: "Autumn 2026" }], nothingYet: false });
    assert.deepEqual(readOfAnApplication(), ["admissionApplications"], "the list's own loader read them");
  });

  test("to a member who has not applied it says so, while applications are open", async () => {
    term();
    signedIn("nina");
    assert.deepEqual(await home(), { rows: [], nothingYet: true });
  });

  test("in a view-as session it is handed nothing to name, and nothing is read", async () => {
    term();
    viewingAs("amara");
    assert.deepEqual(
      await home(),
      { rows: null, nothingYet: false },
      "null is the card's own word for could not be read: it offers the way to the list and names nothing",
    );
    assert.deepEqual(readOfAnApplication(), []);
  });

  test("nor does it say whether they have applied at all", async () => {
    term();
    viewingAs("nina");
    assert.deepEqual(await home(), { rows: null, nothingYet: false }, "the same as for somebody who has");
    assert.deepEqual(readOfAnApplication(), []);
  });
});

describe("the words of the notice", () => {
  test("say what is not shown, and what to do", () => {
    assert.deepEqual(
      { ...VIEW_AS_NOTICE },
      {
        title: "Not shown while you’re viewing as somebody else",
        body:
          "An application is its owner’s to read. Their answers, anything they haven’t sent yet and where it stands aren’t shown in a view-as session. Exit view-as to carry on as yourself.",
      },
    );
  });
});
