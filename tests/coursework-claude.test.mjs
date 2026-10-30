/**
 * CLAUDE AND PANGRAM ON COURSEWORK, AND THE NOTES ADMINS KEEP (privacy v13),
 * driven through the real routes on AGI Strategy's run in its third week.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is `tests/lib/facilitatorWeekWorld.mjs` (week 3 written as
 * blocks, three parts of two reflection prompts each), whose form gives a
 * place to Amara, Bea, Dev and Tariq; Zach is an admin, Claudia leads the
 * programme, Lloyd reviews it, Rahul facilitates Group B. On top of it:
 *
 *  - AGREEMENTS: Amara, Bea and Tariq first agreed to privacy v13 on 1 Nov;
 *    Dev agreed only to v12.
 *  - ROWS, each with when it was first written: Amara's first reflection
 *    after her agreement and her second BEFORE it; Bea's first after, naming
 *    Dev Patel and typing an email address; Dev's after (but Dev never
 *    agreed); Tariq's third a long answer after, and his fourth a short one.
 *  - TARIQ FACILITATES Group A as well as holding a place: his work is never
 *    among the best answers, and Pangram may still read it.
 *  - PRIVATE NOTES on the week's sources (the world's own), which nothing
 *    here may send.
 *
 * Claude is a stub that records what it is asked and answers what a test
 * says; Pangram is the real client with `fetch` faked, so its request is the
 * one the site would make. Every name, address and word is made up.
 *
 * What is held, by section:
 *  1. Notes: admins only, never about yourself, the lead refused; add, edit,
 *     delete; which notes each place shows; a view-as session refused.
 *  2. Claude's draft of a note: only counted rows, no name, nothing stored.
 *  3. Best answers: the lead and admins; labels to Claude, names back on the
 *     way out; a facilitator's own work and uncounted rows never sent; picks
 *     dropped for somebody who no longer holds a place; out of date.
 *  4. Pangram: admins only (the lead never sees a reading), only counted
 *     answers of 50 words or more, one request, out of date on a change.
 *  5. The pure builders, on fixtures holding every kind of identifier.
 *  6. Deletion: an account's notes, readings and picks.
 */
import { after, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { makeFacilitatorPagesWorld } from "./lib/facilitatorPagesWorld.mjs";
import { AGI, NOTED, NOW, ROUND, RUN, SAID, facilitatorWeekSeed, reflection } from "./lib/facilitatorWeekWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
after(() => mock.timers.reset());

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export function claudeConfigured() { return globalThis.__cwClaudeKey !== false; }
export async function askClaudeForJson(input) {
  globalThis.__cwClaudeAsked.push(input);
  return globalThis.__cwClaudeAnswer;
}`;

const w = await makeFacilitatorPagesWorld("__cw", [["@/lib/ai/claude", CLAUDE_STUB]]);
const route = (...parts) => w.loadTs(join("app", "api", ...parts, "route.ts"));
const PROGRAMME = ["admissions", "forms", "[roundId]", "programmes", "[programmeId]", "coursework"];
const routes = {
  notes: await route("admin", "members", "[uid]", "notes"),
  note: await route("admin", "members", "[uid]", "notes", "[noteId]"),
  draft: await route("admin", "members", "[uid]", "notes", "draft"),
  best: await route(...PROGRAMME, "best-answers"),
  week: await route(...PROGRAMME, "pangram"),
  person: await route(...PROGRAMME, "[uid]", "pangram"),
};
const model = await w.loadTs(join("lib", "courses", "coursework", "input.ts"));
const notesModel = await w.loadTs(join("lib", "memberNotes", "model.ts"));

const AGREED = new Date("2026-11-01T09:00:00Z");
const BEFORE = new Date("2026-10-20T09:00:00Z");
const AFTER = new Date("2026-11-10T09:00:00Z");
const LONG =
  "The keepers kept a log of every ship that passed, and the log is how we know the light mattered. " +
  "Without it the harbour board would have argued the lamp away years earlier, because nobody counts a " +
  "wreck that did not happen. I think the reading undersells how much of safety work is keeping that kind " +
  "of record, boring as it is, so that the case can be made later.";
const SHORT = "The fog bell, mostly.";
const BEA_SAID = "Dev Patel and I argued about the lamps; write to bea.lindqvist@example.com if you disagree.";
const PRIVATE = Object.values(NOTED).map(([, text]) => text);

const rowPath = (uid, promptId) => `courseExerciseResponses/${RUN.agi}__${uid}__w03__${promptId}`;
const written = (uid, promptId, text, firstWrittenAt) => ({ ...reflection(uid, promptId, text), firstWrittenAt });

function seed() {
  const s = facilitatorWeekSeed();
  for (const uid of ["amara", "bea", "tariq"]) {
    s[`users/${uid}`] = { ...s[`users/${uid}`], policyVersion: "terms.1+privacy.13", policyAgreedAt: AGREED, courseworkUseAgreedAt: AGREED };
  }
  s["users/dev"] = { ...s["users/dev"], policyVersion: "terms.1+privacy.12", policyAgreedAt: AGREED };
  s[rowPath("amara", "k3-rp1")] = written("amara", "k3-rp1", SAID.amara["k3-rp1"], AFTER);
  s[rowPath("amara", "k3-rp2")] = written("amara", "k3-rp2", SAID.amara["k3-rp2"], BEFORE);
  s[rowPath("bea", "k3-rp1")] = written("bea", "k3-rp1", BEA_SAID, AFTER);
  s[rowPath("dev", "k3-rp1")] = written("dev", "k3-rp1", "Seven, and Dev counted them twice.", AFTER);
  s[rowPath("tariq", "k3-rp3")] = written("tariq", "k3-rp3", LONG, AFTER);
  s[rowPath("tariq", "k3-rp4")] = written("tariq", "k3-rp4", SHORT, AFTER);
  // Tariq facilitates Group A as well as holding a place.
  const groupA = Object.keys(s).find((path) => path.startsWith("courseGroups/") && path.endsWith("grp00001"));
  s[groupA] = { ...s[groupA], facilitatorUids: [...(s[groupA].facilitatorUids ?? []), "tariq"] };
  return s;
}

const params = { roundId: ROUND, programmeId: AGI };

/** One request to a real handler as `who`, with a query and a body. */
async function ask(who, handler, ctxParams, { query = "", body, viewAs = false } = {}) {
  w.world.user = who === null ? null : w.sessionOf(who);
  w.world.viewAs = viewAs;
  const init = { method: handler.name, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const response = await handler(new Request(`https://naisi.invalid/api${query}`, init), { params: Promise.resolve(ctxParams) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    w.world.viewAs = false;
  }
}

