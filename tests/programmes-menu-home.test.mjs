/**
 * Each programme in the menu, and the Programmes card on Home, as every kind
 * of reader.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET /api/admissions/programmes/menu    the menu's programmes
 *   the menu (`useProgrammesMenu`, `programmeEntriesOf`)
 *   Home's Programmes card and an admin's Applications to read
 *
 * ## What this guards
 *
 *  1. WHO IS GIVEN WHAT, ON THE SERVER. The route answers an admin every
 *     programme of a term that is not over, a lead the ones they lead, a
 *     reviewer none, and refuses a member, a facilitator, a run's track lead
 *     and a course approver on no form before anything is read. Nobody is
 *     given a programme, a name or a count the Programmes list would not give
 *     them, and nothing in the answer names a person.
 *  2. THE WORDS: the term's heading and its suffix, "Review N" only where
 *     applications wait for this reader's reading.
 *  3. WHAT THE ROUTE READS, for an admin, a lead and a reviewer: none of the
 *     cards' figures.
 *  4. THE MENU WITHOUT AN ANSWER: none yet, a failed one, a refusal, a slow
 *     one and one that is not an answer all leave today's menu.
 *  5. HOME: the card's rows for an admin and a lead, nothing for a reviewer
 *     or when the list could not be read, an admin's Applications to read,
 *     and that Home neither waits on it nor asks for it in a view-as session.
 *
 * Real: the route, the loaders, the card. Faked: the session, the Admin SDK
 * handle, `next/link` and the stylesheets.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CAST, makeWorld } from "./lib/handoverWorld.mjs";
import { AGI, RUN, ROUND, TAIS, formPath, leadSeed } from "./lib/leadWorld.mjs";
import { INCUBATOR } from "./lib/applicationsSmallTerm.mjs";

const ui = { h: createElement };
globalThis.__programmesMenuUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";

const made = makeWorld("__programmesMenu", [
  [
    "next/link",
    "export default ({ href, className, children }) => globalThis.__programmesMenuUi.h('a', { href, className }, children);",
  ],
  ["./home.module.css", CLASS_NAMES],
  ["./ProgrammesHome.module.css", CLASS_NAMES],
]);
const { world, reset, loadTs } = made;

const { loadProgrammesList, loadProgrammesMenu, readsProgrammesFor } = await loadTs(
  join("lib", "applications", "programmes", "list.ts"),
);
const { askProgrammesMenu, parseProgrammesMenu, menuHeadingFor } = await loadTs(join("lib", "applications", "programmes", "menu.ts"));
const { homeProgrammesOf } = await loadTs(join("lib", "applications", "programmes", "home.ts"));
const { GET } = await loadTs(join("app", "api", "admissions", "programmes", "menu", "route.ts"));
const { default: ProgrammesHome } = await loadTs(join("app", "(app)", "dashboard", "ProgrammesHome.tsx"));
const { APP_NAV, menuFor } = await loadTs(join("layout", "appNav.ts"));

const SRC = join(import.meta.dirname, "..", "src");
const read = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

const HOME = `/admin/admissions/forms/${ROUND}`;
const overview = (programmeId) => `${HOME}/programmes/${programmeId}/overview`;

/** Thu 12 Nov 2026, noon: week 3 of AGI Strategy's six. */
const WEEK_THREE = new Date("2026-11-12T12:00:00Z");

/** The session `getCurrentUser()` builds from the stored account, with the reviewer flag the roles writer keeps. */
function sessionFor(uid, over = {}) {
  const base = made.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true, ...over };
}

/** Everybody the brief names, by the uid that is them in this world. */
const READERS = {
  admin: "zach",
  leadOfOne: "claudia",
  leadOfTwo: "tess",
  reviewer: "lloyd",
  trackLead: "yusuf",
  facilitator: "rahul",
  member: "nobody",
};

/** A course approver on no form: admitted to the admissions tree, named on nothing. */
const approverOnNoForm = () => sessionFor("nadia", { permissions: { approveCourse: true } });

