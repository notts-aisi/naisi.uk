/**
 * Claude's read and Pangram's check of an application, run for real.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET  /api/admissions/forms/[roundId]/applications/[uid]/assessment         what has been made of one
 *   POST /api/admissions/forms/[roundId]/applications/[uid]/assessment         ask Claude or Pangram
 *   GET  /api/admissions/forms/[roundId]/programmes/[programmeId]/assessments  the marks on a list
 *
 * ## The rules this guards
 *
 *  - ONLY AN ADMIN. A lead, a reviewer, SU-recognised committee and the
 *    applicant are refused before anything is read, and nothing is sent
 *    anywhere. A view-as session is refused like every other write.
 *  - NO NAMES LEAVE. What Claude is sent carries no word of the applicant's
 *    name, no address and no account id, and calls reviewers "Reviewer A",
 *    never by name. It carries no availability.
 *  - NO NAMES ARE KEPT. The stored read holds the letters and the accounts
 *    they stood for, never a reviewer's name; the names are put back only on
 *    the way to the admin's screen.
 *  - A READ GOES OUT OF DATE when the reviews change, and says so.
 *  - PANGRAM SEES ONLY LONG ANSWERS, one at a time, and only their words.
 *  - A PART WITH NO KEY IS NEVER ASKED.
 *
 * Real: the three handlers, `access.ts`, everything under
 * `src/lib/applications/`, and the Pangram client, whose `fetch` is faked.
 * Faked: `next/server`, the Firestore sentinels, the view-as guard, the
 * session, the Admin SDK handle (`tests/lib/applicationsStore.mjs`) and the
 * Claude client, which records what it was asked and answers a fixed read.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  ROUND,
  WHILE_DECIDING,
  applicationDoc,
  applicationPath,
  namesOf,
  seedTerm,
  stringsIn,
} from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

void dirname(fileURLToPath(import.meta.url));

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

const FORMS = join("app", "api", "admissions", "forms", "[roundId]");
const route = await loadTs(join(FORMS, "applications", "[uid]", "assessment", "route.ts"));
const marksRoute = await loadTs(join(FORMS, "programmes", "[programmeId]", "assessments", "route.ts"));
const { NextResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(STUBS.get("next/server")).toString("base64")}`
);

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

const SENT_AT = new Date("2026-10-12T10:00:00+01:00");

const reviewDoc = (applicantUid, reviewerUid, scores, comments, notes) => ({
  roundId: ROUND,
  applicantUid,
  reviewerUid,
  scores,
  total: Object.values(scores).reduce((sum, value) => sum + value, 0),
  comments: comments.map(([id, questionKey, text]) => ({ id, questionKey, text, createdAt: SENT_AT, updatedAt: SENT_AT })),
  notes,
  createdAt: SENT_AT,
  updatedAt: SENT_AT,
});

const LONG =
  "I first read about AI safety in a seminar on the philosophy of mind, and since then I have " +
  "spent my evenings working through the alignment reading list, writing short notes on each " +
  "paper and arguing about them with two friends from my course. I want a group that will " +
  "push back on my arguments and help me find out which of them actually hold up. Last term I " +
  "ran a small reading group in my hall on the case for and against slowing frontier development, " +
  "and what I learned there is that I argue better when somebody who disagrees is in the room, which " +
  "is exactly what a fellowship group would give me week after week.";

/** Amara, with one answer long enough for Pangram. */
function amaraWithALongAnswer() {
  const doc = applicationDoc("amara", [AGI]);
  doc.sent = { ...doc.sent, aboutYou: { ...doc.sent.aboutYou, motivation: LONG } };
  doc.draft = doc.sent;
  return doc;
}

let db;
/** What Pangram was sent, as request bodies. */
let pangramBodies;

