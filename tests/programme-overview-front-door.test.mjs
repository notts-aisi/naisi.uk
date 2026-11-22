/**
 * A programme's Overview as the front door: its Applications to read and
 * Requests cards, the Requests page narrowed to one programme, and the head
 * and the card counting the same thing, as every kind of reader.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/overview
 *   /admin/admissions/requests?run=<runId>
 *
 * ## What this guards
 *
 *  1. APPLICATIONS TO READ, first, only while the form takes or decides
 *     applications: the lead's own count and "Review N" to the Applications
 *     tab; an admin who neither leads nor reviews the programme the card with
 *     no count that is not theirs; nothing once decisions are out; and with no
 *     run yet, the card and then "no run yet" under it. It reads the form's
 *     decisions and nothing else the head has not read.
 *  2. THE REQUESTS CARD, with requests of EVERY kind waiting (a register
 *     correction a lead decides, one on an archived group, one on a group of
 *     another programme, a request to be excused, to go to another session
 *     and to change group, a message to the team and an access ask): the
 *     lead's count is exactly the register corrections the lead is shown
 *     behind the link, never a kind that is an admin's alone; an admin's is
 *     every open row of the run; the head says the same number; a message to
 *     the team and an access ask are in no programme's count; nothing waiting,
 *     no card.
 *  3. THE NARROWED REQUESTS PAGE never widens what a reader sees: a lead
 *     given another programme's run, or an id that is no run at all, is shown
 *     nothing and the programme is "A programme"; "All requests" clears it.
 *  4. WHO REACHES IT: a reviewer is told Overview is the lead's and an
 *     admin's, the lead of another programme is told there is no programme
 *     here, the tree sends a member, a facilitator and a run's track lead to
 *     the dashboard, and a view-as session finds the whole admin tree closed.
 *
 * Search's programmes, as every kind of reader, are tests/search.test.mjs's.
 *
 * Real: the pages, the loaders, the request routes that make the requests.
 * Faked: the session, the Admin SDK handle, the view-as marker, the mail
 * door (which records), `next/link`, `next/navigation`, the stylesheets and
 * the clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { A, AGI, B, C, NOW, ROUND, RUN, enrolmentPath, formPath, makeLeavingWorld, textOf } from "./lib/leavingWorld.mjs";
import { TAIS } from "./lib/leadWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__frontDoor");
const { world, call, loadTs } = w;

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const OverviewPage = (await loadTs(join(TABS, "overview", "page.tsx"))).default;
const RequestsPage = (await loadTs(join("app", "(app)", "admin", "admissions", "requests", "page.tsx"))).default;
const AdminLayout = (await loadTs(join("app", "(app)", "admin", "layout.tsx"))).default;
const { loadRequestsPage } = await loadTs(join("lib", "courses", "requests", "load.ts"));
const { requestsWaitingOnRun } = await loadTs(join("lib", "courses", "requests", "home.ts"));
const { loadTermNumbers } = await loadTs(join("lib", "applications", "lifecycle", "loadTermHome.ts"));
const { loadForm } = await loadTs(join("lib", "applications", "repo.ts"));
const { isOpen } = await loadTs(join("lib", "courses", "requests", "kinds.ts"));
const P = await loadTs(join("lib", "courses", "registerCorrection", "pageWords.ts"));

const visitRoute = await w.courseRoute("runs", "[runId]", "requests", "visit");
const moveRoute = await w.courseRoute("runs", "[runId]", "requests", "move");
const excusedRoute = await w.courseRoute("groups", "[groupId]", "excused");
const askRoute = await w.courseRoute("requests", "ask");

const read = (path) => world.db.read(path);
const PROGRAMME_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;
const REQUESTS = "/admin/admissions/requests";
const filtered = (runId) => `${REQUESTS}?run=${encodeURIComponent(runId)}`;

/** A group of Technical AI Safety's run, which Tess leads: another programme's. */
const TAIS_GROUP = "tais-autumn-2026-thursday__grp00031";

/**
 * The session `getCurrentUser()` builds from the stored account: its own
 * permissions (none for most) and the reviewer flag the roles writer keeps.
 */
function sessionFor(uid) {
  if (!uid) return null;
  const base = w.sessionOf(uid);
  if (!base) return null;
  const account = read(`users/${uid}`) ?? {};
  return { ...base, permissions: account.permissions ?? {}, admissionsReviewer: account.admissionsReviewer === true };
}

