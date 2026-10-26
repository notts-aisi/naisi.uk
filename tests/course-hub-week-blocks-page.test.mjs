/**
 * The member's side of the coursework (boards st-week1-phone, wk-week-phone,
 * wk-week, wk-programme): the week page for a week written as blocks, the
 * reflection boxes and their store, and the counts by This week's tasks on
 * the week page, the programme page and Home.
 *
 * Driven through the real routes (the overview, my-exercises, the reflection
 * routes, the review queue and a verdict), the week page's real server shell
 * and the real pages, as every kind of caller: Chloe, placed in Group B and
 * told; Amara, in Group A; Una, placed and not told; Sam, who left; Omar,
 * taken off; Nobody, on nothing; Rahul, who facilitates Group B, and Sofia,
 * who facilitates Groups A and B; Claudia, the programme's lead; Tess, who
 * leads another programme; Zach, an admin; and somebody signed out.
 *
 *  1. A block week drawn word for word, in order; the blocks a later page
 *     draws draw nothing; a week written before blocks is drawn as before.
 *  2. A reflection is written only by its writer, into their own box, and
 *     read back only by them on a page; the programme's lead and admins read
 *     it through the one reader route, and everybody else is refused. It is
 *     never reviewed or queued.
 *  3. A group's facilitators take part (Zach, Mon 26 Oct): their own boxes,
 *     ticks and count; their reflections read by the lead and admins only.
 *  4. The counts: This week's tasks on all three pages, week 1's "0 of 1
 *     done", and a task holding what a later page finishes never done.
 *  5. Who reaches the page at all.
 *
 * Every word in the weeks is made up; every address is on example.com or
 * example.org.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { NOW, RUN, B, makeWeekBlocksPageWorld, textOf, weekOneBlocks } from "./lib/weekBlocksPageWorld.mjs";
import { COURSE } from "./lib/hubAttendanceWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeWeekBlocksPageWorld();
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW.toISOString());
  w.reset();
});

/** The ids of week 1's and week 3's six boxes and two sources. */
const boxes = (k) => [1, 2, 3, 4, 5, 6].map((n) => `${k}-rp${n}`);
const sources = (k) => [`${k}-s1`, `${k}-s2`];

/** Writes something in every box of a week, as `who`. */
async function writeAll(who, k, weekId) {
  for (const id of boxes(k)) {
    const answer = await w.writeBox(who, id, weekId, `Words for ${id}.`);
    assert.equal(answer.status, 200, `${who} ${id}: ${JSON.stringify(answer.body)}`);
  }
}