/** Start again from the seed, with `extra` documents beside it. */
function reset(extra = {}) {
  w.reset({ ...seed(), ...extra });
  globalThis.__cwClaudeKey = true;
  globalThis.__cwClaudeAsked = [];
  globalThis.__cwClaudeAnswer = { ok: false, reason: "No answer set." };
  delete process.env.PANGRAM_API_KEY;
}

/** Every string anywhere in a value. */
function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) stringsIn(item, out);
  return out;
}

/** Everything a message must never carry: every name part, every account id, every address, every private note. */
const NEVER = [
  /Amara|Okafor|Lindqvist|Patel|Tariq|Mensah|Claudia|Rahul|Sofia|Chloe|Farah/,
  /\bBea\b|\bDev\b/,
  /\bamara\b|\bbea\b|\btariq\b|\bclaudia\b|\bzach\b/,
  /@example\.com|@/,
  /Group [ABCD]\b/,
];

function assertClean(text, what) {
  for (const pattern of NEVER) assert.doesNotMatch(text, pattern, `${what} carries ${pattern}`);
  for (const note of PRIVATE) assert.ok(!text.includes(note), `${what} carries a private note`);
}

// ---------------------------------------------------------------------------
// 1. Notes
// ---------------------------------------------------------------------------

describe("notes about a person: admins only, and never about yourself", () => {
  test("everybody but an admin is refused before anything is read, the lead included", async () => {
    reset();
    for (const who of ["claudia", "lloyd", "rahul", "amara", "yusuf"]) {
      assert.equal((await ask(who, routes.notes.GET, { uid: "amara" })).status, 403, `${who} read notes`);
      assert.equal((await ask(who, routes.notes.POST, { uid: "amara" }, { body: { text: "x" } })).status, 403, `${who} wrote a note`);
      assert.equal((await ask(who, routes.note.PATCH, { uid: "amara", noteId: "n1" }, { body: { text: "x" } })).status, 403);
      assert.equal((await ask(who, routes.note.DELETE, { uid: "amara", noteId: "n1" })).status, 403);
      assert.equal((await ask(who, routes.draft.POST, { uid: "amara" }, { body: { runId: RUN.agi } })).status, 403);
    }
    assert.equal((await ask(null, routes.notes.GET, { uid: "amara" })).status, 401);
    assert.deepEqual(globalThis.__cwClaudeAsked, []);
  });

  test("an admin is refused the notes about themselves", async () => {
    reset();
    const read = await ask("zach", routes.notes.GET, { uid: "zach" });
    assert.equal(read.status, 403);
    assert.match(read.body.error, /never shown to you/);
    assert.equal((await ask("zach", routes.notes.POST, { uid: "zach" }, { body: { text: "Note to self" } })).status, 403);
  });

  test("a view-as session writes nothing", async () => {
    reset();
    const before = w.everything();
    const refused = await ask("zach", routes.notes.POST, { uid: "amara" }, { body: { text: "Written as somebody else" }, viewAs: true });
    assert.equal(refused.status, 403);
    assert.equal(w.everything(), before);
  });

  test("an admin adds, edits and deletes a note, and the answer is field by field", async () => {
    reset();
    const added = await ask("zach", routes.notes.POST, { uid: "amara" }, { body: { text: "  Sharp on the reading.\r\n\r\n\r\nAsk her to facilitate.  ", runId: RUN.agi } });
    assert.equal(added.status, 200);
    assert.deepEqual(Object.keys(added.body), ["id"]);
    const stored = w.world.db.read(`memberNotes/${added.body.id}`);
    assert.equal(stored.uid, "amara");
    assert.equal(stored.authorUid, "zach");
    assert.equal(stored.text, "Sharp on the reading.\n\nAsk her to facilitate.");
    assert.equal(stored.draftedByClaude, false);
    assert.equal(stored.runId, RUN.agi);
    assert.ok(stored.programmeLabel.length > 0, "a note from a run keeps the programme's name");
    assert.ok(!("authorName" in stored), "the author's name is looked up, never stored");

    const read = await ask("zach", routes.notes.GET, { uid: "amara" }, { query: "?place=profile" });
    assert.equal(read.status, 200);
    assert.deepEqual(Object.keys(read.body).sort(), ["agreed", "claude", "hidden", "notes", "runs"]);
    assert.deepEqual(Object.keys(read.body.notes[0]).sort(), [
      "authorName", "beforeAgreement", "createdAt", "draftedByClaude", "edited", "id", "mine", "programme", "text", "updatedAt",
    ]);
    assert.equal(read.body.notes[0].mine, true);
    assert.equal(read.body.notes[0].beforeAgreement, false, "written after Amara agreed");
    assert.equal(read.body.agreed, true);

    assert.equal((await ask("zach", routes.note.PATCH, { uid: "amara", noteId: added.body.id }, { body: { text: "Sharp on the reading." } })).status, 200);
    assert.equal(w.world.db.read(`memberNotes/${added.body.id}`).text, "Sharp on the reading.");
    // A note about somebody else answers as a note that is not here.
    assert.equal((await ask("zach", routes.note.DELETE, { uid: "bea", noteId: added.body.id })).status, 404);
    assert.equal((await ask("zach", routes.note.DELETE, { uid: "amara", noteId: added.body.id })).status, 200);
    assert.equal(w.world.db.read(`memberNotes/${added.body.id}`), undefined);
  });

  test("a note is refused empty, too long, or from a run the person is not on", async () => {
    reset();
    assert.equal((await ask("zach", routes.notes.POST, { uid: "amara" }, { body: { text: "   " } })).status, 400);
    assert.equal((await ask("zach", routes.notes.POST, { uid: "amara" }, { body: { text: "x".repeat(4001) } })).status, 400);
    assert.equal((await ask("zach", routes.notes.POST, { uid: "amara" }, { body: { text: "Fine", runId: "another-run" } })).status, 400);
    assert.equal((await ask("zach", routes.notes.POST, { uid: "nobody-here" }, { body: { text: "Fine" } })).status, 404);
  });

  test("beside an application only notes written after the agreement show; a programme's pages show its own earlier ones", async () => {
    const note = (id, createdAt, runId) => ({
      uid: "amara", text: `Note ${id}`, authorUid: "zach", draftedByClaude: false, runId,
      programmeLabel: runId ? "AGI Strategy, Autumn 2026" : "", createdAt, updatedAt: createdAt,
    });
    reset({
      "memberNotes/early-here": note("early-here", BEFORE, RUN.agi),
      "memberNotes/early-elsewhere": note("early-elsewhere", BEFORE, "another-run"),
      "memberNotes/early-profile": note("early-profile", BEFORE, null),
      "memberNotes/late": note("late", AFTER, "another-run"),
      "memberNotes/dev-late": { ...note("dev-late", AFTER, null), uid: "dev" },
    });

    const ids = (answer) => answer.body.notes.map((shown) => shown.id).sort();
    const application = await ask("zach", routes.notes.GET, { uid: "amara" }, { query: "?place=application" });
    assert.deepEqual(ids(application), ["late"]);
    assert.equal(application.body.hidden, 3);
    const run = await ask("zach", routes.notes.GET, { uid: "amara" }, { query: `?place=run&run=${RUN.agi}` });
    assert.deepEqual(ids(run), ["early-here", "late"]);
    assert.equal(run.body.hidden, 2);
    const profile = await ask("zach", routes.notes.GET, { uid: "amara" }, { query: "?place=profile" });
    assert.deepEqual(ids(profile), ["early-elsewhere", "early-here", "early-profile", "late"]);
    assert.deepEqual(
      profile.body.notes.filter((shown) => shown.beforeAgreement).map((shown) => shown.id).sort(),
      ["early-elsewhere", "early-here", "early-profile"],
    );
    // Dev never agreed: every note about Dev is "before", and none shows beside an application.
    const dev = await ask("zach", routes.notes.GET, { uid: "dev" }, { query: "?place=application" });
    assert.deepEqual(dev.body.notes, []);
    assert.equal(dev.body.hidden, 1);
  });

  test("an author whose account has gone leaves the note, which no longer names them", async () => {
    reset({ "memberNotes/old": { uid: "amara", text: "Old note", authorUid: "gone-admin", draftedByClaude: false, runId: null, programmeLabel: "", createdAt: AFTER, updatedAt: AFTER } });
    const read = await ask("zach", routes.notes.GET, { uid: "amara" });
    assert.equal(read.body.notes[0].authorName, null);
  });
});

