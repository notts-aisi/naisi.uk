/**
 * Feedback as a signed comment, and the batch email that says it is there
 * (privacy v15, "Feedback": written by a person on the team running the
 * programme, showing their name, on the week's page, with an email to say it
 * is waiting).
 *
 * Run with `npm test` (Node's built-in runner, no emulator). Real handlers
 * and pages from the written answers world (`tests/lib/writtenAnswersWorld.mjs`:
 * AGI Strategy's run on Tue 17 Nov 2026 at noon; Group B meets on Tuesdays
 * at 6pm with Rahul and Sofia, its fellows Chloe, Farah and Kofi; Group A on
 * Thursdays at 6pm with Sofia; Claudia leads the programme, Tess another;
 * Zach is an admin), against an in-memory database.
 *
 *  1. Saving a piece: who may, as what it is signed, on what, and that it
 *     emails nobody.
 *  2. Changing and deleting it: its writer until its email has gone, an
 *     admin whenever, nobody while a press is sending it.
 *  3. The batch: an admin's alone, a test first, the count on the button a
 *     promise, each piece claimed once, one email per person however many
 *     pieces, and a send that fails let go for the next press.
 *  4. Feedback given before pieces existed: a signed card, already emailed,
 *     never in a batch.
 *  5. The pages: the person's week page, the old feedback page, the review
 *     page, Feedback to write and the Overview's Feedback to send.
 *  6. Deleting an account: the feedback on its work and the feedback it
 *     wrote go; its presses stay, without its name.
 *
 * Every word in the weeks is made up; every address is on example.com.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { NOW, ONE_BOX, RUN, makeWrittenAnswersWorld } from "./lib/writtenAnswersWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWrittenAnswersWorld("__courseFeedback");
const words = w.lib.feedbackWords;

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

const piecesOf = (uid) => w.pieces().filter((piece) => piece.uid === uid);
const sendRows = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("courseFeedbackSends/"))
    .map((path) => ({ id: path.slice("courseFeedbackSends/".length), ...w.world.db.read(path) }));

/** The batch as the Overview's card reads it for `who`. */
const batchFor = async (who, viewer = "admin") => {
  w.world.course = true;
  try {
    return await w.lib.feedbackSend.loadFeedbackBatch(w.world.courseDb, w.sessionFor(who), RUN.agi, viewer, new Date());
  } finally {
    w.world.course = false;
  }
};

/** Press Send as `who` for every row the card shows ticked. */
const sendAll = async (who = "zach") => {
  const model = await batchFor(who);
  const ids = model.rows.map((row) => row.id);
  return w.send(who, { ids, pieces: ids.length, people: new Set(model.rows.map((row) => row.uid)).size });
};

// ---------------------------------------------------------------------------
// 1. Saving a piece
// ---------------------------------------------------------------------------

