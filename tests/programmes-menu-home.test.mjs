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
    "export default ({ href, className, children, ...rest }) => globalThis.__programmesMenuUi.h('a', { href, className, 'aria-label': rest['aria-label'] }, children);",
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
const { APP_NAV, menuFor, reviewWords } = await loadTs(join("layout", "appNav.ts"));
const { PROGRAMMES_PATH } = await loadTs(join("lib", "applications", "programmes", "path.ts"));

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

/**
 * Decision day not yet sent, applications closed, and two of AGI Strategy's
 * applicants (Dev and Bea) still owed a decision by its lead: two
 * applications waiting for Claudia's reading, and for nobody else's.
 */
async function twoWaitForTheLead() {
  world.db.poke(formPath, { status: "open", decisionsSentAt: null, closesAt: new Date("2026-11-01T23:59:00Z") });
  for (const uid of ["dev", "bea"]) {
    await world.db.collection("admissionDecisions").doc(`${ROUND}__${uid}`).delete();
    world.db.poke(`admissionApplications/${ROUND}__${uid}`, { status: "submitted", result: null });
  }
}

/** The card the Programmes list gives `uid` for one programme. */
async function cardOf(uid, programmeId) {
  const list = await loadProgrammesList(world.db, sessionFor(uid), WEEK_THREE);
  return list.terms.flatMap((term) => term.programmes).find((p) => p.id === programmeId) ?? null;
}

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

  test("every answer, refusals and failures included, is one person's: private, no-store", async () => {
    const headersOf = async (session) => {
      world.user = session;
      try {
        return (await GET()).headers;
      } finally {
        world.user = null;
      }
    };
    for (const session of [null, sessionFor(READERS.member), sessionFor(READERS.leadOfOne), sessionFor(READERS.admin)]) {
      assert.equal((await headersOf(session))["Cache-Control"], "private, no-store");
    }
    const collection = world.db.collection;
    world.db.collection = () => {
      throw new Error("unavailable");
    };
    try {
      assert.equal((await headersOf(sessionFor(READERS.admin)))["Cache-Control"], "private, no-store");
    } finally {
      world.db.collection = collection;
    }
  });

  test("somebody taken off every form whose flag is still set: answered no terms after one query", async () => {
    world.db.poke("users/nadia", { admissionsReviewer: true });
    const { value, reads } = await counted(() => ask(sessionFor("nadia")));
    assert.deepEqual([value.status, value.body], [200, { terms: [] }]);
    assert.deepEqual(reads.queries, ["admissionRounds formVersion"]);
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

  test("Review N is the lead's own N, in the route's answer and on the menu's entry", async () => {
    await twoWaitForTheLead();
    const lead = await ask(sessionFor(READERS.leadOfOne));
    assert.deepEqual(lead.body.terms, [
      { heading: "Autumn 2026 · deciding", programmes: [{ name: "AGI Strategy", href: overview(AGI), review: 2 }] },
    ]);
    // The same N the Programmes list and the term's page give the lead.
    assert.equal((await cardOf(READERS.leadOfOne, AGI)).waiting, 2);
    const entry = menuFor([], lead.body.terms)[1].entries.find((each) => each.href === overview(AGI));
    assert.deepEqual([entry.review, reviewWords(entry.review)], [2, "Review 2"]);
  });

  test("an admin who leads nothing gets no Review on the lead's programme, and another lead none either", async () => {
    await twoWaitForTheLead();
    const admin = (await ask(sessionFor(READERS.admin))).body.terms[0].programmes;
    assert.deepEqual(admin.map((p) => [p.href, p.review]), [
      [overview(TAIS), 0],
      [overview(AGI), 0],
      [overview(INCUBATOR), 0],
    ]);
    const entries = menuFor([], (await ask(sessionFor(READERS.admin))).body.terms).flatMap((group) => group.entries);
    assert.ok(entries.every((each) => each.review === undefined), "an admin who leads nothing was drawn a Review");
    // The lead of the other two: not given AGI Strategy at all, and no Review on theirs.
    const other = (await ask(sessionFor(READERS.leadOfTwo))).body.terms[0].programmes;
    assert.deepEqual(other.map((p) => [p.href, p.review]), [
      [overview(TAIS), 0],
      [overview(INCUBATOR), 0],
    ]);
    // An admin who leads ANOTHER programme on the term, so the term's numbers
    // are read for them: still no Review on the one they do not lead, in the
    // menu, on the Programmes list or on Home.
    world.db.poke(formPath, { [`programmes.${TAIS}.leadUid`]: "zach" });
    const leadsOther = (await ask(sessionFor(READERS.admin))).body.terms[0].programmes.find((p) => p.href === overview(AGI));
    assert.equal(leadsOther.review, 0, "an admin was given a Review on a programme somebody else leads");
    const agiCard = await cardOf(READERS.admin, AGI);
    assert.deepEqual([agiCard.waiting, agiCard.review], [0, null]);
    const agiRow = homeProgrammesOf(await loadProgrammesList(world.db, sessionFor(READERS.admin), WEEK_THREE, { groupsOnly: true }))
      .terms[0].rows.find((row) => row.id === AGI);
    assert.doesNotMatch(agiRow.detail ?? "", /for you to read/);
    // Once the admin leads it, the two are theirs.
    world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "zach" });
    const leading = (await ask(sessionFor(READERS.admin))).body.terms[0].programmes.find((p) => p.href === overview(AGI));
    assert.equal(leading.review, 2);
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
  test("two programmes of one name under two terms are told apart to a screen reader by their term", () => {
    const entries = menuFor([], GOOD.terms)[1].entries.filter((each) => each.nested);
    assert.deepEqual(entries.map((each) => [each.label, each.spoken]), [
      ["AGI Strategy", "Autumn 2026"],
      ["AGI Strategy", "Spring 2027 · applying"],
    ]);
    const single = menuFor([], [GOOD.terms[0]])[1].entries.filter((each) => each.nested);
    assert.equal(single[0].spoken, undefined, "a name listed once carries its term too");
    const shell = read("layout", "AppShell.tsx");
    assert.match(shell, /\{entry\.spoken && <span className=\{styles\.srOnly\}>, \{entry\.spoken\}<\/span>\}/);
  });

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

  test("a request the shell lets go of (the account changed, the shell went) is aborted and answers nothing", async () => {
    let signal = null;
    const hanging = (url, init) => {
      signal = init.signal;
      return new Promise(() => {});
    };
    const real = globalThis.fetch;
    globalThis.fetch = hanging;
    try {
      const shell = new AbortController();
      const asked = askProgrammesMenu(60_000, shell.signal);
      shell.abort();
      assert.equal(signal.aborted, true);
      // The shell's own flag drops whatever comes back; the wait still ends it.
      void asked;
    } finally {
      globalThis.fetch = real;
    }
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
    // Asked again, and the old answer dropped, when the account or its role changes without a reload.
    assert.match(hook, /\}, \[asks, uid, role\]\);/);
    assert.match(hook, /return asks && answer\?\.uid === uid && answer\.role === role \? answer\.terms : NO_TERMS;/);
    assert.match(hook, /cancelled = true;\s+controller\.abort\(\);/);
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
    assert.ok(html.includes(`<a href="/admin/admissions/programmes" class="headLink" aria-label="All programmes">`));
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

  const homeOf = async (uid) =>
    homeProgrammesOf(await loadProgrammesList(world.db, sessionFor(uid), WEEK_THREE, { groupsOnly: true }));

  test("while applications are decided: the lead's row says how many are theirs to read", async () => {
    await twoWaitForTheLead();
    const home = await homeOf(READERS.leadOfOne);
    assert.equal(home.terms[0].heading, "Autumn 2026 · deciding");
    assert.equal(home.terms[0].rows[0].detail, "2 applications for you to read");
    // Nothing waits for an admin who leads nothing, so their row says nothing of reading.
    const asAdmin = await homeOf(READERS.admin);
    assert.ok(asAdmin.terms[0].rows.every((row) => !/for you to read/.test(row.detail ?? "")), JSON.stringify(asAdmin.terms[0].rows));
  });

  test("an admin's Applications to read: their own Review counts, opening the term's page", async () => {
    await twoWaitForTheLead();
    // An admin who leads nothing: no figure, and the term's page all the same.
    assert.deepEqual((await homeOf(READERS.admin)).toRead, { count: 0, line: null, href: HOME });
    // An admin who leads AGI Strategy: its two waiting applications are theirs.
    world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "zach" });
    assert.deepEqual((await homeOf(READERS.admin)).toRead, { count: 2, line: "Autumn 2026: 2 for AGI Strategy.", href: HOME });
  });

  test("Applications to read opens the Programmes page when two terms have applications for the reader, a term's page when one does", () => {
    const card = (shortName, waiting) => ({ id: shortName, shortName, kindWord: "Fellowship", opensGroups: true, waiting, week: null, noLead: false, line: null, needsYou: null, open: { label: "", href: "/x" }, review: null });
    const term = (id, label, stage, programmes) => ({ id, label, stage, line: "", href: `/admin/admissions/forms/${id}`, pageLabel: "", programmes });
    const list = (terms) => ({ terms, earlier: [], reader: "admin", anyForm: true });
    const two = homeProgrammesOf(list([
      term("a", "Autumn 2026", "Deciding", [card("AGI Strategy", 2)]),
      term("s", "Spring 2027", "Taking applications", [card("AGI Strategy", 3), card("Alignment", 1)]),
    ])).toRead;
    assert.deepEqual(two, { count: 6, line: "Autumn 2026: 2 for AGI Strategy. Spring 2027: 3 for AGI Strategy and 1 for Alignment.", href: PROGRAMMES_PATH });
    const one = homeProgrammesOf(list([
      term("a", "Autumn 2026", "Deciding", [card("AGI Strategy", 0)]),
      term("s", "Spring 2027", "Taking applications", [card("AGI Strategy", 3)]),
    ])).toRead;
    assert.equal(one.href, "/admin/admissions/forms/s");
    // None waiting: the one term taking or deciding applications, or the Programmes page for two.
    assert.equal(homeProgrammesOf(list([term("s", "Spring 2027", "Deciding", [card("A", 0)])])).toRead.href, "/admin/admissions/forms/s");
    assert.equal(
      homeProgrammesOf(list([term("a", "Autumn 2026", "Deciding", [card("A", 0)]), term("s", "Spring 2027", "Taking applications", [card("B", 0)])])).toRead.href,
      PROGRAMMES_PATH,
    );
  });

  test("a reviewer's Home reads the forms and stops: nothing past them, even while a term is decided", async () => {
    await twoWaitForTheLead();
    for (const uid of [READERS.reviewer, "nadia"]) {
      if (uid === "nadia") world.db.poke("users/nadia", { admissionsReviewer: true });
      const { value, reads } = await counted((db) => loadProgrammesList(db, sessionFor(uid), WEEK_THREE, { groupsOnly: true }));
      assert.deepEqual(homeProgrammesOf(value).terms, [], uid);
      assert.deepEqual(reads, { queries: ["admissionRounds formVersion"], queryDocs: 1, counts: 0, docs: 0, getAll: 0 }, uid);
    }
    // The Programmes page itself still gives the reviewer the card they review.
    assert.ok(await cardOf(READERS.reviewer, AGI));
  });

  test("a row with no detail draws its kind on a laptop and no line at all on a phone; All is All programmes to a screen reader", async () => {
    const html = await drawCard({
      terms: [{ id: "t", heading: "Autumn 2026 · running", rows: [{ id: "i", name: "Alignment", kind: "Incubator", detail: null, needsYou: null, href: "/o" }] }],
      toRead: null,
    });
    assert.ok(html.includes('<p class="small wide">Incubator</p>'), html);
    assert.ok(!html.includes("narrow\"></span>") && !/<p class="small"><span class="wide">/.test(html), html);
    assert.ok(html.includes('class="headLink" aria-label="All programmes"'), html);
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
    // Home reads only the programmes whose groups the reader opens.
    assert.match(page, /loadProgrammesList\(db, user, now, \{ groupsOnly: true \}\)/);
    // A lead's Home: the card straight after the policy line, in the one fragment every form draws under the greeting
    // (held as drawn by tests/applications-place-in-the-member-area.test.mjs).
    assert.match(page, /<PolicyUpdate line=\{policyUpdateLine\(now\)\} \/>\s*\{user\?\.role !== "admin" && programmesCard\}/);
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
