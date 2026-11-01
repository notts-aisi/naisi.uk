/**
 * Week 6's own pieces on the member's week page (board wk-week6-phone):
 * fill-in boxes (part 3's plan) and the checklist in blocks (part 2), with
 * the counts by This week's tasks they move.
 *
 * Driven through the real routes (the fill-in boxes' writer and its one
 * reader of somebody else's boxes, my-exercises, the overview, the
 * reflection writer and reader, the review queue and a verdict), the week
 * page's real server shell and the real pages, as every kind of caller:
 * Chloe, placed in Group B and told; Farah and Kofi in the same group; Amara, in
 * Group A; Una, placed and not told; Sam, who left; Omar, taken off; Rahul,
 * who facilitates Group B, and Sofia, who facilitates Groups A and B; Grace,
 * who facilitates Group D; Claudia, the programme's lead; Tess, who leads
 * another programme; Zach, an admin; a view-as session; and somebody signed
 * out. Chloe is also made a facilitator of Chloe's own group (Zach, Mon 26
 * Oct: facilitators are fellows), to read Chloe's boxes as a co-facilitator
 * would.
 *
 *  1. The fill-in card, drawn word for word and in order.
 *  2. A fill-in box is its writer's own: stored as a fill-in box, refused
 *     to everybody else, never written over another kind of row.
 *  3. Who reads somebody's boxes (Q30 C): the group's facilitators, the
 *     programme's lead and admins; for a facilitator's own, the lead and
 *     admins alone; never another fellow.
 *  4. Every reader of answers leaves a fill-in box out.
 *  5. The counts: Draft, then Done, on the week page, the overview, the
 *     programme page and Home.
 *  6. The checklist in blocks: steps ticked as a week's checklist items are,
 *     keyed on ids a paste keeps, counted through `progress.ts`, drawn as
 *     steps.
 *
 * Every word in the week is made up; every address is on example.com or
 * example.org.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NOW6, RUN, B, SRC, checkItemIds, fillInBoxIds, makeWeekSixWorld, textOf } from "./lib/weekSixWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW6 });

const w = await makeWeekSixWorld();
const at = (iso) => mock.timers.setTime(new Date(iso).getTime());

beforeEach(() => {
  at(NOW6.toISOString());
  w.reset();
});

const FB = fillInBoxIds("k6");
const CI = checkItemIds("k6");
const rowPath = (uid, weekId, id) => `courseExerciseResponses/${RUN.agi}__${uid}__${weekId}__${id}`;

/** Each phrase appears, and in this order. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const found = text.indexOf(phrase, from);
    assert.ok(found >= 0, `missing, or out of order: "${phrase}"`);
    from = found + phrase.length;
  }
}

/** Writes something in every box of the plan, as `who`. */
async function fillAll(who) {
  for (const id of FB) {
    const answer = await w.writeFillIn(who, id, "w06", `Words for ${id}.`);
    assert.equal(answer.status, 200, `${who} ${id}: ${JSON.stringify(answer.body)}`);
  }
}

/** One part of the page's HTML, from its section to the next part's. */
function partHtml(html, n) {
  const from = html.indexOf(`id="block-k6-p${n}"`);
  const to = html.indexOf(`id="block-k6-p${n + 1}"`);
  assert.ok(from >= 0, `part ${n} is not on the page`);
  return html.slice(from, to > from ? to : undefined);
}

/** Makes Chloe a facilitator of Group B as well: a facilitator who holds a place in the group they run. */
function chloeFacilitatesB() {
  const group = w.world.db.read(`courseGroups/${B}`);
  w.world.db.poke(`courseGroups/${B}`, { facilitatorUids: [...group.facilitatorUids, "chloe"] });
}

// ---------------------------------------------------------------------------
// 1. The fill-in card, drawn
// ---------------------------------------------------------------------------

