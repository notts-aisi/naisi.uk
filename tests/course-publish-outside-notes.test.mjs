/**
 * Publish, for somebody placed outside the times they gave, and for the
 * facilitators of a group somebody has joined.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET/PUT/POST /api/courses/runs/[runId]/allocation/publish/notes
 *   POST         /api/courses/runs/[runId]/allocation/publish(/test)
 *   GET          /api/courses/runs/[runId]/allocation(/publish/preview)
 *
 * ## What this guards
 *
 *  1. ONE ANSWER TO "OUTSIDE". The board's "Not free" card (`cardFit`),
 *     Publish's readiness check (`readGetReady`) and Publish's plan
 *     (`loadPublishPlan`) each call `placedOutsideTheirTimes`, and nothing else
 *     decides it: every file that reads which groups somebody can make is
 *     listed, both ways, with what it does with it.
 *  2. PUBLISH WAITS FOR A CHOICE. A press is refused (409, names) until each
 *     person it would tell who sits outside the times they gave has a note or
 *     "Send without a note", and the readiness check names the same people as
 *     needed, in its own words.
 *  3. THE NOTE GOES ABOVE THE DETAILS, in that person's "Your group" email
 *     only, as a press sends it, as "Send a test to me" sends it and as the
 *     page previews it. Moving them voids it; the press that sends it spends
 *     it.
 *  4. WHO MAY: an admin or the programme's lead saves; only an admin asks
 *     Claude; the run's track lead and everybody else are refused; a view-as
 *     session is refused before anything is read; the lead is never sent
 *     Claude's draft or anybody's week.
 *  5. CLAUDE'S FENCE: Claude is sent the application alone, the programme's
 *     description and the bare fact, never a name, an address, the times
 *     they marked or the group's day and time. Its draft is kept with the
 *     application and is never sent.
 *  6. WHO HAS JOINED: a facilitator already told about a group gets ONE email
 *     a press naming who has joined, never the lead, once per person, counted
 *     in the button's number and in "Send a test to me". A facilitator told
 *     for the first time gets "You're facilitating" alone.
 *  7. THE PAGE'S LIST AGREES WITH THE PRESS: the preview's counts are the
 *     board's and what the press sends.
 *  8. THE BOARD SAYS WHO IS NOT TOLD YET once the run is published.
 *  9. WHAT CAN FOLLOW reads the place-confirmation reminder's switch with
 *     the job's own default.
 *
 * Built on `tests/lib/handoverWorld.mjs`, with the course run reshaped to the
 * board's own example, as `tests/course-hub-publish-routes.test.mjs` is.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { AGI, GROUP, ROUND, RUN, groupDoc, loadJoin, makeWorld, namedSeed, short } from "./lib/handoverWorld.mjs";
import { session, userDoc } from "./lib/applicationsSmallTerm.mjs";

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export function claudeConfigured() { return globalThis.__outsideClaude.configured; }
export async function askClaudeForJson(input) {
  globalThis.__outsideClaude.asked.push(input);
  return globalThis.__outsideClaude.answer;
}`;
globalThis.__outsideClaude = { configured: true, asked: [], answer: null };
const claude = globalThis.__outsideClaude;

const made = makeWorld("__outsideNotes", [["@/lib/ai/claude", CLAUDE_STUB]]);
const { world, reset, call, everything, lib } = made;
const join_ = await loadJoin(made);
const { routes, press, board, place } = join_;
const preview = await made.courseRoute("runs", "[runId]", "allocation", "publish", "preview");
const outside = await lib("courses", "outsideTheirTimes.ts");
const notesModel = await lib("courses", "placementNotes", "model.ts");
const publishWords = await lib("courses", "publishWords.ts");
const boardParts = await made.loadTs(join("features", "applications", "groups", "peopleInGroupsBoard.ts"));
const boardWords = await made.loadTs(join("features", "applications", "groups", "peopleInGroupsWords.ts"));
const { readGetReady } = await lib("courses", "getReady", "read.ts");
const getReadyModel = await lib("courses", "getReady", "model.ts");
const { readRunRecords } = await lib("courses", "programmeAttendance.ts");

// Tue 27 Oct 2026, 5:38pm in London.
const NOW = new Date("2026-10-27T17:38:00Z");
mock.timers.enable({ apis: ["Date"], now: NOW });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");

const SIX_WEEKS = Array.from({ length: 6 }, (_, i) => ({ kind: "week", weekNumber: i + 1, weekId: `w0${i + 1}` }));
const slot = (over) => ({ weekday: 2, startTimeLocal: "18:00", durationMinutes: 120, location: "Hallward B12", meetingUrl: null, notes: "", ...over });

/** Group B on Tuesdays at 6pm with Rahul and Sofia, Group A on Thursdays at 6pm with Sofia, Group C online on Wednesdays with Tom. */
function seed() {
  const docs = namedSeed();
  for (const [uid, name] of [["rahul", "Rahul Mehta"], ["sofia", "Sofia Rossi"], ["tom", "Tom Fletcher"]]) {
    docs[`users/${uid}`] = userDoc(session(uid, "member", false, name));
  }
  docs[`courseRuns/${RUN.agi}`] = { ...docs[`courseRuns/${RUN.agi}`], startDate: "2026-10-29", weekPlan: SIX_WEEKS };
  docs[`courseGroups/${GROUP.monday}`] = groupDoc({ name: "Group B", facilitatorUids: ["rahul", "sofia"], session: slot() });
  docs[`courseGroups/${GROUP.thursday}`] = groupDoc({
    name: "Group A",
    facilitatorUids: ["sofia"],
    session: slot({ weekday: 4, location: "Portland A13" }),
  });
  docs[`courseGroups/${GROUP.unset}`] = groupDoc({
    name: "Group C",
    facilitatorUids: ["tom"],
    session: slot({ weekday: 3, startTimeLocal: "13:00", location: "", meetingUrl: "https://meet.example/j/1" }),
  });
  return docs;
}