/** Everybody the brief names, by the uid that is them in this world. */
const READERS = {
  signedOut: null,
  member: "amara",
  facilitator: "rahul",
  trackLead: "yusuf",
  reviewer: "lloyd",
  lead: "claudia",
  otherLead: "tess",
  admin: "zach",
};

/** A page as `who` sees it: its words, its markup, where it sent them, and whether it wrote. */
async function draw(Page, who, { params = {}, query = {}, viewAs = false, children = null } = {}) {
  world.user = sessionFor(who);
  world.course = true;
  world.viewAs = viewAs;
  const before = w.everything();
  try {
    const element = await Page({
      params: Promise.resolve(params),
      searchParams: Promise.resolve(query),
      children: children ?? createElement("div", null, "[children]"),
    });
    const html = renderToStaticMarkup(element);
    return { html, text: textOf(html), to: null, wrote: w.everything() !== before };
  } catch (err) {
    if (err?.message !== "NEXT_REDIRECT") throw err;
    return { html: "", text: "", to: err.to, wrote: w.everything() !== before };
  } finally {
    world.course = false;
    world.viewAs = false;
  }
}

const overview = (who, opts = {}) => draw(OverviewPage, who, { params: { roundId: ROUND, programmeId: AGI }, ...opts });
const overviewOf = (who, programmeId) => draw(OverviewPage, who, { params: { roundId: ROUND, programmeId } });
/** The head's count beside Requests, as the tabs' layout asks it (`requestsWaitingOnRunOnce`, which is this, once per page). */
const head = (who) => requestsWaitingOnRun(world.courseDb, sessionFor(who), RUN.agi, { excused: read(`users/${who}`)?.role === "admin" });
const requestsPage = (who, run) => draw(RequestsPage, who, { query: run === undefined ? {} : { run } });

