/**
 * THE STANDING RED TEAM'S ANSWER KEY AGREES WITH THE TREE, offline.
 *
 * `tests/persona-route-gates.registry.mjs` says what every route and every
 * authed page answers each persona, and
 * `scripts/e2e/tests/persona-route-gates.test.mjs` drives every cell against
 * a real build with an emulator behind it. That battery needs a build, Java
 * and firebase-tools; this file needs nothing, runs under `npm test`, and is
 * what makes a NEW route fail on arrival: it walks `src/app/api` for every
 * exported handler and `src/app/(app)` for every page, and requires an entry
 * for each one, and a route or page for each entry.
 *
 * It also reads every entry for the things a person can get wrong writing
 * three thousand cells by hand: a persona name that is not one, a status
 * that is not a status, a page outcome that names no redirect, a `fields`
 * list with no 2xx to apply to, a 2xx for a persona on a route with no
 * `fields` list, an `anonymous` 2xx on a route with no `public` reason, and
 * a `why` that is a placeholder.
 *
 * THE SECOND PASS'S COLUMNS, in both directions. Every course hub route and
 * page with a segment the world fills (`asksBothSets`, walked from the
 * address) has its `theirs` and `another` columns in `REAL_ROUTES` or
 * `REAL_PAGES`, and every key there is such a route or page, so a new hub
 * route fails here until somebody writes down what each persona gets about a
 * programme they lead, staff or hold a place on, and about another one. Each
 * column is read for the same mistakes as the first pass, and for the second
 * pass's own: `theirs` names exactly the three role personas; every cell has
 * a reason; a cell the battery does not send (`ACTS`) is only ever a mutating
 * route's, only for somebody signed in and approved, and never a role
 * persona's on somebody else's programme; a column that carries a whole
 * `realDrive.body` has only refusals (401, 403, 404) and `ACTS`, so the body
 * reaches nobody its gate admits; and a stranger is refused with a 401, or
 * with the 307 to sign in where the route's first pass already gives one.
 *
 * THE EVENT WORLD'S COLUMNS, found from the code. Every route and page under
 * `src/app` whose code asks the sign-ups rule (`signupAccessFor` or
 * `decidesSignups`, `src/lib/events/signupAccess.ts`) has columns saying
 * `world: "event"`, and every such column is one of those, so a new reader or
 * decider of an event's requests is asked about two events the day it lands.
 * Their `theirs` names exactly the two event roles.
 *
 * HOW THE BATTERY READS A CELL. The pure half of the battery
 * (`scripts/e2e/lib/personaCells.mjs`) is held here too: a key's path fills
 * the world's segments and nothing else, a redirect to one of a programme's
 * records reads as the name the key gives it, every calm state is words some
 * file under src draws (so a change of wording fails here, not as a page read
 * as open) and no boundary or layout draws (they are sent with every page
 * beneath them, so their words would read as a refusal on an open page), and
 * an outcome is redirects first, then states, then the status.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";
import { exportedHandlers, walkRoutes } from "./lib/routeScan.mjs";
import {
  ACTS,
  EVENT_ROLES,
  EVENT_WORLD_SEGMENTS,
  PAGES,
  PERSONA_NAMES,
  PROGRAMME_ROLES,
  REAL_PAGES,
  REAL_ROUTES,
  REDIRECTS,
  ROLE_PERSONAS,
  ROUTES,
  STATES,
  WORLD_SEGMENTS,
  asksAboutTheEvent,
  asksBothSets,
  cellIn,
  expectedFor,
  isHubKey,
  realExpectedFor,
  rolesOf,
  segmentsOf,
} from "./persona-route-gates.registry.mjs";
import {
  normalisePath,
  pageMatches,
  pageOutcome,
  pathFor,
  queryFor,
  statesIn,
} from "../scripts/e2e/lib/personaCells.mjs";
// Safe to import: every function in it refuses unless an emulator is named,
// and this file calls none of them.
import { PERSONAS as SEEDED_PERSONAS } from "../scripts/e2e/lib/personas.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const APP_DIR = join(REPO_ROOT, "src", "app");

function routeSurfaces() {
  const out = new Map();
  for (const file of walkRoutes(join(APP_DIR, "api"))) {
    const key = `/${relative(APP_DIR, dirname(file)).split("\\").join("/")}`;
    out.set(key, exportedHandlers(stripSource(readFileSync(file, "utf8"))).map((h) => h.method));
  }
  return out;
}

function pageSurfaces() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") out.push(`/${relative(APP_DIR, dir).split("\\").join("/")}`);
    }
  };
  walk(join(APP_DIR, "(app)"));
  return out;
}

const routes = routeSurfaces();
const pages = pageSurfaces();
const STATUS = (v) => Number.isInteger(v) && v >= 200 && v < 600;
/** The world's two sets, as the battery asks them (`WORLD_SETS` in scripts/e2e/lib/personaWorld.mjs, which this file does not import). */
const SETS = ["theirs", "another"];
const ROLE_NAMES = Object.keys(ROLE_PERSONAS);
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