const B = GROUP.monday;
const A = GROUP.thursday;

/**
 * Everybody holding a place, handed over and placed: Amara and Dev in B, Bea
 * and Tariq in A. Amara painted Monday evening and Thursday morning, Dev
 * Monday evening, Tariq half of Monday evening: all three are outside the
 * times they gave. Bea painted nothing, which is never outside.
 */
async function placed() {
  assert.equal((await press()).status, 200);
  const done = await place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: A },
  ]);
  assert.equal(done.body.placed, 4, JSON.stringify(done.body));
}

const notes = (who = "zach", options = {}) => call(who, routes.publishNotes.GET, { runId: RUN.agi }, { course: true, ...options });
const save = (who, body, options = {}) => call(who, routes.publishNotes.PUT, { runId: RUN.agi }, { body, course: true, ...options });
const draft = (who, uid, options = {}) => call(who, routes.publishNotes.POST, { runId: RUN.agi }, { body: { uid }, course: true, ...options });
const summary = async (who = "zach") => (await board(who)).body.publish;
const sendTest = (who = "zach") => call(who, routes.publishTest.POST, { runId: RUN.agi }, { course: true });
const pressNow = async (who = "zach") => call(who, routes.publish.POST, { runId: RUN.agi }, { body: { emails: (await summary(who)).emails }, course: true });
const previewNow = (who = "zach") => call(who, preview.GET, { runId: RUN.agi }, { course: true });
const isTest = (mail) => mail.subject.startsWith("[TEST]");
const realMail = () => world.mail.filter((mail) => !isTest(mail));
const notePath = (uid) => `coursePlacementNotes/${RUN.agi}__${uid}`;

