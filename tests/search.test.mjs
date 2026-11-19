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
 *     the order, the caps, and the empty states the boxes draw.
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
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";
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
async function call(who, handler, { body, viewAs = false } = {}) {
  requests += 1;
  w.world.user = who === null ? null : sessionFor(who);
  w.world.viewAs = viewAs;
  const init = { method: handler.name, headers: { "Content-Type": "application/json", "x-forwarded-for": `10.8.0.${requests % 250}` } };
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
    // "leo" finds Leo and Leonie by the start of their names, and Cleo inside hers, as the board draws it.
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

  test("a line joins what it has, and the empty states say what the boards say", () => {
    assert.equal(model.lineOf(["AGI Strategy", null, " ", "Group C"]), "AGI Strategy · Group C");
    assert.equal(words.noPeopleWords(" group f "), "Nobody’s name matches “group f”.");
    assert.equal(words.noGroupsWords("leo"), "No group matches “leo”.");
    assert.equal(words.SEARCH_HELP, "Up and down to move, Enter to open, Esc to close. Press / anywhere to search.");
    assert.equal(words.SEARCH_LABEL, "Search people and groups");
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
        assert.deepEqual(response.body, { searches: true }, persona);
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
  test("the People tab opens on one person's row, with its search set to the name the row carries", async (t) => {
    freshTerm(t);
    const tab = await peopleLoad.loadProgrammePeople(w.world.db, sessionFor("claudia"), ROUND, AGI);
    const [row] = tab.view.rows;
    const html = renderToStaticMarkup(createElement(ProgrammePeople, { view: tab.view, search: row.name }));
    assert.ok(html.includes(`value="${row.name}"`), "the search is not set");
    const page = read("src", "app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "people", "page.tsx");
    // The name comes from the tab's own rows, after its own gate: a uid that is no row opens the tab as usual.
    assert.match(page, /view\.rows\.find\(\(row\) => row\.uid === personParam\)\?\.name \?\? ""/);
  });

  test("the shell draws the box and listens for the key only for somebody the route answers", () => {
    const shell = read("src", "layout", "AppShell.tsx");
    assert.match(shell, /const searches = useSearches\(writesMessages \|\| admissionsReviewer\);/);
    assert.match(shell, /useSlashToSearch\(searches && !searchOpen && !loading,/);
    assert.equal((shell.match(/\{searches && <SearchButton/g) ?? []).length, 1);
    assert.equal((shell.match(/\{searches && \(\s*<SearchButton/g) ?? []).length, 1);
    assert.match(shell, /\{searches && <PeopleSearch open=\{searchOpen\}/);
    const hook = read("src", "features", "search", "useSearches.ts");
    assert.match(hook, /fetch\("\/api\/search", \{ cache: "no-store" \}\)/);
    assert.match(hook, /res\.ok && json\?\.searches === true/);
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
    // It asks after a pause or on Enter, and the query goes in a body, never an address.
    assert.match(box, /const PAUSE_MS = \d{3};/);
    assert.match(box, /method: "POST"/);
    assert.ok(!/\/api\/search\?/.test(box));
  });
});
