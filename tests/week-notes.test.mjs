/**
 * END-OF-WEEK NOTES ABOUT PEOPLE (privacy v15, "AI-assisted review": "Once a
 * week Claude may also draft a short note on how each person is doing, using
 * only the work they submitted and the feedback, ratings and comments people
 * on the team gave it"), driven through the real page and routes on AGI
 * Strategy's run in its third week.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is `tests/lib/facilitatorWeekWorld.mjs` (week 3 written as
 * blocks; Group A on Thursdays with Sofia, Group B on Tuesdays with Rahul and
 * Sofia, Group C on Wednesdays with Tom, Group D on Mondays with Grace;
 * Claudia leads the programme, Lloyd reviews it, Yusuf is the run's track
 * lead, Zach is an admin). Amara, Bea, Dev and Tariq hold places, all in
 * Group A. On top of it:
 *
 *  - A WRITTEN ANSWER in week 3. Amara's (naming Claudia and Dev Patel and
 *    typing an address) and her first reflection were first written on Tue
 *    10 Nov, her week SUBMITTED on Wed 11 Nov; her second reflection carries
 *    no first-written time and never counts. Bea wrote and submitted too,
 *    but only ever agreed to version 14. Dev wrote and never submitted.
 *    Tariq wrote nothing.
 *  - THE TEAM'S WORDS on Amara's week: Sofia's feedback on the answer
 *    (naming Amara and Rahul), Claudia's rating of it (8, "Takes a side and
 *    defends it") and her feedback on the week as a whole, and Zach's rating
 *    (7), given before Zach agreed to version 15, so it never goes.
 *  - WHAT MAY NEVER GO, all present: Amara's check-in, a session report
 *    naming her, Claude's week review grading her answer, her private note
 *    and a rating of Dev's answer.
 *  - AGREEMENTS to version 15 on Thu 5 Nov for Amara, Dev, Tariq, Sofia and
 *    Claudia; Zach on Wed 18 Nov at noon; Bea only to version 14.
 *  - Amara said on her application that she would like to facilitate.
 *
 * THE CLOCK is Thu 19 Nov 2026 at 10am unless a test says: every group has
 * met for week 3 (Group C, the last, on Wed 18 Nov at 1pm).
 *
 * Claude is a stub that records each request and answers what a test says.
 * Every name, address and word is made up.
 *
 * What is held, by section:
 *  1. The message: only a submitted week, from the person's moment; the
 *     team's words scrubbed, writers by what they are and raters by number;
 *     nothing of a check-in, a report, a review grade or a private note;
 *     "Built only from" is what went, item for item; the profile's draft
 *     sends through the same function.
 *  2. The draft press: every caller, view-as, no key, not every group met,
 *     no submission, nothing that may go, a label slip, a second press and
 *     Draft again.
 *  3. The page: an admin's drafts, counts and press; the boxes unticked;
 *     what came in after a draft; the lead's saved notes only, never a draft
 *     or a count; everybody else turned away.
 *  4. Save and Discard: the admin's words kept as an end-of-week note with
 *     what it was built from, the draft gone; refusals.
 *  5. Deletion: an account's drafts go, and its ratings and feedback leave
 *     what drafts and notes about others were built from.
 *  6. The house's words, the stylesheet and the imports of this piece.
 */
