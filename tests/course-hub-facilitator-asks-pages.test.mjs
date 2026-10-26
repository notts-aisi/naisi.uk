/**
 * The page an ask to facilitate opens (board st-fac-ask-phone), drawn to HTML
 * on the server for the person asked and for anybody else, in every state an
 * ask can be in; and the facilitators' training card on a programme's
 * Settings tab.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * Real: the page, its model (`loadAnswerPage`), the routes that make the ask
 * and the answer, and the words. Stubbed: what `tests/lib/handoverWorld.mjs`
 * stubs, the navigation hooks, the stylesheets, and the editor's shared
 * controls beside the training card.
 */
import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { makeWorld } from "./lib/handoverWorld.mjs";
import { AGI_PARAMS, B, NOW, REPLY_BY, REPLY_BY_INSTANT, ROUND, SECRET, askSeed, loadAskRoutes } from "./lib/facilitatorAskWorld.mjs";

const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const ui = { h: createElement };
globalThis.__facilitatorAskPagesUi = ui;

const made = makeWorld("__facilitatorAskPages", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useRouter() { return { replace() {}, push() {}, refresh() {}, back() {} }; }",
  ],
  ["@/hooks/useHydrated", "export function useHydrated() { return false; }"],
  ["@/features/courses/facilitating/Facilitating.module.css", CLASS_NAMES],
  ["./Facilitating.module.css", CLASS_NAMES],
  ["./editor.module.css", CLASS_NAMES],
  ["./ProgrammeSetup.module.css", CLASS_NAMES],
  [
    "./controls",
    "export function SavedStatus({ state, problem }) {\n" +
      "  return globalThis.__facilitatorAskPagesUi.h('span', { 'data-state': state }, problem ?? state);\n" +
      "}",
  ],
]);
const { world, reset, call, loadTs } = made;
const routes = await loadAskRoutes(made);
const Page = (await loadTs(join("app", "(app)", "learn", "facilitate", "[askId]", "page.tsx"))).default;
const TrainingCard = (await loadTs(join("features", "applications", "editor", "FacilitatorTraining.tsx"))).default;

mock.timers.enable({ apis: ["Date"], now: NOW });

function begin(over = {}) {
  mock.timers.setTime(NOW.getTime());
  reset(askSeed(over), { now: () => new Date() });
}

