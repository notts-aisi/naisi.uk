/**
 * One question, the whole group, and when an answer was first read (Fri 13
 * Nov 2026): the page that puts one question of a week in front of its reader
 * with every person of one group's answer to it, reached from the programme's
 * side (`.../programmes/[programmeId]/question?group=`) and the group's
 * (`/learn/[runId]/group/[groupId]/question`), one loader behind both
 * (`src/lib/courses/coursework/questionLoad.ts`); and the time each answer
 * was first put in front of somebody on the team who may read it, kept by
 * `POST /api/courses/runs/[runId]/first-read` and never who.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS THE PAGE, on either side, and WHOSE ANSWERS each reader is
 *     sent: a facilitator never a co-facilitator's own answer or a rating, the
 *     lead and admins a facilitator's own, nobody their own; a facilitator of
 *     another group, a track lead with no other role and a member are refused,
 *     somebody signed out sent to sign in. Drawing it writes nothing.
 *  2. WHAT A ROW SAYS: the answer in full, when, Late, an answer not sent, the
 *     two states apart ("Not read yet"; "No feedback yet", "Feedback given",
 *     "Changed since feedback"), the way to the person's week, and previous
 *     and next through the week's questions in its own order.
 *  3. THE ROUTE, as every kind of caller: who may mark what; nothing kept for
 *     an answer the caller may not read in full; a second call moves nothing;
 *     a view-as session and the person's own call are refused; it answers ok
 *     and nothing else. And the page as it stood: "Not read yet" until the
 *     next reader arrives.
 *  4. FEEDBACK WRITTEN FROM THE PAGE is read back, and the filters follow it.
 *  5. THE SWITCH between the two ways of reading, on both, landing on the
 *     same week and the same person or question.
 *  6. THE MEMBER'S SIDE: nothing the person whose answer it is is sent names a
 *     read time, held by what their own routes answer and by the tree (every
 *     page and route that can reach the store of the times is listed).
 *  7. THE FILTERS AND COUNTS as pure functions, every combination, the two
 *     states independent of each other.
 *  8. THE WORDS the browser spec reads, as the product says them.
 *
 * Real: both pages, both reading views, the loaders, the first-read and
 * feedback routes, the member's own routes, rendered to HTML. Faked: see
 * `tests/lib/facilitatorWeekWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { importersOf } from "./lib/clientGraph.mjs";
import { find } from "./lib/facilitatorPagesWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { AGI, B, NOW, ROUND, RUN, SAID, facilitatorWeekSeed, makeFacilitatorWeekWorld } from "./lib/facilitatorWeekWorld.mjs";
import { enrolment } from "./lib/hubAttendanceWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const codeOf = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorWeekWorld("__questionViewSuite");
const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const pages = {
  group: (await w.loadTs(join(GROUP, "question", "page.tsx"))).default,
  programme: (await w.loadTs(join(PROGRAMME, "question", "page.tsx"))).default,
  groupWeek: (await w.loadTs(join(GROUP, "coursework", "[uid]", "page.tsx"))).default,
  programmeWeek: (await w.loadTs(join(PROGRAMME, "coursework", "[uid]", "page.tsx"))).default,
};
const question = await w.loadTs(join("lib", "courses", "coursework", "question.ts"));
const words = await w.loadTs(join("lib", "courses", "coursework", "words.ts"));
const weekWorkStore = await w.loadTs(join("lib", "firestore", "courseWeekWork.ts"));
const routes = {
  firstRead: await w.courseRoute("runs", "[runId]", "first-read"),
  feedback: await w.courseRoute("runs", "[runId]", "feedback"),
  overview: await w.courseRoute("runs", "[runId]", "overview"),
  myExercises: await w.courseRoute("runs", "[runId]", "my-exercises"),
  reflection: await w.courseRoute("runs", "[runId]", "reflections", "[promptId]"),
  written: await w.courseRoute("runs", "[runId]", "written-answers", "[answerId]"),
};

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/** Week 3, as the reading view's suite writes it: week 1's shape, then a written answer and two boxes in a fourth part. */
function weekThree() {
  return {
    weekNumber: 3,
    title: "The lamp makers",
    summary: "",
    guideBlocks: [],
    materials: [],
    exercises: [],
    checklist: [],
    questions: [],
    estimatedMinutes: null,
    published: true,
    blocks: [
      ...weekOneBlocks("k3"),
      {
        id: "k3-p4",
        type: "part",
        title: "Your keeper's plan",
        time: "About 30 minutes",
        framing: [],
        blocks: [
          { id: "k3-wa", type: "writtenAnswer", prompt: [p(run("Who should keep the lamps lit, and why?"))], boxes: [], guidance: [], words: { min: 1, max: 200 }, due: "dayBefore" },
          {
            id: "k3-fi",
            type: "fillIn",
            title: "My keeper's plan",
            groups: [{ heading: "My next step", boxes: [{ id: "k3-fb1", label: "" }, { id: "k3-fb2", label: "And after that" }] }],
          },
        ],
      },
    ],
  };
}

const SENT = new Date("2026-11-16T09:00:00Z");
/** When this world's site began keeping read times, and the one document that says so. */
const KEPT_SINCE = new Date("2026-11-13T00:00:00Z");
const KEPT_DOC = "config/firstReadTimes";
const CHLOE_ANSWER = "Keepers should, because they know the lamps.";
const RAHUL_ANSWER = "The town, through the harbour board.";
const SOFIA_ANSWER = "Whoever the ships pay.";
const FARAH_DRAFT = "A draft she has not sent.";
const CHLOE_BOX = "Visit the harbour master.";

/** A written answer as its routes store one: sent unless `sent` is null. */
function answer(uid, text, { sent = SENT, saved = SENT, earlier = [] } = {}) {
  return {
    runId: RUN.agi,
    uid,
    weekId: "w03",
    weekNumber: 3,
    exerciseId: "k3-wa",
    responseType: "text",
    text,
    words: text.split(/\s+/).length,
    ...(sent ? { submittedAt: sent, firstSentAt: sent, sentAt: sent } : {}),
    updatedAt: saved,
    reviewStatus: "unreviewed",
    ...(earlier.length > 0 ? { earlierVersions: earlier } : {}),
  };
}

/** A fill-in box as its route stores one. */
function box(uid, boxId, text, at = new Date("2026-11-15T16:12:00Z")) {
  return { runId: RUN.agi, uid, weekId: "w03", weekNumber: 3, exerciseId: boxId, kind: "fillIn", responseType: "text", text, submittedAt: null, reviewStatus: "unreviewed", updatedAt: at };
}

function seed() {
  return facilitatorWeekSeed({
    [`courseRuns/${RUN.agi}/weeks/w03`]: weekThree(),
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`]: answer("chloe", CHLOE_ANSWER),
    [`courseExerciseResponses/${RUN.agi}__rahul__w03__k3-wa`]: answer("rahul", RAHUL_ANSWER),
    [`courseExerciseResponses/${RUN.agi}__sofia__w03__k3-wa`]: answer("sofia", SOFIA_ANSWER),
    // Farah started hers and never sent it: before Group B's session tonight nobody may read it.
    [`courseExerciseResponses/${RUN.agi}__farah__w03__k3-wa`]: answer("farah", FARAH_DRAFT, { sent: null, saved: new Date("2026-11-16T20:00:00Z") }),
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-fb1`]: box("chloe", "k3-fb1", CHLOE_BOX),
    // The site began keeping read times at the start of Fri 13 Nov.
    [KEPT_DOC]: { keptSince: KEPT_SINCE },
  });
}

beforeEach(() => w.reset(seed()));

/** The world on a database where the site has not begun keeping read times. */
function seedWithoutTheInstant() {
  const out = seed();
  delete out[KEPT_DOC];
  return out;
}

const RUN_HOME = `/learn/${RUN.agi}`;
const GROUP_PATH = `${RUN_HOME}/group/${B}`;
const PROGRAMME_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

