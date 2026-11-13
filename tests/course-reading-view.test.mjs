/**
 * The reading view: one person, one week (Fri 13 Nov 2026), reached from the
 * programme's side (`.../coursework/[uid]?week=N`) and from the group's
 * (`/learn/[runId]/group/[groupId]/coursework/[uid]?week=N`), one loader
 * behind both (`src/lib/courses/coursework/readingLoad.ts`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. WHO OPENS THE GROUP'S SIDE: the group's written review page's own gate
 *     (its live facilitator, the programme's lead, an admin), then, for the
 *     person named, `writtenReviewRole`: a co-facilitator never reads a
 *     facilitator's own work, a facilitator of another group never reads this
 *     one's, a run's track lead with no other role, a member and the person
 *     themselves are sent to the run's home, and somebody signed out to sign
 *     in. Nothing writes.
 *  2. WHAT EACH READER IS SENT: ratings for the team never to a facilitator;
 *     private notes never to the lead; Claude's draft grade and the sealed
 *     prediction's row to admins alone, on either side.
 *  3. THE SAME ANSWERS AS THE OLD PAGES: the written answer's words as the
 *     group's review page reads them, the reflections as the page with names
 *     reads them, and the same week on both sides for the same reader.
 *  4. FEEDBACK WRITTEN THERE IS READ BACK, through the feedback route.
 *  5. AN ANSWER CHANGED SINCE FEEDBACK: both versions, what changed said in
 *     words and marked, the feedback about the earlier version under it.
 *  6. NOTHING WRITTEN YET: the empty state, when they were last reminded, and
 *     Remind for one person and one week where its own rule reaches them.
 *  7. THE PURE PIECES: the comparison in words, the week opened when none is
 *     named, previous and next.
 *  8. THE TREE: the group's page gates before the loader, and the loader asks
 *     the one gate before it reads anybody's week.
 *
 * Real: both pages, the loaders, the review page and the page with names,
 * the feedback route, rendered to HTML. Faked: see
 * `tests/lib/facilitatorWeekWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";
import { C, facilitatorSeed, find } from "./lib/facilitatorPagesWorld.mjs";
import { A, AGI, B, NOTED, NOW, ROUND, RUN, SAID, facilitatorWeekSeed, makeFacilitatorWeekWorld } from "./lib/facilitatorWeekWorld.mjs";
import { COURSE, enrolment } from "./lib/hubAttendanceWorld.mjs";
import { weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const codeOf = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeFacilitatorWeekWorld("__readingViewSuite");
const GROUP = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const pages = {
  group: (await w.loadTs(join(GROUP, "coursework", "[uid]", "page.tsx"))).default,
  programme: (await w.loadTs(join(PROGRAMME, "coursework", "[uid]", "page.tsx"))).default,
  written: (await w.loadTs(join(GROUP, "written", "page.tsx"))).default,
};
const reading = await w.loadTs(join("lib", "courses", "coursework", "reading.ts"));
const words = await w.loadTs(join("lib", "courses", "coursework", "words.ts"));
const feedbackRoute = await w.courseRoute("runs", "[runId]", "feedback");

const run = (text, marks = {}) => ({ text, ...marks });
const p = (...runs) => ({ type: "p", runs });

/** Week 3, as the coursework suite writes it: week 1's shape, a written answer and two boxes in a fourth part. */
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

const CHLOE_ANSWER = "Keepers should, because they know the lamps.";
const SENT = new Date("2026-11-16T09:00:00Z");

/** A written answer as its routes store one. */
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
    submittedAt: sent,
    firstSentAt: sent,
    sentAt: sent,
    updatedAt: saved,
    reviewStatus: "unreviewed",
    ...(earlier.length > 0 ? { earlierVersions: earlier } : {}),
  };
}

const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 32);

function seed() {
  return facilitatorWeekSeed({
    [`courseRuns/${RUN.agi}/weeks/w03`]: weekThree(),
    [`courseRuns/${RUN.agi}/weeks/w01`]: { ...weekThree(), weekNumber: 1, title: "The first lamps", blocks: weekOneBlocks("k1") },
    [`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`]: answer("chloe", CHLOE_ANSWER),
    [`courseExerciseResponses/${RUN.agi}__rahul__w03__k3-wa`]: answer("rahul", "The town, through the harbour board."),
  });
}

beforeEach(() => w.reset(seed()));

const groupPage = (who, uid, { groupId = B, week } = {}) =>
  w.draw(pages.group, who, { runId: RUN.agi, groupId, uid }, week === undefined ? {} : { week: String(week) });
const programmePage = (who, uid, { week } = {}) =>
  w.draw(pages.programme, who, { roundId: ROUND, programmeId: AGI, uid }, week === undefined ? {} : { week: String(week) });
const viewOf = (drawn) => find(drawn.element, "ReadingView")[0]?.props.view ?? null;
/** What the reading view draws, one level down: its client components and their props. */
const insideOf = (drawn) => {
  const view = find(drawn.element, "ReadingView")[0];
  return view ? view.type(view.props) : null;
};
const RUN_HOME = `/learn/${RUN.agi}`;

/** Where the group's side sent `who` for `uid`, or "drawn". */
async function outcome(who, uid, options) {
  const drawn = await groupPage(who, uid, options);
  assert.equal(drawn.wrote, false, `${who} reading ${uid} wrote something`);
  return drawn.to ?? (viewOf(drawn) ? "drawn" : drawn.text.slice(0, 80));
}