describe("the registry and the tree agree in both directions", () => {
  test("the walk found the tree", () => {
    assert.ok(routes.size > 150, `only ${routes.size} routes found`);
    assert.ok(pages.length > 50, `only ${pages.length} authed pages found`);
    assert.equal(PERSONA_NAMES.length, 20);
    // The five who hold a role on a record (three on a programme, two on an
    // event), each resolving through a base that is a persona of its own.
    assert.deepEqual(Object.keys(ROLE_PERSONAS), ["lead", "facilitator", "participant", "eventAuthor", "eventCollaborator"]);
    assert.deepEqual([...PROGRAMME_ROLES, ...EVENT_ROLES], Object.keys(ROLE_PERSONAS));
    // The battery seeds exactly the personas this answer key names, in its order.
    assert.deepEqual(Object.keys(SEEDED_PERSONAS), PERSONA_NAMES);
    for (const [name, base] of Object.entries(ROLE_PERSONAS)) {
      assert.ok(PERSONA_NAMES.includes(name), `${name} is not a persona`);
      assert.ok(PERSONA_NAMES.includes(base) && !(base in ROLE_PERSONAS), `${name}'s base ${base} must be a persona with no role of its own`);
    }
  });

  test("every route handler has an entry, and every route entry has a handler", () => {
    const missing = [];
    for (const [key, methods] of routes) {
      for (const method of methods) {
        if (!ROUTES[key]?.[method]) missing.push(`${key}#${method}`);
      }
    }
    assert.deepEqual(
      missing,
      [],
      "A handler with no entry in tests/persona-route-gates.registry.mjs. Decide what every " +
        "persona should get and write it down with the reason; the battery will hold it to that.",
    );
    const stale = [];
    for (const [key, byMethod] of Object.entries(ROUTES)) {
      for (const method of Object.keys(byMethod)) {
        if (!routes.get(key)?.includes(method)) stale.push(`${key}#${method}`);
      }
    }
    assert.deepEqual(stale, [], "These registry entries name no handler in the tree. Delete them.");
  });

  test("every authed page has an entry, and every page entry has a page", () => {
    const missing = pages.filter((key) => !PAGES[key]);
    assert.deepEqual(missing, [], "A page under src/app/(app) with no entry in the registry.");
    const stale = Object.keys(PAGES).filter((key) => !pages.includes(key));
    assert.deepEqual(stale, [], "These page entries name no page in the tree. Delete them.");
  });

  test("every route entry is well formed", () => {
    const problems = [];
    for (const [key, byMethod] of Object.entries(ROUTES)) {
      for (const [method, entry] of Object.entries(byMethod)) {
        const label = `${key}#${method}`;
        if (typeof entry.why !== "string" || entry.why.length < 30) problems.push(`${label}: why is missing or too short`);
        if (!entry.expect || typeof entry.expect !== "object") {
          problems.push(`${label}: no expect map`);
          continue;
        }
        for (const [persona, status] of Object.entries(entry.expect)) {
          if (persona !== "*" && !PERSONA_NAMES.includes(persona)) problems.push(`${label}: unknown persona ${persona}`);
          if (!STATUS(status)) problems.push(`${label}: ${persona} expects ${JSON.stringify(status)}, not a status`);
        }
        const outcomes = PERSONA_NAMES.map((p) => [p, expectedFor(entry.expect, p)]);
        const unresolved = outcomes.filter(([, s]) => s === undefined).map(([p]) => p);
        if (unresolved.length > 0) problems.push(`${label}: no expectation for ${unresolved.join(", ")} and no "*"`);
        const anonymous = expectedFor(entry.expect, "anonymous");
        if (anonymous >= 200 && anonymous < 300 && !entry.public) {
          problems.push(`${label}: anonymous gets ${anonymous}; say why in \`public\``);
        }
        // A 2xx in either pass is what a fields list applies to.
        const columns = REAL_ROUTES[key]?.[method];
        const real2xx = columns
          ? SETS.some((set) => PERSONA_NAMES.some((p) => {
              const s = realExpectedFor(columns, set, p);
              return typeof s === "number" && s >= 200 && s < 300;
            }))
          : false;
        const twoxx = outcomes.some(([, s]) => s >= 200 && s < 300) || real2xx;
        if (entry.fields && !twoxx) problems.push(`${label}: a fields list but no persona gets a 2xx in either pass`);
        if (entry.fields && (!Array.isArray(entry.fields) || entry.fields.some((f) => typeof f !== "string"))) {
          problems.push(`${label}: fields must be a list of strings`);
        }
        if (entry.drive && (typeof entry.drive.why !== "string" || entry.drive.why.length < 20)) {
          problems.push(`${label}: a drive override needs a reason`);
        }
      }
    }
    assert.deepEqual(problems, [], `\n${problems.join("\n")}\n`);
  });

  test("every page entry is well formed", () => {
    const problems = [];
    for (const [key, entry] of Object.entries(PAGES)) {
      if (typeof entry.why !== "string" || entry.why.length < 30) problems.push(`${key}: why is missing or too short`);
      if (!entry.expect || typeof entry.expect !== "object") {
        problems.push(`${key}: no expect map`);
        continue;
      }
      for (const [persona, outcome] of Object.entries(entry.expect)) {
        if (persona !== "*" && !PERSONA_NAMES.includes(persona)) problems.push(`${key}: unknown persona ${persona}`);
        const isName = (v) => typeof v === "string" && v in REDIRECTS;
        const ok =
          STATUS(outcome) ||
          isName(outcome) ||
          (Array.isArray(outcome) && outcome.length > 1 && outcome.every(isName));
        if (!ok) {
          problems.push(
            `${key}: ${persona} expects ${JSON.stringify(outcome)}, neither a status, a REDIRECTS name, nor a list of two or more names`,
          );
        }
      }
      const unresolved = PERSONA_NAMES.filter((p) => expectedFor(entry.expect, p) === undefined);
      if (unresolved.length > 0) problems.push(`${key}: no expectation for ${unresolved.join(", ")} and no "*"`);
      const anonymous = expectedFor(entry.expect, "anonymous");
      if (anonymous !== "login" && anonymous !== 404) {
        problems.push(`${key}: anonymous gets ${JSON.stringify(anonymous)}; an authed page sends a stranger to sign in`);
      }
    }
    assert.deepEqual(problems, [], `\n${problems.join("\n")}\n`);
  });
});