const groupPage = (who, query = {}, { groupId = B } = {}) => w.draw(pages.group, who, { runId: RUN.agi, groupId }, query);
const programmePage = (who, query = {}) => w.draw(pages.programme, who, { roundId: ROUND, programmeId: AGI }, { group: B, ...query });
const viewOf = (drawn) => find(drawn.element, "QuestionView")[0]?.props.view ?? null;
const readingOf = (drawn) => find(drawn.element, "ReadingView")[0]?.props.view ?? null;
const uidsOf = (view) => view.rows.map((row) => row.uid);
const rowOf = (view, uid) => view.rows.find((row) => row.uid === uid) ?? null;
const weekWork = (uid) => w.world.db.read(`courseWeekWork/${RUN.agi}__${uid}__w03`) ?? null;
const readAt = (uid) => weekWork(uid)?.firstReadAt ?? {};
const mark = (who, people, options = {}) => w.call(who, routes.firstRead.POST, { runId: RUN.agi }, { body: { weekId: "w03", people }, course: true, ...options });

/** The page as `who` draws it, after asserting the drawing wrote nothing. */
async function drawn(who, query, side = "group") {
  const out = side === "group" ? await groupPage(who, query) : await programmePage(who, query);
  assert.equal(out.wrote, false, `${who} drawing the ${side} side's page wrote something`);
  return out;
}

