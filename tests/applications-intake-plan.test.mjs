/**
 * Plan the intake, and Clear all reads, run for real.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/admissions/forms/[roundId]/intake        a plan for the whole term
 *   POST /api/admissions/forms/[roundId]/intake/clear  delete every stored read
 *
 * ## The rules this guards
 *
 *  - ONLY AN ADMIN. Everybody else is refused before the body is read, and
 *    Claude is never asked. A view-as session is refused like every other
 *    write. A plan is for before decision day.
 *  - NO NAMES LEAVE. Claude sees "Applicant 1" and programme names, never a
 *    person's name, address or account.
 *  - NOTHING CLAUDE SAYS IS TAKEN ON TRUST (`intake/advice.ts`): a move has to
 *    a programme the person ranked, whose lead did not decline them, with
 *    room; a facilitator has to have offered; somebody "worth asking" has to
 *    NOT have offered.
 *  - THE DECISIONS APPLY WOULD MAKE (`decisionsFor`) go through the one-place
 *    rule: everything ranked above the plan's programme is pooled as a better
 *    fit elsewhere, naming it, and the plan's programme is accepted.
 *  - NOTHING IS WRITTEN by a plan. Clear all reads deletes the round's
 *    assessments and nothing else, and only when the body says so.
 *
 * Real: both handlers, `access.ts` and everything under `src/lib/applications/`.
 * Faked: as in `applications-assessment.test.mjs`.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import { AGI, CAST, ROUND, TAIS, WHILE_DECIDING, namesOf, seedTerm } from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export function claudeConfigured() { return globalThis.__claudeKey !== false; }
export async function askClaudeForJson(input) {
  globalThis.__claudeAsked.push(input);
  return globalThis.__claudeAnswer;
}`;

const STUBS = new Map([
  ["server-only", "export {};"],
  [
    "next/server",
    "export class NextResponse {\n" +
      "  constructor(body, init) {\n" +
      "    this.body = body;\n" +
      "    this.status = (init && init.status) || 200;\n" +
      "    this.headers = (init && init.headers) || {};\n" +
      "  }\n" +
      "  static json(body, init) { return new NextResponse(body, init); }\n" +
      "}",
  ],
  ["firebase-admin/firestore", FIELD_VALUE_STUB],
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__iDb ?? null;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__iUser ?? null;\n}"],
  [
    "@/lib/firebase/impersonation",
    "export async function assertNotImpersonating() {\n  return globalThis.__iBlocked ?? null;\n}",
  ],
  ["@/lib/ai/claude", CLAUDE_STUB],
]);
const { loadTs } = createLoader({ stubs: STUBS });

const FORMS = join("app", "api", "admissions", "forms", "[roundId]");
const route = await loadTs(join(FORMS, "intake", "route.ts"));
const clearRoute = await loadTs(join(FORMS, "intake", "clear", "route.ts"));
const { applyIntakeAdvice, decisionsFor } = await loadTs("lib/applications/intake/advice.ts");
const { NextResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(STUBS.get("next/server")).toString("base64")}`
);

// ---------------------------------------------------------------------------
// The pure rules
// ---------------------------------------------------------------------------

const person = (uid, ranked, standings = {}, facilitates = []) => ({
  uid,
  name: uid,
  ranked,
  on: Object.fromEntries(
    ranked.map((id) => [
      id,
      { standing: standings[id] ?? "to-review", lean: null, score: null, summary: null, fit: null, facilitates: facilitates.includes(id) },
    ]),
  ),
  placedNow: null,
  outcomeNow: "undecided",
  hasRead: false,
  hasPangram: false,
});

describe("the decisions Apply would make", () => {
  test("everything ranked above the plan's programme is pooled as a better fit, naming it, then it is accepted", () => {
    assert.deepEqual(decisionsFor(person("a", ["agi", "tech"]), "tech"), [
      { programmeId: "agi", decision: "pool", poolReason: "better-fit", couldSuitProgrammeId: "tech" },
      { programmeId: "tech", decision: "accept", poolReason: null, couldSuitProgrammeId: null },
    ]);
  });

  test("nothing changes for somebody already accepted where the plan puts them", () => {
    assert.deepEqual(decisionsFor(person("a", ["agi", "tech"], { agi: "accepted" }), "agi"), []);
  });

  test("a programme already pooled or declined above it is left alone", () => {
    assert.deepEqual(decisionsFor(person("a", ["agi", "inc", "tech"], { agi: "declined", inc: "pooled" }), "tech"), [
      { programmeId: "tech", decision: "accept", poolReason: null, couldSuitProgrammeId: null },
    ]);
  });

  test("no place pools every open one for capacity", () => {
    assert.deepEqual(decisionsFor(person("a", ["agi", "tech"], { agi: "accepted", tech: "pooled" }), null), [
      { programmeId: "agi", decision: "pool", poolReason: "capacity", couldSuitProgrammeId: null },
    ]);
  });
});

describe("what is kept of Claude's suggestions", () => {
  const programmes = [
    { id: "agi", name: "AGI", shortName: "AGI", kind: "fellowship", places: 2, placedNow: 0 },
    { id: "tech", name: "Tech", shortName: "Tech", kind: "fellowship", places: 1, placedNow: 0 },
  ];
  const people = [
    person("a", ["agi", "tech"], {}, ["agi"]),
    person("b", ["agi", "tech"], { tech: "declined" }),
    person("c", ["agi"]),
    person("d", ["tech", "agi"]),
  ];
  const draft = new Map([["a", "agi"], ["b", "agi"], ["c", null], ["d", "tech"]]);
  const labels = { message: "", applicants: { "Applicant 1": "a", "Applicant 2": "b", "Applicant 3": "c", "Applicant 4": "d" } };
  const advise = (advice) =>
    applyIntakeAdvice({
      programmes,
      people,
      draft,
      labels,
      advice: { programmes: [], changes: [], facilitators: [], shouldFacilitate: [], notes: "", ...advice },
    });

  test("a move to a ranked programme with room is kept; the rest are dropped with why", () => {
    const applied = advise({
      changes: [
        { applicant: "Applicant 2", to: "Tech", why: "declined there" },
        { applicant: "Applicant 3", to: "Tech", why: "not ranked" },
        { applicant: "Applicant 1", to: "Tech", why: "full" },
        { applicant: "Applicant 9", to: "AGI", why: "nobody" },
        { applicant: "Applicant 4", to: "No place", why: "fine" },
        { applicant: "Applicant 1", to: "Tech", why: "room now" },
      ],
    });
    assert.deepEqual(applied.changes.map((c) => [c.uid, c.from, c.to]), [
      ["d", "tech", null],
      ["a", "agi", "tech"],
    ]);
    assert.deepEqual(
      applied.dropped.map((d) => d.why),
      [
        "Tech's lead declined Applicant 2",
        "Applicant 3 did not rank Tech",
        "Tech has no places left in the plan",
        "names somebody who is not in the term",
      ],
    );
  });

  test("a facilitator has to have offered, and somebody worth asking has to NOT have", () => {
    const applied = advise({
      facilitators: [
        { applicant: "Applicant 1", programme: "AGI", why: "offered" },
        { applicant: "Applicant 3", programme: "AGI", why: "did not offer" },
      ],
      shouldFacilitate: [
        { applicant: "Applicant 1", programme: "AGI", why: "already offered" },
        { applicant: "Applicant 3", programme: "AGI", why: "strong" },
      ],
    });
    assert.deepEqual(applied.facilitators.map((f) => f.uid), ["a"]);
    assert.deepEqual(applied.shouldFacilitate.map((f) => f.uid), ["c"]);
    assert.equal(applied.dropped.length, 2);
  });
});

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

let db;

function world(round = {}, over = {}) {
  db = makeDb(seedTerm({ round, over }), { now: WHILE_DECIDING });
  globalThis.__iDb = db;
  globalThis.__iBlocked = null;
  globalThis.__iUser = null;
  globalThis.__claudeKey = true;
  globalThis.__claudeAsked = [];
  // The labels follow account ids in order: amara 1, dev 2, wen 3.
  globalThis.__claudeAnswer = {
    ok: true,
    model: "claude-opus-5-5",
    usage: { inputTokens: 1, outputTokens: 1 },
    value: {
      programmes: [{ programme: "AGI Strategy", note: "Applicant 2 is the surest yes." }],
      changes: [
        { applicant: "Applicant 1", to: "Technical AI Safety", why: "Applicant 1 suits the technical side." },
        { applicant: "Applicant 2", to: "Technical AI Safety", why: "Did not rank it." },
      ],
      facilitators: [{ applicant: "Applicant 3", programme: "Technical AI Safety", why: "Nobody offered on this form." }],
      shouldFacilitate: [{ applicant: "Applicant 3", programme: "Technical AI Safety", why: "Leads discussions well." }],
      notes: "A small term.",
    },
  };
}

const as = (uid) => {
  globalThis.__iUser = uid ? CAST[uid] : null;
};

const request = (body) =>
  new Request("http://naisi.invalid/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = { params: Promise.resolve({ roundId: ROUND }) };
const PLAN = (body = { askClaude: false }) => route.POST(request(body), params);
const CLEAR = (body = { confirm: true }) => clearRoute.POST(request(body), params);

const ASSESSMENT = (uid, roundId = ROUND) => `admissionAssessments/${roundId}__${uid}`;

beforeEach(() => world());

describe("who may plan the intake or clear the reads", () => {
  test("nobody signed out", async () => {
    assert.equal((await PLAN()).status, 401);
    assert.equal((await CLEAR()).status, 401);
  });

  for (const who of ["claudia", "lloyd", "tess", "amara", "dev"]) {
    test(`not ${who}: refused, and Claude is never asked`, async () => {
      as(who);
      db.seed(ASSESSMENT("amara"), { roundId: ROUND, uid: "amara", read: null });
      assert.equal((await PLAN({ askClaude: true })).status, 403);
      assert.equal((await CLEAR()).status, 403);
      assert.equal(globalThis.__claudeAsked.length, 0);
      assert.ok(db.paths().includes(ASSESSMENT("amara")));
    });
  }

  test("a view-as session is refused first", async () => {
    as("zach");
    globalThis.__iBlocked = NextResponse.json({ error: "view-as" }, { status: 403 });
    assert.equal((await PLAN({ askClaude: true })).status, 403);
    assert.equal((await CLEAR()).status, 403);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("a body that does not say whether to ask Claude, or to clear, is refused", async () => {
    as("zach");
    assert.equal((await PLAN({})).status, 400);
    assert.equal((await CLEAR({})).status, 400);
    assert.equal((await CLEAR({ confirm: "yes" })).status, 400);
  });

  test("once decisions have gone out, there is nothing to plan", async () => {
    world({ decisionsSentAt: WHILE_DECIDING, decisionsSentByUid: "zach" });
    as("zach");
    assert.equal((await PLAN({ askClaude: true })).status, 409);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });
});

describe("a plan", () => {
  test("the draft alone asks nothing of Claude and writes nothing", async () => {
    as("zach");
    const paths = db.paths().length;
    const response = await PLAN();
    assert.equal(response.status, 200);
    assert.equal(globalThis.__claudeAsked.length, 0);
    assert.equal(db.paths().length, paths);
    const { intake } = response.body;
    assert.deepEqual(intake.rows.map((row) => row.uid).sort(), ["amara", "dev", "wen"]);
    assert.equal(intake.claude, null);
    assert.ok(intake.rows.every((row) => !row.hasRead && !row.hasPangram));
  });

  test("Claude sees labels and programmes, never a name, and only what fits is kept", async () => {
    as("zach");
    const response = await PLAN({ askClaude: true });
    assert.equal(response.status, 200);
    const { message } = globalThis.__claudeAsked[0];
    for (const uid of ["amara", "dev", "wen"]) {
      for (const word of [...namesOf(uid), uid]) assert.equal(message.includes(word), false, `the plan sent ${word}`);
    }
    assert.match(message, /### Applicant 1/);
    assert.match(message, /AGI Strategy/);

    const { intake } = response.body;
    const amara = intake.rows.find((row) => row.uid === "amara");
    assert.equal(amara.plan, TAIS);
    assert.equal(amara.claudeWhy, "Amara Okafor suits the technical side.");
    assert.deepEqual(amara.ops, [
      { programmeId: AGI, decision: "pool", poolReason: "better-fit", couldSuitProgrammeId: TAIS },
      { programmeId: TAIS, decision: "accept", poolReason: null, couldSuitProgrammeId: null },
    ]);
    assert.equal(intake.rows[0].uid, "amara", "the people whose decisions change come first");
    assert.deepEqual(intake.facilitators, [], "nobody offered on this form");
    assert.deepEqual(intake.shouldFacilitate.map((f) => [f.uid, f.programmeId]), [["wen", TAIS]]);
    assert.equal(intake.programmes.find((p) => p.id === AGI).note, "Dev Patel is the surest yes.");
    assert.ok(intake.claude.dropped.some((d) => /did not rank/.test(d.why)));
  });
});

describe("clear all reads", () => {
  test("deletes every assessment on this form, and nothing else", async () => {
    db.seed(ASSESSMENT("amara"), { roundId: ROUND, uid: "amara", read: null, pangram: null });
    db.seed(ASSESSMENT("dev"), { roundId: ROUND, uid: "dev", read: null, pangram: null });
    db.seed(ASSESSMENT("amara", "older-round"), { roundId: "older-round", uid: "amara", read: null });
    const before = db.paths().length;
    as("zach");
    const response = await CLEAR();
    assert.equal(response.status, 200);
    assert.equal(response.body.deleted, 2);
    assert.equal(db.paths().includes(ASSESSMENT("amara")), false);
    assert.equal(db.paths().includes(ASSESSMENT("dev")), false);
    assert.ok(db.paths().includes(ASSESSMENT("amara", "older-round")));
    assert.equal(db.paths().length, before - 2);
  });
});