/** One sent email as its reader reads it. */
async function opened(mail) {
  const html = await render(mail.react);
  const text = html
    .replace(/<head[\s\S]*?<\/head>/i, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return { to: mail.to, subject: mail.subject, html, text };
}

/** The readiness check as the lead reads it, through the one reader. */
async function readiness(who = "claudia") {
  const records = await readRunRecords(world.courseDb, RUN.agi);
  world.user = made.sessionOf(who);
  world.course = true;
  try {
    const read = await readGetReady(world.courseDb, made.sessionOf(who), ROUND, AGI, records, new Date());
    return { facts: read.facts, model: getReadyModel.buildReadiness(read.facts) };
  } finally {
    world.course = false;
  }
}

beforeEach(() => {
  reset(seed(), { now: () => new Date() });
  claude.configured = true;
  claude.asked.length = 0;
  claude.answer = null;
});

// ---------------------------------------------------------------------------
// 1. One answer to "outside"
// ---------------------------------------------------------------------------

describe("1. one answer to outside the times they gave", () => {
  const G = { id: "g", sessionLabel: "Tuesdays 18:00–20:00" };
  const fromForm = (availability, canMakeGroupIds = []) => ({ availability: [], fromForm: { availability, canMakeGroupIds } });

  test("from the form: outside when their week does not cover the group's whole session", () => {
    assert.equal(outside.placedOutsideTheirTimes(fromForm("given", []), G), true);
    assert.equal(outside.placedOutsideTheirTimes(fromForm("given", ["g"]), G), false);
    // Nothing painted, or nothing on file, is never a clash.
    assert.equal(outside.placedOutsideTheirTimes(fromForm("none-given"), G), false);
    assert.equal(outside.placedOutsideTheirTimes(fromForm("not-on-file"), G), false);
  });

  test("applied to the run: outside when they ticked something and not this session; ticking nothing is silence", () => {
    assert.equal(outside.placedOutsideTheirTimes({ availability: ["Mondays 18:00–20:00"], fromForm: null }, G), true);
    assert.equal(outside.placedOutsideTheirTimes({ availability: [G.sessionLabel], fromForm: null }, G), false);
    assert.equal(outside.placedOutsideTheirTimes({ availability: [], fromForm: null }, G), false);
  });

  test("no group, or a group with no day and time, is never outside", () => {
    assert.equal(outside.placedOutsideTheirTimes(fromForm("given", []), null), false);
    assert.equal(outside.placedOutsideTheirTimes(fromForm("given", []), { id: "g", sessionLabel: "" }), false);
  });

  test("a session's label is the one a run's own form stores", () => {
    assert.equal(outside.sessionLabelOf({ weekday: 2, startTimeLocal: "18:00", durationMinutes: 90 }), "Tuesdays 18:00–19:30");
    assert.equal(outside.sessionLabelOf({ weekday: 2, startTimeLocal: "", durationMinutes: 90 }), "");
  });

  test("the board's card, the readiness check and the plan say the same of every person", async () => {
    await placed();
    const shown = (await board("zach")).body;
    const groups = shown.groups.map((group) => ({ id: group.id, sessionLabel: group.sessionLabel }));
    const fit = await made.loadTs(join("features", "courses", "allocationFit.ts"));
    const byCard = shown.people
      .filter((row) => fit.cardFit(row, groups.find((group) => group.id === row.groupId) ?? null, groups).conflict)
      .map((row) => row.uid)
      .sort();
    const byReadiness = (await readiness()).facts.outside.map((person) => person.uid).sort();
    const byPlan = (await notes()).body.section.rows.map((row) => row.uid).sort();
    assert.deepEqual(byCard, ["amara", "dev", "tariq"]);
    assert.deepEqual(byReadiness, byCard);
    assert.deepEqual(byPlan, byCard);
  });

  // ---- The guard ----------------------------------------------------------

  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path, out);
      else if (/\.(ts|tsx)$/.test(name)) out.push(path);
    }
    return out;
  }
  const SOURCE = walk(SRC).map((path) => [relative(ROOT, path), readFileSync(path, "utf8")]);
  const filesWhere = (pattern) => SOURCE.filter(([, code]) => pattern.test(code)).map(([file]) => file).sort();

  /** Every file that asks the one answer, and why. */
  const ASKS = {
    "src/features/courses/allocationFit.ts": "the board's card: whether it says Not free (`cardFit`'s `conflict`)",
    "src/lib/courses/getReady/read.ts": "Publish's readiness check: who it names as placed outside the times they gave",
    "src/lib/courses/allocationPublish.ts": "Publish's plan: whom it waits on a note for",
  };

  /**
   * Every file that reads which groups somebody can make, and what it does
   * with it. A new reader decides nothing about "outside" by itself: it asks
   * `placedOutsideTheirTimes`, or says here why it needs no answer.
   */
  const READS_CAN_MAKE = {
    "src/lib/applications/handover/board.ts": "works it out from the painted week, and hands only the answer on",
    "src/lib/courses/outsideTheirTimes.ts": "the one answer",
    "src/features/courses/allocationFit.ts": "the card: draws the sessions somebody can make as chips, and asks the one answer for Not free",
    "src/features/applications/groups/peopleInGroupsBoard.ts": "the card's \"Fits A, B\" letters; its Not free mark is cardFit's answer",
    "src/app/api/courses/runs/[runId]/allocation/route.ts": "copies the server's fact onto the board's row, field by field",
    "src/lib/courses/allocationPublish.ts": "hands the facts to the one answer",
    "src/lib/courses/getReady/read.ts": "hands the facts to the one answer",
  };

  test("the walk reads the tree", () => {
    assert.ok(SOURCE.length > 500, "too few files were read: has the tree moved?");
  });

  test("the three readers, and nothing else, ask the one answer", () => {
    assert.deepEqual(filesWhere(/\bplacedOutsideTheirTimes\s*\(/), [...Object.keys(ASKS), "src/lib/courses/outsideTheirTimes.ts"].sort());
    for (const [file, why] of Object.entries(ASKS)) assert.ok(why.length > 20, `${file} needs its reason`);
  });

  test("every file that reads which groups somebody can make is listed, both ways", () => {
    assert.deepEqual(filesWhere(/\bcanMakeGroupIds\b/), Object.keys(READS_CAN_MAKE).sort());
    for (const [file, why] of Object.entries(READS_CAN_MAKE)) assert.ok(why.length > 10, `${file} needs its reason`);
  });

  test("the readiness check no longer reads the People tab's fit marks to decide it", () => {
    const model = readFileSync(join(SRC, "lib", "courses", "getReady", "model.ts"), "utf8");
    assert.doesNotMatch(model, /free\.kind\s*===\s*"fits/);
  });
});