/**
 * One column, read for what can go wrong in it. `kind` is "route" or "page";
 * `method` is the route's, for the rule that only a mutating route may ACT.
 */
function columnProblems(label, columns, { kind, method, key }) {
  const problems = [];
  if (!columns || typeof columns !== "object") return [`${label}: no columns`];
  for (const set of SETS) {
    if (!columns[set] || typeof columns[set] !== "object") problems.push(`${label}: no ${set} column`);
  }
  if (problems.length > 0) return problems;
  if (columns.world !== undefined && columns.world !== "event") problems.push(`${label}: ${JSON.stringify(columns.world)} is not a world`);
  const roles = rolesOf(columns);
  const theirsKeys = Object.keys(columns.theirs).sort();
  if (JSON.stringify(theirsKeys) !== JSON.stringify([...roles].sort())) {
    problems.push(`${label}: theirs must name exactly ${roles.join(", ")}, and names ${theirsKeys.join(", ") || "nobody"}`);
  }
  const isName = (v) => typeof v === "string" && (v in REDIRECTS || v in STATES);
  for (const set of SETS) {
    for (const [persona, cell] of Object.entries(columns[set])) {
      const at = `${label} (${set}) ${persona}`;
      if (persona !== "*" && !PERSONA_NAMES.includes(persona)) problems.push(`${at}: not a persona`);
      if (!Array.isArray(cell) || cell.length !== 2) {
        problems.push(`${at}: a cell is [outcome, reason]`);
        continue;
      }
      const [outcome, why] = cell;
      if (typeof why !== "string" || why.trim().length < 20) problems.push(`${at}: the reason is missing or too short`);
      if (kind === "route") {
        if (outcome === ACTS) {
          if (!MUTATING.has(method)) problems.push(`${at}: only a mutating route can act; a GET writes nothing`);
          if (["anonymous", "pending", "rejected"].includes(persona)) problems.push(`${at}: an account no gate admits cannot act`);
          if (set === "another" && ROLE_NAMES.includes(persona)) {
            problems.push(`${at}: a role persona holds no role on another programme or event, so it acts there only where its base does`);
          }
        } else if (!STATUS(outcome)) {
          problems.push(`${at}: ${JSON.stringify(outcome)} is neither a status nor ACTS`);
        }
      } else {
        const ok = STATUS(outcome) || isName(outcome) || (Array.isArray(outcome) && outcome.length > 1 && outcome.every(isName));
        if (!ok) problems.push(`${at}: ${JSON.stringify(outcome)} is neither a status, a REDIRECTS or STATES name, nor a list of two or more`);
      }
    }
  }
  const unresolved = PERSONA_NAMES.filter((p) => cellIn(columns.another, p) === undefined);
  if (unresolved.length > 0) problems.push(`${label} (another): no cell for ${unresolved.join(", ")} and no "*"`);
  const anonymous = realExpectedFor(columns, "another", "anonymous");
  // A stranger is refused: a 401, or, for a route opened by a link, the 307 to
  // sign in that its first-pass entry already gives a stranger.
  const linkToSignIn = kind === "route" && anonymous === 307 && expectedFor(ROUTES[key]?.[method]?.expect ?? {}, "anonymous") === 307;
  if (kind === "route" && anonymous !== 401 && !linkToSignIn) {
    problems.push(`${label} (another): anonymous gets ${JSON.stringify(anonymous)}; a route asked about a real record refuses a stranger with 401 (or the 307 to sign in its first pass gives one)`);
  }
  if (kind === "page" && anonymous !== "login") problems.push(`${label} (another): anonymous gets ${JSON.stringify(anonymous)}; an authed page sends a stranger to sign in`);
  if (columns.realDrive !== undefined) {
    const drive = columns.realDrive;
    if (kind !== "route") problems.push(`${label}: realDrive is a route's`);
    if (typeof drive?.why !== "string" || drive.why.length < 20) problems.push(`${label}: realDrive needs a reason`);
    if (method === "GET") {
      if (drive?.body !== undefined) problems.push(`${label}: a GET is sent no body`);
      if (typeof drive?.query !== "string" || !drive.query.startsWith("?")) problems.push(`${label}: realDrive.query is a query string`);
      const filled = columns.world === "event" ? EVENT_WORLD_SEGMENTS : WORLD_SEGMENTS;
      for (const [, name] of (drive?.query ?? "").matchAll(/\{(\w+)\}/g)) {
        if (!filled.includes(name)) problems.push(`${label}: realDrive.query fills {${name}}, which the world does not`);
      }
    } else {
      if (drive?.query !== undefined) problems.push(`${label}: a mutating route is sent a body, not a query`);
      if (!drive?.body || typeof drive.body !== "object" || Array.isArray(drive.body)) problems.push(`${label}: realDrive.body is a JSON object`);
      // A whole body would act for anybody the gate admits, so it may only ever reach somebody refused.
      for (const set of SETS) {
        for (const persona of PERSONA_NAMES) {
          const outcome = realExpectedFor(columns, set, persona);
          if (outcome !== ACTS && ![401, 403, 404].includes(outcome)) {
            problems.push(`${label} (${set}) ${persona}: with a realDrive.body every cell is a refusal or ACTS, and this one is ${JSON.stringify(outcome)}`);
          }
        }
      }
    }
  }
  return problems;
}

