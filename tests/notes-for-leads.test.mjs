/**
 * NOTES THE PROGRAMME'S LEADS READ AND WRITE (privacy v15, "Notes about
 * you"), driven through the real routes on AGI Strategy's run in its third
 * week, beside `tests/coursework-claude.test.mjs`, which holds the admins'
 * routes and Claude's draft.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is `tests/lib/facilitatorPagesWorld.mjs`: its form gives a place
 * on AGI Strategy to Amara, Bea, Dev and Tariq, and one on Technical AI
 * Safety to Wen; Zach is an admin, Claudia leads AGI Strategy, Tess leads
 * Technical AI Safety, Lloyd reviews AGI Strategy, Yusuf is the run's track
 * lead, Rahul and Sofia facilitate Group B, and Nadia is committee named on
 * nothing. On top of it:
 *
 *  - AGREEMENTS: Bea, Rahul and Wen agreed to privacy v15 on Mon 2 Nov
 *    (`AGREED`); Dev is still on v14.
 *  - NOTES about Bea, each with when it was written: one kept for leads
 *    after Bea agreed, one kept for leads before, one kept to admins, one
 *    written before version 15 existed (no `audience`), and one Claude
 *    drafted, kept for leads. One kept for leads about Rahul.
 *
 * What is held, by section:
 *  0. The version 15 moment (`reviewUseFrom`), and the tripwire on the Terms
 *     of Use.
 *  1. The one rule (`notesShownIn`'s lead place), on fixtures.
 *  2. Who reads, as every persona: the lead reads the notes kept for leads
 *     about the people on their programme and its facilitators, and nothing
 *     else; never how many notes they do not see; another programme's lead,
 *     a reviewer, a track lead, a facilitator and a member refused.
 *  3. What the lead writes: always for admins and leads, never Claude's,
 *     only about somebody who agreed to v15; only their own changed or
 *     deleted; view-as writes nothing.
 *  4. What admins choose: who reads each note, changed later, never for
 *     leads about somebody before their v15 moment; suggestions.
 *
 * Every name and word is made up.
 */
