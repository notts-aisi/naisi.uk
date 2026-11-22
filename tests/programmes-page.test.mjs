/**
 * The Programmes page, the term's page and a programme's own address, as
 * every kind of reader.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/programmes                                  the Programmes page
 *   /admin/admissions/forms/[roundId]                             the term's page
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]    a programme's own address
 *
 * ## What this guards
 *
 *  1. WHO IS GIVEN WHAT, ON THE SERVER. The list (`loadProgrammesList`) holds
 *     an admin every programme, a lead the ones they lead, a reviewer the
 *     ones they review, and a member, a facilitator and a run's track lead
 *     nothing; and nothing in it names an applicant.
 *  2. THE CARDS' WORDS. The run's line for the lead and admins, the
 *     applications line for a reviewer, "Lead: you", the first button and
 *     "Review N" only on a programme the reader leads or reviews; the
 *     needs-you line is the Overview's own sentence.
 *  3. WHEN A TERM IS OVER, with its edge cases: a programme with no run, a
 *     run with no groups, an archived group that held the last session, a
 *     run marked completed.
 *  4. WHAT IT READS, counted for an admin, a lead and a reviewer, and that it
 *     writes nothing.
 *  5. THE PAGES: the Programmes page and its empty state, the term's page's
 *     title, crumb and first button, and a programme's own address, which
 *     forwards only somebody with a role on the programme.
 *
 * Real: the pages (server components), the tree's gate, the loaders and the
 * Overview. Faked: the session, the Admin SDK handle, `next/link`,
 * `next/navigation` and the stylesheets.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CAST, COURSE, makeWorld } from "./lib/handoverWorld.mjs";
import { AGI, A, B, C, ROUND, RUN, TAIS, formPath, leadSeed, slot } from "./lib/leadWorld.mjs";
import { INCUBATOR } from "./lib/applicationsSmallTerm.mjs";

const ui = { h: createElement };
globalThis.__programmesPageUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const STYLESHEETS = [
  "@/features/applications/editor/editor.module.css",
  "@/features/applications/editor/FormHome.module.css",
  "@/features/applications/editor/ProgrammesList.module.css",
  "@/features/applications/kit/kit.module.css",
  "./editor.module.css",
  "./FormHome.module.css",
  "./TermHome.module.css",
  "./TermState.module.css",
  "./InitialsChip.module.css",
  "./kit.module.css",
  "./Modal.module.css",
  "./Button.module.css",
  "./Dropdown.module.css",
  "./ActionToast.module.css",
  "./lifecycle.module.css",
  "./Select.module.css",
];

const made = makeWorld("__programmesPage", [
  // The gates import the session by its relative name.
  ["./session", "export async function getCurrentUser() { return globalThis.__programmesPage.user; }"],
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }\n" +
      "export function usePathname() { return '/'; }",
  ],
  [
    "next/link",
    "export default ({ href, className, children }) => globalThis.__programmesPageUi.h('a', { href, className }, children);",
  ],
  ...STYLESHEETS.map((path) => [path, CLASS_NAMES]),
]);
const { world, reset, loadTs } = made;

const { loadProgrammesList, programmeIsOver, stageWordsFor } = await loadTs(join("lib", "applications", "programmes", "list.ts"));
const { buildProgrammeOverview } = await loadTs(join("lib", "courses", "programmeOverview.ts"));
const { readRunRecords } = await loadTs(join("lib", "courses", "programmeAttendance.ts"));
const { default: ProgrammesPage } = await loadTs(join("app", "(app)", "admin", "admissions", "programmes", "page.tsx"));
const { default: TermPage } = await loadTs(join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "page.tsx"));
const { default: ProgrammeAddressPage } = await loadTs(
  join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "page.tsx"),
);

const HOME = `/admin/admissions/forms/${ROUND}`;
const at = (programmeId, tab) => `${HOME}/programmes/${programmeId}/${tab}`;

/** Thu 12 Nov 2026, noon: week 3 of AGI Strategy's six, every group past its week 2 session. */
const WEEK_THREE = new Date("2026-11-12T12:00:00Z");