// ---------------------------------------------------------------------------
// 2. Claude's draft of a note
// ---------------------------------------------------------------------------

describe("Claude drafts a note from counted coursework, with no name, and nothing is kept", () => {
  test("with no key the site says so and sends nothing", async () => {
    reset();
    globalThis.__cwClaudeKey = false;
    const answer = await ask("zach", routes.draft.POST, { uid: "amara" }, { body: { runId: RUN.agi } });
    assert.equal(answer.status, 409);
    assert.equal(answer.body.error, "Claude isn’t set up on this site yet.");
    assert.deepEqual(globalThis.__cwClaudeAsked, []);
  });

  test("nobody who has not agreed is sent, and the refusal says why", async () => {
    reset();
    const answer = await ask("zach", routes.draft.POST, { uid: "dev" }, { body: { runId: RUN.agi } });
    assert.equal(answer.status, 409);
    assert.match(answer.body.error, /haven’t agreed to version 13/);
    assert.deepEqual(globalThis.__cwClaudeAsked, []);
  });

  test("somebody whose writing all came before their agreement is not sent either", async () => {
    reset();
    w.world.db.poke(rowPath("amara", "k3-rp1"), { firstWrittenAt: BEFORE });
    const answer = await ask("zach", routes.draft.POST, { uid: "amara" }, { body: { runId: RUN.agi } });
    assert.equal(answer.status, 409);
    assert.match(answer.body.error, /nothing they wrote on it came after/);
    assert.deepEqual(globalThis.__cwClaudeAsked, []);
  });

  test("only counted rows go, with no name, address, account or private note, and the draft is returned, never stored", async () => {
    reset();
    globalThis.__cwClaudeAnswer = { ok: true, value: { note: "The fellow writes about the lamps with care." }, model: "claude-opus-5-5", usage: { inputTokens: 1, outputTokens: 1 } };
    const before = w.everything();
    const answer = await ask("zach", routes.draft.POST, { uid: "amara" }, { body: { runId: RUN.agi } });
    assert.equal(answer.status, 200);
    assert.deepEqual(Object.keys(answer.body).sort(), ["sent", "text"]);
    assert.equal(answer.body.text, "Amara Okafor writes about the lamps with care.");
    assert.equal(answer.body.sent, 1);
    assert.equal(w.everything(), before, "drafting stored something");
    const [asked] = globalThis.__cwClaudeAsked;
    assertClean(asked.message, "the note's message");
    assert.ok(asked.message.includes(SAID.amara["k3-rp1"]), "the counted reflection was not sent");
    assert.ok(!asked.message.includes(SAID.amara["k3-rp2"]), "a reflection written before the agreement was sent");
    assert.match(asked.system, /Never mark anybody down for their English/);
    assert.match(asked.system, /Never say or guess whether anything was written with AI/);
  });

  test("Save keeps the draft as the admin's, marked as drafted by Claude", async () => {
    reset();
    const saved = await ask("zach", routes.notes.POST, { uid: "amara" }, { body: { text: "Amara writes with care.", runId: RUN.agi, draftedByClaude: true } });
    assert.equal(saved.status, 200);
    assert.equal(w.world.db.read(`memberNotes/${saved.body.id}`).draftedByClaude, true);
    const read = await ask("zach", routes.notes.GET, { uid: "amara" });
    assert.equal(read.body.notes[0].draftedByClaude, true);
  });
});