describe("the second pass's columns and the tree agree in both directions", () => {
  test("the hub is walked from the address, and the world's segments are segments of it", () => {
    const hubRoutes = [...routes.keys()].filter(isHubKey);
    const hubPages = pages.filter(isHubKey);
    assert.ok(hubRoutes.length > 100, `only ${hubRoutes.length} course hub routes found`);
    assert.ok(hubPages.length > 40, `only ${hubPages.length} course hub pages found`);
    const seen = new Set([...hubRoutes, ...hubPages].flatMap(segmentsOf));
    for (const name of WORLD_SEGMENTS) assert.ok(seen.has(name), `the world fills [${name}], which no course hub key has`);
    for (const name of Object.keys(STATES)) assert.ok(!(name in REDIRECTS), `${name} is both a state and a redirect`);
  });

  test("every course hub route the world can address has its columns, and every column has a route", () => {
    const missing = [];
    for (const [key, methods] of routes) {
      if (!asksBothSets(key)) continue;
      for (const method of methods) if (!REAL_ROUTES[key]?.[method]) missing.push(`${key}#${method}`);
    }
    assert.deepEqual(
      missing,
      [],
      "A course hub route with no theirs and another columns in REAL_ROUTES. Decide what every persona gets about " +
        "a programme they lead, staff or hold a place on, and about another one, and write each cell with its reason.",
    );
    const stale = [];
    for (const [key, byMethod] of Object.entries(REAL_ROUTES)) {
      for (const method of Object.keys(byMethod)) {
        if (asksAboutTheEvent(key, method)) continue; // the event world's, held below
        if (!asksBothSets(key) || !routes.get(key)?.includes(method)) stale.push(`${key}#${method}`);
      }
    }
    assert.deepEqual(stale, [], "These columns name no course hub handler the world can address. Delete them.");
  });

  test("every course hub page the world can address has its columns, and every column has a page", () => {
    const missing = pages.filter((key) => asksBothSets(key) && !REAL_PAGES[key]);
    assert.deepEqual(missing, [], "A course hub page with no theirs and another columns in REAL_PAGES.");
    const stale = Object.keys(REAL_PAGES).filter((key) => !asksAboutTheEvent(key, null) && (!asksBothSets(key) || !pages.includes(key)));
    assert.deepEqual(stale, [], "These columns name no course hub page the world can address. Delete them.");
  });

  test("every route column is well formed", () => {
    const problems = [];
    for (const [key, byMethod] of Object.entries(REAL_ROUTES)) {
      for (const [method, columns] of Object.entries(byMethod)) {
        problems.push(...columnProblems(`${key}#${method}`, columns, { kind: "route", method, key }));
      }
    }
    assert.deepEqual(problems, [], `\n${problems.join("\n")}\n`);
  });

  test("every page column is well formed", () => {
    const problems = [];
    for (const [key, columns] of Object.entries(REAL_PAGES)) {
      problems.push(...columnProblems(key, columns, { kind: "page", method: null }));
    }
    assert.deepEqual(problems, [], `\n${problems.join("\n")}\n`);
  });
});