// ---------------------------------------------------------------------------
// 2. Publish waits for a choice
// ---------------------------------------------------------------------------

describe("2. Publish waits for a note, or none, for each person outside their times", () => {
  test("the press is refused, naming them, and the readiness check says so in its own words", async () => {
    await placed();
    await sendTest();
    const before = everything();
    const refused = await pressNow();
    assert.deepEqual(short(refused), [
      409,
      "Nothing was published and nobody was emailed. Amara, Dev and Tariq are placed outside the times they gave. Write each of them a note, or choose “Send without a note”, before you publish.",
    ]);
    assert.deepEqual(refused.body.notesNeeded, ["Amara", "Dev", "Tariq"]);
    assert.equal(everything(), before, "a refused press wrote something");
    assert.deepEqual(realMail(), []);
    // The board's summary carries the same names, and the button is locked.
    assert.deepEqual((await summary()).notesNeeded, ["Amara", "Dev", "Tariq"]);
    const { model } = await readiness();
    const item = model.needed.find((entry) => entry.key === "notes");
    assert.deepEqual([item.state, item.title, model.ready], ["blocks", "Everyone outside the times they gave has a note, or none chosen", false]);
    assert.equal(item.detail, "Amara, Dev and Tariq need a note, or Send without a note, under Outside the times they gave below.");
  });

  test("with each one chosen, the press goes, and the choices are spent", async () => {
    await placed();
    for (const uid of ["amara", "dev"]) {
      assert.equal((await save("zach", { uid, groupId: B, choice: "none" })).status, 200);
    }
    assert.deepEqual((await summary()).notesNeeded, ["Tariq"]);
    assert.equal((await save("claudia", { uid: "tariq", groupId: A, choice: "note", text: "We would still love to have you.\n\nReply if it can't work." })).status, 200);
    const { model } = await readiness();
    assert.deepEqual(
      model.needed.filter((entry) => entry.key === "notes").map((entry) => [entry.state, entry.detail]),
      [["done", "1 note saved, 2 going without one."]],
    );
    await sendTest();
    const pressed = await pressNow();
    assert.equal(pressed.status, 200, JSON.stringify(pressed.body));
    for (const uid of ["amara", "dev", "tariq"]) assert.ok(world.db.read(notePath(uid)).sentAt instanceof Date, uid);
    // Told: nobody is waiting any more.
    assert.deepEqual((await notes()).body.section.rows, []);
  });

  test("a move voids what was chosen, and the press waits again", async () => {
    await placed();
    await join_.withoutNotes();
    assert.equal("notesNeeded" in (await summary()), false);
    await place("zach", [{ uid: "tariq", groupId: B }]);
    assert.deepEqual((await summary()).notesNeeded, ["Tariq"]);
    // A choice for the group they have left is refused, with why.
    const stale = await save("zach", { uid: "tariq", groupId: A, choice: "none" });
    assert.deepEqual(short(stale), [409, "Tariq has moved to another group since this page loaded. Reload the page and choose again."]);
  });

  test("somebody not waited on is refused, and a note is text within its limit", async () => {
    await placed();
    assert.deepEqual(short(await save("zach", { uid: "bea", groupId: A, choice: "none" })), [
      409,
      "Bea isn’t waiting for a note: they have been told their group, or the group they’re in now meets at a time they gave. Reload the page.",
    ]);
    assert.deepEqual(short(await save("zach", { uid: "dev", groupId: B, choice: "note", text: "   " })), [400, "Write the note, or choose Send without a note."]);
    assert.deepEqual(short(await save("zach", { uid: "dev", groupId: B, choice: "note", text: "x".repeat(1201) })), [400, "Keep the note to 1200 characters."]);
    assert.deepEqual(short(await save("zach", { uid: "dev", groupId: B, choice: "maybe" })), [400, "Say whether this is a note or Send without a note."]);
    // A dash in a note is written as the site writes everything.
    assert.equal((await save("zach", { uid: "dev", groupId: B, choice: "note", text: "We know — sadly – it clashes." })).status, 200);
    assert.equal(world.db.read(notePath("dev")).text, "We know, sadly, it clashes.");
  });
});

