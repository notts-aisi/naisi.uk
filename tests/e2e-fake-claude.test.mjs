/**
 * THE FAKE CLAUDE'S CANNED ANSWERS PASS EACH CALLER'S OWN CHECKER.
 *
 * `scripts/e2e/lib/fakeClaude.mjs` stands in for Anthropic in local
 * end-to-end runs. A canned answer that a caller's checker drops is a browser
 * run that fails with nothing pointing at why, so this suite drives every
 * canned caller's REAL ask (its system prompt, its schema, its checker),
 * through the real door (`src/lib/ai/claude.ts`) and the real SDK over HTTP,
 * against the fake on a free loopback port, and holds what comes back. A
 * change to a caller's prompt, schema or checker that the fake no longer
 * fits fails here.
 *
 * Also held: every entry in `CANNED` has a case here (a new canned caller
 * without one fails), a request the fake does not recognise comes back as
 * the door's calm reason, and a key that is not the fake's is refused.
 */
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { CANNED, FAKE_CLAUDE_KEY, FAKE_CLAUDE_WORDS, startFakeClaude } from "../scripts/e2e/lib/fakeClaude.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const fake = await startFakeClaude({ port: 0, log: () => {} });
process.env.ANTHROPIC_API_KEY = FAKE_CLAUDE_KEY;
process.env.ANTHROPIC_BASE_URL = fake.url;
after(() => fake.close());

const { loadTs } = createLoader({ stubs: [["server-only", "export {};"]] });
const door = await loadTs("lib/ai/claude.ts");
const coursework = await loadTs("lib/courses/coursework/claude.ts");
const courseworkInput = await loadTs("lib/courses/coursework/input.ts");
const weekReview = await loadTs("lib/courses/weekReview/claude.ts");
const weekReviewInput = await loadTs("lib/courses/weekReview/input.ts");

/** The callers this suite drives, by the fake's name for them. */
const DRIVEN = new Set();

/** The requests the fake has kept since `mark`. */
function since(mark) {
  return fake.requests.slice(mark);
}

before(() => {
  assert.equal(door.claudeConfigured(), true);
});

test("a note's draft: the fake's words come back, with no label the note was never sent", async () => {
  DRIVEN.add("coursework-note-draft");
  const mark = fake.requests.length;
  const answer = await coursework.askForNoteDraft("# The programme: AGI Strategy\n\n## Week 3\n\nQ1. Written answer: What do you think?\n\nThe fellow wrote: something.");
  assert.equal(answer.ok, true, answer.reason);
  assert.equal(answer.note, FAKE_CLAUDE_WORDS.note);
  assert.equal(answer.model, door.CLAUDE_MODEL);
  assert.deepEqual(courseworkInput.noteLabelSlips(answer.note, {}), [], "the fake's note names a label no note is sent");
  assert.match(courseworkInput.noteWithName(answer.note, "Ada"), /^Ada reads each week\b/);
  assert.deepEqual(since(mark).map((r) => r.caller), ["coursework-note-draft"]);
});

/** A small week: two fellows in two groups, a written answer each, one reflection, one check-in and one report. */
function weekSources() {
  const agreed = new Date("2026-11-01T09:00:00Z");
  const wrote = new Date("2026-11-05T09:00:00Z");
  return {
    programme: "AGI Strategy",
    weekNumber: 3,
    weekTitle: "Two keepers' views",
    questions: [
      { key: "q1", kind: "written", text: "Which keeper's view do you find stronger, and why?" },
      { key: "q2", kind: "reflection", text: "What would change your mind?" },
    ],
    parts: [
      { id: "part-1", title: "Start with what you think" },
      { id: "part-2", title: "Two keepers' views" },
    ],
    groupIds: ["group-a", "group-b"],
    fellows: new Set(["uid-ada", "uid-ben"]),
    groupOf: new Map([
      ["uid-ada", "group-a"],
      ["uid-ben", "group-b"],
    ]),
    momentOf: new Map([
      ["uid-ada", agreed],
      ["uid-ben", agreed],
    ]),
    work: [
      { rowId: "row-1", uid: "uid-ada", kind: "written", questionKey: "q1", text: "The first keeper, because the second assumes too much.", counted: true, firstWrittenAt: wrote },
      { rowId: "row-2", uid: "uid-ben", kind: "written", questionKey: "q1", text: "Neither convinces me yet.", counted: true, firstWrittenAt: wrote },
      { rowId: "row-3", uid: "uid-ada", kind: "reflection", questionKey: "q2", text: "Evidence that the second keeper's assumption holds.", counted: true, firstWrittenAt: wrote },
    ],
    checkIns: [
      { groupId: "group-a", useful: 4, confident: 3, reading: "Most", unclear: ["part-2"], most: "Arguing it out in pairs", better: "More time on the second view" },
    ],
    checkInsLeftOut: 0,
    reports: [
      {
        groupId: "group-a",
        occurrence: 1,
        at: new Date("2026-11-10T18:00:00Z"),
        how: 4,
        wentWell: "A lively discussion.",
        didnt: "We ran out of time.",
        unclear: [],
        forLead: "",
        engaged: [{ uid: "uid-ada", note: "" }],
        notRead: [],
        needsHand: [],
      },
    ],
    reportsLeftOut: 0,
    people: [
      { uid: "uid-ada", name: "Ada Lovelace", role: "fellow" },
      { uid: "uid-ben", name: "Ben Okafor", role: "fellow" },
    ],
  };
}

