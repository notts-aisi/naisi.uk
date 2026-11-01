/**
 * Ratings for the team (privacy v15, "Ratings for the team": the people
 * running a programme may rate a person's written work and comment on it for
 * each other; the person is never shown these ratings or comments).
 *
 * Run with `npm test` (Node's built-in runner, no emulator). Real handlers
 * and pages from the written answers world (`tests/lib/writtenAnswersWorld.mjs`:
 * AGI Strategy's run on Tue 17 Nov 2026 at noon; Group B meets on Tuesdays
 * at 6pm with Rahul and Sofia, its fellows Chloe, Farah and Kofi; Group A on
 * Thursdays at 6pm with Sofia; Claudia leads the programme, Tess another;
 * Lloyd reviews it; Yusuf is the run's track lead; Zach is an admin),
 * against an in-memory database.
 *
 *  1. Rating an answer: who may (admins and the programme's lead, never a
 *     facilitator as such, a track lead, a reviewer, another programme's lead
 *     or the person), as what, on what, one per rater, and that it emails
 *     nobody.
 *  2. Clearing one: the rater's own, and nobody else's.
 *  3. The review page: "Rating for the team" and "What the team said" for an
 *     admin and the lead, the Pangram chip for an admin alone, none of it in
 *     a facilitator's page.
 *  4. Never to the person or a facilitator: their pages, the one reader and
 *     every file that addresses the record, and never the Kairos file or the
 *     Ratings tab.
 *  5. Deleting: an account takes the ratings about it and those it gave; a
 *     run's destroy keeps them, counted, with the programme's name and the
 *     week.
 *  6. The words and the ten targets.
 *
 * Every word in the weeks is made up; every address is on example.com.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { B, NOW, ONE_BOX, RUN, makeWrittenAnswersWorld } from "./lib/writtenAnswersWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");
const codeOf = (path) => stripSource(read(path), { keepStrings: true });

const w = await makeWrittenAnswersWorld("__courseWorkRatings");
const words = w.lib.workRatingsWords;
const record = w.lib.workRatingsRecord;
/** The coursework check's own hash, for a Pangram reading as the check keeps it. */
const pangramInput = await w.loadTs("lib/courses/coursework/input.ts");

beforeEach(() => {
  w.reset();
});

/** A sentence of `n` words. */
const sentence = (n, word = "lamp") => Array.from({ length: n }, () => word).join(" ");

/** Before Group B's week 2 due moment (noon, Mon 9 Nov): Sun 8 Nov at 10am. */
const BEFORE_DUE_2 = "2026-11-08T10:00:00Z";
/** Group B's week 3 session starts, and its week 3 locks: Tue 17 Nov at 6pm. */
const B_MEETS_3 = "2026-11-17T18:00:00Z";

/** Chloe and Farah submit week 2 before Group B meets for it; Kofi saves a draft and never submits it. */
async function weekTwoWritten() {
  w.at(BEFORE_DUE_2);
  assert.equal((await w.write("chloe", 2, { text: sentence(25) }, { send: true })).status, 200);
  assert.equal((await w.write("farah", 2, { text: sentence(30, "keeper") }, { send: true })).status, 200);
  assert.equal((await w.write("kofi", 2, { text: sentence(5, "beacon") })).status, 200);
  w.at(NOW);
}

const ratingsOf = (uid) => w.workRatings().filter((rating) => rating.uid === uid);
const ratingPath = (uid, n, raterUid) => `courseWorkRatings/${record.courseWorkRatingId(RUN.agi, uid, `w0${n}`, raterUid)}`;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------------------
// 1. Rating an answer
// ---------------------------------------------------------------------------

