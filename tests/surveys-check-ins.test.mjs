/**
 * THE CHECK-IN AT THE END OF A SESSION (docs/surveys.md, "Check-ins"): a
 * survey of its own kind on the survey records, opened from the register by
 * the group's facilitator, for the people the register marks there.
 *
 *  1. THE RULES, pure: when one can be opened and when it closes (11pm on the
 *     session's day, or an hour after a late session ends), who it is for
 *     (present, late or left early; never the group's facilitators, a
 *     facilitator holding a place included), its questions made from the
 *     group's own copy of the week, its id, and the floors: a facilitator sees
 *     a count while it is open and its totals from three answers once closed,
 *     never a comment.
 *  2. OPENING IT, as every kind of caller: only the group's live facilitators
 *     and admins, never during a view-as session; the session dated, started,
 *     held and within its window; somebody marked; the number on the button
 *     the register's own; claimed once. Each person marked there gets their
 *     own row and one notice with their own link; the facilitators none.
 *  3. SOMEBODY MARKED LATER gets a row and no email.
 *  4. ANSWERING IT, by link and signed in, with its own page: the box at the
 *     top, one page, "Send check-in".
 *  5. THE REGISTER'S CARD, as every kind of caller, and its floors.
 *  6. CLOSING IT, as every kind of caller.
 *  7. HOME'S CARD.
 *  8. THE ADMINS: the list, the Opening tab, one person's answers, and every
 *     admin's route that sends, reminds, tests, edits or presses for blanks
 *     refuses a check-in in a sentence; the programme's lead never reaches it.
 *  9. NAMES COME OFF a check-in on its day, by the surveys' own job.
 *
 * The world is one course run in its second week (`tests/lib/registerWorld.mjs`):
 * Group B meets on Tuesdays from 6pm to 8pm, facilitated by Rahul and Sofia,
 * with Amara, Chloe and Farah in it; Group A on Mondays with Amelia and Ana;
 * AGI Strategy names the run, and Claudia leads it. Mail goes to a stand-in
 * door that writes down what it was handed, and every message is rendered to
 * text with the real template before anything is said about its words.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@react-email/render";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { AGI, GROUP, OTHER_RUN, ROUND, RUN, makeWorld, registerPath, seedWorld } from "./lib/registerWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Every stylesheet a module imports, as its own class names, so a page component can be drawn. */
const STYLESHEETS = (() => {
  const found = new Set();
  for (const file of walkSource(SRC)) {
    for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) found.add(specifier);
  }
  return [...found].map((specifier) => [specifier, "export default new Proxy({}, { get: (_, name) => String(name) });"]);
})();

const made = makeWorld("__checkIns", [["@/hooks/useHydrated", "export function useHydrated() { return false; }"], ...STYLESHEETS]);
const { world, reset, call, courseRoute, lib, loadTs } = made;

const checkIn = await courseRoute("groups", "[groupId]", "check-in");
const closeRoute = await courseRoute("groups", "[groupId]", "check-in", "close");
const register = await courseRoute("groups", "[groupId]", "attendance");
const surveyRoute = (...parts) => loadTs(join("app", "api", "surveys", ...parts, "route.ts"));
const answerByLink = await surveyRoute("answer");
const answerSignedIn = await surveyRoute("[surveyId]", "answer");
const sendRoute = await surveyRoute("[surveyId]", "send");
const remindRoute = await surveyRoute("[surveyId]", "remind");
const testRoute = await surveyRoute("[surveyId]", "test");
const questionsRoute = await surveyRoute("[surveyId]", "questions");
const blanksRoute = await surveyRoute("[surveyId]", "people", "[who]", "blanks");
const adminClose = await surveyRoute("[surveyId]", "close");
const exportRoute = await surveyRoute("[surveyId]", "export");

const model = await lib("surveys", "checkIns", "model.ts");
const template = await lib("surveys", "checkIns", "template.ts");
const words = await lib("surveys", "checkIns", "words.ts");
const { checkInSurveyId } = await lib("surveys", "checkIns", "ids.ts");
const items = await lib("surveys", "items.ts");
const records = await lib("firestore", "surveys.ts");
const repo = await lib("surveys", "repo.ts");
const { answerScreenFor } = await lib("surveys", "answerView.ts");
const { surveysWaitingFor } = await lib("surveys", "waiting.ts");
const { checkInListView, openingView } = await lib("surveys", "checkIns", "adminView.ts");
const { openPersonAnswers } = await lib("surveys", "onePerson.ts");
const { leadSurveyOf } = await lib("surveys", "leadResults.ts");
const { surveyNamesOffJob } = await lib("scheduler", "jobs", "surveyNamesOff.ts");
const surveyWords = await lib("surveys", "words.ts");
const AnswerScreen = (await loadTs("features/surveys/answer/AnswerScreen.tsx")).default;

/** Tuesday 27 October 2026, 7:50pm GMT: the last ten minutes of Group B's week 2 session (6pm to 8pm). */
const DURING = new Date("2026-10-27T19:50:00Z");
/** Before it starts. */
const BEFORE = new Date("2026-10-27T17:30:00Z");
/** 11pm GMT that night: it closes. */
const CLOSES = new Date("2026-10-27T23:00:00Z");

mock.timers.enable({ apis: ["Date"], now: DURING });
const at = (instant) => mock.timers.setTime(instant.getTime());

const B = GROUP.b;
const ID = checkInSurveyId(RUN, B, "w02");
const read = (path) => world.db.read(path);
const rowOf = (uid) => read(`surveyPeople/${ID}__${uid}`);
const answersOf = () =>
  world.db
    .paths()
    .filter((path) => path.startsWith("surveyAnswers/"))
    .map((path) => read(path))
    .filter((answer) => answer.surveyId === ID);

/** Group B's week 2 marks, as Rahul taps them in. */
async function mark(marks, who = "rahul") {
  const response = await call(who, register.POST, { groupId: B }, { body: { weekNumber: 2, marks: Object.entries(marks).map(([uid, status]) => ({ uid, status })) } });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}

const open = (who, body = { session: "w02", people: 3 }, options = {}) => call(who, checkIn.POST, { groupId: B }, { body, ...options });
const card = (who, session = "w02", groupId = B) => call(who, checkIn.GET, { groupId }, { query: `?session=${session}` });
const close = (who, body = { session: "w02" }) => call(who, closeRoute.POST, { groupId: B }, { body });

