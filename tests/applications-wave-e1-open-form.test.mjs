/**
 * Which application form is open right now: the question a page asks before
 * it offers somebody an Apply button.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 * `src/lib/applications/lifecycle/openForm.ts` reads admission rounds on the
 * Admin SDK and hands a page any visitor can load what it found. A round
 * carries who leads and reviews each programme, the live counts of
 * applications and each programme's places, so three things have to hold and
 * each is asked here by running the code:
 *
 *  1. OPEN MEANS WHAT THE APPLY ROUTES MEAN. A draft, a form that opens later,
 *     one that has closed by the clock or by an admin, an archived one and a
 *     finished one are not offered. Neither is an older round, which is not a
 *     form at all.
 *  2. WHAT LEAVES IS LISTED FIELD BY FIELD. The view's keys are compared with
 *     a list, and a round stuffed with things no visitor may know is searched
 *     for in what comes back.
 *  3. A PUBLIC PAGE MAY IMPORT IT. Its imports are walked, and none arrives at
 *     a module that reads reviews or decisions, or that says who has a role.
 *
 * And the read is one equality on one field, which needs no declared index.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const openForm = await loadTs(join("lib", "applications", "lifecycle", "openForm.ts"));

// ---------------------------------------------------------------------------
// A database that records what it is asked
// ---------------------------------------------------------------------------

function makeDb(rounds) {
  const asked = [];
  return {
    asked,
    collection(name) {
      const query = (filters) => ({
        where: (field, op, value) => query([...filters, [field, op, value]]),
        orderBy: () => {
          throw new Error("this read may not sort on the server");
        },
        get: async () => {
          asked.push({ collection: name, filters });
          const docs = Object.entries(rounds)
            .filter(([, data]) => filters.every(([field, , value]) => data[field] === value))
            .map(([id, data]) => ({ id, data: () => structuredClone(data) }));
          return { docs };
        },
      });
      return query([]);
    },
  };
}

const NOW = new Date("2026-12-05T12:00:00Z");
const OPENS = new Date("2026-11-30T09:00:00Z");
const CLOSES = new Date("2026-12-13T23:59:00Z");

const programme = (over) => ({
  kind: "fellowship",
  name: "AGI Strategy Fellowship",
  shortName: "AGI Strategy",
  pitch: "Six weeks on where this is going.",
  facts: "6 WEEKS · ~5 HRS A WEEK",
  starts: "w/c 18 Jan",
  places: 32,
  groupCount: 4,
  groupSize: "Up to 8",
  leadUid: "claudia-lead-uid",
  reviewerUids: ["lloyd-reviewer-uid"],
  useScores: true,
  closed: false,
  runId: null,
  emailWording: { accepted: { subject: "You are in", body: "Private wording for the accepted email." } },
  ...over,
});

/** A form that is open at NOW, carrying everything a visitor must not be told. */
const form = (over = {}) => ({
  formVersion: 2,
  kind: "enrolment",
  label: "Spring 2027",
  slug: "spring-2027",
  status: "open",
  opensAt: OPENS,
  closesAt: CLOSES,
  decisionsByDate: "2026-12-18",
  invitationReplyBy: "2026-12-20",
  stageIds: [],
  reviewerUids: ["claudia-lead-uid", "lloyd-reviewer-uid"],
  finalDeciderUid: "zach-admin-uid",
  authorUid: "zach-admin-uid",
  applicationCounts: { draft: 3, submitted: 41 },
  archived: false,
  programmeIds: ["agi-strategy", "research-incubator", "old-stream"],
  programmes: {
    "agi-strategy": programme({ runId: "run-agi-spring" }),
    "research-incubator": programme({
      kind: "incubator",
      name: "Research Incubator",
      shortName: "Research incubator",
      leadUid: "zach-admin-uid",
      reviewerUids: [],
    }),
    "old-stream": programme({ name: "Closed Fellowship", shortName: "Closed", closed: true, runId: "run-closed" }),
  },
  questionSetIds: ["fellowships"],
  asksFacilitating: true,
  revealOtherReviews: true,
  noOfferWording: { subject: "No offer this time", body: "Private wording for the no offer email." },
  decisionsSentAt: null,
  decisionsSentByUid: null,
  ...over,
});

const find = (rounds, now = NOW) => openForm.findOpenForm(makeDb(rounds), now);

// ---------------------------------------------------------------------------
// 1. Open means what the apply routes mean
// ---------------------------------------------------------------------------