describe("1. the fill-in card, drawn (wk-week6-phone, part 3)", () => {
  test("Chloe's card, word for word and in order", async () => {
    const { text, html } = await w.weekPage("chloe", 6);
    inOrder(text, [
      "Part 3",
      "About 30 minutes",
      "Your keeper's plan",
      "Bring a draft plan to the session.",
      "My keeper's plan",
      "0 of 12 filled",
      "Saves as you type. It’s here on your phone for the session.",
      "What I'll tend",
      "(one or two sentences)",
      "Why this lamp, and why me",
      "The danger it helps with",
      "What I bring to it",
      "How it works",
      "First I…",
      "Then… will happen",
      "Which means…",
      "Assuming…",
      "(the two or three things that must hold)",
      "I'll check the shakiest part by…",
      "What I need to learn, and from whom",
      "Three things to read or do",
      "Two keepers to talk to",
      "My next three steps, with dates",
      "Check-in partner and date",
      "Rahul, Sofia, Claudia and admins can read your keeper's plan. Other fellows can’t.",
      "Part 4",
    ]);
    // Twelve boxes in the card, each a real labelled control.
    const card = partHtml(html, 3);
    assert.equal((card.match(/<textarea /g) ?? []).length, 12);
    // A heading with one box names it; a labelled box has its own label.
    // The box of a heading with one box is named by the heading's words (its hint is not part of the name).
    assert.match(card, /<h4 class="heading"><span class="number" aria-hidden="true">1<\/span><span><span id="([^"]+)">What I&#x27;ll tend<\/span><span class="hint"> \(one or two sentences\)<\/span><\/span><\/h4><div class="field"><textarea id="[^"]+" class="box" rows="3" maxLength="4000" aria-labelledby="\1"><\/textarea>/);
    assert.match(card, /<label for="([^"]+)" class="label">The danger it helps with<\/label><textarea id="\1" class="box"/);
    assert.match(card, /<label for="([^"]+)" class="label">Assuming…<span class="hint"> \(the two or three things that must hold\)<\/span><\/label><textarea id="\1"/);
    // Nothing written yet, so nothing says Saved.
    assert.doesNotMatch(card, />Saved</);
  });

  test("what Chloe wrote fills its box, and the card says Saved and how many are filled", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Mend the north lamp.");
    await w.writeFillIn("chloe", FB[2], "w06", "I can climb.");
    const { text, html } = await w.weekPage("chloe", 6);
    inOrder(text, ["My keeper's plan", "2 of 12 filled", "What I'll tend", "Mend the north lamp.", "What I bring to it", "I can climb.", "Saved", "can read your keeper's plan"]);
    assert.match(html, /<textarea id="[^"]+" class="box" rows="3" maxLength="4000" aria-labelledby="[^"]+">Mend the north lamp\.<\/textarea>/);
  });

  test("a facilitator takes part as themselves, and the line under their card names only the lead and admins", async () => {
    const { text } = await w.weekPage("rahul", 6);
    inOrder(text, ["My keeper's plan", "0 of 12 filled", "Saves as you type.", "Only Claudia and admins can read your keeper's plan."]);
    assert.ok(!text.includes("Rahul, Sofia, Claudia and admins can read your keeper's plan"));
  });

  test("a facilitator who holds a place in the group they run is told the same", async () => {
    chloeFacilitatesB();
    const { text } = await w.weekPage("chloe", 6);
    assert.match(text, /Only Claudia and admins can read your keeper's plan\./);
    assert.ok(!text.includes("Other fellows can’t. Part 4"), "a fellow's line under a facilitator's card");
  });

  test("an admin reads the headings and labels, with no box, no count and no line about readers", async () => {
    const { text, html } = await w.weekPage("zach", 6);
    inOrder(text, ["My keeper's plan", "What I'll tend", "Why this lamp, and why me", "The danger it helps with", "Check-in partner and date", "Part 4"]);
    const card = partHtml(html, 3);
    assert.equal((card.match(/<textarea /g) ?? []).length, 0);
    assert.ok(!card.includes("of 12 filled"));
    assert.ok(!card.includes("can read your"));
    assert.ok(!card.includes("Saves as you type"));
  });

  test("rows that did not load leave no box to write over: the card says so", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Stored words.");
    const shell = await w.weekShell("chloe", 6);
    await w.asBrowser("chloe", 6);
    w.ui.ownRowsLoaded = false;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const html = renderToStaticMarkup(createElement(w.components.WeekView, shell.props));
    const card = partHtml(html, 3);
    assert.equal((card.match(/<textarea /g) ?? []).length, 0);
    assert.match(textOf(card), /We couldn’t load what you wrote here\. Reload before writing, so you don’t write over it\. Try again/);
  });
});

// ---------------------------------------------------------------------------
// 2. A fill-in box is its writer's own
// ---------------------------------------------------------------------------