// ---------------------------------------------------------------------------
// 3. Best answers
// ---------------------------------------------------------------------------

const BEST = {
  ok: true,
  value: {
    questions: [
      { question: "Q1", picks: [{ fellow: "Fellow 1", reason: "Fellow 1 ties the count to the reading." }, { fellow: "Fellow 9", reason: "Nobody." }] },
      { question: "Q7", picks: [{ fellow: "Fellow 2", reason: "Not a question that was asked." }] },
    ],
    hard: "Fellow 2 found the oil bill hard to argue.",
  },
  model: "claude-opus-5-5",
  usage: { inputTokens: 1, outputTokens: 1 },
};

describe("best answers: the lead and admins, labels to Claude and names back", () => {
  test("the lead and an admin read it; a reviewer, a facilitator and a fellow do not", async () => {
    reset();
    const lead = await ask("claudia", routes.best.GET, params, { query: "?week=w03" });
    assert.equal(lead.status, 200);
    assert.deepEqual(Object.keys(lead.body).sort(), ["claude", "notIncluded", "outOfDate", "result", "sendable", "week"]);
    assert.ok(!JSON.stringify(lead.body).toLowerCase().includes("pangram"), "the lead's view carries something of Pangram's");
    assert.equal((await ask("zach", routes.best.GET, params, { query: "?week=w03" })).status, 200);
    assert.equal((await ask("lloyd", routes.best.GET, params, { query: "?week=w03" })).status, 403);
    for (const who of ["rahul", "amara"]) assert.equal((await ask(who, routes.best.GET, params, { query: "?week=w03" })).status, 404);
  });

  test("counts what can be sent and what is not included yet, and sends nothing on a read", async () => {
    reset();
    const read = await ask("zach", routes.best.GET, params, { query: "?week=w03" });
    // Amara's first and Bea's: counted. Amara's second (before) and Dev's (no agreement): not yet.
    // Tariq facilitates, so neither of his is either.
    assert.equal(read.body.sendable, 2);
    assert.equal(read.body.notIncluded, 2);
    assert.equal(read.body.result, null);
    assert.deepEqual(globalThis.__cwClaudeAsked, []);
  });

  test("the lead's press sends labels, never names, and keeps accounts, never names", async () => {
    reset();
    globalThis.__cwClaudeAnswer = BEST;
    const answer = await ask("claudia", routes.best.POST, params, { body: { weekId: "w03" } });
    assert.equal(answer.status, 200);
    const [asked] = globalThis.__cwClaudeAsked;
    assertClean(asked.message, "the best answers message");
    assert.ok(asked.message.includes("### Fellow 1"));
    assert.ok(asked.message.includes(SAID.amara["k3-rp1"]));
    assert.ok(!asked.message.includes(SAID.amara["k3-rp2"]), "an answer written before the agreement was sent");
    assert.ok(!asked.message.includes("Seven, and"), "Dev's answer was sent though Dev never agreed");
    assert.ok(!asked.message.includes("keepers kept a log"), "a facilitator's own work was sent");
    assert.ok(asked.message.includes("argued about the lamps"), "Bea's answer was not sent");
    assert.ok(asked.message.includes("(an email address)"), "the typed address was not swapped");

    const stored = w.world.db.read(`courseBestAnswers/${RUN.agi}__w03`);
    for (const text of stringsIn(stored)) assert.doesNotMatch(text, /Amara|Okafor|Bea|Lindqvist/, "a name was stored");
    assert.deepEqual(stored.labels, { "Fellow 1": "amara", "Fellow 2": "bea" });
    assert.deepEqual(stored.uids.sort(), ["amara", "bea"]);
    assert.equal(stored.questions.length, 1, "only questions somebody answered are kept");
    assert.deepEqual(stored.questions[0].picks, [{ uid: "amara", reason: "Fellow 1 ties the count to the reading." }]);

    const shown = answer.body.result;
    assert.deepEqual(shown.questions[0].picks, [{ uid: "amara", name: "Amara Okafor", reason: "Amara Okafor ties the count to the reading." }]);
    assert.equal(shown.hard, "Bea Lindqvist found the oil bill hard to argue.");
    assert.equal(answer.body.outOfDate, false);
  });

  test("a changed answer marks it out of date; somebody no longer holding a place is dropped", async () => {
    reset();
    globalThis.__cwClaudeAnswer = BEST;
    await ask("zach", routes.best.POST, params, { body: { weekId: "w03" } });
    w.world.db.poke(rowPath("bea", "k3-rp1"), { text: "A different answer now." });
    assert.equal((await ask("zach", routes.best.GET, params, { query: "?week=w03" })).body.outOfDate, true);

    const application = w.world.db.paths().find((path) => path.startsWith("admissionApplications/") && w.world.db.read(path).uid === "amara");
    w.world.db.poke(application, { status: "withdrawn" });
    const read = await ask("zach", routes.best.GET, params, { query: "?week=w03" });
    assert.deepEqual(read.body.result.questions[0].picks, []);
    assert.ok(!JSON.stringify(read.body).includes("Amara"), "somebody who gave their place back is still named");
  });

  test("with no key, or nothing to send, nothing is sent", async () => {
    reset();
    globalThis.__cwClaudeKey = false;
    assert.equal((await ask("zach", routes.best.POST, params, { body: { weekId: "w03" } })).status, 409);
    globalThis.__cwClaudeKey = true;
    for (const path of [rowPath("amara", "k3-rp1"), rowPath("bea", "k3-rp1")]) w.world.db.poke(path, { firstWrittenAt: BEFORE });
    const nothing = await ask("zach", routes.best.POST, params, { body: { weekId: "w03" } });
    assert.equal(nothing.status, 409);
    assert.match(nothing.body.error, /Nobody’s answers to this week can be sent yet/);
    assert.deepEqual(globalThis.__cwClaudeAsked, []);
  });
});