describe("1. who opens the page, and whose answers each reader is sent", () => {
  test("the group's side: its facilitators, the lead and an admin; nobody else, and signed out to sign in", async () => {
    const seen = {};
    for (const who of ["zach", "claudia", "rahul", "sofia", "tom", "yusuf", "chloe", "amara", "nobody", null]) {
      const out = await drawn(who, { week: "3" });
      seen[who ?? "signed out"] = out.to ?? (viewOf(out) ? "drawn" : out.text.slice(0, 60));
    }
    assert.deepEqual(seen, {
      zach: "drawn",
      claudia: "drawn",
      rahul: "drawn",
      sofia: "drawn",
      // Facilitates Group C: the page's own gate, on Group B's address.
      tom: RUN_HOME,
      // The run's track lead and nothing else: no reader of work.
      yusuf: RUN_HOME,
      chloe: RUN_HOME,
      amara: RUN_HOME,
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("the programme's side: the lead and an admin; a reviewer is told it is theirs, a facilitator sent away", async () => {
    for (const who of ["zach", "claudia"]) assert.ok(viewOf(await drawn(who, { week: "3" }, "programme")), `${who} is not drawn the page`);
    const reviewer = await drawn("lloyd", { week: "3" }, "programme");
    assert.equal(viewOf(reviewer), null);
    assert.match(reviewer.text, /Coursework/);
    for (const who of ["rahul", "chloe"]) {
      const out = await drawn(who, { week: "3" }, "programme");
      assert.equal(viewOf(out), null, `${who} is drawn the programme's page`);
    }
  });

  test("whose answers: a facilitator their fellows, never a co-facilitator's own; the lead and an admin the facilitators' own too", async () => {
    const lists = {};
    for (const who of ["rahul", "sofia", "claudia", "zach"]) lists[who] = uidsOf(viewOf(await drawn(who, { week: "3", question: "k3-wa" })));
    assert.deepEqual(lists.rahul, ["chloe", "farah", "kofi"]);
    assert.deepEqual(lists.sofia, ["chloe", "farah", "kofi"]);
    // The group's order: by the name each is shown.
    assert.deepEqual(lists.claudia, ["chloe", "farah", "kofi", "rahul", "sofia"]);
    assert.deepEqual(lists.zach, ["chloe", "farah", "kofi", "rahul", "sofia"]);
    assert.deepEqual(uidsOf(viewOf(await drawn("claudia", { week: "3", question: "k3-wa" }, "programme"))), lists.claudia);
    // Nothing of a facilitator's own answer reaches a facilitator, in any form.
    for (const who of ["rahul", "sofia"]) {
      const out = await drawn(who, { week: "3", question: "k3-wa" });
      for (const words of [RAHUL_ANSWER, SOFIA_ANSWER]) assert.ok(!out.html.includes(words) && !JSON.stringify(viewOf(out)).includes(words), `${who} is sent ${words}`);
    }
  });

  test("nobody is sent their own answer: the lead's and an admin's places in the group", async () => {
    for (const uid of ["claudia", "zach"]) {
      w.world.db.seed(`courseEnrolments/${RUN.agi}__${uid}`, enrolment(uid, B));
      w.world.db.seed(`courseExerciseResponses/${RUN.agi}__${uid}__w03__k3-wa`, answer(uid, `${uid} would keep the lamps.`));
    }
    const asLead = viewOf(await drawn("claudia", { week: "3", question: "k3-wa" }));
    assert.ok(!uidsOf(asLead).includes("claudia"), "the lead is sent her own answer");
    assert.ok(uidsOf(asLead).includes("zach"));
    const asAdmin = viewOf(await drawn("zach", { week: "3", question: "k3-wa" }));
    assert.ok(!uidsOf(asAdmin).includes("zach"), "an admin is sent their own answer");
    assert.ok(uidsOf(asAdmin).includes("claudia"));
  });

  test("ratings for the team: an admin and the lead, never a facilitator", async () => {
    for (const who of ["rahul", "sofia"]) {
      const out = await drawn(who, { week: "3", question: "k3-wa" });
      assert.deepEqual(viewOf(out).rows.map((row) => row.team), viewOf(out).rows.map(() => null), `${who} is sent ratings`);
      assert.doesNotMatch(out.html, /Rating for the team|What the team said/);
    }
    for (const who of ["claudia", "zach"]) {
      const view = viewOf(await drawn(who, { week: "3", question: "k3-wa" }));
      assert.equal(rowOf(view, "chloe").team?.itemId, "k3-wa", `${who} is not sent the team's ratings`);
      // Farah's draft cannot be read yet, so it cannot be rated either.
      assert.equal(rowOf(view, "farah").team, null);
    }
  });

  test("a fill-in box: only the people the boxes' own gate admits, and the box's words", async () => {
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-fb1" }));
    assert.equal(view.question.kind, "box");
    assert.equal(rowOf(view, "chloe").answer.text, CHLOE_BOX);
    assert.deepEqual(uidsOf(view), ["chloe", "farah", "kofi"]);
    // A box takes no feedback of its own: neither its state nor its filter is drawn.
    assert.equal(view.takesFeedback, false);
    assert.deepEqual(view.rows.map((row) => row.feedback), [null, null, null]);
  });
});

describe("2. what a row says", () => {
  test("the written answer before Group B's session: sent ones in full, a draft said to be not sent and not shown", async () => {
    const out = await drawn("rahul", { week: "3", question: "k3-wa" });
    const view = viewOf(out);
    assert.equal(view.question.text, "Who should keep the lamps lit, and why?");
    const chloe = rowOf(view, "chloe");
    assert.equal(chloe.answer.text, CHLOE_ANSWER);
    assert.deepEqual([chloe.read, chloe.feedback, chloe.late, chloe.notSent], ["unread", "none", false, false]);
    const farah = rowOf(view, "farah");
    assert.deepEqual([farah.answer, farah.read, farah.feedback, farah.notSent], [null, null, null, true]);
    assert.ok(!out.html.includes(FARAH_DRAFT), "a draft nobody may read yet is drawn");
    const kofi = rowOf(view, "kofi");
    assert.deepEqual([kofi.answer, kofi.read, kofi.feedback, kofi.notSent], [null, null, null, false]);
    // In words: each person, when it was sent, its two states, and the way to their week.
    assert.match(out.text, /Chloe Nguyen Sent Mon 16 Nov, 9am Not read yet No feedback yet Open Chloe’s week Keepers should, because they know the lamps\./);
    assert.match(out.text, /Farah \S+ Not sent yet Open Farah’s week/);
    assert.match(out.text, /Kofi \S+ Open Kofi’s week Nothing written yet/);
    assert.equal(chloe.weekHref, `${GROUP_PATH}/coursework/chloe?week=3#q-k3-wa`);
    // The filters, each with its count of the people this reader may read.
    assert.deepEqual(view.counts, { everybody: 3, unread: 1, noFeedback: 1, late: 0 });
    assert.match(out.text, /Everybody 3 Not read yet 1 No feedback yet 1 Late 0/);
  });

  test("after the session the draft is read as it stands, said not sent; a reflection written after it is Late", async () => {
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-rp1`, { updatedAt: new Date("2026-11-18T09:00:00Z") });
    w.at("2026-11-18T10:00:00Z");
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-wa" }));
    const farah = rowOf(view, "farah");
    assert.equal(farah.answer.text, FARAH_DRAFT);
    assert.deepEqual([farah.notSent, farah.read, farah.feedback], [true, "unread", "none"]);
    const reflection = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" }));
    assert.equal(rowOf(reflection, "chloe").answer.text, SAID.chloe["k3-rp1"]);
    assert.equal(rowOf(reflection, "chloe").late, true);
    assert.equal(rowOf(reflection, "farah").late, false);
    assert.equal(reflection.counts.late, 1);
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-rp1", late: "1" }))), ["chloe"]);
  });

  test("previous and next step through the week's questions in its own order, keeping the filter", async () => {
    const order = [];
    let at = viewOf(await drawn("claudia", { week: "3" }));
    for (;;) {
      order.push(at.question.id);
      if (!at.nav.nextQuestion) break;
      const next = new URL(at.nav.nextQuestion.href, "https://naisi.invalid");
      at = viewOf(await drawn("claudia", Object.fromEntries(next.searchParams)));
    }
    assert.deepEqual(order, ["k3-rp1", "k3-rp2", "k3-rp3", "k3-rp4", "k3-rp5", "k3-rp6", "k3-wa", "k3-fb1", "k3-fb2"]);
    const filtered = viewOf(await drawn("claudia", { week: "3", question: "k3-wa", unread: "1" }));
    assert.equal(filtered.nav.previousQuestion.href, `${GROUP_PATH}/question?week=3&question=k3-rp6&unread=1`);
    assert.equal(filtered.nav.nextQuestion.href, `${GROUP_PATH}/question?week=3&question=k3-fb1&unread=1`);
    // A question the week does not ask opens its first.
    assert.equal(viewOf(await drawn("claudia", { week: "3", question: "nope" })).question.id, "k3-rp1");
  });

  test("an answer changed since feedback: said on the row, with the way to both versions on the person's week", async () => {
    const T1 = SENT;
    const T2 = new Date("2026-11-18T09:00:00Z");
    w.world.db.seed(
      `courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`,
      answer("chloe", "Keepers should. The town pays.", { sent: T1, saved: T2, earlier: [{ text: CHLOE_ANSWER, words: 7, savedAt: T1, replacedAt: T2, sentAt: T1, reasons: ["reviewed"] }] }),
    );
    w.world.db.seed("courseFeedback/piece-one", {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      on: { kind: "writtenAnswer", itemId: "k3-wa" },
      text: "What about the fog?",
      aboutSavedAt: T1,
      byUid: "rahul",
      byRole: "facilitator",
      createdAt: new Date("2026-11-17T09:00:00Z"),
    });
    w.at("2026-11-18T10:00:00Z");
    const out = await drawn("claudia", { week: "3", question: "k3-wa" });
    const chloe = rowOf(viewOf(out), "chloe");
    assert.equal(chloe.feedback, "changed");
    // Feedback on it says somebody on the team opened it: read, with no time kept.
    assert.match(out.text, /Chloe Nguyen Sent Mon 16 Nov, 9am Changed since feedback Open Chloe’s week/);
    assert.equal(chloe.read, "read");
    assert.match(out.html, new RegExp(`<a href="${GROUP_PATH}/coursework/chloe\\?week=3#q-k3-wa" class="reviewLink">See what changed</a>`));
    // The piece says who wrote it and when, with the version it was about under it, as on the review page.
    assert.match(out.text, /Feedback from Rahul Chloe’s facilitator · Tue 17 Nov What about the fog\?/);
    // Changed since feedback is not "no feedback yet".
    assert.ok(!uidsOf(viewOf(await drawn("claudia", { week: "3", question: "k3-wa", nofeedback: "1" }))).includes("chloe"));
  });
});

describe("2b. changed since feedback: the newest piece alone decides", () => {
  test("Chloe sends v1, Rahul's feedback on it, she changes it to v2, the lead's feedback on v2: the row has feedback, not a change", async () => {
    const T1 = SENT;
    const T2 = new Date("2026-11-18T09:00:00Z");
    w.world.db.seed(
      `courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`,
      answer("chloe", "Keepers should. The town pays.", { sent: T1, saved: T2, earlier: [{ text: CHLOE_ANSWER, words: 7, savedAt: T1, replacedAt: T2, sentAt: T1, reasons: ["reviewed"] }] }),
    );
    const piece = (id, byUid, byRole, aboutSavedAt, createdAt, text) =>
      w.world.db.seed(`courseFeedback/${id}`, {
        runId: RUN.agi,
        uid: "chloe",
        weekId: "w03",
        weekNumber: 3,
        on: { kind: "writtenAnswer", itemId: "k3-wa" },
        text,
        aboutSavedAt,
        byUid,
        byRole,
        createdAt,
      });
    piece("piece-a", "rahul", "facilitator", T1, new Date("2026-11-17T09:00:00Z"), "What about the fog?");
    w.at("2026-11-18T10:00:00Z");
    assert.equal(rowOf(viewOf(await drawn("claudia", { week: "3", question: "k3-wa" })), "chloe").feedback, "changed", "with only the older piece, it has changed since");
    piece("piece-b", "claudia", "lead", T2, new Date("2026-11-18T09:30:00Z"), "Better.");
    for (const who of ["claudia", "rahul", "zach"]) {
      const out = await drawn(who, { week: "3", question: "k3-wa" });
      assert.equal(rowOf(viewOf(out), "chloe").feedback, "given", `${who} is told the answer changed since feedback when the newest piece is about the words shown`);
      assert.ok(!/Chloe Nguyen[^]*?Changed since feedback[^]*?Open Chloe/.test(out.text), `${who}'s row still says Changed since feedback`);
      assert.ok(!out.html.includes(">See what changed<"), `${who}'s row still offers what changed`);
    }
    // The reading view's own panel about the older piece stays true of it, and stays.
    const reading = await w.draw(pages.groupWeek, "claudia", { runId: RUN.agi, groupId: B, uid: "chloe" }, { week: "3" });
    assert.deepEqual(readingOf(reading).changed?.cardIds, ["piece-a"]);
    assert.match(reading.text, /Chloe’s answer has changed since this feedback was written\./);
  });

  test("the rule, pure: the newest piece about earlier words, or a version no longer kept; feedback before pieces existed reads as about the words read", async () => {
    const model = await w.loadTs(join("lib", "courses", "feedback", "model.ts"));
    const about = (savedAt) => ({ about: { text: "x", boxes: null, words: 1, savedAt }, aboutGone: false });
    const now = { about: null, aboutGone: false };
    const READ = "2026-11-18T09:00:00.000Z";
    assert.equal(model.changedSinceFeedback([], READ), false);
    assert.equal(model.changedSinceFeedback([about("2026-11-16T09:00:00.000Z")], READ), true);
    assert.equal(model.changedSinceFeedback([about("2026-11-16T09:00:00.000Z"), now], READ), false, "a newer piece about the words read: no change");
    assert.equal(model.changedSinceFeedback([now, about("2026-11-16T09:00:00.000Z")], READ), true, "the newest piece about earlier words: a change");
    // A piece about the very words read (before the session, the words as sent) is about no change.
    assert.equal(model.changedSinceFeedback([about(READ)], READ), false);
    assert.equal(model.changedSinceFeedback([{ about: null, aboutGone: true }], READ), true);
  });
});

describe("3. when an answer was first read", () => {
  test("the page names exactly the answers it drew in full, and drawing it keeps nothing", async () => {
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-wa" }));
    assert.deepEqual(view.firstRead, { weekId: "w03", people: [{ uid: "chloe", ids: ["k3-wa"] }] });
    const reflection = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" }));
    assert.deepEqual(reflection.firstRead.people, [
      { uid: "chloe", ids: ["k3-rp1"] },
      { uid: "farah", ids: ["k3-rp1"] },
    ]);
    // Under a filter, only the people it keeps were put in front of the reader.
    const filtered = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1", late: "1" }));
    assert.equal(filtered.firstRead, null);
    assert.equal(weekWork("chloe"), null, "drawing the page kept a time");
  });

  test("a facilitator's opening marks the answers read for the next reader, never who: Not read yet, then read", async () => {
    const before = await drawn("sofia", { week: "3", question: "k3-rp1" });
    assert.deepEqual(viewOf(before).rows.map((row) => [row.uid, row.read]), [["chloe", "unread"], ["farah", "unread"], ["kofi", null]]);
    assert.equal((before.text.match(/Not read yet/g) ?? []).length, 3, "the two answers and the filter");
    // Rahul's page names what it drew, as the browser does once it has the page.
    const named = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" })).firstRead;
    const sent = await mark("rahul", named.people);
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(sent.body, { ok: true });
    assert.deepEqual(Object.keys(readAt("chloe")), ["k3-rp1"]);
    // The day it was first read, never the moment: the start of Tue 17 Nov in London.
    assert.equal(readAt("chloe")["k3-rp1"].getTime(), new Date("2026-11-17T00:00:00Z").getTime());
    // The record names nobody who read anything.
    assert.ok(!JSON.stringify(weekWork("chloe")).includes("rahul"), "the week record names who read it");
    assert.deepEqual(Object.keys(weekWork("chloe")).sort(), ["firstReadAt", "runId", "uid", "weekId", "weekNumber"]);
    const after = viewOf(await drawn("sofia", { week: "3", question: "k3-rp1" }));
    assert.deepEqual(after.rows.map((row) => [row.uid, row.read]), [["chloe", "read"], ["farah", "read"], ["kofi", null]]);
    assert.equal(after.counts.unread, 0);
    // Another question of the same week is not read by it.
    assert.equal(rowOf(viewOf(await drawn("sofia", { week: "3", question: "k3-rp2" })), "chloe").read, "unread");
  });

  test("an answer last saved before the site began keeping read times, with none kept: neither read nor unread, and counted by no filter", async () => {
    // Chloe's reflection was last saved on Thu 12 Nov; Farah's on Sun 15 Nov.
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-rp1`, { updatedAt: new Date("2026-11-12T20:00:00Z") });
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" }));
    assert.deepEqual(view.rows.map((row) => [row.uid, row.read]), [["chloe", null], ["farah", "unread"], ["kofi", null]]);
    assert.equal(view.counts.unread, 1, "an answer nobody can say of is counted as not read yet");
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-rp1", unread: "1" }))), ["farah"]);
    const out = await drawn("rahul", { week: "3", question: "k3-rp1" });
    assert.ok(!(/Chloe Nguyen[^]*?Not read yet[^]*?Open Chloe/.test(out.text)), "Chloe's old reflection is drawn as not read yet");
    // It is still drawn in full and named once drawn, so a time is kept from now on.
    assert.equal(rowOf(view, "chloe").answer.text, SAID.chloe["k3-rp1"]);
    assert.ok(view.firstRead.people.some((person) => person.uid === "chloe"));
    await mark("rahul", view.firstRead.people);
    assert.equal(rowOf(viewOf(await drawn("sofia", { week: "3", question: "k3-rp1" })), "chloe").read, "read");
  });

  test("a written answer's review page names the one answer it shows in full; the person can never mark their own", async () => {
    const written = (await w.loadTs(join(GROUP, "written", "page.tsx"))).default;
    const page = await w.draw(written, "rahul", { runId: RUN.agi, groupId: B }, { week: "3", person: "chloe" });
    assert.equal(page.wrote, false, "drawing the review page kept a time");
    const model = find(page.element, "WrittenReview")[0].props.model;
    const named = question.reviewPageFirstRead(model);
    assert.deepEqual(named, { weekId: "w03", people: [{ uid: "chloe", ids: ["k3-wa"] }] });
    assert.equal((await mark("rahul", named.people)).status, 200);
    assert.deepEqual(Object.keys(readAt("chloe")), ["k3-wa"]);
    // Farah's draft cannot be read before the session: the page opens nothing of it, so never names it.
    const farah = find((await w.draw(written, "rahul", { runId: RUN.agi, groupId: B }, { week: "3", person: "farah" })).element, "WrittenReview")[0].props.model;
    assert.notEqual(farah.selected?.person.uid, "farah");
    assert.ok(!(question.reviewPageFirstRead(farah)?.people ?? []).some((person) => person.uid === "farah"), "the review page names a draft nobody may read yet");
    // The person's own call is refused, whatever names it.
    assert.equal((await mark("chloe", named.people)).status, 403);
    // A reader who may not act on it names nothing.
    assert.equal(question.reviewPageFirstRead({ ...model, selected: { ...model.selected, role: { ...model.selected.role, mayReview: false } } }), null);
  });

  test("the reading view of one person's week names every answer it shows in full, for a reader who may act on the work", async () => {
    const view = readingOf(await w.draw(pages.groupWeek, "rahul", { runId: RUN.agi, groupId: B, uid: "chloe" }, { week: "3" }));
    assert.deepEqual(view.firstRead, { weekId: "w03", ids: ["k3-rp1", "k3-rp2", "k3-rp3", "k3-fb1", "k3-wa"] });
    // Farah's draft before the session is not shown in full, so not named.
    const farah = readingOf(await w.draw(pages.groupWeek, "rahul", { runId: RUN.agi, groupId: B, uid: "farah" }, { week: "3" }));
    assert.ok(!farah.firstRead.ids.includes("k3-wa"));
    // The lead's own page on the programme's side names nothing.
    w.world.db.seed(`courseEnrolments/${RUN.agi}__claudia`, enrolment("claudia", B));
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__claudia__w03__k3-wa`, answer("claudia", "Mine."));
    assert.equal(readingOf(await w.draw(pages.programmeWeek, "claudia", { roundId: ROUND, programmeId: AGI, uid: "claudia" }, { week: "3" })).firstRead, null);
  });

  test("who may mark what: the one gate on whose work, each answer's own readers, and nothing the caller may not read in full", async () => {
    // Rahul: Chloe's sent answer, her reflection and box; Farah's draft is hidden before the session, her reflection is not.
    assert.equal((await mark("rahul", [{ uid: "chloe", ids: ["k3-wa", "k3-rp1", "k3-fb1", "k3-fb2", "k3-nope"] }, { uid: "farah", ids: ["k3-wa", "k3-rp1"] }, { uid: "kofi", ids: ["k3-rp1", "k3-wa"] }])).status, 200);
    assert.deepEqual(Object.keys(readAt("chloe")).sort(), ["k3-fb1", "k3-rp1", "k3-wa"], "an empty box or an id the week does not ask was kept");
    assert.deepEqual(Object.keys(readAt("farah")), ["k3-rp1"], "a written answer nobody may read yet was kept as read");
    assert.equal(weekWork("kofi"), null, "nothing written was kept as read");
    // A co-facilitator is answered ok, and nothing of a facilitator's own work is kept.
    assert.deepEqual((await mark("sofia", [{ uid: "rahul", ids: ["k3-wa", "k3-rp1"] }])).body, { ok: true });
    assert.equal(weekWork("rahul"), null, "a co-facilitator marked a facilitator's own work read");
    // The lead and an admin read a facilitator's own.
    assert.equal((await mark("claudia", [{ uid: "rahul", ids: ["k3-wa"] }])).status, 200);
    assert.deepEqual(Object.keys(readAt("rahul")), ["k3-wa"]);
    assert.equal((await mark("zach", [{ uid: "sofia", ids: ["k3-rp1"] }])).status, 200);
    assert.deepEqual(Object.keys(readAt("sofia")), ["k3-rp1"]);
    // Tom facilitates Group C: admitted to the run, and nothing of Group B's is his to mark.
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__kofi__w03__k3-rp1`, { ...answer("kofi", "x"), exerciseId: "k3-rp1", kind: "reflection", text: "Kofi wrote one." });
    assert.deepEqual((await mark("tom", [{ uid: "kofi", ids: ["k3-rp1"] }])).body, { ok: true });
    assert.equal(weekWork("kofi"), null, "a facilitator of another group marked this group's work");
  });

  test("refusals: signed out, a view-as session, the person's own call, anybody who reads nobody's work, and a body that does not say", async () => {
    const before = w.everything();
    assert.equal((await mark(null, [{ uid: "chloe", ids: ["k3-wa"] }])).status, 401);
    assert.equal((await mark("zach", [{ uid: "chloe", ids: ["k3-wa"] }], { viewAs: true })).status, 403);
    assert.equal((await mark("rahul", [{ uid: "rahul", ids: ["k3-wa"] }])).status, 403, "a facilitator marked their own work read");
    assert.equal((await mark("zach", [{ uid: "chloe", ids: ["k3-wa"] }, { uid: "zach", ids: ["k3-wa"] }])).status, 403, "an admin's call naming their own work went through");
    assert.equal((await mark("chloe", [{ uid: "chloe", ids: ["k3-wa"] }])).status, 403, "the person marked their own work read");
    for (const who of ["chloe", "amara", "yusuf", "lloyd"]) assert.equal((await mark(who, [{ uid: "farah", ids: ["k3-rp1"] }])).status, 403, `${who} reads nobody's work and was admitted`);
    for (const body of [{}, { weekId: "w03" }, { weekId: "week-3", people: [{ uid: "chloe", ids: ["k3-wa"] }] }, { weekId: "w03", people: [{ uid: "chloe", ids: [] }] }, { weekId: "w03", people: [{ uid: "a/b", ids: ["k3-wa"] }] }]) {
      assert.equal((await w.call("rahul", routes.firstRead.POST, { runId: RUN.agi }, { body, course: true })).status, 400, JSON.stringify(body));
    }
    assert.equal(w.everything(), before, "a refused call kept something");
  });

  test("before the site has begun keeping read times nothing is not read yet; the first call makes the document once, and nothing moves it", async () => {
    w.reset(seedWithoutTheInstant());
    assert.equal(w.world.db.read(KEPT_DOC), undefined);
    const before = viewOf(await drawn("rahul", { week: "3", question: "k3-rp1" }));
    assert.deepEqual(before.rows.map((row) => [row.uid, row.read]), [["chloe", null], ["farah", null], ["kofi", null]]);
    assert.equal(before.counts.unread, 0);
    assert.equal(w.world.db.read(KEPT_DOC), undefined, "drawing the page made the document");
    // The page's own call makes it, with the server's time, before any day is kept.
    w.at("2026-11-17T12:34:56Z");
    assert.equal((await mark("rahul", before.firstRead.people)).status, 200);
    const made = w.world.db.read(KEPT_DOC).keptSince;
    assert.equal(made.getTime(), new Date("2026-11-17T12:34:56Z").getTime(), "the document holds the server's exact time");
    assert.deepEqual(Object.keys(readAt("chloe")), ["k3-rp1"]);
    // Answers saved before it stay with no state; one saved after it is not read yet.
    w.at("2026-11-17T14:00:00Z");
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__farah__w03__k3-rp2`, { updatedAt: new Date("2026-11-17T13:00:00Z") });
    const after = viewOf(await drawn("sofia", { week: "3", question: "k3-rp2" }));
    assert.deepEqual(after.rows.map((row) => [row.uid, row.read]), [["chloe", null], ["farah", "unread"], ["kofi", null]]);
    // Later calls, by anybody, never move it.
    w.at("2026-11-19T10:00:00Z");
    await mark("claudia", [{ uid: "farah", ids: ["k3-rp2"] }]);
    await mark("zach", [{ uid: "chloe", ids: ["k3-rp2"] }]);
    assert.equal(w.world.db.read(KEPT_DOC).keptSince.getTime(), made.getTime(), "a later call moved the instant");
    // A refused call never makes it.
    w.reset(seedWithoutTheInstant());
    for (const who of [null, "chloe", "yusuf"]) await mark(who, [{ uid: "farah", ids: ["k3-rp1"] }]);
    await mark("zach", [{ uid: "chloe", ids: ["k3-rp1"] }], { viewAs: true });
    assert.equal(w.world.db.read(KEPT_DOC), undefined, "a refused call made the document");
  });

  test("an answer is held against the instant by when it became readable in the words shown, not when it was saved", async () => {
    // The site began keeping read times at noon on Mon 16 Nov.
    w.world.db.seed(KEPT_DOC, { keptSince: new Date("2026-11-16T12:00:00Z") });
    // Chloe drafted hers on Sun 15 Nov and sent it on Mon 16 Nov at 2pm, after the instant: nobody could have read it before.
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`, answer("chloe", CHLOE_ANSWER, { sent: new Date("2026-11-16T14:00:00Z"), saved: new Date("2026-11-15T10:00:00Z") }));
    // Rahul's was sent at 9am, before it.
    const view = viewOf(await drawn("claudia", { week: "3", question: "k3-wa" }));
    assert.equal(rowOf(view, "chloe").read, "unread", "an answer sent after the instant has no read state");
    assert.equal(rowOf(view, "rahul").read, null, "an answer sent before the instant reads as not read");
    // Farah never sent hers (saved Mon 16 Nov, 8pm, after it); once Group B's session starts it is read as it stands: not read yet.
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__farah__w03__k3-wa`, { updatedAt: new Date("2026-11-15T20:00:00Z") });
    w.at("2026-11-18T10:00:00Z");
    const atSession = viewOf(await drawn("claudia", { week: "3", question: "k3-wa" }));
    assert.equal(rowOf(atSession, "farah").read, "unread", "a draft first readable at its session, after the instant, has no read state");
  });

  test("an id too long to name a document is a malformed body: refused, and nothing written for anybody", async () => {
    const before = w.everything();
    const long = "x".repeat(129);
    for (const people of [[{ uid: "chloe", ids: ["k3-wa"] }, { uid: long, ids: ["k3-wa"] }], [{ uid: "chloe", ids: ["k3-wa", long] }]]) {
      assert.equal((await mark("rahul", people)).status, 400, JSON.stringify(people).slice(0, 80));
    }
    assert.equal(w.everything(), before);
    // At the limit, the call is read (and nobody of that id is the reader's to mark).
    assert.equal((await mark("rahul", [{ uid: "x".repeat(128), ids: ["k3-wa"] }])).status, 200);
  });

  test("a second call moves nothing: a time once kept never changes", async () => {
    await mark("rahul", [{ uid: "chloe", ids: ["k3-wa"] }]);
    const first = readAt("chloe")["k3-wa"].getTime();
    w.at("2026-11-19T10:00:00Z");
    await mark("claudia", [{ uid: "chloe", ids: ["k3-wa", "k3-rp2"] }]);
    assert.equal(readAt("chloe")["k3-wa"].getTime(), first, "a second reader moved the first time");
    assert.equal(readAt("chloe")["k3-rp2"].getTime(), new Date("2026-11-19T00:00:00Z").getTime());
    const again = w.everything();
    await mark("zach", [{ uid: "chloe", ids: ["k3-wa", "k3-rp2"] }]);
    assert.equal(w.everything(), again, "a call with nothing missing wrote something");
  });

  test("the tree: no page or loader calls the writer; only the browser's beacon calls the route", () => {
    const callers = [];
    const fetchers = [];
    for (const file of walkSource(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
      if (/\bmarkFirstRead\s*\(/.test(code) && rel !== "lib/courses/weekWork/firstRead.ts") callers.push(rel);
      if (/\/first-read[`"']/.test(code)) fetchers.push(rel);
    }
    assert.deepEqual(callers, ["app/api/courses/runs/[runId]/first-read/route.ts"]);
    assert.deepEqual(fetchers, ["features/courses/coursework/MarkFirstRead.tsx"]);
    // The pages that draw the beacon: the two reading pages and a written answer's review page.
    const beacons = [];
    for (const file of walkSource(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (/<MarkFirstRead\b/.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) beacons.push(rel);
    }
    assert.deepEqual(beacons.sort(), [
      "features/courses/coursework/QuestionView.tsx",
      "features/courses/coursework/ReadingView.tsx",
      "features/courses/written/WrittenReview.tsx",
    ]);
    assert.match(codeOf("features/courses/written/WrittenReview.tsx"), /const firstRead = reviewPageFirstRead\(model\);/);
    // The beacon is a client component that sends from an effect, never while the page is drawn.
    const beacon = codeOf("features/courses/coursework/MarkFirstRead.tsx");
    assert.match(beacon, /^"use client";/);
    assert.ok(beacon.indexOf("useEffect(") !== -1 && beacon.indexOf("useEffect(") < beacon.indexOf("fetch("), "the beacon sends outside an effect");
    // The route refuses view-as before anything else.
    const route = codeOf("app/api/courses/runs/[runId]/first-read/route.ts");
    const post = route.slice(route.indexOf("export async function POST("));
    assert.ok(post.indexOf("assertNotImpersonating()") !== -1 && post.indexOf("assertNotImpersonating()") < post.indexOf("getCurrentUser()"));
    // The loaders and the pages write nothing and record no opening.
    for (const path of ["lib/courses/coursework/questionLoad.ts", "app/(app)/learn/[runId]/group/[groupId]/question/page.tsx", "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/question/page.tsx"]) {
      assert.doesNotMatch(
        codeOf(path),
        /\.doc\([^)]*\)\s*\.(?:set|update|create|delete)\(|\.collection\([^)]*\)\s*\.add\(|\b(?:batch|runTransaction)\(|sendEmail|sendNotice|openRecorded|markFirstRead/,
        `${path} writes`,
      );
    }
    // The route asks the one gate on whose work, and each answer's own readers.
    const store = codeOf("lib/courses/weekWork/firstRead.ts");
    for (const reader of ["feedbackGate(", "feedbackWeekOf(", "boxesReaderFor(", "feedbackStandingIn(", "feedbackRefusalFor("]) assert.ok(store.includes(reader), `the writer no longer asks ${reader}`);
  });
});

describe("4. feedback written from the page is read back, and the filters follow it", () => {
  test("a facilitator saves a piece on an answer through the route; the row is theirs to change and no longer waits", async () => {
    const out = await drawn("rahul", { week: "3", question: "k3-wa", nofeedback: "1" });
    assert.deepEqual(uidsOf(viewOf(out)), ["chloe"]);
    assert.match(out.html, /<summary>Add feedback<\/summary>/);
    const saved = await w.call("rahul", routes.feedback.POST, { runId: RUN.agi }, { body: { uid: "chloe", weekId: "w03", on: "writtenAnswer", itemId: "k3-wa", text: "Name the keeper." }, course: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const after = viewOf(await drawn("rahul", { week: "3", question: "k3-wa" }));
    const chloe = rowOf(after, "chloe");
    assert.equal(chloe.own?.text, "Name the keeper.");
    assert.equal(chloe.feedback, "given");
    assert.equal(after.counts.noFeedback, 0);
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-wa", nofeedback: "1" }))), []);
    // The lead reads it on the row, signed as Chloe reads it.
    const lead = await drawn("claudia", { week: "3", question: "k3-wa" }, "programme");
    assert.match(lead.text, /Feedback given Open Chloe’s week .*Feedback from Rahul Chloe’s facilitator · Tue 17 Nov Name the keeper\. Not emailed yet/);
  });

  test("the two states are independent: read and no feedback, unread and with feedback, and both filters together", async () => {
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, { runId: RUN.agi, uid: "chloe", weekId: "w03", weekNumber: 3, firstReadAt: { "k3-wa": NOW } });
    w.world.db.seed(`courseExerciseResponses/${RUN.agi}__kofi__w03__k3-wa`, answer("kofi", "Kofi's answer, sent."));
    w.world.db.seed("courseFeedback/piece-kofi", {
      runId: RUN.agi,
      uid: "kofi",
      weekId: "w03",
      weekNumber: 3,
      on: { kind: "writtenAnswer", itemId: "k3-wa" },
      text: "Short and clear.",
      aboutSavedAt: SENT,
      byUid: "sofia",
      byRole: "facilitator",
      createdAt: new Date("2026-11-16T20:00:00Z"),
    });
    // Kofi's has feedback and no time kept: somebody on the team opened it to write that, so it is read.
    const view = viewOf(await drawn("rahul", { week: "3", question: "k3-wa" }));
    assert.deepEqual(view.rows.map((row) => [row.uid, row.read, row.feedback]), [["chloe", "read", "none"], ["farah", null, null], ["kofi", "read", "given"]]);
    assert.deepEqual(view.counts, { everybody: 3, unread: 0, noFeedback: 1, late: 0 });
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-wa", nofeedback: "1" }))), ["chloe"]);
    // A rating is no sign of reading: Chloe's, rated by the lead and with no time kept, is not read.
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, { runId: RUN.agi, uid: "chloe", weekId: "w03", weekNumber: 3 });
    w.world.db.seed(`courseWorkRatings/${RUN.agi}__chloe__w03__claudia`, {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      itemId: "k3-wa",
      raterUid: "claudia",
      raterRole: "lead",
      rating: 6,
      comment: "Clear.",
      aboutSavedAt: SENT,
      programmeLabel: "AGI Strategy",
      createdAt: new Date("2026-11-16T21:00:00Z"),
      updatedAt: new Date("2026-11-16T21:00:00Z"),
    });
    assert.deepEqual(viewOf(await drawn("rahul", { week: "3", question: "k3-wa" })).rows.map((row) => [row.uid, row.read]), [["chloe", "unread"], ["farah", null], ["kofi", "read"]]);
    assert.deepEqual(viewOf(await drawn("claudia", { week: "3", question: "k3-wa" })).rows.find((row) => row.uid === "chloe").read, "unread");
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, { runId: RUN.agi, uid: "chloe", weekId: "w03", weekNumber: 3, firstReadAt: { "k3-wa": NOW } });
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-wa", unread: "1" }))), []);
    assert.deepEqual(uidsOf(viewOf(await drawn("rahul", { week: "3", question: "k3-wa", unread: "1", nofeedback: "1" }))), []);
    const both = await drawn("rahul", { week: "3", question: "k3-wa", unread: "1", nofeedback: "1" });
    assert.match(both.text, /Nobody here matches that\./);
    // Each filter says whether it is on as a toggle does, never as the current page: two on at once is true of toggles.
    const pressed = [...both.html.matchAll(/role="button" aria-pressed="(true|false)"[^>]*>([^<]+)/g)].map((m) => [m[2].trim(), m[1]]);
    assert.deepEqual(pressed, [["Everybody", "false"], ["Not read yet", "true"], ["No feedback yet", "true"], ["Late", "false"]]);
    assert.doesNotMatch(both.html.slice(both.html.indexOf("Show whose answers")), /aria-current="page"[^>]*>(?:Everybody|Not read yet|No feedback yet|Late)\b/);
    // Each filter link switches its own and keeps the other.
    assert.equal(viewOf(both).filterHrefs.unread, `${GROUP_PATH}/question?week=3&question=k3-wa&nofeedback=1`);
    assert.equal(viewOf(both).filterHrefs.everybody, `${GROUP_PATH}/question?week=3&question=k3-wa`);
  });
});

describe("5. the switch, on both views", () => {
  test("from one person's week to one question of their group, landing on them; and back, landing on the question", async () => {
    const reading = await w.draw(pages.groupWeek, "rahul", { runId: RUN.agi, groupId: B, uid: "farah" }, { week: "3" });
    assert.equal(readingOf(reading).questionHref, `${GROUP_PATH}/question?week=3#p-farah`);
    assert.match(reading.html, /<span class="segmentOn" aria-current="page">One person, one week<\/span>/);
    assert.match(reading.html, new RegExp(`<a href="${GROUP_PATH}/question\\?week=3#p-farah" class="segment">One question, whole group</a>`));
    const programme = readingOf(await w.draw(pages.programmeWeek, "claudia", { roundId: ROUND, programmeId: AGI, uid: "farah" }, { week: "3" }));
    assert.equal(programme.questionHref, `${PROGRAMME_PATH}/question?group=${B}&week=3#p-farah`);
    // The row it lands on carries the person's id.
    const out = await drawn("rahul", { week: "3" });
    assert.match(out.html, /<section id="p-farah"/);
    // And back: the first person shown, on the same week, at the question.
    assert.equal(viewOf(out).nav.personWeek, `${GROUP_PATH}/coursework/chloe?week=3#q-k3-rp1`);
    assert.match(out.html, /<span class="segmentOn" aria-current="page">One question, whole group<\/span>/);
    const filtered = viewOf(await drawn("rahul", { week: "3", question: "k3-wa", nofeedback: "1" }));
    assert.equal(filtered.nav.personWeek, `${GROUP_PATH}/coursework/chloe?week=3#q-k3-wa`);
    // The reading view carries the id each question's answer lands on.
    assert.match(reading.html, /id="q-k3-rp1"/);
    assert.match(reading.html, /<section id="q-k3-wa" class="card" aria-labelledby="reading-answer">/);
  });

  test("somebody in no group this reader may see: no question page to switch to, so no switch", async () => {
    // Una is placed in a group Publish has not told her about: to the lead she is in no group yet.
    const out = await w.draw(pages.programmeWeek, "claudia", { roundId: ROUND, programmeId: AGI, uid: "una" }, { week: "3" });
    const view = readingOf(out);
    assert.ok(view, out.text.slice(0, 200));
    assert.equal(view.person.groupName, null);
    assert.equal(view.questionHref, null);
    assert.doesNotMatch(out.html, /One question, whole group/);
  });
});

describe("6. the member's side: nothing the person is sent names a read time", () => {
  const STAMP = new Date("2026-11-17T11:11:11.111Z");

  test("their own routes and week page, with every answer of theirs marked read", async () => {
    w.world.db.seed(`courseWeekWork/${RUN.agi}__chloe__w03`, {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      reviewedVersions: {},
      firstReadAt: { "k3-wa": STAMP, "k3-rp1": STAMP, "k3-rp2": STAMP, "k3-fb1": STAMP },
    });
    const ask = (handler, params, options = {}) => w.call("chloe", handler, { runId: RUN.agi, ...params }, { course: true, ...options });
    /** A GET with a query, as the week page asks: the world's own `call` sends none. */
    async function askWithQuery(handler, query) {
      w.world.user = w.sessionOf("chloe");
      w.world.course = true;
      try {
        const response = await handler(new Request(`https://naisi.invalid/api${query}`, { method: "GET" }), { params: Promise.resolve({ runId: RUN.agi }) });
        return { status: response.status, body: structuredClone(response.body) };
      } finally {
        w.world.course = false;
      }
    }
    const answers = [
      ["overview", await ask(routes.overview.GET, {})],
      ["my-exercises", await askWithQuery(routes.myExercises.GET, "?week=3")],
      ["a reflection saved", await ask(routes.reflection.PUT, { promptId: "k3-rp3" }, { body: { weekId: "w03", text: "Still thinking." } })],
      ["the written answer saved", await ask(routes.written.PUT, { answerId: "k3-wa" }, { body: { weekId: "w03", text: "Keepers should, and the town." } })],
    ];
    // The answers carry her week: what the check reads is her own work, read back to her.
    assert.ok(JSON.stringify(answers[1][1].body).includes(SAID.chloe["k3-rp1"]), "my-exercises did not answer with her week");
    const marks = [STAMP.toISOString(), String(STAMP.getTime()), "11:11", "firstRead", "Not read yet", "first read"];
    for (const [what, answer] of answers) {
      assert.equal(answer.status, 200, `${what}: ${JSON.stringify(answer.body)}`);
      const said = JSON.stringify(answer.body);
      for (const words of marks) assert.ok(!said.includes(words), `${what} sends Chloe ${words}`);
    }
    // Her week page as it is drawn for her.
    const week = await w.draw((await w.loadTs(join("app", "(app)", "learn", "[runId]", "weeks", "[n]", "page.tsx"))).default, "chloe", { runId: RUN.agi, n: "3" });
    for (const words of marks) assert.ok(!week.html.includes(words), `her week page names ${words}`);
    // The time is still where it was: her own saves never touch it.
    assert.equal(w.world.db.read(`courseWeekWork/${RUN.agi}__chloe__w03`).firstReadAt["k3-wa"].getTime(), STAMP.getTime());
  });

  test("the record as every reader of a person's own record reads it never carries the times", () => {
    const record = weekWorkStore.normalizeCourseWeekWork("x", { runId: "r", uid: "u", weekId: "w03", weekNumber: 3, firstReadAt: { "k3-wa": STAMP } });
    assert.ok(!Object.keys(record).some((key) => /read/i.test(key)), "the normaliser carries a read time");
    assert.ok(!JSON.stringify(record).includes(STAMP.toISOString()));
  });

  test("the tree: every page and route that can reach the store of the times is one for the people who may read the answers", () => {
    const store = join(SRC, "lib", "courses", "weekWork", "firstRead.ts");
    const { reached, unresolved } = importersOf([store]);
    assert.deepEqual(unresolved, [], "the walk could not place an import: it would go quiet past it");
    const doors = [...reached.keys()]
      .map((file) => relative(SRC, file).split(sep).join("/"))
      .filter((rel) => rel.startsWith("app/") && /\/(?:page|route|layout)\.tsx?$/.test(rel))
      .sort();
    const READERS = {
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/coursework/page.tsx":
        "the Coursework tab: an admin or the programme's lead, the flags and the list of what waits worked out on the server for the people the one gate lets them read, never their own row; handed whether a flag is true, never a time or who",
      "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/question/page.tsx":
        "one question across a group on the programme's side: an admin or the programme's lead, and only the answers the one gate lets them read, never their own",
      "app/(app)/learn/[runId]/group/[groupId]/question/page.tsx":
        "one question across a group on the group's side: its live facilitators, the lead and admins, and only the answers the one gate lets them read, never their own",
      "app/api/courses/runs/[runId]/first-read/route.ts": "the writer: answers ok and nothing else, never a time",
    };
    assert.deepEqual(doors, Object.keys(READERS).sort(), "a page or route the person may open can reach the times an answer was first read");
    // Every file naming the field is the store, or says what the field is.
    const naming = [];
    for (const file of walkSource(SRC)) {
      const rel = relative(SRC, file).split(sep).join("/");
      if (/\bfirstReadAt\b|["']firstReadAt["']/.test(stripSource(readFileSync(file, "utf8"), { keepStrings: true }))) naming.push(rel);
    }
    assert.deepEqual(naming, ["lib/courses/weekWork/firstRead.ts"], "a file other than the store names the field");
  });
});

describe("7. the filters and counts, as pure functions", () => {
  const READS = ["unread", "read", null];
  const FEEDBACKS = ["none", "given", "changed", null];
  const rows = [];
  for (const read of READS) for (const feedback of FEEDBACKS) for (const late of [false, true]) rows.push({ read, feedback, late, key: `${read}/${feedback}/${late}` });

  test("every combination of the three filters keeps exactly the rows with every chosen state, each state apart from the others", () => {
    for (const unread of [false, true]) {
      for (const noFeedback of [false, true]) {
        for (const late of [false, true]) {
          const filter = { unread, noFeedback, late };
          const kept = question.filterRows(rows, filter).map((row) => row.key);
          const expected = rows
            .filter((row) => (!unread || row.read === "unread") && (!noFeedback || row.feedback === "none") && (!late || row.late))
            .map((row) => row.key);
          assert.deepEqual(kept, expected, JSON.stringify(filter));
        }
      }
    }
    // Read or not says nothing of feedback, and the other way round.
    assert.deepEqual(question.filterRows(rows, { unread: true, noFeedback: false, late: false }).map((row) => row.feedback).sort(), [...FEEDBACKS, ...FEEDBACKS].sort());
    assert.deepEqual(question.filterRows(rows, { unread: false, noFeedback: true, late: false }).map((row) => row.read), ["unread", "unread", "read", "read", null, null]);
  });

  test("each count is of every row, whatever is chosen", () => {
    assert.deepEqual(question.filterCounts(rows), { everybody: 24, unread: 8, noFeedback: 6, late: 12 });
    assert.deepEqual(question.filterCounts([]), { everybody: 0, unread: 0, noFeedback: 0, late: 0 });
  });

  test("the states from what was read: nothing shown is neither read nor unread, and only a written answer takes feedback", () => {
    const KEPT = KEPT_SINCE;
    const BEFORE = new Date(KEPT.getTime() - 60_000);
    const AFTER = new Date(KEPT.getTime() + 60_000);
    const state = (input, keptFrom = KEPT) => question.readStateOf({ shownInFull: true, readSince: null, readableSince: AFTER, feedbackPieces: 0, ...input }, keptFrom);
    // Not shown in full: neither, whatever else is so.
    assert.equal(state({ shownInFull: false, readSince: NOW, feedbackPieces: 2 }), null);
    // Readable since times were kept: unread until a time is kept, or feedback is written on it.
    assert.equal(state({}), "unread");
    assert.equal(state({ readableSince: KEPT }), "unread", "an answer readable at the very instant times began reads as not read");
    assert.equal(state({ readSince: NOW }), "read");
    assert.equal(state({ feedbackPieces: 1 }), "read");
    // Readable before: nobody can say, unless a time is kept or feedback was written on it.
    assert.equal(state({ readableSince: BEFORE }), null);
    assert.equal(state({ readableSince: null }), null, "an answer readable at a time nobody knows reads as not read");
    assert.equal(state({ readableSince: BEFORE, readSince: NOW }), "read");
    assert.equal(state({ readableSince: BEFORE, feedbackPieces: 1 }), "read");
    // No instant yet (the site has not begun keeping read times): nothing is not read yet, and what is known still is.
    assert.equal(state({}, null), null, "an answer reads as not read yet before the site began keeping read times");
    assert.equal(state({ readSince: NOW }, null), "read");
    assert.equal(state({ feedbackPieces: 1 }, null), "read");
    // Either side of an instant.
    assert.equal(state({ readableSince: BEFORE }, new Date(0)), "unread");
    assert.equal(state({ readableSince: AFTER }, new Date("2030-01-01T00:00:00Z")), null);
    // When an answer became readable in the words shown.
    const at = (iso) => new Date(iso);
    assert.deepEqual(question.readableSinceOf({ kind: "box", savedAt: at("2026-11-12T10:00:00Z") }), at("2026-11-12T10:00:00Z"));
    assert.equal(question.readableSinceOf({ kind: "box", savedAt: null }), null);
    // A draft saved before and sent after: readable since its send.
    assert.deepEqual(question.readableSinceOf({ kind: "answer", savedAt: at("2026-11-12T10:00:00Z"), lastSentAt: at("2026-11-14T10:00:00Z"), sessionStart: at("2026-11-17T18:00:00Z") }), at("2026-11-14T10:00:00Z"));
    // Never sent as it is: readable since the start of its session.
    assert.deepEqual(question.readableSinceOf({ kind: "answer", savedAt: at("2026-11-12T10:00:00Z"), lastSentAt: null, sessionStart: at("2026-11-17T18:00:00Z") }), at("2026-11-17T18:00:00Z"));
    // Changed after it was sent, and not sent again: the words shown were never sent, so their session.
    assert.deepEqual(question.readableSinceOf({ kind: "answer", savedAt: at("2026-11-18T10:00:00Z"), lastSentAt: at("2026-11-12T10:00:00Z"), sessionStart: at("2026-11-17T18:00:00Z") }), at("2026-11-18T10:00:00Z"));
    // Sent long after its session: its send.
    assert.deepEqual(question.readableSinceOf({ kind: "answer", savedAt: at("2026-11-12T10:00:00Z"), lastSentAt: at("2026-11-20T10:00:00Z"), sessionStart: at("2026-11-17T18:00:00Z") }), at("2026-11-20T10:00:00Z"));
    assert.equal(question.feedbackStateOf({ takesFeedback: false, pieces: 2, changed: true }), null);
    assert.equal(question.feedbackStateOf({ takesFeedback: true, pieces: 0, changed: false }), "none");
    assert.equal(question.feedbackStateOf({ takesFeedback: true, pieces: 1, changed: false }), "given");
    assert.equal(question.feedbackStateOf({ takesFeedback: true, pieces: 1, changed: true }), "changed");
    assert.deepEqual(question.readQuestionFilter({ unread: "1", nofeedback: ["1"], late: "0" }), { unread: true, noFeedback: false, late: false });
    assert.equal(question.questionHref("/x/question?group=g", { weekNumber: 2, questionId: "q", filter: { unread: true, noFeedback: true, late: true } }), "/x/question?group=g&week=2&question=q&unread=1&nofeedback=1&late=1");
    assert.deepEqual(question.toggled({ unread: true, noFeedback: false, late: false }, "unread"), { unread: false, noFeedback: false, late: false });
  });
});

describe("8. the words the browser spec reads, as the product says them", () => {
  test("each string tests/e2e/course-hub-coursework.spec.mjs matches on these pages is the product's own, apostrophes and all", async () => {
    const feedback = await w.loadTs(join("lib", "courses", "feedback", "words.ts"));
    const weekWords = await w.loadTs(join("lib", "courses", "weekWork", "words.ts"));
    assert.deepEqual(
      [words.NOT_READ_YET, words.WAITING_FOR_FEEDBACK, words.EVERYBODY, weekWords.LATE, words.ADD_FEEDBACK, words.ONE_PERSON_ONE_WEEK, words.ONE_QUESTION_WHOLE_GROUP],
      ["Not read yet", "No feedback yet", "Everybody", "Late", "Add feedback", "One person, one week", "One question, whole group"],
    );
    assert.deepEqual([words.ONE_QUESTION_TITLE, words.NEXT_QUESTION, words.PREVIOUS_QUESTION, words.CHANGED_SINCE_FEEDBACK], ["One question, the whole group", "Next question", "Previous question", "Changed since feedback"]);
    assert.equal(words.openWeekWords("Ada"), "Open Ada’s week");
    assert.deepEqual([feedback.SAVE_FEEDBACK, feedback.SAVE_CHANGES, feedback.COMMENT], ["Save feedback", "Save changes", "Comment"]);
    assert.equal(words.questionOfWords(1, 4), "Question 1 of 4");
    assert.equal(words.partHeadingWords(1, "Start with what you think"), "Part 1: Start with what you think");
    assert.deepEqual([words.WAYS_TO_READ, words.SHOW_WHOSE_ANSWERS, words.NOBODY_HERE, words.NOTHING_WRITTEN_YET], ["Ways to read", "Show whose answers", "Nobody here matches that.", "Nothing written yet"]);
    // The spec's fixture makes sure the site has begun keeping read times: the document the site reads.
    const core = await import("../scripts/e2e-fixtures/core.mjs");
    const store = await w.loadTs(join("lib", "courses", "weekWork", "firstRead.ts"));
    assert.deepEqual([core.READ_TIMES_CONFIG_COLLECTION, core.READ_TIMES_CONFIG_DOC_ID], [store.FIRST_READ_TIMES_DOC.collection, store.FIRST_READ_TIMES_DOC.doc]);
    assert.equal(`${store.FIRST_READ_TIMES_DOC.collection}/${store.FIRST_READ_TIMES_DOC.doc}`, KEPT_DOC);
    for (const line of [words.NOTHING_WRITTEN_YET, words.NOBODY_TO_READ, words.SEE_WHAT_CHANGED, words.RATE, words.questionOfWords(2, 9)]) {
      assert.doesNotMatch(line, /[–—]/, line);
    }
  });
});