describe("1. saving a piece: a signed comment, on readable work, emailing nobody", () => {
  test("a group's facilitator saves feedback on a submitted answer: stored as a comment signed as their facilitator, shown at once, and nobody is emailed", async () => {
    await weekTwoWritten();
    const saved = await w.give("rahul", "chloe", 2, "  Clear steps. Say why the second keeper matters.  ");
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const [piece] = piecesOf("chloe");
    assert.deepEqual(
      {
        runId: piece.runId,
        uid: piece.uid,
        weekId: piece.weekId,
        weekNumber: piece.weekNumber,
        on: piece.on,
        text: piece.text,
        byUid: piece.byUid,
        byRole: piece.byRole,
        editedAt: piece.editedAt,
        emailedAt: piece.emailedAt,
        emailedByUid: piece.emailedByUid,
        emailClaimedAt: piece.emailClaimedAt,
      },
      {
        runId: RUN.agi,
        uid: "chloe",
        weekId: "w02",
        weekNumber: 2,
        on: { kind: "writtenAnswer", itemId: ONE_BOX.id },
        text: "Clear steps. Say why the second keeper matters.",
        byUid: "rahul",
        byRole: "facilitator",
        editedAt: null,
        emailedAt: null,
        emailedByUid: "",
        emailClaimedAt: null,
      },
    );
    assert.ok(piece.createdAt instanceof Date, "a piece keeps when it was saved");
    // Never a level, a mark or a number: the comment is all it stores.
    for (const field of ["levels", "level", "score", "mark", "rating", "grade"]) {
      assert.equal(field in piece, false, `a piece stores ${field}`);
    }
    // Saving emails nobody: the person reads it on their week page, and the email waits for an admin's batch.
    assert.equal(w.world.mail.length, 0);
    // The answer is the piece as the review page draws it for its writer, field by field.
    assert.deepEqual(Object.keys(saved.body).sort(), ["ok", "piece"]);
    assert.equal(saved.body.piece.mine, true);
    assert.equal(saved.body.piece.mayChange, true);
    assert.equal(saved.body.piece.emailed, null);
    assert.equal(saved.body.piece.byName, "Rahul");
  });

  test("a level, a score or anything else sent with the words is never stored", async () => {
    await weekTwoWritten();
    const saved = await w.give("rahul", "chloe", 2, "Good.", { extra: { levels: w.levels("Strong"), score: 9, byRole: "admin", emailedAt: "2026-11-01" } });
    assert.equal(saved.status, 200);
    const [piece] = piecesOf("chloe");
    assert.equal("levels" in piece, false);
    assert.equal("score" in piece, false);
    assert.equal(piece.byRole, "facilitator", "the role is the gate's, never the body's");
    assert.equal(piece.emailedAt, null, "a piece is never saved as emailed");
  });

  test("as what each reader signs: the lead as the lead, an admin as an admin, a co-facilitator as their facilitator", async () => {
    await weekTwoWritten();
    assert.equal((await w.give("claudia", "chloe", 2, "From the lead.")).status, 200);
    assert.equal((await w.give("zach", "chloe", 2, "From an admin.")).status, 200);
    assert.equal((await w.give("sofia", "farah", 2, "From Sofia.")).status, 200);
    const role = Object.fromEntries(w.pieces().map((piece) => [piece.text, piece.byRole]));
    assert.deepEqual(role, { "From the lead.": "lead", "From an admin.": "admin", "From Sofia.": "facilitator" });
    // Each signs by name; a writer with no name on record still reads as a sentence.
    const at = "2026-11-15T10:02:00.000Z";
    assert.equal(words.cardByWords({ byRole: "lead", byName: "Claudia", at }, "AGI Strategy"), "Claudia, who leads AGI Strategy · Sun 15 Nov");
    assert.equal(words.cardByWords({ byRole: "lead", byName: "", at }, "AGI Strategy"), "The lead of AGI Strategy · Sun 15 Nov");
    assert.equal(words.cardByWords({ byRole: "facilitator", byName: "Rahul", at }, "AGI Strategy"), "Your facilitator · Sun 15 Nov");
    assert.equal(words.cardByWords({ byRole: "admin", byName: "Zach", at }, ""), "Zach · Sun 15 Nov");
  });

  test("a facilitator's own work is the lead's and admins' to give feedback on, never a co-facilitator's or their own", async () => {
    w.at(BEFORE_DUE_2);
    assert.equal((await w.write("rahul", 2, { text: sentence(25) }, { send: true })).status, 200);
    w.at(NOW);
    for (const who of ["sofia", "rahul"]) {
      const refused = await w.give(who, "rahul", 2, "Mine.");
      assert.deepEqual([refused.status, refused.body], [403, { error: "Forbidden" }], who);
    }
    assert.equal((await w.give("claudia", "rahul", 2, "The lead's.")).status, 200);
    assert.equal((await w.give("zach", "rahul", 2, "An admin's.")).status, 200);
    assert.deepEqual(piecesOf("rahul").map((piece) => piece.byRole).sort(), ["admin", "lead"]);
  });

  test("everybody else is refused with the same answer before anything of the person's is read, and writes nothing", async () => {
    await weekTwoWritten();
    const before = w.everything();
    for (const [who, uid] of [
      ["farah", "chloe"],
      ["kofi", "chloe"],
      ["tess", "chloe"],
      ["tom", "chloe"],
      ["chloe", "chloe"],
      ["amara", "chloe"],
      ["sofia", "nobody"],
    ]) {
      const refused = await w.give(who, uid, 2, "Not mine to give.");
      assert.deepEqual([refused.status, refused.body], [403, { error: "Forbidden" }], `${who} on ${uid}`);
    }
    assert.equal((await w.give(null, "chloe", 2, "Signed out.")).status, 401);
    assert.deepEqual(await w.give("rahul", "chloe", 2, "In view-as.", { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.equal(w.everything(), before);
  });

  test("on readable work only: not a draft in an open week, not a week reopened; the session's lock opens a draft to its readers", async () => {
    // Week 3 is open until Group B meets tonight: a submitted week 3 takes feedback, a draft does not.
    await w.write("kofi", 3, { boxes: { "wb-what": "Light.", "wb-who": "", "wb-next": "" } });
    const draft = await w.give("rahul", "kofi", 3, "Too soon.");
    assert.deepEqual([draft.status, draft.body.error], [409, words.NOT_READABLE_YET]);
    const onTheWeek = await w.give("rahul", "kofi", 3, "Too soon.", { on: "week" });
    assert.deepEqual([onTheWeek.status, onTheWeek.body.error], [409, words.NOT_READABLE_YET]);
    // Group B's session locks the week: Kofi's draft may now be read, and given feedback.
    w.at(B_MEETS_3);
    assert.equal((await w.give("rahul", "kofi", 3, "On what you had.")).status, 200);
    // A week reopened is unsent again.
    w.at(NOW);
    await weekTwoWritten();
    assert.equal((await w.reopenWeek("rahul", "chloe", 2)).status, 200);
    const reopened = await w.give("rahul", "chloe", 2, "Not yet.");
    assert.deepEqual([reopened.status, reopened.body.error], [409, words.NOT_READABLE_YET]);
  });

  test("a written answer with no words takes no feedback on it, and its week as a whole still does", async () => {
    // Farah submits week 3 with nothing written ("Submit anyway").
    assert.equal((await w.submitWeek("farah", 3)).status, 200);
    const empty = await w.give("rahul", "farah", 3, "On nothing.");
    assert.deepEqual([empty.status, empty.body.error], [409, words.ANSWER_EMPTY]);
    const week = await w.give("rahul", "farah", 3, "We missed your plan this week.", { on: "week" });
    assert.equal(week.status, 200);
    assert.deepEqual(piecesOf("farah")[0].on, { kind: "week" });
  });

  test("the body is checked before anything is read; a week not written as blocks, or an answer not on the week, is not here", async () => {
    await weekTwoWritten();
    const before = w.everything();
    const empty = await w.call("rahul", w.routes.feedback.POST, { runId: RUN.agi }, { course: true, body: {} });
    assert.deepEqual([empty.status, empty.body.error], [400, words.SAY_WHOSE_WEEK]);
    assert.equal((await w.give("rahul", "chloe", 2, "   ")).body.error, words.WRITE_IT_FIRST);
    const long = await w.give("rahul", "chloe", 2, sentence(301));
    assert.deepEqual([long.status, long.body.error], [400, words.feedbackTooLongWords(300)]);
    assert.equal((await w.give("rahul", "chloe", 2, "x", { on: "rubric" })).status, 400);
    // Week 1 is written before blocks: its own review stays.
    const plain = await w.give("rahul", "chloe", 1, "Old week.", { on: "week" });
    assert.deepEqual([plain.status, plain.body.error], [404, words.NOT_A_FEEDBACK_WEEK]);
    const elsewhere = await w.give("rahul", "chloe", 2, "Elsewhere.", { itemId: "wa-three" });
    assert.equal(elsewhere.status, 404);
    assert.equal(w.everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 2. Changing and deleting a piece
// ---------------------------------------------------------------------------

describe("2. changing and deleting: its writer until its email has gone, an admin whenever", () => {
  test("its writer changes its words, which stores when; nobody else does, and a stranger is told it is not here", async () => {
    await weekTwoWritten();
    const { body } = await w.give("rahul", "chloe", 2, "First words.");
    const id = body.piece.id;
    const changed = await w.change("rahul", id, "Better words.");
    assert.equal(changed.status, 200);
    const [piece] = piecesOf("chloe");
    assert.equal(piece.text, "Better words.");
    assert.ok(piece.editedAt instanceof Date);
    assert.equal(changed.body.piece.text, "Better words.");
    // The lead may act on Chloe's work, but the piece is Rahul's.
    const lead = await w.change("claudia", id, "Mine now.");
    assert.deepEqual([lead.status, lead.body.error], [403, words.ONLY_ITS_WRITER]);
    // Somebody who may not act on Chloe's work is told what a missing piece is told.
    const stranger = await w.change("farah", id, "Hello.");
    const missing = await w.change("rahul", "no-such-piece", "Hello.");
    assert.deepEqual([stranger.status, stranger.body], [missing.status, missing.body]);
    assert.equal(stranger.status, 404);
    assert.deepEqual(await w.change("rahul", id, "In view-as.", { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.equal(piecesOf("chloe")[0].text, "Better words.");
  });

  test("its writer deletes it; an admin deletes anybody's; the lead deletes only their own", async () => {
    await weekTwoWritten();
    const rahul = (await w.give("rahul", "chloe", 2, "Rahul's.")).body.piece.id;
    const sofia = (await w.give("sofia", "farah", 2, "Sofia's.")).body.piece.id;
    const lead = await w.remove("claudia", rahul);
    assert.deepEqual([lead.status, lead.body.error], [403, words.ONLY_ITS_WRITER_OR_AN_ADMIN]);
    assert.equal((await w.remove("rahul", rahul)).status, 200);
    assert.equal(piecesOf("chloe").length, 0);
    assert.equal((await w.remove("zach", sofia)).status, 200);
    assert.equal(piecesOf("farah").length, 0);
  });

  test("once its email has gone its writer can neither change nor delete it; an admin can still delete it", async () => {
    await weekTwoWritten();
    const id = (await w.give("rahul", "chloe", 2, "Emailed soon.")).body.piece.id;
    w.world.db.poke(`courseFeedback/${id}`, { emailedAt: new Date(NOW), emailedByUid: "zach", emailDelivery: "sent" });
    assert.deepEqual([(await w.change("rahul", id, "Too late.")).body.error], [words.ALREADY_EMAILED]);
    assert.deepEqual([(await w.remove("rahul", id)).body.error], [words.ALREADY_EMAILED_DELETE]);
    assert.equal((await w.remove("zach", id)).status, 200);
  });

  test("while a press is sending its email nobody changes or deletes it; a claim older than a press can live lets it go", async () => {
    await weekTwoWritten();
    const id = (await w.give("rahul", "chloe", 2, "Being sent.")).body.piece.id;
    w.world.db.poke(`courseFeedback/${id}`, { emailClaimedAt: new Date(NOW), sendId: "press-1" });
    assert.deepEqual([(await w.change("rahul", id, "No.")).body.error], [words.BEING_EMAILED_REFUSAL]);
    assert.deepEqual([(await w.remove("zach", id)).body.error], [words.BEING_EMAILED_REFUSAL]);
    w.at(new Date(new Date(NOW).getTime() + 6 * 60_000).toISOString());
    assert.equal((await w.change("rahul", id, "Now it can.")).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. The batch
// ---------------------------------------------------------------------------

describe("3. the batch: an admin's, a test first, the count a promise, one email per person", () => {
  test("only an admin sends, or tests: the lead, a facilitator, a fellow are refused before anything is read; view-as first", async () => {
    await weekTwoWritten();
    await w.give("rahul", "chloe", 2, "Good.");
    for (const who of ["claudia", "rahul", "chloe", "tess"]) {
      assert.deepEqual(await w.sendTest(who), { status: 403, body: { error: words.ADMINS_ONLY } }, who);
      assert.deepEqual(await w.send(who, { ids: ["x"], pieces: 1, people: 1 }), { status: 403, body: { error: words.ADMINS_ONLY } }, who);
    }
    assert.equal((await w.sendTest(null)).status, 401);
    assert.deepEqual(await w.sendTest("zach", { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.deepEqual(await w.send("zach", { ids: [], pieces: 0, people: 0 }, { viewAs: true }), { status: 403, body: { error: "view-as" } });
    assert.equal(w.world.mail.length, 0);
  });

  test("nothing goes until the presser has sent themselves a test, which reaches their own address alone, marked as a test", async () => {
    await weekTwoWritten();
    await w.give("rahul", "chloe", 2, "Good.");
    const early = await sendAll();
    assert.deepEqual([early.status, early.body.error], [409, words.TEST_FIRST]);
    assert.equal(w.world.mail.length, 0);
    const test = await w.sendTest("zach");
    assert.equal(test.status, 200);
    assert.equal(w.world.mail.length, 1);
    const [mail] = w.world.mail;
    assert.equal(mail.to, w.sessionFor("zach").email);
    assert.equal(mail.kind, "course-test");
    assert.equal(mail.subject, "[TEST] New feedback on your AGI Strategy work");
    assert.equal(test.body.model.tested, true);
    assert.equal(sendRows().filter((row) => row.kind === "test").length, 1);
    // A test somebody else sent unlocks nothing for this admin, and a test lasts a day.
    w.at(new Date(new Date(NOW).getTime() + 25 * 60 * 60 * 1000).toISOString());
    const stale = await sendAll();
    assert.deepEqual([stale.status, stale.body.error], [409, words.TEST_FIRST]);
  });

  test("one email per person however many pieces, naming who left them and on what, with none of the feedback in it", async () => {
    await weekTwoWritten();
    await w.give("rahul", "chloe", 2, "The second keeper is the point.");
    await w.give("claudia", "chloe", 2, "Bring this to the social.", { on: "week" });
    await w.give("rahul", "farah", 2, "Clear.");
    assert.equal((await w.sendTest("zach")).status, 200);
    w.world.mail.length = 0;
    const sent = await sendAll();
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    assert.deepEqual(Object.keys(sent.body).sort(), ["model", "ok", "report", "said"]);
    assert.deepEqual(sent.body.said, ["2 emails sent."]);
    assert.equal(w.world.mail.length, 2);
    const byTo = Object.fromEntries(w.world.mail.map((mail) => [mail.to, mail]));
    const chloe = byTo[w.sessionFor("chloe").email];
    assert.equal(chloe.kind, "course-feedback");
    assert.equal(chloe.subject, "New feedback on your AGI Strategy work");
    assert.equal(chloe.actorUid, "zach");
    const html = JSON.stringify(chloe.react);
    assert.match(html, /Rahul and Claudia have left feedback on your work in week 2\./);
    assert.match(html, new RegExp(`/learn/${RUN.agi}/weeks/2#feedback`));
    assert.doesNotMatch(html, /second keeper|the social|Clear\./, "the feedback itself stays on the site");
    const farah = JSON.stringify(byTo[w.sessionFor("farah").email].react);
    assert.match(farah, /Rahul has left feedback on your week 2 written answer\./);
    // Every piece is settled: when, by whose press, and what became of it; never in a batch again.
    for (const piece of w.pieces()) {
      assert.ok(piece.emailedAt instanceof Date, piece.text);
      assert.equal(piece.emailedByUid, "zach");
      assert.equal(piece.emailDelivery, "sent");
      assert.equal(piece.emailClaimedAt, null);
    }
    assert.equal(sent.body.model.pieces, 0);
    const [row] = sendRows().filter((entry) => entry.kind === "send");
    assert.deepEqual([row.byUid, row.people, row.pieces, row.sent, row.failed], ["zach", 2, 3, 2, 0]);
    assert.deepEqual([...row.pieceIds].sort(), w.pieces().map((piece) => piece.id).sort());
  });

  test("the count on the button is a promise: a ticked piece no longer owed, or a number that moved, is refused with the numbers as they are now", async () => {
    await weekTwoWritten();
    const first = (await w.give("rahul", "chloe", 2, "One.")).body.piece.id;
    await w.give("rahul", "farah", 2, "Two.");
    await w.sendTest("zach");
    w.world.mail.length = 0;
    const wrongPeople = await w.send("zach", { ids: [first], pieces: 1, people: 2 });
    assert.deepEqual([wrongPeople.status, wrongPeople.body.error], [409, words.countMovedWords(2, 2)]);
    assert.equal(wrongPeople.body.model.pieces, 2, "the refusal carries the list as it is now");
    // A piece deleted after the card was drawn.
    assert.equal((await w.remove("rahul", first)).status, 200);
    const gone = await w.send("zach", { ids: [first], pieces: 1, people: 1 });
    assert.deepEqual([gone.status, gone.body.error], [409, words.countMovedWords(1, 1)]);
    assert.equal(w.world.mail.length, 0);
    // The numbers read as a sentence, one or many or none.
    assert.equal(words.countMovedWords(2, 2), "There are now 2 pieces of feedback to email, to 2 people. Check the list, then press again.");
    assert.equal(words.countMovedWords(1, 1), "There is now 1 piece of feedback to email, to 1 person. Check the list, then press again.");
    assert.equal(words.countMovedWords(0, 0), "There’s no feedback left to email.");
    // The body is checked after the session: no ids, nothing ticked.
    assert.equal((await w.send("zach", {})).status, 400);
    assert.deepEqual((await w.send("zach", { ids: [], pieces: 0, people: 0 })).body, { error: words.NOTHING_TICKED });
  });

  test("an unticked piece waits for a later send; two presses send once; another press in progress refuses", async () => {
    await weekTwoWritten();
    const chloe = (await w.give("rahul", "chloe", 2, "One.")).body.piece.id;
    await w.give("rahul", "farah", 2, "Two.");
    await w.sendTest("zach");
    w.world.mail.length = 0;
    // Farah's is unticked: only Chloe is emailed.
    const sent = await w.send("zach", { ids: [chloe], pieces: 1, people: 1 });
    assert.equal(sent.status, 200);
    assert.deepEqual(w.world.mail.map((mail) => mail.to), [w.sessionFor("chloe").email]);
    assert.deepEqual(sent.body.model.rows.map((row) => row.uid), ["farah"], "Farah's piece waits");
    // The same press again: Chloe's is emailed already, so nothing goes twice.
    const again = await w.send("zach", { ids: [chloe], pieces: 1, people: 1 });
    assert.equal(again.status, 409);
    assert.equal(w.world.mail.length, 1);
    // A press in progress holds the run.
    w.world.db.seed(`courseFeedbackSends/press__${RUN.agi}`, { kind: "press", runId: RUN.agi, byUid: "zach", token: "t", claimedAtMs: Date.now() });
    const held = await sendAll();
    assert.deepEqual([held.status, held.body.error], [409, words.PRESS_IN_PROGRESS]);
    // One left behind by a press that stopped is let go after five minutes.
    w.world.db.seed(`courseFeedbackSends/press__${RUN.agi}`, { kind: "press", runId: RUN.agi, byUid: "zach", token: "t", claimedAtMs: Date.now() - 6 * 60_000 });
    assert.equal((await sendAll()).status, 200);
    assert.equal(w.world.mail.length, 2);
  });

  test("a piece another press has claimed is in no batch; a claim left by a press that stopped is owed again", async () => {
    await weekTwoWritten();
    const id = (await w.give("rahul", "chloe", 2, "Claimed.")).body.piece.id;
    w.world.db.poke(`courseFeedback/${id}`, { emailClaimedAt: new Date(NOW), sendId: "another" });
    assert.equal((await batchFor("zach")).pieces, 0);
    w.world.db.poke(`courseFeedback/${id}`, { emailClaimedAt: new Date(new Date(NOW).getTime() - 6 * 60_000) });
    assert.equal((await batchFor("zach")).pieces, 1);
  });

  test("a send that fails lets its pieces go for the next press; held and stopped emails settle, and say so", async () => {
    await weekTwoWritten();
    await w.give("rahul", "chloe", 2, "One.");
    await w.give("rahul", "farah", 2, "Two.");
    await w.give("rahul", "kofi", 2, "Three.");
    await w.sendTest("zach");
    const chloe = w.sessionFor("chloe").email;
    const farah = w.sessionFor("farah").email;
    w.world.mailFate = (args) => (args.to === chloe ? "fail" : args.to === farah ? "suppressed" : "held");
    const sent = await sendAll();
    assert.equal(sent.status, 200);
    assert.deepEqual({ ...sent.body.report, failed: sent.body.report.failed.length }, { sent: 0, held: 1, suppressed: 1, failed: 1, noAddress: [] });
    const [failed] = piecesOf("chloe");
    assert.equal(failed.emailedAt, null, "a failed send is still owed");
    assert.equal(failed.emailClaimedAt, null, "and its claim is let go");
    assert.equal(piecesOf("farah")[0].emailDelivery, "suppressed");
    assert.equal(piecesOf("kofi")[0].emailDelivery, "held");
    assert.equal(sent.body.model.pieces, 1, "only the failed one waits");
    // The next press tries it again.
    w.world.mailFate = null;
    w.world.mail.length = 0;
    assert.equal((await sendAll()).status, 200);
    assert.deepEqual(w.world.mail.map((mail) => mail.to), [chloe]);
  });

  test("somebody who no longer takes part is in no batch", async () => {
    await weekTwoWritten();
    await w.give("rahul", "chloe", 2, "One.");
    w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "withdrawn" });
    assert.equal((await batchFor("zach")).pieces, 0);
  });
});

// ---------------------------------------------------------------------------
// 4. Feedback given before pieces existed
// ---------------------------------------------------------------------------

describe("4. feedback given before pieces existed: a signed card, already emailed, never in a batch", () => {
  test("its comment, or its levels as plain lines when the comment is empty; counted as emailed; Feedback to write passes it by", async () => {
    await weekTwoWritten();
    w.world.db.poke(w.rowPath("chloe", 2), {
      feedback: { levels: w.levels("Solid").map((level) => ({ ...level, descriptor: "x" })), comment: "", byUid: "rahul", sentAt: new Date("2026-11-11T10:00:00Z") },
    });
    w.world.db.poke(w.rowPath("farah", 2), {
      feedback: { levels: [], comment: "An old comment.", byUid: "zach", sentAt: new Date("2026-11-11T11:00:00Z") },
    });
    const chloe = await w.weekPage("chloe", 2);
    const chloeCards = chloe.overview.weeks.find((week) => week.weekNumber === 2).feedback;
    assert.equal(chloeCards.length, 1);
    assert.deepEqual(
      { on: chloeCards[0].on, byRole: chloeCards[0].byRole, byName: chloeCards[0].byName, text: chloeCards[0].text, lines: chloeCards[0].lines },
      { on: "writtenAnswer", byRole: "facilitator", byName: "Rahul", text: "", lines: ["A clear view: Solid", "Reasons: Solid", "The best objection: Solid", "So what: Solid"] },
    );
    // Rahul's chip takes its initial from the name he goes by, never from his full name; the team's is the society's own.
    assert.match(chloe.text, /Feedback R Feedback from Rahul Your facilitator · Wed 11 Nov A clear view: Solid Reasons: Solid/);
    assert.doesNotMatch(chloe.text, /Mehta|\bRM\b/);
    const farah = await w.weekPage("farah", 2);
    const [card] = farah.overview.weeks.find((week) => week.weekNumber === 2).feedback;
    assert.deepEqual([card.byRole, card.text], ["admin", "An old comment."]);
    assert.match(farah.text, /Feedback N From the NAISI team Zach · Wed 11 Nov An old comment\./);
    // Never in a batch, and never waiting in Feedback to write: only Kofi's locked draft, which has none, waits there.
    assert.equal((await batchFor("zach")).pieces, 0);
    const summary = await w.summary("rahul");
    assert.deepEqual([summary.body.writtenToGive, summary.body.writtenNext], [1, { weekNumber: 2, uid: "kofi" }]);
  });
});

// ---------------------------------------------------------------------------
// 5. The pages
// ---------------------------------------------------------------------------

describe("5. the pages", () => {
  test("the person's week page draws each piece under the week's status, signed, oldest first, and never whether it was emailed", async () => {
    await weekTwoWritten();
    await w.give("rahul", "chloe", 2, "Good use of the diary.");
    w.at("2026-11-17T13:00:00Z");
    await w.give("claudia", "chloe", 2, "Bring your question to the social.", { on: "week" });
    const page = await w.weekPage("chloe", 2);
    assert.match(
      page.text,
      /Feedback R Feedback from Rahul Your facilitator · Tue 17 Nov Good use of the diary\. N From the NAISI team Claudia, who leads AGI Strategy · Tue 17 Nov Bring your question to the social\./,
    );
    // Each signed with the name its writer goes by (privacy v15: only the committee sees a full name): no
    // surname, and no initial taken from one.
    assert.doesNotMatch(page.text, /Mehta|Reyes|\bRM\b|\bCR\b/);
    assert.match(page.html, /<section id="feedback"/);
    assert.doesNotMatch(page.text, /Emailed|Not emailed|No marks|There are no marks/);
    // This week's row and the answer's own card lead to it, on the same page.
    assert.match(page.html, /<a href="#feedback"[^>]*>Feedback from Rahul<\/a>/);
    // Only their own: another fellow's page has none of it.
    const farah = await w.weekPage("farah", 2);
    assert.doesNotMatch(farah.text, /Good use of the diary|Bring your question/);
    assert.deepEqual(farah.overview.weeks.find((week) => week.weekNumber === 2).feedback, []);
  });

  test("the old feedback page sends its reader to the week's Feedback, so links in emails already sent keep working", async () => {
    assert.equal((await w.feedbackPage("chloe", 2)).to, `/learn/${RUN.agi}/weeks/2#feedback`);
    assert.equal((await w.feedbackPage("chloe", 0)).to, `/learn/${RUN.agi}`);
    assert.equal((await w.feedbackPage("chloe", "two")).to, `/learn/${RUN.agi}`);
    assert.equal((await w.feedbackPage("chloe", 2)).wrote, false);
  });

  test("the review page: Your feedback in place of the rubric, saved to the week page and emailed later, and every other piece signed with its email state", async () => {
    await weekTwoWritten();
    await w.give("sofia", "chloe", 2, "Sofia’s thoughts.");
    const page = await w.writtenPage("rahul", { week: "2", person: "chloe" });
    assert.match(page.text, new RegExp(`Your feedback ${escape(words.FEEDBACK_HINT)} Comment`));
    assert.match(page.text, /Shows on Chloe’s week 2 page as soon as you save\./);
    assert.match(page.text, /Save feedback/);
    assert.match(page.text, /S Feedback from Sofia Chloe’s facilitator · Tue 17 Nov Sofia’s thoughts\. Not emailed yet/);
    // The people running the group read each piece signed as Chloe does, by the name its writer goes by.
    assert.doesNotMatch(page.text, /Rossi|\bSR\b/);
    assert.doesNotMatch(page.text, /The rubric|A short comment|Send feedback to|The email Chloe gets|No marks/);
    // The list puts Chloe under With feedback, by whoever left it.
    assert.match(page.text, /With feedback 1 CN Chloe Nguyen By Sofia/);
    // Rahul's own piece is what Your feedback changes, until its email goes.
    await w.give("rahul", "chloe", 2, "Rahul's own.");
    const again = await w.writtenPage("rahul", { week: "2", person: "chloe" });
    assert.match(again.html, /<textarea[^>]*>Rahul&#x27;s own\.<\/textarea>/);
    assert.match(again.text, /Save changes/);
    assert.match(again.text, /Written by Rahul, Tue 17 Nov, 12pm · Not emailed yet/);
  });

  test("Feedback to write: readable answers with no feedback from anyone, from the week's session for a week", async () => {
    await weekTwoWritten();
    const summary = await w.summary("rahul");
    // Chloe's, Farah's and Kofi's week 2 answers: Group B met on Tue 10 Nov, and Kofi's draft locked with it.
    assert.deepEqual([summary.body.writtenToGive, summary.body.writtenWeeks], [3, [2, 2, 2]]);
    await w.give("sofia", "chloe", 2, "Taken.");
    assert.equal((await w.summary("rahul")).body.writtenToGive, 2, "feedback from anyone takes it off");
    // Seven days after Group B met for week 2 (Tue 10 Nov, 6pm), nothing of week 2 waits here.
    w.at("2026-11-17T18:01:00Z");
    assert.equal((await w.summary("rahul")).body.writtenToGive, 0);
    const group = await w.groupPage("rahul");
    assert.match(group.text, new RegExp(`${words.FEEDBACK_TO_WRITE} Nothing to write ${escape(words.TO_WRITE_LINE)}`));
  });

  test("the Overview's Feedback to send: an admin's ticks, test and send; the lead reads the list and is told an admin sends it", async () => {
    await weekTwoWritten();
    await w.give("rahul", "chloe", 2, "One.");
    await w.give("claudia", "farah", 2, "Two.", { on: "week" });
    const admin = await w.overviewTab("zach");
    assert.match(admin.text, /Feedback to send/);
    assert.match(admin.text, /2 pieces of feedback for 2 people aren’t emailed yet\./);
    assert.match(admin.text, /Chloe Nguyen Group B Week 2 written answer Rahul Tue 17 Nov/);
    assert.match(admin.text, /Week 2 as a whole Claudia/);
    assert.match(admin.text, /Send a test to me Send 2 emails/);
    assert.match(admin.text, new RegExp(escape(words.TEST_FIRST_LINE)));
    assert.match(admin.html, /type="checkbox"/);
    assert.match(admin.text, /The email each person gets New feedback on your AGI Strategy work/);
    const lead = await w.overviewTab("claudia");
    assert.match(lead.text, /2 pieces of feedback for 2 people aren’t emailed yet\./);
    assert.match(lead.text, new RegExp(escape(words.ADMINS_SEND)));
    assert.doesNotMatch(lead.text, /Send a test to me|Send 2 emails/);
    assert.doesNotMatch(lead.html, /type="checkbox"/);
  });
});

/** A string as a regular expression's literal text. */
function escape(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------------------------------------------------------
// 6. Deleting an account
// ---------------------------------------------------------------------------

describe("6. deleting an account takes the feedback on its work and the feedback it wrote, and clears its presses", () => {
  test("pieces about them and by them go; a piece their press emailed and the batch's record keep, with who pressed cleared", async () => {
    const accountDeletion = await w.loadTs("lib/firestore/accountDeletion.ts");
    await weekTwoWritten();
    const aboutChloe = (await w.give("rahul", "chloe", 2, "On Chloe's.")).body.piece.id;
    const byClaudia = (await w.give("claudia", "farah", 2, "Claudia's.", { on: "week" })).body.piece.id;
    const kept = (await w.give("sofia", "kofi", 2, "Sofia's on Kofi's.")).body.piece.id;
    // Claudia was the admin who pressed this one's email, and who sent herself a test.
    w.world.db.poke(`courseFeedback/${kept}`, { emailedAt: new Date(NOW), emailedByUid: "claudia", emailDelivery: "sent" });
    w.world.db.seed("courseFeedbackSends/test-1", { kind: "test", runId: RUN.agi, byUid: "claudia", at: new Date(NOW) });
    w.world.db.seed("courseFeedbackSends/send-1", { kind: "send", runId: RUN.agi, byUid: "zach", at: new Date(NOW), people: 1, pieces: 1, pieceIds: [kept] });

    assert.deepEqual(await accountDeletion.clearCourseFeedback(w.world.db, "claudia"), { deleted: 1, cleared: 2 });
    assert.equal(w.world.db.read(`courseFeedback/${byClaudia}`), undefined, "a piece signed with a name that has gone");
    assert.equal(w.world.db.read(`courseFeedback/${kept}`).emailedByUid, "");
    assert.equal(w.world.db.read(`courseFeedback/${kept}`).text, "Sofia's on Kofi's.", "Kofi's feedback stays, about Kofi");
    assert.equal(w.world.db.read("courseFeedbackSends/test-1").byUid, "");
    assert.equal(w.world.db.read("courseFeedbackSends/send-1").byUid, "zach", "somebody else's press is untouched");

    assert.deepEqual(await accountDeletion.clearCourseFeedback(w.world.db, "chloe"), { deleted: 1, cleared: 0 });
    assert.equal(w.world.db.read(`courseFeedback/${aboutChloe}`), undefined, "the feedback on their work goes with it");
    // Somebody with nothing changes nothing.
    const before = w.everything();
    assert.deepEqual(await accountDeletion.clearCourseFeedback(w.world.db, "hamza"), { deleted: 0, cleared: 0 });
    assert.equal(w.everything(), before);
  });

  test("the cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const code = readFileSync(new URL("../src/lib/firestore/accountDeletion.ts", import.meta.url), "utf8");
    assert.match(
      code,
      /try \{\s*const feedback = await clearCourseFeedback\(db, uid\);\s*summary\.courseFeedbackDeleted = feedback\.deleted;\s*summary\.courseFeedbackCleared = feedback\.cleared;\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
    assert.match(code, /courseFeedbackDeleted: 0,\s*courseFeedbackCleared: 0,/);
  });
});