// ---------------------------------------------------------------------------
// 4. Pangram
// ---------------------------------------------------------------------------

let pangramBodies = [];
function fakePangram() {
  process.env.PANGRAM_API_KEY = "test-key";
  pangramBodies = [];
  globalThis.fetch = async (url, init = {}) => {
    const address = String(url);
    if (!address.startsWith("https://text.external-api.pangram.com/")) throw new Error(`unexpected fetch to ${address}`);
    if (init.method === "POST") {
      pangramBodies.push(JSON.parse(init.body));
      return new Response(JSON.stringify({ task_id: `t${pangramBodies.length}` }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ stage: "STAGE_SUCCESS", prediction_short: "AI-Assisted", headline: "Moderately AI-assisted", fraction_ai: 0.1, fraction_ai_assisted: 0.6, fraction_human: 0.3 }),
      { status: 200 },
    );
  };
}

describe("Pangram on coursework: admins only, counted answers of 50 words or more", () => {
  test("the lead, a reviewer and everybody else are refused on the session, and never see a reading", async () => {
    reset();
    for (const who of ["claudia", "lloyd", "rahul", "tariq"]) {
      const read = await ask(who, routes.person.GET, { ...params, uid: "tariq" });
      assert.equal(read.status, 403, `${who} read a reading`);
      assert.ok(!("parts" in read.body));
      assert.equal((await ask(who, routes.person.POST, { ...params, uid: "tariq" }, { body: {} })).status, 403);
      assert.equal((await ask(who, routes.week.GET, params, { query: "?week=w03" })).status, 403);
    }
  });

  test("an admin reads what may be sent before anything is, and the week says how many it will send", async () => {
    reset();
    const read = await ask("zach", routes.person.GET, { ...params, uid: "tariq" });
    assert.equal(read.status, 200);
    assert.deepEqual(Object.keys(read.body).sort(), ["notCounted", "pangram", "parts", "tooShort"]);
    assert.equal(read.body.pangram, false, "no key here");
    assert.equal(read.body.parts.length, 1);
    assert.equal(read.body.parts[0].reading, null);
    assert.equal(read.body.tooShort, 1);
    const plan = await ask("zach", routes.week.GET, params, { query: "?week=w03" });
    assert.deepEqual(plan.body.people, [{ uid: "tariq", answers: 1 }]);
    assert.equal(plan.body.answers, 1);
    // Amara's only long-enough answer would be... none: her reflections are short.
    const amara = await ask("zach", routes.person.GET, { ...params, uid: "amara" });
    assert.equal(amara.body.parts.length, 0);
    assert.equal(amara.body.notCounted, 1, "her answer from before her agreement is counted as left out");
  });

  test("with no key nothing is sent", async () => {
    reset();
    const answer = await ask("zach", routes.person.POST, { ...params, uid: "tariq" }, { body: {} });
    assert.equal(answer.status, 409);
    assert.equal(answer.body.error, "Pangram isn’t set up on this site yet.");
  });

  test("one request with the long counted answer alone; kept with a hash; out of date once the words change", async () => {
    reset();
    fakePangram();
    const answer = await ask("zach", routes.person.POST, { ...params, uid: "tariq" }, { body: { weekId: "w03" } });
    assert.equal(answer.status, 200);
    assert.equal(pangramBodies.length, 1);
    assert.equal(pangramBodies[0].text, LONG);
    assert.equal(answer.body.parts[0].reading.worthALook, true);
    assert.equal(answer.body.parts[0].outOfDate, false);
    const stored = w.world.db.read(`coursePangramChecks/${RUN.agi}__tariq`);
    assert.equal(stored.uid, "tariq");
    assert.deepEqual(Object.keys(stored.parts), [`${RUN.agi}__tariq__w03__k3-rp3`]);
    w.world.db.poke(rowPath("tariq", "k3-rp3"), { text: `${LONG} And one more sentence.` });
    const read = await ask("zach", routes.person.GET, { ...params, uid: "tariq" });
    assert.equal(read.body.parts[0].outOfDate, true);
    // The lead still never sees it.
    assert.equal((await ask("claudia", routes.person.GET, { ...params, uid: "tariq" })).status, 403);
  });

  test("somebody not on the programme is answered as not here", async () => {
    reset();
    assert.equal((await ask("zach", routes.person.GET, { ...params, uid: "chloe-not-on-the-form" })).status, 404);
  });
});

