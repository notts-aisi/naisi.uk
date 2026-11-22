/**
 * SEARCH FOR A PERSON OR A GROUP, from the sidebar (src/lib/search/,
 * src/app/api/search/route.ts, src/features/search/).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Search is a new way to ask about people, so the thing held here above all
 * is that it never answers more than its reader could already list, and
 * never says whether somebody it does not show exists:
 *
 *  1. THE PURE HALF: folding, the shortest query, matching on the name shown,
 *     the order, the caps, and the empty states the box draws.
 *  2. WHO MAY: the route as every persona the standing red team knows, GET and
 *     POST, every refusal one answer, the fields of every answer, view-as.
 *  3. WHAT EACH READER FINDS, against a real term: an admin everybody and
 *     every group; a programme's lead exactly their People tab's rows and
 *     their run's groups, by the tab's names; a facilitator exactly their
 *     group page's people, by the page's names; a lead of another programme
 *     and a facilitator of another group nothing of anybody else's, by the
 *     very answer a name nobody holds gets.
 *  4. WHAT A RESULT CARRIES: a name, a line and an address, never an email
 *     address, a role or a status, and never matched on an address.
 *  5. NOTHING KEPT: nothing written, nothing logged about the query, the
 *     limits and their numbers.
 *  6. THE PAGES: the People tab opened on one row, and the shell drawing the
 *     box only for somebody the route answers.
 *  7. THE FACILITATOR GUIDE: a third short list for somebody who
 *     facilitates, offered for exactly the courses the guide's own gate
 *     admits them to as a facilitator, found by "guide", "facilitator guide"
 *     and the course's title, at no read more, and absent from every other
 *     answer, so the people and groups lists and everybody else's answers
 *     are as they were.
 *
 * The term is `tests/lib/termWorld.mjs`'s on Thu 10 Dec 2026: Claudia leads
 * AGI Strategy (Groups A, B and C, Sofia facilitating A and B and Tom C),
 * Tess leads Technical AI Safety and facilitates its one group (Wen and
 * Omar). Every address is on a reserved domain.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { INCUBATOR, session, userDoc } from "./lib/applicationsSmallTerm.mjs";
import { A, B, C } from "./lib/surveyWorld.mjs";
import { AFTER, AGI, ROUND, RUN, TAIS, TAIS_GROUP, termSeed } from "./lib/termWorld.mjs";
import { PERSONA_NAMES } from "./persona-route-gates.registry.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const read = (...parts) => readFileSync(join(REPO_ROOT, ...parts), "utf8");

/** A stylesheet, as its own class names; every sheet a module under src imports. */
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) SHEETS.add(specifier);
}

const w = makeWorld("__search", [
  ...[...SHEETS].map((sheet) => [sheet, CLASS_NAMES]),
  ["@/hooks/useHydrated", "export function useHydrated() { return true; }"],
  [
    "next/link",
    "export default ({ href, className, children, prefetch, scroll, ...rest }) =>\n" +
      "  globalThis.__searchUi.h('a', { href, className, ...rest }, children);",
  ],
  ["next/navigation", "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }"],
]);
globalThis.__searchUi = { h: createElement };

const model = await w.loadTs(join("lib", "search", "model.ts"));
const words = await w.loadTs(join("lib", "search", "words.ts"));
const load = await w.loadTs(join("lib", "search", "load.ts"));
const route = await w.loadTs(join("app", "api", "search", "route.ts"));
const peopleLoad = await w.loadTs(join("lib", "applications", "people", "load.ts"));
const facilitatorGroup = await w.loadTs(join("lib", "courses", "facilitatorGroup.ts"));
const ProgrammePeople = (await w.loadTs(join("features", "applications", "people", "ProgrammePeople.tsx"))).default;
const filters = await w.loadTs(join("lib", "applications", "people", "filters.ts"));
const guideAccess = await w.loadTs(join("lib", "courses", "facilitatorGuide", "access.ts"));
const { COURSE } = await import("./lib/handoverWorld.mjs");

// ---------------------------------------------------------------------------
// The term
// ---------------------------------------------------------------------------

/** The term on Thu 10 Dec 2026, with the reviewer flag the roles writer keeps on the leads and reviewers. */
function seed(over = {}) {
  const docs = termSeed({ templateItems: () => [] }, () => [], {});
  docs["users/penny"] = userDoc(session("penny", "pending", false, "Penny Lane"));
  for (const uid of ["claudia", "lloyd", "tess"]) docs[`users/${uid}`] = { ...docs[`users/${uid}`], admissionsReviewer: true };
  return { ...docs, ...over };
}

/** The session a request arrives with: the stored account, with the reviewer flag the session carries. */
function sessionFor(uid) {
  const base = w.sessionOf(uid);
  if (!base) return null;
  return { ...base, admissionsReviewer: w.world.db.read(`users/${uid}`)?.admissionsReviewer === true };
}

let requests = 0;
/** One request to a real handler, as `who`, with the session `getCurrentUser()` would hand back. */
async function call(who, handler, { body, viewAs = false, ip = `10.8.0.${(requests + 1) % 250}` } = {}) {
  requests += 1;
  w.world.user = who === null ? null : sessionFor(who);
  w.world.viewAs = viewAs;
  const init = { method: handler.name, headers: { "Content-Type": "application/json", "x-forwarded-for": `${ip}, 10.0.0.1` } };
  if (body !== undefined) init.body = typeof body === "string" ? body : JSON.stringify(body);
  try {
    const response = await handler(new Request("https://naisi.invalid/api/search", init));
    return { status: response.status, body: structuredClone(response.body), headers: response.headers };
  } catch (err) {
    return { status: 599, body: { error: String(err?.stack ?? err) } };
  } finally {
    w.world.viewAs = false;
  }
}

let terms = 0;
/**
 * Start again on Thu 10 Dec 2026, with the clock held there. Each start is a
 * minute and a second after the last, so one test's queries never count
 * against the next test's minute: the limit is the route's, kept in memory.
 */
function freshTerm(t, over = {}) {
  terms += 1;
  mock.timers.enable({ apis: ["Date"], now: AFTER.getTime() + terms * 61_000 });
  t.after(() => mock.timers.reset());
  w.reset(seed(over), { now: () => new Date() });
}

/** One query as `who`, answered 200. */
async function search(who, query) {
  const response = await call(who, route.POST, { body: { query } });
  assert.equal(response.status, 200, `${who} "${query}": ${JSON.stringify(response.body)}`);
  return response.body;
}

/** Everybody the reader's world holds, by a query every name matches: none. Names instead, one by one. */
const names = (answer) => answer.people.map((hit) => hit.name);
const groupNames = (answer) => answer.groups.map((hit) => hit.name);

const programmePath = (programmeId) => `/admin/admissions/forms/${ROUND}/programmes/${programmeId}`;
const stored = (path) => w.world.db.read(path);
const PERSONA_UID = {
  anonymous: null,
  pending: "penny",
  rejected: "refused",
  member: "amara",
  committee: "iris",
  suCommittee: "sue",
  admin: "zach",
  lead: "claudia",
  facilitator: "tom",
  participant: "dev",
};

// ---------------------------------------------------------------------------
// 1. The pure half
// ---------------------------------------------------------------------------