/** Run `fn` with every read it makes counted: queries by collection and field, documents, counts and batch reads. */
async function counted(fn) {
  const reads = { queries: [], queryDocs: 0, counts: 0, docs: 0, getAll: 0 };
  const db = world.db;
  const collection = db.collection;
  const getAll = db.getAll;
  const watchQuery = (query) =>
    Object.assign(Object.create(query), {
      where: (...args) => watchQuery(query.where(...args)),
      get: async () => {
        const snap = await query.get();
        reads.queryDocs += snap.docs.length;
        return snap;
      },
      count: () => {
        const aggregate = query.count();
        return { get: async () => ((reads.counts += 1), aggregate.get()) };
      },
    });
  db.collection = (path) => {
    const ref = collection(path);
    const doc = ref.doc.bind(ref);
    return Object.assign(Object.create(ref), {
      where: (...args) => {
        reads.queries.push(`${path} ${args[0]}`);
        return watchQuery(ref.where(...args));
      },
      doc: (id) => {
        const handle = doc(id);
        const get = handle.get.bind(handle);
        return Object.assign(Object.create(handle), {
          get: async () => {
            reads.docs += 1;
            return get();
          },
        });
      },
    });
  };
  db.getAll = async (...refs) => {
    reads.getAll += refs.length;
    return getAll(...refs);
  };
  const before = made.everything();
  try {
    const value = await fn(db);
    return { value, reads, wrote: made.everything() !== before };
  } finally {
    db.collection = collection;
    db.getAll = getAll;
  }
}

const menuOf = (session, now = WEEK_THREE) => counted((db) => loadProgrammesMenu(db, session, now));

/** The route as `session` asks it. */
async function ask(session) {
  world.user = session;
  try {
    const res = await GET();
    return { status: res.status, body: await res.json() };
  } finally {
    world.user = null;
  }
}

const hrefs = (terms) => terms.flatMap((term) => term.programmes.map((p) => p.href));

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function drawCard(answer, title = "Programmes") {
  const element = await ProgrammesHome({ programmes: Promise.resolve(answer), title });
  return element === null ? "" : renderToStaticMarkup(element);
}

const openTheForm = () =>
  world.db.poke(formPath, { status: "open", decisionsSentAt: null, closesAt: new Date("2026-11-30T23:59:00Z") });

mock.timers.enable({ apis: ["Date"], now: WEEK_THREE });

beforeEach(() => {
  reset(leadSeed());
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  mock.timers.setTime(WEEK_THREE.getTime());
});

// ---------------------------------------------------------------------------
// 1. Who is given what
// ---------------------------------------------------------------------------