/** The session `getCurrentUser()` builds from the stored account, with the reviewer flag the roles writer keeps. */
function sessionFor(uid) {
  const base = made.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: world.db.read(`users/${uid}`)?.admissionsReviewer === true };
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

/** What the list holds for `uid`, with every read it made counted, at `now`. */
async function listFor(uid, now = WEEK_THREE) {
  const reads = { queries: [], docs: 0, getAll: 0 };
  const db = world.db;
  const collection = db.collection;
  const getAll = db.getAll;
  db.collection = (path) => {
    const ref = collection(path);
    const where = ref.where.bind(ref);
    const doc = ref.doc.bind(ref);
    return Object.assign(Object.create(ref), {
      where: (...args) => {
        reads.queries.push(`${path} ${args[0]}`);
        return where(...args);
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
    const list = await loadProgrammesList(db, sessionFor(uid), now);
    return { list, reads, wrote: made.everything() !== before };
  } finally {
    db.collection = collection;
    db.getAll = getAll;
  }
}

const ids = (list) => list.terms.map((term) => [term.label, term.programmes.map((p) => p.id)]);
const card = (list, id) => list.terms.flatMap((term) => term.programmes).find((p) => p.id === id);

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** A page as `who` sees it: its HTML, or where it sent them. */
async function draw(Page, who, params = {}) {
  world.user = who === null ? null : sessionFor(who);
  try {
    const element = await Page({ params: Promise.resolve({ roundId: ROUND, ...params }) });
    const html = renderToStaticMarkup(element);
    return { html, text: text(html), to: null };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { html: "", text: "", to: err.to };
  } finally {
    world.user = null;
  }
}

mock.timers.enable({ apis: ["Date"], now: WEEK_THREE });

beforeEach(() => {
  reset(leadSeed());
  globalThis.__programmesPage.db = world.db;
  // Appointing a lead or a reviewer sets the flag the admissions tree reads.
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
  mock.timers.setTime(WEEK_THREE.getTime());
});

// ---------------------------------------------------------------------------
// 1. Who is given what
// ---------------------------------------------------------------------------

describe("1. the list holds the programmes each reader may open, and nobody else's", () => {
  test("an admin: every programme on the term, in the form's order", async () => {
    const { list } = await listFor(READERS.admin);
    assert.deepEqual(ids(list), [["Autumn 2026", [TAIS, AGI, INCUBATOR]]]);
    assert.equal(list.reader, "admin");
  });

  test("the lead of one programme: that programme alone", async () => {
    const { list } = await listFor(READERS.leadOfOne);
    assert.deepEqual(ids(list), [["Autumn 2026", [AGI]]]);
    assert.equal(list.reader, "lead");
  });

  test("the lead of two: both, and only those", async () => {
    const { list } = await listFor(READERS.leadOfTwo);
    assert.deepEqual(ids(list), [["Autumn 2026", [TAIS, INCUBATOR]]]);
  });

  test("a reviewer of one programme: the programme they review", async () => {
    const { list } = await listFor(READERS.reviewer);
    assert.deepEqual(ids(list), [["Autumn 2026", [AGI]]]);
    assert.equal(list.reader, "reviewer");
  });

  for (const who of ["trackLead", "facilitator", "member"]) {
    test(`a ${who}: nothing, and no form read past its listing`, async () => {
      const { list, reads } = await listFor(READERS[who]);
      assert.deepEqual(list, { terms: [], earlier: [], reader: "none" });
      assert.deepEqual(reads.queries, ["admissionRounds formVersion"]);
      assert.equal(reads.getAll, 0);
    });
  }

  test("nothing in any reader's list names an applicant, and nothing is written", async () => {
    const applicants = ["amara", "dev", "bea", "tariq", "wen"];
    const words = applicants.flatMap((uid) => [...CAST[uid].displayName.split(" "), CAST[uid].email, uid]);
    for (const uid of Object.values(READERS)) {
      const { list, wrote } = await listFor(uid);
      const json = JSON.stringify(list);
      for (const word of words) {
        assert.ok(!new RegExp(`\\b${word.replace(/[.@]/g, "\\$&")}\\b`).test(json), `${uid}'s list names ${word}`);
      }
      assert.equal(wrote, false, `${uid}'s list wrote something`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. The cards' words
// ---------------------------------------------------------------------------

describe("2. each card says what the reader may know of it", () => {
  test("an admin's term: Running, today's sentence, a link to the term's page", async () => {
    const { list } = await listFor(READERS.admin);
    const [term] = list.terms;
    assert.deepEqual(
      [term.stage, term.line, term.href, term.pageLabel],
      ["Running", "Every decision went out on Fri 23 Oct.", HOME, "Autumn 2026’s term page"],
    );
  });

  test("the lead's card: where the run is, its groups, who holds a place, and the Overview's first line", async () => {
    const { list } = await listFor(READERS.leadOfOne);
    const agi = card(list, AGI);
    assert.deepEqual(
      [agi.kindWord, agi.name, agi.lead, agi.line],
      ["Fellowship", "AGI Strategy Fellowship", "Lead: you", "Week 3 of 6 · 3 groups · 4 holding a place"],
    );
    assert.deepEqual(agi.open, { label: "Open AGI Strategy", href: at(AGI, "overview") });
    assert.equal(agi.review, null);

    // The line is the Overview's own: its first week or register line, word for word.
    const records = await readRunRecords(world.db, RUN.agi);
    const overview = await buildProgrammeOverview(
      world.db,
      records,
      { isAdmin: false, uid: "claudia", role: "committee" },
      { programmePath: `${HOME}/programmes/${AGI}`, courseId: COURSE.agi, decisionsSentAt: null },
      WEEK_THREE,
    );
    const first = overview.attention.find((item) => item.kind === "week" || item.kind === "register");
    assert.ok(first, "the world was meant to hold a week a group has reached");
    assert.equal(agi.needsYou, first.title);
    assert.match(agi.needsYou, /^Week 3 isn’t ready, and /);
  });

  test("once week 3 is published for every group, the line is the first register not finished, in the Overview's words", async () => {
    await world.db.collection(`courseRuns/${RUN.agi}/weeks`).doc("w03").set({ weekNumber: 3, title: "Week three", published: true });
    const { list } = await listFor(READERS.leadOfOne);
    const records = await readRunRecords(world.db, RUN.agi);
    const overview = await buildProgrammeOverview(
      world.db,
      records,
      { isAdmin: false, uid: "claudia", role: "committee" },
      { programmePath: `${HOME}/programmes/${AGI}`, courseId: COURSE.agi, decisionsSentAt: null },
      WEEK_THREE,
    );
    const first = overview.attention.find((item) => item.kind === "week" || item.kind === "register");
    assert.equal(first.kind, "register");
    assert.equal(card(list, AGI).needsYou, first.title);
  });

  test("an admin sees the lead's name, and every programme's line, never a Review on somebody else's", async () => {
    const { list } = await listFor(READERS.admin);
    // The lead by the name the term's page prints beside "lead" (`namesOnForm`).
    assert.equal(card(list, AGI).lead, "Lead: Claudia");
    assert.equal(card(list, TAIS).lead, "Lead: Tess");
    // TAIS names a run with no groups yet; the incubator names none.
    assert.equal(card(list, TAIS).line, "Week 3 of 6 · 0 groups · 1 holding a place");
    assert.equal(card(list, INCUBATOR).line, "0 holding a place");
    for (const programme of list.terms[0].programmes) assert.equal(programme.review, null);
  });

  test("a reviewer: the applications line and today's button to them, never the run's line", async () => {
    const { list } = await listFor(READERS.reviewer);
    const agi = card(list, AGI);
    assert.match(agi.line, /^\d+ applications? · (none|\d+) for you to read$/);
    assert.equal(agi.needsYou, null);
    assert.equal(agi.open.href, at(AGI, "applications"));
    assert.ok(["See applications"].includes(agi.open.label) || /^Review \d+$/.test(agi.open.label));
    assert.equal(agi.review, null);
  });

  test("while applications are open: '14 applications · 3 for you to read', and Review beside Open only where it is theirs", async () => {
    world.db.poke(formPath, { status: "open", decisionsSentAt: null, closesAt: new Date("2026-11-30T23:59:00Z") });
    const asLead = (await listFor(READERS.leadOfOne)).list;
    assert.equal(asLead.terms[0].stage, "Taking applications");
    assert.equal(asLead.terms[0].line, "Applications close on Mon 30 Nov.");
    const agi = card(asLead, AGI);
    const [, all, mine] = /^(\d+) applications? · (none|\d+) for you to read$/.exec(agi.line);
    assert.ok(Number(all) > 0);
    if (mine === "none") assert.equal(agi.review, null);
    else assert.deepEqual(agi.review, { label: `Review ${mine}`, href: at(AGI, "applications") });
    assert.equal(agi.open.label, "Open AGI Strategy");

    // An admin who leads none of them: no Review anywhere, and none for them to read.
    const asAdmin = (await listFor(READERS.admin)).list;
    for (const programme of asAdmin.terms[0].programmes) {
      assert.equal(programme.review, null, programme.id);
      assert.match(programme.line, /· none for you to read$/, programme.id);
    }
  });

  test("the stage words, from the form until decision day and from the runs after", () => {
    assert.deepEqual(
      ["draft", "opens-later", "open", "deciding", "decided", "settled"].map((stage) => stageWordsFor(stage, false)),
      ["Not open yet", "Not open yet", "Taking applications", "Deciding", "Starting", "Starting"],
    );
    assert.equal(stageWordsFor("decided", true), "Running");
    assert.equal(stageWordsFor("settled", true), "Running");
  });

  test("before any run has begun the term is Starting, though every run's stored status says something else", async () => {
    mock.timers.setTime(new Date("2026-10-26T12:00:00Z").getTime());
    const { list } = await listFor(READERS.admin, new Date("2026-10-26T12:00:00Z"));
    assert.equal(list.terms[0].stage, "Starting");
    assert.equal(card(list, AGI).line, "3 groups · 4 holding a place");
    assert.equal(card(list, AGI).needsYou, null);
  });
});

// ---------------------------------------------------------------------------
// 3. When a term is over
// ---------------------------------------------------------------------------

/** Wed 9 Dec 2026, 4pm in London: Group C's last session (1pm) is over, and nothing else meets later. */
const AFTER_C = new Date("2026-12-09T16:00:00Z");

describe("3. a term stays until every programme on it is over", () => {
  const closeTheRest = () => {
    // TAIS names a run with no groups, and the incubator no run: both hold the term open until an admin says.
    world.db.poke(`courseRuns/${RUN.tais}`, { status: "completed" });
    world.db.poke(formPath, { [`programmes.${INCUBATOR}.closed`]: true });
  };

  test("a programme that names no run keeps its term in the list, after every other is over", async () => {
    world.db.poke(`courseRuns/${RUN.tais}`, { status: "completed" });
    const { list } = await listFor(READERS.admin, AFTER_C);
    assert.deepEqual(ids(list), [["Autumn 2026", [TAIS, AGI, INCUBATOR]]]);
    assert.deepEqual(list.earlier, []);
  });

  test("a run with no groups is never over by its sessions", async () => {
    world.db.poke(formPath, { [`programmes.${INCUBATOR}.closed`]: true });
    const { list } = await listFor(READERS.admin, AFTER_C);
    assert.equal(list.terms.length, 1);
  });

  test("once the last session of the last live group is over, the term moves to Earlier terms", async () => {
    closeTheRest();
    const { list } = await listFor(READERS.admin, AFTER_C);
    assert.deepEqual(list.terms, []);
    assert.deepEqual(list.earlier, [{ id: ROUND, label: "Autumn 2026", href: HOME }]);
  });

  test("an archived group that held a later session is left out, as the head leaves it out", async () => {
    closeTheRest();
    // A fourth group meets on Wednesdays too, later the same evening as Group C.
    const LATE = "agi-autumn-2026-late__grp00004";
    const late = { ...world.db.read(`courseGroups/${C}`), name: "Group D", session: slot({ weekday: 3, startTimeLocal: "18:00" }) };
    await world.db.collection("courseGroups").doc(LATE).set({ ...late, archived: false });
    assert.equal((await listFor(READERS.admin, AFTER_C)).list.terms.length, 1, "a live group still to meet keeps the term");
    world.db.poke(`courseGroups/${LATE}`, { archived: true });
    assert.equal((await listFor(READERS.admin, AFTER_C)).list.terms.length, 0, "an archived group's later session held it");
  });

  test("an incubator follows the same rule, whatever its weeks", () => {
    const run = (over) => ({ run: { status: "running", ...over }, groups: [], end: { over: false } });
    const incubator = { closed: false, runId: "r" };
    assert.equal(programmeIsOver(incubator, run({})), false);
    assert.equal(programmeIsOver(incubator, { ...run({}), end: { over: true } }), true);
    assert.equal(programmeIsOver(incubator, run({ status: "cancelled" })), true);
    assert.equal(programmeIsOver(incubator, "gone"), true);
    assert.equal(programmeIsOver({ closed: false, runId: null }, undefined), false);
    assert.equal(programmeIsOver({ closed: true, runId: null }, undefined), true);
  });

  test("a cancelled or archived term is over whatever its runs say, and a lead sees their earlier term", async () => {
    world.db.poke(formPath, { archived: true });
    const { list } = await listFor(READERS.leadOfOne);
    assert.deepEqual([list.terms, list.earlier.map((term) => term.label)], [[], ["Autumn 2026"]]);
  });
});

// ---------------------------------------------------------------------------
// 4. What it reads
// ---------------------------------------------------------------------------

describe("4. what the list reads", () => {
  test("an admin, a lead and a reviewer, in week 3", async () => {
    const admin = (await listFor(READERS.admin)).reads;
    const lead = (await listFor(READERS.leadOfOne)).reads;
    const reviewer = (await listFor(READERS.reviewer)).reads;
    // Forms, then the runs the term names in one getAll and the groups of each, then the term's applications and
    // decisions once, and for whoever opens AGI Strategy's groups its registers and the reached week's documents.
    for (const [who, reads] of [["admin", admin], ["lead", lead]]) {
      assert.deepEqual(
        reads.queries.filter((q) => !q.startsWith("courseGroups/") && !q.includes("/weeks")).sort(),
        [
          "admissionApplications roundId",
          "admissionDecisions roundId",
          "admissionRounds formVersion",
          "courseAttendance runId",
          "courseGroups runId",
          "courseGroups runId",
        ],
        who,
      );
    }
    // A reviewer is given no run's line, so reads no register; the applications' numbers read their sets and reviews.
    assert.ok(!reviewer.queries.includes("courseAttendance runId"));
    assert.ok(reviewer.queries.includes("admissionApplications roundId"));
  });
});

// ---------------------------------------------------------------------------
// 5. The pages
// ---------------------------------------------------------------------------

describe("5. the pages", () => {
  test("the Programmes page, as an admin: the term, its cards and Earlier terms", async () => {
    const drawn = await draw(ProgrammesPage, "zach");
    assert.equal(drawn.to, null);
    assert.match(drawn.text, /^Programmes Every programme of a term that isn’t over\. Open one to run it: its groups, weeks, people and settings are all inside\./);
    assert.match(drawn.text, /Autumn 2026 Running Every decision went out on Fri 23 Oct\. Autumn 2026’s term page/);
    assert.match(drawn.html, new RegExp(`<a href="${at(AGI, "overview")}" class="primary">Open AGI Strategy</a>`));
    assert.match(drawn.text, /Earlier terms None yet A term moves here once its last session is over\./);
  });

  test("the Programmes page, as a lead: their programme, and no Earlier terms while there are none", async () => {
    const drawn = await draw(ProgrammesPage, "claudia");
    assert.match(drawn.text, /^Programmes The programmes you lead\. Open one to run it\./);
    assert.ok(drawn.text.includes("AGI Strategy Fellowship"));
    assert.ok(!drawn.text.includes("Technical AI Safety"), "a lead was shown somebody else's programme");
    assert.ok(!drawn.text.includes("Earlier terms"));
  });

  test("the Programmes page, as a reviewer: the applications they read", async () => {
    const drawn = await draw(ProgrammesPage, "lloyd");
    assert.match(drawn.text, /^Programmes The programmes you review\. Open one to read its applications\./);
    assert.ok(drawn.html.includes(`href="${at(AGI, "applications")}"`));
    assert.ok(!drawn.html.includes("/overview"), "a reviewer was offered the Overview");
  });

  test("somebody admitted who is on no form: the area's own empty state, not an error", async () => {
    world.db.poke("users/nadia", { admissionsReviewer: true });
    const drawn = await draw(ProgrammesPage, "nadia");
    assert.match(drawn.text, /You are not on an application form at the moment When an admin names you a programme’s lead or one of its reviewers, its form is listed here\./);
  });

  for (const who of ["nobody", "rahul", "yusuf", null]) {
    test(`${who ?? "somebody signed out"} is sent away by the tree's gate, from both pages`, async () => {
      assert.equal((await draw(ProgrammesPage, who)).to, "/dashboard");
      assert.equal((await draw(ProgrammeAddressPage, who, { programmeId: AGI })).to, "/dashboard");
    });
  }

  test("the term's page: titled by the term, its crumb Programmes, and Open first for whoever opens the groups", async () => {
    const asLead = await draw(TermPage, "claudia");
    assert.match(asLead.html, /<a href="\/admin\/admissions\/programmes">Programmes<\/a>/);
    assert.match(asLead.text, /Programmes Term Autumn 2026 /);
    assert.match(asLead.text, / Each lead decides their own programme\. Everyone hears together on /);
    assert.ok(!asLead.text.includes("Autumn 2026. Each lead"), "the lede still repeats the term's name");
    assert.match(asLead.html, new RegExp(`<a href="${at(AGI, "overview")}" class="primary">Open AGI Strategy</a>`));
    assert.ok(!asLead.html.includes(at(TAIS, "overview")), "the lead was offered a programme they do not lead");

    const asReviewer = await draw(TermPage, "lloyd");
    assert.ok(!asReviewer.html.includes("/overview"), "a reviewer was offered the Overview");
    assert.ok(asReviewer.html.includes(at(AGI, "applications")));

    const asAdmin = await draw(TermPage, "zach");
    for (const id of [AGI, TAIS, INCUBATOR]) assert.ok(asAdmin.html.includes(`href="${at(id, "overview")}"`), id);
  });

  test("a programme's own address: Overview for an admin and its lead, applications for a reviewer", async () => {
    assert.equal((await draw(ProgrammeAddressPage, "zach", { programmeId: AGI })).to, at(AGI, "overview"));
    assert.equal((await draw(ProgrammeAddressPage, "claudia", { programmeId: AGI })).to, at(AGI, "overview"));
    assert.equal((await draw(ProgrammeAddressPage, "lloyd", { programmeId: AGI })).to, at(AGI, "applications"));
  });

  test("for anybody else, exactly what a programme that does not exist gives", async () => {
    const missing = await draw(ProgrammeAddressPage, "zach", { programmeId: "no-such-programme" });
    const notTheirs = await draw(ProgrammeAddressPage, "tess", { programmeId: AGI });
    const reviewerElsewhere = await draw(ProgrammeAddressPage, "lloyd", { programmeId: TAIS });
    assert.equal(missing.to, null);
    assert.match(missing.text, /^There is no programme here /);
    assert.equal(notTheirs.html, missing.html);
    assert.equal(reviewerElsewhere.html, missing.html);
  });

  test("a view-as session: the whole admin tree, these pages with it, is closed while the marker is live", () => {
    const layout = readFileSync(join(import.meta.dirname, "..", "src", "app", "(app)", "admin", "layout.tsx"), "utf8");
    assert.match(layout, /const viewingAs = markerIsLive\(marker, user\.uid\);\s+if \(viewingAs\) \{\s+return \(/);
    for (const page of [
      ["admissions", "programmes", "page.tsx"],
      ["admissions", "forms", "[roundId]", "programmes", "[programmeId]", "page.tsx"],
    ]) {
      assert.ok(readFileSync(join(import.meta.dirname, "..", "src", "app", "(app)", "admin", ...page), "utf8").length > 0);
    }
  });
});

// The groups this world gives AGI Strategy, named so a reader of a failure knows them.
void [A, B];
