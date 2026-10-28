/**
 * Arrange groups, before decision day, run for real through its route.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/arrangement
 *
 * ## The rules this guards
 *
 *  - ONLY AN ADMIN, refused before anything is read, and Claude is never
 *    asked. A view-as session is refused first.
 *  - BEFORE DECISION DAY IT IS A PREVIEW of the people the decisions as they
 *    stand place on the programme, and the caller's own application is left
 *    out of it, as from every screen before decision day.
 *  - CLAUDE IS TOLD LABELS: no name, no address, no week, no Pangram finding.
 *  - NOTHING IS WRITTEN.
 *  - After decision day the same route arranges the people holding places on
 *    the run, so a programme with no run is refused.
 *
 * Real: the route, `access.ts` and everything under `src/lib/applications/`.
 * Faked: the store (`tests/lib/applicationsStore.mjs`), the session, the
 * view-as guard and Claude.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  applicationDoc,
  applicationPath,
  decisionPath,
  namesOf,
  seedTerm,
} from "./lib/applicationsSmallTerm.mjs";
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
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__aDb ?? null;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__aUser ?? null;\n}"],
  [
    "@/lib/firebase/impersonation",
    "export async function assertNotImpersonating() {\n  return globalThis.__aBlocked ?? null;\n}",
  ],
  ["@/lib/ai/claude", CLAUDE_STUB],
]);
const { loadTs } = createLoader({ stubs: STUBS });

const route = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "arrangement", "route.ts"));
const { NextResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(STUBS.get("next/server")).toString("base64")}`
);

const accepted = (uid, programmeId, by) => ({
  roundId: ROUND,
  uid,
  programmes: {
    [programmeId]: { decision: "accept", poolReason: null, couldSuitProgrammeId: null, decidedByUid: by, decidedAt: WHILE_DECIDING },
  },
  pooledOutcome: null,
  exception: null,
});

/** An application whose week is Monday and Tuesday, 09:00 to 21:00: a real week, so it chooses times. */
function realWeek(doc) {
  doc.sent.availability = { ...doc.sent.availability, days: ["", "ffffffffffff", "ffffffffffff", "", "", "", ""] };
  return doc;
}

let db;

function world(round = {}) {
  db = makeDb(
    seedTerm({
      round,
      over: {
        // Amara and Dev hold places on AGI Strategy; Wen on Technical AI Safety.
        [decisionPath("amara")]: accepted("amara", AGI, "claudia"),
        [decisionPath("dev")]: accepted("dev", AGI, "claudia"),
        [decisionPath("wen")]: accepted("wen", TAIS, "tess"),
        [applicationPath("amara")]: realWeek(applicationDoc("amara", [AGI, TAIS])),
        [applicationPath("dev")]: realWeek(applicationDoc("dev", [AGI])),
        // Zach, the admin asking, applied too and holds a place on AGI Strategy.
        [applicationPath("zach")]: realWeek(applicationDoc("zach", [AGI])),
        [decisionPath("zach")]: accepted("zach", AGI, "claudia"),
      },
    }),
    { now: WHILE_DECIDING },
  );
  globalThis.__aDb = db;
  globalThis.__aBlocked = null;
  globalThis.__aUser = null;
  globalThis.__claudeKey = true;
  globalThis.__claudeAsked = [];
  globalThis.__claudeAnswer = {
    ok: true,
    model: "claude-opus-5-5",
    usage: { inputTokens: 1, outputTokens: 1 },
    value: {
      potential: [{ applicant: "Applicant 1", level: "high", why: "Applicant 1 engages generously." }],
      options: [
        {
          option: "Option A",
          rank: 1,
          title: "One Monday group",
          pros: ["Everybody can make it."],
          cons: [],
          groups: [{ group: "Group A1", why: "Applicant 1 and Applicant 2 both want to test arguments.", facilitator: "Applicant 1", facilitatorWhy: "Stands out.", second: "", secondWhy: "" }],
          moves: [],
        },
      ],
      preferred: "Option A",
      preferredWhy: "Option A seats everybody.",
      notes: "",
    },
  };
}