import { after, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CASCADE_FIRESTORE_STUB, makeCascadeDb } from "./lib/cascadeStore.mjs";
import { makeFacilitatorPagesWorld } from "./lib/facilitatorPagesWorld.mjs";
import { A, AGI, NOTED, NOW, ROUND, RUN, SAID, facilitatorWeekSeed, reflection } from "./lib/facilitatorWeekWorld.mjs";
import { applicationPath, decisionPath } from "./lib/handoverWorld.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });
after(() => mock.timers.reset());

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export function claudeConfigured() { return globalThis.__wnClaudeKey !== false; }
export async function askClaudeForJson(input) {
  globalThis.__wnClaudeAsked.push(input);
  return globalThis.__wnClaudeAnswer(input);
}`;

const w = await makeFacilitatorPagesWorld("__wn", [["@/lib/ai/claude", CLAUDE_STUB]]);
const NOTES_API = ["admissions", "forms", "[roundId]", "programmes", "[programmeId]", "weeks", "[weekId]", "notes"];
const routes = {
  draft: await w.loadTs(join("app", "api", ...NOTES_API, "draft", "route.ts")),
  save: await w.loadTs(join("app", "api", ...NOTES_API, "[uid]", "save", "route.ts")),
  discard: await w.loadTs(join("app", "api", ...NOTES_API, "[uid]", "route.ts")),
  profileDraft: await w.loadTs(join("app", "api", "admin", "members", "[uid]", "notes", "draft", "route.ts")),
};
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const notesPage = (await w.loadTs(join(TABS, "weeks", "[weekId]", "notes", "page.tsx"))).default;
const reviewPage = (await w.loadTs(join(TABS, "weeks", "[weekId]", "review", "page.tsx"))).default;
const weeksTabPage = (await w.loadTs(join(TABS, "weeks", "page.tsx"))).default;
const input = await w.loadTs(join("lib", "courses", "coursework", "input.ts"));
const words = await w.loadTs(join("lib", "courses", "weekNotes", "words.ts"));
const notesModel = await w.loadTs(join("lib", "memberNotes", "model.ts"));

const V13 = new Date("2026-11-01T09:00:00Z");
const V15 = new Date("2026-11-05T09:00:00Z");
const WRITTEN = new Date("2026-11-10T09:00:00Z");
const SUBMITTED = new Date("2026-11-11T20:00:00Z");
/** Thu 19 Nov at 10am: every group has met for week 3. */
const THURSDAY = "2026-11-19T10:00:00Z";
/** Wed 18 Nov at 10am: Group C meets at 1pm. */
const WEDNESDAY = "2026-11-18T10:00:00Z";
const params = { roundId: ROUND, programmeId: AGI, weekId: "w03" };
const PATH = (...parts) => `courseExerciseResponses/${RUN.agi}__${parts.join("__")}`;

const ANSWER = "Claudia was right that the keepers need the town. Dev Patel disagrees; write to amara.okafor@example.com.";
const SOFIA_SAID = "Amara Okafor makes the sharpest case in the group; Rahul thought so too.";
const CLAUDIA_SAID = "A strong week, Amara.";
/** Words that live only in records no note may be built from. */
const NEVER_SENT = {
  checkIn: "The diary dragged on and on for everybody",
  report: "Quietly brilliant in the debate tonight",
  review: "Grades the bell argument highest of all",
  dev: "Dev's answer rated for the team",
  zach: "Clearest answer of them all, though late",
};

/** Week 3 as the world writes it, with a written answer in a fourth part. */
function weekThree(seed) {
  const week = seed[`courseRuns/${RUN.agi}/weeks/w03`];
  const prompt = [{ type: "p", runs: [{ text: "Who should keep the lamps lit, and why?" }] }];
  return {
    ...week,
    blocks: [
      ...week.blocks,
      {
        id: "k3-p4",
        type: "part",
        title: "Your keeper's plan",
        time: "About 30 minutes",
        framing: [],
        blocks: [{ id: "k3-wa", type: "writtenAnswer", prompt, boxes: [], guidance: [], words: null, due: "dayBefore" }],
      },
    ],
  };
}

function writtenAnswer(uid, text, firstWrittenAt) {
  return {
    runId: RUN.agi,
    uid,
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "k3-wa",
    responseType: "text",
    text,
    words: text.split(/\s+/).length,
    submittedAt: null,
    reviewStatus: "unreviewed",
    firstWrittenAt,
    updatedAt: firstWrittenAt,
  };
}

function submitted(uid, at = SUBMITTED) {
  return { runId: RUN.agi, uid, weekId: "w03", weekNumber: 3, submittedAt: at, firstSubmittedAt: at, submitCount: 1, updatedAt: at };
}

function feedback(uid, byUid, byRole, text, at, on = { kind: "writtenAnswer", itemId: "k3-wa" }) {
  return { runId: RUN.agi, uid, weekId: "w03", weekNumber: 3, on, text, byUid, byRole, createdAt: new Date(at), editedAt: null, emailedAt: null, emailedByUid: "", emailDelivery: null, emailClaimedAt: null, sendId: "" };
}

function rating(uid, raterUid, raterRole, value, comment, at) {
  return { runId: RUN.agi, uid, weekId: "w03", weekNumber: 3, itemId: "k3-wa", rating: value, comment, raterUid, raterRole, programmeLabel: "AGI Strategy, Autumn 2026", createdAt: new Date(at), updatedAt: new Date(at) };
}

const ratingPath = (uid, raterUid) => `courseWorkRatings/${RUN.agi}__${uid}__w03__${raterUid}`;
const draftPath = (uid) => `courseNoteDrafts/${RUN.agi}__w03__${uid}`;

/** The world for every test here, with `over` laid on top. */
function seed(over = {}) {
  const s = facilitatorWeekSeed();
  s[`courseRuns/${RUN.agi}/weeks/w03`] = weekThree(s);
  const agree = (uid, at = V15) => {
    s[`users/${uid}`] = { ...s[`users/${uid}`], courseworkUseAgreedAt: V13, policyVersion: "terms.1+privacy.15", policyAgreedAt: at };
  };
  for (const uid of ["amara", "dev", "tariq", "sofia", "claudia"]) agree(uid);
  agree("zach", new Date("2026-11-18T12:00:00Z"));
  s["users/bea"] = { ...s["users/bea"], courseworkUseAgreedAt: V13, policyVersion: "terms.1+privacy.14", policyAgreedAt: V13 };

  s[PATH("amara", "w03", "k3-wa")] = writtenAnswer("amara", ANSWER, WRITTEN);
  s[PATH("amara", "w03", "k3-rp1")] = { ...reflection("amara", "k3-rp1", SAID.amara["k3-rp1"]), firstWrittenAt: WRITTEN };
  s[PATH("bea", "w03", "k3-wa")] = writtenAnswer("bea", "I am not sure who should pay. The reading lost me.", WRITTEN);
  s[PATH("dev", "w03", "k3-wa")] = writtenAnswer("dev", "Split it by tonnage, as the board does.", WRITTEN);
  s[`courseWeekWork/${RUN.agi}__amara__w03`] = submitted("amara");
  s[`courseWeekWork/${RUN.agi}__bea__w03`] = submitted("bea");

  s["courseFeedback/fb-sofia"] = feedback("amara", "sofia", "facilitator", SOFIA_SAID, "2026-11-13T09:00:00Z");
  s["courseFeedback/fb-claudia"] = feedback("amara", "claudia", "lead", CLAUDIA_SAID, "2026-11-17T10:00:00Z", { kind: "week" });
  s[ratingPath("amara", "claudia")] = rating("amara", "claudia", "lead", 8, "Takes a side and defends it", "2026-11-16T15:00:00Z");
  s[ratingPath("amara", "zach")] = rating("amara", "zach", "admin", 7, NEVER_SENT.zach, "2026-11-16T09:00:00Z");
  s[ratingPath("dev", "claudia")] = rating("dev", "claudia", "lead", 6, NEVER_SENT.dev, "2026-11-16T15:00:00Z");

  // What a note may never rest on, there to be left out.
  s["surveyAnswers/ci-a3__amara"] = {
    surveyId: "ci-a3",
    roundId: ROUND,
    respondent: { kind: "account", uid: "amara" },
    answers: { q_ci_most: { type: "text", text: NEVER_SENT.checkIn } },
    fills: [],
    sentAt: new Date("2026-11-12T20:30:00Z"),
    via: "link",
  };
  s[`courseSessionReports/${RUN.agi}__${A}__w03__sofia`] = {
    runId: RUN.agi,
    groupId: A,
    sessionKey: "w03",
    weekNumber: 3,
    occurrence: 1,
    writerUid: "sofia",
    answers: { how: 4, wentWell: NEVER_SENT.report, didnt: "", unclear: [], engaged: [{ uid: "amara", note: NEVER_SENT.report }], notRead: [], needsHand: [], forLead: "" },
    parts: [],
    sentAt: new Date("2026-11-12T21:00:00Z"),
    updatedAt: new Date("2026-11-12T21:00:00Z"),
  };
  s[`courseWeekReviews/${RUN.agi}__w03`] = {
    runId: RUN.agi,
    weekId: "w03",
    weekNumber: 3,
    grades: { state: "ready", at: new Date(WEDNESDAY), askedByUid: "zach", model: "claude-opus-5-5", fingerprint: "f", sent: 1, items: [{ uid: "amara", rowId: "r", questionKey: "written:k3-wa", grade: 9, hash: "h" }] },
    themes: null,
    hands: { state: "ready", at: new Date(WEDNESDAY), askedByUid: "zach", model: "claude-opus-5-5", fingerprint: "g", sent: { answers: 1, reflections: 0, reports: 0 }, labels: { "Fellow 1": "amara" }, groupLabels: {}, list: [{ uid: "amara", why: NEVER_SENT.review, answers: 1, reports: 0 }] },
    uids: ["amara"],
  };

  // Amara would like to facilitate, on the form that asks.
  s[`admissionRounds/${ROUND}`] = { ...s[`admissionRounds/${ROUND}`], asksFacilitating: true };
  const application = s[applicationPath("amara")];
  s[applicationPath("amara")] = { ...application, sent: { ...application.sent, wantsToFacilitate: true } };
  return { ...s, ...over };
}

/** Start again from the seed at Thursday 10am, with `over` beside it. */
function reset(over = {}, when = THURSDAY) {
  w.reset(seed(over));
  w.at(when);
  globalThis.__wnClaudeKey = true;
  globalThis.__wnClaudeAsked = [];
  globalThis.__wnClaudeAnswer = () => ({ ok: false, reason: "No answer set." });
}

const ok = (note) => () => ({ ok: true, value: { note }, model: "claude-opus-5-5", usage: { inputTokens: 1, outputTokens: 1 } });
const DRAFTED = "The fellow takes a clear position, and Rater 1 calls it the strongest answer. Worth asking the fellow to facilitate.";

/** One request to a real handler as `who`. */
async function ask(who, handler, method, body, { viewAs = false, ctx = params } = {}) {
  w.world.user = who === null ? null : w.sessionOf(who);
  w.world.viewAs = viewAs;
  const init = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  try {
    const response = await handler[method](new Request("https://naisi.invalid/api", init), { params: Promise.resolve(ctx) });
    return { status: response.status, body: structuredClone(response.body) };
  } finally {
    w.world.viewAs = false;
  }
}
const draft = (who, body, options) => ask(who, routes.draft, "POST", body, options);
const save = (who, uid, body, options) => ask(who, routes.save, "POST", body, { ctx: { ...params, uid }, ...options });
const discard = (who, uid, options) => ask(who, routes.discard, "DELETE", undefined, { ctx: { ...params, uid }, ...options });

/** The notes page as `who`. */
const page = (who, searchParams = {}) => w.draw(notesPage, who, params, searchParams);

/** Every element below `element` whose component is called `name`, by its props. */
function findProps(element, name, out = []) {
  if (!element || typeof element !== "object") return out;
  if (Array.isArray(element)) {
    for (const child of element) findProps(child, name, out);
    return out;
  }
  if (typeof element.type === "function" && element.type.name === name) out.push(element.props);
  if (typeof element.type === "function" && !["DraftAll", "NoteDraftCard"].includes(element.type.name)) {
    try {
      findProps(element.type(element.props), name, out);
    } catch {
      // A component that needs a hook runs only in a browser.
    }
  }
  const children = element.props?.children;
  if (children !== undefined) findProps(children, name, out);
  return out;
}

/** Everything a message must never carry: every name part, every account id, every address. */
const NEVER = [
  /Amara|Okafor|Chloe|Nguyen|Farah|Hussain|Kofi|Asante|Dev\b|Patel|Tariq|Mensah|Bea\b|Lindqvist/,
  /Claudia|Reyes|Rahul|Mehta|Sofia|Rossi|Grace|Okoye|Zach|Levin|Yusuf|Lloyd|Tom\b/,
  /\bamara\b|\bchloe\b|\bfarah\b|\bkofi\b|\bdev\b|\brahul\b|\bsofia\b|\bzach\b|\bclaudia\b/,
  /@example\.com|@/,
];
function assertClean(text, what) {
  for (const pattern of NEVER) assert.doesNotMatch(text, pattern, `${what} carries ${pattern}`);
  for (const [, note] of Object.values(NOTED)) assert.ok(!text.includes(note), `${what} carries a private note`);
  for (const [which, said] of Object.entries(NEVER_SENT)) assert.ok(!text.includes(said), `${what} carries the ${which}`);
}

// ---------------------------------------------------------------------------
// 1. The message
// ---------------------------------------------------------------------------

describe("1. what a note's draft is sent: a submitted week and the team's words on it, and nothing else", () => {
  test("Amara's submitted week, her counted work, the team's words scrubbed, and no name, address, check-in, report or grade", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    const drafted = await draft("zach", { uid: "amara" });
    assert.equal(drafted.status, 200, JSON.stringify(drafted.body));
    assert.deepEqual(drafted.body, { drafted: true });
    assert.equal(globalThis.__wnClaudeAsked.length, 1, "more than one request for one person");
    const [{ message, system }] = globalThis.__wnClaudeAsked;
    assertClean(message, "the note's message");
    // Her work: the answer and the counted reflection; never the uncounted one.
    assert.ok(message.includes("someone running the programme was right that the keepers need the town. another fellow disagrees; write to (an email address)."));
    assert.ok(message.includes(SAID.amara["k3-rp1"]), "the counted reflection was not sent");
    assert.ok(!message.includes(SAID.amara["k3-rp2"]), "a reflection with no first-written time was sent");
    // The team's words: the writer by what they are, the rater by number, names swapped out.
    assert.ok(message.includes("Feedback from their facilitator: the fellow makes the sharpest case in the group; a facilitator thought so too."));
    assert.ok(message.includes("Rater 1 (the programme's lead) rated it 8 of 10: Takes a side and defends it"));
    assert.ok(message.includes("## Feedback on the week as a whole\nFrom the programme's lead: A strong week, the fellow."));
    // Zach rated before he agreed to version 15, so his rating never goes; nor does a rating of Dev's answer.
    assert.doesNotMatch(message, /Rater 2|7 of 10/);
    // The prompt: the fairness lines, the team's words as views, and no dash.
    assert.match(system, /Never mark anybody down for their English/);
    assert.match(system, /other people's views of the work, not facts about the fellow/);
    assert.match(system, /whether they might one day facilitate a group/);
    assert.doesNotMatch(system, /[\u2013\u2014]/);
  });

  test("what the draft keeps as Built only from is what was sent, item for item", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    const kept = w.world.db.read(draftPath("amara"));
    assert.equal(kept.text, DRAFTED, "the draft is not kept as Claude wrote it, labels and all");
    assert.deepEqual(
      kept.builtFrom.map((source) => [source.kind, source.byUid ?? source.raterUid ?? null, source.rating ?? null]),
      [
        ["work", null, null],
        ["feedback", "sofia", null],
        ["rating", "claudia", 8],
        ["feedback", "claudia", null],
      ],
    );
    assert.deepEqual(kept.builtFrom[0], { kind: "work", weekNumber: 3, submittedAt: SUBMITTED, written: 1, reflections: 1, boxes: 0 });
    assert.deepEqual(kept.raters, { "Rater 1": "claudia" });
    assert.deepEqual(kept.sourceUids, ["claudia", "sofia"]);
    assert.equal(kept.askedByUid, "zach");
    assert.equal(kept.uid, "amara");
    // Nothing ticked: Claude never suggests anybody for next term.
    assert.equal(kept.suggest, undefined);
  });

  test("the builder on its own: a week not handed over, work from before the moment and a writer's words from before theirs are left out", () => {
    const week = {
      weekId: "w02",
      weekNumber: 2,
      title: "Week of Ada Lovelace's notes",
      questions: [
        { key: "reflection:p1", kind: "reflection", rowId: "p1", weekId: "w02", weekNumber: 2, weekTitle: "", text: "What did Ada get right?", boxes: [] },
        { key: "written:a1", kind: "written", rowId: "a1", weekId: "w02", weekNumber: 2, weekTitle: "", text: "Write a plan.", boxes: [] },
      ],
    };
    const from = new Date("2026-11-05T09:00:00Z");
    const at = (day) => new Date(`2026-11-${day}T09:00:00Z`);
    const answer = (questionKey, text, written, counted = true, levels = []) => ({ rowId: `r-${questionKey}`, uid: "u-ada", questionKey, weekId: "w02", kind: questionKey.split(":")[0], text, counted, agreed: true, firstWrittenAt: written, levels });
    const built = input.noteDraftInput({
      programme: "AGI Strategy",
      weeks: [{ week, submittedAt: at("12") }],
      answers: [answer("reflection:p1", "WRITTEN BEFORE THE MOMENT", at("01")), answer("written:a1", "My plan names Grace Hopper.", at("10"), true, [{ row: "Clarity", level: "Strong" }])],
      feedback: [
        { id: "f1", weekId: "w02", itemId: "a1", byUid: "u-zoe", role: "facilitator", text: "Ada should cite Zoë Ångström.", at: at("13") },
        { id: "f2", weekId: "w02", itemId: "a1", byUid: "u-late", role: "admin", text: "WRITTEN BEFORE ITS WRITER AGREED", at: at("13") },
        { id: "f3", weekId: "w09", itemId: "a1", byUid: "u-zoe", role: "facilitator", text: "ANOTHER WEEK", at: at("13") },
      ],
      ratings: [
        { weekId: "w02", itemId: "a1", raterUid: "u-lead", role: "lead", rating: 9, comment: "Ada and Grace both shine.", at: at("14") },
        { weekId: "w02", itemId: "a1", raterUid: "u-late", role: "admin", rating: 3, comment: "LATE RATER", at: at("14") },
      ],
      people: [
        { name: "Ada Lovelace", label: "the fellow" },
        { name: "Grace Hopper", label: "another fellow" },
        { name: "Zoë Ångström", label: "a facilitator" },
      ],
      from,
      writerFrom: new Map([
        ["u-zoe", from],
        ["u-lead", from],
        ["u-late", at("20")],
      ]),
    });
    assert.equal(built.sent, 1);
    for (const never of ["WRITTEN BEFORE THE MOMENT", "WRITTEN BEFORE ITS WRITER AGREED", "ANOTHER WEEK", "LATE RATER", "Ada", "Grace", "Zoë", "Ångström", "u-"]) {
      assert.ok(!built.message.includes(never), `the message carries ${never}`);
    }
    assert.ok(built.message.includes("Feedback given before, as levels on the course's rubric: Clarity: Strong"));
    assert.ok(built.message.includes("Feedback from their facilitator: the fellow should cite a facilitator."));
    assert.ok(built.message.includes("Rater 1 (the programme's lead) rated it 9 of 10: the fellow and another fellow both shine."));
    assert.deepEqual(built.raters, { "Rater 1": "u-lead" });
    assert.deepEqual(
      built.builtFrom.map((source) => source.kind),
      ["work", "levels", "feedback", "rating"],
    );
    // A week that is not handed over (not submitted) gives nothing at all.
    const none = input.noteDraftInput({ programme: "AGI Strategy", weeks: [], answers: [answer("written:a1", "x", at("10"))], feedback: [], ratings: [], people: [], from, writerFrom: new Map() });
    assert.equal(none.sent, 0);
    assert.deepEqual(none.builtFrom, []);
    // Nobody with no moment is sent anything.
    const noMoment = input.noteDraftInput({ programme: "P", weeks: [{ week, submittedAt: at("12") }], answers: [answer("written:a1", "x", at("10"))], feedback: [], ratings: [], people: [], from: null, writerFrom: new Map() });
    assert.equal(noMoment.sent, 0);
  });

  test("names come back on the site, and a label Claude was never sent is a slip", () => {
    assert.equal(input.noteWithRaters("Rater 1 and Rater 2 agree.", { "Rater 1": "Claudia" }), "Claudia and a rater agree.");
    assert.deepEqual(input.noteLabelSlips("The fellow and Rater 1, and Rater 3 and Fellow 2 in Group 4.", { "Rater 1": "u" }).sort(), ["Fellow 2", "Group 4", "Rater 3"]);
    assert.deepEqual(input.noteLabelSlips("The fellow writes well; another fellow agrees.", {}), []);
  });

  test("the profile's Draft a note with Claude sends through the same builder: the submitted week and the team's words", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok("The fellow writes with care; Rater 1 agrees.");
    const answer = await ask("zach", routes.profileDraft, "POST", { runId: RUN.agi }, { ctx: { uid: "amara" } });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.text, "Amara Okafor writes with care; Claudia agrees.");
    const [{ message }] = globalThis.__wnClaudeAsked;
    assertClean(message, "the profile draft's message");
    assert.ok(message.includes("Rater 1 (the programme's lead) rated it 8 of 10: Takes a side and defends it"));
    assert.ok(message.includes("Feedback from their facilitator:"));
    // Nothing kept: the profile's draft is returned, never stored.
    assert.equal(w.world.db.paths().filter((path) => path.startsWith("courseNoteDrafts/")).length, 0);
    // Dev never submitted, so there is nothing to draft from.
    const dev = await ask("zach", routes.profileDraft, "POST", { runId: RUN.agi }, { ctx: { uid: "dev" } });
    assert.equal(dev.status, 409);
    assert.match(dev.body.error, /No submission, no note/);
  });
});

// ---------------------------------------------------------------------------
// 2. The draft press
// ---------------------------------------------------------------------------

describe("2. drafting a person's note: an admin's, once every group has met, from a submitted week", () => {
  test("everybody but an admin is refused on the session before anything is read, and a view-as session first of all", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    for (const who of ["claudia", "lloyd", "rahul", "sofia", "amara", "tess"]) {
      const before = w.everything();
      const refused = await draft(who, { uid: "amara" });
      assert.equal(refused.status, 403, `${who} was let through`);
      assert.equal(w.everything(), before, `${who}'s press wrote something`);
    }
    assert.equal((await draft(null, { uid: "amara" })).status, 401);
    const viewAs = await draft("zach", { uid: "amara" }, { viewAs: true });
    assert.ok(viewAs.status >= 400, "a view-as session drafted a note");
    assert.equal(globalThis.__wnClaudeAsked.length, 0);
    for (const who of ["claudia", "rahul"]) {
      assert.equal((await save(who, "amara", { text: "x", audience: "leads" })).status, 403, `${who} saved a note`);
      assert.equal((await discard(who, "amara")).status, 403, `${who} discarded a draft`);
    }
  });

  test("nobody is shown, drafts or keeps a note about themselves: an admin holding a place is left off the page, and refused before anything is read", async () => {
    // Zach, an admin, holds a place too, submitted week 3, and a draft about him is there.
    const application = seed()[applicationPath("amara")];
    const decision = seed()[decisionPath("amara")];
    reset({
      [applicationPath("zach")]: { ...application, uid: "zach", email: "zach@example.com", displayName: "Zach Levin" },
      [decisionPath("zach")]: { ...decision, uid: "zach" },
      [PATH("zach", "w03", "k3-wa")]: writtenAnswer("zach", "An admin's own answer.", WRITTEN),
      [`courseWeekWork/${RUN.agi}__zach__w03`]: submitted("zach"),
      [draftPath("zach")]: { runId: RUN.agi, weekId: "w03", weekNumber: 3, uid: "zach", text: "The fellow.", builtFrom: [], raters: {}, sourceUids: [], fingerprint: "f", model: "m", at: new Date(WEDNESDAY), askedByUid: "zach" },
    });
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    // He holds a place: the week's review, which lists everybody holding one, names him.
    const review = await w.draw(reviewPage, "zach", params);
    assert.equal(findProps(review.element, "PangramWeek")[0]?.names?.zach, "Zach Levin", "the seed does not give Zach a place");
    const drawn = await page("zach");
    assert.doesNotMatch(drawn.text, /Zach Levin/, "an admin is shown a note about themselves");
    assert.match(drawn.text, /4 people · 0 drafts/, "an admin is counted among the people on their own page");
    assert.ok(!findProps(drawn.element, "DraftAll").flatMap((props) => props.plan).some((person) => person.uid === "zach"), "the press drafts a note about the admin pressing it");
    for (const [what, asked] of [
      ["draft", () => draft("zach", { uid: "zach" })],
      ["save", () => save("zach", "zach", { text: "About myself.", audience: "admins", suggest: [] })],
      ["discard", () => discard("zach", "zach")],
    ]) {
      const before = w.everything();
      const refused = await asked();
      assert.equal(refused.status, 403, what);
      assert.equal(refused.body.error, "Notes about you are never shown to you, admin or not.", what);
      assert.equal(w.everything(), before, `${what} about yourself wrote something`);
    }
    assert.equal(globalThis.__wnClaudeAsked.length, 0);
  });

  test("not before every group has met, not with no key, and only for somebody holding a place", async () => {
    reset({}, WEDNESDAY);
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    const early = await draft("zach", { uid: "amara" });
    assert.equal(early.status, 409);
    assert.equal(early.body.error, "This week’s notes can be drafted once every group has met: 3 of 4 have.");
    reset();
    globalThis.__wnClaudeKey = false;
    const noKey = await draft("zach", { uid: "amara" });
    assert.equal(noKey.status, 409);
    assert.equal(noKey.body.error, "Claude isn’t set up on this site yet.");
    reset();
    // Rahul holds a place and facilitates: never his own work. Chloe holds no place on the form.
    for (const uid of ["rahul", "sofia", "chloe", "nobody-at-all"]) assert.equal((await draft("zach", { uid })).status, 404, uid);
    assert.equal((await draft("zach", {})).status, 400);
    assert.equal(globalThis.__wnClaudeAsked.length, 0);
  });

  test("no submission, no note: Dev never submitted, Tariq wrote nothing, and a week reopened since gives nothing", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    for (const uid of ["dev", "tariq"]) {
      const refused = await draft("zach", { uid });
      assert.equal(refused.status, 409, uid);
      assert.equal(refused.body.error, "No submission, no note: their week isn’t submitted.");
    }
    w.world.db.poke(`courseWeekWork/${RUN.agi}__amara__w03`, { submittedAt: null, reopenedAt: new Date("2026-11-13T10:00:00Z"), reopenedByUid: "sofia" });
    const reopened = await draft("zach", { uid: "amara" });
    assert.equal(reopened.status, 409);
    assert.equal(globalThis.__wnClaudeAsked.length, 0);
  });

  test("Bea submitted but never agreed to version 15: nothing of hers may go", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    const refused = await draft("zach", { uid: "bea" });
    assert.equal(refused.status, 409);
    assert.match(refused.body.error, /only work written after they agreed to version 15/);
    assert.equal(globalThis.__wnClaudeAsked.length, 0);
  });

  test("a draft naming a label it was never sent is refused and nothing is kept", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok("The fellow and Rater 2 agree, as Fellow 4 does.");
    const slipped = await draft("zach", { uid: "amara" });
    assert.equal(slipped.status, 502);
    assert.equal(slipped.body.error, words.WEEK_NOTES_WORDS.slip);
    assert.equal(w.world.db.read(draftPath("amara")), undefined);
  });

  test("a second press leaves a draft alone; Draft again replaces it; nothing replaces a saved note", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    globalThis.__wnClaudeAnswer = ok("The fellow, drafted again.");
    const second = await draft("zach", { uid: "amara" });
    assert.equal(second.status, 409);
    assert.equal(second.body.error, words.WEEK_NOTES_WORDS.draftedAlready);
    assert.equal(w.world.db.read(draftPath("amara")).text, DRAFTED);
    const cardOf = async () => findProps((await page("zach")).element, "NoteDraftCard").map((props) => props.card)[0];
    const before = await cardOf();
    w.at("2026-11-19T11:30:00Z");
    const again = await draft("zach", { uid: "amara", again: true });
    assert.equal(again.status, 200);
    assert.equal(w.world.db.read(draftPath("amara")).text, "The fellow, drafted again.");
    // A new draft is a new card, so the box never keeps the older draft's words.
    const after = await cardOf();
    assert.notEqual(after.version, before.version);
    assert.equal(after.text, "Amara Okafor, drafted again.");
    assert.equal((await save("zach", "amara", { text: "Amara argues well.", audience: "leads", suggest: [] })).status, 200);
    const afterSave = await draft("zach", { uid: "amara", again: true });
    assert.equal(afterSave.status, 409);
    assert.equal(afterSave.body.error, words.WEEK_NOTES_WORDS.keptAlready);
    assert.equal(w.world.db.read(draftPath("amara")), undefined, "a draft came back beside the saved note");
  });
});