// ---------------------------------------------------------------------------
// 3. Where the note goes
// ---------------------------------------------------------------------------

describe("3. the note goes above the details, in that person's email only", () => {
  const NOTE = "We know Tuesday evenings aren’t one of your times.\n\nWe’d still like you in the group: reply to this email if it can’t work.";

  async function noted() {
    await placed();
    await join_.withoutNotes("zach");
    // Replace Dev's "none" with a note.
    assert.equal((await save("zach", { uid: "dev", groupId: B, choice: "note", text: NOTE })).status, 200);
  }

  test("the press sends it after the greeting and before the site's details, and nobody else's email carries it", async () => {
    await noted();
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    const dev = await opened(realMail().find((mail) => mail.to === "dev@example.com"));
    assert.ok(
      dev.text.includes(
        "Hi Dev, We know Tuesday evenings aren’t one of your times. We’d still like you in the group: reply to this email if it can’t work. You’re in Group B.",
      ),
      dev.text,
    );
    // Two paragraphs, as typed.
    assert.match(dev.html, /<p>We know Tuesday evenings aren’t one of your times\.<\/p><p>We’d still like you/);
    for (const mail of realMail().filter((each) => each.to !== "dev@example.com")) {
      assert.ok(!(await opened(mail)).text.includes("We know Tuesday evenings"), mail.to);
    }
  });

  test("Send a test to me sends a noted email beside the first person's, and the preview shows it", async () => {
    await noted();
    const tested = await sendTest();
    assert.equal(tested.status, 200, JSON.stringify(tested.body));
    const tests = await Promise.all(world.mail.filter(isTest).map(opened));
    assert.ok(tests.some((mail) => mail.text.includes("Hi Dev, We know Tuesday evenings")), tests.map((mail) => mail.subject).join(" | "));
    assert.ok(tests.every((mail) => mail.to === "zach@example.com"));
    const shown = (await previewNow()).body;
    assert.deepEqual(shown.noted.map((person) => person.uid), ["dev"]);
    assert.ok(shown.notedEmail && shown.notedEmail.html.includes("We know Tuesday evenings"), "the preview draws no noted email");
    assert.deepEqual(shown.notesNeeded, []);
  });

  test("a typed bracket is printed as a round one, so nothing can look like a token", () => {
    const email = { subject: "s", blocks: [{ id: "b", type: "richText", html: "<p>Hi Ana,</p><p>You’re in {groupName}.</p>" }] };
    const withNote = notesModel.withPlacementNote(email, "See {this} <b>now</b>");
    assert.equal(withNote.blocks[0].html, "<p>Hi Ana,</p><p>See (this) &lt;b&gt;now&lt;/b&gt;</p><p>You’re in {groupName}.</p>");
    // An email that opens with no greeting takes the note first.
    const bare = notesModel.withPlacementNote({ subject: "s", blocks: [{ id: "b", type: "richText", html: "<p>You’re in.</p>" }] }, "Hello.");
    assert.deepEqual(bare.blocks.map((block) => block.html), ["<p>Hello.</p>", "<p>You’re in.</p>"]);
    assert.deepEqual(notesModel.withPlacementNote(email, "   ").blocks, email.blocks);
  });
});

// ---------------------------------------------------------------------------
// 4. Who may
// ---------------------------------------------------------------------------