/** Each phrase appears, and in this order. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const at = text.indexOf(phrase, from);
    assert.ok(at >= 0, `missing, or out of order: "${phrase}"`);
    from = at + phrase.length;
  }
}

const rowPath = (uid, weekId, id) => `courseExerciseResponses/${RUN.agi}__${uid}__${weekId}__${id}`;

// ---------------------------------------------------------------------------
// 1. The page draws a block week
// ---------------------------------------------------------------------------

describe("1. a week written as blocks, drawn", () => {
  test("week 1 for Chloe, word for word and in order (st-week1-phone)", async () => {
    const { text, shell } = await w.weekPage("chloe", 1);
    assert.equal(shell.component, "WeekView");
    inOrder(text, [
      "Fellowship: AGI Strategy · Week 1 of 6",
      "Who keeps the lamps",
      "This week",
      "0 of 1 done",
      "Work through the three parts below, writing in the boxes as you go",
      "About 60 minutes",
      "Before your first session, Tue 3 Nov, if you can",
      "Talk and short answer",
      "None this week",
      "You will pick a topic at the end of the session",
      "In all: About 60 minutes",
      "Do what you can before the session. Short of time? Do part 1.",
      "Why this week",
      "Lighthouses keep ships off rocks. This week asks who keeps the lamps lit.",
      "After this week you can",
      "Name three kinds of lamp.",
      "Say who trims the wick.",
      "Before the session",
      "About 60 minutes",
      "Work through the parts in order.",
      "Write your answers in the boxes below. They save as you type.",
      "Part 1",
      "About 5 minutes",
      "Start with what you think",
      "Write before you read anything.",
      "Reflect",
      "How many lighthouses are still lit, do you think?",
      "Who should pay for the lamp oil?",
      "Rahul, Sofia, Claudia and admins can read your reflections. Other fellows can’t.",
      "Rahul or Sofia may read a line out in the session, without your name.",
      "Part 2",
      "About 45 minutes",
      "Two keepers' views",
      "Two very different keepers.",
      "A keeper's diary",
      "Read",
      "20 minutes",
      "Ada Example · 2024",
      "The first chapter is enough.",
      "Lamps at night",
      "Watch",
      "About 25 minutes",
      "Example Films · March 2025",
      "Rahul, Sofia, Claudia and admins can see which sources you tick.",
      "Reflect",
      "Where do the two keepers disagree?",
      "Which scene felt most true?",
      "Part 3",
      "What would change your mind?",
      "Look back at your number from part 1.",
      "What would you need to see next year?",
      "In the session",
      "You will compare notes in pairs.",
      "Go further (optional)",
      "2 items",
      "More for anyone who wants it.",
      "Not counted in your time or progress.",
      "Keepers talk",
      "Listen",
      "40 minutes",
      "Example Radio · 2023",
      "A long conversation.",
      "The lamp book",
      "Example Press",
      "The whole history.",
    ]);
    // The lines under the boxes are said once, under the first stop.
    assert.equal(text.split("can read your reflections").length - 1, 1);
    assert.equal(text.split("may read a line out").length - 1, 1);
    assert.equal(text.split("can see which sources you tick").length - 1, 1);
    // Six boxes, each a labelled textarea, empty and ready.
    const { html } = await w.weekPage("chloe", 1);
    assert.equal((html.match(/<textarea/g) ?? []).length, 6);
    assert.equal((html.match(/placeholder="A sentence or two"/g) ?? []).length, 6);
    assert.equal((html.match(/<label for="/g) ?? []).length, 6);
    // Two sources to tick, each a link that opens beside the page.
    assert.equal((html.match(/type="checkbox"/g) ?? []).length, 2);
    assert.match(html, /href="https:\/\/example\.com\/diary" target="_blank" rel="noopener noreferrer"/);
    // No Start here or Glossary until those pages exist, and no bar.
    assert.doesNotMatch(text, /Start here|Glossary/);
    assert.doesNotMatch(html, /role="progressbar"/);
    // "On this page", with the parts.
    inOrder(text, ["On this page", "This week", "0 of 1", "Why this week", "Before the session", "Start with what you think", "Two keepers' views", "What would change your mind?", "In the session", "Go further"]);
  });

  test("week 2 holds every kind of block: what this page draws, and nothing of what a later page will", async () => {
    const { text } = await w.weekPage("chloe", 2);
    inOrder(text, [
      "This week",
      "0 of 3 done",
      "Parts 1 to 3 below: two shared readings, then your pack",
      "Before your session, Tue 10 Nov",
      "Part 4: your forecast, the week’s written answer (200 to 300 words)",
      "By the end of Mon 9 Nov",
      "Your case study: a 3-minute talk on a case from your pack",
      "At your session, Tue 10 Nov",
      "Part 5 and the pitch",
      "None this week",
      "They come back in a later week",
      "Optional, not counted: Hands-on route (optional, for coders)",
      "An hour or more",
      "Any time; not counted in the total",
      "In all: About 2 hours",
      "Why this week",
      "Forecasts are only useful if someone checks them. This week practises base rates and calibration, using a short guide.",
      "After this week you can",
      "Content note",
      "If anything this week weighs on you, talk to your facilitator, or to one of these.",
      "A listening line",
      "Open overnight",
      "Write to the society",
      "Before the session",
      "About 70 minutes, plus your forecast",
      "Part 1",
      "Start with a base rate",
      "A field guide to base rates",
      "section 2, “Counting”, of The forecaster’s handbook",
      "Read",
      "5 minutes",
      "Example Press · 2023",
      "Only the first table.",
      "Pick a question you care about. What is its base rate?",
      "Part 2",
      "Overconfidence, explained",
      "Score your own forecasts",
      "Notebook",
      "About 10 minutes",
      "Example Lab",
      "Runs on a free notebook service",
      "Where were you most overconfident this year?",
      "Write a number.",
      "Write a reason.",
      "Part 3",
      "Your pack",
      "If you take markets, keep to how prices form, not to trading advice.",
      "Part 4",
      "Your forecast, the week’s written answer",
      "Part 5",
      "Plan and pitch",
      // The fill-in boxes (wk-week6-phone's action plan), drawn since week 6's
      // piece: the title, the count, each numbered heading with its hint and
      // its boxes' labels, and who reads them.
      "My plan",
      "0 of 3 filled",
      "Saves as you type. It’s here on your phone for the session.",
      "What I’ll forecast next",
      "(one sentence)",
      "Why it matters",
      "The decision it helps with",
      "Who would use it",
      "Rahul, Sofia, Claudia and admins can read your plan. Other fellows can’t.",
      "Find one forecast someone else made this year.",
      "Note how it turned out.",
      "In the session",
      "You’ll compare forecasts in pairs, then as a group.",
      "Before you come (about 5 minutes). Bring your number on a slip of paper.",
      "Go further (optional)",
      "Superforecasting, a summary",
      "Watch or read",
      "the same story told twice, in a video or an essay, about 20 minutes either way.",
      "Where to go next",
      "With the society. Ask about next term’s groups.",
      "Route What it is A reading group Weekly, in person A summer project Ten weeks, paid",
      "Hands-on route (optional, for coders)",
      "Not counted in your time or progress.",
      "Score a forecast in code. It runs on a free notebook service.",
      "Score it yourself: a short exercise, about an hour.",
      "def brier(p, outcome): return (p - outcome) ** 2 print(brier(0.7, 1))",
    ]);
    const { html } = await w.weekPage("chloe", 2);
    // Code is drawn exactly as written, every space and line kept, in a block
    // of its own; a table in a week's text sits in its own sideways scroll.
    assert.ok(
      html.includes('<pre class="code"><code>def brier(p, outcome):\n    return (p - outcome) ** 2\n\nprint(brier(0.7, 1))</code></pre>'),
      "the hands-on route's code is not drawn to the character",
    );
    assert.match(html, /<div class="table"><table><thead><tr><th scope="col">Route<\/th><th scope="col">What it is<\/th><\/tr><\/thead>/);
    // The words before a title are not part of its link; a notebook's link is its own.
    assert.match(html, /<span class="sourceLead">section 2, “Counting”, of <\/span><a class="sourceTitle" href="https:\/\/example\.org\/handbook" target="_blank" rel="noopener noreferrer">The forecaster’s handbook/);
    // The hands-on route and Go further are closed until opened, and both are listed beside the page.
    assert.equal((html.match(/<details class="goDetails">/g) ?? []).length, 2);
    inOrder(textOf(html), ["On this page", "In the session", "Go further", "Where to go next", "Hands-on route"]);
    // The row that is only offered carries the drawn line, never a mark that says done or not done.
    assert.doesNotMatch(textOf(html), /Not done yet: Hands-on route/);
    // The written answer is drawn now (its own page, the written answers
    // piece): its label, its question and what a strong answer does, in
    // that order, inside its part. Its two lines used to stand in the list
    // below as drawing nothing; they are held here as drawn, as strictly.
    inOrder(text, [
      "Part 4",
      "Your forecast, the week’s written answer",
      "Written answer",
      "Will your pack’s question come true by next year?",
      "Give a number.",
      "Give three reasons, from your pack.",
      "A strong answer names its base rate and says what would change it.",
      "Keep it: you will check it in the last week.",
      "Part 5",
    ]);
    // The packs are drawn (plan item 8, packs and cases): the Choose one a
    // facilitator gives out, with the line that says so, the questions to
    // read every pack against, and each pack's name, time, sources and
    // reading; then the one Chloe picks, with its line. Nothing is given out
    // to Chloe yet, so no pack is marked as Chloe's and none has a tick.
    inOrder(textOf(html), [
      "Your pack",
      "Read the pack you were given at the end of the last session.",
      "Packs",
      "Given out at the end of session 1. Only your pack counts. To switch, ask Rahul or Sofia.",
      "Base rate: what has happened before?",
      "Change: what is different now?",
      "Elections",
      "25 minutes · 2 sources",
      "Example Press, “Polls and their errors” (2023), and Example Radio, “A podcast on swing” (2022), from 10 minutes in",
      "Markets",
      "About 30 minutes · 1 source",
      "Example Journal, “Prices as forecasts” (2021)",
      "Technology",
      "20 minutes · 1 source",
      "Example Lab, “A timeline tool”",
      "If you take markets, keep to how prices form, not to trading advice.",
      "Plan and pitch",
      "Choose one",
      "One short guide that fits you",
      "10 to 15 minutes",
      "Only the one you choose counts.",
      "Forecasting at work",
      "if you like numbers",
      "Forecasting in public",
      "if you like writing",
    ]);
    assert.doesNotMatch(html, /Your pack<\/span>/);
    // The talks are drawn (plan item 8): the pitch with how to prepare and
    // "Ready for my pitch", then the case study with Chloe's case not given
    // yet, every case of the week by pack, and the content note on the one
    // that has one.
    inOrder(textOf(html), [
      "Prepare by answering two questions:",
      "What will you forecast?",
      "Who will check it?",
      "Ready for my pitch",
      "Your case study",
      "You get a case from your pack at the end of the previous session.",
      "Your case",
      "Not given yet",
      "Given out at the end of session 1.",
      "Ready for my talk",
      "Prepare a 3-minute talk: the three questions",
      "All 3 cases this week",
      "If a case weighs on you, swap it.",
      "Elections",
      "2 cases",
      "The surprise result, 2016",
      "The close call, 2019",
      "The sources quote abusive posts: talk to your facilitator before you take this one.",
      "Markets",
      "1 case",
      "The crash nobody priced, 2008",
      "In the session",
    ]);
    // A later page's: the table draws nothing yet.
    for (const later of [
      "Forecasting packs",
      "Where to start",
      "Make one forecast about your pack’s question",
    ]) {
      assert.ok(!text.includes(later), `drawn, though a later page draws it: "${later}"`);
    }
  });

  test("a week written before blocks is drawn exactly as before", async () => {
    at("2026-11-18T09:00:00Z"); // after Group B's week 3 session, so week 4 is open
    const { text, html } = await w.weekPage("chloe", 4);
    assert.match(text, /Before your session/);
    assert.match(text, /Exercise/);
    assert.match(text, /What is week 4 about\?/);
    assert.match(text, /0 of 2 done/);
    assert.match(html, /role="progressbar" aria-label="Week progress"/);
    for (const blockOnly of ["In all:", "Reflect", "On this page", "Go further", "can read your reflections"]) {
      assert.ok(!text.includes(blockOnly), `a block week's words on a week written before blocks: ${blockOnly}`);
    }
  });

  test("an admin reads the week with no ticks, boxes or count", async () => {
    const { text, html, shell } = await w.weekPage("zach", 1);
    assert.equal(shell.props.viewerRole, "admin");
    assert.match(text, /How many lighthouses are still lit, do you think\?/);
    assert.doesNotMatch(html, /<textarea/);
    assert.doesNotMatch(html, /type="checkbox"/);
    assert.doesNotMatch(text, /of 1 done/);
    assert.doesNotMatch(text, /can read your reflections|Write your answers in the boxes/);
  });
});

// ---------------------------------------------------------------------------
// 2. Reflections: written by their writer, read back by their writer
// ---------------------------------------------------------------------------

describe("2. a reflection is its writer's own", () => {
  test("Chloe's box saves as she types, reads back to her, and is stored as a reflection", async () => {
    const saved = await w.writeBox("chloe", "k1-rp1", "w01", "  About a third of them.  ");
    assert.equal(saved.status, 200);
    assert.deepEqual(
      { kind: saved.body.response.kind, text: saved.body.response.text, sent: saved.body.response.submittedAt },
      { kind: "reflection", text: "About a third of them.", sent: null },
    );
    const stored = w.world.db.read(rowPath("chloe", "w01", "k1-rp1"));
    assert.equal(stored.kind, "reflection");
    assert.equal(stored.uid, "chloe");
    assert.equal(stored.exerciseId, "k1-rp1");
    assert.equal(stored.weekNumber, 1);
    assert.equal(stored.text, "About a third of them.");
    assert.equal(stored.submittedAt, null);
    assert.equal(stored.reviewStatus, "unreviewed");

    const own = await w.ownRowsOf("chloe", 1);
    assert.equal(own.status, 200);
    const row = own.body.responses.find((response) => response.exerciseId === "k1-rp1");
    assert.equal(row.kind, "reflection");
    assert.equal(row.text, "About a third of them.");

    const { html, text } = await w.weekPage("chloe", 1);
    assert.match(html, /<textarea[^>]*>About a third of them\.<\/textarea>/);
    assert.match(text, /Saved/);
  });

  test("nobody else's page reads it back: Amara's rows and page do not hold it", async () => {
    await w.writeBox("chloe", "k1-rp1", "w01", "Chloe's own words.");
    const amara = await w.ownRowsOf("amara", 1);
    assert.equal(amara.status, 200);
    assert.ok(!amara.body.responses.some((row) => row.text === "Chloe's own words."));
    const { html } = await w.weekPage("amara", 1);
    assert.doesNotMatch(html, /Chloe&#x27;s own words/);
    for (const who of ["rahul", "sofia", "claudia", "zach"]) {
      const { html: page } = await w.weekPage(who, 1);
      assert.doesNotMatch(page, /Chloe&#x27;s own words/, `${who}'s week page shows Chloe's reflection`);
    }
  });

  test("only the programme's lead and admins read somebody else's, through the one reader", async () => {
    await w.writeBox("chloe", "k1-rp1", "w01", "For the lead.");
    for (const who of ["claudia", "zach"]) {
      const answer = await w.readReflections(who, "chloe", 1);
      assert.equal(answer.status, 200, who);
      assert.deepEqual(answer.body.reflections.map((row) => [row.promptId, row.weekId, row.text]), [["k1-rp1", "w01", "For the lead."]]);
      assert.deepEqual(Object.keys(answer.body.reflections[0]).sort(), ["promptId", "text", "updatedAt", "weekId"]);
    }
    for (const who of ["rahul", "sofia", "amara", "chloe", "una", "sam", "omar", "nobody", "tess", "lloyd", "yusuf"]) {
      const answer = await w.readReflections(who, "chloe", 1);
      assert.equal(answer.status, 403, `${who} read Chloe's reflections`);
      assert.ok(!JSON.stringify(answer.body).includes("For the lead."));
    }
    assert.equal((await w.readReflections(null, "chloe", 1)).status, 401);
    assert.equal((await w.readReflections("claudia", "", 1)).status, 400);
    assert.equal((await w.readReflections("claudia", "chloe", 0)).status, 400);
  });

  test("nobody writes it but Chloe: every other caller writes their own row or is refused", async () => {
    await w.writeBox("chloe", "k1-rp1", "w01", "Chloe's.");
    // Amara, in another group, writes her OWN box of the same prompt.
    assert.equal((await w.writeBox("amara", "k1-rp1", "w01", "Amara's.")).status, 200);
    assert.equal(w.world.db.read(rowPath("chloe", "w01", "k1-rp1")).text, "Chloe's.");
    assert.equal(w.world.db.read(rowPath("amara", "w01", "k1-rp1")).text, "Amara's.");
    // Not told, left, taken off, on nothing, the lead, another lead, an admin.
    for (const who of ["una", "sam", "omar", "nobody", "claudia", "tess", "zach", "lloyd", "yusuf"]) {
      const answer = await w.writeBox(who, "k1-rp1", "w01", "Not mine to write.");
      assert.equal(answer.status, 403, `${who} wrote a reflection: ${JSON.stringify(answer.body)}`);
      assert.equal(w.world.db.read(rowPath(who, "w01", "k1-rp1")), undefined);
    }
    assert.equal((await w.writeBox(null, "k1-rp1", "w01", "x")).status, 401);
    // Viewing as Chloe writes nothing in her name.
    const viewAs = await w.writeBox("chloe", "k1-rp2", "w01", "Seen as Chloe.", { viewAs: true });
    assert.equal(viewAs.status, 403);
    assert.equal(w.world.db.read(rowPath("chloe", "w01", "k1-rp2")), undefined);
  });

  test("only a box of the week as the writer reads it: never an answer's id, never a week written before blocks", async () => {
    assert.equal((await w.writeBox("chloe", "k9-nowhere", "w01", "x")).status, 404);
    assert.equal((await w.writeBox("chloe", "k1-rp1", "w03", "x")).status, 404, "a prompt of another week");
    assert.equal((await w.writeBox("chloe", "wa-1", "w02", "x")).status, 404, "the written answer's id");
    assert.equal((await w.writeBox("chloe", "x4", "w04", "x")).status, 404, "a week written before blocks");
    assert.equal((await w.writeBox("chloe", "k1-rp1", "3", "x")).status, 400);
    assert.equal((await w.writeBox("chloe", "k1-rp1", "w01", "x".repeat(4001))).status, 400);
    const notText = await w.writeBox("chloe", "k1-rp1", "w01", 42);
    assert.equal(notText.status, 400);
    // An answer already stored under a box's id is never written over.
    w.world.db.seed(rowPath("chloe", "w01", "k1-rp3"), { runId: RUN.agi, uid: "chloe", weekId: "w01", weekNumber: 1, exerciseId: "k1-rp3", responseType: "text", text: "An answer.", reviewStatus: "unreviewed", submittedAt: null });
    assert.equal((await w.writeBox("chloe", "k1-rp3", "w01", "Over it.")).status, 409);
    assert.equal(w.world.db.read(rowPath("chloe", "w01", "k1-rp3")).text, "An answer.");
  });

  test("an emptied box removes the row", async () => {
    await w.writeBox("chloe", "k1-rp1", "w01", "Something.");
    const emptied = await w.writeBox("chloe", "k1-rp1", "w01", "   ");
    assert.equal(emptied.status, 200);
    assert.equal(emptied.body.response.text, null);
    assert.equal(w.world.db.read(rowPath("chloe", "w01", "k1-rp1")), undefined);
  });

  test("a reflection is never reviewed or queued", async () => {
    await w.writeBox("chloe", "k1-rp1", "w01", "Not for review.");
    const id = `${RUN.agi}__chloe__w01__k1-rp1`;
    const verdict = (who) =>
      w.call(who, w.routes.review.POST, { responseId: id }, { course: true, body: { reviewStatus: "approved", reviewerComment: "Good." } });
    assert.equal((await verdict("rahul")).status, 403, "a facilitator of Chloe's group");
    assert.equal((await verdict("zach")).status, 404, "an admin is told there is no such answer");
    const row = w.world.db.read(rowPath("chloe", "w01", "k1-rp1"));
    assert.equal(row.reviewStatus, "unreviewed");
    assert.equal(row.reviewerComment, undefined);

    w.world.user = w.sessionOf("rahul");
    w.world.course = true;
    const queue = await w.routes.queue.GET(new Request("https://naisi.invalid/api?week=1"), { params: Promise.resolve({ groupId: B }) });
    w.world.course = false;
    assert.equal(queue.status, 200);
    const all = queue.body.rows.flatMap((person) => person.responses);
    assert.ok(!all.some((response) => response.exerciseId === "k1-rp1" || response.text === "Not for review."));
  });
});

// ---------------------------------------------------------------------------
// 3. A group's facilitators take part (Zach, Mon 26 Oct)
// ---------------------------------------------------------------------------

describe("3. a group's facilitator takes part, as themselves", () => {
  test("Rahul writes his own reflection; the lead and an admin read it, his co-facilitator and a member do not", async () => {
    const saved = await w.writeBox("rahul", "k1-rp1", "w01", "A facilitator's own view.");
    assert.equal(saved.status, 200);
    assert.equal(w.world.db.read(rowPath("rahul", "w01", "k1-rp1")).kind, "reflection");
    for (const who of ["claudia", "zach"]) {
      const answer = await w.readReflections(who, "rahul", 1);
      assert.equal(answer.status, 200, who);
      assert.deepEqual(answer.body.reflections.map((row) => row.text), ["A facilitator's own view."]);
    }
    for (const who of ["sofia", "chloe", "farah", "amara"]) {
      const answer = await w.readReflections(who, "rahul", 1);
      assert.equal(answer.status, 403, `${who} read Rahul's reflection`);
    }
    const sofiaPage = await w.weekPage("sofia", 1);
    assert.doesNotMatch(sofiaPage.html, /A facilitator&#x27;s own view/);
  });

  test("Rahul's page: his boxes, his ticks, his count, and lines that name only the lead and admins", async () => {
    await w.writeBox("rahul", "k1-rp1", "w01", "Rahul's first box.");
    const before = await w.weekPage("rahul", 1);
    assert.equal(before.shell.props.viewerRole, "facilitator");
    assert.match(before.html, /<textarea[^>]*>Rahul&#x27;s first box\.<\/textarea>/);
    assert.match(before.text, /0 of 1 done/);
    assert.match(before.text, /Only Claudia and admins can read your reflections\./);
    assert.match(before.text, /Only Claudia and admins can see which sources you tick\./);
    assert.doesNotMatch(before.text, /may read a line out|Other fellows can’t/);
    // His ticks are boxes he can use.
    assert.equal((before.html.match(/type="checkbox"/g) ?? []).length, 2);
    assert.doesNotMatch(before.html, /type="checkbox"[^>]*disabled/);

    await writeAll("rahul", "k1", "w01");
    const after = await w.weekPage("rahul", 1, sources("k1"));
    assert.match(after.text, /1 of 1 done/);
    assert.match(after.text, /Done/);
  });

  test("a facilitator who holds a place: their own boxes through their learner's row, and lines that name only the lead and admins", async () => {
    // Chloe holds a place in Group B and becomes one of its facilitators
    // (a facilitator who holds a place sits in the group they facilitate).
    // Their own work is read by the programme's lead and admins, never by a
    // co-facilitator, so their page says what Rahul's says.
    const member = await w.weekPage("chloe", 1);
    assert.match(member.text, /Rahul, Sofia, Claudia and admins can read your reflections\. Other fellows can’t\./);
    w.world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "chloe"] });
    assert.equal((await w.writeBox("chloe", "k1-rp1", "w01", "Chloe's own view.")).status, 200);
    assert.equal(w.world.db.read(rowPath("chloe", "w01", "k1-rp1")).kind, "reflection");
    const page = await w.weekPage("chloe", 1);
    assert.match(page.html, /<textarea[^>]*>Chloe&#x27;s own view\.<\/textarea>/);
    assert.match(page.text, /Only Claudia and admins can read your reflections\./);
    assert.match(page.text, /Only Claudia and admins can see which sources you tick\./);
    assert.doesNotMatch(page.text, /may read a line out|Other fellows can’t|Rahul, Sofia/);
    // Their co-facilitator is refused their reflections, as Rahul's are.
    assert.equal((await w.readReflections("rahul", "chloe", 1)).status, 403);
    assert.equal((await w.readReflections("claudia", "chloe", 1)).status, 200);
  });

  test("a facilitator of two groups writes on the run's own week, and a member placed nowhere still cannot", async () => {
    assert.equal((await w.writeBox("sofia", "k1-rp2", "w01", "Sofia's.")).status, 200);
    assert.equal((await w.writeBox("tom", "k1-rp2", "w01", "Tom's.")).status, 200);
    assert.equal((await w.writeBox("nobody", "k1-rp2", "w01", "x")).status, 403);
  });
});

// ---------------------------------------------------------------------------
// 4. The counts: This week's tasks, on all three pages
// ---------------------------------------------------------------------------

describe("4. counts by This week's tasks", () => {
  test("the week page: ticks alone are not the task; every source ticked and every box written is", async () => {
    let page = await w.weekPage("chloe", 1, sources("k1"));
    assert.match(page.text, /0 of 1 done/);
    await writeAll("chloe", "k1", "w01");
    page = await w.weekPage("chloe", 1, ["k1-s1"]);
    assert.match(page.text, /0 of 1 done/, "one source still to tick");
    page = await w.weekPage("chloe", 1, sources("k1"));
    assert.match(page.text, /1 of 1 done/);
    // The task's Done, and each of the three parts' Done chips.
    assert.match(page.text, /Before your first session, Tue 3 Nov, if you can Done/);
    for (const head of ["Part 1 · About 5 minutes Done", "Part 2 · About 45 minutes Done", "Part 3 · About 10 minutes Done"]) {
      assert.ok(page.text.includes(head), head);
    }
  });

  test("a part's Done chip follows its own sources and boxes", async () => {
    await w.writeBox("chloe", "k1-rp3", "w01", "One.");
    await w.writeBox("chloe", "k1-rp4", "w01", "Two.");
    const page = await w.weekPage("chloe", 1, sources("k1"));
    // Part 2 is done, parts 1 and 3 are not, and so the task is not.
    assert.match(page.text, /Part 2 · About 45 minutes Done Two keepers' views/);
    assert.match(page.text, /Part 1 · About 5 minutes Start with what you think/);
    assert.match(page.text, /0 of 1 done/);
  });

  test("a task holding what a later page finishes is never done, whatever else is", async () => {
    // Every source and checklist item ticked and every box written: only what a later page finishes is left.
    const ticked = ["src-1", "src-7", "src-2", "src-8", "ci-1", "ci-2"];
    for (const id of ["rp-1", "rp-2", "rp-3"]) assert.equal((await w.writeBox("chloe", id, "w02", "Done.")).status, 200);
    const page = await w.weekPage("chloe", 2, ticked);
    assert.match(page.text, /0 of 3 done/);
  });

  test("This week's covers are the paste's: week 1's task covers its three parts, worked out from its words", async () => {
    // The world types no covers: weeks 1 and 3 are written out as Markdown and pasted back.
    assert.deepEqual(weekOneBlocks("k1")[0].rows[0].covers, []);
    const stored = w.lib.courses.normalizeCourseWeek("w01", w.world.db.read(`courseRuns/${RUN.agi}/weeks/w01`));
    const task = stored.blocks[0].rows[0];
    assert.deepEqual(task.covers, ["k1-p1", "k1-p2", "k1-p3"]);
    assert.equal(task.whenText, "Before session 1, if you can");
    const page = await w.weekPage("chloe", 1);
    assert.match(page.text, /This week 0 of 1 done Not done yet: Work through the three parts below/);
    // A task whose words name nothing pastes with nothing covered, and is not counted.
    const blocks = weekOneBlocks("k3");
    blocks[0].rows[0].what = "Read and reflect before the session";
    const pasted = w.pastedWeekDoc(3, "The lamp makers", blocks);
    assert.deepEqual(pasted.blocks[0].rows[0].covers, []);
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, pasted);
    const week3 = await w.weekPage("chloe", 3, sources("k3"));
    assert.doesNotMatch(week3.text, /\d of \d done/);
    assert.match(week3.text, /This week Read and reflect before the session/);
  });

  test("work due the day before is due by the course's own time, on the reader's own day", async () => {
    // By the end of the day before, as the course says when it sets no time.
    let page = await w.weekPage("chloe", 2);
    assert.match(page.text, /About 30 minutes By the end of Mon 9 Nov /);
    assert.equal((await w.overview("chloe")).body.weeks.find((week) => week.weekNumber === 2).thisWeek.dayBeforeTime, null);
    // The course sets noon: the same task, the same day, by its time.
    w.world.db.poke(`courses/${COURSE.agi}`, { dayBeforeDueTime: "12:00" });
    page = await w.weekPage("chloe", 2);
    assert.match(page.text, /About 30 minutes By noon on Mon 9 Nov /);
    const week2 = (await w.overview("chloe")).body.weeks.find((week) => week.weekNumber === 2).thisWeek;
    assert.equal(week2.dayBeforeTime, "12:00");
    assert.deepEqual(week2.rows[1].due, { dateKey: "2026-11-09", moved: false });
    // On the day itself.
    at("2026-11-09T08:00:00Z");
    page = await w.weekPage("chloe", 2);
    assert.match(page.text, /About 30 minutes By noon today, Mon 9 Nov /);
    // Any other time is said as the house says a time.
    w.world.db.poke(`courses/${COURSE.agi}`, { dayBeforeDueTime: "17:30" });
    page = await w.weekPage("chloe", 2);
    assert.match(page.text, /About 30 minutes By 5:30pm today, Mon 9 Nov /);
    // The offered row and the row with nothing to do travel as they are, and count for nothing.
    const rows = (await w.overview("chloe")).body.weeks.find((week) => week.weekNumber === 2).thisWeek.rows;
    assert.deepEqual(rows.map((row) => row.type), ["task", "task", "task", "none", "optional"]);
    assert.deepEqual(rows[4], { type: "optional", what: "Hands-on route (optional, for coders)", time: "An hour or more", note: "Any time; not counted in the total" });
    assert.equal(rows[0].whenText, "Before session 3");
  });

  test("a task nothing on the site can see finished is not counted, and carries no mark", async () => {
    // Week 3's one task covers nothing (a parser that could not tell which parts it meant).
    const stored = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`);
    const blocks = structuredClone(stored.blocks);
    blocks[0].rows[0].covers = [];
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, { ...stored, blocks });
    const page = await w.weekPage("chloe", 3, sources("k3"));
    assert.doesNotMatch(page.text, /\d of \d done/);
    assert.doesNotMatch(page.text, /Not done yet: Work through/);
    const home = await w.programmeHome("chloe", sources("k3"));
    assert.doesNotMatch(home.text, /This week \d of \d done/);
    assert.match(home.text, /Week 3 · The lamp makers Thu 12 to Wed 18 Nov Work through the three parts below/);
    assert.doesNotMatch(home.text, /Not done yet: Work through/);
  });

  test("the programme page: This week's tasks, and each week's count by them", async () => {
    let home = await w.programmeHome("chloe");
    assert.match(home.text, /This week 0 of 1 done Week 3 · The lamp makers Thu 12 to Wed 18 Nov Not done yet: Parts 1 to 3 Open week 3/);
    // No bar: the boards draw no percentages for a block week.
    assert.doesNotMatch(home.html, /role="progressbar"/);
    assert.match(home.text, /Week 1 Who keeps the lamps Tue 3 Nov · Done 0 of 1/);
    assert.match(home.text, /Week 2 How sure are you\? Tue 10 Nov · Done 0 of 3/);
    assert.match(home.text, /Week 3 The lamp makers Tonight 0 of 1/);
    await writeAll("chloe", "k3", "w03");
    await writeAll("chloe", "k1", "w01");
    home = await w.programmeHome("chloe", [...sources("k3"), ...sources("k1")]);
    assert.match(home.text, /This week 1 of 1 done Week 3 · The lamp makers Thu 12 to Wed 18 Nov Done: Parts 1 to 3 Done Open week 3/);
    assert.match(home.text, /Week 1 Who keeps the lamps Tue 3 Nov · Done 1 of 1/);
    assert.match(home.text, /Week 3 The lamp makers Tonight 1 of 1/);
  });

  test("Home's card: week 3's sources to tick, counted by its one task", async () => {
    let card = await w.homeCard("chloe");
    assert.ok(card);
    assert.match(card.text, /Before tonight 0 of 1 done Week 3 · The lamp makers A keeper's diary Read 20 minutes Lamps at night Watch About 25 minutes Open week 3/);
    assert.doesNotMatch(card.html, /role="progressbar"/);
    // The boxes to tick are the sources on week 3's path, as the week page ticks them.
    assert.equal((card.html.match(/type="checkbox"/g) ?? []).length, 2);
    await writeAll("chloe", "k3", "w03");
    card = await w.homeCard("chloe", sources("k3"));
    assert.match(card.text, /Before tonight 1 of 1 done/);
  });

  test("Home's rows to tick: the words before a title go with it, and a source whose note holds its links opens the first", async () => {
    // Week 3 loaded again with a source read from part of a longer work, and one with no link of its own,
    // written as the format holds one: a title, and a note carrying its links, who made it and how long.
    const blocks = weekOneBlocks("k3");
    const part2 = blocks.find((block) => block.id === "k3-p2");
    part2.blocks[0].lead = "the first chapter of";
    Object.assign(part2.blocks[1], {
      url: "",
      by: "",
      date: "",
      time: "",
      note: [
        { text: "Start with " },
        { text: "the trailer", href: "https://example.org/trailer" },
        { text: ", then the film, Example Films, March 2025, about 25 minutes." },
      ],
    });
    // And Go further's first item: a notebook, read from part of a longer one, with what it needs to run.
    Object.assign(blocks.find((block) => block.id === "k3-gf").items[0], { kind: "notebook", lead: "the last hour of", compute: "Needs a free account" });
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, w.pastedWeekDoc(3, "The lamp makers", blocks));
    const card = await w.homeCard("chloe");
    assert.match(card.text, /Week 3 · The lamp makers the first chapter of A keeper's diary Read 20 minutes Lamps at night Watch Open week 3/);
    assert.match(card.html, /href="https:\/\/example\.com\/diary"/);
    assert.match(card.html, /href="https:\/\/example\.org\/trailer"/);
    // The week page draws the same two: the words before the title outside its link, and a title with no link whose note holds it.
    const page = await w.weekPage("chloe", 3);
    assert.match(page.html, /<span class="sourceLead">the first chapter of <\/span><a class="sourceTitle" href="https:\/\/example\.com\/diary"/);
    assert.match(page.html, /<p class="sourceTitlePlain">Lamps at night<\/p>/);
    assert.match(page.text, /Lamps at night Watch Start with the trailer, then the film, Example Films, March 2025, about 25 minutes\./);
    assert.match(page.html, /<span class="sourceLead">the last hour of <\/span><a class="sourceTitle" href="https:\/\/example\.com\/talk"/);
    assert.match(page.text, /the last hour of Keepers talk Notebook 40 minutes Example Radio · 2023 A long conversation\. Needs a free account/);
  });

  test("the overview hands each block week its tasks, the boxes written and the day each is due", async () => {
    await w.writeBox("chloe", "k1-rp1", "w01", "One.");
    const answer = await w.overview("chloe");
    assert.equal(answer.status, 200);
    const week1 = answer.body.weeks.find((week) => week.weekNumber === 1);
    assert.deepEqual(week1.countableIds, []);
    const [task, none] = week1.thisWeek.rows;
    assert.equal(task.type, "task");
    assert.equal(task.label, "Parts 1 to 3");
    // `answerIds` joined the needs with the written answer (its own page),
    // the Choose ones and talks a task covers with packs and cases (plan
    // item 8), and the fill-in boxes with week 6's: week 1 has none of the
    // four, so each is empty, held as strictly as the rest.
    assert.deepEqual(task.needs, {
      tickIds: sources("k1"),
      promptIds: boxes("k1"),
      answerIds: [],
      chooseOneIds: [],
      talkIds: [],
      fillInIds: [],
      unseenIds: [],
    });
    assert.deepEqual(task.written, ["k1-rp1"]);
    assert.deepEqual(task.due, { dateKey: "2026-11-03", moved: false });
    assert.equal(none.type, "none");
    // Week 4, written before blocks, counts as it always has.
    const week4 = answer.body.weeks.find((week) => week.weekNumber === 4);
    assert.equal(week4.thisWeek, null);
    assert.deepEqual(week4.countableIds, ["w4r1", "w4r2"]);
    // Nobody else's boxes: Amara's overview says nothing of Chloe's.
    const amara = await w.overview("amara");
    assert.deepEqual(amara.body.weeks.find((week) => week.weekNumber === 1).thisWeek.rows[0].written, []);
    // The lead's first name, for who reads the reflections.
    assert.equal(answer.body.programme.leadFirstName, "Claudia");
  });
});

// ---------------------------------------------------------------------------
// 5. Who reaches the page
// ---------------------------------------------------------------------------

describe("5. who reaches a block week's page", () => {
  test("taking part, facilitating and admins reach it; nobody else does", async () => {
    for (const [who, role] of [["chloe", "learner"], ["amara", "learner"], ["rahul", "facilitator"], ["sofia", "facilitator"], ["zach", "admin"]]) {
      const shell = await w.weekShell(who, 1);
      assert.equal(shell.component, "WeekView", who);
      assert.equal(shell.props.viewerRole, role, who);
    }
    for (const [who, to] of [["una", "/learn"], ["sam", "/learn"], ["omar", "/learn"], ["nobody", "/learn"], [null, "/login"]]) {
      const shell = await w.weekShell(who, 1);
      assert.equal(shell.to, to, `${who} reached the page`);
    }
    // The lead is sent where the lead's work is, as before.
    const lead = await w.weekShell("claudia", 1);
    assert.equal(lead.component, null);
    assert.ok(lead.to, "the lead is sent elsewhere");
  });

  test("the page draws no words but the week's own and the page's, whoever reads it", async () => {
    const { text } = await w.weekPage("chloe", 1);
    assert.doesNotMatch(text, /\bexercise\b|homework|assignment|\bgrade\b|\bscore\b/i);
    assert.doesNotMatch(text, /[\u2013\u2014]/);
    assert.equal(textOf("<p>a &amp; b</p>"), "a & b");
  });
});