describe("which form is open", () => {
  test("a form whose status is open, inside its dates, is the answer", async () => {
    const view = await find({ "spring-2027__a1b2c3d4": form() });
    assert.equal(view.id, "spring-2027__a1b2c3d4");
    assert.equal(view.state, "open");
    assert.equal(view.applyPath, "/apply/spring-2027__a1b2c3d4");
    assert.equal(view.label, "Spring 2027");
  });

  test("anything else is no form at all", async () => {
    const notOpen = {
      "a draft": { status: "draft" },
      "closed by an admin": { status: "closed" },
      "being decided": { status: "deciding" },
      settled: { status: "settled" },
      cancelled: { status: "cancelled" },
      archived: { archived: true },
      "opening later": { opensAt: new Date("2026-12-06T09:00:00Z") },
      "closed by the clock": { closesAt: new Date("2026-12-04T23:59:00Z") },
      "with nothing left to tick": { programmeIds: ["old-stream"] },
      "with no programmes": { programmeIds: [], programmes: {} },
    };
    for (const [name, over] of Object.entries(notOpen)) {
      assert.equal(await find({ "spring-2027__a1b2c3d4": form(over) }), null, name);
    }
    assert.equal(await find({}), null, "no forms at all");
  });

  test("both ends of the window are in, and a millisecond outside either is out", async () => {
    const rounds = { "spring-2027__a1b2c3d4": form() };
    assert.notEqual(await find(rounds, OPENS), null);
    assert.notEqual(await find(rounds, CLOSES), null);
    assert.equal(await find(rounds, new Date(OPENS.getTime() - 1)), null);
    assert.equal(await find(rounds, new Date(CLOSES.getTime() + 1)), null);
  });

  test("an older round is never the answer, however open it is", async () => {
    const older = { ...form(), formVersion: undefined };
    delete older.formVersion;
    assert.equal(await find({ "autumn-intake": older, "another-version": { ...form(), formVersion: 1 } }), null);
  });

  test("with two open at once, the one that closes first, and the same one on every read", async () => {
    const rounds = {
      "later__00000001": form({ closesAt: new Date("2026-12-20T23:59:00Z") }),
      "sooner__00000002": form({ closesAt: new Date("2026-12-10T23:59:00Z") }),
      "never__00000003": form({ closesAt: null }),
    };
    for (let i = 0; i < 3; i += 1) assert.equal((await find(rounds)).id, "sooner__00000002");
    const tie = { "b__00000002": form(), "a__00000001": form() };
    assert.equal((await find(tie)).id, "a__00000001");
  });
});

// ---------------------------------------------------------------------------
// 2. What leaves
// ---------------------------------------------------------------------------

describe("what a visitor's page is handed", () => {
  test("the view is these fields and no others", async () => {
    const view = await find({ "spring-2027__a1b2c3d4": form() });
    assert.deepEqual(Object.keys(view).sort(), [
      "applyPath",
      "closesAt",
      "decisionsByDate",
      "id",
      "label",
      "opensAt",
      "outcomeRunIds",
      "programmes",
      "state",
    ]);
    assert.deepEqual(
      [view.opensAt.toISOString(), view.closesAt.toISOString(), view.decisionsByDate],
      [OPENS.toISOString(), CLOSES.toISOString(), "2026-12-18"],
    );
    for (const each of view.programmes) {
      assert.deepEqual(Object.keys(each).sort(), ["id", "kind", "name", "runId", "shortName"]);
    }
  });

  test("the programmes somebody can tick, in the form's order, without the closed one", async () => {
    const view = await find({ "spring-2027__a1b2c3d4": form() });
    assert.deepEqual(view.programmes, [
      { id: "agi-strategy", kind: "fellowship", name: "AGI Strategy Fellowship", shortName: "AGI Strategy", runId: "run-agi-spring" },
      { id: "research-incubator", kind: "incubator", name: "Research Incubator", shortName: "Research incubator", runId: null },
    ]);
    assert.deepEqual(view.outcomeRunIds, ["run-agi-spring"], "a closed programme's run is not one the form takes people for");
  });

  test("nothing a visitor may not know is anywhere in it", async () => {
    const text = JSON.stringify(await find({ "spring-2027__a1b2c3d4": form() }));
    const secrets = [
      "claudia-lead-uid",
      "lloyd-reviewer-uid",
      "zach-admin-uid",
      "leadUid",
      "reviewerUids",
      "finalDeciderUid",
      "authorUid",
      "applicationCounts",
      "41",
      "places",
      "32",
      "groupSize",
      "emailWording",
      "Private wording",
      "noOfferWording",
      "revealOtherReviews",
      "invitationReplyBy",
      "2026-12-20",
      "Closed Fellowship",
      "run-closed",
    ];
    for (const secret of secrets) assert.ok(!text.includes(secret), `${secret} reached a visitor's page`);
  });
});