test("the week review's three asks: each canned answer passes its checker whole", async () => {
  DRIVEN.add("week-review-grades");
  DRIVEN.add("week-review-themes");
  DRIVEN.add("week-review-hands");
  const inputs = weekReviewInput.reviewInputs(weekSources());
  assert.ok(inputs.grades.items.size > 0 && inputs.themes.answers.size > 0 && Object.keys(inputs.hands.labels).length > 0, "the week sends nothing to ask about");
  const mark = fake.requests.length;

  const grades = await weekReview.askForGrades(inputs.grades);
  assert.equal(grades.ok, true, grades.reason);
  assert.equal(grades.value.length, inputs.grades.items.size, "a written answer sent was not graded, or a grade was dropped");
  for (const grade of grades.value) assert.equal(grade.grade, FAKE_CLAUDE_WORDS.grade);

  const themes = await weekReview.askForThemes(inputs.themes);
  assert.equal(themes.ok, true, themes.reason);
  assert.equal(themes.value.length, 1, "the fake's theme was dropped by the checker");
  const [theme] = themes.value;
  assert.equal(theme.title, FAKE_CLAUDE_WORDS.themeTitle);
  assert.equal(theme.detail, FAKE_CLAUDE_WORDS.themeDetail, "the theme's line was blanked as a quotation");
  assert.equal(theme.partId, "part-1");
  assert.equal(theme.answers.length, inputs.themes.answers.size, "the theme does not rest on every answer sent");
  assert.equal(theme.checkIns, 0);
  assert.equal(theme.reports, inputs.themes.reports.size);
  assert.deepEqual(theme.groupIds, ["group-a", "group-b"]);

  const hands = await weekReview.askForHands(inputs.hands);
  assert.equal(hands.ok, true, hands.reason);
  assert.equal(hands.value.length, 1, "the fake's hand was dropped by the checker");
  assert.equal(hands.value[0].uid, inputs.hands.labels["Fellow 1"]);
  assert.equal(hands.value[0].why, FAKE_CLAUDE_WORDS.handWhy);
  assert.ok(hands.value[0].answers > 0, "the hand rests on none of the fellow's own answers");

  const asked = since(mark);
  assert.deepEqual(asked.map((r) => r.caller), ["week-review-grades", "week-review-themes", "week-review-hands"]);
  assert.deepEqual(
    asked.map((r) => r.message),
    [inputs.grades.message, inputs.themes.message, inputs.hands.message],
    "the fake did not keep the words that were sent",
  );
});

test("a week with nothing to cite: the review's asks come back empty, never with an id that was not sent", async () => {
  const sources = { ...weekSources(), work: [], checkIns: [], reports: [] };
  const inputs = weekReviewInput.reviewInputs(sources);
  for (const [ask, input] of [
    [weekReview.askForGrades, inputs.grades],
    [weekReview.askForThemes, inputs.themes],
    [weekReview.askForHands, inputs.hands],
  ]) {
    const answer = await ask(input);
    assert.equal(answer.ok, true, answer.reason);
    assert.deepEqual(answer.value, []);
  }
});

test("a request the fake does not recognise comes back as the door's calm reason, and is kept unnamed", async (t) => {
  t.mock.method(console, "error", () => {});
  const mark = fake.requests.length;
  const answer = await door.askClaudeForJson({
    system: "A caller the fake has never heard of.",
    message: "Anything.",
    schema: { type: "object", additionalProperties: false, required: ["unheard"], properties: { unheard: { type: "string" } } },
    effort: "low",
    maxTokens: 100,
    timeoutMs: 10_000,
  });
  assert.deepEqual(answer, { ok: false, reason: "Claude couldn’t answer just now. Try again." });
  assert.deepEqual(since(mark).map((r) => r.caller), [null]);
});

test("a key that is not the fake's is refused, as Anthropic refuses a bad key", async (t) => {
  t.mock.method(console, "error", () => {});
  const response = await fetch(`${fake.url}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "sk-ant-somebody-elses" },
    body: JSON.stringify({ model: "claude-opus-5-5", messages: [{ role: "user", content: "hi" }] }),
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.type, "authentication_error");
});

test("every canned caller is driven by a case here", () => {
  assert.deepEqual(
    CANNED.map((entry) => entry.caller).sort(),
    [...DRIVEN].sort(),
    "a canned answer in scripts/e2e/lib/fakeClaude.mjs has no case driving its caller's real ask here",
  );
  for (const entry of CANNED) assert.ok(entry.source && entry.routes.length > 0, `${entry.caller} does not say what it stands in for`);
});