/** The code of a route or page file, by its key, with comments and strings gone. */
function codeOfKey(key, kind) {
  return stripSource(readFileSync(join(APP_DIR, ...key.slice(1).split("/"), kind === "route" ? "route.ts" : "page.tsx"), "utf8"));
}
const ASKS_THE_SIGNUPS_RULE = /\b(?:signupAccessFor|decidesSignups)\s*\(/;

describe("the event world's columns and the code agree in both directions", () => {
  test("every route that asks the sign-ups rule has event columns for each handler, and every event column's route asks it", () => {
    const asking = [...routes.keys()].filter((key) => ASKS_THE_SIGNUPS_RULE.test(codeOfKey(key, "route"))).sort();
    assert.ok(asking.includes("/api/events/[id]/signups"), "the walk no longer finds the requests route");
    const missing = [];
    for (const key of asking) {
      for (const method of routes.get(key)) if (!asksAboutTheEvent(key, method)) missing.push(`${key}#${method}`);
    }
    assert.deepEqual(
      missing,
      [],
      "A route that asks who sees or decides an event's sign-ups, with no event columns in REAL_ROUTES. Decide what " +
        "every persona gets about the event they organise and about another one, and write each cell with its reason.",
    );
    const stale = [];
    for (const [key, byMethod] of Object.entries(REAL_ROUTES)) {
      for (const method of Object.keys(byMethod)) {
        if (asksAboutTheEvent(key, method) && !(asking.includes(key) && routes.get(key).includes(method))) stale.push(`${key}#${method}`);
      }
    }
    assert.deepEqual(stale, [], "These event columns name a handler that no longer asks the sign-ups rule. Delete them.");
  });

  test("every page that asks the sign-ups rule has event columns, and every event column's page asks it", () => {
    const asking = pages.filter((key) => ASKS_THE_SIGNUPS_RULE.test(codeOfKey(key, "page"))).sort();
    assert.ok(asking.includes("/(app)/events/manage/[id]/attendees"), "the walk no longer finds the Sign-ups page");
    assert.deepEqual(asking.filter((key) => !asksAboutTheEvent(key, null)), [], "A page that asks the sign-ups rule with no event columns in REAL_PAGES.");
    assert.deepEqual(
      Object.keys(REAL_PAGES).filter((key) => asksAboutTheEvent(key, null) && !asking.includes(key)),
      [],
      "These event columns name a page that no longer asks the sign-ups rule. Delete them.",
    );
  });

  test("the event world fills exactly the segments its keys have, and no course hub key has them", () => {
    const eventKeys = [
      ...Object.entries(REAL_ROUTES).flatMap(([key, byMethod]) => (Object.values(byMethod).some((columns) => columns.world === "event") ? [key] : [])),
      ...Object.keys(REAL_PAGES).filter((key) => asksAboutTheEvent(key, null)),
    ];
    const seen = new Set(eventKeys.flatMap(segmentsOf));
    assert.deepEqual([...seen].sort(), [...EVENT_WORLD_SEGMENTS].sort());
    const hubSegments = new Set([...routes.keys(), ...pages].filter(isHubKey).flatMap(segmentsOf));
    for (const name of EVENT_WORLD_SEGMENTS) assert.ok(!hubSegments.has(name), `a course hub key has [${name}], which the event world fills`);
    for (const key of eventKeys) assert.ok(!isHubKey(key), `${key} is a course hub key and an event's`);
  });
});

/**
 * HOW THE BATTERY READS A CELL (`scripts/e2e/lib/personaCells.mjs`), held to
 * what the key means. A set shaped as the world's: every segment it fills,
 * each with a value of its own.
 */
describe("the battery reads a cell the way the key means it", () => {
  const ids = Object.fromEntries(
    WORLD_SEGMENTS.map((name) => [name, name === "n" ? "1" : name === "weekId" ? "w01" : `e2e-cell-${name.toLowerCase()}`]),
  );

  test("a path fills the world's segments, and every other segment with an id that addresses nothing", () => {
    assert.equal(
      pathFor("/api/courses/runs/[runId]/team/links/[linkId]", ids),
      `/api/courses/runs/${ids.runId}/team/links/e2e-missing-linkId`,
    );
    assert.equal(pathFor("/(app)/learn/[runId]/weeks/[n]", ids), `/learn/${ids.runId}/weeks/1`);
    assert.equal(pathFor("/api/courses/runs/[runId]"), "/api/courses/runs/e2e-missing-runId");
    assert.equal(queryFor("?uid={uid}&week=1", ids), `?uid=${ids.uid}&week=1`);
  });

  test("a redirect to one of the set's records reads as the name the key gives it", () => {
    const named = (path) => pageOutcome({ status: 200, locations: [normalisePath(path, ids)] });
    assert.deepEqual(named(`/learn/${ids.runId}`), ["run"]);
    assert.deepEqual(named(`/learn/${ids.runId}/weeks/1`), ["week"]);
    assert.deepEqual(named("/learn/e2e-missing-runId"), ["run"]);
    assert.deepEqual(named("/learn?from=elsewhere"), ["learn"]);
    assert.deepEqual(named("/nowhere/known"), ["redirect:/nowhere/known"]);
  });

  test("every calm state is read through a page's escaping, and is words the product draws", () => {
    const sources = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) sources.push(readFileSync(full, "utf8"));
      }
    };
    walk(join(REPO_ROOT, "src"));
    for (const [name, words] of Object.entries(STATES)) {
      const escaped = words.replace(/&/g, "&amp;").replace(/'/g, "&#x27;");
      assert.deepEqual(statesIn(`<main><h1>${escaped}</h1></main>`), [name], `${name} is not read from a page that draws it`);
      assert.ok(
        sources.some((text) => text.includes(words)),
        `${name}: no file under src draws ${JSON.stringify(words)}, so a page that refuses would read as an open one`,
      );
    }
    assert.deepEqual(statesIn("<main>A page that is simply open.</main>"), []);
  });

  test("no calm state is words a boundary or a layout draws, since every page beneath one carries it", () => {
    // A not-found, error or loading boundary, a layout and a template are sent
    // with every page under them (the root not-found's words are in every
    // page's payload), so a state spelled with their words would read as a
    // refusal on a page that is open. The first recording found exactly that.
    const BOUNDARY = /^(not-found|error|global-error|loading|layout|template)\.(tsx|ts|jsx|js)$/;
    const boundaries = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (BOUNDARY.test(entry.name)) boundaries.push(full);
      }
    };
    walk(APP_DIR);
    assert.ok(boundaries.length > 10, `only ${boundaries.length} boundary and layout files found under src/app`);
    const clashes = [];
    for (const file of boundaries) {
      const text = readFileSync(file, "utf8");
      for (const [name, words] of Object.entries(STATES)) {
        if (text.includes(words)) clashes.push(`${relative(REPO_ROOT, file)} draws ${name}'s words`);
      }
    }
    assert.deepEqual(clashes, [], "Spell the state with words only the refusal itself draws.");
  });

  test("an outcome is every redirect first, then every calm state, then the status", () => {
    assert.deepEqual(pageOutcome({ status: 200, locations: ["/learn"], states: ["noProgramme"] }), ["learn"]);
    assert.deepEqual(pageOutcome({ status: 200, locations: [], states: ["noProgramme", "notReviewed"] }), ["noProgramme", "notReviewed"]);
    assert.equal(pageOutcome({ status: 200, locations: [], states: [] }), 200);
    assert.equal(pageOutcome({ status: 404, locations: [] }), 404);
    // A list accepts any of its names, and every name observed must be one of them.
    assert.ok(pageMatches(["learn", "run"], ["run"]));
    assert.ok(pageMatches(["learn", "run"], ["learn", "run"]));
    assert.ok(!pageMatches(["learn", "run"], ["learn", "dashboard"]));
    assert.ok(pageMatches("noProgramme", ["noProgramme"]));
    assert.ok(!pageMatches("noProgramme", 200));
    assert.ok(!pageMatches("noProgramme", []));
    assert.ok(pageMatches(200, 200));
    assert.ok(!pageMatches(200, ["learn"]));
  });
});
