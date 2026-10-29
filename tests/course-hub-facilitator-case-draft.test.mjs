/**
 * CLAUDE DRAFTS THE SENTENCE THAT MAKES THE CASE, and the chart of a person's
 * week beside an ask ("Didn't offer, but worth asking", board st-facilitators).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rules this guards
 *
 *  1. Only an admin drafts, never for themselves, and only for somebody who
 *     holds a place on the programme and did not offer: the same people the
 *     ask may make the case to. Everybody else is refused before Claude is
 *     asked anything.
 *  2. Claude is sent the person's application alone and the programme's own
 *     description: never their name or address, never when they said they
 *     are free, never a group, its day or its time. The email says when; the
 *     admin judges whether they can make it, from the chart.
 *  3. Nothing is stored and nobody is emailed: the draft comes back for the
 *     admin's box, and only the Ask button sends.
 *  4. The chart's facts (each person's marked week, each group's weekly slot,
 *     which groups they can make by the site's reading) reach an admin and
 *     never the programme's lead, whose views have never shown anybody's week.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { AGI_PARAMS, NOW, RUN, askSeed, loadAskRoutes } from "./lib/facilitatorAskWorld.mjs";

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export function claudeConfigured() { return globalThis.__caseClaudeKey !== false; }
export async function askClaudeForJson(input) {
  globalThis.__caseClaudeAsked.push(input);
  return globalThis.__caseClaudeAnswer;
}`;

const made = makeWorld("__caseDraft", [["@/lib/ai/claude", CLAUDE_STUB]]);
const { world, reset, call, everything, formRoute } = made;
const routes = await loadAskRoutes(made);
const draftRoute = await formRoute("programmes", "[programmeId]", "facilitators", "case", "draft");

const DRAFTED = {
  ok: true,
  model: "claude-opus-5-5",
  usage: { inputTokens: 1, outputTokens: 1 },
  value: {
    text: "You ran lab demonstrations for a year — explaining hard ideas to a room is most of the job.",
    basis: "Their answer about leading something.",
  },
};

function begin(t) {
  t.mock.timers.reset();
  t.mock.timers.enable({ apis: ["Date"], now: NOW });
  reset(askSeed(), { now: () => new Date() });
  globalThis.__caseClaudeKey = true;
  globalThis.__caseClaudeAsked = [];
  globalThis.__caseClaudeAnswer = DRAFTED;
}

const draft = (who, uid) => call(who, draftRoute.POST, AGI_PARAMS, { body: { uid } });
const asking = (who) => call(who, routes.asking.GET, { runId: RUN.agi }, { course: true });

describe("1. who may ask Claude for a draft", () => {
  test("nobody signed out, and not the programme's lead", async (t) => {
    begin(t);
    assert.equal((await draft(null, "tariq")).status, 401);
    const lead = await draft("claudia", "tariq");
    assert.deepEqual([lead.status, lead.body.error], [403, "Only an admin can ask somebody who didn’t offer to facilitate."]);
    assert.equal(globalThis.__caseClaudeAsked.length, 0);
  });

  test("not a view-as session, which is turned away first", async (t) => {
    begin(t);
    const refused = await call("zach", draftRoute.POST, AGI_PARAMS, { body: { uid: "tariq" }, viewAs: true });
    assert.equal(refused.status, 403);
    assert.equal(globalThis.__caseClaudeAsked.length, 0);
  });

  test("never for yourself, nor for somebody who offered or holds no place", async (t) => {
    begin(t);
    assert.equal((await draft("zach", "zach")).status, 403);
    const offered = await draft("zach", "omar");
    assert.equal(offered.status, 409);
    assert.equal(offered.body.error, "That person said they’d like to facilitate, so ask them the usual way, without making the case.");
    const nobody = await draft("zach", "nobody-applied");
    assert.equal(nobody.status, 404);
    assert.equal((await draft("zach", "")).status, 400);
    assert.equal(globalThis.__caseClaudeAsked.length, 0);
  });
});

describe("2. what Claude is sent, and what comes back", () => {
  test("the application alone and the programme: no name, address, week or group", async (t) => {
    begin(t);
    const before = everything();
    const drafted = await draft("zach", "tariq");
    assert.equal(drafted.status, 200, JSON.stringify(drafted.body));
    assert.equal(globalThis.__caseClaudeAsked.length, 1);

    const { message, system } = globalThis.__caseClaudeAsked[0];
    assert.match(message, /^# The programme they hold a place on\n## AGI Strategy Fellowship\n/);
    assert.match(message, /# Their application/);
    const account = world.db.read("users/tariq");
    const leaks = [
      ...account.displayName.split(" "),
      account.email,
      // When they are free, and when any group meets.
      "availability",
      "free",
      "Group A",
      "Group B",
      "Group C",
      ...["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => `${day} `),
      ...["9am", "10am", "12pm", "6pm", "18:00", "12:00"],
    ];
    for (const leak of leaks) assert.ok(!message.includes(leak), `the message carries ${JSON.stringify(leak)}`);
    assert.match(system, /Never use an em dash or an en dash/);

    // The draft, with the site's dash rule, and what it drew on, for the box.
    assert.deepEqual(drafted.body, {
      ok: true,
      text: "You ran lab demonstrations for a year, explaining hard ideas to a room is most of the job.",
      basis: "Their answer about leading something.",
    });
    // Nothing stored, nobody emailed.
    assert.deepEqual(everything(), before);
    assert.equal(world.mail.length, 0);
  });

  test("without Claude set up, or when Claude cannot answer, it says so and keeps nothing", async (t) => {
    begin(t);
    globalThis.__caseClaudeKey = false;
    assert.equal((await draft("zach", "tariq")).status, 409);
    assert.equal(globalThis.__caseClaudeAsked.length, 0);
    globalThis.__caseClaudeKey = true;
    globalThis.__caseClaudeAnswer = { ok: false, reason: "Claude is busy." };
    const before = everything();
    const busy = await draft("zach", "tariq");
    assert.deepEqual([busy.status, busy.body.error], [502, "Claude is busy."]);
    assert.deepEqual(everything(), before);
  });

  test("a draft longer than the case may be is cut to it", async (t) => {
    begin(t);
    globalThis.__caseClaudeAnswer = { ...DRAFTED, value: { text: "word ".repeat(400), basis: "" } };
    const drafted = await draft("zach", "tariq");
    assert.equal(drafted.status, 200);
    assert.ok(drafted.body.text.length <= 600);
  });
});

describe("3. the chart beside an ask: an admin's, never the lead's", () => {
  const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

  test("an admin gets each person's week, each group's slot and the grid", async (t) => {
    begin(t);
    const view = (await asking("zach")).body;
    assert.ok(view.grid.endMinute > view.grid.startMinute);
    const timed = view.groups.filter((group) => group.slot);
    assert.ok(timed.length > 0, "no group has a slot to chart");
    const people = [...view.people, ...view.notOffered];
    assert.ok(people.length > 0);
    for (const person of people) {
      assert.ok(person.week, `${person.uid} has no week for an admin`);
      if (!person.week.said) {
        assert.deepEqual([person.week.marked, person.week.fits], [[], []]);
        continue;
      }
      // Every group it says they can make is a group with a slot, and the
      // whole session sits inside what they marked (or, read "from then on",
      // starts after their first mark that day).
      for (const id of person.week.fits) {
        const group = timed.find((each) => each.id === id);
        assert.ok(group, `${person.uid} fits ${id}, which has no slot`);
        const start = minutes(group.slot.startTimeLocal);
        const day = person.week.marked.filter((range) => range.weekday === group.slot.weekday);
        assert.ok(day.length > 0, `${person.uid} fits ${id} on a day they marked nothing`);
        if (!person.week.fromFirstMark) {
          const end = start + group.slot.durationMinutes;
          assert.ok(day.some((range) => range.start <= start), `${person.uid} fits ${id} before they are free`);
          assert.ok(day.some((range) => range.end >= end) || day.length > 1, `${person.uid} fits ${id} past their time`);
        }
      }
    }
  });

  test("the lead gets no week for anybody", async (t) => {
    begin(t);
    const view = (await asking("claudia")).body;
    for (const person of view.people) assert.equal(person.week, null, `${person.uid}'s week reached the lead`);
    assert.deepEqual(view.notOffered, []);
  });
});