function world(over = {}) {
  db = makeDb(
    seedTerm({
      over: {
        [applicationPath("amara")]: amaraWithALongAnswer(),
        [`admissionReviews/${ROUND}__amara__claudia`]: reviewDoc(
          "amara",
          "claudia",
          { [`${AGI}.event`]: 4 },
          [["c1", `${AGI}.event`, "Argued from both sides."]],
          "Strong. Would do well in a group.",
        ),
        [`admissionReviews/${ROUND}__amara__lloyd`]: reviewDoc(
          "amara",
          "lloyd",
          { [`${AGI}.event`]: 2 },
          [],
          "A bit general.",
        ),
        ...over,
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
      lean: "strong",
      leanReason: "Reviewer A and Reviewer B differ, and the answers side with Reviewer A.",
      summary: "A philosophy student who wants to test arguments.",
      strengths: ["Reviewer A liked the event answer."],
      concerns: [],
      reviewers: "Reviewer A scored 4 and Reviewer B 2.",
      fit: "Suits AGI Strategy.",
      toWeigh: [],
      thinAnswers: [],
    },
  };
  process.env.PANGRAM_API_KEY = "test-key";
  pangramBodies = [];
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (!address.startsWith("https://text.external-api.pangram.com/")) {
      throw new Error(`unexpected fetch to ${address}`);
    }
    if (init.method === "POST") {
      pangramBodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ task_id: `t${pangramBodies.length}` }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        stage: "STAGE_SUCCESS",
        prediction_short: "AI-Assisted",
        headline: "Moderately AI-assisted",
        fraction_ai: 0.1,
        fraction_ai_assisted: 0.6,
        fraction_human: 0.3,
      }),
      { status: 200 },
    );
  };
}

const as = (uid) => {
  globalThis.__aUser = uid ? CAST[uid] : null;
};