// ---------------------------------------------------------------------------
// 3. The page
// ---------------------------------------------------------------------------

describe("3. the page: an admin's drafts and counts; the lead's saved notes alone", () => {
  test("an admin reads the counts and what a press would draft, before any press; nothing is sent or written", async () => {
    reset();
    const drawn = await page("zach");
    assert.equal(drawn.to, null);
    assert.equal(drawn.wrote, false, "drawing the page wrote something");
    assert.equal(globalThis.__wnClaudeAsked.length, 0, "drawing the page asked Claude");
    assert.match(drawn.text, /Week 3 notes Admins draft and save Leads read them for their programme/);
    assert.match(drawn.text, /What Claude may use What they submitted as written work Feedback people gave The team’s ratings and comments Not their surveys or check-ins Not facilitators’ session reports Not Claude’s own grades/);
    assert.match(drawn.text, /4 people · 0 drafts · 2 submitted nothing this week, so there’s no note for them · 0 saved/);
    assert.match(drawn.text, /1 submitted, but nothing of theirs can be sent: only work written after they agreed to version 15 of the privacy policy is\./);
    assert.match(drawn.text, /Sends one request to Anthropic, for the 1 person who submitted and has no draft or note from this week/);
    const [press] = findProps(drawn.element, "DraftAll");
    assert.deepEqual(press.plan, [{ uid: "amara", name: "Amara Okafor" }]);
    assert.match(drawn.text, /Nothing goes on their profile until an admin saves it\. A saved note says it was drafted by Claude from week 3 and who checked it\./);
  });

  test("before every group has met the page says so and offers no press; before the first session it opens on nothing", async () => {
    reset({}, WEDNESDAY);
    const drawn = await page("zach");
    assert.match(drawn.text, /You can draft this week’s notes once every group has met: 3 of 4 groups have met\./);
    assert.equal(findProps(drawn.element, "DraftAll").length, 0);
    reset({}, "2026-11-11T10:00:00Z");
    const early = await page("zach");
    assert.match(early.text, /Week 3’s notes open once its first session has started\./);
    assert.doesNotMatch(early.text, /people ·|Draft this week’s notes/);
  });

  test("a week that asks for no written work says so, and offers no press; its draft route refuses before anything is sent", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    const drawn = await w.draw(notesPage, "zach", { ...params, weekId: "w01" });
    assert.match(drawn.text, /This week asks for no written work, so there are no notes to draft from it\./);
    assert.equal(findProps(drawn.element, "DraftAll").length, 0);
    const refused = await draft("zach", { uid: "amara" }, { ctx: { ...params, weekId: "w01" } });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.error, words.WEEK_NOTES_WORDS.noWork);
    assert.equal(globalThis.__wnClaudeAsked.length, 0);
  });

  test("a draft's card: what it was built from, names back in the box, the boxes unticked and the facilitate fact beside it", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    const drawn = await page("zach");
    const [card] = findProps(drawn.element, "NoteDraftCard").map((props) => props.card);
    assert.equal(card.name, "Amara Okafor");
    assert.equal(card.group, "Group A");
    assert.deepEqual(card.builtFrom, [
      "Week 3 answer and 1 reflection, submitted Wed 11 Nov",
      "Sofia’s written feedback",
      "Claudia: 8, “Takes a side and defends it”",
      "Claudia’s written feedback",
    ]);
    assert.equal(card.text, "Amara Okafor takes a clear position, and Claudia calls it the strongest answer. Worth asking Amara Okafor to facilitate.");
    assert.equal(card.offered, true);
    assert.equal(card.stale, null);
    assert.equal(card.savable, true);
    assert.match(card.drafted, /^Drafted by Claude, Thu 19 Nov, 10am\.$/);
    // The boxes start unticked and the card is handed nothing that could tick one.
    assert.equal("suggest" in card, false);
    assert.ok(!/checked=""/.test(drawn.html.slice(drawn.html.indexOf("Suggest for next term"), drawn.html.indexOf("Who reads it"))), "a suggestion box is ticked");
    assert.match(drawn.text, /4 people · 1 draft · 2 submitted nothing this week/);
    assert.equal(findProps(drawn.element, "DraftAll").length, 0, "a press with nobody left to draft");
    // Never a check-in, a report or a review grade on the page either.
    for (const said of Object.values(NEVER_SENT)) assert.ok(!drawn.text.includes(said), `the page shows ${said}`);
  });

  test("a rating given after the draft is said on the card, with when", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    w.at("2026-11-19T15:00:00Z");
    w.world.db.poke(ratingPath("amara", "claudia"), { rating: 9, updatedAt: new Date("2026-11-19T14:00:00Z") });
    const drawn = await page("zach");
    const [card] = findProps(drawn.element, "NoteDraftCard").map((props) => props.card);
    assert.equal(card.stale, "A rating came in after this draft, the newest Thu 19 Nov, 2pm. Draft again to include it.");
  });

  test("the filters: only drafts, only suggestions", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    const drafts = await page("zach", { only: "drafts" });
    assert.equal(findProps(drafts.element, "NoteDraftCard").length, 1);
    const suggestions = await page("zach", { only: "suggestions" });
    assert.equal(findProps(suggestions.element, "NoteDraftCard").length, 0);
    assert.match(suggestions.text, /Nothing to show here yet\./);
    await save("zach", "amara", { text: "Amara argues well.", audience: "leads", suggest: ["facilitating"] });
    const saved = await page("zach", { only: "suggestions" });
    assert.match(saved.text, /Amara Okafor Group A Saved to their notes by Zach/);
    assert.match(saved.text, /Suggested for next term: facilitating\./);
  });

  test("the programme's lead reads the saved notes kept for leads, and never a draft or a count", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    const before = await page("claudia");
    assert.match(before.text, /Week 3 notes/);
    assert.match(before.text, /No notes from this week are kept for the programme’s leads yet\./);
    // Nothing of a draft: not its words, its card, its presses or how many there are.
    for (const never of ["takes a clear position", "Draft note", "Save to their notes", "Discard", "Draft again", "1 draft", "people ·", "submitted nothing", "Draft this week’s notes", "Offered to facilitate"]) {
      assert.ok(!before.text.includes(never), `the lead reads ${never}`);
    }
    assert.equal(findProps(before.element, "NoteDraftCard").length, 0);
    await save("zach", "amara", { text: "Amara argues well and should facilitate.", audience: "leads", suggest: ["facilitating"] });
    const after = await page("claudia");
    assert.match(after.text, /Amara Okafor Group A Saved to their notes by Zach/);
    assert.match(after.text, /Amara argues well and should facilitate\./);
    assert.match(after.text, /Drafted by Claude from week 3\. Saved by Zach\./);
    assert.ok(!after.text.includes("Offered to facilitate"), "the lead is shown the application's answer");
    // Kept to admins: the lead reads nothing of it.
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    await save("zach", "amara", { text: "For admins alone.", audience: "admins", suggest: [] });
    const adminsOnly = await page("claudia");
    assert.ok(!adminsOnly.text.includes("For admins alone."), "the lead reads a note kept to admins");
    assert.match(adminsOnly.text, /No notes from this week are kept for the programme’s leads yet\./);
  });

  test("a reviewer, a facilitator, a fellow and an outsider read nothing of it", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    await save("zach", "amara", { text: "Saved for the leads.", audience: "leads", suggest: [] });
    for (const who of ["lloyd", "rahul", "sofia", "amara", "chloe", "tess"]) {
      const drawn = await page(who);
      assert.ok(!drawn.text.includes("Saved for the leads."), `${who} reads a note`);
      assert.doesNotMatch(drawn.text, /Week 3 notes Admins draft/, `${who} reached the notes`);
    }
  });

  test("Review and Notes about people head both pages, each marking itself as the one shown", async () => {
    reset();
    const notes = await page("zach");
    assert.ok(notes.html.includes(`/weeks/w03/review"`), "the notes page has no way to the review");
    assert.match(notes.html, /<a href="[^"]*\/weeks\/w03\/notes"[^>]*aria-current="page"/);
    const review = await w.draw(reviewPage, "zach", params);
    assert.ok(review.html.includes(`/weeks/w03/notes"`), "the review has no way to the notes");
    assert.match(review.html, /<a href="[^"]*\/weeks\/w03\/review"[^>]*aria-current="page"/);
    // The lead's notes page offers the review too, which tells the lead it is for admins.
    const lead = await page("claudia");
    assert.ok(lead.html.includes(`/weeks/w03/review"`));
  });

  test("the Weeks tab offers Notes beside Review, to an admin and to the lead", async () => {
    reset();
    const admin = await w.draw(weeksTabPage, "zach", { roundId: ROUND, programmeId: AGI });
    assert.ok(admin.html.includes(`/weeks/w03/notes"`), "no Notes link for week 3");
    assert.ok(!admin.html.includes(`/weeks/w04/notes"`), "a week not yet met offers its notes");
    const lead = await w.draw(weeksTabPage, "claudia", { roundId: ROUND, programmeId: AGI });
    assert.ok(lead.html.includes(`/weeks/w03/notes"`), "the lead is not offered the week's notes");
  });
});