describe("2. a fill-in box is its writer's own", () => {
  test("Chloe's box saves as Chloe types, reads back to Chloe, and is stored as a fill-in box", async () => {
    const saved = await w.writeFillIn("chloe", FB[0], "w06", "  Mend the north lamp.  ");
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.response, {
      id: `${RUN.agi}__chloe__w06__${FB[0]}`,
      weekId: "w06",
      weekNumber: 6,
      exerciseId: FB[0],
      kind: "fillIn",
      responseType: "text",
      text: "Mend the north lamp.",
      linkUrl: null,
      submittedAt: null,
      reviewStatus: "unreviewed",
      reviewerName: null,
      reviewerComment: null,
      reviewedAt: null,
    });
    const row = w.world.db.read(rowPath("chloe", "w06", FB[0]));
    assert.equal(row.kind, "fillIn");
    assert.equal(row.uid, "chloe");
    assert.equal(row.runId, RUN.agi);
    assert.equal(row.weekId, "w06");
    assert.equal(row.weekNumber, 6);
    assert.equal(row.exerciseId, FB[0]);
    assert.equal(row.text, "Mend the north lamp.");
    assert.equal(row.submittedAt, null);
    assert.equal(row.reviewStatus, "unreviewed");
    const own = await w.ownRowsOf("chloe", 6);
    assert.equal(own.status, 200);
    const mine = own.body.responses.find((r) => r.exerciseId === FB[0]);
    assert.equal(mine.kind, "fillIn");
    assert.equal(mine.text, "Mend the north lamp.");
  });

  test("an emptied box removes the row", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Something.");
    const emptied = await w.writeFillIn("chloe", FB[0], "w06", "   ");
    assert.equal(emptied.status, 200);
    assert.equal(emptied.body.response.text, null);
    assert.equal(w.world.db.read(rowPath("chloe", "w06", FB[0])), undefined);
  });

  test("only a fill-in box of the week as the writer reads it, and a body that makes sense", async () => {
    assert.equal((await w.writeFillIn("chloe", "k6-nowhere", "w06", "x")).status, 404);
    assert.equal((await w.writeFillIn("chloe", "k6-rp1", "w06", "x")).status, 404, "a reflection prompt's id");
    assert.equal((await w.writeFillIn("chloe", "k6-pk1", "w06", "x")).status, 404, "a pack's id");
    assert.equal((await w.writeFillIn("chloe", "k6-ci1", "w06", "x")).status, 404, "a checklist step's id");
    assert.equal((await w.writeFillIn("chloe", FB[0], "w01", "x")).status, 404, "a box of another week");
    assert.equal((await w.writeFillIn("chloe", "x4", "w04", "x")).status, 404, "a week written before blocks");
    assert.equal((await w.writeFillIn("chloe", "fb-1", "w06", "x")).status, 404, "week 2's box, named as week 6's");
    assert.equal((await w.writeFillIn("chloe", FB[0], "6", "x")).status, 400);
    assert.equal((await w.writeFillIn("chloe", FB[0], "w61", "x")).status, 400);
    assert.equal((await w.writeFillIn("chloe", FB[0], "w06", "x".repeat(4001))).status, 400);
    assert.equal((await w.writeFillIn("chloe", FB[0], "w06", 42)).status, 400);
    assert.equal((await w.writeFillIn("chloe", "a/b", "w06", "x")).status, 404);
    // None of those wrote anything.
    assert.equal(w.world.db.paths().filter((path) => path.startsWith("courseExerciseResponses/")).length, 0);
  });

  test("who may write: somebody taking part or facilitating, each in their own box, and nobody on anybody's behalf", async () => {
    // Thursday noon: Group A meets at 6pm, so week 6 takes work for everybody here (the week you submit).
    at("2026-12-03T12:00:00Z");
    for (const who of ["chloe", "farah", "kofi", "amara"]) {
      assert.equal((await w.writeFillIn(who, FB[0], "w06", `${who}'s words.`)).status, 200, who);
      assert.equal(w.world.db.read(rowPath(who, "w06", FB[0])).text, `${who}'s words.`);
    }
    // Facilitators take part as themselves (Zach, Mon 26 Oct).
    for (const who of ["rahul", "sofia"]) {
      assert.equal((await w.writeFillIn(who, FB[0], "w06", `${who}'s words.`)).status, 200, who);
      assert.equal(w.world.db.read(rowPath(who, "w06", FB[0])).uid, who);
    }
    const before = w.everything();
    for (const who of ["una", "sam", "omar", "claudia", "tess", "zach", "lloyd", "yusuf"]) {
      assert.equal((await w.writeFillIn(who, FB[1], "w06", "Not mine to write.")).status, 403, who);
    }
    assert.equal((await w.writeFillIn(null, FB[1], "w06", "Nobody.")).status, 401);
    // A view-as session is refused before anything else, whoever is viewed.
    assert.equal((await w.writeFillIn("chloe", FB[1], "w06", "As Chloe.", { viewAs: true })).status, 403);
    assert.equal(w.everything(), before, "a refused write wrote something");
  });

  test("a box the route refuses says the route's own sentence under it, through the page's own write; only no answer names the connection", async () => {
    const { putFillIn } = await w.loadTs(join("features", "courses", "weekBlocks", "boxWrites.ts"));
    const { REFLECTION_NOT_SAVED } = await w.loadTs(join("lib", "courses", "memberPageWords.ts"));
    /** `fetch` as the page makes it, answered by the real fill-in route, as `who`. */
    const answeredAs = (who) => async (url, init = {}) => {
      const at = /^\/api\/courses\/runs\/([^/]+)\/fill-in-boxes\/([^/]+)$/.exec(new URL(String(url), "https://naisi.invalid").pathname);
      assert.ok(at, `the page fetched ${url}, which nothing here answers`);
      const answer = await w.call(who, w.routes.fillInWrite.PUT, { runId: decodeURIComponent(at[1]), boxId: decodeURIComponent(at[2]) }, {
        course: true,
        body: JSON.parse(init.body),
      });
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "Content-Type": "application/json" } });
    };
    const write = async (impl, text) => {
      const stub = mock.method(globalThis, "fetch", impl);
      try {
        return await putFillIn({ runId: RUN.agi, boxId: FB[0], weekId: "w06", text, keepalive: false });
      } finally {
        stub.mock.restore();
      }
    };
    assert.equal((await write(answeredAs("chloe"), "Before the end.")).text, "Before the end.");
    // Chloe's place finished with the page still open.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "completed" });
    await assert.rejects(write(answeredAs("chloe"), "After the end."), (err) => {
      assert.equal(err.message, "Only somebody taking part in this programme can write in its boxes.");
      return true;
    });
    // A box no longer on the week says so in the route's words too.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "active" });
    await assert.rejects(
      (async () => {
        const stub = mock.method(globalThis, "fetch", answeredAs("chloe"));
        try {
          return await putFillIn({ runId: RUN.agi, boxId: "k6-nowhere", weekId: "w06", text: "x", keepalive: false });
        } finally {
          stub.mock.restore();
        }
      })(),
      (err) => {
        assert.equal(err.message, "That box isn’t on this week any more. Reload the page.");
        return true;
      },
    );
    // No answer at all, or an answer with nothing to say: the connection, never the browser's own words.
    for (const impl of [
      async () => {
        throw new TypeError("Failed to fetch");
      },
      async () => new Response("Bad gateway", { status: 502 }),
    ]) {
      await assert.rejects(write(impl, "Again."), (err) => {
        assert.equal(err.message, REFLECTION_NOT_SAVED);
        return true;
      });
    }
    assert.equal(w.world.db.read(rowPath("chloe", "w06", FB[0])).text, "Before the end.");
  });

  test("a finished place reads its boxes back and writes no more", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Before the end.");
    w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "completed" });
    assert.equal((await w.writeFillIn("chloe", FB[0], "w06", "After the end.")).status, 403);
    assert.equal(w.world.db.read(rowPath("chloe", "w06", FB[0])).text, "Before the end.");
    const own = await w.ownRowsOf("chloe", 6);
    assert.equal(own.status, 200);
    assert.equal(own.body.responses.find((r) => r.exerciseId === FB[0]).text, "Before the end.");
    // And the group's facilitators still read a finished fellow's boxes.
    assert.equal((await w.readFillIns("rahul", "chloe", 6)).status, 200);
  });

  test("the answer's writer never writes over a fill-in box, whatever its id says", async () => {
    // A row no route writes: a fill-in box under the id of week 4's exercise.
    w.world.db.seed(rowPath("chloe", "w04", "x4"), { runId: RUN.agi, uid: "chloe", weekId: "w04", weekNumber: 4, exerciseId: "x4", kind: "fillIn", responseType: "text", text: "A box.", reviewStatus: "unreviewed", submittedAt: null });
    const submit = await w.call("chloe", w.routes.submit.POST, { runId: RUN.agi, exerciseId: "x4" }, { course: true, body: { weekId: "w04", text: "An answer." } });
    assert.equal(submit.status, 409, JSON.stringify(submit.body));
    assert.equal(w.world.db.read(rowPath("chloe", "w04", "x4")).text, "A box.");
  });

  test("a reflection box and a fill-in box never write over each other, or over an answer", async () => {
    assert.equal((await w.writeBox("chloe", FB[0], "w06", "x")).status, 404, "the reflection writer refuses a fill-in box's id");
    assert.equal((await w.writeFillIn("chloe", "k6-rp1", "w06", "x")).status, 404, "the fill-in writer refuses a prompt's id");
    // A row of another kind already stored under a box's id is never written over.
    w.world.db.seed(rowPath("chloe", "w06", FB[3]), { runId: RUN.agi, uid: "chloe", weekId: "w06", weekNumber: 6, exerciseId: FB[3], kind: "reflection", responseType: "text", text: "A reflection.", reviewStatus: "unreviewed", submittedAt: null });
    w.world.db.seed(rowPath("chloe", "w06", FB[4]), { runId: RUN.agi, uid: "chloe", weekId: "w06", weekNumber: 6, exerciseId: FB[4], responseType: "text", text: "An answer.", reviewStatus: "unreviewed", submittedAt: null });
    assert.equal((await w.writeFillIn("chloe", FB[3], "w06", "Over it.")).status, 409);
    assert.equal((await w.writeFillIn("chloe", FB[4], "w06", "Over it.")).status, 409);
    assert.equal((await w.writeFillIn("chloe", FB[4], "w06", "")).status, 409, "nor emptied away");
    assert.equal(w.world.db.read(rowPath("chloe", "w06", FB[3])).text, "A reflection.");
    assert.equal(w.world.db.read(rowPath("chloe", "w06", FB[4])).text, "An answer.");
  });
});

