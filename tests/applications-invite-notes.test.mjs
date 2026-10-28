/**
 * A personal note in a pooled applicant's invitation, run for real.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT  /api/admissions/forms/[roundId]/pool/note  { uid, note }  save it, or take it off
 *   POST /api/admissions/forms/[roundId]/pool/note  { uid }        Claude drafts it
 *
 * ## The rules this guards
 *
 *  - THE WORDS (`emailCopy.ts`): a saved note goes under the invitation's
 *    first paragraph, in the standard wording and a programme's own alike,
 *    and in no other email.
 *  - ONLY AN ADMIN'S SAVE PUTS WORDS IN AN EMAIL. The note is written onto the
 *    invitation on the decision document as the admin's; the applicant's own
 *    document is untouched; the audit row says a note was saved and never
 *    what it says. Claude's draft is kept beside its read, on the assessment
 *    document, and nothing that emails reads it.
 *  - THE SAME FENCES AS THE OUTCOME: admins only (refused before anything is
 *    read, and Claude is never asked), never the caller's own, only with an
 *    invitation picked, nothing once the term is sent.
 *  - THE NOTE BELONGS TO ITS INVITATION. Picking another programme drops it;
 *    picking the same one keeps it.
 *  - CLAUDE IS SENT THE APPLICATION ALONE: no name, no address, nothing the
 *    committee scored or wrote. What it drafts keeps the site's one dash rule.
 *  - DECISION DAY SENDS IT. The send's own composer (`send.ts#emailFor`, which
 *    the preview, the test send and the send all call) carries the saved note.
 *
 * Real: both handlers, the pool route, `access.ts` and everything under
 * `src/lib/applications/`. Faked: the store (`tests/lib/applicationsStore.mjs`),
 * the session, the view-as guard and Claude.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { FIELD_VALUE_STUB, makeDb } from "./lib/applicationsStore.mjs";
import {
  AGI,
  CAST,
  INCUBATOR,
  ROUND,
  TAIS,
  WHILE_DECIDING,
  applicationPath,
  decisionPath,
  namesOf,
  seedTerm,
  stringsIn,
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
  ["@/lib/firebase/admin", "export function getAdminDb() {\n  return globalThis.__nDb ?? null;\n}"],
  ["@/lib/firebase/session", "export async function getCurrentUser() {\n  return globalThis.__nUser ?? null;\n}"],
  [
    "@/lib/firebase/impersonation",
    "export async function assertNotImpersonating() {\n  return globalThis.__nBlocked ?? null;\n}",
  ],
  ["@/lib/ai/claude", CLAUDE_STUB],
]);
const { loadTs } = createLoader({ stubs: STUBS });

const FORMS = join("app", "api", "admissions", "forms", "[roundId]");
const noteRoute = await loadTs(join(FORMS, "pool", "note", "route.ts"));
const poolRoute = await loadTs(join(FORMS, "pool", "route.ts"));
const copy = await loadTs(join("lib", "applications", "decisionDay", "emailCopy.ts"));
const send = await loadTs(join("lib", "applications", "decisionDay", "send.ts"));
const { tidyNote } = await loadTs(join("lib", "applications", "decisionDay", "inviteNote.ts"));
const repo = await loadTs(join("lib", "applications", "repo.ts"));
const { NextResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(STUBS.get("next/server")).toString("base64")}`
);

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

const FORM = {
  programmes: {
    tech: {
      id: "tech",
      kind: "fellowship",
      name: "Technical AI Safety Fellowship",
      shortName: "Technical AI Safety",
      starts: "w/c 26 Oct",
      leadUid: "tess",
      emailWording: {},
    },
    agi: {
      id: "agi",
      kind: "fellowship",
      name: "AGI Strategy Fellowship",
      shortName: "AGI Strategy",
      starts: "w/c 26 Oct",
      leadUid: "claudia",
      emailWording: {},
    },
  },
  noOfferWording: null,
};

const compose = (over = {}) =>
  copy.composeDecisionEmail({
    outcome: { kind: "invited", programmeId: "tech" },
    firstName: "Dev",
    form: FORM,
    ranked: ["agi"],
    leadNames: { tech: "Tess", agi: "Claudia" },
    replyBy: "Sun 1 Nov",
    links: { application: "https://naisi.invalid/a", events: "https://naisi.invalid/e" },
    ...over,
  });

const NOTE = "Your answer about how a new law changes what labs do is the question this programme starts from.";

describe("the words: where a note goes, and where it never goes", () => {
  test("under the invitation's first paragraph, before the day to accept by", () => {
    const plain = compose();
    const noted = compose({ note: NOTE });
    assert.deepEqual(noted.paragraphs, [plain.paragraphs[0], NOTE, plain.paragraphs[1]]);
    assert.equal(noted.subject, plain.subject);
    assert.deepEqual(noted.buttons, plain.buttons);
  });

  test("a blank line in a note is a new paragraph, and an empty note changes nothing", () => {
    const noted = compose({ note: "First thought.\n\nSecond thought.\nStill the second." });
    assert.deepEqual(noted.paragraphs.slice(1, 3), ["First thought.", "Second thought.\nStill the second."]);
    assert.deepEqual(compose({ note: "  \n " }).paragraphs, compose().paragraphs);
    assert.deepEqual(compose({ note: null }).paragraphs, compose().paragraphs);
  });

  test("a programme's own invitation wording keeps the note under its first paragraph", () => {
    const own = {
      ...FORM,
      programmes: {
        ...FORM.programmes,
        tech: { ...FORM.programmes.tech, emailWording: { invitation: { subject: "", body: "Our own opening.\n\nOur own close." } } },
      },
    };
    assert.deepEqual(compose({ form: own, note: NOTE }).paragraphs, ["Our own opening.", NOTE, "Our own close."]);
  });

  test("no other email carries one", () => {
    for (const outcome of [{ kind: "accepted", programmeId: "tech" }, { kind: "no-offer" }, { kind: "declined" }]) {
      const email = compose({ outcome, ranked: ["tech"], note: NOTE });
      assert.ok(!email.paragraphs.includes(NOTE), `${outcome.kind} carried the note`);
    }
  });

  test("the daily reminder is the invitation again, note and all", () => {
    const reminder = copy.composeInvitationReminder({ ...inputOf(), note: NOTE }, {
      replyBy: "Sun 1 Nov",
      lastDay: false,
    });
    assert.deepEqual(reminder.paragraphs.slice(1), compose({ note: NOTE }).paragraphs);
  });

  test("what Claude drafts keeps the one dash rule, and the length a note may be", () => {
    assert.equal(tidyNote("Governance — and philosophy – fit here. "), "Governance, and philosophy, fit here.");
    assert.equal(tidyNote("x".repeat(5000)).length, 1200);
  });
});

function inputOf() {
  return {
    outcome: { kind: "invited", programmeId: "tech" },
    firstName: "Dev",
    form: FORM,
    ranked: ["agi"],
    leadNames: { tech: "Tess", agi: "Claudia" },
    replyBy: "Sun 1 Nov",
    links: { application: "https://naisi.invalid/a", events: "https://naisi.invalid/e" },
  };
}

// ---------------------------------------------------------------------------
// The routes
// ---------------------------------------------------------------------------

/** Dev ranked AGI Strategy only; it pooled him, and an admin picked an invitation to the incubator. */
const pooledBy = (programmes, pooledOutcome) => ({
  roundId: ROUND,
  programmes: Object.fromEntries(
    programmes.map((id) => [
      id,
      { decision: "pool", poolReason: "capacity", couldSuitProgrammeId: null, decidedByUid: "claudia", decidedAt: WHILE_DECIDING },
    ]),
  ),
  pooledOutcome,
  exception: null,
});
const INVITED = { kind: "invite", programmeId: INCUBATOR, setByUid: "zach", setAt: WHILE_DECIDING };