describe("the pure half", () => {
  const person = (name, href = `/p/${name}`) => ({ name, line: "", href, matchOn: name });

  test("a query is folded for case and accents, and fewer than two letters asks nothing", () => {
    assert.equal(model.foldForSearch("  Zoë   ÅSE "), "zoe ase");
    assert.equal(model.queryWords("a"), null);
    assert.equal(model.queryWords(" a "), null);
    assert.equal(model.queryWords(42), null);
    assert.deepEqual(model.queryWords("Le O"), ["le", "o"]);
    assert.equal(model.isAskableQuery("x".repeat(model.SEARCH_MAX_LENGTH)), true);
    assert.equal(model.isAskableQuery("x".repeat(model.SEARCH_MAX_LENGTH + 1)), false);
    assert.equal(model.isAskableQuery({ query: "leo" }), false);
  });

  test("every word typed is somewhere in the name, as the People tab's search matches, best first", () => {
    const world = { people: [person("Cleo Martin"), person("Leonie Hart"), person("Leo Park"), person("Ada Lovelace")], groups: [] };
    // "leo" finds Leo and Leonie by the start of their names, and Cleo inside hers, as the People tab's own search matches.
    assert.deepEqual(names(model.searchWorld(world, "leo")), ["Leo Park", "Leonie Hart", "Cleo Martin"]);
    assert.deepEqual(names(model.searchWorld(world, "LÉO park")), ["Leo Park"]);
    assert.deepEqual(names(model.searchWorld(world, "zz")), []);
    // A word starting a later name ranks above one inside a word.
    assert.deepEqual(names(model.searchWorld(world, "ha")), ["Leonie Hart"]);
  });

  test("the answer is capped, and says when more matched", () => {
    const many = Array.from({ length: 9 }, (_, at) => person(`Sam ${String.fromCharCode(65 + at)}`));
    const groups = Array.from({ length: 6 }, (_, at) => ({ ...person(`Group ${at}`), matchOn: `Group ${at} Sam's programme` }));
    const answer = model.searchWorld({ people: many, groups }, "sam");
    assert.equal(answer.people.length, model.MAX_PEOPLE);
    assert.equal(answer.groups.length, model.MAX_GROUPS);
    assert.deepEqual([answer.morePeople, answer.moreGroups], [true, true]);
    assert.deepEqual(model.searchWorld({ people: many.slice(0, 2), groups: [] }, "sam").morePeople, false);
  });

  test("one row per name and page, and a hit carries a name, a line and an address and nothing else", () => {
    const twice = [person("Ada Lovelace", "/g/1"), person("Ada Lovelace", "/g/1"), person("Ada Lovelace", "/g/2")];
    const answer = model.searchWorld({ people: twice, groups: [] }, "ada");
    assert.equal(answer.people.length, 2);
    for (const hit of answer.people) assert.deepEqual(Object.keys(hit).sort(), ["href", "line", "name"]);
    assert.deepEqual(Object.keys(answer).sort(), ["groups", "moreGroups", "morePeople", "people"]);
  });

  test("a group matches on its programme and its run as well as its name; a person on their name alone", () => {
    const groups = [{ name: "Group C", line: "AGI Strategy · Autumn 2026", href: "/g/c", matchOn: "Group C AGI Strategy Autumn 2026" }];
    assert.deepEqual(groupNames(model.searchWorld({ people: [], groups }, "agi group c")), ["Group C"]);
    const people = [{ name: "Amara Okafor", line: "AGI Strategy · Group C", href: "/p/a", matchOn: "Amara Okafor" }];
    assert.deepEqual(names(model.searchWorld({ people, groups: [] }, "agi")), []);
  });

  test("a line joins what it has, and the empty states name what was typed", () => {
    assert.equal(model.lineOf(["AGI Strategy", null, " ", "Group C"]), "AGI Strategy · Group C");
    assert.equal(words.noPeopleWords(" group f "), "Nobody’s name matches “group f”.");
    assert.equal(words.noGroupsWords("leo"), "No group matches “leo”.");
    assert.equal(words.SEARCH_HELP, "Up and down to move, Enter to open, Esc to close. Press / anywhere to search.");
    assert.equal(words.SEARCH_LABEL, "Search people and groups");
    // Somebody a query can find a programme for is promised programmes; everybody else keeps today's words.
    assert.equal(words.SEARCH_LABEL_WITH_PROGRAMMES, "Search people, groups and programmes");
    assert.equal(words.searchLabelFor(true), "Search people, groups and programmes");
    assert.equal(words.searchLabelFor(false), "Search people and groups");
  });

  test("the words carry no dash of either kind, no gendered pronoun and never the word the house bans", () => {
    for (const file of [
      ["lib", "search", "words.ts"],
      ["lib", "search", "model.ts"],
      ["lib", "search", "load.ts"],
      ["app", "api", "search", "route.ts"],
      ["features", "search", "PeopleSearch.tsx"],
      ["features", "search", "useSearches.ts"],
      ["features", "search", "PeopleSearch.module.css"],
    ]) {
      const source = read("src", ...file);
      assert.ok(!/[–—]/.test(source), `${file.join("/")} carries a dash`);
      assert.ok(!/\b(he|she|him|her|his|hers)\b/i.test(source), `${file.join("/")} carries a gendered pronoun`);
      assert.ok(!/collat/i.test(source), file.join("/"));
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Who may
// ---------------------------------------------------------------------------

describe("who may search, as every persona", () => {
  test("GET answers the three who run things, and everybody else one refusal", async (t) => {
    freshTerm(t);
    for (const persona of PERSONA_NAMES) {
      const uid = Object.hasOwn(PERSONA_UID, persona) ? PERSONA_UID[persona] : "nobody";
      const response = await call(uid, route.GET);
      if (["admin", "lead", "facilitator"].includes(persona)) {
        assert.equal(response.status, 200, persona);
        // Programmes are promised to an admin and a programme's lead, never to a facilitator who leads nothing.
        assert.deepEqual(response.body, { searches: true, programmes: persona !== "facilitator" }, persona);
      } else {
        assert.equal(response.status, 403, persona);
        assert.deepEqual(response.body, { error: words.SEARCH_REFUSAL.notYours }, persona);
      }
      assert.equal(response.headers["Cache-Control"], "no-store", persona);
    }
  });

  test("POST: the three who run things meet the query check, and everybody else the same refusal", async (t) => {
    freshTerm(t);
    for (const persona of PERSONA_NAMES) {
      const uid = Object.hasOwn(PERSONA_UID, persona) ? PERSONA_UID[persona] : "nobody";
      const empty = await call(uid, route.POST, {});
      const asked = await call(uid, route.POST, { body: { query: "amara" } });
      if (["admin", "lead", "facilitator"].includes(persona)) {
        assert.equal(empty.status, 400, persona);
        assert.deepEqual(empty.body, { error: words.SEARCH_REFUSAL.badQuery }, persona);
        assert.equal(asked.status, 200, persona);
        assert.deepEqual(Object.keys(asked.body).sort(), ["groups", "moreGroups", "morePeople", "people"], persona);
      } else {
        // The same answer whatever the body, so nothing about the request or anybody in it is learned.
        for (const response of [empty, asked]) {
          assert.equal(response.status, 403, persona);
          assert.deepEqual(response.body, { error: words.SEARCH_REFUSAL.notYours }, persona);
        }
      }
    }
  });

  test("the people who run nothing: a reviewer, SU-recognised committee, committee, a member, a waiting or refused account", async (t) => {
    freshTerm(t);
    for (const uid of ["lloyd", "sue", "iris", "amara", "penny", "refused", null]) {
      assert.equal(await load.searcherOf(w.world.db, uid === null ? null : sessionFor(uid)), null, String(uid));
    }
    assert.deepEqual(await load.searcherOf(w.world.db, sessionFor("zach")), { kind: "admin" });
    const claudia = await load.searcherOf(w.world.db, sessionFor("claudia"));
    assert.deepEqual(claudia.leads.map((led) => led.programmeId), [AGI]);
    assert.deepEqual(claudia.facilitates, []);
    const tom = await load.searcherOf(w.world.db, sessionFor("tom"));
    assert.deepEqual([tom.leads, tom.facilitates.map((group) => group.id)], [[], [C]]);
  });

  test("a lead the admissions pages would not admit is no lead here: the flag the page gate asks is gone", async (t) => {
    freshTerm(t, { "users/claudia": { ...seed()["users/claudia"], admissionsReviewer: false } });
    assert.equal(await load.searcherOf(w.world.db, sessionFor("claudia")), null);
    assert.equal((await call("claudia", route.GET)).status, 403);
  });

  test("a lead is found only where the admissions pages' gate admits them: the same predicate, word for word", () => {
    const gate = read("src", "lib", "firebase", "pageGates.ts");
    assert.match(gate, /canAuthorAdmissionRound\(user\) \|\| namedReviewer/, "the tree's gate changed: search's predicate must follow it");
    assert.match(gate, /user\?\.admissionsReviewer === true &&\s+holdsStanding\(user, "admissionRounds\.reviewerUids"\)/);
    assert.match(
      read("src", "lib", "search", "load.ts"),
      /return canAuthorAdmissionRound\(user\) \|\| \(user\.admissionsReviewer === true && holdsStanding\(user, "admissionRounds\.reviewerUids"\)\);/,
    );
  });

  test("a facilitator of an archived group, or of a run being destroyed, runs nothing", async (t) => {
    freshTerm(t, { [`courseGroups/${C}`]: { ...seed()[`courseGroups/${C}`], archived: true } });
    assert.equal(await load.searcherOf(w.world.db, sessionFor("tom")), null);
    w.reset(seed({ [`courseRuns/${RUN.agi}`]: { ...seed()[`courseRuns/${RUN.agi}`], destroying: true } }), { now: () => new Date() });
    assert.equal(await load.searcherOf(w.world.db, sessionFor("tom")), null);
  });

  test("in a view-as session the route answers as the person viewed would be answered", async (t) => {
    freshTerm(t);
    // Tom, viewed: his own answer, nothing of the admin's.
    const own = await call("tom", route.POST, { body: { query: "group" } });
    const viewed = await call("tom", route.POST, { body: { query: "group" }, viewAs: true });
    assert.deepEqual(viewed, own);
    assert.deepEqual(groupNames(viewed.body), ["Group C"]);
    // A member, viewed: the refusal everybody who runs nothing gets.
    const member = await call("amara", route.POST, { body: { query: "group" }, viewAs: true });
    assert.deepEqual([member.status, member.body], [403, { error: words.SEARCH_REFUSAL.notYours }]);
  });
});

// ---------------------------------------------------------------------------
// 3. What each reader finds
// ---------------------------------------------------------------------------

describe("what each reader finds", () => {
  test("an admin: every account, by the full name the committee reads, to their page under Members", async (t) => {
    freshTerm(t);
    const answer = await search("zach", "amara");
    assert.equal(answer.people.length, 1);
    const [amara] = answer.people;
    assert.equal(amara.href, "/admin/members/amara");
    assert.equal(amara.name, "Amara Okafor");
    // Her place this term, from her seat: a programme and a group, never a role or a status.
    assert.match(amara.line, /^AGI Strategy · Group [ABC]$/);
    // A waiting account is an account: Approvals and the Members page show it to an admin.
    assert.deepEqual(names(await search("zach", "penny")), ["Penny Lane"]);
    // Somebody on no course has no line.
    assert.deepEqual((await search("zach", "iris walker")).people, [{ name: "Iris Walker", line: "", href: "/admin/members/iris" }]);
  });

  test("an admin: every group of every run, to its page under the programme that names its run", async (t) => {
    freshTerm(t);
    const agi = await search("zach", "agi");
    assert.deepEqual(agi.groups.map((hit) => hit.href).sort(), [A, B, C].map((id) => `${programmePath(AGI)}/groups/${id}`).sort());
    for (const hit of agi.groups) assert.match(hit.line, /^AGI Strategy · /);
    const tais = await search("zach", "technical group a");
    assert.deepEqual(tais.groups.map((hit) => [hit.name, hit.href]), [["Group A", `${programmePath(TAIS)}/groups/${TAIS_GROUP}`]]);
    assert.match(tais.groups[0].line, /^Technical AI Safety · .+ · Thursdays 6pm$/);
  });

  test("an admin's group on a run no programme names leads to the group's own page", async (t) => {
    const docs = seed();
    const form = structuredClone(docs[`admissionRounds/${ROUND}`]);
    form.programmes[TAIS].runId = null;
    freshTerm(t, { [`admissionRounds/${ROUND}`]: form });
    const answer = await search("zach", "technical");
    assert.deepEqual(answer.groups.map((hit) => hit.href), [`/learn/${RUN.tais}/group/${TAIS_GROUP}`]);
  });

  test("a programme's lead: exactly the People tab's rows, by its names, each to their row on it", async (t) => {
    freshTerm(t);
    const tab = await peopleLoad.loadProgrammePeople(w.world.db, sessionFor("claudia"), ROUND, AGI);
    assert.equal(tab.status, "ok");
    assert.ok(tab.view.rows.length > 0);
    const found = new Map();
    for (const row of tab.view.rows) {
      const answer = await search("claudia", row.name);
      const hit = answer.people.find((each) => each.href === `${programmePath(AGI)}/people?person=${row.uid}`);
      assert.ok(hit, `${row.name} is not found`);
      assert.equal(hit.name, row.name);
      assert.equal(hit.line, row.group ? `AGI Strategy · ${row.group}` : "AGI Strategy");
      found.set(row.uid, hit);
    }
    // And nobody else: every person Claudia can find is one of the tab's rows.
    const rows = new Set(tab.view.rows.map((row) => `${programmePath(AGI)}/people?person=${row.uid}`));
    for (const query of ["an", "ar", "er", "ia", "in", "ra", "ah", "ev", "en", "om", "ri", "ss", "el", "on"]) {
      for (const hit of (await search("claudia", query)).people) {
        assert.ok(rows.has(hit.href), `${hit.name} is not on the People tab`);
      }
    }
  });

  test("a programme's lead: the run's groups, each to its page under the programme, and no other run's", async (t) => {
    freshTerm(t);
    const answer = await search("claudia", "group");
    assert.deepEqual(answer.groups.map((hit) => hit.href).sort(), [A, B, C].map((id) => `${programmePath(AGI)}/groups/${id}`).sort());
  });

  test("a lead of another programme finds nobody of this one, by the answer a name nobody holds gets", async (t) => {
    freshTerm(t);
    const nobody = await search("tess", "zzqx");
    // Amara is on AGI Strategy; Tess leads Technical AI Safety and facilitates its group.
    assert.deepEqual(await search("tess", "amara"), nobody);
    assert.deepEqual(await search("claudia", "wen zhao"), await search("claudia", "zzqx"));
    // Tess finds her own, once, though she both leads the programme and facilitates the group:
    // the People tab's row, the first of her lists.
    const wen = await search("tess", "wen");
    assert.deepEqual(wen.people.map((hit) => [hit.name, hit.href]), [["Wen Zhao", `${programmePath(TAIS)}/people?person=wen`]]);
  });

  test("a facilitator: exactly their group page's people, by the page's names, each to that page", async (t) => {
    freshTerm(t);
    const run = (await w.loadTs(join("lib", "firestore", "courses.ts"))).normalizeCourseRun(RUN.agi, stored(`courseRuns/${RUN.agi}`));
    const group = (await w.loadTs(join("lib", "firestore", "courseGroups.ts"))).normalizeCourseGroup(C, stored(`courseGroups/${C}`));
    const page = await facilitatorGroup.loadFacilitatorGroup(w.world.db, run, group, { isAdmin: false, actor: sessionFor("tom") }, new Date());
    const listed = [...page.people, ...page.leavers];
    assert.ok(listed.length > 0);
    for (const row of listed) {
      const hit = (await search("tom", row.name)).people.find((each) => each.name === row.name);
      assert.ok(hit, `${row.name} is not found`);
      assert.equal(hit.href, `/learn/${RUN.agi}/group/${C}`);
      assert.equal(hit.line, `AGI Strategy · ${group.name}`);
    }
    // Nobody the page does not list, by the same answer a name nobody holds gets.
    const others = ["users/amara", "users/rahul", "users/sofia", "users/bea", "users/dev", "users/tariq"]
      .map((path) => stored(path)?.displayName)
      .filter((name) => name && !listed.some((row) => row.name === name));
    assert.ok(others.length > 0, "everybody is in Group C");
    for (const name of others) assert.deepEqual(await search("tom", name), await search("tom", "zzqx"), name);
  });

  test("a facilitator of two groups finds both, and the run's third group is not theirs", async (t) => {
    freshTerm(t);
    const answer = await search("sofia", "group");
    assert.deepEqual(answer.groups.map((hit) => hit.href).sort(), [A, B].map((id) => `/learn/${RUN.agi}/group/${id}`).sort());
  });

  test("nothing is matched on an address, for anybody", async (t) => {
    freshTerm(t);
    for (const who of ["zach", "claudia", "tom"]) {
      for (const query of ["example.com", "amara@example.com", "@example"]) {
        const answer = await search(who, query);
        assert.deepEqual([answer.people, answer.groups], [[], []], `${who} "${query}"`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. What a result carries
// ---------------------------------------------------------------------------

describe("what a result carries", () => {
  test("a name, a line and an address: never an email address, a role, a status or a uid a page does not already carry", async (t) => {
    freshTerm(t);
    for (const who of ["zach", "claudia", "tess", "tom", "sofia"]) {
      for (const query of ["a", "an", "ar", "group", "ra", "en", "ia"]) {
        const response = await call(who, route.POST, { body: { query } });
        assert.equal(response.status, 200);
        const text = JSON.stringify(response.body);
        assert.ok(!text.includes("@"), `${who} "${query}" carries an address: ${text}`);
        assert.ok(!/\b(admin|committee|member|pending|rejected|withdrawn|removed|active)\b/i.test(text.replace(/\/admin\/[^"]*/g, "")), `${who} "${query}": ${text}`);
        for (const hit of [...response.body.people, ...response.body.groups]) {
          assert.deepEqual(Object.keys(hit).sort(), ["href", "line", "name"]);
          assert.ok(hit.href.startsWith("/admin/") || hit.href.startsWith("/learn/"), hit.href);
        }
        // A facilitator's people lead to their group's page: no uid of anybody's leaves the route.
        if (who === "tom" || who === "sofia") for (const hit of response.body.people) assert.match(hit.href, /^\/learn\/[^/]+\/group\/[^/?]+$/);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Nothing kept
// ---------------------------------------------------------------------------

describe("nothing is kept and nothing is logged", () => {
  test("a search writes nothing, and a failure logs neither the query nor what it found", async (t) => {
    freshTerm(t);
    const before = w.everything();
    for (const who of ["zach", "claudia", "tom"]) await search(who, "amara");
    assert.equal(w.everything(), before);

    const logged = [];
    for (const method of ["log", "info", "warn", "error", "debug"]) {
      t.mock.method(console, method, (...args) => logged.push(args.map(String).join(" ")));
    }
    const collection = w.world.db.collection.bind(w.world.db);
    t.mock.method(w.world.db, "collection", (path) => {
      if (path === "courseGroups") throw new Error("the database is down");
      return collection(path);
    });
    const failed = await call("zach", route.POST, { body: { query: "secretname" } });
    assert.deepEqual([failed.status, failed.body], [500, { error: words.SEARCH_REFUSAL.failed }]);
    assert.ok(logged.length > 0);
    for (const line of logged) assert.ok(!line.includes("secretname"), line);
  });

  test("fewer than two letters is the empty answer, read for nobody; longer than a name is refused", async (t) => {
    freshTerm(t);
    assert.deepEqual(await search("zach", "a"), { people: [], groups: [], morePeople: false, moreGroups: false });
    const long = await call("zach", route.POST, { body: { query: "x".repeat(81) } });
    assert.deepEqual([long.status, long.body], [400, { error: words.SEARCH_REFUSAL.badQuery }]);
    const notText = await call("zach", route.POST, { body: { query: ["amara"] } });
    assert.equal(notText.status, 400);
  });

  test("one account may ask thirty times a minute, then waits, told how long", async (t) => {
    freshTerm(t);
    for (let at = 0; at < 30; at += 1) assert.equal((await call("sofia", route.POST, { body: { query: "zz" } })).status, 200, `query ${at + 1}`);
    const over = await call("sofia", route.POST, { body: { query: "zz" } });
    assert.equal(over.status, 429);
    assert.deepEqual(over.body, { error: words.SEARCH_REFUSAL.tooMany });
    assert.ok(Number(over.headers["Retry-After"]) > 0);
    // Somebody else is not held up by it.
    assert.equal((await call("tom", route.POST, { body: { query: "zz" } })).status, 200);
  });

  test("a caller who is refused is limited too, before anything decides who they are, and by address when signed out", async (t) => {
    freshTerm(t);
    for (const who of ["amara", null]) {
      // From one address, as one browser would ask.
      const ip = "10.7.7.7";
      for (let at = 0; at < 30; at += 1) assert.equal((await call(who, route.POST, { body: { query: "zz" }, ip })).status, 403, `${who} ${at + 1}`);
      // The thirty-first: refused by the limit, and nothing is read to refuse it.
      const collection = t.mock.method(w.world.db, "collection", () => {
        throw new Error("read");
      });
      const over = await call(who, route.POST, { body: { query: "zz" }, ip });
      assert.deepEqual([over.status, over.body], [429, { error: words.SEARCH_REFUSAL.tooMany }], String(who));
      collection.mock.restore();
    }
    const route_ = read("src", "app", "api", "search", "route.ts");
    for (const handler of ["GET", "POST"]) {
      const body = route_.slice(route_.indexOf(`export async function ${handler}`));
      assert.ok(body.indexOf("throttled(req") < body.indexOf("searcherOf("), `${handler} decides who the caller is before the limit`);
    }
    assert.match(route_, /const who = uid \? `uid:\$\{uid\}` : `ip:\$\{clientIp\(req\)\}`;/);
  });

  test("a lead's records are read once: a form's applications and decisions, the run, its groups and its places", async (t) => {
    freshTerm(t);
    const counted = (who) => async () => {
      const counts = {};
      const collection = w.world.db.collection.bind(w.world.db);
      const spy = t.mock.method(w.world.db, "collection", (path) => {
        counts[path] = (counts[path] ?? 0) + 1;
        return collection(path);
      });
      await search(who, "zz");
      spy.mock.restore();
      return counts;
    };
    // Claudia leads one programme: the People tab's own reads, once each, and the search's own look for groups naming her.
    const one = await counted("claudia")();
    assert.equal(one.admissionApplications, 1);
    assert.equal(one.admissionDecisions, 1);
    assert.equal(one.courseRuns, 1);
    assert.equal(one.courseEnrolments, 1);
    assert.equal(one.courseGroups, 2, "the run's groups, and the groups that name her as a facilitator");
    // Tess leads two programmes on one form: its applications and decisions are read once.
    const two = await counted("tess")();
    assert.equal(two.admissionApplications, 1);
    assert.equal(two.admissionDecisions, 1);
  });

  test("the route and the loader keep nothing: no write, no log of a query, no stored index", () => {
    for (const file of [read("src", "app", "api", "search", "route.ts"), read("src", "lib", "search", "load.ts")]) {
      const code = file.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.ok(!/\.(?:collection|doc)\([^)]*\)\s*\.(?:set|add|update|create|delete)\(/.test(code), "a write");
      assert.ok(!/\b(?:ref|reference)\.(?:set|update|create|delete)\(/.test(code), "a write");
      assert.ok(!/console\.\w+\([^)]*query/.test(code), "a query logged");
      assert.ok(!/runTransaction|batch\(|bulkWriter/.test(code), "a write");
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The pages
// ---------------------------------------------------------------------------

describe("the pages", () => {
  test("the People tab opens on one person's row and DRAWS it, for every kind of row search can return", async (t) => {
    freshTerm(t);
    const tab = await peopleLoad.loadProgrammePeople(w.world.db, sessionFor("claudia"), ROUND, AGI);
    const [base] = tab.view.rows;
    const path = `${programmePath(AGI)}/applications/`;
    const row = (uid, name, over) => ({
      ...base,
      uid,
      name,
      firstName: name.split(" ")[0],
      personHref: `${programmePath(AGI)}/people/${uid}`,
      applicationHref: `${path}${uid}`,
      ...over,
    });
    const kinds = {
      // Holding a place, in a group, said they are coming: under Everyone.
      holdingInGroup: row("k-holding", "Kit Holding", { category: "holding", group: "Group C", coming: { kind: "yes", on: "Mon 26 Oct" }, status: { kind: "holding" } }),
      // Holding a place, in no group, not said they are coming, nor when they are free.
      holdingNoGroup: row("k-nogroup", "Nia Nogroup", { category: "holding", group: null, coming: { kind: "not-yet" }, free: { kind: "not-said" }, status: { kind: "holding" } }),
      // Gave the place back.
      gaveBack: row("k-gave", "Gus Gave", { category: "gave-back", group: null, coming: { kind: "no" }, status: { kind: "gave-back", reason: null, on: null } }),
      // Left the run after it was theirs.
      left: row("k-left", "Lea Left", { category: "gave-back", group: null, coming: { kind: "no" }, status: { kind: "left", on: null, by: "themselves" } }),
      // Invited and not answered: Everyone leaves them out, so the tab opens on Invited.
      invited: row("k-invited", "Ivo Invited", { category: "invited", group: null, coming: { kind: "not-yet" }, status: { kind: "invited", until: null, on: null } }),
    };
    // More rows sharing one name than one page holds, so "Show more" would hide the last of them.
    const twins = Array.from({ length: 14 }, (_, at) => row(`k-twin-${at}`, "Sam Sample", { category: "holding", group: "Group A", status: { kind: "holding" } }));
    const rows = [...Object.values(kinds), ...twins];
    const view = { ...tab.view, rows };
    const drawn = (person) => renderToStaticMarkup(createElement(ProgrammePeople, { view, person }));
    /** How many rows of the table carry this name: the name cell of a drawn row, its link to the person's page. */
    const rowsNamed = (html, name) => html.split(`class="nameLink">${name}</a>`).length - 1;
    // Opened on nobody: Everyone and one page of twelve, so the invited row is not drawn, nor every twin.
    assert.equal(rowsNamed(drawn(null), "Ivo Invited"), 0);
    assert.ok(rowsNamed(drawn(null), "Sam Sample") < 14);
    for (const [kind, each] of Object.entries(kinds)) {
      const html = drawn(each.uid);
      assert.equal(rowsNamed(html, each.name), 1, `${kind}: the row is not drawn`);
      assert.ok(html.includes(`value="${each.name}"`), `${kind}: the search is not set`);
    }
    // The last of fourteen with one name: every one of them drawn, so it is.
    assert.equal(rowsNamed(drawn(twins.at(-1).uid), "Sam Sample"), 14);
    assert.deepEqual(filters.openedOn(rows, "k-invited", 12), { search: "Ivo Invited", filter: "invited", shown: 12 });
    assert.deepEqual(filters.openedOn(rows, "k-gave", 12), { search: "Gus Gave", filter: "everyone", shown: 12 });
    assert.equal(filters.openedOn(rows, "k-twin-13", 12).shown, 24);
    // A uid that is no row opens the tab as usual.
    assert.equal(filters.openedOn(rows, "nobody", 12), null);
    assert.equal(filters.openedOn(rows, null, 12), null);
    // Every filter that can hide a row is handled: each row opens under a filter that holds it.
    for (const each of rows) assert.ok(filters.rowMatches(each, filters.openedOn(rows, each.uid, 12).filter), each.uid);
    const page = read("src", "app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "people", "page.tsx");
    // The uid is one of the tab's own rows, after its own gate: anything else opens the tab as usual.
    assert.match(page, /view\.rows\.some\(\(row\) => row\.uid === personParam\) \? personParam : null/);
  });

  test("the shell draws the box and listens for the key only for somebody the route answers", () => {
    const shell = read("src", "layout", "AppShell.tsx");
    assert.match(shell, /const \{ searches, programmes: findsProgrammes \} = useSearches\(writesMessages \|\| admissionsReviewer\);/);
    assert.match(shell, /useSlashToSearch\(searches && !searchOpen && !loading,/);
    assert.equal((shell.match(/\{searches && <SearchButton programmes=\{findsProgrammes\}/g) ?? []).length, 1);
    assert.equal((shell.match(/\{searches && \(\s*<SearchButton\s+programmes=\{findsProgrammes\}/g) ?? []).length, 1);
    assert.match(shell, /\{searches && <PeopleSearch open=\{searchOpen\} programmes=\{findsProgrammes\}/);
    const hook = read("src", "features", "search", "useSearches.ts");
    assert.match(hook, /fetch\("\/api\/search", \{ cache: "no-store" \}\)/);
    assert.match(hook, /const searches = res\.ok && json\?\.searches === true;/);
    // Programmes are promised only on the route's own yes, and never without search itself.
    assert.match(hook, /programmes: searches && json\?\.programmes === true/);
    assert.match(hook, /if \(role === "admin" && uid !== null\) return \{ searches: true, programmes: true \};/);
    // A member who could run nothing on what the shell knows is never asked about: no read for them.
    assert.match(hook, /const asks = uid !== null && couldRunThings && \(role === "member" \|\| role === "committee"\);/);
  });

  test("the key is never taken from a field or an editor, with a modifier, or from another dialog", () => {
    const box = read("src", "features", "search", "PeopleSearch.tsx");
    for (const needle of [
      "target.isContentEditable",
      'tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT"',
      "event.ctrlKey || event.metaKey || event.altKey",
      "event.defaultPrevented",
      "event.isComposing",
      '[role="dialog"][aria-modal="true"]',
    ]) {
      assert.ok(box.includes(needle), needle);
    }
    // Enter never asks twice for the same words: not while they are on their way, nor once answered (with nothing or not).
    assert.ok(box.includes('if (state.kind === "waiting" && state.query === typed) return;'));
    assert.match(box, /if \(state\.kind === "answered" && state\.query === typed\) \{\s+if \(active >= 0 && hits\[active\]\) go\(hits\[active\]\);\s+return;\s+\}/);
    // It asks after a pause or on Enter, and the query goes in a body, never an address.
    assert.match(box, /const PAUSE_MS = \d{3};/);
    assert.match(box, /method: "POST"/);
    assert.ok(!/\/api\/search\?/.test(box));
  });
});

// ---------------------------------------------------------------------------
// 7. The facilitator guide
// ---------------------------------------------------------------------------

describe("the facilitator guide", () => {
  const guidePath = (courseId) => `/learn/facilitator-guide/${courseId}`;
  const guideHrefs = (answer) => (answer.guides ?? []).map((hit) => hit.href).sort();
  /** The answer's people and groups, the lists that were there before guides. */
  const listsOf = (answer) => ({ people: answer.people, groups: answer.groups, morePeople: answer.morePeople, moreGroups: answer.moreGroups });

  test("a facilitator finds their course's guide by \"guide\", \"facilitator guide\" and the course's title, as its own list", async (t) => {
    freshTerm(t);
    for (const query of ["guide", "facilitator guide", "Facilitator Guide", "agi strategy", "facilitator agi"]) {
      const answer = await search("tom", query);
      assert.deepEqual(answer.guides, [{ name: "Facilitator guide", line: "AGI Strategy Fellowship", href: guidePath(COURSE.agi) }], query);
    }
    // Sofia facilitates two groups of the one course: its guide once.
    assert.deepEqual(guideHrefs(await search("sofia", "guide")), [guidePath(COURSE.agi)]);
    // The answer's other lists are what they were: "guide" names no person and no group.
    assert.deepEqual(listsOf(await search("tom", "guide")), listsOf(await search("tom", "zzqx")));
  });

  test("a lead finds the guide of a course they facilitate on, and none of a course they only lead", async (t) => {
    freshTerm(t);
    // Tess leads Technical AI Safety and facilitates its group.
    assert.deepEqual(guideHrefs(await search("tess", "guide")), [guidePath(COURSE.tais)]);
    // Claudia leads AGI Strategy and facilitates nothing: the answer every query without a guide gets, no `guides` in it.
    const claudia = await search("claudia", "guide");
    assert.ok(!Object.hasOwn(claudia, "guides"), JSON.stringify(claudia));
    assert.deepEqual(claudia, await search("claudia", "zzqx"));
  });

  test("an admin finds the guide of a course they facilitate on, and none while they facilitate nothing", async (t) => {
    freshTerm(t);
    const before = await search("zach", "guide");
    assert.ok(!Object.hasOwn(before, "guides"), JSON.stringify(before));
    w.world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "zach"] });
    assert.deepEqual(guideHrefs(await search("zach", "guide")), [guidePath(COURSE.agi)]);
    assert.deepEqual(listsOf(await search("zach", "guide")), listsOf(before));
  });

  test("a learner and somebody who runs nothing are refused as before, whatever they type", async (t) => {
    freshTerm(t);
    for (const uid of ["amara", "dev", "iris", "sue", "lloyd"]) {
      const response = await call(uid, route.POST, { body: { query: "facilitator guide" } });
      assert.deepEqual([response.status, response.body], [403, { error: words.SEARCH_REFUSAL.notYours }], uid);
    }
  });

  test("offered for exactly the courses the guide's own gate admits the searcher to as a facilitator", async (t) => {
    freshTerm(t);
    const gateAdmits = async (uid) => {
      const out = [];
      for (const courseId of Object.values(COURSE)) {
        const reader = await guideAccess.facilitatorGuideReader(w.world.db, sessionFor(uid), courseId);
        if (reader?.as === "facilitator") out.push(guidePath(courseId));
      }
      return out.sort();
    };
    for (const uid of ["tom", "sofia", "tess", "claudia", "rahul"]) {
      const response = await call(uid, route.POST, { body: { query: "guide" } });
      const offered = response.status === 200 ? guideHrefs(response.body) : [];
      assert.deepEqual(offered, await gateAdmits(uid), uid);
    }
    // A group whose own course is not its run's: the gate refuses it, and search offers nothing.
    w.world.db.poke(`courseGroups/${C}`, { courseId: COURSE.other });
    assert.deepEqual(await gateAdmits("tom"), []);
    assert.deepEqual(guideHrefs(await search("tom", "guide")), []);
    // An admin is admitted to every guide as an admin: offered only where the admin facilitates.
    for (const courseId of Object.values(COURSE)) {
      assert.equal((await guideAccess.facilitatorGuideReader(w.world.db, sessionFor("zach"), courseId))?.as, "admin");
    }
  });

  test("a group archived, or a run being destroyed, takes its guide off the list with the group", async (t) => {
    freshTerm(t, { [`courseGroups/${A}`]: { ...seed()[`courseGroups/${A}`], archived: true }, [`courseGroups/${B}`]: { ...seed()[`courseGroups/${B}`], archived: true } });
    assert.equal(await load.searcherOf(w.world.db, sessionFor("sofia")), null);
    w.reset(seed({ [`courseRuns/${RUN.tais}`]: { ...seed()[`courseRuns/${RUN.tais}`], destroying: true } }), { now: () => new Date() });
    assert.deepEqual(guideHrefs(await search("tess", "guide")), []);
  });

  /**
   * What one query reads, as the route answers it (who may search, then the
   * answer): every document and query the store answered (`reads`), how many
   * `getAll`s, `doc`s and `collectionGroup`s were asked, and each collection
   * by name. The numbers without a guide are the reads search made before the
   * guide was offered; a matched guide adds one `getAll` of its course.
   */
  async function counted(t, who, query) {
    const db = w.world.db;
    const out = { reads: 0, getAll: 0, doc: 0, collectionGroup: 0, collections: {} };
    const collection = db.collection.bind(db);
    const getAll = db.getAll.bind(db);
    const spies = [
      t.mock.method(db, "collection", (path) => {
        out.collections[path] = (out.collections[path] ?? 0) + 1;
        return collection(path);
      }),
      t.mock.method(db, "getAll", (...refs) => {
        out.getAll += 1;
        return getAll(...refs);
      }),
    ];
    // The test store has neither: a call to either is counted, and then fails the search loudly.
    for (const name of ["doc", "collectionGroup"]) {
      const had = db[name];
      db[name] = (...args) => {
        out[name] += 1;
        if (typeof had !== "function") throw new Error(`search called db.${name}`);
        return had.apply(db, args);
      };
      t.after(() => {
        if (had === undefined) delete db[name];
        else db[name] = had;
      });
    }
    const before = db.stats.reads;
    await search(who, query);
    out.reads = db.stats.reads - before;
    for (const spy of spies) spy.mock.restore();
    return out;
  }

  test("what each searcher reads, pinned: nothing more without a guide, and one course read when a guide matched", async (t) => {
    freshTerm(t);
    // A facilitator (Tom): his groups and their run's records, and the forms.
    const tom = { courseGroups: 2, courseRuns: 2, admissionRounds: 1, courseEnrolments: 1, courseAttendance: 1, config: 1, users: 7 };
    assert.deepEqual(await counted(t, "tom", "zzqx"), { reads: 15, getAll: 2, doc: 0, collectionGroup: 0, collections: tom });
    assert.deepEqual(await counted(t, "tom", "guide"), { reads: 16, getAll: 3, doc: 0, collectionGroup: 0, collections: { ...tom, courses: 1 } });
    // A lead who facilitates (Tess).
    const tess = { admissionRounds: 2, courseGroups: 3, courseRuns: 3, admissionApplications: 1, admissionDecisions: 1, courseEnrolments: 2, courseAttendance: 1, config: 1, users: 3 };
    assert.deepEqual(await counted(t, "tess", "zzqx"), { reads: 17, getAll: 2, doc: 0, collectionGroup: 0, collections: tess });
    assert.deepEqual(await counted(t, "tess", "guide"), { reads: 18, getAll: 3, doc: 0, collectionGroup: 0, collections: { ...tess, courses: 1 } });
    // A lead who facilitates nothing (Claudia), and an admin who facilitates nothing: no guide, nothing more, whatever is typed.
    const claudia = { reads: 7, getAll: 0, doc: 0, collectionGroup: 0, collections: { admissionRounds: 1, courseGroups: 2, admissionApplications: 1, admissionDecisions: 1, courseRuns: 1, courseEnrolments: 1 } };
    assert.deepEqual(await counted(t, "claudia", "zzqx"), claudia);
    assert.deepEqual(await counted(t, "claudia", "guide"), claudia);
    const zach = { reads: 5, getAll: 1, doc: 0, collectionGroup: 0, collections: { users: 1, courseGroups: 1, admissionRounds: 1, courseRuns: 2 } };
    assert.deepEqual(await counted(t, "zach", "zzqx"), zach);
    assert.deepEqual(await counted(t, "zach", "guide"), zach);
  });

  test("search and the guide's own gate give the same answer in every state where the two could part", async (t) => {
    freshTerm(t);
    const gateAdmits = async (uid) => {
      const out = [];
      for (const courseId of Object.values(COURSE)) {
        const reader = await guideAccess.facilitatorGuideReader(w.world.db, sessionFor(uid), courseId);
        if (reader?.as === "facilitator") out.push(guidePath(courseId));
      }
      return out.sort();
    };
    const run = `courseRuns/${RUN.agi}`;
    const STATES = {
      "Tom's group archived": (docs) => ({ ...docs, [`courseGroups/${C}`]: { ...docs[`courseGroups/${C}`], archived: true } }),
      "the run being destroyed": (docs) => ({ ...docs, [run]: { ...docs[run], destroying: true } }),
      "the course being destroyed": (docs) => ({ ...docs, [`courses/${COURSE.agi}`]: { ...docs[`courses/${COURSE.agi}`], destroying: true } }),
      "the course's document gone": (docs) => {
        const out = { ...docs };
        delete out[`courses/${COURSE.agi}`];
        return out;
      },
      "Tom no longer approved": (docs) => ({ ...docs, "users/tom": { ...docs["users/tom"], role: "pending" } }),
      "the run a draft": (docs) => ({ ...docs, [run]: { ...docs[run], status: "draft" } }),
      "the run completed": (docs) => ({ ...docs, [run]: { ...docs[run], status: "completed" } }),
      "the run cancelled": (docs) => ({ ...docs, [run]: { ...docs[run], status: "cancelled" } }),
      "the run archived": (docs) => ({ ...docs, [run]: { ...docs[run], archived: true } }),
      "Tom's group naming no course": (docs) => {
        const group = { ...docs[`courseGroups/${C}`] };
        delete group.courseId;
        return { ...docs, [`courseGroups/${C}`]: group };
      },
    };
    assert.equal(Object.keys(STATES).length, 10);
    for (const [state, change] of Object.entries(STATES)) {
      w.reset(change(seed()), { now: () => new Date() });
      for (const uid of ["tom", "sofia", "tess", "rahul"]) {
        const response = await call(uid, route.POST, { body: { query: "guide" } });
        const offered = response.status === 200 ? guideHrefs(response.body) : [];
        assert.deepEqual(offered, await gateAdmits(uid), `${state}: ${uid}`);
      }
    }
  });

  test("a guide's line is its course's own title, as the guide's page names it", async (t) => {
    freshTerm(t, { [`courses/${COURSE.agi}`]: { ...seed()[`courses/${COURSE.agi}`], title: "AGI Strategy" } });
    assert.deepEqual((await search("tom", "guide")).guides, [{ name: "Facilitator guide", line: "AGI Strategy", href: guidePath(COURSE.agi) }]);
  });

  test("a guide carries a name, a line and an address, like every hit, and only when it matched", async (t) => {
    freshTerm(t);
    const answer = await search("tom", "guide");
    assert.deepEqual(Object.keys(answer).sort(), ["groups", "guides", "moreGroups", "morePeople", "people"]);
    for (const hit of answer.guides) assert.deepEqual(Object.keys(hit).sort(), ["href", "line", "name"]);
    // A query that finds no guide answers the shape it always had.
    assert.deepEqual(Object.keys(await search("tom", "amara")).sort(), ["groups", "moreGroups", "morePeople", "people"]);
    // The pure half: no guides in the world, no `guides` in the answer; never capped.
    const world = { people: [], groups: [] };
    assert.ok(!Object.hasOwn(model.searchWorld(world, "guide"), "guides"));
    const many = Array.from({ length: 9 }, (_, at) => model.guideCandidate(`c${at}`, `Course ${at}`, `/g/${at}`));
    assert.equal(model.searchWorld({ ...world, guides: many }, "guide").guides.length, 9);
    // One per course, however many groups lead to it.
    assert.equal(model.searchWorld({ ...world, guides: [many[0], many[0]] }, "guide").guides.length, 1);
  });

  test("the box draws Guides only when the answer has one, after the two lists, and moves through it with them", () => {
    const box = read("src", "features", "search", "PeopleSearch.tsx");
    assert.match(box, /function guidesOf\(answer: SearchAnswer\): SearchHit\[\] \{\s+return Array\.isArray\(answer\.guides\) \? answer\.guides : \[\];\s+\}/);
    assert.match(box, /\[\.\.\.programmesOf\(state\.answer\), \.\.\.state\.answer\.people, \.\.\.state\.answer\.groups, \.\.\.guidesOf\(state\.answer\)\]/);
    assert.match(box, /\{guides\.length > 0 \? \(\s+<section/);
    // Guides come after the programmes, the people and the groups, in the keys' order too.
    assert.match(box, /const peopleAt = programmes\.length;/);
    assert.match(box, /const groupsAt = peopleAt \+ \(answered\?\.answer\.people\.length \?\? 0\);/);
    assert.match(box, /const guidesAt = groupsAt \+ \(answered\?\.answer\.groups\.length \?\? 0\);/);
    assert.match(box, /renderList\(guides, guidesAt\)/);
    assert.equal(words.SEARCH_HEADINGS.guides, "Guides");
    // When only a guide (or a programme) matched, the two empty lists are not drawn above it.
    assert.match(
      box,
      /const noPeopleOrGroups =\s+\(guides\.length > 0 \|\| programmes\.length > 0\) &&\s+answered !== null &&\s+answered\.answer\.people\.length === 0 &&\s+answered\.answer\.groups\.length === 0;/,
    );
    assert.match(box, /\{noPeopleOrGroups \? null : \(/);
    // The two lists every other answer draws are drawn as before, with their empty states.
    assert.match(box, /answered\.answer\.people\.length === 0 \? <p className=\{styles\.empty\}>\{noPeopleWords\(answered\.query\)\}/);
    assert.match(box, /answered\.answer\.groups\.length === 0 \? <p className=\{styles\.empty\}>\{noGroupsWords\(answered\.query\)\}/);
  });
});

// ---------------------------------------------------------------------------
// 8. Programmes
// ---------------------------------------------------------------------------

describe("programmes", () => {
  const overviewOf = (programmeId) => `${programmePath(programmeId)}/overview`;
  const programmeHrefs = (answer) => (answer.programmes ?? []).map((hit) => hit.href).sort();

  test("an admin finds every programme on every form by its name or its term's, first, each to its Overview with its stage", async (t) => {
    freshTerm(t);
    const agi = await search("zach", "agi");
    assert.equal(agi.programmes.length, 1);
    assert.equal(agi.programmes[0].name, "AGI Strategy");
    assert.match(agi.programmes[0].line, /^Fellowship · Autumn 2026 · Lead: Claudia /);
    assert.equal(agi.programmes[0].href, overviewOf(AGI));
    // The day after AGI Strategy's last session: its run's own calendar is over.
    assert.equal(agi.programmes[0].chip, "Finished");
    const term = await search("zach", "autumn 2026");
    assert.deepEqual(programmeHrefs(term), [overviewOf(AGI), overviewOf(INCUBATOR), overviewOf(TAIS)].sort());
    const chips = Object.fromEntries(term.programmes.map((hit) => [hit.name, hit.chip ?? null]));
    // Technical AI Safety's run began on Thu 3 Dec; the incubator names no run yet.
    assert.deepEqual(chips, { "AGI Strategy": "Finished", "Research incubator": "Starting", "Technical AI Safety": "Running" });
    const incubator = term.programmes.find((hit) => hit.name === "Research incubator");
    assert.match(incubator.line, /^Incubator · Autumn 2026 · Lead: Tess /);
    // A hit carries a name, a line, an address and its stage, and nothing else.
    for (const hit of term.programmes) assert.deepEqual(Object.keys(hit).sort(), ["chip", "href", "line", "name"]);
  });

  test("a programme's lead finds the programmes they lead and no other, as theirs", async (t) => {
    freshTerm(t);
    const claudia = await search("claudia", "autumn");
    assert.deepEqual(programmeHrefs(claudia), [overviewOf(AGI)]);
    assert.equal(claudia.programmes[0].line, "Fellowship · Autumn 2026 · Lead: you");
    // Another programme's name finds nothing: the answer has no programmes at all, as for a name nobody holds.
    assert.ok(!Object.hasOwn(await search("claudia", "technical"), "programmes"));
    assert.deepEqual(await search("claudia", "technical"), await search("claudia", "zzqx"));
    // Tess leads two on the form, and not AGI Strategy.
    assert.deepEqual(programmeHrefs(await search("tess", "autumn")), [overviewOf(INCUBATOR), overviewOf(TAIS)].sort());
    assert.ok(!Object.hasOwn(await search("tess", "agi strategy"), "programmes"));
  });

  test("a facilitator, a reviewer, a run's track lead and everybody else find no programme", async (t) => {
    freshTerm(t);
    // Tom facilitates a group of AGI Strategy's run and leads nothing.
    const tom = await search("tom", "agi");
    assert.ok(!Object.hasOwn(tom, "programmes"));
    // Lloyd reviews AGI Strategy and runs nothing: search is not for him at all.
    for (const uid of ["lloyd", "amara", "iris", "sue", null]) {
      const response = await call(uid, route.POST, { body: { query: "agi" } });
      assert.notEqual(response.status, 200, String(uid));
      assert.ok(!JSON.stringify(response.body).includes("AGI Strategy"), String(uid));
    }
  });

  test("in a view-as session the lead's programmes are the lead's, nobody else's", async (t) => {
    freshTerm(t);
    const viewed = await call("claudia", route.POST, { body: { query: "autumn" }, viewAs: true });
    assert.equal(viewed.status, 200);
    assert.deepEqual(programmeHrefs(viewed.body), [overviewOf(AGI)]);
  });

  test("every programme offered is one whose Overview opens for that reader, by the Programmes list's own rule", async (t) => {
    freshTerm(t);
    const { loadProgrammeRun } = await w.loadTs(join("lib", "applications", "handover", "programmeRun.ts"));
    for (const uid of ["zach", "claudia", "tess"]) {
      const answer = await search(uid, "autumn 2026");
      for (const hit of answer.programmes ?? []) {
        const programmeId = decodeURIComponent(hit.href.split("/programmes/")[1].split("/")[0]);
        const outcome = await loadProgrammeRun(w.world.db, sessionFor(uid), ROUND, programmeId);
        assert.equal(outcome.status, "ok", `${uid}: ${hit.href}`);
      }
    }
    const source = read("src", "lib", "search", "load.ts");
    // One rule: the list module's, for an admin's candidates and a lead's alike.
    assert.match(source, /programmesOpenedOn\(viewer, form\)/);
    assert.match(source, /for \(const \{ programme \} of programmesOpenedOn\(user, form\)\)/);
  });

  test("what a programme costs: nothing more when none matched, one getAll of the matched programmes' runs when one did", async (t) => {
    freshTerm(t);
    const db = w.world.db;
    async function getAllsFor(who, query) {
      let calls = 0;
      let refs = 0;
      const getAll = db.getAll.bind(db);
      const spy = t.mock.method(db, "getAll", (...asked) => {
        calls += 1;
        refs += asked.length;
        return getAll(...asked);
      });
      await search(who, query);
      spy.mock.restore();
      return { calls, refs };
    }
    const nothing = await getAllsFor("claudia", "zzqx");
    const matched = await getAllsFor("claudia", "agi strategy");
    assert.deepEqual(matched, { calls: nothing.calls + 1, refs: nothing.refs + 1 });
    const zachNothing = await getAllsFor("zach", "zzqx");
    const zachAll = await getAllsFor("zach", "autumn 2026");
    // Three programmes matched; the two that name a run past decision day name runs an admin's world already read.
    assert.deepEqual(zachAll, zachNothing);
    // A programme on a cancelled form has no chip, so its run is never asked for.
    w.world.db.poke(`admissionRounds/${ROUND}`, { status: "cancelled" });
    const cancelled = await getAllsFor("claudia", "agi strategy");
    assert.deepEqual(cancelled, nothing);
    assert.ok(!Object.hasOwn((await search("claudia", "agi strategy")).programmes[0], "chip"));
  });

  /** Another form for the same term's programmes, made `daysLater` days after this one, under its own name. */
  function anotherForm(id, label, daysLater, over = {}) {
    const form = stored(`admissionRounds/${ROUND}`);
    const made = new Date(new Date("2026-09-01T09:00:00Z").getTime() + daysLater * 86_400_000);
    const programmes = Object.fromEntries(
      Object.entries(form.programmes).map(([key, programme]) => [key, { ...programme, runId: null }]),
    );
    w.world.db.seed(`admissionRounds/${id}`, { ...form, label, slug: id, createdAt: made, programmes, ...over });
  }

  test("five terms of one programme: the newest terms first, one the form says is over last, and More programmes when more matched", async (t) => {
    freshTerm(t);
    w.world.db.poke(`admissionRounds/${ROUND}`, { createdAt: new Date("2026-09-01T09:00:00Z") });
    anotherForm("spring-2027", "Spring 2027", 100);
    anotherForm("autumn-2027", "Autumn 2027", 300);
    anotherForm("spring-2028", "Spring 2028", 450);
    anotherForm("autumn-2028", "Autumn 2028", 650);
    // The newest of all, archived: over, so after every other.
    anotherForm("archived-2029", "Spring 2029", 800, { archived: true });
    const answer = await search("zach", "agi");
    assert.deepEqual(
      answer.programmes.map((hit) => hit.line.split(" · ")[1]),
      ["Autumn 2028", "Spring 2028", "Autumn 2027", "Spring 2027"],
    );
    assert.equal(answer.moreProgrammes, true);
    // The lead, who leads it every term, is answered in the same order.
    const lead = await search("claudia", "agi");
    assert.deepEqual(lead.programmes.map((hit) => hit.line.split(" · ")[1]), ["Autumn 2028", "Spring 2028", "Autumn 2027", "Spring 2027"]);
    assert.equal(lead.moreProgrammes, true);
    // Typing the term finds the one left out.
    const older = await search("zach", "agi autumn 2026");
    assert.deepEqual(older.programmes.map((hit) => hit.href), [`${programmePath(AGI)}/overview`]);
    assert.ok(!Object.hasOwn(older, "moreProgrammes"));
  });

  test("five programmes on one term: four, by name, and More programmes; four or fewer, and no More", async (t) => {
    freshTerm(t);
    const form = stored(`admissionRounds/${ROUND}`);
    const extra = {};
    for (const [id, short] of [["alignment", "Alignment"], ["governance", "Governance and Macrostrategy"]]) {
      extra[id] = { ...form.programmes[AGI], name: `${short} Fellowship`, shortName: short, runId: null, leadUid: "zach" };
    }
    w.world.db.poke(`admissionRounds/${ROUND}`, { programmeIds: [...form.programmeIds, ...Object.keys(extra)], programmes: { ...form.programmes, ...extra } });
    const answer = await search("zach", "autumn 2026");
    assert.equal(answer.programmes.length, 4);
    assert.equal(answer.moreProgrammes, true);
    assert.deepEqual(
      answer.programmes.map((hit) => hit.name),
      ["AGI Strategy", "Alignment", "Governance and Macrostrategy", "Research incubator"],
    );
    // One fewer, and the answer says nothing of more.
    w.world.db.poke(`admissionRounds/${ROUND}`, { programmeIds: [...form.programmeIds, "alignment"] });
    const four = await search("zach", "autumn 2026");
    assert.equal(four.programmes.length, 4);
    assert.ok(!Object.hasOwn(four, "moreProgrammes"));
    assert.equal(words.SEARCH_MORE.programmes, "More programmes match. Type more of the name.");
    const box = read("src", "features", "search", "PeopleSearch.tsx");
    assert.match(box, /\{answered\.answer\.moreProgrammes \? <p className=\{styles\.more\}>\{SEARCH_MORE\.programmes\}<\/p> : null\}/);
  });

  test("the pure half: in the answer only when one matched, at most four, kept when guides are taken off", () => {
    const candidate = (name, at) => ({ name, line: "", href: `/p/${at}`, matchOn: `${name} Autumn 2026`, key: `programme:${at}` });
    const world = { people: [], groups: [], programmes: Array.from({ length: 6 }, (_, at) => candidate(`Programme ${at}`, at)) };
    assert.ok(!Object.hasOwn(model.searchWorld(world, "zzqx"), "programmes"));
    assert.equal(model.searchWorld(world, "autumn").programmes.length, model.MAX_PROGRAMMES);
    assert.equal(model.MAX_PROGRAMMES, 4);
    const answer = model.searchWorld(world, "programme 3");
    assert.deepEqual(answer.programmes.map((hit) => hit.href), ["/p/3"]);
    assert.deepEqual(model.withoutGuides({ ...answer, guides: [] }).programmes, answer.programmes);
    // More, beside them only, and kept when guides are taken off.
    const many = model.searchWorld(world, "autumn");
    assert.equal(many.moreProgrammes, true);
    assert.equal(model.withoutGuides({ ...many, guides: [] }).moreProgrammes, true);
    assert.ok(!Object.hasOwn(answer, "moreProgrammes"));
    // A candidate's order comes before how well it matched.
    const ordered = model.searchWorld(
      { people: [], groups: [], programmes: [{ ...candidate("Autumn Zeta", 9), order: 0 }, { ...candidate("Autumn Alpha", 8), order: 1 }] },
      "autumn",
    );
    assert.deepEqual(ordered.programmes.map((hit) => hit.name), ["Autumn Zeta", "Autumn Alpha"]);
    assert.ok(!Object.hasOwn(model.withoutGuides(model.searchWorld({ people: [], groups: [] }, "zzqx")), "programmes"));
  });

  test("the box draws Programmes first, with its heading, and moves through it before the people", () => {
    const box = read("src", "features", "search", "PeopleSearch.tsx");
    assert.equal(words.SEARCH_HEADINGS.programmes, "Programmes");
    assert.ok(box.indexOf("{programmes.length > 0 ? (") < box.indexOf("{noPeopleOrGroups ? null : ("), "Programmes is not drawn first");
    assert.match(box, /renderList\(programmes, 0\)/);
    assert.match(box, /renderList\(answered\.answer\.people, peopleAt\)/);
    assert.match(box, /renderList\(answered\.answer\.groups, groupsAt\)/);
    // The label is the route's yes, the box's, the button's and the dialog's alike.
    assert.match(box, /<span>\{searchLabelFor\(programmes\)\}<\/span>/);
    assert.match(box, /const label = searchLabelFor\(programmes\);\s+return \(\s+<Modal open=\{open\} onClose=\{onClose\} ariaLabel=\{label\}/);
    assert.match(box, /<span className=\{styles\.label\}>\{label\}<\/span>/);
  });
});