describe("whether the open form takes applications for a course's runs", () => {
  test("it does when one of its programmes places people on one of them", async () => {
    const view = await find({ "spring-2027__a1b2c3d4": form() });
    assert.equal(openForm.openFormSpeaksFor(view, ["run-other", "run-agi-spring"]), true);
    assert.equal(openForm.openFormSpeaksFor(view, ["run-other"]), false);
    assert.equal(openForm.openFormSpeaksFor(view, ["run-closed"]), false, "the closed programme's run");
    assert.equal(openForm.openFormSpeaksFor(view, []), false);
  });

  test("a form whose programmes are linked to no run speaks for none, and says so with an empty list", async () => {
    const unlinked = form();
    unlinked.programmes["agi-strategy"].runId = null;
    const view = await find({ "spring-2027__a1b2c3d4": unlinked });
    assert.deepEqual(view.outcomeRunIds, []);
    assert.equal(openForm.openFormSpeaksFor(view, ["run-agi-spring"]), false);
  });

  test("the address the button leads to is built in one place", () => {
    assert.equal(openForm.applyPathFor("spring-2027__a1b2c3d4"), "/apply/spring-2027__a1b2c3d4");
  });
});

// ---------------------------------------------------------------------------
// 3. The read, and the imports
// ---------------------------------------------------------------------------

describe("the read needs no declared index", () => {
  test("one query, one equality on one field, nothing sorted on the server", async () => {
    const db = makeDb({ "spring-2027__a1b2c3d4": form() });
    await openForm.findOpenForm(db, NOW);
    assert.deepEqual(db.asked, [{ collection: "admissionRounds", filters: [["formVersion", "==", 2]] }]);
  });
});

/** Source with its comments gone, so a rule written in prose is not a use. */
function codeOf(file) {
  return readFileSync(file, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

/** A local specifier as a file, or null for a package. */
function resolveLocal(specifier, fromFile) {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : specifier.startsWith(".")
      ? join(dirname(fromFile), specifier)
      : null;
  if (!base) return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file a module reaches through its value imports. A type carries no data. */
function reachableFrom(root) {
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length > 0) {
    const file = queue.pop();
    const source = codeOf(file);
    const imports = [
      ...source.matchAll(/^\s*import\s+(?!type\b)[^;]*?\sfrom\s+["']([^"']+)["']/gm),
      ...source.matchAll(/^\s*export\s+(?!type\b)[^;]*?\sfrom\s+["']([^"']+)["']/gm),
      ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
    ];
    for (const [, specifier] of imports) {
      const target = resolveLocal(specifier, file);
      if (target && !seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen].map((file) => relative(REPO_ROOT, file).split("\\").join("/"));
}

describe("a page any visitor can load may import it", () => {
  const ROOT = join(SRC, "lib", "applications", "lifecycle", "openForm.ts");
  const reached = reachableFrom(ROOT);

  test("the walk went somewhere", () => {
    for (const expected of [
      "src/lib/applications/lifecycle/openForm.ts",
      "src/lib/applications/normalise.ts",
      "src/lib/applications/sections.ts",
      "src/lib/admissions/window.ts",
      "src/lib/firestore/admissionRounds.ts",
    ]) {
      assert.ok(reached.includes(expected), `${expected} was not reached: the walk is not reading imports`);
    }
  });

  test("it reaches nothing that reads a review or a decision, or says who has a role", () => {
    const NAMES_COMMITTEE_DATA = /["'`]admissionReviews["'`]|admissionDecisions|DECISIONS_COLLECTION/;
    const STAFF = [
      /^src\/lib\/applications\/staffRepo\.ts$/,
      /^src\/lib\/applications\/access\.ts$/,
      /^src\/lib\/applications\/roles\.ts$/,
      /^src\/lib\/applications\/(review|decisionDay|editor)\//,
      /^src\/lib\/applications\/lifecycle\/(move|load|loadTermHome|view|termHome|readiness|status)\.ts$/,
      /^src\/lib\/firebase\/(session|eligibility|admin)\.ts$/,
      /^src\/lib\/admissions\/memberRecordSync\.ts$/,
    ];
    for (const file of reached) {
      assert.ok(!STAFF.some((pattern) => pattern.test(file)), `${file} is reached from the open form lookup`);
      assert.doesNotMatch(
        codeOf(join(REPO_ROOT, ...file.split("/"))),
        NAMES_COMMITTEE_DATA,
        `${file} names the reviews or the decisions and is reached from the open form lookup`,
      );
    }
  });

  test("it is a server module, and it takes its database from its caller", () => {
    const source = readFileSync(ROOT, "utf8");
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(codeOf(ROOT), /getAdminDb|getCurrentUser|requireApplicant/);
  });
});