describe("1. the route gives each reader the programmes they open, and refuses everybody else", () => {
  test("an admin: every programme of the term, by short name, each opening its Overview", async () => {
    const { status, body } = await ask(sessionFor(READERS.admin));
    assert.equal(status, 200);
    assert.deepEqual(body, {
      terms: [
        {
          heading: "Autumn 2026",
          programmes: [
            { name: "Technical AI Safety", href: overview(TAIS), review: 0 },
            { name: "AGI Strategy", href: overview(AGI), review: 0 },
            { name: body.terms[0].programmes[2].name, href: overview(INCUBATOR), review: 0 },
          ],
        },
      ],
    });
  });

  test("the lead of one programme: that programme alone", async () => {
    const { status, body } = await ask(sessionFor(READERS.leadOfOne));
    assert.equal(status, 200);
    assert.deepEqual(hrefs(body.terms), [overview(AGI)]);
  });

  test("the lead of two: both, and only those", async () => {
    const { body } = await ask(sessionFor(READERS.leadOfTwo));
    assert.deepEqual(hrefs(body.terms), [overview(TAIS), overview(INCUBATOR)]);
  });

  test("a reviewer who leads nothing: answered, with no programme", async () => {
    const { status, body } = await ask(sessionFor(READERS.reviewer));
    assert.deepEqual([status, body], [200, { terms: [] }]);
  });

  for (const who of ["trackLead", "facilitator", "member"]) {
    test(`a ${who}: refused before anything is read`, async () => {
      const { value, reads } = await counted(() => ask(sessionFor(READERS[who])));
      assert.equal(value.status, 403);
      assert.deepEqual(Object.keys(value.body), ["error"]);
      assert.deepEqual(reads.queries, []);
    });
  }

  test("a course approver on no form: refused, though the admissions tree admits them", async () => {
    const session = approverOnNoForm();
    assert.equal(readsProgrammesFor(session), false);
    const { value, reads } = await counted(() => ask(session));
    assert.equal(value.status, 403);
    assert.deepEqual(reads.queries, []);
  });

  test("somebody signed out: 401", async () => {
    assert.equal((await ask(null)).status, 401);
  });

  test("a flag that outlived its standing is refused: a pending account still carrying it", async () => {
    world.db.poke("users/claudia", { role: "pending" });
    assert.equal((await ask(sessionFor(READERS.leadOfOne))).status, 403);
  });

  test("a view-as session is the member's own session: the member's menu, nothing of the admin's", async () => {
    // The route asks only the session, which in a view-as session is the
    // member's; it never reads the marker, so it can give nothing more.
    const route = read("app", "api", "admissions", "programmes", "menu", "route.ts");
    assert.doesNotMatch(route, /impersonat|getImpersonator|markerIsLive/);
    world.viewAs = true;
    try {
      assert.deepEqual(hrefs((await ask(sessionFor(READERS.leadOfOne))).body.terms), [overview(AGI)]);
    } finally {
      world.viewAs = false;
    }
  });

  test("nobody is given a programme the Programmes list would not let them open, a name, or anything else", async () => {
    const applicants = ["amara", "dev", "bea", "tariq", "wen"];
    const people = [...applicants, "claudia", "tess", "lloyd", "zach"].flatMap((uid) => [
      ...(CAST[uid]?.displayName ?? "").split(" ").filter(Boolean),
      CAST[uid]?.email,
      uid,
    ]).filter(Boolean);
    for (const uid of Object.values(READERS)) {
      const session = sessionFor(uid);
      const { value: terms, wrote } = await menuOf(session);
      const list = await loadProgrammesList(world.db, session, WEEK_THREE);
      const opens = list.terms.flatMap((term) => term.programmes.filter((card) => card.opensGroups).map((card) => card.open.href));
      assert.deepEqual(hrefs(terms), opens, `${uid}: the menu and the list disagree`);
      for (const term of terms) {
        assert.deepEqual(Object.keys(term).sort(), ["heading", "programmes"]);
        for (const programme of term.programmes) assert.deepEqual(Object.keys(programme).sort(), ["href", "name", "review"]);
      }
      const json = JSON.stringify(terms);
      for (const word of people) {
        assert.ok(!new RegExp(`\\b${word.replace(/[.@]/g, "\\$&")}\\b`).test(json), `${uid}'s menu names ${word}`);
      }
      assert.equal(wrote, false, `${uid}'s menu wrote something`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The words
// ---------------------------------------------------------------------------

describe("2. the term's heading and Review", () => {
  test("the suffix: applying while the form takes applications, deciding while it decides, nothing otherwise", () => {
    assert.deepEqual(
      ["draft", "opens-later", "open", "deciding", "decided", "settled"].map((stage) => menuHeadingFor("Spring 2027", stage)),
      ["Spring 2027", "Spring 2027", "Spring 2027 · applying", "Spring 2027 · deciding", "Spring 2027", "Spring 2027"],
    );
  });

  test("while applications are open: the heading says so, and Review is the lead's own count, as the list counts it", async () => {
    openTheForm();
    const session = sessionFor(READERS.leadOfOne);
    const { value: terms } = await menuOf(session);
    assert.equal(terms[0].heading, "Autumn 2026 · applying");
    const list = await loadProgrammesList(world.db, session, WEEK_THREE);
    const card = list.terms[0].programmes.find((p) => p.id === AGI);
    assert.equal(terms[0].programmes[0].review, card.waiting);
    assert.equal(card.review === null ? 0 : Number(card.review.label.replace("Review ", "")), card.waiting);
  });

  test("while it decides: deciding", async () => {
    world.db.poke(formPath, { status: "open", decisionsSentAt: null, closesAt: new Date("2026-11-01T23:59:00Z") });
    const { value: terms } = await menuOf(sessionFor(READERS.leadOfOne));
    assert.equal(terms[0].heading, "Autumn 2026 · deciding");
  });

  test("an admin who leads none of them is offered no Review, and the applications are not read for them", async () => {
    openTheForm();
    const { value: terms, reads } = await menuOf(sessionFor(READERS.admin));
    assert.ok(terms[0].programmes.every((p) => p.review === 0));
    assert.ok(!reads.queries.some((q) => q.startsWith("admissionApplications") || q.startsWith("admissionDecisions")));
  });

  test("a term that is over leaves the menu", async () => {
    world.db.poke(formPath, { archived: true });
    assert.deepEqual((await menuOf(sessionFor(READERS.admin))).value, []);
  });
});

// ---------------------------------------------------------------------------
// 3. What the route reads
// ---------------------------------------------------------------------------

describe("3. what the menu reads", () => {
  // The world: one form, three programmes, two naming runs (AGI Strategy with three groups, TAIS with none).
  test("past decision day: the forms, the runs and their groups, and nothing of the cards' figures", async () => {
    const admin = (await menuOf(sessionFor(READERS.admin))).reads;
    assert.deepEqual(admin, {
      queries: ["admissionRounds formVersion", "courseGroups runId", "courseGroups runId"],
      // One form and AGI Strategy's three groups.
      queryDocs: 4,
      counts: 0,
      docs: 0,
      // The two runs, and no names, seats, weeks or registers.
      getAll: 2,
    });
    // A lead pays the same: the term's end asks every run on it.
    assert.deepEqual((await menuOf(sessionFor(READERS.leadOfOne))).reads, admin);
    // A reviewer who leads nothing: the forms, and nothing more.
    assert.deepEqual((await menuOf(sessionFor(READERS.reviewer))).reads, {
      queries: ["admissionRounds formVersion"],
      queryDocs: 1,
      counts: 0,
      docs: 0,
      getAll: 0,
    });
  });

  test("lighter than the Programmes list for every reader", async () => {
    for (const uid of [READERS.admin, READERS.leadOfOne, READERS.leadOfTwo, READERS.reviewer]) {
      const menu = (await menuOf(sessionFor(uid))).reads;
      const list = (await counted((db) => loadProgrammesList(db, sessionFor(uid), WEEK_THREE))).reads;
      const total = (r) => r.queryDocs + r.counts + r.docs + r.getAll;
      assert.ok(total(menu) < total(list), `${uid}: the menu read ${total(menu)}, the list ${total(list)}`);
    }
  });

  test("while applications are open: the applications only for a lead, and the runs not at all", async () => {
    openTheForm();
    assert.deepEqual((await menuOf(sessionFor(READERS.admin))).reads.queries, ["admissionRounds formVersion"]);
    assert.deepEqual((await menuOf(sessionFor(READERS.leadOfOne))).reads.queries, [
      "admissionRounds formVersion",
      "admissionApplications roundId",
      "admissionDecisions roundId",
    ]);
  });

  test("a failed read of the applications leaves Review at nothing and the menu up", async () => {
    openTheForm();
    const collection = world.db.collection;
    world.db.collection = (path) => {
      if (path === "admissionApplications") throw new Error("unavailable");
      return collection(path);
    };
    try {
      const terms = await loadProgrammesMenu(world.db, sessionFor(READERS.leadOfOne), WEEK_THREE);
      assert.deepEqual(terms, [{ heading: "Autumn 2026 · applying", programmes: [{ name: "AGI Strategy", href: overview(AGI), review: 0 }] }]);
    } finally {
      world.db.collection = collection;
    }
  });

  test("a failed read of the forms is a 500 with nothing in it, which the shell reads as no answer", async () => {
    const collection = world.db.collection;
    world.db.collection = () => {
      throw new Error("unavailable");
    };
    try {
      const { status, body } = await ask(sessionFor(READERS.admin));
      assert.equal(status, 500);
      assert.deepEqual(Object.keys(body), ["error"]);
      assert.deepEqual(parseProgrammesMenu(body), []);
    } finally {
      world.db.collection = collection;
    }
  });

  test("the runs are read only past decision day, and a run's groups only when it is not marked over", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const { reads } = await menuOf(sessionFor(READERS.admin));
    assert.deepEqual(reads.queries, ["admissionRounds formVersion", "courseGroups runId"]);
  });
});

// ---------------------------------------------------------------------------
// 4. The menu without an answer
// ---------------------------------------------------------------------------

const GOOD = {
  terms: [
    { heading: "Autumn 2026", programmes: [{ name: "AGI Strategy", href: overview(AGI), review: 0 }] },
    { heading: "Spring 2027 · applying", programmes: [{ name: "AGI Strategy", href: "/admin/admissions/forms/spring/programmes/agi/overview", review: 3 }] },
  ],
};
const answering = (status, body) => async () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** `askProgrammesMenu` with the browser's fetch stood in for by `fetcher`. */
async function askWith(fetcher, waitMs) {
  const real = globalThis.fetch;
  globalThis.fetch = fetcher;
  try {
    return await askProgrammesMenu(waitMs);
  } finally {
    globalThis.fetch = real;
  }
}

describe("4. until it answers, and if it never does, the menu is today's", () => {
  test("no answer yet, and no programmes: the menu is APP_NAV itself", () => {
    assert.equal(menuFor([], []), APP_NAV);
  });

  test("a good answer is drawn as given", async () => {
    assert.deepEqual(await askWith(answering(200, GOOD)), GOOD.terms);
  });

  test("a failed request, a refusal, a server error and an answer that is not one are all no programmes", async () => {
    const failing = async () => {
      throw new Error("offline");
    };
    assert.deepEqual(await askWith(failing), []);
    assert.deepEqual(await askWith(answering(403, { error: "no" })), []);
    assert.deepEqual(await askWith(answering(500, GOOD)), [], "an error status was drawn from");
    assert.deepEqual(await askWith(answering(200, "<html>")), []);
    assert.deepEqual(
      await askWith(async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("bad"); } })),
      [],
    );
  });

  test("a slow answer is let go: no programmes, and the request is aborted", async () => {
    let signal = null;
    const hanging = (url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    };
    assert.deepEqual(await askWith(hanging, 20), []);
    assert.equal(signal.aborted, true);
  });

  test("an answer is held to what the menu may draw: an Overview's address, a name, a whole Review count", () => {
    const parsed = parseProgrammesMenu({
      terms: [
        {
          heading: "Autumn 2026",
          programmes: [
            { name: "Elsewhere", href: "https://example.com/admin/admissions/forms/x/programmes/y/overview", review: 0 },
            { name: "Applications", href: "/admin/admissions/forms/x/programmes/y/applications", review: 0 },
            { name: "", href: "/admin/admissions/forms/x/programmes/y/overview", review: 0 },
            { name: "Kept", href: "/admin/admissions/forms/x/programmes/y/overview", review: -2, lead: "Someone" },
          ],
        },
        { heading: "", programmes: [{ name: "No heading", href: "/admin/admissions/forms/x/programmes/z/overview", review: 1 }] },
        { heading: "Empty", programmes: [] },
      ],
      extra: true,
    });
    assert.deepEqual(parsed, [{ heading: "Autumn 2026", programmes: [{ name: "Kept", href: "/admin/admissions/forms/x/programmes/y/overview", review: 0 }] }]);
  });

  test("the shell asks once, only for somebody the Programmes entry is drawn for, and keeps nothing in the browser", () => {
    const shell = read("layout", "AppShell.tsx");
    assert.match(shell, /const programmeTerms = useProgrammesMenu\(role === "admin" \|\| admissionsReviewer\);/);
    const hook = read("features", "applications", "programmes", "useProgrammesMenu.ts");
    assert.match(hook, /const asks = uid !== null && couldHave;/);
    assert.match(hook, /\}, \[asks, uid\]\);/);
    assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB|document\.cookie/);
    // No spinner, no placeholder: nothing is drawn for the entries until they come.
    assert.doesNotMatch(hook, /loading|Skeleton|spinner/i);
  });
});