// ---------------------------------------------------------------------------
// 4. Save and Discard
// ---------------------------------------------------------------------------

describe("4. save keeps the admin's words as an end-of-week note; discard drops the draft", () => {
  test("save: one note, the admin's words, drafted by Claude, its week and what it was built from; the draft gone", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    const kept = await save("zach", "amara", { text: "  Amara takes a clear position.  ", audience: "leads", suggest: ["incubator", "facilitating"] });
    assert.equal(kept.status, 200, JSON.stringify(kept.body));
    assert.deepEqual(Object.keys(kept.body), ["id"]);
    const note = w.world.db.read(`memberNotes/${kept.body.id}`);
    assert.equal(note.uid, "amara");
    assert.equal(note.text, "Amara takes a clear position.");
    assert.equal(note.authorUid, "zach");
    assert.equal(note.draftedByClaude, true);
    assert.equal(note.kind, "weekly");
    assert.equal(note.weekId, "w03");
    assert.equal(note.weekNumber, 3);
    assert.equal(note.runId, RUN.agi);
    assert.equal(note.audience, "leads");
    assert.deepEqual(note.suggest, ["facilitating", "incubator"]);
    assert.deepEqual(note.sourceUids, ["claudia", "sofia"]);
    assert.deepEqual(
      notesModel.noteSourcesOf(note.builtFrom).map((source) => source.kind),
      ["work", "feedback", "rating", "feedback"],
    );
    assert.equal(w.world.db.read(draftPath("amara")), undefined, "the draft outlived its save");
    // Once, and only once.
    const again = await save("zach", "amara", { text: "Twice.", audience: "admins", suggest: [] });
    assert.equal(again.status, 404);
    assert.equal(w.world.db.paths().filter((path) => path.startsWith("memberNotes/")).length, 1);
  });

  test("save is refused with no words, nobody chosen to read it, a suggestion that is not one, or a week reopened since", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    assert.equal((await save("zach", "amara", { text: "", audience: "leads" })).status, 400);
    assert.equal((await save("zach", "amara", { text: "Words.", audience: "everybody" })).status, 400);
    assert.equal((await save("zach", "amara", { text: "Words.", audience: "leads", suggest: ["mentoring"] })).status, 400);
    w.world.db.poke(`courseWeekWork/${RUN.agi}__amara__w03`, { submittedAt: null, reopenedAt: new Date("2026-11-19T09:00:00Z"), reopenedByUid: "sofia" });
    const reopened = await save("zach", "amara", { text: "Words.", audience: "leads", suggest: [] });
    assert.equal(reopened.status, 409);
    assert.equal(reopened.body.error, words.WEEK_NOTES_WORDS.notSubmittedNow);
    assert.ok(w.world.db.read(draftPath("amara")), "a refused save took the draft");
    const drawn = await page("zach");
    const [card] = findProps(drawn.element, "NoteDraftCard").map((props) => props.card);
    assert.equal(card.stale, words.WEEK_NOTES_WORDS.reopened);
    assert.equal(card.savable, false);
  });

  test("discard drops the draft and nothing else; a draft that is not there is answered as gone", async () => {
    reset();
    globalThis.__wnClaudeAnswer = ok(DRAFTED);
    await draft("zach", { uid: "amara" });
    const dropped = await discard("zach", "amara");
    assert.equal(dropped.status, 200);
    assert.deepEqual(dropped.body, { discarded: true });
    assert.equal(w.world.db.read(draftPath("amara")), undefined);
    assert.equal(w.world.db.paths().filter((path) => path.startsWith("memberNotes/")).length, 0);
    assert.equal((await discard("zach", "amara")).status, 404);
  });
});