// ---------------------------------------------------------------------------
// 5. The pure builders, on fixtures holding every kind of identifier
// ---------------------------------------------------------------------------

describe("what is built for Claude and Pangram, on its own", () => {
  const week = {
    weekId: "w02",
    weekNumber: 2,
    title: "Week of Ada Lovelace's notes",
    questions: [
      { key: "reflection:p1", kind: "reflection", rowId: "p1", weekId: "w02", weekNumber: 2, weekTitle: "", text: "What did Ada get right?", boxes: [] },
      { key: "written:a1", kind: "written", rowId: "a1", weekId: "w02", weekNumber: 2, weekTitle: "", text: "Write a plan.", boxes: [] },
    ],
  };
  const answer = (uid, questionKey, text, counted, levels = []) => ({ rowId: `${uid}-${questionKey}`, uid, questionKey, weekId: "w02", kind: questionKey.split(":")[0], text, counted, agreed: counted, levels });
  const answers = [
    answer("u-ada", "reflection:p1", "As Ada Lovelace I think Grace and will may both matter; email ada@example.com.", true),
    answer("u-grace", "reflection:p1", "Grace Hopper here, counted.", true),
    answer("u-grace", "written:a1", "My plan names Zoë Ångström.", true, [{ row: "Clarity", level: "Strong" }]),
    answer("u-old", "reflection:p1", "WRITTEN BEFORE AGREEING", false),
  ];
  const people = [
    { uid: "u-ada", name: "Ada Lovelace", label: "a fellow" },
    { uid: "u-grace", name: "Grace Hopper", label: "a fellow" },
    { uid: "u-zoe", name: "Zoë Ångström", label: "a facilitator" },
  ];

  test("a name typed in any case, accented, or as a capitalised part is swapped; a word that is a name is not", () => {
    const out = model.scrubNames("ada lovelace met Zoë and Ångström; I will grace the room.", [
      { name: "Ada Lovelace", label: "Fellow 1" },
      { name: "Zoë Ångström", label: "a facilitator" },
      { name: "Grace Hopper", label: "Fellow 2" },
    ]);
    assert.equal(out, "Fellow 1 met a facilitator and a facilitator; I will grace the room.");
  });

  test("best answers: labels in account order, only counted answers, no identifier", () => {
    const built = model.bestAnswersInput({ programme: "Ada's AGI Strategy", week, answers, writers: new Set(["u-ada", "u-grace", "u-old"]), people });
    assert.deepEqual(built.labels, { "Fellow 1": "u-ada", "Fellow 2": "u-grace" });
    assert.equal(built.sent, 3);
    assert.equal(built.leftOut, 1);
    assert.ok(!built.message.includes("WRITTEN BEFORE AGREEING"));
    for (const pattern of [/Ada|Lovelace|Grace Hopper|Hopper|Zoë|Ångström/, /u-ada|u-grace|u-old/, /@/]) assert.doesNotMatch(built.message, pattern);
    assert.ok(built.message.includes("Fellow 1"));
    // Levels are a note's, never best answers': nothing of feedback goes here.
    assert.doesNotMatch(built.message, /Clarity|Strong/);
  });

  test("a note: the person is the fellow, levels and never comments, only counted answers", () => {
    const built = model.noteDraftInput({
      programme: "AGI Strategy",
      weeks: [week],
      answers: answers.filter((a) => a.uid === "u-grace"),
      people: [{ name: "Grace Hopper", label: "the fellow" }, { name: "Zoë Ångström", label: "a facilitator" }],
    });
    assert.equal(built.sent, 2);
    assert.ok(built.message.includes("Clarity: Strong"));
    assert.doesNotMatch(built.message, /Grace|Hopper|Zoë|Ångström/);
    assert.equal(model.noteWithName("The fellow is sharp; the fellow should facilitate.", "Grace"), "Grace is sharp; Grace should facilitate.");
  });

  test("Pangram: counted written answers and reflections of 50 words or more, never a box", () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    const parts = model.pangramPartsOf(
      [
        answer("u1", "reflection:p1", long, true),
        answer("u1", "written:a1", long, false),
        { ...answer("u1", "fillIn:b1", long, true), kind: "fillIn" },
        answer("u1", "written:a1", "Too short to check.", true),
      ],
      50,
      null,
    );
    assert.deepEqual(parts.parts.map((part) => part.kind), ["reflection"]);
    assert.equal(parts.notCounted, 1);
    assert.equal(parts.tooShort, 1);
  });

  test("which notes a place shows: the one rule", () => {
    const from = AGREED;
    const note = (id, createdAt, runId) => ({ id, uid: "u", text: id, authorUid: "a", draftedByClaude: false, runId, programmeLabel: "", createdAt, updatedAt: createdAt, editedByUid: "" });
    const notes = [note("early", BEFORE, "r1"), note("late", AFTER, "r2"), note("at", AGREED, "r2")];
    assert.deepEqual(notesModel.notesShownIn({ kind: "application" }, notes, from).shown.map((n) => n.id), ["late"]);
    assert.deepEqual(notesModel.notesShownIn({ kind: "run", runId: "r1" }, notes, from).shown.map((n) => n.id), ["late", "early"]);
    assert.equal(notesModel.notesShownIn({ kind: "profile" }, notes, from).shown.length, 3);
    assert.deepEqual(notesModel.notesShownIn({ kind: "application" }, notes, null).shown, []);
  });
});