describe("4. who may see, save and draft", () => {
  test("signed out, a member, a facilitator and the run's track lead are refused; the lead and an admin are answered", async () => {
    await placed();
    assert.deepEqual(short(await notes(null)), [401, "Not signed in"]);
    for (const who of ["amara", "rahul", "yusuf", "lloyd"]) {
      const before = everything();
      assert.equal((await notes(who)).status, 403, who);
      assert.equal((await save(who, { uid: "dev", groupId: B, choice: "none" })).status, 403, who);
      assert.equal(everything(), before, `${who} wrote something`);
    }
    assert.equal((await notes("claudia")).status, 200);
    assert.equal((await notes("zach")).status, 200);
  });

  test("a view-as session is refused before anything is read or written", async () => {
    await placed();
    const before = everything();
    assert.equal((await save("zach", { uid: "dev", groupId: B, choice: "none" }, { viewAs: true })).status, 403);
    assert.equal((await draft("zach", "dev", { viewAs: true })).status, 403);
    assert.equal(everything(), before);
    assert.equal(claude.asked.length, 0);
  });

  test("the lead sees no painted week and no draft, and may not ask Claude", async () => {
    await placed();
    claude.answer = { ok: true, value: { note: "A draft.", basis: "Their interests." }, model: "m" };
    assert.equal((await draft("zach", "dev")).status, 200);
    const asLead = (await notes("claudia")).body.section;
    assert.equal(asLead.admin, false);
    for (const row of asLead.rows) {
      assert.deepEqual([row.week, row.draft, row.canDraft], [null, null, false], row.uid);
    }
    const asked = claude.asked.length;
    assert.deepEqual(short(await draft("claudia", "dev")), [403, "Only an admin can ask Claude to draft a note."]);
    assert.equal(claude.asked.length, asked);
    // An admin sees each person's week beside their group's session, and how much of it they gave.
    const asAdmin = (await notes("zach")).body.section;
    const dev = asAdmin.rows.find((row) => row.uid === "dev");
    assert.deepEqual([dev.week.session, dev.week.overlapMinutes, dev.draft.text], [
      { weekday: 2, startTimeLocal: "18:00", durationMinutes: 120 },
      0,
      "A draft.",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 5. Claude's fence
// ---------------------------------------------------------------------------

describe("5. Claude is sent the application alone, and its draft is never sent", () => {
  test("no name, no address, no times, no group: the programme's description and the bare fact", async () => {
    await placed();
    claude.answer = { ok: true, value: { note: "We know — it clashes.", basis: "Their interest in evaluations." }, model: "claude-opus-5-5" };
    const drafted = await draft("zach", "dev");
    assert.equal(drafted.status, 200, JSON.stringify(drafted.body));
    assert.equal(claude.asked.length, 1);
    const { system, message } = claude.asked[0];
    assert.ok(message.includes("Their group meets outside the times they told us they are free."));
    assert.ok(message.includes("AGI Strategy Fellowship"), "the programme is not named");
    assert.ok(message.includes("I want to know which arguments survive."), "the application is not in it");
    for (const never of ["Dev", "Patel", "dev@", "students.example.com", "Group B", "Tuesday", "18:00", "6pm", "Hallward", "Rahul", "Sofia", "Monday"]) {
      assert.ok(!message.includes(never), `Claude was sent ${never}`);
    }
    assert.match(system, /Never use an em dash or an en dash/);
    // Kept with the application, tidied, and not a choice: Dev still waits.
    const assessment = world.db.read(`admissionAssessments/${ROUND}__dev`);
    assert.deepEqual([assessment.placementDraft.text, assessment.placementDraft.runId], ["We know, it clashes.", RUN.agi]);
    assert.equal(world.db.read(notePath("dev")), undefined);
    assert.ok((await summary()).notesNeeded.includes("Dev"));
    // And nothing is sent with it: once the others are chosen, Dev's email is the standard one.
    await join_.withoutNotes();
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    for (const mail of await Promise.all(world.mail.map(opened))) assert.ok(!mail.text.includes("it clashes"), mail.to);
  });

  test("nobody drafts a note to themselves, and Claude switched off says so", async () => {
    await placed();
    claude.configured = false;
    assert.deepEqual(short(await draft("zach", "dev")), [409, "Claude isn’t set up on this site yet."]);
    assert.equal(claude.asked.length, 0);
  });
});

// ---------------------------------------------------------------------------
// 6. Who has joined
// ---------------------------------------------------------------------------

describe("6. a facilitator already told is told who has joined, once per person", () => {
  async function published() {
    await placed();
    await join_.withoutNotes();
    await sendTest();
    assert.equal((await pressNow()).status, 200);
    world.mail.length = 0;
  }

  test("one email per facilitator per press, naming everybody new by first name, counted on the button and in the test", async () => {
    await published();
    // After the first press, Amara and Dev move into Group A, whose Sofia was told about it.
    await place("zach", [{ uid: "amara", groupId: A }, { uid: "dev", groupId: A }]);
    await join_.withoutNotes();
    const shown = await summary();
    assert.deepEqual([shown.emails, shown.people, shown.facilitators, shown.joined], [3, 2, 0, 1]);
    assert.equal(publishWords.publishAudienceLine(shown.people, shown.facilitators, shown.joined), "2 people and 1 facilitator told who has joined");
    const tested = await sendTest();
    assert.equal(tested.status, 200);
    assert.ok(world.mail.filter(isTest).some((mail) => mail.subject === "[TEST] Amara and Dev have joined Group A"));
    world.mail.length = 0;
    const pressed = await pressNow();
    assert.deepEqual(pressed.body.report.joined, { sent: 1, held: 0, suppressed: 0 });
    const sofia = await opened(realMail().find((mail) => mail.to === "sofia@example.com"));
    assert.equal(sofia.subject, "Amara and Dev have joined Group A");
    assert.ok(sofia.text.includes("Hi Sofia, Amara and Dev have joined Group A, which meets on Thursdays at 6pm. There are 4 people in the group now."), sofia.text);
    // Group B's facilitators hear nothing: nobody joined it.
    assert.ok(!realMail().some((mail) => mail.to === "rahul@example.com"));
    // Each pair is claimed once.
    assert.deepEqual(
      world.db.paths().filter((path) => path.startsWith(`courseNudges/joined__`)).sort(),
      [`courseNudges/joined__${RUN.agi}__${A}__sofia__amara`, `courseNudges/joined__${RUN.agi}__${A}__sofia__dev`],
    );
    assert.equal((await summary()).emails, 0);
  });

  test("nobody is announced twice to the same facilitator, whatever moves", async () => {
    await published();
    await place("zach", [{ uid: "amara", groupId: A }]);
    await join_.withoutNotes();
    assert.equal((await pressNow()).status, 200);
    // Back to B and into A again: Amara is told again, Sofia is not.
    await place("zach", [{ uid: "amara", groupId: B }]);
    await place("zach", [{ uid: "amara", groupId: A }]);
    await join_.withoutNotes();
    world.mail.length = 0;
    const shown = await summary();
    assert.deepEqual([shown.people, "joined" in shown], [1, false]);
    assert.equal((await pressNow()).status, 200);
    assert.deepEqual(realMail().map((mail) => mail.to), ["amara@example.com"]);
  });

  test("never the programme's lead, and a facilitator told for the first time gets You're facilitating alone", async () => {
    await published();
    // Claudia leads AGI Strategy, which names the run; Tom is added to Group A.
    world.db.poke(`courseGroups/${A}`, { facilitatorUids: ["sofia", "claudia", "tom"] });
    await place("zach", [{ uid: "dev", groupId: A }]);
    await join_.withoutNotes();
    assert.equal((await pressNow()).status, 200);
    const to = realMail().map((mail) => [mail.to, mail.subject]);
    assert.ok(!to.some(([address]) => address === "claudia@example.com"), JSON.stringify(to));
    assert.deepEqual(to.filter(([address]) => address === "tom@example.com").map(([, subject]) => subject), ["You’re facilitating Group A: Thursdays at 6pm"]);
    assert.deepEqual(to.filter(([address]) => address === "sofia@example.com").map(([, subject]) => subject), ["Dev has joined Group A"]);
  });

  test("a failed send of a joined email marks its claims failed, and the next press announces them again", async (t) => {
    t.mock.method(console, "error", () => {});
    await published();
    await place("zach", [{ uid: "dev", groupId: A }]);
    await join_.withoutNotes();
    world.mailFate = (args) => (args.to === "sofia@example.com" ? "fail" : "sent");
    const pressed = await pressNow();
    assert.deepEqual(pressed.body.report.failed, ["Sofia"]);
    assert.equal(world.db.read(`courseNudges/joined__${RUN.agi}__${A}__sofia__dev`).state, "failed");
    // Dev was told; Sofia still is owed hearing it, and nothing else is.
    world.mailFate = null;
    world.mail.length = 0;
    const again = await summary();
    assert.deepEqual([again.emails, again.people, again.joined], [1, 0, 1]);
    assert.equal((await pressNow()).status, 200);
    assert.deepEqual(realMail().map((mail) => [mail.to, mail.subject]), [["sofia@example.com", "Dev has joined Group A"]]);
    assert.equal(world.db.read(`courseNudges/joined__${RUN.agi}__${A}__sofia__dev`).state, "sent");
    assert.equal((await summary()).emails, 0);
  });
});

// ---------------------------------------------------------------------------
// 7. The page's list agrees with the press
// ---------------------------------------------------------------------------

describe("7. what this press sends is what the press sends", () => {
  test("the preview's counts and names are the board's, and the press's report", async () => {
    await placed();
    await join_.withoutNotes();
    await sendTest();
    const shown = await summary();
    const listed = (await previewNow()).body;
    assert.deepEqual(
      [listed.people.emails, listed.facilitators.emails, listed.joined.emails],
      [shown.people, shown.facilitators, shown.joined ?? 0],
    );
    assert.equal(listed.people.emails + listed.facilitators.emails + listed.joined.emails, shown.emails);
    // This copy of the site has no phone notifications set up.
    assert.deepEqual(listed.push, { configured: false, names: [] });
    const pressed = await pressNow();
    const report = pressed.body.report;
    assert.deepEqual(
      [report.people.sent, report.facilitators.sent, report.joined?.sent ?? 0],
      [listed.people.emails, listed.facilitators.emails, listed.joined.emails],
    );
    assert.deepEqual(realMail().map((mail) => mail.to).filter((address) => address.endsWith("@example.com")).length, shown.emails);
  });
});

// ---------------------------------------------------------------------------
// 8. The board says who is not told yet
// ---------------------------------------------------------------------------

describe("8. once published, the board marks who is not told yet", () => {
  const group = { id: "g", name: "Group A", tag: "A", when: "Thu 6pm", sessionLabel: "Thursdays 18:00–20:00", facilitatorUids: [] };
  const row = (over = {}) => ({
    uid: "ana",
    displayName: "Ana",
    availability: [],
    fromForm: null,
    groupId: "g",
    enrolmentStatus: "active",
    allocatedEmailAt: null,
    allocatedEmailDelivery: null,
    ...over,
  });

  test("placed and untold after a publish, and nobody else", () => {
    assert.equal(boardParts.notToldYet(row(), group, true), true);
    assert.equal(boardParts.notToldYet(row(), group, false), false, "before any publish everybody is untold, and nothing says it");
    assert.equal(boardParts.notToldYet(row({ allocatedEmailAt: "2026-10-27T10:00:00Z" }), group, true), false);
    assert.equal(boardParts.notToldYet(row(), null, true), false, "To place is not a group");
    assert.equal(
      boardParts.notToldYet(row({ fromForm: { availability: "given", canMakeGroupIds: [], holdsPlace: false } }), group, true),
      false,
      "a card that says Gave their place back is nobody a press tells",
    );
    const { marks } = boardParts.marksOf(row(), group, [group], false, true);
    assert.ok(marks.some((mark) => mark.words === "Not told yet"));
  });

  test("the line over the board", () => {
    assert.deepEqual(boardWords.placedSinceWords(["Ana", "Raj", "Tom"]), {
      lead: "3 placed since you published: Ana, Raj and Tom.",
      link: "Publish to tell them",
    });
    assert.equal(boardWords.placedSinceWords(["Ana"]).lead, "1 placed since you published: Ana.");
  });
});

// ---------------------------------------------------------------------------
// 9. What can follow, and the deletions
// ---------------------------------------------------------------------------

describe("9. what can follow by itself reads each switch with its job's own default; the notes go with the account", () => {
  test("the place-confirmation reminder's default is its registration's", () => {
    const job = readFileSync(join(SRC, "lib", "scheduler", "jobs", "applicationPlaceConfirmations.ts"), "utf8");
    const follows = readFileSync(join(SRC, "lib", "courses", "getReady", "follows.ts"), "utf8");
    const registered = /enabledByDefault:\s*(true|false),/.exec(job.slice(job.lastIndexOf("export const")));
    const here = /PLACE_CONFIRMATIONS_ENABLED_BY_DEFAULT = (true|false);/.exec(follows);
    assert.ok(registered && here);
    assert.equal(here[1], registered[1]);
  });

  // Run for real, with the rest of the cascade, by the account-deletion
  // suites; here, that the cascade has the step and the step sweeps by uid.
  test("deleting the account deletes what was chosen for it, on every run, by the one equality on uid", () => {
    const cascade = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(
      cascade,
      /export async function deleteCoursePlacementNotes\(db: Firestore, uid: string\): Promise<number> \{\s*return deleteOwnedCourseRows\(db, PLACEMENT_NOTES_COLLECTION, uid\);/,
    );
    assert.match(cascade, /summary\.coursePlacementNotesDeleted = await deleteCoursePlacementNotes\(db, uid\);/);
  });

  test("the run's destroy drains the collection by runId", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    assert.match(engine, /key: "placementNotes",[\s\S]{0,400}?drainQuery\(db, PLACEMENT_NOTES_COLLECTION, byRunId\(PLACEMENT_NOTES_COLLECTION\), budget\)/);
    assert.match(engine, /countAgg\(db\.collection\(PLACEMENT_NOTES_COLLECTION\)\.where\("runId", "==", runId\)\)/);
  });
});