describe("1. rating an answer: admins and the programme's lead, on readable work, one rating each", () => {
  test("an admin rates a submitted answer: a whole number and a comment for the team, stored as an admin's, and nobody is emailed", async () => {
    await weekTwoWritten();
    const saved = await w.rate("zach", "chloe", 2, 8, "  Takes a side and defends it.  ");
    assert.deepEqual([saved.status, saved.body], [200, { ok: true }]);
    const stored = w.world.db.read(ratingPath("chloe", 2, "zach"));
    assert.deepEqual(
      {
        runId: stored.runId,
        uid: stored.uid,
        weekId: stored.weekId,
        weekNumber: stored.weekNumber,
        itemId: stored.itemId,
        rating: stored.rating,
        comment: stored.comment,
        raterUid: stored.raterUid,
        raterRole: stored.raterRole,
        programmeLabel: stored.programmeLabel,
      },
      {
        runId: RUN.agi,
        uid: "chloe",
        weekId: "w02",
        weekNumber: 2,
        itemId: ONE_BOX.id,
        rating: 8,
        comment: "Takes a side and defends it.",
        raterUid: "zach",
        raterRole: "admin",
        programmeLabel: "AGI Strategy Fellowship, Autumn 2026",
      },
    );
    assert.ok(stored.createdAt instanceof Date && stored.updatedAt instanceof Date, "a rating keeps when it was given and last changed");
    assert.equal(w.world.mail.length, 0, "a rating emails nobody");
    // Nothing of it reaches the feedback the person reads.
    assert.equal(w.pieces().length, 0);
  });

  test("the programme's lead rates as the lead; a lead who also facilitates the group rates as the lead too", async () => {
    await weekTwoWritten();
    assert.equal((await w.rate("claudia", "chloe", 2, 7, "Clear, could go further.")).status, 200);
    assert.equal(w.world.db.read(ratingPath("chloe", 2, "claudia")).raterRole, "lead");
    // Claudia facilitates Group B as well: she still rates, and is stored, as the lead.
    const group = w.world.db.read(`courseGroups/${B}`);
    w.world.db.poke(`courseGroups/${B}`, { facilitatorUids: [...group.facilitatorUids, "claudia"] });
    assert.equal((await w.rate("claudia", "farah", 2, 6, "Solid.")).status, 200);
    assert.equal(w.world.db.read(ratingPath("farah", 2, "claudia")).raterRole, "lead");
  });

  test("a facilitator, the person, another fellow, another programme's lead, the reviewer and the track lead are refused before anything is read", async () => {
    await weekTwoWritten();
    const before = w.everything();
    for (const [who, uid] of [
      ["rahul", "chloe"],
      ["sofia", "chloe"],
      ["chloe", "chloe"],
      ["farah", "chloe"],
      ["tess", "chloe"],
      ["lloyd", "chloe"],
      ["yusuf", "chloe"],
      ["amara", "chloe"],
      ["zach", "nobody"],
      ["claudia", "omar"],
    ]) {
      const refused = await w.rate(who, uid, 2, 8, "Not mine to give.");
      assert.deepEqual([refused.status, refused.body], [403, { error: "Forbidden" }], `${who} on ${uid}`);
    }
    assert.equal((await w.rate(null, "chloe", 2, 8, "Signed out.")).status, 401);
    assert.deepEqual(await w.rate("zach", "chloe", 2, 8, "In view-as.", { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.equal(w.everything(), before);
  });

  test("a facilitator's own work is the lead's and admins' to rate, never a co-facilitator's or their own", async () => {
    w.at(BEFORE_DUE_2);
    assert.equal((await w.write("rahul", 2, { text: sentence(25) }, { send: true })).status, 200);
    w.at(NOW);
    for (const who of ["sofia", "rahul"]) {
      assert.deepEqual((await w.rate(who, "rahul", 2, 5, "Mine.")).status, 403, who);
    }
    assert.equal((await w.rate("claudia", "rahul", 2, 9, "The lead's.")).status, 200);
    assert.equal((await w.rate("zach", "rahul", 2, 8, "An admin's.")).status, 200);
    assert.deepEqual(ratingsOf("rahul").map((rating) => rating.raterRole).sort(), ["admin", "lead"]);
  });

  test("only readable work: not a draft in an open week, not a week reopened; the session's lock opens a draft to its readers", async () => {
    await w.write("kofi", 3, { boxes: { "wb-what": "Light the lamp.", "wb-who": "", "wb-next": "" } });
    const draft = await w.rate("zach", "kofi", 3, 4, "Too soon.");
    assert.deepEqual([draft.status, draft.body.error], [409, words.NOT_READABLE_YET]);
    // Group B's session locks the week: Kofi's draft may now be read, and rated.
    w.at(B_MEETS_3);
    assert.equal((await w.rate("zach", "kofi", 3, 4, "On what was there.")).status, 200);
    // A week reopened is unsent again, and takes no rating; the rating already given stays.
    w.at(NOW);
    await weekTwoWritten();
    assert.equal((await w.rate("zach", "chloe", 2, 8, "Before the reopen.")).status, 200);
    assert.equal((await w.reopenWeek("rahul", "chloe", 2)).status, 200);
    const reopened = await w.rate("zach", "chloe", 2, 3, "Not yet.");
    assert.deepEqual([reopened.status, reopened.body.error], [409, words.NOT_READABLE_YET]);
    assert.equal(w.world.db.read(ratingPath("chloe", 2, "zach")).rating, 8, "a reopen keeps the rating given");
  });

  test("a written answer with no words takes no rating", async () => {
    // Farah submits week 3 with nothing written ("Submit anyway").
    assert.equal((await w.submitWeek("farah", 3)).status, 200);
    const empty = await w.rate("zach", "farah", 3, 2, "On nothing.");
    assert.deepEqual([empty.status, empty.body.error], [409, words.ANSWER_EMPTY]);
    assert.equal(ratingsOf("farah").length, 0);
  });

  test("the body is checked before anything is read: a rating from 1 to 10 and a comment, both required; a week not as blocks, or an answer not on it, is not here", async () => {
    await weekTwoWritten();
    const before = w.everything();
    const empty = await w.call("zach", w.routes.workRatings.PUT, { runId: RUN.agi }, { course: true, body: {} });
    assert.deepEqual([empty.status, empty.body.error], [400, words.SAY_WHOSE_ANSWER]);
    for (const rating of [undefined, null, 0, 11, 7.5, "8", -1, Number.NaN]) {
      const refused = await w.rate("zach", "chloe", 2, rating, "A comment.");
      assert.deepEqual([refused.status, refused.body.error], [400, words.PICK_A_RATING], String(rating));
    }
    for (const comment of [undefined, "", "   ", 42]) {
      const refused = await w.rate("zach", "chloe", 2, 8, comment);
      assert.deepEqual([refused.status, refused.body.error], [400, words.WRITE_A_COMMENT], String(comment));
    }
    const long = await w.rate("zach", "chloe", 2, 8, sentence(301));
    assert.deepEqual([long.status, long.body.error], [400, words.commentTooLongWords(300)]);
    assert.equal((await w.rate("zach", "chloe", 2, 8, "x", { itemId: "" })).status, 400);
    // Week 1 is written before blocks, and week 3's answer is not week 2's.
    const plain = await w.rate("zach", "chloe", 1, 8, "Old week.", { itemId: "x1" });
    assert.deepEqual([plain.status, plain.body.error], [404, words.NOT_A_RATING_WEEK]);
    const elsewhere = await w.rate("zach", "chloe", 2, 8, "Elsewhere.", { itemId: "wa-three" });
    assert.deepEqual([elsewhere.status, elsewhere.body.error], [404, words.NOT_A_RATING_WEEK]);
    assert.equal(w.everything(), before);
  });

  test("one rating per rater per answer: a second save changes it, keeping when it was first given; the role and the rater are never the body's", async () => {
    await weekTwoWritten();
    assert.equal((await w.rate("claudia", "chloe", 2, 6, "First view.")).status, 200);
    const first = w.world.db.read(ratingPath("chloe", 2, "claudia"));
    w.at("2026-11-18T09:30:00Z");
    const changed = await w.rate("claudia", "chloe", 2, 8, "Read it again: stronger than I thought.", {
      extra: { raterUid: "zach", raterRole: "admin", uid2: "farah", createdAt: "2020-01-01", programmeLabel: "Something else" },
    });
    assert.equal(changed.status, 200);
    assert.equal(ratingsOf("chloe").length, 1, "one rating per rater per answer");
    const after = w.world.db.read(ratingPath("chloe", 2, "claudia"));
    assert.deepEqual([after.rating, after.comment, after.raterUid, after.raterRole], [8, "Read it again: stronger than I thought.", "claudia", "lead"]);
    assert.equal(after.createdAt.getTime(), first.createdAt.getTime(), "a change keeps when it was first given");
    assert.ok(after.updatedAt.getTime() > first.updatedAt.getTime(), "a change says when");
    assert.equal(after.programmeLabel, first.programmeLabel);
    // Another rater's is their own.
    assert.equal((await w.rate("zach", "chloe", 2, 9, "Best in the group.")).status, 200);
    assert.deepEqual(ratingsOf("chloe").map((rating) => rating.raterUid).sort(), ["claudia", "zach"]);
  });

  test("the lead of a run stands only while the programme names the run and they meet the bar", async () => {
    await weekTwoWritten();
    // Claudia stops meeting the bar a lead is appointed behind.
    w.world.db.poke("users/claudia", { role: "member", suRecognised: false });
    assert.equal((await w.rate("claudia", "chloe", 2, 8, "Not any more.")).status, 403);
  });
});

// ---------------------------------------------------------------------------
// 2. Clearing a rating
// ---------------------------------------------------------------------------

describe("2. clearing: the rater's own, and nobody else's", () => {
  test("a rater clears their own; clearing again, or clearing when there is none, says there is nothing to clear", async () => {
    await weekTwoWritten();
    await w.rate("claudia", "chloe", 2, 7, "Claudia's.");
    await w.rate("zach", "chloe", 2, 9, "Zach's.");
    assert.deepEqual(await w.clearRating("claudia", "chloe", 2), { status: 200, body: { ok: true } });
    assert.equal(w.world.db.read(ratingPath("chloe", 2, "claudia")), undefined);
    assert.equal(w.world.db.read(ratingPath("chloe", 2, "zach")).rating, 9, "an admin's rating stays when the lead clears hers");
    const again = await w.clearRating("claudia", "chloe", 2);
    assert.deepEqual([again.status, again.body.error], [404, words.NO_RATING_TO_CLEAR]);
    assert.equal(w.world.mail.length, 0);
  });

  test("nobody but an admin or the lead reaches a rating to clear, and view-as is refused first", async () => {
    await weekTwoWritten();
    await w.rate("zach", "chloe", 2, 9, "Zach's.");
    const before = w.everything();
    for (const who of ["rahul", "chloe", "tess", "lloyd"]) {
      assert.deepEqual(await w.clearRating(who, "chloe", 2), { status: 403, body: { error: "Forbidden" } }, who);
    }
    assert.equal((await w.clearRating(null, "chloe", 2)).status, 401);
    assert.deepEqual(await w.clearRating("zach", "chloe", 2, { viewAs: true }), { status: 403, body: { error: "view-as" } });
    const empty = await w.call("zach", w.routes.workRatings.DELETE, { runId: RUN.agi }, { course: true, body: {} });
    assert.deepEqual([empty.status, empty.body.error], [400, words.SAY_WHOSE_ANSWER]);
    assert.equal(w.everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 3. The review page
// ---------------------------------------------------------------------------

/** Pangram's reading of Chloe's week 2 answer, as the coursework check keeps it. */
function pangramReading({ worthALook, words: answered }) {
  const rowId = `${RUN.agi}__chloe__w02__${ONE_BOX.id}`;
  w.world.db.seed(`coursePangramChecks/${RUN.agi}__chloe`, {
    runId: RUN.agi,
    uid: "chloe",
    parts: {
      [rowId]: {
        label: worthALook ? "AI" : "Human",
        headline: "",
        fractionAi: worthALook ? 0.9 : 0,
        fractionAiAssisted: 0,
        fractionHuman: worthALook ? 0.1 : 1,
        hash: pangramInput.fingerprintOf(answered),
        worthALook,
        at: "2026-11-16T10:00:00.000Z",
        weekId: "w02",
        kind: "written",
        words: 25,
      },
    },
  });
}

describe("3. the review page: for an admin and the lead, the Pangram chip for an admin alone, none of it for a facilitator", () => {
  test("an admin reads Rating for the team, What the team said and the Pangram chip beside the answer", async () => {
    await weekTwoWritten();
    pangramReading({ worthALook: false, words: sentence(25) });
    w.at("2026-11-15T10:02:00Z");
    await w.rate("claudia", "chloe", 2, 8, "Takes a side and defends it.");
    w.at(NOW);
    const page = await w.writtenPage("zach", { week: "2", person: "chloe" });
    const { team, pangram } = page.element.props.model.selected;
    assert.deepEqual(pangram, { worthALook: false, outOfDate: false });
    assert.equal(team.mine, null);
    assert.deepEqual(
      team.said.map((row) => [row.raterUid, row.name, row.role, row.rating, row.comment, row.mine]),
      [["claudia", "Claudia", "lead", 8, "Takes a side and defends it.", false]],
    );
    assert.deepEqual(team.viewer, { uid: "zach", name: "Zach", role: "admin" });
    assert.match(page.text, /Pangram: nothing to flag/);
    assert.match(
      page.text,
      new RegExp(
        `${escape(words.RATING_FOR_THE_TEAM)} ${escape(words.WHO_READS_RATINGS)} ${escape(words.YOUR_RATING)} 1 2 3 4 5 6 7 8 9 10 ` +
          `${escape(words.RATING_SCALE_LINE)} ${escape(words.COMMENT_FOR_THE_TEAM)} Never shown to Chloe\\. 0 words ${escape(words.SAVE_RATING)}`,
      ),
    );
    assert.match(page.text, /What the team said Claudia Lead 8 of 10 Sun 15 Nov “Takes a side and defends it\.” Zach Admin Not rated yet/);
    // The admin's own rating fills the form, and the list says so in its place.
    await w.rate("zach", "chloe", 2, 9, "Best in the group this week.");
    const again = await w.writtenPage("zach", { week: "2", person: "chloe" });
    assert.match(again.html, /<input[^>]*type="radio"[^>]*value="9"[^>]*checked=""|<input[^>]*checked=""[^>]*value="9"/);
    assert.match(again.html, /<textarea[^>]*>Best in the group this week\.<\/textarea>/);
    assert.match(again.text, /Clear my rating/);
    assert.match(again.text, /Rated Tue 17 Nov, 12pm/);
    assert.doesNotMatch(again.text, /Not rated yet/);
    // A reading of words that have since changed says so.
    pangramReading({ worthALook: true, words: "Something Chloe wrote before." });
    assert.match((await w.writtenPage("zach", { week: "2", person: "chloe" })).text, /Pangram: changed since it checked/);
    pangramReading({ worthALook: true, words: sentence(25) });
    assert.match((await w.writtenPage("zach", { week: "2", person: "chloe" })).text, /Pangram: worth a look/);
  });

  test("the lead reads the ratings on both review pages, and never a Pangram reading", async () => {
    await weekTwoWritten();
    pangramReading({ worthALook: true, words: sentence(25) });
    await w.rate("zach", "chloe", 2, 9, "Best in the group this week.");
    for (const page of [await w.writtenPage("claudia", { week: "2", person: "chloe" }), await w.leadPage("claudia", { group: B, week: "2", person: "chloe" })]) {
      const { team, pangram } = page.element.props.model.selected;
      assert.equal(pangram, null, "the lead is handed a Pangram reading");
      assert.doesNotMatch(page.html, /Pangram/);
      assert.deepEqual(team.said.map((row) => [row.name, row.role, row.rating]), [["Zach", "admin", 9]]);
      assert.deepEqual(team.viewer, { uid: "claudia", name: "Claudia", role: "lead" });
      assert.match(page.text, /What the team said Zach Admin 9 of 10 Tue 17 Nov “Best in the group this week\.” Claudia Lead Not rated yet/);
    }
  });

  test("a facilitator's review page carries no rating, no comment for the team and no Pangram reading, and draws none of it", async () => {
    await weekTwoWritten();
    pangramReading({ worthALook: true, words: sentence(25) });
    await w.rate("zach", "chloe", 2, 9, "A comment Rahul must never read.");
    await w.rate("claudia", "chloe", 2, 4, "Another one.");
    for (const who of ["rahul", "sofia"]) {
      const page = await w.writtenPage(who, { week: "2", person: "chloe" });
      const { selected } = page.element.props.model;
      assert.equal(selected.person.uid, "chloe");
      assert.equal(selected.team, null, `${who} is handed the ratings`);
      assert.equal(selected.pangram, null, `${who} is handed a Pangram reading`);
      // Nothing of either reaches the page's payload, which is the model.
      const payload = JSON.stringify(page.element.props);
      assert.doesNotMatch(payload, /A comment Rahul must never read|Another one|of 10|worthALook|raterUid/);
      assert.doesNotMatch(page.text, new RegExp(`${escape(words.RATING_FOR_THE_TEAM)}|${escape(words.WHAT_THE_TEAM_SAID)}|Pangram`));
    }
  });

  test("the person's own answer is never open on their page, so nobody reads the ratings about themselves", async () => {
    // Rahul's own answer, rated by the lead: Rahul reviews Group B, and his own answer is never his to open.
    w.at(BEFORE_DUE_2);
    assert.equal((await w.write("rahul", 2, { text: sentence(25) }, { send: true })).status, 200);
    w.at(NOW);
    await w.rate("claudia", "rahul", 2, 7, "About Rahul.");
    const page = await w.writtenPage("rahul", { week: "2", person: "rahul" });
    assert.notEqual(page.element.props.model.selected?.person.uid, "rahul");
    assert.doesNotMatch(JSON.stringify(page.element.props), /About Rahul/);
  });
});

// ---------------------------------------------------------------------------
// 4. Never to the person or a facilitator
// ---------------------------------------------------------------------------

/** Files whose code (comments gone, strings kept) matches. */
function filesMatching(pattern) {
  return [...walkSource(SRC)]
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => relative(REPO_ROOT, file).split(sep).join("/"))
    .filter((file) => pattern.test(codeOf(file)))
    .sort();
}

describe("4. never to the person or a facilitator, and never to Kairos", () => {
  test("the person's week page and overview, and another fellow's, carry nothing of a rating", async () => {
    await weekTwoWritten();
    await w.rate("zach", "chloe", 2, 9, "Never for Chloe.");
    await w.rate("claudia", "chloe", 2, 3, "Nor this.");
    for (const who of ["chloe", "farah"]) {
      const page = await w.weekPage(who, 2);
      assert.doesNotMatch(`${page.html} ${JSON.stringify(page.overview)} ${JSON.stringify(page.own)}`, /Never for Chloe|Nor this|of 10|Rating for the team/, who);
    }
    const home = await w.programmeHome("chloe");
    assert.doesNotMatch(`${home.html} ${JSON.stringify(home.overview)}`, /Never for Chloe|Nor this/);
    // A facilitator's group page and Home's summary carry none of it either.
    const group = await w.groupPage("rahul");
    assert.doesNotMatch(group.html, /Never for Chloe|Nor this/);
    const summary = await w.summary("rahul");
    assert.doesNotMatch(JSON.stringify(summary.body), /Never for Chloe|Nor this/);
  });

  test("every file that addresses ratings for the team is listed, both ways", () => {
    const EXPECTED = new Map([
      ["src/lib/firestore/courseWorkRatings.ts", "the record: its name, its id, its scale and its normaliser"],
      ["src/lib/courses/workRatings/readers.ts", "the one reader, for the review page, after its gate"],
      ["src/app/api/courses/runs/[runId]/work-ratings/route.ts", "the one writer: an admin's or the lead's own rating, saved or cleared"],
      ["src/lib/firestore/accountDeletion.ts", "an account takes the ratings about it and those it gave"],
      ["src/lib/firestore/courseDeletion.ts", "a run's destroy counts them, and keeps them"],
    ]);
    const found = filesMatching(/\bCOURSE_WORK_RATINGS_COLLECTION\b|["'`]courseWorkRatings["'`]/);
    assert.deepEqual(found, [...EXPECTED.keys()].sort(), "a file addresses courseWorkRatings that this list does not know: decide who it shows ratings to first");
  });

  test("the one reader is called by the review page alone, after its own gate and only for an admin or the lead", () => {
    const callers = filesMatching(/\b(?:loadTeamRatings|readAnswerRatings)\(/);
    assert.deepEqual(callers, ["src/lib/courses/workRatings/readers.ts", "src/lib/courses/writtenAnswers/reviewPage.ts"]);
    const page = codeOf("src/lib/courses/writtenAnswers/reviewPage.ts");
    assert.match(page, /mayRateWorkOf\(actor, facts, owner, liveGroups\)\s*\?\s*loadTeamRatings\(db, \{/);
    assert.match(page, /facts\.isAdmin && record\s*\?\s*readAnswerReading\(db, \{/);
    // Nothing a member's pages or a facilitator's own pages build imports any of it.
    for (const file of filesMatching(/from\s+["'][^"']*workRatings\/(?:readers|access|model)["']/)) {
      assert.ok(
        [
          "src/lib/courses/workRatings/readers.ts",
          "src/lib/courses/writtenAnswers/reviewPage.ts",
          "src/features/courses/written/RatingForTheTeam.tsx",
          "src/app/api/courses/runs/[runId]/work-ratings/route.ts",
        ].includes(file),
        `${file} reaches ratings for the team`,
      );
    }
    // The gate: an admin or the programme's lead, on work the one gate lets them read.
    const access = codeOf("src/lib/courses/workRatings/access.ts");
    assert.match(access, /return facts\.isAdmin \|\| facts\.isLead;/);
    assert.match(access, /return readsWorkRatings\(facts\) && writtenReviewRole\(actor, facts, owner, liveGroups\)\.mayReview;/);
  });

  test("the Kairos file and the Ratings tab never read them: Kairos gets the ratings at a programme's end alone", () => {
    for (const file of [...walkSource(join(SRC, "lib", "kairos"))]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /workRatings|courseWorkRatings|WorkRating/, `${relative(REPO_ROOT, file)} reads ratings for the team`);
    }
    for (const file of [...walkSource(join(SRC, "lib", "ratings")), ...walkSource(join(SRC, "app", "api", "kairos"))]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /workRatings|courseWorkRatings|WorkRating/, `${relative(REPO_ROOT, file)} reads ratings for the team`);
    }
    const tabs = join(SRC, "app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "ratings");
    for (const file of [...walkSource(tabs)]) {
      assert.doesNotMatch(readFileSync(file, "utf8"), /workRatings|courseWorkRatings|WorkRating|What the team said|Rating for the team/, `${relative(REPO_ROOT, file)} shows ratings for the team`);
    }
    assert.match(read("src/lib/kairos/file.ts"), /readRunRatings\(db, programme\.runId\)/);
  });
});

// ---------------------------------------------------------------------------
// 5. Deleting
// ---------------------------------------------------------------------------

/** A Firestore handle whose queries also answer `count()`, as the destroy's manifest asks. */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

describe("5. deleting: an account takes the ratings about it and those it gave; a run's destroy keeps them", () => {
  test("deleting an account deletes every rating of its work and every rating it gave, and nobody else's", async () => {
    const accountDeletion = await w.loadTs("lib/firestore/accountDeletion.ts");
    await weekTwoWritten();
    await w.rate("claudia", "chloe", 2, 7, "Claudia on Chloe.");
    await w.rate("zach", "chloe", 2, 9, "Zach on Chloe.");
    await w.rate("claudia", "farah", 2, 6, "Claudia on Farah.");
    await w.rate("zach", "farah", 2, 5, "Zach on Farah.");
    // Chloe's account: the two ratings of her work go.
    assert.equal(await accountDeletion.deleteCourseWorkRatings(w.world.courseDb, "chloe"), 2);
    assert.deepEqual(w.workRatings().map((rating) => rating.comment).sort(), ["Claudia on Farah.", "Zach on Farah."]);
    // Claudia's account: the rating she gave goes; Zach's of Farah stays.
    assert.equal(await accountDeletion.deleteCourseWorkRatings(w.world.courseDb, "claudia"), 1);
    assert.deepEqual(w.workRatings().map((rating) => rating.comment), ["Zach on Farah."]);
    // Somebody with none changes nothing.
    const before = w.everything();
    assert.equal(await accountDeletion.deleteCourseWorkRatings(w.world.courseDb, "hamza"), 0);
    assert.equal(w.everything(), before);
  });

  test("the cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const code = read("src/lib/firestore/accountDeletion.ts");
    assert.match(code, /try \{\s*summary\.courseWorkRatingsDeleted = await deleteCourseWorkRatings\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/);
    assert.match(code, /courseWorkRatingsDeleted: 0,/);
    assert.match(
      code,
      /export async function deleteCourseWorkRatings\(db: Firestore, uid: string\): Promise<number> \{\s*const about = await deleteOwnedCourseRows\(db, COURSE_WORK_RATINGS_COLLECTION, uid\);\s*const gave = await deleteOwnedCourseRows\(db, COURSE_WORK_RATINGS_COLLECTION, uid, "raterUid"\);/,
    );
  });

  test("a run's destroy counts them as kept and leaves every one, with the programme's name and the week", async () => {
    const courseDeletion = await w.loadTs("lib/firestore/courseDeletion.ts");
    const { countMeta } = await w.loadTs("features/courses/useDestroy.ts");
    await weekTwoWritten();
    await w.rate("claudia", "chloe", 2, 7, "Kept with the programme's name.");
    await w.rate("zach", "farah", 2, 6, "Kept too.");
    const before = w.workRatings();
    w.world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const run = w.lib.courses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
    const counts = await courseDeletion.countRunDestroyTargets(counting(w.world.courseDb), run);
    assert.equal(counts.workRatingsKept, 2);
    // The dialog files them on the side that stays, and says they are kept.
    assert.equal(countMeta("workRatingsKept").fate, "retained");
    assert.match(countMeta("workRatingsKept").note, /^KEPT\./);
    await courseDeletion.destroyRunCascade(counting(w.world.courseDb), null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(w.world.db.read(`courseRuns/${RUN.agi}`), undefined, "the run is gone");
    assert.deepEqual(w.workRatings(), before, "the destroy touched a rating");
    for (const kept of w.workRatings()) {
      assert.equal(kept.programmeLabel, "AGI Strategy Fellowship, Autumn 2026");
      assert.equal(kept.weekNumber, 2);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The words and the targets
// ---------------------------------------------------------------------------

describe("6. the words, and ten choices a thumb can press", () => {
  test("the words: no dash, never a mark, a grade or a score, no pronoun, and nothing from a later phase", () => {
    const all = Object.values(words)
      .map((value) => (typeof value === "function" ? "" : value))
      .concat([
        words.outOfTenWords(8),
        words.neverShownWords("Sofia"),
        words.clearConfirmWords("Sofia"),
        words.ratedWords(new Date("2026-11-22T10:02:00Z"), new Date("2026-11-23T09:15:00Z")),
        words.raterRoleWords("lead"),
        words.raterRoleWords("admin"),
        words.pangramChipWords({ worthALook: true, outOfDate: false }),
        words.pangramChipWords({ worthALook: false, outOfDate: false }),
        words.pangramChipWords({ worthALook: true, outOfDate: true }),
        words.commentTooLongWords(300),
      ])
      .join(" ");
    assert.doesNotMatch(all, /[–—]/, "a dash");
    assert.doesNotMatch(all, /\b(?:mark|marks|grade|grades|graded|score|scores|scored)\b/i);
    assert.doesNotMatch(all, /\b(?:he|she|him|her|his|hers)\b/i, "a pronoun for a person");
    assert.doesNotMatch(all, /end-of-week|end of week|session report|draft|Claude/i, "a line from a later phase");
    assert.doesNotMatch(all, /team ratings/i, "the words the end-of-programme ratings and incubator teams read as");
    assert.equal(words.RATING_FOR_THE_TEAM, "Rating for the team");
    assert.equal(words.WHAT_THE_TEAM_SAID, "What the team said");
    assert.equal(words.outOfTenWords(8), "8 of 10");
    assert.equal(words.neverShownWords("Sofia"), "Never shown to Sofia.");
    assert.equal(words.ratedWords(new Date("2026-11-22T10:02:00Z"), null), "Rated Sun 22 Nov, 10:02am");
    assert.equal(
      words.ratedWords(new Date("2026-11-22T10:02:00Z"), new Date("2026-11-23T09:15:00Z")),
      "Rated Sun 22 Nov, 10:02am. Changed Mon 23 Nov, 9:15am",
    );
  });

  test("the scale is the ten whole numbers, and only they are a rating", () => {
    assert.deepEqual([...record.WORK_RATING_SCALE], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const n of record.WORK_RATING_SCALE) assert.equal(record.isWorkRating(n), true);
    for (const not of [0, 11, 7.5, "8", null, undefined, Number.NaN, Infinity]) assert.equal(record.isWorkRating(not), false, String(not));
    // A stored value off the scale is read as no rating, and listed by nobody.
    const off = record.normalizeCourseWorkRating("x", { rating: 12, raterUid: "zach", itemId: ONE_BOX.id });
    assert.equal(off.rating, null);
    const view = w.lib.workRatingsModel.teamRatingsOf([off], ONE_BOX.id, () => "Zach", { uid: "claudia", role: "lead" });
    assert.deepEqual(view.said, []);
  });

  test("each of the ten choices is a radio button on a 44px square, five to a row, inside a labelled group", () => {
    const css = read("src/features/courses/written/workRatings.module.css");
    const block = (name) => new RegExp(`^\\.${name} \\{([^}]*)\\}`, "m").exec(css)?.[1] ?? "";
    assert.match(block("option"), /width: 2\.75rem;/);
    assert.match(block("option"), /height: 2\.75rem;/);
    assert.match(block("options"), /grid-template-columns: repeat\(5, 2\.75rem\);/);
    // The input covers its square, so the whole square takes the press.
    assert.match(block("optionInput"), /inset: 0;/);
    const component = read("src/features/courses/written/RatingForTheTeam.tsx");
    assert.match(component, /<fieldset className=\{styles\.scale\}/);
    assert.match(component, /<legend className=\{styles\.label\}>\{YOUR_RATING\}<\/legend>/);
    assert.match(component, /type="radio"/);
    assert.match(component, /aria-label=\{outOfTenWords\(n\)\}/);
    // Save and Clear are 44px too.
    assert.match(block("primary"), /min-height: 44px;/);
    assert.match(block("textButton"), /min-height: 44px;/);
  });
});