describe("1. who opens the group's side", () => {
  test("Chloe's week: the group's facilitators, the lead and an admin; nobody else, and signed out to sign in", async () => {
    const seen = {};
    for (const who of ["zach", "claudia", "rahul", "sofia", "tom", "yusuf", "chloe", "amara", "nobody", null]) seen[who ?? "signed out"] = await outcome(who, "chloe");
    assert.deepEqual(seen, {
      zach: "drawn",
      claudia: "drawn",
      rahul: "drawn",
      sofia: "drawn",
      // Facilitates another group of the run: the page's own gate.
      tom: RUN_HOME,
      // The run's track lead and nothing else: no reader of work.
      yusuf: RUN_HOME,
      // Her own week: never through a page for the people running her group.
      chloe: RUN_HOME,
      amara: RUN_HOME,
      // No role on the run: the run's layout sends them to /learn before the page is drawn; the page alone, to the run's home.
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("a facilitator's own week: the lead and an admin; never a co-facilitator, and nobody their own", async () => {
    assert.equal(await outcome("sofia", "rahul"), RUN_HOME, "a co-facilitator reads a facilitator's own work");
    assert.equal(await outcome("rahul", "sofia"), RUN_HOME, "a co-facilitator reads a facilitator's own work");
    assert.equal(await outcome("rahul", "rahul"), RUN_HOME, "a facilitator reads their own week here");
    assert.equal(await outcome("claudia", "rahul"), "drawn");
    assert.equal(await outcome("zach", "rahul"), "drawn");
  });

  test("somebody of another group, through this group's address, and an id that is nobody's: the run's home, for an admin too", async () => {
    for (const who of ["zach", "claudia", "rahul"]) {
      assert.equal(await outcome(who, "amara"), RUN_HOME, `${who} reads Group A's Amara on Group B's page`);
      assert.equal(await outcome(who, "no-such-person"), RUN_HOME);
      // Isaac left Group B: his work is nobody's to read here.
      assert.equal(await outcome(who, "isaac"), RUN_HOME);
    }
    // Tom facilitates Group C: Chloe is not his, through Group C's address either.
    assert.equal(await outcome("tom", "chloe", { groupId: C }), RUN_HOME);
  });
});

describe("2. what each reader is sent", () => {
  /** A stored week review whose draft grade is about Chloe's answer as it is read now. */
  const review = (words) => ({
    runId: RUN.agi,
    weekId: "w03",
    weekNumber: 3,
    grades: {
      state: "ready",
      at: NOW,
      askedByUid: "zach",
      model: "test",
      fingerprint: "f",
      sent: 1,
      items: [{ uid: "chloe", rowId: `${RUN.agi}__chloe__w03__k3-wa`, questionKey: "written:k3-wa", grade: 7, hash: hashOf(words) }],
    },
    themes: null,
    hands: null,
    uids: ["chloe"],
  });
  const card = { title: "MY LAMP CARD", intro: "", sealWeek: 3, openWeek: 6, questions: [{ number: "1", kind: "percent", statement: "Lamps will stay lit.", max: 100, lowLabel: "", highLabel: "" }] };

  beforeEach(() => {
    w.world.db.seed(`courseWeekReviews/${RUN.agi}__w03`, review(CHLOE_ANSWER));
    w.world.db.poke(`courses/${COURSE.agi}`, { predictionCard: card });
  });

  test("ratings for the team: an admin and the lead, never a facilitator", async () => {
    w.at("2026-11-18T10:00:00Z");
    assert.equal(viewOf(await groupPage("rahul", "chloe", { week: 3 })).team, null, "a facilitator is sent ratings");
    assert.equal(viewOf(await groupPage("sofia", "chloe", { week: 3 })).team, null, "a facilitator is sent ratings");
    for (const drawn of [await groupPage("claudia", "chloe", { week: 3 }), await groupPage("zach", "chloe", { week: 3 }), await programmePage("claudia", "chloe", { week: 3 })]) {
      assert.equal(viewOf(drawn).team?.itemId, "k3-wa");
    }
    assert.equal(find(insideOf(await groupPage("rahul", "chloe", { week: 3 })), "RatingForTheTeam").length, 0);
  });

  test("an admin's own page and the lead's own page on the programme's side: no draft grade, no sealed prediction row, no ratings", async () => {
    // Claudia (the lead) and Zach (an admin) each hold a place in Group B, with an answer Claude graded.
    for (const uid of ["claudia", "zach"]) {
      w.world.db.seed(`courseEnrolments/${RUN.agi}__${uid}`, enrolment(uid, B));
      w.world.db.seed(`courseExerciseResponses/${RUN.agi}__${uid}__w03__k3-wa`, answer(uid, `${uid} would keep the lamps.`));
    }
    w.world.db.seed(`courseWeekReviews/${RUN.agi}__w03`, {
      ...review(CHLOE_ANSWER),
      grades: {
        ...review(CHLOE_ANSWER).grades,
        items: ["claudia", "zach"].map((uid) => ({ uid, rowId: `${RUN.agi}__${uid}__w03__k3-wa`, questionKey: "written:k3-wa", grade: 6, hash: hashOf(`${uid} would keep the lamps.`) })),
      },
    });
    w.at("2026-11-18T10:00:00Z");
    for (const uid of ["claudia", "zach"]) {
      const drawn = await programmePage(uid, uid, { week: 3 });
      const view = viewOf(drawn);
      assert.ok(view, `${uid}'s own page is not drawn`);
      assert.equal(view.self, true);
      assert.deepEqual([view.team, view.draftGrade, view.prediction], [null, null, null], `${uid}'s own page carries what is never theirs`);
      assert.doesNotMatch(drawn.html, /Rating for the team|Draft grade|Sealed predictions|What the team said/);
      // Nor feedback to write on their own work.
      assert.equal(view.answerFeedback?.open, false);
    }
    // The same answers to somebody else: the admin is sent all three for the lead's answer.
    const other = viewOf(await programmePage("zach", "claudia", { week: 3 }));
    assert.deepEqual([other.team !== null, other.draftGrade?.grade, other.prediction?.uid], [true, "Draft grade 6", "claudia"]);
  });

  test("private notes: the group's facilitators and admins; never the lead, on either side", async () => {
    const note = NOTED.chloe[1];
    for (const drawn of [await groupPage("rahul", "chloe", { week: 3 }), await groupPage("zach", "chloe", { week: 3 }), await programmePage("zach", "chloe", { week: 3 })]) {
      assert.equal(viewOf(drawn).notesShown, true);
      assert.ok(drawn.html.includes(note), "a reader of private notes is not shown Chloe's");
    }
    assert.match((await groupPage("rahul", "chloe", { week: 3 })).text, /Only Group B’s facilitators and admins read private notes\./);
    for (const drawn of [await groupPage("claudia", "chloe", { week: 3 }), await programmePage("claudia", "chloe", { week: 3 })]) {
      assert.equal(viewOf(drawn).notesShown, false);
      assert.ok(!drawn.html.includes(note) && !JSON.stringify(viewOf(drawn)).includes(note), "the lead is sent a private note");
    }
    // A facilitator's own note: an admin's alone.
    assert.ok(!JSON.stringify(viewOf(await groupPage("claudia", "rahul", { week: 3 }))).includes(NOTED.rahul[1]));
    assert.ok((await groupPage("zach", "rahul", { week: 3 })).html.includes(NOTED.rahul[1]));
  });

  test("Claude's draft grade and the sealed prediction's row: admins alone, on the card's weeks, and the grade only while its words are the words read", async () => {
    w.at("2026-11-18T10:00:00Z");
    for (const drawn of [await groupPage("zach", "chloe", { week: 3 }), await programmePage("zach", "chloe", { week: 3 })]) {
      const view = viewOf(drawn);
      assert.deepEqual(view.draftGrade, {
        grade: "Draft grade 7",
        line: "Grades help you choose what to read first. They’re never shown to the person, a lead or a facilitator, never become feedback, and never go into anyone’s notes or profile.",
      });
      assert.deepEqual(view.prediction, { runId: RUN.agi, uid: "chloe", name: "Chloe Nguyen" });
      assert.match(drawn.text, /Draft grade 7 Grades help you choose what to read first\./);
      assert.match(drawn.text, /Sealed predictions Each person’s card is theirs\./);
      assert.deepEqual(find(insideOf(drawn), "SealedPredictionRow").map((row) => row.props), [{ runId: RUN.agi, uid: "chloe", name: "Chloe Nguyen" }]);
    }
    for (const drawn of [
      await groupPage("claudia", "chloe", { week: 3 }),
      await groupPage("rahul", "chloe", { week: 3 }),
      await programmePage("claudia", "chloe", { week: 3 }),
    ]) {
      const view = viewOf(drawn);
      assert.deepEqual([view.draftGrade, view.prediction], [null, null]);
      assert.doesNotMatch(drawn.html, /Draft grade|Sealed predictions/);
    }
    // Only on the weeks the course's card is filled in and opened on.
    assert.equal(viewOf(await groupPage("zach", "chloe", { week: 1 })).prediction, null);
    // A changed answer leaves its draft grade out: the words read are not the words graded.
    w.world.db.seed(`courseWeekReviews/${RUN.agi}__w03`, review("Some other words."));
    assert.equal(viewOf(await groupPage("zach", "chloe", { week: 3 })).draftGrade, null);
    // Nothing of the person's card is read to draw the row.
    assert.ok(!codeOf("lib/courses/coursework/readingLoad.ts").includes("ownRecordOf("));
  });
});

describe("3. the same answers as the pages it joins", () => {
  test("the written answer's words as the group's review page reads them, before and after the session", async () => {
    // Before the session: the words as last sent. Chloe changed it since, and the change is not read.
    w.world.db.poke(`courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`, {
      text: "A change she has not sent.",
      updatedAt: new Date("2026-11-17T08:00:00Z"),
      earlierVersions: [{ text: CHLOE_ANSWER, words: 7, savedAt: SENT, replacedAt: new Date("2026-11-17T08:00:00Z"), sentAt: SENT, reasons: ["sent"] }],
    });
    for (const at of [NOW, new Date("2026-11-18T10:00:00Z")]) {
      w.at(at);
      const written = await w.draw(pages.written, "rahul", { runId: RUN.agi, groupId: B }, { week: "3", person: "chloe" });
      const model = find(written.element, "WrittenReview")[0].props.model;
      const view = viewOf(await groupPage("rahul", "chloe", { week: 3 }));
      assert.equal(view.week.answer.text, model.selected.text, `the two pages read different words at ${at}`);
      // And the review page leads to the reading view.
      assert.equal(find(written.element, "WrittenReview")[0].props.readBase, `/learn/${RUN.agi}/group/${B}/coursework`);
    }
    w.at(NOW);
    assert.equal(viewOf(await groupPage("rahul", "chloe", { week: 3 })).week.answer.text, CHLOE_ANSWER);
  });

  test("the reflections as the page with names reads them, and the same week on both sides for the same reader", async () => {
    const named = await w.namedReflectionsPage("rahul", { week: 3 });
    const view = viewOf(await groupPage("rahul", "chloe", { week: 3 }));
    for (const part of view.week.parts) {
      for (const prompt of part.prompts) {
        if (prompt.answer) assert.ok(named.text.includes(prompt.answer.text), `the page with names does not read "${prompt.answer.text}"`);
      }
    }
    assert.deepEqual(
      view.week.parts.flatMap((part) => part.prompts.filter((prompt) => prompt.answer).map((prompt) => prompt.answer.text)),
      Object.values(SAID.chloe),
    );
    const one = viewOf(await groupPage("zach", "chloe", { week: 3 }));
    const other = viewOf(await programmePage("zach", "chloe", { week: 3 }));
    assert.deepEqual(JSON.parse(JSON.stringify(one.week)), JSON.parse(JSON.stringify(other.week)));
    assert.deepEqual([one.state, one.notesShown, one.team !== null], [other.state, other.notesShown, other.team !== null]);
  });

  test("previous and next: the group's people this reader may read, by name, on the same week", async () => {
    const asFacilitator = viewOf(await groupPage("rahul", "farah", { week: 3 }));
    assert.deepEqual(
      [asFacilitator.nav.previousPerson?.label, asFacilitator.nav.nextPerson?.label],
      ["Chloe Nguyen", "Kofi Asante"],
    );
    assert.equal(asFacilitator.nav.nextPerson.href, `/learn/${RUN.agi}/group/${B}/coursework/kofi?week=3`);
    // The last fellow: a facilitator is never led to a co-facilitator's own week.
    assert.equal(viewOf(await groupPage("sofia", "kofi", { week: 3 })).nav.nextPerson, null);
    // The lead reads the facilitators' own weeks too, so they follow.
    assert.equal(viewOf(await groupPage("claudia", "kofi", { week: 3 })).nav.nextPerson?.label, "Rahul Mehta");
    assert.deepEqual(asFacilitator.nav.back, { label: "Group B", href: `/learn/${RUN.agi}/group/${B}` });
    // The lead cannot open the group's page, so goes back to its written answers.
    assert.deepEqual(viewOf(await groupPage("claudia", "kofi")).nav.back, { label: "Group B", href: `/learn/${RUN.agi}/group/${B}/written` });
  });
});

describe("4. feedback written there is read back", () => {
  test("a facilitator saves a piece on the answer through the route, and it is theirs beside it to change", async () => {
    const drawn = await groupPage("rahul", "chloe", { week: 3 });
    const writer = find(insideOf(drawn), "FeedbackWriter").find((each) => each.props.on.kind === "writtenAnswer");
    assert.deepEqual([writer.props.runId, writer.props.uid, writer.props.weekNumber, writer.props.mayWrite, writer.props.own], [RUN.agi, "chloe", 3, true, null]);
    const saved = await w.call("rahul", feedbackRoute.POST, { runId: RUN.agi }, { body: { uid: "chloe", weekId: "w03", on: "writtenAnswer", itemId: "k3-wa", text: "Name the keeper." }, course: true });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const after = viewOf(await groupPage("rahul", "chloe", { week: 3 }));
    assert.equal(after.answerFeedback.own?.text, "Name the keeper.");
    assert.equal(after.answerFeedback.own?.byRole, "facilitator");
    // The lead reads it beside the answer, signed as Chloe reads it.
    const asLead = await programmePage("claudia", "chloe", { week: 3 });
    assert.match(asLead.text, /Feedback from Rahul Chloe’s facilitator · Tue 17 Nov Name the keeper\. Not emailed yet/);
  });
});

describe("5. an answer changed since feedback", () => {
  const EARLIER = "Keepers should, because they know the lamps and the fog.";
  const LATER = "Keepers should, because they know the lamps. The town pays.";
  const T1 = new Date("2026-11-16T09:00:00Z");
  const T2 = new Date("2026-11-18T09:00:00Z");

  beforeEach(() => {
    w.world.db.seed(
      `courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`,
      answer("chloe", LATER, { sent: T1, saved: T2, earlier: [{ text: EARLIER, words: 10, savedAt: T1, replacedAt: T2, sentAt: T1, reasons: ["reviewed"] }] }),
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
    // After the session, so the latest words are read.
    w.at("2026-11-18T10:00:00Z");
  });

  test("both versions, taken out struck through and added underlined, each said in words, and the feedback under the version it was about", async () => {
    const drawn = await groupPage("zach", "chloe", { week: 3 });
    const view = viewOf(drawn);
    assert.equal(view.changed?.about.text, EARLIER);
    assert.deepEqual(view.changed.cardIds, ["piece-one"]);
    // "lamps" and "lamps." are two words: the comparison is of words as written.
    assert.match(drawn.text, /Chloe’s answer has changed since this feedback was written\. 4 words taken out and 4 added\./);
    assert.match(drawn.html, /<del class="out"><span class="srOnly">Taken out: <\/span>lamps and the fog\.<\/del>/);
    assert.match(drawn.html, /<ins class="in"><span class="srOnly">Added: <\/span>lamps\. The town pays\.<\/ins>/);
    assert.match(drawn.text, /As Rahul read it · Saved Mon 16 Nov, 9am/);
    assert.match(drawn.text, /Struck through: taken out\. Underlined: added\./);
    // The piece sits under the earlier version, not stacked with it again, and not beside the answer twice.
    const inside = insideOf(drawn);
    const sides = find(inside, "StaffFeedbackCards");
    assert.deepEqual(
      sides.map((cards) => cards.props.cards.map((card) => [card.id, card.about])),
      [[], []],
      "the answer's side cards",
    );
    assert.equal((drawn.html.match(/What about the fog\?/g) ?? []).length, 1);
    // Ratings for the team say when the answer has changed since them, as on the review page.
    assert.ok(view.team);
    // A way to give feedback on the new version: the writer beside it.
    assert.equal(find(inside, "FeedbackWriter").find((each) => each.props.on.kind === "writtenAnswer").props.mayWrite, true);
  });

  test("a newer piece about the words read now sits beside them, and the older piece's version is still compared", async () => {
    w.world.db.seed("courseFeedback/piece-two", {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      on: { kind: "writtenAnswer", itemId: "k3-wa" },
      text: "Better.",
      aboutSavedAt: T2,
      byUid: "claudia",
      byRole: "lead",
      createdAt: new Date("2026-11-18T09:30:00Z"),
    });
    const drawn = await groupPage("zach", "chloe", { week: 3 });
    const view = viewOf(drawn);
    assert.deepEqual(view.changed?.cardIds, ["piece-one"]);
    assert.deepEqual(
      find(insideOf(drawn), "StaffFeedbackCards").map((cards) => cards.props.cards.map((card) => card.id)),
      [["piece-two"], []],
      "beside the answer: the piece about the words read now, and nothing on the week",
    );
    // The older piece is drawn once, under the version it was about; the newer once, beside the words now.
    assert.equal((drawn.html.match(/What about the fog\?/g) ?? []).length, 1);
    assert.equal((drawn.html.match(/Better\./g) ?? []).length, 1);
    assert.ok(drawn.html.indexOf("What about the fog?") < drawn.html.indexOf("Struck through: taken out."), "the older piece is not under the earlier version");
    // With nothing about an earlier version, nothing is compared.
    w.world.db.poke("courseFeedback/piece-one", { aboutSavedAt: T2 });
    assert.equal(viewOf(await groupPage("zach", "chloe", { week: 3 })).changed, null);
  });
});

describe("5b. before the session, a change not sent yet is no change to its readers", () => {
  const SAVED_UNSENT = new Date("2026-11-17T08:00:00Z");
  beforeEach(() => {
    // Rahul gave feedback on the words Chloe sent; then, before her session, she changed them and did not send them again.
    w.world.db.seed(
      `courseExerciseResponses/${RUN.agi}__chloe__w03__k3-wa`,
      answer("chloe", "A change she has not sent.", {
        saved: SAVED_UNSENT,
        earlier: [{ text: CHLOE_ANSWER, words: 7, savedAt: SENT, replacedAt: SAVED_UNSENT, sentAt: SENT, reasons: ["sent", "reviewed"] }],
      }),
    );
    w.world.db.seed("courseFeedback/piece-sent", {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      on: { kind: "writtenAnswer", itemId: "k3-wa" },
      text: "Name the keeper.",
      aboutSavedAt: SENT,
      byUid: "rahul",
      byRole: "facilitator",
      createdAt: new Date("2026-11-16T20:00:00Z"),
    });
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
  });

  test("the sent words are read, nothing says the answer changed since the feedback, and no version is stacked under it", async () => {
    // Noon on Tue 17 Nov: Group B meets at 6pm.
    for (const who of ["rahul", "zach"]) {
      const drawn = await groupPage(who, "chloe", { week: 3 });
      const view = viewOf(drawn);
      assert.equal(view.week.answer.text, CHLOE_ANSWER, `${who} reads words that were not sent`);
      assert.equal(view.changed, null, `${who} is told the answer changed since the feedback`);
      assert.doesNotMatch(drawn.text, /has changed since this feedback was written|Only the spacing changed|Struck through/);
      // Rahul's own piece is his to change (the writer); to Zach it is a card. Either way, no earlier version under it.
      const pieces = [...view.answerFeedback.cards, ...(view.answerFeedback.own ? [view.answerFeedback.own] : [])];
      assert.deepEqual(pieces.map((card) => card.id), ["piece-sent"]);
      if (who === "zach") assert.equal(pieces[0].about, null, "an earlier version is stacked under a piece about the words read");
      assert.doesNotMatch(drawn.text, /The version this feedback was about/);
      assert.ok(!drawn.html.includes("A change she has not sent."), `${who} is shown words that were not sent`);
    }
    // The team's ratings draw no comparison either, and say of the change what the review page says.
    const view = viewOf(await groupPage("zach", "chloe", { week: 3 }));
    const written = await w.draw(pages.written, "zach", { runId: RUN.agi, groupId: B }, { week: "3", person: "chloe" });
    const team = find(written.element, "WrittenReview")[0].props.model.selected.team;
    assert.deepEqual(
      view.team.said.map((row) => [row.raterUid, row.rating, row.changedSince]),
      team.said.map((row) => [row.raterUid, row.rating, row.changedSince]),
    );
    assert.equal(view.changed, null);
    // Once the session has started the change is read, and then it is a change.
    w.at("2026-11-18T10:00:00Z");
    const after = viewOf(await groupPage("rahul", "chloe", { week: 3 }));
    assert.equal(after.week.answer.text, "A change she has not sent.");
    assert.equal(after.changed?.about.text, CHLOE_ANSWER);
  });
});

describe("5c. the week's title, the answer's state and length, and the way to its review page", () => {
  test("drawn on both sides, the review page only once the answer may be read", async () => {
    const group = await groupPage("rahul", "chloe", { week: 3 });
    assert.match(group.text, /Chloe Nguyen Week 3 · The lamp makers/);
    assert.match(group.text, /Written answer No feedback yet 7 words Sent Mon 16 Nov, 9am/);
    assert.equal(viewOf(group).reviewHref, `/learn/${RUN.agi}/group/${B}/written?week=3&person=chloe`);
    assert.match(group.html, /class="reviewLink">Open Chloe’s answer on the written answers page<\/a>/);
    assert.equal(viewOf(await programmePage("claudia", "chloe", { week: 3 })).reviewHref, `/admin/admissions/forms/${ROUND}/programmes/${AGI}/written?group=${B}&week=3&person=chloe`);
    // Farah wrote reflections and no answer: no review page to open, and the state says so.
    const farah = await groupPage("rahul", "farah", { week: 3 });
    assert.equal(viewOf(farah).reviewHref, null);
    assert.match(farah.text, /Written answer Answer not started The question/);
    assert.doesNotMatch(farah.html, /class="reviewLink"/);
    // Feedback on the answer: the state says it is given.
    w.world.db.seed("courseFeedback/piece-given", {
      runId: RUN.agi,
      uid: "chloe",
      weekId: "w03",
      weekNumber: 3,
      on: { kind: "writtenAnswer", itemId: "k3-wa" },
      text: "Good.",
      aboutSavedAt: SENT,
      byUid: "rahul",
      byRole: "facilitator",
      createdAt: new Date("2026-11-16T20:00:00Z"),
    });
    assert.match((await groupPage("rahul", "chloe", { week: 3 })).text, /Written answer Feedback given 7 words/);
  });
});

describe("6. nothing written yet", () => {
  test("the empty state, when they were last reminded, and Remind for one person and one week where its rule reaches them", async () => {
    const drawn = await groupPage("rahul", "chloe", { week: 1 });
    const view = viewOf(drawn);
    assert.equal(view.weekNumber, 1);
    assert.match(drawn.text, /Nothing to read yet Chloe hasn’t started week 1\. Readings 0 of 2, nothing written\. Not reminded yet/);
    assert.deepEqual(find(insideOf(drawn), "RemindOne").map((remind) => remind.props), [{ groupId: B, weekNumber: 1, uid: "chloe", firstName: "Chloe" }]);
    // A facilitator's own week is never one Remind reaches.
    const own = await groupPage("claudia", "rahul", { week: 1 });
    assert.match(own.text, /Nothing to read yet Rahul hasn’t started week 1\./);
    assert.equal(find(insideOf(own), "RemindOne").length, 0);
    // Somebody in no group: nothing to remind them through.
    // From the programme's side the same: Tariq, in Group A, is reminded on Group A.
    const tariq = await programmePage("claudia", "tariq", { week: 3 });
    assert.deepEqual(find(insideOf(tariq), "RemindOne").map((remind) => remind.props), [{ groupId: A, weekNumber: 3, uid: "tariq", firstName: "Tariq" }]);
  });
});

describe("6c. where it opens from", () => {
  const programmePages = {
    group: (async () => (await w.loadTs(join(PROGRAMME, "groups", "[groupId]", "page.tsx"))).default)(),
    written: (async () => (await w.loadTs(join(PROGRAMME, "written", "page.tsx"))).default)(),
  };

  test("the facilitator's group page: Feedback to write leads to the person's week, only for people the reader may read", async () => {
    // After the week's session, Chloe's sent answer waits in Feedback to write.
    w.at("2026-11-18T10:00:00Z");
    const toChloe = `href="/learn/${RUN.agi}/group/${B}/coursework/chloe?week=3"`;
    assert.ok((await w.groupPage("rahul")).html.includes(toChloe), "Feedback to write does not lead to Chloe's week");
    assert.ok((await w.groupPage("zach")).html.includes(toChloe));
    // Rahul's own answer is never a co-facilitator's to read, so no name leads there for Sofia.
    assert.ok(!(await w.groupPage("sofia")).html.includes(`/coursework/rahul?`), "a co-facilitator is led to a facilitator's own week");
  });

  test("the programme's page for a group: each name in the week's people opens that person's week", async () => {
    const page = await programmePages.group;
    const drawn = await w.draw(page, "claudia", { roundId: ROUND, programmeId: AGI, groupId: B }, { week: "3" });
    const base = `/admin/admissions/forms/${ROUND}/programmes/${AGI}/coursework`;
    for (const uid of ["chloe", "farah", "kofi"]) {
      assert.ok(drawn.html.includes(`href="${base}/${uid}?week=3"`), `the group's page does not lead to ${uid}'s week 3`);
    }
  });

  test("both written review pages lead under the answer to the person's whole week", async () => {
    w.at("2026-11-18T10:00:00Z");
    const page = await programmePages.written;
    const drawn = await w.draw(page, "claudia", { roundId: ROUND, programmeId: AGI }, { group: B, week: "3", person: "chloe" });
    assert.match(drawn.html, new RegExp(`<a href="/admin/admissions/forms/${ROUND}/programmes/${AGI}/coursework/chloe\\?week=3" class="weekLink">Read all of Chloe’s week 3</a>`));
    const learn = await w.draw(pages.written, "rahul", { runId: RUN.agi, groupId: B }, { week: "3", person: "chloe" });
    assert.match(learn.html, new RegExp(`<a href="/learn/${RUN.agi}/group/${B}/coursework/chloe\\?week=3" class="weekLink">Read all of Chloe’s week 3</a>`));
  });
});

describe("6b. a run with no week written as blocks", () => {
  test("the programme's side names the person, says there is no week to read, and keeps the column of notes about them", async () => {
    w.reset(facilitatorSeed());
    const drawn = await programmePage("zach", "chloe");
    assert.equal(viewOf(drawn), null);
    const shell = find(drawn.element, "NoWeekToRead")[0];
    assert.ok(shell, "nothing drawn in the reading view's place");
    assert.equal(shell.props.beside.type.name, "PersonBeside");
    assert.match(drawn.text, /Chloe Nguyen None of the run’s weeks is written as blocks yet, so there’s no coursework to show\./);
    assert.match(drawn.html, /<aside/);
    // The group's side has nothing to show at all: the run's home.
    assert.equal((await groupPage("rahul", "chloe")).to, RUN_HOME);
  });
});

describe("7. the pure pieces", () => {
  test("the comparison in words", () => {
    const changes = reading.wordChanges("The lamp is lit by hand.", "The lamp is lit by a keeper, by hand.");
    assert.deepEqual(changes, [
      { kind: "same", text: "The lamp is lit by " },
      { kind: "in", text: "a keeper, by " },
      { kind: "same", text: "hand." },
    ]);
    assert.deepEqual(reading.wordChanges("one two three", "one three"), [
      { kind: "same", text: "one " },
      { kind: "out", text: "two " },
      { kind: "same", text: "three" },
    ]);
    // A word swapped: taken out before added, at the one place.
    assert.deepEqual(reading.wordChanges("a red lamp", "a blue lamp"), [
      { kind: "same", text: "a " },
      { kind: "out", text: "red " },
      { kind: "in", text: "blue " },
      { kind: "same", text: "lamp" },
    ]);
    // Spacing alone is no change; line breaks are kept as written.
    assert.deepEqual(reading.wordChanges("one  two", "one\ntwo"), [{ kind: "same", text: "one\ntwo" }]);
    assert.deepEqual(reading.changeCounts(reading.wordChanges("a red lamp", "a blue green lamp")), { out: 1, in: 2 });
    assert.deepEqual(reading.wordChanges("", ""), []);
    assert.deepEqual(reading.wordChanges("", "new words"), [{ kind: "in", text: "new words" }]);
    // The earlier version and the later read back their own words.
    const both = reading.wordChanges("keep the lamps lit", "keep every lamp lit");
    assert.equal(reading.beforeOf(both).map((change) => change.text).join(""), "keep the lamps lit");
    assert.equal(reading.afterOf(both).map((change) => change.text).join(""), "keep every lamp lit");
    // Too long to compare word by word: the middle is taken out and added whole, and nothing is said to have stayed that did not.
    const long = Array.from({ length: 1500 }, (_, i) => `w${i}`).join(" ");
    const other = Array.from({ length: 1500 }, (_, i) => `v${i}`).join(" ");
    const huge = reading.wordChanges(`start ${long} end`, `start ${other} end`);
    assert.deepEqual(huge.map((change) => change.kind), ["same", "out", "in", "same"]);
    assert.equal(words.changeCountWords({ out: 3, in: 1 }), "3 words taken out and 1 added.");
    assert.equal(words.changeCountWords({ out: 1, in: 0 }), "1 word taken out.");
    assert.equal(words.changeCountWords({ out: 0, in: 0 }), "Only the spacing changed.");
  });

  test("the week opened when none is named", () => {
    const opened = (asked, withWork, reached) => reading.openingWeek({ columns: [1, 2, 4], asked, withWork: new Set(withWork), reached });
    assert.deepEqual(opened("2", [], 0), { weekNumber: 2, asked: true });
    assert.deepEqual(opened("3", [1], 4), { weekNumber: 1, asked: false }, "a week that is not one of the run's: the newest with work");
    assert.deepEqual(opened(["2"], [], 4), { weekNumber: 4, asked: false });
    assert.deepEqual(opened(undefined, [1, 2], 4), { weekNumber: 2, asked: false });
    assert.deepEqual(opened(undefined, [], 2), { weekNumber: 2, asked: false }, "nothing written: the newest week that has begun");
    assert.deepEqual(opened(undefined, [], 3), { weekNumber: 2, asked: false });
    assert.deepEqual(opened(undefined, [], 0), { weekNumber: 1, asked: false }, "nothing begun: the first");
    assert.equal(reading.openingWeek({ columns: [], asked: "1", withWork: new Set(), reached: 1 }), null);
  });

  test("previous and next, the one order and the address", () => {
    const people = reading.byShownName([{ uid: "z", name: "zed" }, { uid: "a", name: "Ana" }, { uid: "b", name: "ana" }]);
    assert.deepEqual(people.map((person) => person.uid), ["a", "b", "z"]);
    assert.deepEqual(reading.neighboursOf(people, (person) => person.uid, "b"), { previous: people[0], next: people[2] });
    assert.deepEqual(reading.neighboursOf(people, (person) => person.uid, "a"), { previous: null, next: people[1] });
    assert.deepEqual(reading.neighboursOf(people, (person) => person.uid, "nobody"), { previous: null, next: null });
    assert.equal(reading.readingHref("/learn/r/group/g/coursework", "a b", 3), "/learn/r/group/g/coursework/a%20b?week=3");
  });

  test("the words: no dash, never a mark, a grade or a score, and the apostrophe the pages draw", () => {
    const said = [
      ...Object.values(words).filter((value) => typeof value === "string"),
      words.readingEyebrowWords("AGI Strategy", "Group C", 1, 6),
      words.previousPersonWords("Grace Chen"),
      words.nextWeekWords(2),
      words.backToWords("Group C"),
      words.tickedWhenWords(NOW),
      words.reviewPageLinkWords("Chloe"),
      words.groupMetWords("Group C", 1, { at: NOW, by: "session" }, NOW),
      words.notStartedWords("Grace", 2, { ticked: 0, of: 3 }),
      words.asReadWords("Rahul"),
      words.wholeWeekWords("Chloe", 3),
    ];
    for (const line of said) {
      assert.doesNotMatch(line, /[–—]/, line);
      assert.doesNotMatch(line, /\b(?:marks?|marked|grades?|scores?)\b/i, line);
    }
    assert.equal(words.readingEyebrowWords("AGI Strategy", "Group C", 1, 6), "AGI Strategy · Group C · week 1 of 6");
    assert.equal(words.readingEyebrowWords("AGI Strategy", null, 1, 0), "AGI Strategy · Not in a group yet · week 1");
    assert.equal(words.groupMetWords("Group C", 1, { at: new Date("2026-11-04T15:00:00Z"), by: "session" }, NOW), "Group C met Wed 4 Nov, 3pm");
    assert.equal(words.groupMetWords("Group C", 1, { at: new Date("2026-11-25T15:00:00Z"), by: "session" }, NOW), "Group C meets Wed 25 Nov, 3pm");
    assert.equal(words.groupMetWords("Group C", 2, { at: new Date("2026-11-04T15:00:00Z"), by: "cancelled" }, NOW), "Group C’s week 2 session, Wed 4 Nov, 3pm, was cancelled");
    assert.equal(words.groupMetWords("Group C", 2, { at: null, by: "joined-late" }, NOW), null);
    assert.equal(words.notStartedWords("Grace", 2, { ticked: 0, of: 3 }), "Grace hasn’t started week 2. Readings 0 of 3, nothing written.");
    assert.equal(words.wholeWeekWords("Chloe", 3), "Read all of Chloe’s week 3");
  });
});

describe("7b. the words the browser spec reads, as the product says them", () => {
  test("each string tests/e2e/course-hub-coursework.spec.mjs matches is the product's own, apostrophes and all", async () => {
    const feedback = await w.loadTs(join("lib", "courses", "feedback", "words.ts"));
    const ratings = await w.loadTs(join("lib", "courses", "workRatings", "words.ts"));
    const week = await w.loadTs(join("lib", "courses", "facilitatorWeek", "words.ts"));
    const written = await w.loadTs(join("lib", "courses", "writtenAnswerWords.ts"));
    const review = await w.loadTs(join("lib", "courses", "weekReview", "words.ts"));
    const weekWords = await w.loadTs(join("lib", "courses", "weekWork", "words.ts"));
    assert.equal(words.nextWeekWords(2), "Next week: week 2");
    assert.equal(words.nextPersonWords("Ben"), "Next person: Ben");
    assert.equal(words.backToWords("Group A"), "Back to Group A");
    assert.equal(written.theQuestionWords(null), "The question");
    // A reflection's or a box's time is when it was last saved, in the site's words for a version's time.
    assert.match(weekWords.staffChangedWords(NOW, false), /^Saved /);
    assert.equal(words.weekHeadingWords(3, "The lamp makers"), "Week 3 \u00b7 The lamp makers");
    assert.deepEqual([words.ANSWER_STATE_WORDS.waiting, words.ANSWER_STATE_WORDS.feedback, words.wordsWords(23)], ["No feedback yet", "Feedback given", "23 words"]);
    assert.equal(words.reviewPageLinkWords("Ada"), "Open Ada\u2019s answer on the written answers page");
    assert.equal(`${words.READINGS} ${words.ofWords(1, 2)}`, "Readings 1 of 2");
    assert.match(`${words.WRITTEN_ANSWER} ${words.sentWhenWords(NOW)}`, /^Written answer Sent /);
    assert.deepEqual(
      [feedback.YOUR_FEEDBACK, feedback.SAVE_FEEDBACK, feedback.SAVE_CHANGES, feedback.COMMENT, feedback.NOT_EMAILED_YET],
      ["Your feedback", "Save feedback", "Save changes", "Comment", "Not emailed yet"],
    );
    assert.equal(ratings.RATING_FOR_THE_TEAM, "Rating for the team");
    assert.equal(words.PRIVATE_NOTE, "Private note");
    assert.match(week.privateNotesWhoLine("Group A"), /^Only Group A\u2019s facilitators and admins read private notes\./);
    assert.match(review.REVIEW_WORDS.gradeOf(7), /^Draft grade /);
    assert.equal(feedback.cardHeadingWords({ byRole: "facilitator", byName: "Fern" }), "Feedback from Fern");
    assert.match(feedback.staffCardByWords({ byRole: "facilitator", byName: "Fern", at: NOW.toISOString() }, "AGI Strategy", "Ada"), /^Ada\u2019s facilitator \u00b7 /);
    assert.equal(words.wholeWeekWords("Ada", 3), "Read all of Ada\u2019s week 3");
  });
});

describe("8. the tree", () => {
  test("the group's side gates before the loader, and the loader asks the one gate before it reads anybody's week", () => {
    const page = codeOf("app/(app)/learn/[runId]/group/[groupId]/coursework/[uid]/page.tsx");
    const gate = page.indexOf("if (!facilitatesThisGroup && !facts.isAdmin && !facts.isLead) redirect(runHome);");
    assert.ok(gate !== -1 && gate < page.indexOf("loadGroupPersonWeek("), "the page loads a week before its gate");
    assert.doesNotMatch(page, /\.collection\("courseExerciseResponses"\)/);
    const loader = codeOf("lib/courses/coursework/readingLoad.ts");
    const door = loader.slice(loader.indexOf("export async function loadGroupPersonWeek("));
    const refused = door.indexOf('if (!readable.some((owner) => owner.uid === input.uid)) return { status: "refused" };');
    assert.ok(refused !== -1 && refused < door.indexOf("readPersonWeek("), "the group's door reads a week before the one gate");
    assert.match(loader, /return \{ owners: reviewableIn\(actor, facts, group, owners, liveGroups\), seats, enrolments \};/);
    // The run's places are read once a request: the door hands what its gate read to the run-wide read.
    assert.match(loader, /readRunCoursework\(db, \{ run, liveGroups, now, enrolments: input\.enrolments \}, uid\)/);
    assert.equal((loader.match(/\.collection\("courseEnrolments"\)/g) ?? []).length, 1, "the reading view reads the run's places more than once");
    // The facilitator's group page learns whose weeks open from the queue's own reads: no second read of the run's places.
    const groupPage = codeOf("app/(app)/learn/[runId]/group/[groupId]/page.tsx");
    assert.match(groupPage, /loadWrittenQueueAndReadable\(db, access\.user, access\.run, group\)/);
    assert.doesNotMatch(groupPage, /readableInGroup\(|\.collection\("courseEnrolments"\)/);
    // One reader per kind of work, each the one every page asks.
    for (const reader of ["readRunCoursework(", "boxesReaderFor(", "readPersonPrivateNotes(", "writtenReviewRole(", "mayRateWorkOf("]) {
      assert.ok(loader.includes(reader), `the loader no longer asks ${reader}`);
    }
    // Nothing writes, sends or records an opening.
    assert.doesNotMatch(
      loader,
      /\.doc\([^)]*\)\s*\.(?:set|update|create|delete)\(|\.collection\([^)]*\)\s*\.add\(|\b(?:batch|runTransaction)\(|sendEmail|sendNotice|openRecorded/,
    );
  });
});