/** The Requests card's figure and line, or null when there is no card. */
function requestsCard(html) {
  const at = html.indexOf('aria-labelledby="overview-requests"');
  if (at < 0) return null;
  const card = html.slice(at, html.indexOf("</section>", at));
  return {
    count: Number(/countBadge">(\d+)</.exec(card)?.[1] ?? NaN),
    line: textOf(/frontLine">([^<]*)</.exec(card)?.[1] ?? ""),
    href: /href="([^"]+)"/.exec(card)?.[1]?.replace(/&amp;/g, "&") ?? null,
    action: textOf(/frontAction">([^<]*)</.exec(card)?.[1] ?? ""),
  };
}

/** The Applications to read card, or null. */
function toReadCard(html) {
  const at = html.indexOf('aria-labelledby="overview-to-read"');
  if (at < 0) return null;
  const card = html.slice(at, html.indexOf("</section>", at));
  const badge = /countBadge">(\d+)</.exec(card);
  return {
    count: badge ? Number(badge[1]) : null,
    line: textOf(/frontLine">([^<]*)</.exec(card)?.[1] ?? ""),
    href: /href="([^"]+)"/.exec(card)?.[1] ?? null,
    action: textOf(/frontAction">([^<]*)</.exec(card)?.[1] ?? ""),
    at,
  };
}

// ---------------------------------------------------------------------------
// The requests of every kind
// ---------------------------------------------------------------------------

/** A facilitator's ask to correct a line of a finished register, as the ask route stores it. */
function correction(id, { runId = RUN.agi, groupId = B, subjectUid = "chloe", askedByUid = "rahul", status = "waiting", handlingUid = null } = {}) {
  world.db.seed(`courseRequests/${id}`, {
    kind: "register-correction",
    status,
    runId,
    groupId,
    roundId: ROUND,
    programmeId: runId === RUN.agi ? AGI : TAIS,
    sessionKey: "w01",
    weekId: "w01",
    subjectUid,
    askedByUid,
    askedAt: new Date("2026-11-16T10:00:00Z"),
    change: { from: { mark: "absent", online: false }, to: { mark: "present", online: false } },
    reason: "Marked in the wrong row.",
    handlingUid,
    handlingAt: handlingUid ? new Date("2026-11-16T11:00:00Z") : null,
    decidedByUid: null,
    decidedAt: null,
    withdrawnAt: null,
    reply: "",
    history: [],
  });
}

/** Ask through a real route, and say what it answered. */
async function asked(who, handler, params, body) {
  const answer = await call(who, handler, params, { body, course: true });
  assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
  await w.settle();
  return answer.body.request?.id ?? null;
}

/**
 * Requests of every kind, waiting:
 *  - three register corrections on AGI Strategy's run: two on Group B (one
 *    being handled), which its lead decides, and one on Group A once it is
 *    archived, which is an admin's alone;
 *  - one register correction on Technical AI Safety's run, Tess's;
 *  - Kofi asks to be excused from Group B's week 4, Chloe to go to Group C's
 *    session this week, Farah to change to Group C for good: an admin's
 *    alone;
 *  - Amara sends the team a message and Hamza an access ask: nobody's
 *    programme.
 */
async function everyKindWaits() {
  world.db.seed(`courseGroups/${TAIS_GROUP}`, {
    runId: RUN.tais,
    courseId: read(`courseRuns/${RUN.tais}`)?.courseId ?? "",
    name: "Group T",
    facilitatorUids: [],
    memberCount: 0,
    capacity: 8,
    archived: false,
  });
  correction("corr-agi-b-1");
  correction("corr-agi-b-2", { subjectUid: "farah", handlingUid: "zach" });
  correction("corr-agi-a-archived", { groupId: A, subjectUid: "amara", askedByUid: "sofia" });
  correction("corr-tais", { runId: RUN.tais, groupId: TAIS_GROUP, subjectUid: "wen", askedByUid: "tess" });
  const ids = {
    excused: await asked("kofi", excusedRoute.POST, { groupId: B }, { sessionKeys: ["w04"], reason: "A clash.", inPerson: true, ownOnline: true, otherOnline: true }),
    visit: await asked("chloe", visitRoute.POST, { runId: RUN.agi }, { hostGroupId: C, reason: "Group B's room is closed tonight." }),
    move: await asked("farah", moveRoute.POST, { runId: RUN.agi }, { toGroupId: C, reason: "My Tuesday lab runs all term." }),
    message: await asked("amara", askRoute.POST, {}, { topic: "else", words: "Can I bring a friend to a social?" }),
    access: await asked("hamza", askRoute.POST, {}, { topic: "access", words: "A seat near the door, please.", tellFacilitator: false }),
  };
  world.db.poke(`courseGroups/${A}`, { archived: true });
  return ids;
}

/** The open rows the Requests page shows `who`, narrowed to `runId`. */
async function openRowsBehindTheLink(who, runId) {
  const loaded = await loadRequestsPage(world.courseDb, sessionFor(who), new Date(), { runId });
  if (loaded.status !== "ok") return [];
  return loaded.view.rows.filter((row) => isOpen(row.state));
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

// ---------------------------------------------------------------------------
// 1. Applications to read
// ---------------------------------------------------------------------------

describe("Applications to read, first on the Overview", () => {
  /**
   * The form back before decision day, closed and deciding, with two of AGI
   * Strategy's applicants (Dev and Bea) still owed a decision by its lead:
   * two waiting for Claudia's reading, and for nobody else's.
   */
  async function twoWaitForTheLead() {
    world.db.poke(formPath, { status: "open", decisionsSentAt: null, closesAt: new Date("2026-11-01T23:59:00Z") });
    for (const uid of ["dev", "bea"]) {
      await world.db.collection("admissionDecisions").doc(`${ROUND}__${uid}`).delete();
      world.db.poke(`admissionApplications/${ROUND}__${uid}`, { status: "submitted", result: null });
    }
  }

  test("the lead: their own count, the term page's words and Review N to the Applications tab, before everything else", async () => {
    await twoWaitForTheLead();
    const form = await loadForm(world.db, ROUND);
    const numbers = await loadTermNumbers(world.db, sessionFor("claudia"), form);
    const work = numbers.work[AGI];
    assert.equal(work.waiting, 2, "the world has two waiting for the lead");
    const page = await overview("claudia");
    const card = toReadCard(page.html);
    assert.ok(card, page.text.slice(0, 400));
    assert.equal(card.count, 2);
    assert.equal(card.line, `${work.counts.all} applications · 2 for you to read`);
    assert.equal(card.action, "Review 2");
    assert.equal(card.href, `${PROGRAMME_PATH}/applications`);
    assert.match(page.text, /^Applications to read 2 /);
    // First: before the week, Needs attention and everything else.
    assert.ok(card.at < page.html.indexOf("Needs attention"));
    assert.equal(page.wrote, false);
  });

  test("an admin who neither leads nor reviews it: the card, with no count that is not theirs", async () => {
    await twoWaitForTheLead();
    const card = toReadCard((await overview("zach")).html);
    assert.ok(card);
    assert.equal(card.count, null, "the lead's count is shown to an admin");
    assert.match(card.line, /^\d+ applications · none for you to read$/);
    assert.equal(card.action, "See applications");
    assert.equal(card.href, `${PROGRAMME_PATH}/applications`);
  });

  test("an admin who leads it reads their own count, as the lead does", async () => {
    await twoWaitForTheLead();
    const form = read(formPath);
    world.db.poke(formPath, { programmes: { ...form.programmes, [AGI]: { ...form.programmes[AGI], leadUid: "zach" } } });
    const card = toReadCard((await overview("zach")).html);
    assert.equal(card.count, 2);
    assert.equal(card.action, "Review 2");
  });

  test("a closed programme gets no card, whatever the form is doing", async () => {
    await twoWaitForTheLead();
    const form = read(formPath);
    world.db.poke(formPath, { programmes: { ...form.programmes, [AGI]: { ...form.programmes[AGI], closed: true } } });
    for (const who of ["claudia", "zach"]) {
      const page = await overview(who);
      assert.equal(toReadCard(page.html), null, who);
      assert.equal(page.html.includes("Applications to read"), false, who);
    }
  });

  test("once decisions are out there is no card, and nothing else on the page changes", async () => {
    const before = await overview("claudia");
    assert.equal(toReadCard(before.html), null);
    assert.match(before.text, /Needs attention/);
    assert.equal(before.html.includes("Applications to read"), false);
  });

  test("with no run yet: the card first, then today's no run yet under it", async () => {
    await twoWaitForTheLead();
    const form = read(formPath);
    world.db.poke(formPath, { programmes: { ...form.programmes, [AGI]: { ...form.programmes[AGI], runId: null } } });
    const page = await overview("claudia");
    const card = toReadCard(page.html);
    assert.ok(card);
    assert.equal(card.count, 2);
    // Today's no run yet, word for word, under the card.
    const blank = "AGI Strategy doesn’t name a course run yet. An admin names it on the Settings tab, under Course run.";
    assert.ok(page.text.includes(blank), page.text);
    assert.ok(page.text.indexOf("Applications to read") < page.text.indexOf(blank));
    assert.equal(requestsCard(page.html), null);
    // Once decisions are out, the state alone, as it always was.
    world.db.poke(formPath, { decisionsSentAt: new Date("2026-10-23T18:00:00Z") });
    const after = await overview("claudia");
    assert.equal(toReadCard(after.html), null);
    assert.equal(after.text, blank);
  });

  test("outside a page render, the card adds one read of the decisions and one of the applications", async (t) => {
    await twoWaitForTheLead();
    const asked = [];
    const collection = world.courseDb.collection.bind(world.courseDb);
    t.mock.method(world.courseDb, "collection", (path) => {
      asked.push(path);
      return collection(path);
    });
    const withCard = asked.length;
    await overview("claudia");
    const reads = asked.slice(withCard);
    // Outside a render nothing is shared, so the applications are read here too; whether the head's read is
    // shared inside one is not something a test outside a render can show.
    assert.equal(reads.filter((path) => path === "admissionDecisions").length, 1);
    assert.equal(reads.filter((path) => path === "admissionApplications").length, 1);
  });
});

// ---------------------------------------------------------------------------
// 2. The Requests card, with requests of every kind waiting
// ---------------------------------------------------------------------------

describe("the Requests card, with requests of every kind waiting", () => {
  test("the lead counts only the register corrections a lead decides, exactly the rows behind the link", async () => {
    await everyKindWaits();
    const behind = await openRowsBehindTheLink("claudia", RUN.agi);
    // The two on Group B: not the archived group's, not another programme's, no kind that is an admin's alone.
    assert.deepEqual(behind.map((row) => row.id).sort(), ["corr-agi-b-1", "corr-agi-b-2"]);
    assert.ok(behind.every((row) => row.kind === "register-correction"));
    const card = requestsCard((await overview("claudia")).html);
    assert.deepEqual(card, {
      count: behind.length,
      line: "2 requests from AGI Strategy’s people are waiting for you or an admin.",
      href: filtered(RUN.agi),
      action: "Open requests",
    });
    // The head counts the same.
    assert.equal(await head("claudia"), 2);
  });

  test("an admin counts every open row of the run, every kind with one, and the same number as the head", async () => {
    const ids = await everyKindWaits();
    const behind = await openRowsBehindTheLink("zach", RUN.agi);
    const kinds = [...new Set(behind.map((row) => row.kind))].sort();
    assert.deepEqual(kinds, ["excused", "move", "register-correction", "visit"]);
    assert.deepEqual(
      behind.map((row) => row.id).sort(),
      ["corr-agi-a-archived", "corr-agi-b-1", "corr-agi-b-2", ids.excused, ids.visit, ids.move].sort(),
    );
    const card = requestsCard((await overview("zach")).html);
    assert.equal(card.count, behind.length);
    assert.equal(card.line, `${behind.length} requests from AGI Strategy’s people are waiting for an admin.`);
    assert.equal(card.href, filtered(RUN.agi));
    assert.equal(await head("zach"), behind.length);
  });

  test("a message to the team and an access ask are in no programme's count and no programme's list", async () => {
    const ids = await everyKindWaits();
    for (const runId of [RUN.agi, RUN.tais]) {
      const rows = await openRowsBehindTheLink("zach", runId);
      assert.ok(!rows.some((row) => row.id === ids.message || row.id === ids.access), runId);
    }
    // An address that names no run is not "the rows that belong to none" (an empty `run` is no filter at all).
    for (const run of ["%20", "x".repeat(200)]) {
      const page = await requestsPage("zach", run);
      assert.ok(!page.html.includes(ids.message) && !page.html.includes(ids.access), JSON.stringify(run));
    }
    const all = await loadRequestsPage(world.courseDb, sessionFor("zach"), new Date());
    assert.ok(all.view.rows.some((row) => row.id === ids.message));
    assert.ok(all.view.rows.some((row) => row.id === ids.access));
  });

  /** The card's count (0 with no card), the open rows behind its link and the head's count, for one reader. */
  async function countsOf(who) {
    const card = requestsCard((await overview(who)).html);
    return {
      card: card ? card.count : 0,
      rows: (await openRowsBehindTheLink(who, RUN.agi)).length,
      head: await head(who),
    };
  }

  /** The lead's and an admin's card, rows and head all agree; and the ids an admin is shown, for a state's own check. */
  async function agree(state) {
    for (const who of ["claudia", "zach"]) {
      const counts = await countsOf(who);
      assert.equal(counts.card, counts.rows, `${state}: ${who}'s card is not the rows behind its link`);
      assert.equal(counts.head, counts.rows, `${state}: ${who}'s head is not the rows behind its link`);
    }
    const lead = await openRowsBehindTheLink("claudia", RUN.agi);
    assert.ok(lead.every((row) => row.kind === "register-correction"), `${state}: the lead is shown a kind that is an admin's alone`);
    return new Set((await openRowsBehindTheLink("zach", RUN.agi)).map((row) => row.id));
  }

  test("a lead's count is unmoved by every kind that is an admin's alone", async () => {
    correction("corr-agi-b-1");
    correction("corr-agi-b-2", { subjectUid: "farah", handlingUid: "zach" });
    const before = await countsOf("claudia");
    const adminBefore = await countsOf("zach");
    await everyKindWaits();
    const after = await countsOf("claudia");
    assert.deepEqual(after, before);
    // An admin's count grew by the kinds that are theirs, and by the correction on the group archived since.
    assert.ok((await countsOf("zach")).card > adminBefore.card);
    await agree("every kind waiting at once");
  });

  const STATES = {
    "a correction on a group the lead also facilitates": async () => {
      world.db.poke(`courseGroups/${B}`, { facilitatorUids: [...read(`courseGroups/${B}`).facilitatorUids, "claudia"] });
      return (shown) => assert.ok(shown.has("corr-agi-b-1"), "an admin still decides it");
    },
    "a visit request that closed by itself": async (ids) => {
      // Group C's session she asked for (Wed 18 Nov, 1pm) has started: the request closed by itself.
      mock.timers.setTime(new Date("2026-11-18T13:00:00Z").getTime());
      return (shown) => assert.ok(!shown.has(ids.visit), "the visit request did not close");
    },
    "a move request whose person's place has gone": async (ids) => {
      world.db.poke(enrolmentPath("farah"), { allocatedEmailAt: null });
      return (shown) => assert.ok(!shown.has(ids.move), "the move request did not go");
    },
    "a request to be excused that the list's normaliser does not read": async () => {
      world.db.seed("courseRequests/excused-with-no-weeks", {
        kind: "excused",
        status: "waiting",
        runId: RUN.agi,
        groupId: B,
        roundId: ROUND,
        programmeId: AGI,
        subjectUid: "kofi",
        askedByUid: "kofi",
        askedAt: new Date("2026-11-16T10:00:00Z"),
        change: { weeks: [] },
        reason: "",
        history: [],
      });
      return (shown) => assert.ok(!shown.has("excused-with-no-weeks"));
    },
  };

  for (const [state, change] of Object.entries(STATES)) {
    test(`${state}: the card, the head and the rows behind the link agree, for the lead and an admin`, async () => {
      const ids = await everyKindWaits();
      const before = await agree("every kind waiting");
      const check = await change(ids);
      const shown = await agree(state);
      check(shown);
      assert.ok(shown.size <= before.size + 1, state);
    });
  }

  test("the head's link and the card's go to one place, with one count from one read", () => {
    const layout = readFileSync(join(SRC, TABS, "layout.tsx"), "utf8");
    const page = readFileSync(join(SRC, TABS, "overview", "page.tsx"), "utf8");
    assert.match(layout, /<Link href=\{requestsForRunPath\(programme\.runId\)\}/);
    assert.match(page, /href: requestsForRunPath\(records\.run\.id\)/);
    // The same question, with the same excused flag for the same reader, answered once per page.
    assert.match(layout, /requestsWaitingOnRunOnce\(db, user, programme\.runId, \{ excused: role === "admin" \}\)/);
    assert.match(page, /requestsWaitingOnRunOnce\(db, user, records\.run\.id, \{ excused: view\.viewer === "admin" \}\)/);
    assert.ok(!layout.includes("REQUESTS_PATH"), "the head still opens the whole Requests page");
  });

  test("the lead of another programme counts their own run's and none of this one's", async () => {
    await everyKindWaits();
    assert.deepEqual((await openRowsBehindTheLink("tess", RUN.tais)).map((row) => row.id), ["corr-tais"]);
    const card = requestsCard((await overviewOf("tess", TAIS)).html);
    assert.deepEqual(card, {
      count: 1,
      line: "1 request from Technical AI Safety’s people is waiting for you or an admin.",
      href: filtered(RUN.tais),
      action: "Open requests",
    });
  });

  test("nothing waiting, no card; a request decided or withdrawn is not waiting", async () => {
    const page = await overview("claudia");
    assert.equal(requestsCard(page.html), null);
    correction("corr-done", { status: "approved" });
    correction("corr-gone", { status: "withdrawn" });
    assert.equal(requestsCard((await overview("claudia")).html), null);
    assert.equal(requestsCard((await overview("zach")).html), null);
  });

  test("the words: one request, many, an admin's and a lead's", () => {
    assert.equal(P.overviewRequestsWords(1, "AGI Strategy", "admin"), "1 request from AGI Strategy’s people is waiting for an admin.");
    assert.equal(P.overviewRequestsWords(2, "AGI Strategy", "admin"), "2 requests from AGI Strategy’s people are waiting for an admin.");
    assert.equal(P.overviewRequestsWords(2, "AGI Strategy", "lead"), "2 requests from AGI Strategy’s people are waiting for you or an admin.");
    assert.equal(P.OVERVIEW_REQUESTS_TITLE, "Requests");
    assert.equal(P.OPEN_REQUESTS, "Open requests");
    assert.equal(P.ALL_REQUESTS, "All requests");
  });
});

// ---------------------------------------------------------------------------
// 3. The narrowed Requests page
// ---------------------------------------------------------------------------

describe("the Requests page narrowed to one programme", () => {
  test("it names the programme, counts its rows, and offers All requests", async () => {
    await everyKindWaits();
    const page = await requestsPage("claudia", RUN.agi);
    assert.match(page.text, /Programme AGI Strategy All requests/);
    assert.match(page.html, new RegExp(`href="${REQUESTS}"[^>]*>${P.ALL_REQUESTS}<`));
    assert.match(page.text, /2 waiting/);
    assert.equal(page.wrote, false);
    // The admin's picker is not drawn over a narrowed page.
    const admin = await requestsPage("zach", RUN.agi);
    assert.match(admin.text, /Programme AGI Strategy All requests/);
    assert.ok(!admin.text.includes(P.ALL_PROGRAMMES));
  });

  test("it never widens: what each reader sees narrowed is what they see anyway, of that run", async () => {
    await everyKindWaits();
    for (const who of ["zach", "claudia", "tess"]) {
      const all = await loadRequestsPage(world.courseDb, sessionFor(who), new Date());
      for (const runId of [RUN.agi, RUN.tais, RUN.other, "no-such-run__run99999"]) {
        const narrowed = await loadRequestsPage(world.courseDb, sessionFor(who), new Date(), { runId });
        const expected = all.status === "ok" ? all.view.rows.filter((row) => row.runId === runId).map((row) => row.id).sort() : [];
        const got = narrowed.status === "ok" ? narrowed.view.rows.map((row) => row.id).sort() : [];
        assert.deepEqual(got, expected, `${who} on ${runId}`);
        if (narrowed.status === "ok") {
          // The tabs' counts are the narrowed rows', not every row's.
          const open = narrowed.view.rows.filter((row) => isOpen(row.state)).length;
          assert.equal(narrowed.view.counts.waiting + narrowed.view.counts.handling, open, `${who} on ${runId}: counts`);
        }
      }
    }
  });

  test("a lead given another programme's run, or an id that is no run, is shown nothing and told nothing", async () => {
    await everyKindWaits();
    const other = await requestsPage("claudia", RUN.tais);
    const none = await requestsPage("claudia", "no-such-run__run99999");
    for (const page of [other, none]) {
      assert.match(page.text, /Programme A programme All requests/);
      assert.ok(!page.text.includes("Technical AI Safety"));
      assert.ok(!page.html.includes("corr-tais"));
      assert.match(page.text, /No requests waiting/);
    }
    // The two answers are the same page: whether the run exists is not said.
    assert.equal(other.html, none.html);
  });

  test("everybody the tree turns away is turned away with the filter as without it", async () => {
    for (const who of [READERS.signedOut, READERS.member, READERS.facilitator, READERS.trackLead]) {
      const page = await requestsPage(who, RUN.agi);
      assert.equal(page.to, "/dashboard", String(who));
    }
    // A reviewer who leads nothing is admitted by the tree and told calmly there are none for them.
    const reviewer = await requestsPage(READERS.reviewer, RUN.agi);
    assert.equal(reviewer.to, null);
    assert.match(reviewer.text, new RegExp(P.NO_REQUESTS_HERE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

// ---------------------------------------------------------------------------
// 4. Who reaches the Overview
// ---------------------------------------------------------------------------

describe("who reaches the Overview", () => {
  test("a reviewer is told it is the lead's and an admin's; the lead of another programme that there is no programme here", async () => {
    await everyKindWaits();
    const reviewer = await overview(READERS.reviewer);
    assert.match(reviewer.text, /Only the programme’s lead and admins can open Overview/);
    assert.equal(requestsCard(reviewer.html), null);
    assert.equal(toReadCard(reviewer.html), null);
    const other = await overview(READERS.otherLead);
    assert.equal(requestsCard(other.html), null);
    assert.ok(!other.text.includes("requests from"));
  });

  test("a member, a facilitator and a run's track lead are sent to the dashboard; nobody signed out is either", async () => {
    await everyKindWaits();
    for (const who of [READERS.signedOut, READERS.member, READERS.facilitator, READERS.trackLead]) {
      assert.equal((await overview(who)).to, "/dashboard", String(who));
    }
  });

  test("in a view-as session the admin tree is closed: neither page is drawn", async () => {
    await everyKindWaits();
    for (const who of [READERS.lead, READERS.otherLead]) {
      const page = await draw(AdminLayout, who, { viewAs: true });
      assert.equal(page.to, null);
      assert.ok(!page.html.includes("[children]"), `${who}: the tree is drawn in a view-as session`);
    }
  });
});