// ---------------------------------------------------------------------------
// 3. Who reads somebody's boxes
// ---------------------------------------------------------------------------

describe("3. who reads somebody's boxes (Q30 C)", () => {
  test("a fellow's: the group's facilitators, the programme's lead and admins; nobody else", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Mend the north lamp.");
    await w.writeBox("chloe", "k6-rp1", "w06", "A reflection, not a box.");
    for (const who of ["rahul", "sofia", "claudia", "zach"]) {
      const read = await w.readFillIns(who, "chloe", 6);
      assert.equal(read.status, 200, who);
      assert.deepEqual(Object.keys(read.body), ["boxes"]);
      assert.equal(read.body.boxes.length, 1, `${who}: fill-in boxes only, never a reflection`);
      const [box] = read.body.boxes;
      assert.deepEqual(Object.keys(box).sort(), ["boxId", "text", "updatedAt", "weekId"]);
      assert.equal(box.boxId, FB[0]);
      assert.equal(box.weekId, "w06");
      assert.equal(box.text, "Mend the north lamp.");
    }
    for (const who of ["farah", "kofi", "amara", "una", "sam", "omar", "grace", "tess", "lloyd", "yusuf", "chloe"]) {
      const read = await w.readFillIns(who, "chloe", 6);
      assert.equal(read.status, 403, who);
      assert.deepEqual(read.body, { error: "Forbidden" }, `${who}: the refusal says nothing of the boxes`);
    }
    assert.equal((await w.readFillIns(null, "chloe", 6)).status, 401);
  });

  test("the same refusal whether or not anything was written, and a query that makes sense", async () => {
    const blank = await w.readFillIns("farah", "kofi", 6);
    await w.writeFillIn("kofi", FB[0], "w06", "Kofi's plan.");
    const written = await w.readFillIns("farah", "kofi", 6);
    assert.deepEqual(blank, written);
    assert.equal((await w.readFillIns("rahul", undefined, 6)).status, 400);
    assert.equal((await w.readFillIns("rahul", "kofi", undefined)).status, 400);
    assert.equal((await w.readFillIns("rahul", "kofi", 0)).status, 400);
    assert.equal((await w.readFillIns("rahul", "kofi", 61)).status, 400);
    assert.equal((await w.readFillIns("rahul", "a/b", 6)).status, 400);
    const read = await w.readFillIns("rahul", "kofi", 6);
    assert.equal(read.status, 200);
    assert.deepEqual(read.body.boxes.map((box) => box.text), ["Kofi's plan."]);
  });

  test("a facilitator's own: the lead and admins; never a co-facilitator", async () => {
    await w.writeFillIn("rahul", FB[0], "w06", "Rahul's plan.");
    for (const who of ["claudia", "zach"]) assert.equal((await w.readFillIns(who, "rahul", 6)).status, 200, who);
    for (const who of ["sofia", "chloe", "grace", "tess"]) assert.equal((await w.readFillIns(who, "rahul", 6)).status, 403, who);
  });

  test("a facilitator who holds a place (Zach, Mon 26 Oct): their boxes are the lead's and admins', never their co-facilitators'", async () => {
    chloeFacilitatesB();
    assert.equal((await w.writeFillIn("chloe", FB[0], "w06", "Chloe runs the group too.")).status, 200);
    for (const who of ["rahul", "sofia", "farah"]) assert.equal((await w.readFillIns(who, "chloe", 6)).status, 403, who);
    for (const who of ["claudia", "zach"]) assert.equal((await w.readFillIns(who, "chloe", 6)).status, 200, who);
    // And Chloe, a facilitator of Group B, reads the group's fellows' boxes.
    await w.writeFillIn("farah", FB[0], "w06", "Farah's plan.");
    assert.equal((await w.readFillIns("chloe", "farah", 6)).status, 200);
  });

  test("view-as reads as the person viewed: viewing as Farah is refused Chloe's boxes", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Mend the north lamp.");
    w.world.viewAs = true;
    try {
      assert.equal((await w.readFillIns("farah", "chloe", 6)).status, 403);
    } finally {
      w.world.viewAs = false;
    }
  });

  test("somebody who left: the lead and admins still read their boxes, their group's facilitators no longer, and they read nothing back", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Before I left.");
    w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "withdrawn", allocatedEmailAt: null });
    assert.equal((await w.readFillIns("rahul", "chloe", 6)).status, 403);
    assert.equal((await w.readFillIns("claudia", "chloe", 6)).status, 200);
    assert.equal((await w.readFillIns("zach", "chloe", 6)).status, 200);
    assert.equal((await w.ownRowsOf("chloe", 6)).status, 403);
    assert.equal((await w.writeFillIn("chloe", FB[0], "w06", "After.")).status, 403);
  });

  test("a seat Publish has not told is nobody's to read but the lead's and admins', and nor is a place that has ended, whatever its stamp says", async () => {
    // Rows no route writes today (Una cannot write before Publish tells Una
    // the group; leaving clears the told stamp): the gate holds without them.
    w.world.db.seed(rowPath("una", "w06", FB[0]), { runId: RUN.agi, uid: "una", weekId: "w06", weekNumber: 6, exerciseId: FB[0], kind: "fillIn", responseType: "text", text: "Before Publish.", reviewStatus: "unreviewed", submittedAt: null });
    assert.equal((await w.readFillIns("tom", "una", 6)).status, 403, "Group C's facilitator, before Publish told Una");
    for (const who of ["claudia", "zach"]) assert.equal((await w.readFillIns(who, "una", 6)).status, 200, who);
    await w.writeFillIn("chloe", FB[0], "w06", "Mend the north lamp.");
    w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "withdrawn" });
    assert.equal((await w.readFillIns("rahul", "chloe", 6)).status, 403, "a place that has ended, its told stamp kept");
    assert.equal((await w.readFillIns("claudia", "chloe", 6)).status, 200);
  });

  test("an archived group staffs nobody: its facilitators read none of its people's boxes", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Mend the north lamp.");
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await w.readFillIns("rahul", "chloe", 6)).status, 403);
  });
});