let db;

function world(round = {}, over = {}) {
  db = makeDb(
    seedTerm({
      round,
      over: {
        [decisionPath("dev")]: { uid: "dev", ...pooledBy([AGI], INVITED) },
        // Amara: pooled by both, and told nothing but "no offer this time".
        [decisionPath("amara")]: {
          uid: "amara",
          ...pooledBy([AGI, TAIS], { kind: "no-offer", setByUid: "zach", setAt: WHILE_DECIDING }),
        },
        // Wen: a place on Technical AI Safety, so not pooled at all.
        [decisionPath("wen")]: {
          uid: "wen",
          roundId: ROUND,
          programmes: {
            [TAIS]: { decision: "accept", poolReason: null, couldSuitProgrammeId: null, decidedByUid: "tess", decidedAt: WHILE_DECIDING },
          },
          pooledOutcome: null,
          exception: null,
        },
        ...over,
      },
    }),
    { now: WHILE_DECIDING },
  );
  globalThis.__nDb = db;
  globalThis.__nBlocked = null;
  globalThis.__nUser = null;
  globalThis.__claudeKey = true;
  globalThis.__claudeAsked = [];
  globalThis.__claudeAnswer = {
    ok: true,
    model: "claude-opus-5-5",
    usage: { inputTokens: 1, outputTokens: 1 },
    value: {
      note: "You wrote about a new law coming into force — the incubator is where that question becomes a project.",
      basis: "Their answer about something that happened in AI this year.",
    },
  };
}