// ---------------------------------------------------------------------------
// 5. Deletion
// ---------------------------------------------------------------------------

describe("5. deleting an account: its drafts go, and its ratings and feedback leave what others' notes were built from", () => {
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

  test("Amara's drafts go with her; Claudia's rating and feedback leave Amara's draft and saved note, which stay", async () => {
    const { deleteAccountCascade } = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
    const source = (kind, uid, extra = {}) =>
      kind === "rating"
        ? { kind, weekNumber: 3, raterUid: uid, role: "lead", label: "Rater 1", rating: 8, comment: "Takes a side", at: new Date(WEDNESDAY), ...extra }
        : { kind, weekNumber: 3, byUid: uid, role: "facilitator", on: "writtenAnswer", at: new Date(WEDNESDAY), ...extra };
    const builtFrom = [{ kind: "work", weekNumber: 3, submittedAt: SUBMITTED, written: 1, reflections: 0, boxes: 0 }, source("feedback", "sofia"), source("rating", "claudia")];
    const db = makeCascadeDb({
      [`courseNoteDrafts/${RUN.agi}__w03__amara`]: { runId: RUN.agi, weekId: "w03", uid: "amara", text: "The fellow; Rater 1.", builtFrom, raters: { "Rater 1": "claudia" }, sourceUids: ["claudia", "sofia"] },
      [`courseNoteDrafts/${RUN.agi}__w04__amara`]: { runId: RUN.agi, weekId: "w04", uid: "amara", text: "Week 4.", builtFrom: [], raters: {}, sourceUids: [] },
      [`courseNoteDrafts/${RUN.agi}__w03__dev`]: { runId: RUN.agi, weekId: "w03", uid: "dev", text: "Dev's.", builtFrom, raters: { "Rater 1": "claudia" }, sourceUids: ["claudia", "sofia"] },
      "memberNotes/kept": { uid: "dev", text: "Saved.", authorUid: "zach", kind: "weekly", runId: RUN.agi, weekId: "w03", weekNumber: 3, builtFrom, sourceUids: ["claudia", "sofia"] },
      "users/amara": { role: "member" },
      "users/claudia": { role: "committee" },
    });
    const amara = await deleteAccountCascade(auth, db, "amara");
    assert.equal(amara.courseNoteDraftsDeleted, 2);
    assert.equal(db.read(`courseNoteDrafts/${RUN.agi}__w03__amara`), undefined);
    assert.equal(db.read(`courseNoteDrafts/${RUN.agi}__w04__amara`), undefined);
    assert.ok(db.read(`courseNoteDrafts/${RUN.agi}__w03__dev`), "somebody else's draft went with Amara");

    const claudia = await deleteAccountCascade(auth, db, "claudia");
    assert.equal(claudia.noteSourcesCleared, 2);
    for (const path of [`courseNoteDrafts/${RUN.agi}__w03__dev`, "memberNotes/kept"]) {
      const kept = db.read(path);
      assert.ok(kept, `${path} went with Claudia`);
      assert.deepEqual(kept.builtFrom.map((each) => each.raterUid ?? each.byUid ?? each.kind), ["work", "sofia"], `${path} still holds Claudia's rating`);
      assert.deepEqual(kept.sourceUids, ["sofia"]);
    }
    assert.deepEqual(db.read(`courseNoteDrafts/${RUN.agi}__w03__dev`).raters, {});
    assert.equal(db.read("memberNotes/kept").text, "Saved.", "the note's own words changed");
  });

  test("the run's destroy drains the drafts, keyed by the run, and the dialog names them", () => {
    const code = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "lib", "firestore", "courseDeletion.ts"), "utf8");
    assert.match(code, /key: "noteDrafts",[\s\S]*?drainQuery\(db, COURSE_NOTE_DRAFTS_COLLECTION, byRunId\(COURSE_NOTE_DRAFTS_COLLECTION\), budget\)/);
    assert.match(code, /countAgg\(db\.collection\(COURSE_NOTE_DRAFTS_COLLECTION\)\.where\("runId", "==", runId\)\)/);
    const dialog = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /noteDrafts: \{\s*label: "Claude’s drafts of notes about people",\s*fate: "destroyed",/);
  });
});