/** Every required question answered, as the form sends it. */
const ANSWERS = (useful = 4, text = "The part on compute thresholds") => ({
  q_ci_useful: { type: "rating", value: useful },
  q_ci_most: { type: "text", text },
  q_ci_unclear: { type: "choices", optionIds: ["o_ci_nothing"] },
  q_ci_reading: { type: "choice", optionId: "o_ci_read_most" },
  q_ci_confident: { type: "rating", value: 3 },
});

const answerAs = (uid, answers = ANSWERS()) => call(null, answerByLink.POST, {}, { body: { token: rowOf(uid).token, answers } });

/** A message as its reader sees it: the real template, rendered to text. */
async function textOf(message) {
  return (await render(message.react, { plainText: true })).replace(/\s+/g, " ");
}

beforeEach(() => {
  at(DURING);
  reset();
});

// ---------------------------------------------------------------------------
// 1. The rules, pure
// ---------------------------------------------------------------------------

describe("1. the rules: the window, who it is for, its questions, its id and its floors", () => {
  test("it closes at 11pm on the session's London day, or an hour after a late session ends", () => {
    const afternoon = model.checkInWindow({ dateKey: "2026-11-18", startsAt: new Date("2026-11-18T15:00:00Z"), endsAt: new Date("2026-11-18T17:00:00Z") });
    assert.equal(afternoon.opensAt.toISOString(), "2026-11-18T15:00:00.000Z");
    assert.equal(afternoon.closesAt.toISOString(), "2026-11-18T23:00:00.000Z");
    const late = model.checkInWindow({ dateKey: "2026-11-18", startsAt: new Date("2026-11-18T21:30:00Z"), endsAt: new Date("2026-11-18T23:30:00Z") });
    assert.equal(late.closesAt.toISOString(), "2026-11-19T00:30:00.000Z", "a 9:30 to 11:30pm session's closes at 12:30am");
    // British summer time: 11pm in London is 10pm in UTC.
    const summer = model.checkInWindow({ dateKey: "2026-10-20", startsAt: new Date("2026-10-20T17:00:00Z"), endsAt: new Date("2026-10-20T19:00:00Z") });
    assert.equal(summer.closesAt.toISOString(), "2026-10-20T22:00:00.000Z");
    assert.equal(model.checkInWindow({ dateKey: "", startsAt: null, endsAt: null }), null, "a session that cannot be dated has none");
    assert.equal(model.windowState(afternoon, new Date("2026-11-18T14:59:00Z")), "early");
    assert.equal(model.windowState(afternoon, new Date("2026-11-18T15:00:00Z")), "now");
    assert.equal(model.windowState(afternoon, new Date("2026-11-18T22:59:59Z")), "now");
    assert.equal(model.windowState(afternoon, new Date("2026-11-18T23:00:00Z")), "past");
  });

  test("who it is for: present, late and left early; never absent, excused, unmarked or a facilitator", () => {
    const rows = ["ana", "bo", "cy", "di", "ed", "fay", "sofia"].map((uid) => ({ uid }));
    const marks = { ana: "present", bo: "late", cy: "left-early", di: "absent", ed: "excused", sofia: "present", nobody: "present" };
    assert.deepEqual(model.hereOf(marks, rows, ["rahul", "sofia"]), ["ana", "bo", "cy"], "a facilitator holding a place is never one, and nobody off the rows is");
    assert.deepEqual(model.hereOf({}, rows, []), []);
    assert.deepEqual([...model.HERE_STATUSES], ["present", "late", "left-early"]);
  });

  test("its questions: the week's parts by their own ids, Something else, Nothing was unclear as none, reading only with something to read", () => {
    const week = { parts: [{ id: "pt-power", title: "Why powerful AI might seek power" }, { id: "pt-races", title: "Races between AI developers" }], hasReading: true };
    const list = template.checkInItems(week);
    assert.deepEqual(items.validateSurveyItems(list), []);
    const questions = items.surveyQuestionsOf(list);
    assert.deepEqual(questions.map((each) => each.id), ["q_ci_useful", "q_ci_most", "q_ci_better", "q_ci_unclear", "q_ci_reading", "q_ci_confident"]);
    assert.deepEqual(questions.map((each) => each.title), [
      "How useful was today’s session?",
      "What was the most useful thing?",
      "What could have gone better?",
      "Was anything unclear?",
      "How much of this week’s reading did you do before the session?",
      "How confident do you feel about this week’s topic now?",
    ]);
    const unclear = questions.find((each) => each.id === "q_ci_unclear");
    assert.deepEqual(unclear.options.map((option) => [option.id, option.label]), [
      ["pt-power", "Why powerful AI might seek power"],
      ["pt-races", "Races between AI developers"],
      ["o_ci_else", "Something else"],
      ["o_ci_nothing", "Nothing was unclear"],
    ]);
    assert.deepEqual(unclear.noneIds, ["o_ci_nothing"]);
    assert.deepEqual(questions.find((each) => each.id === "q_ci_useful").rating, { max: 5, minLabel: "Not at all", maxLabel: "Very" });
    assert.deepEqual(questions.find((each) => each.id === "q_ci_confident").rating, { max: 5, minLabel: "Lost", maxLabel: "Could explain it" });
    assert.deepEqual(items.requiredQuestionsOf(list).map((each) => each.id), ["q_ci_useful", "q_ci_most", "q_ci_unclear", "q_ci_reading", "q_ci_confident"], "every question is required but what could have gone better");
    // A week with no parts and nothing to read.
    const bare = items.surveyQuestionsOf(template.checkInItems({ parts: [], hasReading: false }));
    assert.deepEqual(bare.map((each) => each.id), ["q_ci_useful", "q_ci_most", "q_ci_better", "q_ci_unclear", "q_ci_confident"]);
    assert.deepEqual(bare.find((each) => each.id === "q_ci_unclear").options.map((option) => option.id), ["o_ci_else", "o_ci_nothing"]);
    // No consent box, no quote tick and no Kairos box.
    assert.deepEqual(items.consentItemsOf(list), []);
    assert.equal(records.asksQuotes({ kind: "checkIn" }), false);
    assert.equal(records.asksKairos({ audience: { kind: "checkIn", roundId: "r", programmeId: "p", groupId: "g", sessionKey: "w02", weekNumber: 2 } }), false);
  });

  test("its id is worked out from the session, is a survey id, and reads one way inside a person's row", () => {
    assert.equal(checkInSurveyId(RUN, B, "w02"), ID);
    assert.notEqual(checkInSurveyId(RUN, B, "w03"), ID);
    assert.notEqual(checkInSurveyId(RUN, GROUP.a, "w02"), ID);
    assert.ok(repo.isSurveyId(ID));
    assert.match(ID, /^ci-[0-9a-f]{40}$/);
    assert.ok(!ID.includes("_"), "an id with a `_` would make a person's row read two ways");
  });

  test("the floors: a count while open, totals from three answers once closed, and never a comment", () => {
    const list = template.checkInItems({ parts: [{ id: "pt-a", title: "Compute as a lever" }], hasReading: true });
    const one = (useful, unclear, reading, text) => ({
      answers: {
        q_ci_useful: { type: "rating", value: useful },
        q_ci_most: { type: "text", text },
        q_ci_unclear: { type: "choices", optionIds: unclear },
        q_ci_reading: { type: "choice", optionId: reading },
        q_ci_confident: { type: "rating", value: 4 },
      },
    });
    const answers = [one(5, ["pt-a"], "o_ci_read_all", "Chips"), one(4, ["pt-a", "o_ci_else"], "o_ci_read_some", "Races"), one(4, ["o_ci_nothing"], "o_ci_read_most", "Debate")];
    assert.equal(model.TOTALS_FROM, 3);
    assert.equal(model.COMMENTS_FROM, 5);
    assert.deepEqual(model.facilitatorCount("open", list, answers, 6), { state: "open", answered: 3, of: 6 });
    assert.deepEqual(model.facilitatorCount("closed", list, answers.slice(0, 2), 6), { state: "closed", answered: 2, of: 6, totals: null });
    const totals = model.facilitatorCount("closed", list, answers, 6).totals;
    assert.deepEqual(totals, {
      answered: 3,
      of: 6,
      useful: 13 / 3,
      confident: 4,
      readMost: 2,
      unclear: [
        { label: "Compute as a lever", count: 2 },
        { label: "Something else", count: 1 },
      ],
    });
    assert.deepEqual(words.totalsLineParts(totals), ["Useful: 4.3 of 5", "Confident: 4.0 of 5", "3 of 6 answered", "2 did most or all of the reading", "Unclear: Compute as a lever (2), Something else (1)"]);
    assert.ok(!/Chips|Races|Debate/.test(JSON.stringify(totals)), "a comment reached the totals");
    // A week with nothing to read asks nothing about it, and says nothing about it.
    const noReading = model.totalsOf(template.checkInItems({ parts: [], hasReading: false }), answers, 3);
    assert.equal(noReading.readMost, null);
    assert.deepEqual(words.totalsLineParts({ ...noReading, unclear: [] }).slice(-2), ["3 of 3 answered", "Nothing unclear"]);
    assert.equal(words.tooFewWords(2, 6), "2 of 6 answered. Too few answers to show.");
  });

  test("its words, in the house's clock: today only on the session's own day, and 11pm or 12:30am", () => {
    const three = new Date("2026-11-18T15:00:00Z");
    assert.equal(words.sessionLineWords("Group C", three, new Date("2026-11-18T16:50:00Z")), "Group C, today at 3pm.");
    assert.equal(words.sessionLineWords("Group C", three, new Date("2026-11-19T00:10:00Z")), "Group C, Wed 18 Nov, 3pm.", "after midnight it is no longer today");
    assert.equal(words.checkInTitle(3), "How was week 3?");
    assert.equal(words.closesByItselfWords(new Date("2026-11-18T23:00:00Z"), three), "It closes by itself at 11pm. Then you see your group’s totals, never who said what.");
    assert.equal(words.closesClockWords(new Date("2026-11-19T00:30:00Z"), new Date("2026-11-18T21:30:00Z")), "12:30am on Thu 19 Nov");
    // The email names the day it closes on, which after a late session is the next one.
    const late = { title: "How was week 3?", groupName: "Group C", questions: 6, minutes: 2, programmeName: "AGI Strategy", signer: "Rahul" };
    assert.equal(
      words.checkInEmailWords({ ...late, startsAt: new Date("2026-11-18T21:30:00Z"), closesAt: new Date("2026-11-19T00:30:00Z") }).paragraphs[2],
      "It closes at 12:30am on Thu 19 Nov.",
    );
    assert.equal(
      words.checkInEmailWords({ ...late, startsAt: three, closesAt: new Date("2026-11-18T23:00:00Z") }).paragraphs[2],
      "It closes at 11pm on Wed 18 Nov.",
    );
    assert.equal(words.openButtonWords(6), "Open it for the 6 here");
    assert.equal(words.sentSoFarWords(4, 6), "4 of 6 have sent it");
    assert.equal(words.sentSoFarWords(1, 6), "1 of 6 has sent it");
    assert.equal(words.sentSoFarWords(0, 6), "None of the 6 have sent it yet");
    assert.equal(words.closeConfirmWords(4, 6), "Close the check-in? 2 of 6 haven’t sent it, and it can’t be opened again.");
    assert.equal(words.totalsHeadingWords(3, "Group C"), "Week 3’s check-in, Group C");
    assert.deepEqual(words.checkInBoxPoints({ leadName: "Claudia", programmeName: "AGI Strategy", namesOffOn: "2028-12-09", programmeKind: "fellowship" }), [
      "Only NAISI’s admins see who said what.",
      "Claudia, who leads AGI Strategy, sees totals and comments without names.",
      "Your facilitators see your group’s totals, never your answers.",
      "Your name comes off on Sat 9 Dec 2028, two years after the fellowship ends. The totals stay.",
    ]);
    // No dash of either kind anywhere in its words.
    const source = readFileSync(join(SRC, "lib", "surveys", "checkIns", "words.ts"), "utf8");
    assert.ok(!/[–—]/.test(source), "a check-in's words carry an en or em dash");
  });
});