// ---------------------------------------------------------------------------
// 6. Deletion
// ---------------------------------------------------------------------------

describe("an account's deletion takes its notes, its readings and its picks", () => {
  const { loadTs } = createLoader({
    stubs: new Map([
      ["server-only", "export {};"],
      ["firebase-admin/firestore", CASCADE_FIRESTORE_STUB],
      ["next/server", "export class NextResponse { static json(body, init) { return { body, status: (init && init.status) || 200 }; } }"],
      ["@/lib/firebase/admin", "export function getAdminDb() { throw new Error('not used here'); }\nexport function getAdminStorage() { return null; }"],
      ["@/lib/firebase/session", "export async function getCurrentUser() { return null; }"],
      ["@/lib/firebase/impersonation", "export async function assertNotImpersonating() { return null; }"],
    ]),
  });
  const auth = { async deleteUser() {}, async revokeRefreshTokens() {} };

  test("the person's notes and readings go, a note they wrote stays, and they leave every week's picks", async () => {
    const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
    const db = makeCascadeDb({
      "users/amara": { uid: "amara", role: "member" },
      "memberNotes/about-amara": { uid: "amara", authorUid: "zach", text: "About Amara" },
      "memberNotes/by-amara": { uid: "bea", authorUid: "amara", text: "About Bea, by Amara" },
      [`coursePangramChecks/${RUN.agi}__amara`]: { runId: RUN.agi, uid: "amara", parts: {} },
      [`coursePangramChecks/${RUN.agi}__bea`]: { runId: RUN.agi, uid: "bea", parts: {} },
      [`courseBestAnswers/${RUN.agi}__w03`]: {
        runId: RUN.agi,
        weekId: "w03",
        questions: [{ key: "reflection:k3-rp1", kind: "reflection", text: "Q", picks: [{ uid: "amara", reason: "Fellow 1." }, { uid: "bea", reason: "Fellow 2." }] }],
        labels: { "Fellow 1": "amara", "Fellow 2": "bea" },
        uids: ["amara", "bea"],
        hard: "",
      },
    });
    const summary = await deleteAccountCascade(auth, db, "amara");
    assert.equal(summary.memberNotesDeleted, 1);
    assert.equal(summary.coursePangramChecksDeleted, 1);
    assert.equal(summary.courseBestAnswersCleared, 1);
    assert.equal(db.has("memberNotes/about-amara"), false);
    assert.equal(db.has("memberNotes/by-amara"), true, "a note the account wrote about somebody else went with it");
    assert.equal(db.has(`coursePangramChecks/${RUN.agi}__amara`), false);
    assert.equal(db.has(`coursePangramChecks/${RUN.agi}__bea`), true);
    const best = db.read(`courseBestAnswers/${RUN.agi}__w03`);
    assert.deepEqual(best.questions[0].picks, [{ uid: "bea", reason: "Fellow 2." }]);
    assert.deepEqual(best.labels, { "Fellow 2": "bea" });
    assert.deepEqual(best.uids, ["bea"]);
    assert.ok(!JSON.stringify(best).includes("amara"));
  });
});