// ---------------------------------------------------------------------------
// 6. The house's words and the page's shape
// ---------------------------------------------------------------------------

describe("6. the words, the stylesheet and the imports of this piece", () => {
  const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
  const FILES = [
    "lib/courses/weekNotes/words.ts",
    "lib/courses/weekNotes/door.ts",
    "lib/courses/weekNotes/gather.ts",
    "lib/courses/weekNotes/store.ts",
    "lib/courses/weekNotes/view.ts",
    "lib/courses/weeksTab/tabs.ts",
    "lib/firestore/courseNoteDrafts.ts",
    "features/courses/weekNotes/WeekNotesScreen.tsx",
    "features/courses/weekNotes/DraftAll.tsx",
    "features/courses/weekNotes/NoteDraftCard.tsx",
    "features/courses/weekNotes/BuiltFrom.tsx",
    "features/courses/weekNotes/weekNotes.module.css",
  ];

  test("no dash of either kind, and no word the house does not use, in any file of it", () => {
    for (const file of FILES) {
      const source = readFileSync(join(SRC, file), "utf8");
      assert.doesNotMatch(source, /[\u2013\u2014]/, `${file} carries a dash`);
      assert.doesNotMatch(source, /\bcollate\b/i, file);
    }
  });

  test("the words name nobody by a pronoun, and the lead's never say grade, mark or score", () => {
    const said = JSON.stringify(words.WEEK_NOTES_WORDS, (_, value) => (typeof value === "function" ? value(3, 2, 1, 0) : value));
    assert.doesNotMatch(said, /\b(?:he|she|him|her|his|hers)\b/i);
    const lead = [words.WEEK_NOTES_WORDS.leadSubline, words.WEEK_NOTES_WORDS.leadEmpty, words.WEEK_NOTES_WORDS.leadLine].join(" ");
    assert.doesNotMatch(lead, /\b(?:mark|grade|score)\b/i);
  });

  test("the stylesheet ends with its phone block, and every press and link is at least 44px", () => {
    const css = readFileSync(join(SRC, "features/courses/weekNotes/weekNotes.module.css"), "utf8");
    assert.match(css, /@media \(max-width: 48rem\) \{[^]*\}\s*$/);
    for (const rule of [".filter", ".inlineLink", ".crumbLink"]) {
      const block = new RegExp(`\\${rule} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
      assert.match(block, /min-height: 44px;/, `${rule} is under 44px`);
    }
  });

  test("what a note is built from imports nothing of surveys, check-ins, session reports or the week review", () => {
    for (const file of ["lib/courses/weekNotes/gather.ts", "lib/courses/coursework/input.ts", "lib/memberNotes/draft.ts", "lib/courses/weekNotes/store.ts"]) {
      const source = readFileSync(join(SRC, file), "utf8");
      const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
      for (const specifier of imports) {
        assert.doesNotMatch(specifier, /surveys|checkIns|sessionReports|SessionReport|weekReview|courseWeekReviews|reviewPool/, `${file} imports ${specifier}`);
      }
    }
  });

  test("the profile's draft and the end-of-week draft build their message with one function", () => {
    for (const file of ["lib/memberNotes/draft.ts", "lib/courses/weekNotes/store.ts"]) {
      const source = readFileSync(join(SRC, file), "utf8");
      assert.match(source, /noteDraftInput\(\{/, `${file} builds its own message`);
      assert.match(source, /gather(?:Person|Week)Notes?\(db, \{/, `${file} reads its own sources`);
    }
  });
});