const as = (uid) => {
  globalThis.__nUser = uid ? CAST[uid] : null;
};
const request = (method, body) =>
  new Request("http://naisi.invalid/api", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const params = { params: Promise.resolve({ roundId: ROUND }) };
const SAVE = (uid, note) => noteRoute.PUT(request("PUT", { uid, note }), params);
const DRAFT = (uid) => noteRoute.POST(request("POST", { uid }), params);
const PICK = (uid, outcome) => poolRoute.PUT(request("PUT", { uid, outcome }), params);
const ASSESSMENT = (uid) => `admissionAssessments/${ROUND}__${uid}`;
const AUDIT = () => db.paths().filter((path) => path.startsWith("courseAudit/")).map((path) => db.read(path));
const rowOf = (response, uid) => response.body.board.rows.find((row) => row.uid === uid);

beforeEach(() => world());

describe("who may save or draft a note", () => {
  test("nobody signed out", async () => {
    assert.equal((await SAVE("dev", NOTE)).status, 401);
    assert.equal((await DRAFT("dev")).status, 401);
  });

  for (const who of ["claudia", "lloyd", "tess", "yusuf", "amara"]) {
    test(`not ${who}: refused, nothing written, and Claude is never asked`, async () => {
      as(who);
      const before = db.read(decisionPath("dev"));
      assert.equal((await SAVE("dev", NOTE)).status, 403);
      assert.equal((await DRAFT("dev")).status, 403);
      assert.deepEqual(db.read(decisionPath("dev")), before);
      assert.equal(db.read(ASSESSMENT("dev")), undefined);
      assert.equal(globalThis.__claudeAsked.length, 0);
    });
  }

  test("a view-as session is refused first", async () => {
    as("zach");
    globalThis.__nBlocked = NextResponse.json({ error: "view-as" }, { status: 403 });
    assert.equal((await SAVE("dev", NOTE)).status, 403);
    assert.equal((await DRAFT("dev")).status, 403);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("never the caller's own application", async () => {
    as("zach");
    assert.equal((await SAVE("zach", NOTE)).status, 403);
    assert.equal((await DRAFT("zach")).status, 403);
  });

  test("a body that does not say whose, or a note that is not text, is refused", async () => {
    as("zach");
    assert.equal((await noteRoute.PUT(request("PUT", { note: NOTE }), params)).status, 400);
    assert.equal((await noteRoute.PUT(request("PUT", { uid: "dev", note: 3 }), params)).status, 400);
    assert.equal((await noteRoute.POST(request("POST", {}), params)).status, 400);
  });
});

describe("saving a note", () => {
  test("lands on the invitation as the admin's, and tells the applicant nothing", async () => {
    as("zach");
    const applicant = structuredClone(db.read(applicationPath("dev")));
    const response = await SAVE("dev", `  ${NOTE}\r\n`);
    assert.equal(response.status, 200);
    const stored = db.read(decisionPath("dev")).pooledOutcome;
    assert.deepEqual(stored, { ...INVITED, note: { text: NOTE, setByUid: "zach", setAt: WHILE_DECIDING } });
    assert.deepEqual(db.read(applicationPath("dev")), applicant, "the applicant's own document is untouched");

    const row = rowOf(response, "dev");
    assert.deepEqual(row.note, { text: NOTE, by: "Zach" });
    assert.equal(row.email.paragraphs[1], NOTE, "the email as it would go carries it");
    assert.ok(!stringsIn(response.body.board).some((text) => text.includes("@")), "no address reaches the page");

    const [audit] = AUDIT();
    assert.equal(audit.subjectUid, "dev");
    assert.ok(!JSON.stringify(audit).includes("new law"), "the log never holds what the note says");
  });

  test("the same words again change nothing; an empty note takes it off", async () => {
    as("zach");
    await SAVE("dev", NOTE);
    await SAVE("dev", NOTE);
    assert.equal(AUDIT().length, 1);
    const off = await SAVE("dev", "   ");
    assert.equal(off.status, 200);
    assert.equal(db.read(decisionPath("dev")).pooledOutcome.note, null);
    assert.equal(rowOf(off, "dev").note, null);
    assert.equal(AUDIT().length, 2);
  });

  test("a note longer than a note may be is refused", async () => {
    as("zach");
    assert.equal((await SAVE("dev", "x".repeat(1201))).status, 400);
    assert.equal(db.read(decisionPath("dev")).pooledOutcome.note, undefined);
  });

  test("only with an invitation picked, for somebody pooled", async () => {
    as("zach");
    assert.equal((await SAVE("amara", NOTE)).status, 409, "no offer this time carries no note");
    assert.equal((await SAVE("wen", NOTE)).status, 409, "somebody with a place is not pooled");
    assert.equal((await SAVE("nobody", NOTE)).status, 404);
  });

  test("nothing once decisions have gone out", async () => {
    world({ decisionsSentAt: WHILE_DECIDING, decisionsSentByUid: "zach" });
    as("zach");
    assert.equal((await SAVE("dev", NOTE)).status, 409);
    assert.equal((await DRAFT("dev")).status, 409);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("the note belongs to its invitation: another programme drops it, the same one keeps it", async () => {
    as("zach");
    await SAVE("dev", NOTE);
    await PICK("dev", { kind: "invite", programmeId: INCUBATOR });
    assert.equal(db.read(decisionPath("dev")).pooledOutcome.note.text, NOTE);
    await PICK("dev", { kind: "invite", programmeId: TAIS });
    assert.equal(db.read(decisionPath("dev")).pooledOutcome.note, undefined);
    assert.equal(db.read(decisionPath("dev")).pooledOutcome.programmeId, TAIS);
  });
});

describe("Claude drafts a note", () => {
  test("from the application alone, kept beside its read, and sent to nobody", async () => {
    as("zach");
    const decision = structuredClone(db.read(decisionPath("dev")));
    const response = await DRAFT("dev");
    assert.equal(response.status, 200);
    assert.equal(globalThis.__claudeAsked.length, 1);

    const { message, system } = globalThis.__claudeAsked[0];
    assert.match(message, /# The programme we are inviting them to\n## Research Incubator\nA research incubator\./);
    assert.match(message, /## AGI Strategy Fellowship/);
    assert.ok(message.includes("A new law came into force."), "their own answers are there");
    for (const leak of [...namesOf("dev"), "What the committee said", "Reviewer", "places)"]) {
      assert.ok(!message.includes(leak), `the message carries ${leak}`);
    }
    assert.match(system, /Never use an em dash or an en dash/);

    const draft = db.read(ASSESSMENT("dev")).inviteDraft;
    assert.deepEqual(
      [draft.programmeId, draft.text, draft.model],
      [INCUBATOR, "You wrote about a new law coming into force, the incubator is where that question becomes a project.", "claude-opus-5-5"],
    );
    assert.deepEqual(db.read(decisionPath("dev")), decision, "the invitation carries nothing Claude wrote");

    const row = rowOf(response, "dev");
    assert.equal(row.note, null);
    assert.equal(row.draft.text, draft.text);
    assert.ok(!row.email.paragraphs.includes(draft.text), "the email as it would go does not carry a draft");
  });

  test("a draft for another programme is not shown", async () => {
    world({}, { [ASSESSMENT("dev")]: { roundId: ROUND, uid: "dev", inviteDraft: { programmeId: TAIS, text: "Old.", basis: "", model: "m", at: "" } } });
    as("zach");
    const response = await PICK("dev", { kind: "invite", programmeId: INCUBATOR });
    assert.equal(rowOf(response, "dev").draft, null);
  });

  test("not without an invitation, and not without Claude", async () => {
    as("zach");
    assert.equal((await DRAFT("amara")).status, 409);
    globalThis.__claudeKey = false;
    assert.equal((await DRAFT("dev")).status, 409);
    assert.equal(globalThis.__claudeAsked.length, 0);
  });

  test("when Claude cannot answer, the reason is said and nothing is kept", async () => {
    as("zach");
    globalThis.__claudeAnswer = { ok: false, reason: "Claude is busy." };
    const response = await DRAFT("dev");
    assert.deepEqual([response.status, response.body.error], [500, "Claude is busy."]);
    assert.equal(db.read(ASSESSMENT("dev")), undefined);
  });
});

describe("decision day carries the saved note", () => {
  test("the invitation the send composes is the one with the note", async () => {
    as("zach");
    await SAVE("dev", NOTE);
    const form = await repo.loadForm(db, ROUND);
    const board = await send.buildSendBoard(db, form, "zach", WHILE_DECIDING);
    const preview = board.invited.preview;
    assert.equal(preview.to, "Dev Patel");
    assert.equal(preview.paragraphs[1], NOTE);
  });

  test("and without one, the standard words", async () => {
    const form = await repo.loadForm(db, ROUND);
    const board = await send.buildSendBoard(db, form, "zach", WHILE_DECIDING);
    assert.equal(board.invited.preview.paragraphs.length, 2);
  });
});