import { after, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { makeFacilitatorPagesWorld } from "./lib/facilitatorPagesWorld.mjs";
import { AGI, NOW, ROUND, RUN, facilitatorWeekSeed } from "./lib/facilitatorWeekWorld.mjs";
import { TAIS } from "./lib/applicationsSmallTerm.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
after(() => mock.timers.reset());

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export function claudeConfigured() { return true; }
export async function askClaudeForJson() { throw new Error("Claude is never asked here."); }`;

const w = await makeFacilitatorPagesWorld("__nl", [["@/lib/ai/claude", CLAUDE_STUB]]);
const route = (...parts) => w.loadTs(join("app", "api", ...parts, "route.ts"));
const PEOPLE = ["admissions", "forms", "[roundId]", "programmes", "[programmeId]", "people", "[uid]", "notes"];
const routes = {
  adminNotes: await route("admin", "members", "[uid]", "notes"),
  adminNote: await route("admin", "members", "[uid]", "notes", "[noteId]"),
  notes: await route(...PEOPLE),
  note: await route(...PEOPLE, "[noteId]"),
};
const model = await w.loadTs(join("lib", "memberNotes", "model.ts"));

const { loadTs: loadPure } = createLoader({ stubs: [["server-only", "export {};"]] });
const reviewUse = await loadPure("lib/legal/reviewUse.ts");
const { currentPolicy } = await loadPure("lib/legal/policies.ts");

/** When Bea, Rahul and Wen agreed to privacy v15. */
const AGREED = new Date("2026-11-02T09:00:00Z");
const BEFORE = new Date("2026-10-25T09:00:00Z");
const AFTER = new Date("2026-11-10T09:00:00Z");

const NOTE_TEXT = {
  leadsAfter: "Leads discussion well; quiet in the first half hour.",
  leadsBefore: "Kept for leads, but written before the agreement.",
  adminsAfter: "Asked to move to a Thursday group if a seat opens.",
  legacy: "Written before version 15 existed, so nobody chose.",
  claude: "Takes a clear position and limits the claim.",
  aboutRahul: "Runs a calm room; might lead a programme one day.",
};

const note = (uid, text, createdAt, over = {}) => ({
  uid,
  text,
  authorUid: "zach",
  draftedByClaude: false,
  runId: RUN.agi,
  programmeLabel: "AGI Strategy, Autumn 2026",
  createdAt,
  updatedAt: createdAt,
  ...over,
});

/** The world, with the agreements and the notes above. */
function seed() {
  const s = facilitatorWeekSeed();
  for (const uid of ["bea", "rahul", "wen"]) {
    s[`users/${uid}`] = { ...s[`users/${uid}`], policyVersion: "terms.1+privacy.15", policyAgreedAt: AGREED, courseworkUseAgreedAt: BEFORE };
  }
  s["users/dev"] = { ...s["users/dev"], policyVersion: "terms.1+privacy.14", policyAgreedAt: BEFORE, courseworkUseAgreedAt: BEFORE };
  s["memberNotes/leads-after"] = note("bea", NOTE_TEXT.leadsAfter, AFTER, { audience: "leads", suggest: ["committee", "facilitating"] });
  s["memberNotes/leads-before"] = note("bea", NOTE_TEXT.leadsBefore, BEFORE, { audience: "leads" });
  s["memberNotes/admins-after"] = note("bea", NOTE_TEXT.adminsAfter, AFTER, { audience: "admins" });
  s["memberNotes/legacy"] = note("bea", NOTE_TEXT.legacy, AFTER);
  s["memberNotes/drafted"] = note("bea", NOTE_TEXT.claude, AFTER, { audience: "leads", draftedByClaude: true });
  s["memberNotes/about-rahul"] = note("rahul", NOTE_TEXT.aboutRahul, AFTER, { audience: "leads", authorUid: "claudia" });
  return s;
}

function reset(extra = {}) {
  w.reset({ ...seed(), ...extra });
}

/** One request to a real handler as `who`. */
async function ask(who, handler, params, { body, viewAs = false } = {}) {
  w.world.user = who === null ? null : w.sessionOf(who);
  w.world.viewAs = viewAs;
  const init = { method: handler.name, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const response = await handler(new Request("https://naisi.invalid/api", init), { params: Promise.resolve(params) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    w.world.viewAs = false;
  }
}

const on = (uid, programmeId = AGI) => ({ roundId: ROUND, programmeId, uid });
const ids = (answer) => answer.body.notes.map((shown) => shown.id).sort();

/** Every string anywhere in a value. */
function stringsIn(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const item of value) stringsIn(item, out);
  else if (value && typeof value === "object") for (const item of Object.values(value)) stringsIn(item, out);
  return out;
}

/** Every key anywhere in a value. */
function keysIn(value, out = []) {
  if (Array.isArray(value)) for (const item of value) keysIn(item, out);
  else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      keysIn(item, out);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 0. The version 15 moment
// ---------------------------------------------------------------------------

describe("the moment version 15's new uses begin for a person", () => {
  const stamp = (iso) => ({ toDate: () => new Date(iso) });

  test("an agreement to privacy v15 counts from its own time, as a Timestamp or a Date", () => {
    assert.equal(reviewUse.REVIEW_USE_FROM_VERSION, 15);
    const from = reviewUse.reviewUseFrom({ policyVersion: "terms.1+privacy.15", policyAgreedAt: stamp("2026-11-02T09:00:00Z") });
    assert.equal(from?.toISOString(), "2026-11-02T09:00:00.000Z");
    assert.equal(reviewUse.reviewUseFrom({ policyVersion: "privacy.15+terms.1", policyAgreedAt: AGREED })?.getTime(), AGREED.getTime());
  });

  test("nobody has one without a readable agreement to v15 or later, and no later than the site serves", () => {
    const served = currentPolicy("privacy").version;
    for (const user of [
      null,
      undefined,
      {},
      { policyVersion: "terms.1+privacy.14", policyAgreedAt: AGREED },
      { policyVersion: "terms.1+privacy.13", policyAgreedAt: AGREED },
      { policyVersion: `terms.1+privacy.${served + 1}`, policyAgreedAt: AGREED },
      { policyVersion: `terms.${currentPolicy("terms").version + 1}+privacy.15`, policyAgreedAt: AGREED },
      { policyVersion: "privacy.15", policyAgreedAt: AGREED },
      { policyVersion: "terms.1+privacy.15+privacy.15", policyAgreedAt: AGREED },
      { policyVersion: "terms.1+privacy.15", policyAgreedAt: null },
      { policyVersion: "terms.1+privacy.15", policyAgreedAt: "2026-11-02" },
    ]) {
      assert.equal(reviewUse.reviewUseFrom(user), null, JSON.stringify(user));
    }
  });

  test("something written at a time came after the moment only when strictly after it", () => {
    assert.equal(reviewUse.writtenAfterReviewUse(AFTER, AGREED), true);
    assert.equal(reviewUse.writtenAfterReviewUse(AGREED, AGREED), false);
    assert.equal(reviewUse.writtenAfterReviewUse(BEFORE, AGREED), false);
    assert.equal(reviewUse.writtenAfterReviewUse(AFTER, null), false);
    assert.equal(reviewUse.writtenAfterReviewUse(null, AGREED), false);
  });

  test("TRIPWIRE: the moment is the agreement's own time only while the Terms of Use stay at version 1", () => {
    assert.equal(
      currentPolicy("terms").version,
      1,
      "The Terms of Use moved past version 1. Accepting them moves policyAgreedAt forward, and reviewUseFrom " +
        "(src/lib/legal/reviewUse.ts) reads that as a LATER privacy v15 moment, which takes from the programme's " +
        "leads notes they could read before. Before this change, keep the v15 moment once on the account, as " +
        "courseworkUseAgreedAt is kept (src/lib/legal/courseworkUseStamp.ts), and read it in reviewUseFrom.",
    );
  });
});

// ---------------------------------------------------------------------------
// 1. The one rule
// ---------------------------------------------------------------------------

describe("which notes a programme's lead is shown: the one rule", () => {
  const doc = (id, createdAt, over = {}) =>
    model.normalizeMemberNote(id, { uid: "u", text: id, authorUid: "a", runId: "r1", createdAt, updatedAt: createdAt, ...over });
  const lead = { kind: "lead", runId: "r1" };

  test("only a note kept for leads, written after the person agreed to v15", () => {
    const notes = [
      doc("leads-after", AFTER, { audience: "leads" }),
      doc("leads-at", AGREED, { audience: "leads" }),
      doc("leads-before", BEFORE, { audience: "leads" }),
      doc("admins-after", AFTER, { audience: "admins" }),
      doc("nobody-chose", AFTER),
      doc("misspelt", AFTER, { audience: "Leads" }),
    ];
    const { shown, hidden } = model.notesShownIn(lead, notes, BEFORE, AGREED);
    assert.deepEqual(shown.map((n) => n.id), ["leads-after"]);
    assert.equal(hidden, 5);
    // Somebody who has not agreed to v15 has nothing shown to a lead at all.
    assert.deepEqual(model.notesShownIn(lead, notes, BEFORE, null).shown, []);
    assert.equal(model.keptForLeads(notes[0], AGREED), true);
    assert.equal(model.keptForLeads(notes[3], AGREED), false);
    assert.equal(model.keptForLeads(notes[0], null), false);
  });

  test("and the place rule still applies: written after the v13 moment, or from this programme's run", () => {
    // A person whose v13 moment came after their v15 one (a registration's stamp landing late).
    const v13 = new Date("2026-11-05T09:00:00Z");
    const between = new Date("2026-11-03T09:00:00Z");
    const notes = [
      doc("here", between, { audience: "leads", runId: "r1" }),
      doc("elsewhere", between, { audience: "leads", runId: "r2" }),
      doc("profile", between, { audience: "leads", runId: "" }),
    ];
    assert.deepEqual(model.notesShownIn(lead, notes, v13, AGREED).shown.map((n) => n.id), ["here"]);
  });

  test("a stored note reads its audience and suggestions strictly, and every older note is admins only", () => {
    assert.equal(model.normalizeMemberNote("x", {}).audience, "admins");
    assert.equal(model.normalizeMemberNote("x", { audience: "everybody" }).audience, "admins");
    assert.equal(model.normalizeMemberNote("x", { audience: "leads" }).audience, "leads");
    assert.deepEqual(model.normalizeMemberNote("x", { suggest: ["committee", "nonsense", "facilitating", "committee"] }).suggest, ["facilitating", "committee"]);
    assert.deepEqual(model.normalizeMemberNote("x", { suggest: "committee" }).suggest, []);
    const plain = model.normalizeMemberNote("x", {});
    assert.equal(plain.kind, "note");
    assert.equal(plain.weekId, null);
    assert.equal(plain.weekNumber, null);
  });
});

// ---------------------------------------------------------------------------
// 2. Who reads
// ---------------------------------------------------------------------------

describe("the programme's lead reads the notes kept for leads about the people on their programme, and nothing else", () => {
  test("about somebody holding a place: only the notes kept for leads from after the agreement, Claude's marked", async () => {
    reset();
    const read = await ask("claudia", routes.notes.GET, on("bea"));
    assert.equal(read.status, 200);
    assert.deepEqual(Object.keys(read.body).sort(), ["forLeads", "notes"]);
    assert.equal(read.body.forLeads, true);
    assert.deepEqual(ids(read), ["drafted", "leads-after"]);
    for (const shown of read.body.notes) {
      assert.deepEqual(Object.keys(shown).sort(), [
        "audience", "authorName", "createdAt", "draftedByClaude", "edited", "id", "mine", "programme", "suggest", "text", "updatedAt",
      ]);
      assert.equal(shown.audience, "leads");
      assert.equal(shown.mine, false);
      assert.equal(shown.authorName, "Zach");
    }
    const byId = Object.fromEntries(read.body.notes.map((shown) => [shown.id, shown]));
    assert.equal(byId.drafted.draftedByClaude, true, "a note Claude drafted no longer says so to the lead");
    assert.deepEqual(byId["leads-after"].suggest, ["facilitating", "committee"]);
    assert.equal(byId["leads-after"].programme, "AGI Strategy, Autumn 2026");
    // Nothing of the notes kept from the lead, and no count of them, anywhere in the answer.
    const said = stringsIn(read.body).join("\n");
    for (const kept of [NOTE_TEXT.leadsBefore, NOTE_TEXT.adminsAfter, NOTE_TEXT.legacy]) assert.ok(!said.includes(kept), `the lead was sent "${kept}"`);
    for (const key of keysIn(read.body)) {
      assert.ok(!["hidden", "agreed", "runs", "claude", "beforeAgreement", "leadsMayRead"].includes(key), `the lead was sent ${key}`);
    }
  });

  test("the lead's answer is the same whether or not admins keep notes the lead is not shown", async () => {
    reset();
    const withThem = await ask("claudia", routes.notes.GET, on("bea"));
    const without = seed();
    for (const id of ["leads-before", "admins-after", "legacy"]) delete without[`memberNotes/${id}`];
    w.reset(without);
    const withoutThem = await ask("claudia", routes.notes.GET, on("bea"));
    assert.deepEqual(withoutThem.body, withThem.body);
  });

  test("about one of the run's facilitators too", async () => {
    reset();
    const read = await ask("claudia", routes.notes.GET, on("rahul"));
    assert.equal(read.status, 200);
    assert.deepEqual(ids(read), ["about-rahul"]);
    assert.equal(read.body.notes[0].mine, true, "the lead wrote it");
  });

  test("never about the lead themselves, and nobody else on the programme's form is the lead's to read", async () => {
    reset({ "memberNotes/about-claudia": note("claudia", "About the lead.", AFTER, { audience: "leads" }) });
    const own = await ask("claudia", routes.notes.GET, on("claudia"));
    assert.equal(own.status, 403);
    assert.match(own.body.error, /never shown to you/);
    // Wen holds a place on Technical AI Safety, not on AGI Strategy.
    const elsewhere = await ask("claudia", routes.notes.GET, on("wen"));
    assert.equal(elsewhere.status, 404);
    assert.match(elsewhere.body.error, /don’t hold a place on this programme/);
    // Nadia is on nothing.
    assert.equal((await ask("claudia", routes.notes.GET, on("nadia"))).status, 404);
  });

  test("everybody else is refused before anything about the person is read", async () => {
    reset();
    const cases = [
      ["tess", 404, "the lead of another programme"],
      ["lloyd", 403, "the programme's reviewer"],
      ["yusuf", 404, "the run's track lead, with no role on the form"],
      ["rahul", 404, "a facilitator"],
      ["amara", 404, "somebody holding a place"],
      ["nadia", 404, "committee named on nothing"],
    ];
    for (const [who, status, what] of cases) {
      const read = await ask(who, routes.notes.GET, on("bea"));
      assert.equal(read.status, status, `${what} read the notes about Bea`);
      assert.ok(!stringsIn(read.body).join("\n").includes(NOTE_TEXT.leadsAfter), `${what} was sent a note`);
    }
    assert.equal((await ask(null, routes.notes.GET, on("bea"))).status, 401);
    // A lead reads their OWN programme's people: Tess reads Wen's.
    const theirs = await ask("tess", routes.notes.GET, on("wen", TAIS));
    assert.equal(theirs.status, 200);
    assert.deepEqual(theirs.body.notes, []);
  });

  test("an admin is answered as the programme's page in the admin area is, every note it shows saying who reads it", async () => {
    reset();
    const read = await ask("zach", routes.notes.GET, on("bea"));
    assert.equal(read.status, 200);
    assert.deepEqual(Object.keys(read.body).sort(), ["agreed", "claude", "forLeads", "hidden", "notes", "runs"]);
    const byId = Object.fromEntries(read.body.notes.map((shown) => [shown.id, shown]));
    assert.equal(byId["leads-after"].audience, "leads");
    assert.equal(byId["admins-after"].audience, "admins");
    assert.equal(byId.legacy.audience, "admins", "a note nobody chose for is admins only");
    assert.equal(byId["leads-before"].audience, "admins", "a note written before Bea agreed to v15 is read by admins only");
    assert.equal(byId["leads-before"].leadsMayRead, false);
    assert.equal(byId["admins-after"].leadsMayRead, true);
  });
});

// ---------------------------------------------------------------------------
// 3. What the lead writes
// ---------------------------------------------------------------------------

describe("the lead adds notes of their own, always kept for admins and leads, and changes only those", () => {
  test("a note the lead adds is from the programme's run, kept for leads, and read back as theirs", async () => {
    reset();
    const added = await ask("claudia", routes.notes.POST, on("bea"), { body: { text: "  Sharp in week 3.  ", suggest: ["committee", "facilitating"] } });
    assert.equal(added.status, 200);
    assert.deepEqual(Object.keys(added.body), ["id"]);
    const stored = w.world.db.read(`memberNotes/${added.body.id}`);
    assert.equal(stored.uid, "bea");
    assert.equal(stored.authorUid, "claudia");
    assert.equal(stored.text, "Sharp in week 3.");
    assert.equal(stored.audience, "leads");
    assert.deepEqual(stored.suggest, ["facilitating", "committee"]);
    assert.equal(stored.draftedByClaude, false);
    assert.equal(stored.runId, RUN.agi);
    assert.ok(stored.programmeLabel.length > 0);
    const read = await ask("claudia", routes.notes.GET, on("bea"));
    const mine = read.body.notes.find((shown) => shown.id === added.body.id);
    assert.equal(mine.mine, true);
    // Saying "leads" outright is the same.
    assert.equal((await ask("claudia", routes.notes.POST, on("bea"), { body: { text: "Again.", audience: "leads" } })).status, 200);
  });

  test("never kept to admins, never Claude's, never anything but a note's own fields", async () => {
    reset();
    const before = w.everything();
    const refused = [
      [{ text: "Private.", audience: "admins" }, 403, /only an admin keeps a note to admins/],
      [{ text: "Drafted.", draftedByClaude: true }, 403, /Only an admin keeps a note Claude drafted/],
      [{ text: "Odd.", audience: "everybody" }, 400, /Choose who reads the note/],
      [{ text: "Odd.", suggest: ["president"] }, 400, /facilitating, an incubator or the committee/],
      [{ text: "Odd.", suggest: ["committee", "committee"] }, 400, /facilitating, an incubator or the committee/],
      [{ text: "   " }, 400, /Write the note first/],
      [{ text: "x".repeat(4001) }, 400, /up to 4000 characters/],
    ];
    for (const [body, status, words] of refused) {
      const answer = await ask("claudia", routes.notes.POST, on("bea"), { body });
      assert.equal(answer.status, status, JSON.stringify(body));
      assert.match(answer.body.error, words);
    }
    assert.equal(w.everything(), before, "a refused note was kept");
  });

  test("only about somebody who has agreed to v15: until then only admins keep notes about them", async () => {
    reset();
    const read = await ask("claudia", routes.notes.GET, on("dev"));
    assert.equal(read.status, 200);
    assert.deepEqual(read.body, { notes: [], forLeads: false });
    const before = w.everything();
    const refused = await ask("claudia", routes.notes.POST, on("dev"), { body: { text: "Quiet." } });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /haven’t agreed to version 15/);
    assert.equal(w.everything(), before);
  });

  test("the lead changes and deletes their own, and is refused anybody else's", async () => {
    reset({ "memberNotes/claudias": note("bea", "Claudia's own.", AFTER, { audience: "leads", authorUid: "claudia" }) });
    const changed = await ask("claudia", routes.note.PATCH, { ...on("bea"), noteId: "claudias" }, { body: { text: "Claudia's own, changed.", suggest: ["incubator"] } });
    assert.equal(changed.status, 200);
    const stored = w.world.db.read("memberNotes/claudias");
    assert.equal(stored.text, "Claudia's own, changed.");
    assert.deepEqual(stored.suggest, ["incubator"]);
    assert.equal(stored.audience, "leads");
    assert.equal(stored.editedByUid, undefined, "the author changing their own words is not an edit by somebody else");
    // Keeping it to admins is an admin's to do.
    assert.equal((await ask("claudia", routes.note.PATCH, { ...on("bea"), noteId: "claudias" }, { body: { text: "x", audience: "admins" } })).status, 403);

    const before = w.everything();
    const anothers = await ask("claudia", routes.note.PATCH, { ...on("bea"), noteId: "leads-after" }, { body: { text: "Mine now." } });
    assert.equal(anothers.status, 403);
    assert.match(anothers.body.error, /only the notes you added/);
    assert.equal((await ask("claudia", routes.note.DELETE, { ...on("bea"), noteId: "leads-after" })).status, 403);
    // A note the lead may not read is answered as a note that is not here.
    for (const noteId of ["admins-after", "legacy", "leads-before", "about-rahul", "no-such-note"]) {
      assert.equal((await ask("claudia", routes.note.PATCH, { ...on("bea"), noteId }, { body: { text: "x" } })).status, 404, noteId);
      assert.equal((await ask("claudia", routes.note.DELETE, { ...on("bea"), noteId })).status, 404, noteId);
    }
    assert.equal(w.everything(), before, "a refused change was written");

    assert.equal((await ask("claudia", routes.note.DELETE, { ...on("bea"), noteId: "claudias" })).status, 200);
    assert.equal(w.world.db.read("memberNotes/claudias"), undefined);
  });

  test("a lead's own note an admin keeps to admins is no longer the lead's to read or change", async () => {
    reset({ "memberNotes/claudias": note("bea", "Claudia's own.", AFTER, { audience: "leads", authorUid: "claudia" }) });
    assert.equal((await ask("zach", routes.adminNote.PATCH, { uid: "bea", noteId: "claudias" }, { body: { text: "Claudia's own.", audience: "admins" } })).status, 200);
    assert.ok(!ids(await ask("claudia", routes.notes.GET, on("bea"))).includes("claudias"));
    assert.equal((await ask("claudia", routes.note.DELETE, { ...on("bea"), noteId: "claudias" })).status, 404);
    assert.ok(w.world.db.read("memberNotes/claudias"));
  });

  test("everybody but the lead and admins is refused every write, and a view-as session writes nothing", async () => {
    reset();
    const before = w.everything();
    for (const who of ["tess", "lloyd", "yusuf", "rahul", "amara", "nadia"]) {
      assert.notEqual((await ask(who, routes.notes.POST, on("bea"), { body: { text: "x" } })).status, 200, who);
      assert.notEqual((await ask(who, routes.note.PATCH, { ...on("bea"), noteId: "leads-after" }, { body: { text: "x" } })).status, 200, who);
      assert.notEqual((await ask(who, routes.note.DELETE, { ...on("bea"), noteId: "leads-after" })).status, 200, who);
    }
    assert.equal((await ask("claudia", routes.notes.POST, on("claudia"), { body: { text: "About me." } })).status, 403);
    for (const who of ["claudia", "zach"]) {
      assert.equal((await ask(who, routes.notes.POST, on("bea"), { body: { text: "x", audience: "leads" }, viewAs: true })).status, 403);
      assert.equal((await ask(who, routes.note.PATCH, { ...on("bea"), noteId: "leads-after" }, { body: { text: "x" }, viewAs: true })).status, 403);
      assert.equal((await ask(who, routes.note.DELETE, { ...on("bea"), noteId: "leads-after" }, { viewAs: true })).status, 403);
    }
    assert.equal(w.everything(), before);
  });

  test("a deleted lead's notes stay, and no longer name their writer", async () => {
    reset({ "memberNotes/gone": note("bea", "From a lead who left.", AFTER, { audience: "leads", authorUid: "gone-lead" }) });
    const read = await ask("claudia", routes.notes.GET, on("bea"));
    const gone = read.body.notes.find((shown) => shown.id === "gone");
    assert.equal(gone.authorName, null);
    assert.equal(gone.mine, false);
  });
});

// ---------------------------------------------------------------------------
// 4. What admins choose
// ---------------------------------------------------------------------------

describe("admins choose who reads each note, can change it later, and tick what it suggests", () => {
  test("every new note names who reads it, and only a person ticks a suggestion", async () => {
    reset();
    const unchosen = await ask("zach", routes.adminNotes.POST, { uid: "bea" }, { body: { text: "Nobody chose." } });
    assert.equal(unchosen.status, 400);
    assert.match(unchosen.body.error, /Choose who reads the note/);
    const kept = await ask("zach", routes.adminNotes.POST, { uid: "bea" }, { body: { text: "For the leads.", audience: "leads", suggest: ["incubator"] } });
    assert.equal(kept.status, 200);
    const stored = w.world.db.read(`memberNotes/${kept.body.id}`);
    assert.equal(stored.audience, "leads");
    assert.deepEqual(stored.suggest, ["incubator"]);
    assert.ok(ids(await ask("claudia", routes.notes.GET, on("bea"))).includes(kept.body.id));
    const plain = await ask("zach", routes.adminNotes.POST, { uid: "bea" }, { body: { text: "To ourselves.", audience: "admins" } });
    assert.deepEqual(w.world.db.read(`memberNotes/${plain.body.id}`).suggest, []);
    assert.ok(!ids(await ask("claudia", routes.notes.GET, on("bea"))).includes(plain.body.id));
    // The same through the programme's door.
    assert.equal((await ask("zach", routes.notes.POST, on("bea"), { body: { text: "Nobody chose." } })).status, 400);
    assert.equal((await ask("zach", routes.notes.POST, on("bea"), { body: { text: "Admins'.", audience: "admins" } })).status, 200);
  });

  test("never for leads about somebody who has not agreed to v15, nor for a note written before they did", async () => {
    reset();
    const before = w.everything();
    const about = await ask("zach", routes.adminNotes.POST, { uid: "dev" }, { body: { text: "For the leads.", audience: "leads" } });
    assert.equal(about.status, 409);
    assert.match(about.body.error, /haven’t agreed to version 15/);
    const earlier = await ask("zach", routes.adminNote.PATCH, { uid: "bea", noteId: "leads-before" }, { body: { text: NOTE_TEXT.leadsBefore, audience: "leads" } });
    assert.equal(earlier.status, 409);
    assert.match(earlier.body.error, /written before they agreed to version 15/);
    assert.equal(w.everything(), before);
    // Admins only, about Dev, is kept.
    assert.equal((await ask("zach", routes.adminNotes.POST, { uid: "dev" }, { body: { text: "To ourselves.", audience: "admins" } })).status, 200);
    const read = await ask("zach", routes.adminNotes.GET, { uid: "dev" });
    assert.equal(read.body.forLeads, false);
  });

  test("an admin changes who reads a note, and the lead's view follows", async () => {
    reset();
    assert.equal((await ask("zach", routes.adminNote.PATCH, { uid: "bea", noteId: "admins-after" }, { body: { text: NOTE_TEXT.adminsAfter, audience: "leads" } })).status, 200);
    assert.ok(ids(await ask("claudia", routes.notes.GET, on("bea"))).includes("admins-after"));
    assert.equal(w.world.db.read("memberNotes/admins-after").editedByUid, undefined, "choosing who reads it is not a change of words");
    assert.equal((await ask("zach", routes.adminNote.PATCH, { uid: "bea", noteId: "leads-after" }, { body: { text: NOTE_TEXT.leadsAfter, audience: "admins", suggest: [] } })).status, 200);
    assert.ok(!ids(await ask("claudia", routes.notes.GET, on("bea"))).includes("leads-after"));
    assert.deepEqual(w.world.db.read("memberNotes/leads-after").suggest, []);
    // An admin changing a lead's words is kept as the one who changed them.
    assert.equal((await ask("zach", routes.adminNote.PATCH, { uid: "rahul", noteId: "about-rahul" }, { body: { text: "Runs a calm room." } })).status, 200);
    assert.equal(w.world.db.read("memberNotes/about-rahul").editedByUid, "zach");
  });

  test("the admins' list says who reads each note, whether it may be kept for leads, and what it suggests", async () => {
    reset();
    const read = await ask("zach", routes.adminNotes.GET, { uid: "bea" });
    assert.equal(read.status, 200);
    assert.deepEqual(Object.keys(read.body).sort(), ["agreed", "claude", "forLeads", "hidden", "notes", "runs"]);
    assert.equal(read.body.forLeads, true);
    const byId = Object.fromEntries(read.body.notes.map((shown) => [shown.id, shown]));
    assert.deepEqual(Object.keys(byId["leads-after"]).sort(), [
      "audience", "authorName", "beforeAgreement", "createdAt", "draftedByClaude", "edited", "id", "leadsMayRead", "mine", "programme", "suggest", "text", "updatedAt",
    ]);
    assert.equal(byId["leads-after"].audience, "leads");
    assert.deepEqual(byId["leads-after"].suggest, ["facilitating", "committee"]);
    assert.equal(byId["leads-before"].audience, "admins");
    assert.equal(byId["leads-before"].leadsMayRead, false);
    assert.equal(byId.legacy.audience, "admins");
  });

  test("the lead never reaches the admins' routes", async () => {
    reset();
    assert.equal((await ask("claudia", routes.adminNotes.GET, { uid: "bea" })).status, 403);
    assert.equal((await ask("claudia", routes.adminNotes.POST, { uid: "bea" }, { body: { text: "x", audience: "leads" } })).status, 403);
    assert.equal((await ask("claudia", routes.adminNote.PATCH, { uid: "bea", noteId: "leads-after" }, { body: { text: "x" } })).status, 403);
    assert.equal((await ask("claudia", routes.adminNote.DELETE, { uid: "bea", noteId: "leads-after" })).status, 403);
  });
});