// ---------------------------------------------------------------------------
// 4. Every reader of answers leaves a fill-in box out
// ---------------------------------------------------------------------------

describe("4. every reader of answers leaves a fill-in box out", () => {
  test("never reviewed, queued, or read as a reflection", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "Not for review.");
    const id = `${RUN.agi}__chloe__w06__${FB[0]}`;
    const verdict = (who) =>
      w.call(who, w.routes.review.POST, { responseId: id }, { course: true, body: { reviewStatus: "approved", reviewerComment: "Good." } });
    assert.equal((await verdict("rahul")).status, 403, "a facilitator of Chloe's group");
    assert.equal((await verdict("zach")).status, 404, "an admin is told there is no such answer");
    const row = w.world.db.read(rowPath("chloe", "w06", FB[0]));
    assert.equal(row.reviewStatus, "unreviewed");
    assert.equal(row.reviewerComment, undefined);

    w.world.user = w.sessionOf("rahul");
    w.world.course = true;
    const queue = await w.routes.queue.GET(new Request("https://naisi.invalid/api?week=6"), { params: Promise.resolve({ groupId: B }) });
    w.world.course = false;
    assert.equal(queue.status, 200);
    const all = queue.body.rows.flatMap((person) => person.responses);
    assert.ok(!all.some((response) => response.exerciseId === FB[0] || response.text === "Not for review."));

    const reflections = await w.readReflections("claudia", "chloe", 6);
    assert.equal(reflections.status, 200);
    assert.deepEqual(reflections.body.reflections, [], "a fill-in box read as a reflection");
  });

  test("a fill-in box is never counted as an answer sent, even one somebody stamped as sent", async () => {
    // A row no route writes: a fill-in box carrying a sent time, under the id
    // of week 2's written answer. Only the kind tells it from an answer.
    const stamped = new Date("2026-11-09T20:00:00Z");
    w.world.db.seed(rowPath("chloe", "w02", "wa-1"), { runId: RUN.agi, uid: "chloe", weekId: "w02", weekNumber: 2, exerciseId: "wa-1", kind: "fillIn", responseType: "text", text: "Stamped.", reviewStatus: "unreviewed", submittedAt: stamped });
    const records = await w.lib.attendance.readRunRecords(w.world.courseDb, RUN.agi);
    const tallies = await w.lib.finishing.readExerciseTallies(w.world.courseDb, records);
    assert.equal(tallies.get("chloe").done, 0);
    // Nor on the group page's To review card.
    const run = w.lib.courses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
    const group = w.lib.groups.normalizeCourseGroup(B, w.world.db.read(`courseGroups/${B}`));
    const model = await w.lib.facilitatorGroup.loadFacilitatorGroup(w.world.courseDb, run, group, { isAdmin: false }, new Date());
    assert.ok(!model.toReview.some((row) => row.uid === "chloe"), JSON.stringify(model.toReview));
  });
});