function request(method, body, query = "") {
  return new Request(`http://naisi.invalid/api${query}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const params = (uid) => ({ params: Promise.resolve({ roundId: ROUND, uid }) });
const READ = (uid = "amara") => route.GET(request("GET", undefined, `?programme=${AGI}`), params(uid));
const ASK = (part, uid = "amara") => route.POST(request("POST", { part, programmeId: AGI }), params(uid));
const MARKS = () =>
  marksRoute.GET(request("GET"), { params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) });

const ASSESSMENT = `admissionAssessments/${ROUND}__amara`;

beforeEach(() => {
  world();
});

// ---------------------------------------------------------------------------
// Who may
// ---------------------------------------------------------------------------

describe("who may read or ask for an assessment", () => {
  test("nobody signed out", async () => {
    assert.equal((await READ()).status, 401);
    assert.equal((await ASK("claude")).status, 401);
    assert.equal((await MARKS()).status, 401);
  });

  for (const who of ["claudia", "lloyd", "tess", "yusuf", "amara", "dev"]) {
    test(`not ${who}: refused before anything is read or sent`, async () => {
      as(who);
      for (const response of [await READ(), await ASK("claude"), await ASK("pangram"), await MARKS()]) {
        assert.equal(response.status, 403);
      }
      assert.equal(globalThis.__claudeAsked.length, 0);
      assert.equal(pangramBodies.length, 0);
      assert.equal(db.paths().includes(ASSESSMENT), false);
    });
  }

  test("a view-as session is refused like every other write, and sends nothing", async () => {
    as("zach");
    globalThis.__aBlocked = NextResponse.json({ error: "view-as" }, { status: 403 });
    assert.equal((await ASK("claude")).status, 403);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("an admin who names no part meets the body check, and nothing is sent", async () => {
    as("zach");
    const response = await route.POST(request("POST", {}), params("amara"));
    assert.equal(response.status, 400);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("an application nobody sent is not found", async () => {
    as("zach");
    world({ [applicationPath("nina")]: applicationDoc("nina", [AGI], { sent: false }) });
    as("zach");
    assert.equal((await ASK("claude", "nina")).status, 404);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });
});

// ---------------------------------------------------------------------------
// What leaves, and what is kept
// ---------------------------------------------------------------------------

describe("what Claude is sent", () => {
  test("no word of the applicant's name, no address, no account id, no reviewer name", async () => {
    as("zach");
    assert.equal((await ASK("claude")).status, 200);
    assert.equal(globalThis.__claudeAsked.length, 1);
    const { message, system } = globalThis.__claudeAsked[0];
    for (const word of [...namesOf("amara"), "amara"]) {
      assert.equal(message.includes(word), false, `the message names the applicant: ${word}`);
    }
    for (const reviewer of ["Claudia", "Lloyd", "Reyes", "Brandon", "claudia", "lloyd"]) {
      assert.equal(message.includes(reviewer), false, `the message names a reviewer: ${reviewer}`);
    }
    assert.match(message, /Reviewer A/);
    assert.match(message, /Reviewer B/);
    // What it is for: the answers and what the committee said.
    assert.match(message, /philosophy of mind/);
    assert.match(message, /Argued from both sides\./);
    assert.match(message, /A bit general\./);
    // Not when they are free.
    assert.doesNotMatch(message, /availab|free on|Monday|Tuesday/i);
    // And the instructions say who decides.
    assert.match(system, /You never decide/);
  });

  test("the stored read keeps letters and accounts, never a reviewer's name", async () => {
    as("zach");
    await ASK("claude");
    const stored = db.read(ASSESSMENT);
    const strings = stringsIn(stored);
    for (const name of ["Claudia", "Lloyd", ...namesOf("amara")]) {
      assert.equal(strings.some((s) => s.includes(name)), false, `the stored read names ${name}`);
    }
    const read = stored.claude[AGI];
    assert.equal(read.lean, "strong");
    assert.deepEqual(
      Object.values(read.reviewerUids).filter(Boolean).sort(),
      ["claudia", "lloyd"],
    );
  });

  test("the admin's screen gets the names back", async () => {
    as("zach");
    const response = await ASK("claude");
    const shown = response.body.assessment.claude;
    assert.equal(shown.reviewers, "Claudia scored 4 and Lloyd 2.");
    assert.deepEqual(shown.strengths, ["Claudia liked the event answer."]);
    assert.equal(response.body.assessment.claudeOutOfDate, false);
  });

  test("a read goes out of date when a review changes, and says so", async () => {
    as("zach");
    await ASK("claude");
    db.seed(
      `admissionReviews/${ROUND}__amara__lloyd`,
      reviewDoc("amara", "lloyd", { [`${AGI}.event`]: 5 }, [], "On a second read, strong."),
    );
    const read = await READ();
    assert.equal(read.status, 200);
    assert.equal(read.body.assessment.claudeOutOfDate, true);
  });

  test("a decision does not put a read out of date", async () => {
    as("zach");
    await ASK("claude");
    const before = (await READ()).body.assessment.claudeOutOfDate;
    db.seed(`admissionDecisions/${ROUND}__dev`, {
      roundId: ROUND,
      uid: "dev",
      programmes: { [AGI]: { decision: "accept", poolReason: null, couldSuitProgrammeId: null, decidedByUid: "claudia", decidedAt: WHILE_DECIDING } },
    });
    assert.equal(before, false);
    assert.equal((await READ()).body.assessment.claudeOutOfDate, false);
  });

  test("a declined or failed read is a reason, and nothing is stored", async () => {
    as("zach");
    globalThis.__claudeAnswer = { ok: false, reason: "Claude declined to assess this one. Read it yourself." };
    const response = await ASK("claude");
    assert.equal(response.status, 500);
    assert.equal(response.body.error, "Claude declined to assess this one. Read it yourself.");
    assert.equal(db.paths().includes(ASSESSMENT), false);
  });

  test("a malformed read is refused, never stored", async () => {
    as("zach");
    globalThis.__claudeAnswer = { ...globalThis.__claudeAnswer, value: { lean: "maybe", summary: "" } };
    assert.equal((await ASK("claude")).status, 500);
    assert.equal(db.paths().includes(ASSESSMENT), false);
  });

  test("with no key, Claude is never asked", async () => {
    as("zach");
    globalThis.__claudeKey = false;
    assert.equal((await ASK("claude")).status, 409);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });
});

describe("what Pangram is sent", () => {
  test("only the long answers, one at a time, and only their words", async () => {
    as("zach");
    const response = await ASK("pangram");
    assert.equal(response.status, 200);
    assert.deepEqual(
      pangramBodies.map((body) => body.text),
      [LONG],
      "only the motivation is long enough; every other answer is a sentence",
    );
    assert.deepEqual(Object.keys(pangramBodies[0]).sort(), ["model", "text"]);
    const check = response.body.assessment.pangram;
    assert.equal(check.answers.length, 1);
    assert.equal(check.answers[0].label, "AI-Assisted");
    assert.equal(check.answers[0].worthALook, true);
    assert.ok(check.tooShort >= 1, "the short answers are counted, not sent");
    assert.equal(globalThis.__claudeAsked.length, 0, "asking Pangram asks nothing of Claude");
  });

  test("with no key, Pangram is never asked", async () => {
    as("zach");
    delete process.env.PANGRAM_API_KEY;
    assert.equal((await ASK("pangram")).status, 409);
    assert.equal(pangramBodies.length, 0);
  });
});

describe("the marks on a programme's list", () => {
  test("an admin sees each application's lean and Pangram count, and which parts are set up", async () => {
    as("zach");
    await ASK("claude");
    await ASK("pangram");
    const response = await MARKS();
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.marks, { amara: { lean: "strong", worthALook: 1 } });
    assert.deepEqual(response.body.configured, { claude: true, pangram: true });
  });
});

// ---------------------------------------------------------------------------
// Claude across a whole programme
// ---------------------------------------------------------------------------

const PROGRAMME = (body) =>
  marksRoute.POST(request("POST", body), { params: Promise.resolve({ roundId: ROUND, programmeId: AGI }) });

/** Claude's comparison, as the stub answers it. Amara is Applicant 1 (account ids in order). */
const OVERVIEW = {
  ok: true,
  model: "claude-opus-5-5",
  usage: { inputTokens: 1, outputTokens: 1 },
  value: {
    overall: "Applicant 1 is the strongest; Reviewer A and Reviewer B differ on them.",
    shortlist: [{ applicant: "Applicant 1", why: "Specific and engaged." }],
    borderline: [],
    notThisTime: [{ applicant: "Applicant 99", why: "Not on the list: dropped." }],
    secondLook: [{ applicant: "Applicant 2", why: "Not read yet." }],
    elsewhere: [],
  },
};

describe("asking Claude about a whole programme", () => {
  for (const who of ["claudia", "lloyd", "tess", "amara"]) {
    test(`not ${who}: refused before the body is read, and nothing is sent`, async () => {
      as(who);
      assert.equal((await PROGRAMME({ kind: "overview" })).status, 403);
      assert.equal((await PROGRAMME({ kind: "question", question: "Who?" })).status, 403);
      assert.equal(globalThis.__claudeAsked.length, 0);
    });
  }

  test("with nothing read yet, Claude is not asked, and the admin is told to assess first", async () => {
    as("zach");
    const response = await PROGRAMME({ kind: "overview" });
    assert.equal(response.status, 409);
    assert.match(response.body.error, /Assess them first/);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("a comparison sends numbers and letters, never a name, and the screen gets the names back", async () => {
    as("zach");
    await ASK("claude");
    globalThis.__claudeAsked = [];
    globalThis.__claudeAnswer = OVERVIEW;
    const response = await PROGRAMME({ kind: "overview" });
    assert.equal(response.status, 200);

    const { message } = globalThis.__claudeAsked[0];
    for (const uid of ["amara", "dev", "wen"]) {
      for (const word of namesOf(uid)) assert.equal(message.includes(word), false, `the comparison names ${word}`);
    }
    for (const reviewer of ["Claudia", "Lloyd"]) assert.equal(message.includes(reviewer), false);
    assert.match(message, /## Applicant 1/);
    assert.match(message, /Not read by Claude yet/);

    const overview = response.body.overview;
    assert.equal(overview.overall, "Amara is the strongest; Claudia and Lloyd differ on them.".replace("Amara", "Amara Okafor"));
    assert.deepEqual(overview.shortlist, [{ uid: "amara", name: "Amara Okafor", why: "Specific and engaged." }]);
    assert.equal(overview.secondLook[0].uid, "dev");
    assert.equal(overview.notThisTime[0].uid, null, "a label that is not on the list names nobody");
    assert.equal(overview.read, 1);
    assert.equal(overview.total, 3);
  });

  test("nothing about a comparison is stored", async () => {
    as("zach");
    await ASK("claude");
    const before = JSON.stringify(db.read(ASSESSMENT));
    const paths = db.paths().length;
    globalThis.__claudeAnswer = OVERVIEW;
    await PROGRAMME({ kind: "overview" });
    assert.equal(JSON.stringify(db.read(ASSESSMENT)), before);
    assert.equal(db.paths().length, paths);
  });

  test("a name typed into a question is swapped for a label before it is sent", async () => {
    as("zach");
    await ASK("claude");
    globalThis.__claudeAsked = [];
    globalThis.__claudeAnswer = {
      ok: true,
      model: "claude-opus-5-5",
      usage: { inputTokens: 1, outputTokens: 1 },
      value: { answer: "Applicant 1 is more specific than Applicant 2, as Reviewer A said." },
    };
    const response = await PROGRAMME({ kind: "question", question: "How does Amara compare with Dev Patel? Ask Claudia." });
    assert.equal(response.status, 200);
    const { message } = globalThis.__claudeAsked[0];
    for (const word of ["Amara", "Dev Patel", "Patel", "Claudia"]) {
      assert.equal(message.includes(word), false, `the question sent ${word}`);
    }
    assert.match(message, /How does Applicant 1 compare with Applicant 2\? Ask Reviewer A\./);
    assert.equal(response.body.answer, "Amara Okafor is more specific than Dev Patel, as Claudia said.");
  });

  test("an empty or very long question is refused before anything is read", async () => {
    as("zach");
    assert.equal((await PROGRAMME({ kind: "question", question: "  " })).status, 400);
    assert.equal((await PROGRAMME({ kind: "question", question: "x".repeat(1001) })).status, 400);
    assert.equal((await PROGRAMME({})).status, 400);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });
});