// ---------------------------------------------------------------------------
// 5. Home
// ---------------------------------------------------------------------------

describe("5. Home's Programmes card and Applications to read", () => {
  test("an admin: a row for each programme, by term, with where it is and the first thing that needs them", async () => {
    const list = await loadProgrammesList(world.db, sessionFor(READERS.admin), WEEK_THREE);
    const home = homeProgrammesOf(list);
    assert.deepEqual(home.terms.map((term) => [term.heading, term.rows.map((row) => row.href)]), [
      ["Autumn 2026 · running", [overview(TAIS), overview(AGI), overview(INCUBATOR)]],
    ]);
    const agi = home.terms[0].rows.find((row) => row.id === AGI);
    assert.deepEqual([agi.name, agi.kind, agi.detail], ["AGI Strategy", "Fellowship", "Week 3 of 6"]);
    assert.equal(agi.needsYou, list.terms[0].programmes.find((p) => p.id === AGI).needsYou);
    // Past decision day nothing is waiting to be read, so the row is not given a figure.
    assert.equal(home.toRead, null);

    const html = await drawCard(home);
    const words = text(html);
    assert.match(words, /^Programmes All programmes All Autumn 2026 · running /);
    assert.match(words, /AGI Strategy Fellowship · Week 3 of 6 Week 3 of 6 Week 3 isn’t ready, and /);
    assert.ok(html.includes(`<a href="${overview(AGI)}" class="secondary">Open<span class="srOnly"> AGI Strategy</span></a>`));
    assert.ok(html.includes(`<a href="/admin/admissions/programmes" class="headLink">`));
  });

  test("a lead: 'Your programmes', and only the ones they lead", async () => {
    const home = homeProgrammesOf(await loadProgrammesList(world.db, sessionFor(READERS.leadOfTwo), WEEK_THREE));
    assert.deepEqual(home.terms[0].rows.map((row) => row.href), [overview(TAIS), overview(INCUBATOR)]);
    const words = text(await drawCard(home, "Your programmes"));
    assert.match(words, /^Your programmes All programmes All Autumn 2026 · running Technical AI Safety /);
    assert.ok(!words.includes("AGI Strategy"), "a lead was shown somebody else's programme");
  });

  test("a reviewer, and a list that could not be read: no card at all", async () => {
    const home = homeProgrammesOf(await loadProgrammesList(world.db, sessionFor(READERS.reviewer), WEEK_THREE));
    assert.deepEqual(home.terms, []);
    assert.equal(await drawCard(home), "");
    assert.equal(await drawCard(null), "");
  });

  test("while applications are open: the lead's row says how many are theirs to read", async () => {
    openTheForm();
    const list = await loadProgrammesList(world.db, sessionFor(READERS.leadOfOne), WEEK_THREE);
    const waiting = list.terms[0].programmes[0].waiting;
    const home = homeProgrammesOf(list);
    assert.equal(home.terms[0].heading, "Autumn 2026 · taking applications");
    const expected = waiting === 0 ? null : `${waiting} ${waiting === 1 ? "application" : "applications"} for you to read`;
    assert.equal(home.terms[0].rows[0].detail, expected);
  });

  test("an admin's Applications to read: their own Review counts, opening the term's page", async () => {
    openTheForm();
    // An admin who leads nothing: no figure, and the term's page all the same.
    const asAdmin = homeProgrammesOf(await loadProgrammesList(world.db, sessionFor(READERS.admin), WEEK_THREE));
    assert.deepEqual(asAdmin.toRead, { count: 0, line: null, href: HOME });
    // An admin who leads AGI Strategy: the programme's waiting applications are theirs.
    world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "zach" });
    const list = await loadProgrammesList(world.db, sessionFor(READERS.admin), WEEK_THREE);
    const waiting = list.terms[0].programmes.find((p) => p.id === AGI).waiting;
    const toRead = homeProgrammesOf(list).toRead;
    assert.equal(toRead.count, waiting);
    assert.equal(toRead.href, HOME);
    assert.equal(toRead.line, waiting > 0 ? `Autumn 2026: ${waiting} for AGI Strategy.` : null);
  });

  test("the page asks only for an admin or somebody named on a form, never in a view-as session, and never waits on it", () => {
    const page = read("app", "(app)", "dashboard", "page.tsx");
    assert.match(page, /const programmes = user && db && !viewingAs && readsProgrammesFor\(user\) \? programmesOf\(db, user, now\) : null;/);
    assert.match(page, /<Suspense fallback=\{null\}>\s*<ProgrammesHome programmes=\{programmes\}/);
    assert.doesNotMatch(page, /await programmes|await programmesOf/);
    // The loader never rejects, so neither the card nor the To do row can throw.
    const loader = page.slice(page.indexOf("async function programmesOf"), page.indexOf("/** \"Morning\""));
    assert.match(loader, /try \{[\s\S]*\} catch \(err\) \{[\s\S]*return null;/);
    assert.match(page, /title=\{user\?\.role === "admin" \? "Programmes" : "Your programmes"\}/);
    // A lead's Home: the card first, before everything under the greeting, in every form.
    assert.match(page, /<HomeMember[\s\S]*?programmes=\{programmesCard\}/);
    const member = read("app", "(app)", "dashboard", "HomeMember.tsx");
    assert.equal((member.match(/\{programmes\}\s*\{invite\}/g) ?? []).length, 3, "a form of a member's Home draws the card after something");
  });

  test("an admin's Home draws the card first, and Applications to read is today's row until the list answers", () => {
    const home = read("app", "(app)", "dashboard", "HomeAdmin.tsx");
    const stack = home.indexOf("{programmes}");
    assert.ok(stack > 0 && stack < home.indexOf("<HomeAdminFacilitating"), "the Programmes card is not first");
    assert.match(home, /<Suspense key=\{item\.key\} fallback=\{<TodoRow item=\{item\} primary=\{index === 0\} \/>\}>/);
    assert.match(home, /const answer = use\(toRead\);\s+if \(!answer\) return <TodoRow item=\{item\} primary=\{primary\} \/>;/);
    // The row's own fallback still opens the list of forms with no figure.
    assert.match(home, /figure: null,\s+title: "Applications to read",[\s\S]{0,200}href: "\/admin\/admissions\/forms",/);
  });
});