// ---------------------------------------------------------------------------
// 5. The counts
// ---------------------------------------------------------------------------

describe("5. counts by This week's tasks", () => {
  const TASK3 = "Part 3: draft your keeper's plan About 30 minutes Bring it to your session, Tue 8 Dec";

  test("part 3: a draft until every box holds something, then done", async () => {
    let page = await w.weekPage("chloe", 6);
    assert.match(page.text, new RegExp(`Not done yet: ${TASK3} Not done yet: Part 4`));
    assert.match(page.text, /Part 3 · About 30 minutes Your keeper's plan/);

    await w.writeFillIn("chloe", FB[0], "w06", "One.");
    page = await w.weekPage("chloe", 6);
    assert.match(page.text, new RegExp(`Not done yet: ${TASK3} Draft · 1 of 12 filled`));
    assert.match(page.text, /Part 3 · About 30 minutes Draft Your keeper's plan/);
    assert.match(page.text, /This week 0 of 4 done/);

    await fillAll("chloe");
    page = await w.weekPage("chloe", 6);
    assert.match(page.text, new RegExp(`Done: ${TASK3} Done`));
    assert.match(page.text, /Part 3 · About 30 minutes Done Your keeper's plan/);
    assert.match(page.text, /This week 1 of 4 done/);
    assert.match(page.text, /12 of 12 filled/);

    // Emptying one box makes it a draft again.
    await w.writeFillIn("chloe", FB[11], "w06", "");
    page = await w.weekPage("chloe", 6);
    assert.match(page.text, new RegExp(`Not done yet: ${TASK3} Draft · 11 of 12 filled`));
    assert.match(page.text, /This week 0 of 4 done/);
  });

  test("On this page marks part 3 a draft beside its title", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "One.");
    const { html } = await w.weekPage("chloe", 6);
    const rail = html.slice(html.indexOf('aria-label="On this page"'));
    assert.match(rail, /<span class="railLabel">Your keeper&#x27;s plan<span class="srOnly">, Not done yet<\/span><\/span><span class="railCount">Draft<\/span>/);
  });

  test("the overview hands part 3's task its boxes, and which of them are written", async () => {
    await w.writeFillIn("chloe", FB[0], "w06", "One.");
    await w.writeFillIn("chloe", FB[5], "w06", "Six.");
    const answer = await w.overview("chloe");
    assert.equal(answer.status, 200);
    const week6 = answer.body.weeks.find((week) => week.weekNumber === 6);
    const task3 = week6.thisWeek.rows[2];
    assert.equal(task3.label, "Part 3");
    // The needs also name the written answers, Choose ones and talks a task
    // covers; part 3 covers none of them, so each is empty.
    assert.deepEqual(task3.needs, { tickIds: [], promptIds: [], answerIds: [], chooseOneIds: [], talkIds: [], fillInIds: FB, unseenIds: [] });
    assert.deepEqual(task3.written, [FB[0], FB[5]]);
    assert.equal(week6.thisWeek.answersReadBy, "facilitators");
    // A facilitator's own work is the lead's and admins': the page's line follows this.
    assert.equal((await w.overview("rahul")).body.weeks.find((week) => week.weekNumber === 6).thisWeek.answersReadBy, "lead");
    chloeFacilitatesB();
    assert.equal((await w.overview("chloe")).body.weeks.find((week) => week.weekNumber === 6).thisWeek.answersReadBy, "lead");
    // Nobody else's boxes: Farah's overview says nothing of Chloe's.
    assert.deepEqual((await w.overview("farah")).body.weeks.find((week) => week.weekNumber === 6).thisWeek.rows[2].written, []);
  });

  test("the programme page and Home count part 3's task by the same boxes", async () => {
    let home = await w.programmeHome("chloe");
    assert.match(home.text, /This week 0 of 4 done Week 6 · Your next lamp Thu 3 to Wed 9 Dec Not done yet: Part 1 Not done yet: Part 2 Not done yet: Part 3 /);
    assert.match(home.text, /Week 6 Your next lamp Tue 8 Dec 0 of 4/);
    await fillAll("chloe");
    home = await w.programmeHome("chloe");
    assert.match(home.text, /This week 1 of 4 done Week 6 · Your next lamp Thu 3 to Wed 9 Dec Not done yet: Part 1 Not done yet: Part 2 Done: Part 3 Done /);
    assert.match(home.text, /Week 6 Your next lamp Tue 8 Dec 1 of 4/);
    const card = await w.homeCard("chloe");
    assert.ok(card);
    assert.match(card.text, /1 of 4 done/);
  });
});

// ---------------------------------------------------------------------------
// 6. The checklist in blocks
// ---------------------------------------------------------------------------

describe("6. the checklist in blocks (part 2)", () => {
  const TASK2 = "Part 2: go deep on one lighthouse About 30 minutes Before your session, Tue 8 Dec";

  test("three steps to tick, each a real checkbox, for somebody taking part", async () => {
    const { text, html } = await w.weekPage("chloe", 6);
    inOrder(text, ["Part 2", "Go deep on one lighthouse", "Spend half an hour finding out what tending it involves.", "Find two keepers doing it now.", "Find one way in that is open to you this year.", "Note the biggest thing you still don't know.", "Part 3"]);
    const part2 = partHtml(html, 2);
    assert.equal((part2.match(/type="checkbox"/g) ?? []).length, 3);
    assert.match(part2, /aria-label="Done: Find two keepers doing it now\."/);
    // Drawn as steps (wk-week6-phone): the words in the body's weight, the same ticked or not.
    assert.equal((part2.match(/<li class="tickRow stepRow">/g) ?? []).length, 3);
    assert.match(part2, /<p class="stepTitle">Find two keepers doing it now\.<\/p>/);
    const ticked = partHtml((await w.weekPage("chloe", 6, CI)).html, 2);
    assert.match(ticked, /<p class="stepTitle">Find two keepers doing it now\.<\/p>/, "a ticked step is greyed out");
  });

  test("ticked by their own ids: part 2 and its task are done only when all three are", async () => {
    let page = await w.weekPage("chloe", 6, CI.slice(0, 2));
    assert.match(page.text, new RegExp(`Not done yet: ${TASK2}`));
    assert.doesNotMatch(page.text, /Part 2 · About 30 minutes Done/);
    page = await w.weekPage("chloe", 6, ["k6-ci9", ...CI.slice(1)]);
    assert.doesNotMatch(page.text, /Part 2 · About 30 minutes Done/, "a tick on another id counts for nothing");
    page = await w.weekPage("chloe", 6, CI);
    assert.match(page.text, new RegExp(`Done: ${TASK2} Done`));
    assert.match(page.text, /Part 2 · About 30 minutes Done Go deep on one lighthouse/);
    assert.match(page.text, /This week 1 of 4 done/);
    // The overview names the three steps as what the task needs ticked.
    const task2 = (await w.overview("chloe")).body.weeks.find((week) => week.weekNumber === 6).thisWeek.rows[1];
    assert.deepEqual(task2.needs, { tickIds: CI, promptIds: [], answerIds: [], chooseOneIds: [], talkIds: [], fillInIds: [], unseenIds: [] });
    // And the programme page counts it from the same ticks.
    const home = await w.programmeHome("chloe", CI);
    assert.match(home.text, /This week 1 of 4 done Week 6 · Your next lamp Thu 3 to Wed 9 Dec Not done yet: Part 1 Done: Part 2 Done Not done yet: Part 3 /);
    assert.match(home.text, /Week 6 Your next lamp Tue 8 Dec 1 of 4/);
  });

  test("a tick on a step is a week's checklist item's tick: the same row, the same kind", async () => {
    // The page hands each step to the tick rows as a checklist item.
    const view = readFileSync(join(SRC, "features", "courses", "weekBlocks", "BlockWeek.tsx"), "utf8");
    const checklist = view.slice(view.indexOf("function Checklist("), view.indexOf("// Go further"));
    assert.match(checklist, /kind: "checklist"/);
    assert.match(checklist, /id: item\.id/);
    // And the one write a tick makes, for a step as for any checklist item: the tick route, which finds
    // the step on the week and writes the person's own row as a checklist item's.
    const tickRoute = await w.courseRoute("runs", "[runId]", "ticks", "[itemId]");
    const ticked = await w.call("chloe", tickRoute.PUT, { runId: RUN.agi, itemId: CI[0] }, { course: true, body: { weekId: "w06", completed: true } });
    assert.equal(ticked.status, 200, JSON.stringify(ticked.body));
    const write = w.world.db.read(`courseProgress/${RUN.agi}__chloe__${CI[0]}`);
    assert.equal(write.itemKind, "checklist");
    assert.equal(write.itemId, CI[0]);
    assert.equal(write.weekNumber, 6);
    assert.equal(write.completed, true);
  });

  test("the steps keep their ids when the week is copied out and pasted back", async () => {
    const stored = w.storedWeekSix();
    const markdown = w.lib.markdownWrite.weekToMarkdown({ weekNumber: 6, title: stored.title, blocks: stored.blocks });
    const again = w.lib.paste.readPastedWeek({ markdown, weekNumber: 6, stored: stored.blocks, dayBeforeTime: null });
    assert.deepEqual(again.problems, []);
    assert.equal(again.minted, 0);
    const steps = again.blocks.flatMap((block) => (block.type === "part" ? block.blocks : [])).filter((block) => block.type === "checklist");
    assert.deepEqual(steps.flatMap((block) => block.items.map((item) => item.id)), CI);
    const boxes = again.blocks.flatMap((block) => (block.type === "part" ? block.blocks : [])).filter((block) => block.type === "fillIn");
    assert.deepEqual(boxes.flatMap((block) => block.groups.flatMap((group) => group.boxes.map((box) => box.id))), FB);
  });

  test("an admin reads the steps with no boxes to tick", async () => {
    const { html } = await w.weekPage("zach", 6);
    const part2 = partHtml(html, 2);
    assert.match(part2, /Find two keepers doing it now\./);
    assert.equal((part2.match(/type="checkbox"/g) ?? []).length, 0);
  });
});