const as = (uid) => {
  globalThis.__aUser = uid ? CAST[uid] : null;
};
const ARRANGE = (body = { askClaude: true }, programmeId = AGI) =>
  route.POST(
    new Request("http://naisi.invalid/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ roundId: ROUND, programmeId }) },
  );
const snapshot = () => JSON.stringify(db.paths().sort().map((path) => [path, db.read(path)]));

beforeEach(() => world());

describe("who may arrange groups", () => {
  test("nobody signed out", async () => {
    assert.equal((await ARRANGE()).status, 401);
  });

  for (const who of ["claudia", "lloyd", "tess", "amara"]) {
    test(`not ${who}: refused, and Claude is never asked`, async () => {
      as(who);
      assert.equal((await ARRANGE()).status, 403);
      assert.equal(globalThis.__claudeAsked.length, 0);
    });
  }

  test("a view-as session is refused first", async () => {
    as("zach");
    globalThis.__aBlocked = NextResponse.json({ error: "view-as" }, { status: 403 });
    assert.equal((await ARRANGE()).status, 403);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });
});

describe("before decision day, a preview", () => {
  test("of the people the decisions place on the programme, the caller's own application left out", async () => {
    as("zach");
    const before = snapshot();
    const response = await ARRANGE();
    assert.equal(response.status, 200, JSON.stringify(response.body));
    const { arrangement } = response.body;
    assert.equal(arrangement.preview, true);
    assert.equal(arrangement.runId, null);
    assert.deepEqual(Object.keys(arrangement.people).sort(), ["amara", "dev"]);
    assert.equal(snapshot(), before, "an arrangement wrote something");

    const [option] = arrangement.options;
    assert.equal(option.preferred, true);
    assert.deepEqual(option.groups.flatMap((g) => g.memberUids).sort(), ["amara", "dev"]);
    // Labels come back as names; Applicant 1 is amara (account-id order).
    assert.equal(option.groups[0].why, "Amara Okafor and Dev Patel both want to test arguments.");
    assert.deepEqual(option.groups[0].facilitators.map((f) => [f.uid, f.role, f.offered]), [["amara", "lead", false]]);
    assert.equal(arrangement.people.amara.potential.why, "Amara Okafor engages generously.");
    assert.equal(arrangement.preferredWhy, "Option A seats everybody.");
  });

  test("Claude is told labels, never a name, an address, a week or a Pangram finding", async () => {
    as("zach");
    db.seed(`admissionAssessments/${ROUND}__amara`, {
      roundId: ROUND,
      uid: "amara",
      pangram: { answers: [{ key: "x", worthALook: true }], failed: [], tooShort: 0, at: "" },
    });
    const response = await ARRANGE();
    assert.equal(response.status, 200);
    assert.equal(globalThis.__claudeAsked.length, 1);
    const { message } = globalThis.__claudeAsked[0];
    for (const leak of [...namesOf("amara"), ...namesOf("dev"), ...namesOf("zach"), "Pangram", "worth a look", "000000000fff"]) {
      assert.ok(!message.includes(leak), `the message carries ${leak}`);
    }
    assert.match(message, /## Option A: groups of up to 8/);
    // The flag is the admin's to weigh, on the screen.
    assert.equal(response.body.arrangement.people.amara.flags, 1);
  });

  test("without Claude, the site's own options, and Claude is not asked", async () => {
    as("zach");
    const response = await ARRANGE({ askClaude: false });
    assert.equal(response.status, 200);
    assert.equal(globalThis.__claudeAsked.length, 0);
    assert.equal(response.body.arrangement.asked, false);
    assert.ok(response.body.arrangement.options.length >= 1);
  });

  test("a body that does not say whether to ask Claude is refused", async () => {
    as("zach");
    assert.equal((await ARRANGE({})).status, 400);
  });
});

describe("after decision day", () => {
  test("it arranges the people on the run, so a programme with no run is refused", async () => {
    world({ decisionsSentAt: WHILE_DECIDING, decisionsSentByUid: "zach" });
    as("zach");
    const response = await ARRANGE();
    assert.equal(response.status, 409);
    assert.equal(response.body.error, "This programme names no course run yet.");
    assert.equal(globalThis.__claudeAsked.length, 0);
  });
});

describe("asking Claude about the groups on the screen", () => {
  const screen = [
    { key: "A1", name: "Group A", session: { weekday: 1, startTimeLocal: "18:00", durationMinutes: 120 }, room: 8, memberUids: ["amara"], facilitators: [] },
    { key: "A2", name: "Group B", session: { weekday: 2, startTimeLocal: "18:00", durationMinutes: 120 }, room: 8, memberUids: ["dev"], facilitators: [] },
  ];
  const ASK = (ask) => ARRANGE({ ask });

  beforeEach(() => {
    globalThis.__claudeAnswer = {
      ok: true,
      model: "claude-opus-5-5",
      usage: { inputTokens: 1, outputTokens: 1 },
      value: {
        answer: "Applicant 1 should lead Group A1, and Applicant 2 could join them.",
        moves: [
          { applicant: "Applicant 2", to: "Group A1", why: "Applicant 2 can make Monday." },
          { applicant: "Applicant 9", to: "Group A1", why: "x" },
        ],
      },
    };
  });

  test("only an admin, and Claude is not asked otherwise", async () => {
    assert.equal((await ASK({ question: "Who leads?", groups: screen })).status, 401);
    as("claudia");
    assert.equal((await ASK({ question: "Who leads?", groups: screen })).status, 403);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("a question is needed, and is kept short", async () => {
    as("zach");
    assert.equal((await ASK({ question: "  ", groups: screen })).status, 400);
    assert.equal((await ASK({ question: "x".repeat(1001), groups: screen })).status, 400);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("names in the question become labels, every programme is counted, and only moves that fit come back", async () => {
    as("zach");
    const before = snapshot();
    const response = await ASK({
      question: "Should Amara Okafor lead, or Dev?",
      history: [{ question: "Is Dev free on Mondays?", answer: "Dev Patel is." }],
      groups: screen,
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(snapshot(), before, "a question wrote something");
    const { message } = globalThis.__claudeAsked[0];
    for (const leak of [...namesOf("amara"), ...namesOf("dev"), ...namesOf("zach")]) {
      assert.ok(!message.includes(leak), `the message carries ${leak}`);
    }
    assert.match(message, /## The admin asks\nShould Applicant 1 lead, or Applicant 2\?/);
    assert.match(message, /Admin: Is Applicant 2 free on Mondays\?\nYou: Applicant 2 is\./);
    assert.match(message, /# AGI Strategy Fellowship: 2 people, sessions of 120 minutes/);
    assert.match(message, /- Mon 18:00: AGI Strategy 2 of 2; Technical AI Safety 0 of 1; Research incubator 0 of 0/);

    const { ask } = response.body;
    assert.equal(ask.answer, "Amara Okafor should lead Group A, and Dev Patel could join them.");
    assert.deepEqual(ask.moves, [{ uid: "dev", toKey: "A1", why: "Dev Patel can make Monday." }]);
    assert.equal(ask.dropped.length, 1);
  });
});

test("a group an arrangement adds always has a name", async () => {
  const { newGroupName } = await loadTs(join("lib", "applications", "arrange", "load.ts"));
  assert.equal(newGroupName([]), "Group A");
  assert.equal(newGroupName(["Group A", "Group B"]), "Group C");
  assert.equal(newGroupName(["Monday evening", "Group A"]), "Group B");
});