/** Words of a page, tags gone. */
function textOf(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Omar asked for Group B, with a test first. Answers the ask's id. */
async function askOmar() {
  await call("claudia", routes.test.POST, AGI_PARAMS, { body: { uid: "omar", groupId: B, replyBy: REPLY_BY } });
  const asked = await call("claudia", routes.ask.POST, AGI_PARAMS, {
    body: { uid: "omar", groupId: B, replyBy: REPLY_BY, emails: 1 },
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  return asked.body.askId;
}

/** The page as `who`, for `askId`. */
async function draw(who, askId) {
  world.user = made.sessionOf(who);
  world.course = true;
  try {
    const element = await Page({ params: Promise.resolve({ askId }) });
    const html = renderToStaticMarkup(element);
    return { html, text: textOf(html) };
  } finally {
    world.course = false;
  }
}

test("for the person asked: the board's words, every value from records", async () => {
  begin();
  const askId = await askOmar();
  const { text, html } = await draw("omar", askId);
  assert.equal(
    text,
    "Fellowship: AGI Strategy Would you facilitate Group B? " +
      "When Tuesdays, 6pm to 8pm From Tue 3 Nov, for 6 weeks Where Hallward B12 Group Up to 8 people " +
      "Yes, I’ll facilitate I can’t this term " +
      "If you say yes, you’ll see your group’s names when groups go out. Please answer by Wed 28 Oct, 12pm.",
  );
  // Both buttons wait for the page's scripts.
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});

test("with the training set, its card says when and where, and names the lead as the email did", async () => {
  begin();
  await call("claudia", routes.training.PUT, AGI_PARAMS, {
    body: { training: { dateKey: "2026-10-28", time: "18:00", room: "Portland B5" } },
  });
  const askId = await askOmar();
  const { text } = await draw("omar", askId);
  assert.match(
    text,
    /Training Wed 28 Oct · 6pm · Portland B5 You don’t need any experience\. We’ll train you and give you everything you need: a guide for every week, and Claudia, the programme’s lead, if you get stuck\./,
  );
});

test("nothing from any application is on the page: not their answers, not anybody else's", async () => {
  begin();
  const askId = await askOmar();
  const { html } = await draw("omar", askId);
  for (const uid of ["omar", "wen", "nina", "amara", "ines"]) {
    assert.ok(!html.includes(SECRET(uid)), `${uid}'s answer is on the page`);
  }
  for (const words of ["chess club", "BSc Mathematics", "I want to know which arguments survive.", "@"]) {
    assert.ok(!html.includes(words), `"${words}" is on the page`);
  }
});

test("for anybody else, the page says it is somebody else's and shows nothing of the ask", async () => {
  begin();
  const askId = await askOmar();
  for (const who of ["wen", "claudia", "zach", "rahul"]) {
    const { text } = await draw(who, askId);
    assert.equal(
      text,
      "Asked to facilitate This page is for the person we asked. If that’s you, sign in with the account you applied with.",
      who,
    );
  }
  const none = await draw("omar", "no-such-ask");
  assert.match(none.text, /This page is for the person we asked\./);
});

test("after the day and time to answer by, the page says so in place of the buttons", async () => {
  begin();
  const askId = await askOmar();
  mock.timers.setTime(REPLY_BY_INSTANT.getTime() + 60_000);
  const { text } = await draw("omar", askId);
  assert.ok(!text.includes("Yes, I’ll facilitate"), "the buttons are still offered");
  assert.match(
    text,
    /We needed an answer by Wed 28 Oct, 12pm, so this has closed\. If you’d still like to facilitate, write to ai-safety@uonsu\.com\./,
  );
});

test("after yes, the page says they facilitate the group, and that names come when groups go out", async () => {
  begin();
  const askId = await askOmar();
  assert.equal((await call("omar", routes.answer.POST, { askId }, { body: { answer: "yes" }, course: true })).status, 200);
  const { text } = await draw("omar", askId);
  assert.match(text, /^Fellowship: AGI Strategy You’re facilitating Group B\./);
  assert.match(text, /You’ll see your group’s names when groups go out\.$/);
  assert.ok(!text.includes("Please answer by"));
});

test("after no, the page thanks them and says what they said", async () => {
  begin();
  const askId = await askOmar();
  await call("omar", routes.answer.POST, { askId }, { body: { answer: "no" }, course: true });
  const { text } = await draw("omar", askId);
  assert.match(text, /Thanks for letting us know\. You said you can’t facilitate AGI Strategy this term\.$/);
});

test("once somebody else has the place, the page says so", async () => {
  begin();
  const askId = await askOmar();
  const other = await call("claudia", routes.ask.POST, AGI_PARAMS, {
    body: { uid: "wen", groupId: B, replyBy: REPLY_BY, emails: 1, seat: askId },
  });
  await call("wen", routes.answer.POST, { askId: other.body.askId }, { body: { answer: "yes" }, course: true });
  const { text } = await draw("omar", askId);
  assert.match(text, /Somebody else is facilitating Group B now, so this has closed\. Thank you for saying you’d like to\.$/);
});

test("the training card: a day, a time and a room, each labelled, with nothing set by default", () => {
  const empty = textOf(
    renderToStaticMarkup(createElement(TrainingCard, { roundId: ROUND, programmeId: "agi-strategy", initial: null })),
  );
  assert.match(empty, /^Facilitators’ training saved When and where the training is for the people who say yes to facilitating\./);
  const html = renderToStaticMarkup(
    createElement(TrainingCard, {
      roundId: ROUND,
      programmeId: "agi-strategy",
      initial: { dateKey: "2026-10-28", time: "18:00", room: "Portland B5" },
    }),
  );
  for (const label of ["Day", "Time", "Room"]) assert.match(html, new RegExp(`<label for="[^"]+"[^>]*>${label}</label>`));
  assert.match(html, /type="date"[^>]*value="2026-10-28"/);
  assert.match(html, /type="time"[^>]*value="18:00"/);
  assert.match(html, /value="Portland B5"/);
  // Read only until the page is live, so nothing typed before then is lost.
  assert.equal((html.match(/readOnly=""/gi) ?? []).length, 3);
});