// ---------------------------------------------------------------------------
// 2. Opening it
// ---------------------------------------------------------------------------

describe("2. opening it from the register", () => {
  test("only the group's live facilitators and admins, and nobody during a view-as session", async () => {
    await mark({ amara: "present", chloe: "late", farah: "left-early" });
    assert.equal((await open(null)).status, 401);
    assert.equal((await open("rahul", undefined, { viewAs: true })).status, 403, "view-as is refused first");
    for (const who of ["nell", "amara", "amelia", "claudia", "pia"]) {
      const response = await open(who);
      assert.equal(response.status, 403, who);
      assert.equal(response.body.error, "Forbidden", `${who} is told nothing about the group`);
    }
    assert.equal(read(`surveys/${ID}`), undefined, "nothing was opened");
    assert.equal(world.mail.length, 0);
    // An admin is told the group is missing; a missing group is one 403 for anybody else.
    assert.equal((await call("zach", checkIn.POST, { groupId: "no-such-group" }, { body: { session: "w02", people: 1 } })).status, 404);
    assert.equal((await call("rahul", checkIn.POST, { groupId: "no-such-group" }, { body: { session: "w02", people: 1 } })).status, 403);
  });

  test("Rahul opens it for the three marked there: a row and one notice each, with their own link, and none for the facilitators", async () => {
    await mark({ amara: "present", chloe: "late", farah: "left-early" });
    const response = await open("rahul");
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.deepEqual(response.body, { ok: true, people: 3, emailed: 3, failed: 0, noAddress: 0 });

    const survey = read(`surveys/${ID}`);
    assert.equal(survey.kind, "checkIn");
    assert.deepEqual(survey.audience, { kind: "checkIn", roundId: ROUND, programmeId: AGI, groupId: B, sessionKey: "w02", weekNumber: 2 });
    assert.equal("roundId" in survey, false, "a check-in carries no form at its top, so no per-form read pulls it in");
    assert.equal(survey.runId, RUN);
    assert.equal(survey.title, "How was week 2?");
    assert.equal(survey.name, "AGI Strategy: check-in, Group B, week 2");
    assert.equal(survey.intro, "Group B, Tue 27 Oct, 6pm.");
    assert.equal(survey.minutes, 2);
    assert.equal(survey.closesAt.toISOString(), CLOSES.toISOString());
    assert.match(survey.namesOffOn, /^2028-/);
    assert.equal(survey.testToken, null);
    assert.deepEqual(survey.checkIn, { groupName: "Group B", startsAt: new Date("2026-10-27T18:00:00Z"), endsAt: new Date("2026-10-27T20:00:00Z") });
    assert.deepEqual(survey.presses.map((press) => [press.kind, press.count, press.byUid]), [["first", 3, "rahul"]]);
    const normalised = records.normalizeSurvey(ID, survey);
    assert.ok(records.isCheckIn(normalised));
    assert.ok(repo.isOpen(normalised, DURING));

    for (const uid of ["amara", "chloe", "farah"]) {
      const row = rowOf(uid);
      assert.ok(row, uid);
      assert.equal(row.surveyId, ID);
      assert.equal(row.roundId, ROUND);
      assert.deepEqual(row.respondent, { kind: "account", uid });
      assert.ok(records.isSurveyToken(row.token), uid);
      assert.ok(row.sentAt instanceof Date, `${uid}'s row is theirs from now, emailed or not`);
      assert.equal(row.delivery, "sent");
      assert.equal(row.answered, false);
    }
    for (const uid of ["rahul", "sofia"]) assert.equal(rowOf(uid), undefined, `${uid} runs it and is sent none`);

    assert.deepEqual(world.mail.map((message) => [message.to, message.kind, message.surface]).sort(), [
      ["amara@example.com", "notice", "course-check-in"],
      ["chloe@example.com", "notice", "course-check-in"],
      ["farah@example.com", "notice", "course-check-in"],
    ]);
    const amara = world.mail.find((message) => message.to === "amara@example.com");
    assert.equal(amara.subject, "How was week 2? 6 questions for AGI Strategy");
    const text = await textOf(amara);
    for (const words of [
      "Sent as an important notice",
      "You are getting this because you were at this session of your course group, so it reaches you whatever your notification settings say, and it is never marketing.",
      "Group B, Tue 27 Oct, 6pm. Tell us how the session went while it’s fresh. It’s 6 questions and takes about 2 minutes.",
      "It’s confidential: only NAISI’s admins can see who said what. Your facilitators see your group’s totals, never your answers.",
      "It closes at 11pm on Tue 27 Oct.",
      "Answer the check-in",
      `https://naisi.invalid/survey/${rowOf("amara").token}`,
      "Rahul For NAISI",
    ]) {
      assert.ok(text.includes(words), `the email does not say: ${words}\n${text}`);
    }
    for (const other of ["chloe", "farah"]) assert.ok(!text.includes(rowOf(other).token), "somebody's email carries another person's link");
  });

  test("an admin opens it too, and two presses make one check-in", async () => {
    await mark({ amara: "present", chloe: "present", farah: "present" });
    assert.equal((await open("zach")).status, 200);
    const again = await open("rahul");
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "The check-in for this session has been opened already.");
    assert.equal(world.mail.length, 3, "the second press emailed nobody");
  });

  test("the number on the button is the register's: a moved count is refused with the new one", async () => {
    await mark({ amara: "present", chloe: "absent", farah: "excused" });
    const moved = await open("rahul", { session: "w02", people: 3 });
    assert.equal(moved.status, 409);
    assert.deepEqual(moved.body, { error: "Nothing was sent: the register now marks 1 here. Check it and press again.", people: 1 });
    assert.equal(read(`surveys/${ID}`), undefined);
    assert.equal((await open("rahul", { session: "w02", people: 1 })).status, 200);
    assert.deepEqual(world.mail.map((message) => message.to), ["amara@example.com"]);
  });

  test("a facilitator holding a place in the group is marked on the register and still sent none", async () => {
    reset(seedWorld({ over: { [`courseEnrolments/${RUN}__sofia`]: { ...read(`courseEnrolments/${RUN}__amara`), uid: "sofia" } } }));
    await mark({ amara: "present", sofia: "present" });
    const response = await open("rahul", { session: "w02", people: 1 });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(rowOf("sofia"), undefined);
    assert.deepEqual(world.mail.map((message) => message.to), ["amara@example.com"]);
  });

  test("refused in a sentence: nobody marked, before it starts, after it closes, a session not held, one the group does not hold, a run no programme names", async () => {
    const refusal = async (body, words, status = 409) => {
      const response = await open("rahul", body);
      assert.equal(response.status, status, JSON.stringify(response.body));
      assert.equal(response.body.error, words);
    };
    await refusal({ session: "w02", people: 0 }, "Take the register first: the check-in goes to the people marked here.");
    await mark({ amara: "present" });
    at(BEFORE);
    await refusal({ session: "w02", people: 1 }, "The check-in opens when the session starts.");
    at(CLOSES);
    await refusal({ session: "w02", people: 1 }, "This session’s check-in time has passed.");
    at(DURING);
    await refusal({ session: "w09", people: 1 }, "That isn’t one of this group’s sessions.", 400);
    await refusal({ session: "week two", people: 1 }, "That request didn’t arrive in a shape this page understands. Reload the page and try again.", 400);
    await refusal({ people: 1 }, "That request didn’t arrive in a shape this page understands. Reload the page and try again.", 400);
    // The register says the session did not happen.
    world.db.poke(registerPath(B, 2), { held: false });
    await refusal({ session: "w02", people: 1 }, "This session didn’t happen, so it has no check-in.");
    world.db.poke(registerPath(B, 2), { held: true });
    // A session cancelled through "Change a session".
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w02: { kind: "cancelled", reason: "Reading week", dateKey: "2026-10-27", byUid: "rahul", at: new Date("2026-10-26T09:00:00Z") } },
    });
    await refusal({ session: "w02", people: 1 }, "This session didn’t happen, so it has no check-in.");
    assert.equal((await card("rahul")).body.card, null, "a cancelled session's card offers no check-in");
    assert.equal(world.mail.length, 0, "a refusal emails nobody");
    // A run no programme names has no check-in: the pre-course group.
    reset();
    at(DURING);
    const other = await call("pia", register.POST, { groupId: GROUP.other }, { body: { weekNumber: 2, marks: [{ uid: "dev", status: "present" }] } });
    assert.equal(other.status, 200);
    const unnamed = await call("pia", checkIn.POST, { groupId: GROUP.other }, { body: { session: "w02", people: 1 } });
    assert.equal(unnamed.status, 409);
    assert.equal(unnamed.body.error, "This group’s run isn’t a programme’s yet, so it has no check-in. Ask an admin to name the run on the programme.");
    assert.equal(world.db.paths().filter((path) => path.startsWith("surveys/")).length, 0, `nothing was opened on ${OTHER_RUN}`);
  });

  test("two a London day per group, by the notice lane's durable counter", async () => {
    world.db.seed(`courseNudges/emailrate__checkinday__${B}`, { kind: "staff-email-throttle", key: `checkinday__${B}`, windowStartAt: new Date("2026-10-27T10:00:00Z"), count: 2 });
    await mark({ amara: "present" });
    const response = await open("rahul", { session: "w02", people: 1 });
    assert.equal(response.status, 429);
    assert.match(response.body.error, /^This audience has already had 2 check-ins in the last day\./);
    assert.equal(read(`surveys/${ID}`), undefined);
  });

  test("its questions are made from the group's own copy of the week", async () => {
    const part = (id, title) => ({
      id,
      type: "part",
      title,
      time: "",
      framing: [],
      blocks: [{ id: `${id}-src`, type: "source", kind: "read", lead: "", title: `${title}, a reading`, url: "https://example.com/r", by: "", date: "", time: "", compute: "", note: [] }],
    });
    world.db.seed(`courseRuns/${RUN}/weeks/w02`, { ...read(`courseRuns/${RUN}/weeks/w02`), blocks: [part("pt-run", "The run's own part")] });
    world.db.seed(`courseGroups/${B}/weeks/w02`, {
      ...read(`courseRuns/${RUN}/weeks/w02`),
      blocks: [part("pt-power", "Why powerful AI might seek power"), part("pt-compute", "Compute as a lever for governance")],
      forkedAt: new Date("2026-10-20T09:00:00Z"),
      forkedByUid: "rahul",
    });
    await mark({ amara: "present" });
    assert.equal((await open("rahul", { session: "w02", people: 1 })).status, 200);
    const unclear = items.surveyQuestionsOf(items.sanitizeSurveyItems(read(`surveys/${ID}`).items)).find((each) => each.id === "q_ci_unclear");
    assert.deepEqual(unclear.options.map((option) => option.id), ["pt-power", "pt-compute", "o_ci_else", "o_ci_nothing"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Somebody marked later
// ---------------------------------------------------------------------------

describe("3. somebody marked there after it opened gets a row and no email", () => {
  test("a row, counted as one more reached, and nothing sent", async () => {
    await mark({ amara: "present", chloe: "present" });
    assert.equal((await open("rahul", { session: "w02", people: 2 })).status, 200);
    world.mail.length = 0;
    await mark({ farah: "late" });
    const row = rowOf("farah");
    assert.ok(row && row.sentAt instanceof Date && records.isSurveyToken(row.token));
    assert.equal(world.mail.length, 0, "somebody marked later is not emailed");
    assert.deepEqual(read(`surveys/${ID}`).presses.map((press) => [press.kind, press.count]), [
      ["first", 2],
      ["joined", 1],
    ]);
    // Marking them again, or marking somebody absent, makes nothing more.
    await mark({ farah: "present", chloe: "absent" });
    assert.equal(read(`surveys/${ID}`).presses.length, 2);
    assert.ok(rowOf("chloe"), "a row made once stays");
    // Once it has closed, a mark reaches nobody.
    reset();
    await mark({ amara: "present" });
    assert.equal((await open("rahul", { session: "w02", people: 1 })).status, 200);
    assert.equal((await close("rahul")).status, 200);
    await mark({ chloe: "present" });
    assert.equal(rowOf("chloe"), undefined);
  });

  test("a mark on a session with no check-in reads only the check-in's one document", async () => {
    await mark({ amara: "present" });
    assert.equal(read(`surveys/${ID}`), undefined);
    assert.equal(rowOf("amara"), undefined);
  });
});

// ---------------------------------------------------------------------------
// 4. Answering it
// ---------------------------------------------------------------------------

describe("4. answering it, by the person's own link or signed in", () => {
  test("its own page: the box at the top, the session's line, one page and Send check-in", async () => {
    await mark({ amara: "present", chloe: "present", farah: "present" });
    await open("rahul");
    const survey = repo.isOpen(records.normalizeSurvey(ID, read(`surveys/${ID}`)), DURING) ? records.normalizeSurvey(ID, read(`surveys/${ID}`)) : null;
    const screen = await answerScreenFor(world.db, survey, {
      uid: "amara",
      answered: false,
      answeredAt: null,
      submit: { kind: "link", token: rowOf("amara").token },
      now: DURING,
      person: records.normalizeSurveyPerson(`${ID}__amara`, rowOf("amara")),
    });
    assert.equal(screen.state, "open");
    assert.deepEqual(screen.survey.eyebrow, ["Check-in", "2 minutes"]);
    assert.equal(screen.survey.title, "How was week 2?");
    assert.deepEqual(screen.survey.intro, ["Group B, today at 6pm."]);
    assert.equal(screen.survey.rule, "", "no rule line: its one optional question says so beside it");
    assert.equal(screen.survey.send, "Send check-in");
    assert.equal(screen.survey.kairos, null);
    assert.equal(screen.survey.pages.length, 1);
    assert.deepEqual(screen.survey.box.points.slice(0, 3), [
      "Only NAISI’s admins see who said what.",
      "Claudia, who leads AGI Strategy, sees totals and comments without names.",
      "Your facilitators see your group’s totals, never your answers.",
    ]);
    assert.match(screen.survey.box.points[3], /^Your name comes off on .* 2028, two years after the fellowship ends\. The totals stay\.$/);
    assert.equal(screen.survey.closing, "It closes at 11pm. Once sent, your answers can’t change.");
    assert.ok(screen.survey.pages[0].questions.every((question) => !(question.kind === "text" && question.quote)), "a quote tick is drawn");

    const html = renderToStaticMarkup(createElement(AnswerScreen, { screen }));
    const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    assert.ok(html.indexOf("Only NAISI’s admins see who said what.") < html.indexOf("How useful was today’s session?"), "the box is not at the top");
    assert.ok(text.includes("Send check-in"));
    assert.ok(!text.includes("Page 1 of 1"), "a check-in's one page has no page line");
    assert.ok(!text.includes("Every question needs an answer"), "a check-in has a rule line");
    assert.ok(text.includes("What could have gone better? (optional)"));
    // After midnight, the line names the day.
    at(new Date("2026-10-28T00:10:00Z"));
    const late = await answerScreenFor(world.db, survey, { uid: "amara", answered: false, answeredAt: null, submit: { kind: "link", token: rowOf("amara").token }, now: new Date(), person: null });
    assert.equal(late.state, "message", "it closed at 11pm");
  });

  test("by link and signed in, each once; refused after it closes; the answer keeps what every survey's does", async () => {
    await mark({ amara: "present", chloe: "present", farah: "present" });
    await open("rahul");
    const byLink = await answerAs("amara");
    assert.equal(byLink.status, 200, JSON.stringify(byLink.body));
    assert.equal((await answerAs("amara")).status, 409, "a second send is refused");
    const signedIn = await call("chloe", answerSignedIn.POST, { surveyId: ID }, { body: { answers: ANSWERS(5, "Seeing the numbers") } });
    assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
    assert.equal((await call("nell", answerSignedIn.POST, { surveyId: ID }, { body: { answers: ANSWERS() } })).status, 404, "somebody it was not for");
    // A required question left blank is refused, naming it.
    const blank = await call(null, answerByLink.POST, {}, { body: { token: rowOf("farah").token, answers: { q_ci_useful: { type: "rating", value: 3 } } } });
    assert.equal(blank.status, 400);
    assert.deepEqual(blank.body.missing, ["q_ci_most", "q_ci_unclear", "q_ci_reading", "q_ci_confident"]);
    // A quote tick is refused: a check-in draws none.
    const quoted = await call(null, answerByLink.POST, {}, { body: { token: rowOf("farah").token, answers: { ...ANSWERS(), q_ci_better: { type: "text", text: "More time", quote: true } } } });
    assert.equal(quoted.status, 400);
    at(CLOSES);
    assert.equal((await answerAs("farah")).status, 409, "it takes no answer from 11pm");
    const kept = answersOf();
    assert.equal(kept.length, 2);
    for (const answer of kept) {
      assert.deepEqual(Object.keys(answer).sort(), ["afterFirstSession", "answers", "respondent", "roundId", "sentAt", "surveyId", "via"]);
    }
    assert.deepEqual(kept.map((answer) => answer.via).sort(), ["link", "signed-in"]);
  });
});

// ---------------------------------------------------------------------------
// 5. The register's card
// ---------------------------------------------------------------------------

describe("5. the register's card, as every kind of caller, and its floors", () => {
  test("only the group's live facilitators and admins read it; the lead, a member and another group's facilitator are refused", async () => {
    assert.equal((await card(null)).status, 401);
    for (const who of ["nell", "amara", "amelia", "claudia"]) assert.equal((await card(who)).status, 403, who);
    assert.equal((await card("rahul")).status, 200);
    assert.equal((await card("sofia")).status, 200);
    assert.equal((await card("zach")).status, 200);
    assert.equal((await card("rahul", "nonsense")).status, 400);
    assert.equal((await card("rahul", "w09")).status, 400);
  });

  test("before it opens on the session's day: ready, with when it closes and the rows it can reach", async () => {
    const response = await card("rahul");
    assert.deepEqual(Object.keys(response.body).sort(), ["card", "last", "sessionKey"]);
    assert.deepEqual(response.body.card, { state: "ready", closes: "It closes by itself at 11pm. Then you see your group’s totals, never who said what.", counted: ["amara", "chloe", "farah"] });
    assert.equal(response.body.last, null);
    // Not on its day, nothing.
    at(BEFORE);
    assert.equal((await card("rahul")).body.card, null);
    at(CLOSES);
    assert.equal((await card("rahul")).body.card, null);
  });

  test("an admin's register shows somebody Publish has not told their group; the check-in never counts, reaches or emails them", async () => {
    // Nell is placed in Group B by an admin, and Publish has not told her yet.
    world.db.seed(`courseEnrolments/${RUN}__nell`, {
      runId: RUN,
      courseId: "agi-strategy-fellowship__crs00001",
      uid: "nell",
      groupId: B,
      status: "active",
      role: "learner",
      selfEnrolled: false,
      joinedWeekNumber: 1,
      allocatedEmailAt: null,
    });
    await mark({ amara: "present", chloe: "present", farah: "present", nell: "present" }, "zach");
    assert.deepEqual((await card("zach")).body.card.counted, ["amara", "chloe", "farah"], "the admin's button counts only the told");
    assert.deepEqual((await card("rahul")).body.card.counted, ["amara", "chloe", "farah"]);
    assert.equal((await open("zach", { session: "w02", people: 4 })).status, 409, "a count with her in it is refused");
    assert.equal((await open("zach")).status, 200);
    assert.equal(rowOf("nell"), undefined);
    assert.ok(!world.mail.some((message) => message.to === "nell@example.com"), "she was emailed her group before Publish");
    // Marked again once it is open, she is still not reached.
    await mark({ nell: "late" }, "zach");
    assert.equal(rowOf("nell"), undefined);
  });

  test("what it reaches is the register's told rows, whoever presses: it never reads the register as a viewer is shown it", () => {
    for (const file of ["open.ts", "lateMark.ts", "facilitatorView.ts"]) {
      const code = readFileSync(join(SRC, "lib", "surveys", "checkIns", file), "utf8");
      assert.match(code, /\bloadToldRegisterMembers\(db, runId, group\.id\)/, file);
      assert.doesNotMatch(code, /\bloadRegisterMembers\b/, file);
    }
    const access = readFileSync(join(SRC, "lib", "courses", "registerAccess.ts"), "utf8");
    assert.match(
      access,
      /export function loadToldRegisterMembers\(db: Firestore, runId: string, groupId: string\): Promise<RegisterRoster> \{\n {2}return loadRegisterMembers\(db, runId, groupId, \{ isAdmin: false \}\);\n\}/,
    );
  });

  test("while it is open: how many have sent it, never who, and the code that opens it signed in", async () => {
    await mark({ amara: "present", chloe: "present", farah: "present" });
    await open("rahul");
    await answerAs("amara");
    const response = await card("rahul");
    const view = response.body.card;
    assert.equal(view.state, "open");
    assert.equal(view.sent, "1 of 3 has sent it");
    assert.equal(view.confirm, "Close the check-in? 2 of 3 haven’t sent it, and it can’t be opened again.");
    assert.equal(view.code.address, `naisi.invalid/learn/${RUN}/survey/${ID}`);
    assert.match(view.code.d, /^M\d+ \d+h\d+v1h-\d+z/);
    const json = JSON.stringify(response.body);
    for (const leak of ["amara", "chloe", "farah", "The part on compute thresholds", rowOf("amara").token]) assert.ok(!json.includes(leak), `the card carries ${leak}`);
  });

  test("once closed: too few to show under three answers, and the totals from three, never a comment", async () => {
    await mark({ amara: "present", chloe: "present", farah: "present" });
    await open("rahul");
    await answerAs("amara", ANSWERS(5, "Riya’s point"));
    await answerAs("chloe", ANSWERS(4, "The debate"));
    at(CLOSES);
    let view = (await card("rahul")).body.card;
    assert.deepEqual(view, { state: "closed", heading: "Week 2’s check-in, Group B", totals: null, tooFew: "2 of 3 answered. Too few answers to show." });
    // A third answer, kept before it closed.
    at(DURING);
    await answerAs("farah", ANSWERS(3, "Chips"));
    at(CLOSES);
    view = (await card("rahul")).body.card;
    assert.equal(view.state, "closed");
    assert.deepEqual(view.totals, ["Useful: 4.0 of 5", "Confident: 3.0 of 5", "3 of 3 answered", "3 did most or all of the reading", "Nothing unclear"]);
    assert.ok(!/Riya|debate|Chips/.test(JSON.stringify(view)), "a comment reached a facilitator");
    // The next week, beside week 3's card, it is the group's last closed check-in.
    at(new Date("2026-11-03T19:00:00Z"));
    const next = (await card("rahul", "w03")).body;
    assert.equal(next.card.state, "ready");
    assert.deepEqual(next.last, { heading: "Week 2’s check-in, Group B", totals: view.totals, tooFew: null });
  });
});

// ---------------------------------------------------------------------------
// 6. Closing it
// ---------------------------------------------------------------------------

describe("6. closing it now", () => {
  test("only the group's live facilitators and admins, never during view-as, once", async () => {
    await mark({ amara: "present" });
    await open("rahul", { session: "w02", people: 1 });
    assert.equal((await close(null)).status, 401);
    assert.equal((await call("rahul", closeRoute.POST, { groupId: B }, { body: { session: "w02" }, viewAs: true })).status, 403, "view-as is refused first");
    for (const who of ["nell", "amara", "amelia", "claudia"]) assert.equal((await close(who)).status, 403, who);
    assert.equal((await close("sofia", {})).status, 400);
    const closed = await close("sofia");
    assert.equal(closed.status, 200);
    assert.ok(read(`surveys/${ID}`).closedAt instanceof Date);
    const again = await close("rahul");
    assert.equal(again.status, 409);
    assert.equal(again.body.error, "This check-in isn’t open, so there’s nothing to close.");
    assert.equal((await answerAs("amara")).status, 409, "closed by hand, it takes no answer");
    assert.equal(world.mail.length, 1, "closing emails nobody");
  });
});

// ---------------------------------------------------------------------------
// 7. Home's card
// ---------------------------------------------------------------------------

describe("7. Home's card: while it is open and theirs, until they send it", () => {
  test("a card for each person marked there, gone once they answer, and gone once it closes", async () => {
    await mark({ amara: "present", chloe: "present" });
    await open("rahul", { session: "w02", people: 2 });
    const [cardOf] = await surveysWaitingFor(world.db, { uid: "amara" }, DURING);
    assert.deepEqual(
      { eyebrow: cardOf.eyebrow, title: cardOf.title, programme: cardOf.programme, size: cardOf.size, closes: cardOf.closes, answer: cardOf.answer, kind: cardOf.kind },
      { eyebrow: "A check-in for you", title: "How was week 2?", programme: "AGI Strategy", size: "6 questions, about 2 minutes", closes: "Closes 11pm", answer: "Answer", kind: "checkIn" },
    );
    assert.equal(cardOf.href, `/survey/${rowOf("amara").token}`);
    assert.deepEqual(await surveysWaitingFor(world.db, { uid: "farah" }, DURING), [], "somebody not marked there has none");
    await answerAs("amara");
    assert.deepEqual(await surveysWaitingFor(world.db, { uid: "amara" }, DURING), []);
    assert.equal((await surveysWaitingFor(world.db, { uid: "chloe" }, DURING)).length, 1);
    assert.deepEqual(await surveysWaitingFor(world.db, { uid: "chloe" }, CLOSES), []);
    // Somebody whose seat has left the run is not asked.
    world.db.poke(`courseEnrolments/${RUN}__chloe`, { status: "withdrawn" });
    assert.deepEqual(await surveysWaitingFor(world.db, { uid: "chloe" }, DURING), []);
  });
});

// ---------------------------------------------------------------------------
// 8. The admins
// ---------------------------------------------------------------------------

describe("8. the admins' pages and routes", () => {
  test("every admin's route that sends, reminds, tests, edits or presses for blanks refuses a check-in in a sentence; Close it now still works", async () => {
    await mark({ amara: "present" });
    await open("rahul", { session: "w02", people: 1 });
    await answerAs("amara");
    const said = surveyWords.REFUSAL.checkInNotSent;
    for (const [route, body] of [
      [sendRoute, { to: "joined", emails: 0 }],
      [remindRoute, { emails: 0 }],
      [testRoute, { email: "survey" }],
      [questionsRoute, { title: "x", intro: "", minutes: 2, closesOn: "2026-10-27", items: [] }],
    ]) {
      const response = await call("zach", route.POST, { surveyId: ID }, { body });
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.error, said);
    }
    const blanks = await call("zach", blanksRoute.POST, { surveyId: ID, who: "amara" }, { body: { questions: 1 } });
    assert.equal(blanks.status, 409);
    assert.equal(blanks.body.error, said);
    assert.equal(world.mail.length, 1, "nothing more was sent");
    assert.equal((await call("zach", adminClose.POST, { surveyId: ID }, { body: {} })).status, 200);
    assert.ok(read(`surveys/${ID}`).closedAt instanceof Date);
  });

  test("the list shows one line a programme, and each check-in's Opening tab says who opened it, for how many, and who joined since", async () => {
    await mark({ amara: "present", chloe: "present" });
    await open("rahul", { session: "w02", people: 2 });
    await mark({ farah: "present" });
    const listed = await repo.listSurveys(world.db);
    assert.ok(!listed.some((survey) => survey.id === ID), "the list of surveys reads a check-in");
    const checkIns = await repo.listCheckIns(world.db);
    assert.deepEqual(checkIns.map((survey) => survey.id), [ID]);
    assert.deepEqual(await repo.checkInsOfRun(world.db, RUN).then((all) => all.map((survey) => survey.id)), [ID]);
    const groups = checkInListView(checkIns, DURING);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].programme, "Fellowship: AGI Strategy");
    assert.equal(groups[0].line, "1 check-in, 1 open now");
    assert.deepEqual(groups[0].rows.map((row) => [row.label, row.open, row.closes, row.reached]), [["Week 2 · Group B · Tue 27 Oct", true, "Closes Tue 27 Oct", 3]]);
    // The Opening tab is an admin's, and names the opener as the names rule
    // names him to an admin: in full (`namesOf`, handed the admin).
    const opening = await openingView(world.db, records.normalizeSurvey(ID, read(`surveys/${ID}`)), DURING, made.sessionOf("zach"));
    assert.equal(opening.opened, "Opened by Rahul Mehta on Tue 27 Oct, 7:50pm, for the 2 marked here.");
    // Handed nobody in particular, it names him by the name he goes by.
    const plain = await openingView(world.db, records.normalizeSurvey(ID, read(`surveys/${ID}`)), DURING, null);
    assert.equal(plain.opened, "Opened by Rahul on Tue 27 Oct, 7:50pm, for the 2 marked here.");
    assert.deepEqual(opening.joined, ["1 more marked here after it opened, with no email."]);
    assert.deepEqual(opening.closes, { label: "Closes", value: "Tue 27 Oct, 11pm" });
  });

  test("one person's answers show their check-ins, the opening recorded first; the programme's lead never reaches one", async () => {
    await mark({ amara: "present" });
    await open("rahul", { session: "w02", people: 1 });
    await answerAs("amara");
    const survey = records.normalizeSurvey(ID, read(`surveys/${ID}`));
    const opened = await openPersonAnswers(world.db, { uid: "zach", displayName: "Zach Levin" }, survey, "amara", DURING);
    assert.equal(opened.kind, "open");
    const table = opened.view.rest.find((each) => each.title === "How was week 2?");
    assert.ok(table, "the check-in is not among their answers");
    assert.equal(table.line, "AGI Strategy: check-in, Group B, week 2");
    assert.ok(table.rows.some((row) => row.kind === "question" && row.cells.some((cell) => cell.lines.includes("The part on compute thresholds"))));
    const openings = world.db.paths().filter((path) => path.startsWith("recordOpenings/")).map((path) => read(path));
    assert.ok(openings.some((row) => row.kind === "survey-answers" && row.surveyIds.includes(ID)), "the opening was not recorded");
    // The lead reads the programme's own surveys, never a check-in.
    assert.equal(await leadSurveyOf(world.db, ROUND, AGI, ID), null);
  });

  test("the download with names works for a check-in, logged as every survey's is", async () => {
    await mark({ amara: "present" });
    await open("rahul", { session: "w02", people: 1 });
    await answerAs("amara");
    world.user = made.sessionOf("zach");
    const response = await exportRoute.POST(new Request("https://naisi.invalid/api", { method: "POST" }), { params: Promise.resolve({ surveyId: ID }) });
    assert.equal(response.status, 200);
    const logged = world.db.paths().filter((path) => path.startsWith("dataExports/")).map((path) => read(path));
    assert.ok(logged.some((row) => row.kind === "survey-answers" && row.scope?.surveyId === ID));
  });
});

// ---------------------------------------------------------------------------
// 9. Names come off
// ---------------------------------------------------------------------------

describe("9. names come off a check-in on its day, by the surveys' own job", () => {
  test("the job finds it by its day, though the list of surveys leaves it out", async () => {
    await mark({ amara: "present" });
    await open("rahul", { session: "w02", people: 1 });
    await answerAs("amara");
    const day = read(`surveys/${ID}`).namesOffOn;
    const before = new Date(`${day}T08:00:00Z`);
    before.setUTCDate(before.getUTCDate() - 1);
    const run = async (now) => {
      at(now);
      return surveyNamesOffJob.handler({
        now,
        budget: { remainingMs: () => 20_000, expired: () => false },
        log: () => {},
        policy: { reclaimAfterMinutes: 20, maxAttempts: 3 },
        maxPerTick: 5,
        maxLateHours: 0,
      });
    };
    await run(before);
    assert.deepEqual(answersOf()[0].respondent, { kind: "account", uid: "amara" }, "names came off the day before");
    await run(new Date(`${day}T08:00:00Z`));
    assert.equal(answersOf()[0].respondent, null);
    assert.equal(rowOf("amara"), undefined, "who it was sent to is deleted");
    assert.ok(read(`surveys/${ID}`).namesOffAt instanceof Date);
  });
});
