/**
 * PAIRS FOR A SESSION IN PAIRS (Technical AI Safety's hands-on night: "Session
 * 5 is hands-on, in pairs, with laptops"; built for any week whose In the
 * session block says people are paired), driven through the real route and
 * pages as every kind of caller:
 *
 *  1. the record, which weeks ask for pairs, and the pairs as one view;
 *  2. typing them: the route, who may, what it refuses, and the laptop
 *     check that never refuses;
 *  3. the pairs page and the group page's card;
 *  4. Before you come on the week page: who the reader is paired with and
 *     whether to bring a laptop, and nothing of anybody else's pair;
 *  5. what takes them away;
 *  6. every file that addresses the record, and why it may.
 *
 * The world is `tests/lib/pairsWorld.mjs`: AGI Strategy in week 3, Group B
 * (Chloe, Farah, Kofi; Rahul, Sofia and Farah facilitating) meeting tonight
 * at 6pm, week 3 asking for pairs with laptops and week 2 for pairs alone.
 * Every word in the weeks is made up.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { walkSource } from "./lib/functionScan.mjs";
import { A, B, C, NOW, PAIRS_ONLY, PAIRS_WITH_LAPTOPS, RUN, W2_SESSION, W3_SESSION, makePairsWorld, textOf } from "./lib/pairsWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

const w = await makePairsWorld();

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());
beforeEach(() => w.reset());

/** Each phrase, in this order, somewhere in `text`. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const at = text.indexOf(phrase, from);
    assert.ok(at >= 0, `missing, or out of order: "${phrase}"`);
    from = at + phrase.length;
  }
}

/** The first element in a server page's tree whose props carry `prop`, or null. */
function elementWith(node, prop) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = elementWith(child, prop);
      if (found) return found;
    }
    return null;
  }
  if (node.props && prop in node.props) return node;
  return elementWith(node.props?.children, prop);
}

/** Group B's people in the pairs, as the pages list them: in name order. */
const GROUP_B = ["chloe", "farah", "kofi", "rahul", "sofia"];

// ---------------------------------------------------------------------------
// 1. The record, the weeks that ask, and the view
// ---------------------------------------------------------------------------

describe("1. the record, which weeks ask for pairs, and the pairs as one view", () => {
  test("its id is built from the run, the group, the person and the block, and it reads back only what it can place", () => {
    const { COURSE_PAIRS_COLLECTION, MAX_PAIR_NUMBER, normalizeCoursePair, pairRecordId } = w.lib.pairRecord;
    assert.equal(COURSE_PAIRS_COLLECTION, "coursePairs");
    assert.equal(pairRecordId("run-1", "grp-1", "amara", "is-1"), "run-1__grp-1__amara__is-1");
    const record = normalizeCoursePair("x", { runId: "run-1", groupId: "grp-1", uid: "amara", blockId: "is-1", weekId: "w05", weekNumber: 5, pair: 2, laptop: true });
    assert.deepEqual(
      { pair: record.pair, laptop: record.laptop, weekId: record.weekId, weekNumber: record.weekNumber },
      { pair: 2, laptop: true, weekId: "w05", weekNumber: 5 },
    );
    // A row nobody can place is read as nothing.
    for (const broken of [
      { groupId: "grp-1", uid: "amara", blockId: "is-1", pair: 1 },
      { runId: "run-1", uid: "amara", blockId: "is-1", pair: 1 },
      { runId: "run-1", groupId: "grp-1", blockId: "is-1", pair: 1 },
      { runId: "run-1", groupId: "grp-1", uid: "amara", pair: 1 },
    ]) {
      assert.equal(normalizeCoursePair("z", broken), null, JSON.stringify(broken));
    }
    // A pair is a whole number from 1 to the cap; anything else is no pair. Only a stored true is a laptop.
    const base = { runId: "r", groupId: "g", uid: "u", blockId: "b" };
    for (const pair of [0, -1, 1.5, MAX_PAIR_NUMBER + 1, "1", null, undefined]) {
      assert.equal(normalizeCoursePair("p", { ...base, pair }).pair, null, String(pair));
    }
    assert.equal(normalizeCoursePair("p", { ...base, pair: MAX_PAIR_NUMBER }).pair, MAX_PAIR_NUMBER);
    assert.equal(normalizeCoursePair("p", { ...base, laptop: "yes" }).laptop, false);
  });

  test("a week asks for pairs when Before you come says people are paired, and about laptops when it names one", () => {
    const { pairsAskOf } = w.lib.pairsModel;
    const session = (beforeYouCome, body = []) => [{ id: "is-9", type: "inTheSession", body, beforeYouCome }];
    assert.deepEqual(pairsAskOf(session(PAIRS_WITH_LAPTOPS)), { blockId: "is-9", laptops: true });
    assert.deepEqual(pairsAskOf(session(PAIRS_ONLY)), { blockId: "is-9", laptops: false });
    const p = (text) => [{ type: "p", runs: [{ text }] }];
    for (const words of ["Your facilitator has paired you.", "Pair up with the person next to you.", "We work in pairs.", "Pairing starts at six."]) {
      assert.ok(pairsAskOf(session(p(words))), words);
    }
    // Words that only look like it, the session's own body, and a week with no session ask for nothing.
    for (const words of ["Bring a laptop.", "Repair your notes.", "A pairwise comparison.", "Bring your number on a slip of paper."]) {
      assert.equal(pairsAskOf(session(p(words))), null, words);
    }
    assert.equal(pairsAskOf(session([], p("You’ll compare forecasts in pairs."))), null);
    assert.equal(pairsAskOf([]), null);
    // The world's weeks: week 3 asks with laptops, week 2 without, week 1 not at all.
    const weekOf = (id) => w.world.db.read(`courseRuns/${RUN.agi}/weeks/${id}`).blocks;
    assert.deepEqual(pairsAskOf(weekOf("w03")), { blockId: W3_SESSION, laptops: true });
    assert.deepEqual(pairsAskOf(weekOf("w02")), { blockId: W2_SESSION, laptops: false });
    assert.equal(pairsAskOf(weekOf("w01")), null);
    // No week number decides it anywhere in the pairs' code.
    for (const file of ["lib/courses/pairs/model.ts", "lib/courses/pairs/readers.ts", "app/api/courses/groups/[groupId]/pairs/route.ts"]) {
      const source = readFileSync(join(SRC, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      assert.doesNotMatch(source, /\bweek(?:Number)?\s*[!=]==?\s*\d|\bweekId\s*[!=]==?\s*["'`]w\d/, `${file} names a week`);
    }
  });

  test("the view: each pair by number, who is not paired, a pair of one or of four, and the laptop check", () => {
    const { pairsView, pairOf, sizeProblemIn, pairNumbersFor } = w.lib.pairsModel;
    const people = ["a", "b", "c", "d", "e", "f", "g"].map((uid) => ({ uid }));
    const entries = { a: { pair: 1, laptop: true }, b: { pair: 1, laptop: false }, c: { pair: 2, laptop: false }, d: { pair: 2, laptop: false }, e: { pair: 2, laptop: false }, f: { pair: 3, laptop: true } };
    const view = pairsView(people, (uid) => entries[uid], true);
    assert.deepEqual(view.pairs.map((pair) => [pair.number, pair.people.map((x) => x.uid), pair.laptops.map((x) => x.uid)]), [
      [1, ["a", "b"], ["a"]],
      [2, ["c", "d", "e"], []],
      [3, ["f"], ["f"]],
    ]);
    assert.deepEqual(view.notPaired.map((x) => x.uid), ["g"]);
    assert.deepEqual(view.alone, [3]);
    assert.deepEqual(view.tooMany, []);
    assert.deepEqual(view.noLaptop, [2], "a pair with nobody bringing a laptop is the check");
    assert.deepEqual(pairOf(view, "d").number, 2);
    assert.equal(pairOf(view, "g"), null);
    // A week that asks nothing about laptops has no check and nobody bringing one.
    const noLaptops = pairsView(people, (uid) => entries[uid], false);
    assert.deepEqual(noLaptops.noLaptop, []);
    assert.deepEqual(noLaptops.pairs[0].laptops, []);
    // Four in a pair is too many; a save checks only the pairs it touches.
    const four = pairsView(people, (uid) => (["a", "b", "c", "d"].includes(uid) ? { pair: 1, laptop: false } : { pair: 2, laptop: false }), true);
    assert.deepEqual(four.tooMany, [1]);
    assert.equal(sizeProblemIn(four, [1]).kind, "tooMany");
    assert.equal(sizeProblemIn(view, [3]).kind, "alone");
    assert.equal(sizeProblemIn(view, [1, 2]), null, "a pair the save does not touch does not stop it");
    // Somebody outside the list is in no pair, whatever is stored for them.
    assert.deepEqual(pairsView([{ uid: "a" }], (uid) => ({ pair: 1, laptop: false, uid }), true).alone, [1]);
    // The numbers a form offers: one for every two people, and any in use.
    assert.deepEqual(pairNumbersFor(5, []), [1, 2]);
    assert.deepEqual(pairNumbersFor(1, []), [1]);
    assert.deepEqual(pairNumbersFor(4, [7, 2]), [1, 2, 7]);
  });

  test("the words", () => {
    const words = w.lib.pairsWords;
    assert.equal(words.pairsHeadingWords(5, true), "Week 5 · Pairs and laptops");
    assert.equal(words.pairsHeadingWords(2, false), "Week 2 · Pairs");
    assert.equal(words.pairLaptopsWords([]), "No laptop yet");
    assert.equal(words.pairLaptopsWords(["Kofi"]), "Laptop: Kofi");
    assert.equal(words.pairLaptopsWords(["Kofi", "Chloe"]), "Laptops: Kofi and Chloe");
    assert.equal(words.noLaptopWords([2]), "Pair 2 has no laptop yet.");
    assert.equal(words.noLaptopWords([2, 3, 5]), "Pairs 2, 3 and 5 have no laptop yet.");
    assert.equal(words.aloneWords(2, "Amara"), "Pair 2 has only Amara in it.");
    assert.equal(words.tooManyWords(1, 4), "Pair 1 has 4 people in it.");
    assert.equal(words.notPairedWords(["Rahul", "Sofia"]), "Not paired yet: Rahul and Sofia");
    assert.equal(words.changePairsWords(false, true), "Pair people up");
    assert.equal(words.changePairsWords(true, true), "Change pairs and laptops");
    assert.equal(words.changePairsWords(true, false), "Change pairs");
    assert.equal(words.pairedWithWords(["Kofi"]), "You’re paired with Kofi.");
    assert.equal(words.pairedWithWords(["Rahul", "Sofia"]), "You’re paired with Rahul and Sofia.");
    assert.equal(words.ownLaptopWords(true, [], []), "You’re bringing a laptop.");
    assert.equal(words.ownLaptopWords(true, ["Kofi"], []), "You and Kofi are bringing laptops.");
    assert.equal(words.ownLaptopWords(false, ["Kofi"], []), "Kofi is bringing a laptop.");
    assert.equal(words.ownLaptopWords(false, ["Kofi", "Sam"], []), "Kofi and Sam are bringing laptops.");
    assert.equal(
      words.ownLaptopWords(false, [], ["Rahul", "Sofia"]),
      "Nobody in your pair is bringing a laptop yet. If you can bring one, tell Rahul or Sofia.",
    );
    assert.equal(words.ownLaptopWords(false, [], []), "Nobody in your pair is bringing a laptop yet.");
  });
});

// ---------------------------------------------------------------------------
// 2. Typing the pairs: the route
// ---------------------------------------------------------------------------

describe("2. typing the pairs", () => {
  test("a group's facilitator pairs everybody, themselves included, and says who brings a laptop; nobody is emailed", async () => {
    const answer = await w.savePairs("rahul", [
      ["chloe", 1, false],
      ["kofi", 1, true],
      ["farah", 2, false],
      ["rahul", 2, true],
      ["sofia", 2, false],
    ]);
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, { ok: true, saved: 5 });
    const stored = w.recordOf("rahul");
    assert.deepEqual(
      { ...stored, updatedAt: undefined },
      { runId: RUN.agi, groupId: B, uid: "rahul", weekId: "w03", weekNumber: 3, blockId: W3_SESSION, pair: 2, laptop: true, updatedAt: undefined },
    );
    assert.equal(w.records().length, 5);
    assert.equal(w.world.mail.length, 0, "nobody is emailed");
    // Saving the same again changes nothing.
    assert.deepEqual((await w.savePairs("sofia", [["chloe", 1, false]])).body, { ok: true, saved: 0 });
  });

  test("a pair with no laptop is a check, never a refusal: it saves", async () => {
    const answer = await w.savePairs("sofia", [
      ["chloe", 1, false],
      ["kofi", 1, false],
    ]);
    assert.equal(answer.status, 200);
    assert.equal(w.recordOf("kofi").laptop, false);
  });

  test("only what changed is written; taking somebody out of their pair and their laptop leaves no record", async () => {
    w.seedGroupB();
    // Two facilitators at once: Sofia moves Chloe, Rahul moves Kofi; each writes only their own.
    assert.equal((await w.savePairs("sofia", [["farah", 1, false], ["chloe", 2, false]])).status, 200);
    assert.equal(w.recordOf("chloe").pair, 2);
    assert.equal(w.recordOf("farah").pair, 1);
    assert.equal(w.recordOf("kofi").pair, 1, "Kofi was not in Sofia's save");
    // Sofia leaves the three and takes no laptop: Sofia's record goes.
    assert.equal((await w.savePairs("rahul", [["sofia", null, false]])).status, 200);
    assert.equal(w.recordOf("sofia"), null);
    // A laptop without a pair is kept.
    assert.equal((await w.savePairs("rahul", [["sofia", null, true]])).status, 200);
    assert.deepEqual([w.recordOf("sofia").pair, w.recordOf("sofia").laptop], [null, true]);
  });

  test("a save that would leave one person alone in a pair, or put four in one, is refused and writes nothing", async () => {
    w.seedGroupB();
    const before = w.everything();
    const alone = await w.savePairs("rahul", [["kofi", 3, true]]);
    assert.equal(alone.status, 400);
    assert.equal(alone.body.error, "Pair 1 would have only Chloe in it. Give Chloe a partner, or leave Chloe not paired yet.");
    const joining = await w.savePairs("rahul", [["chloe", 3, false]]);
    assert.equal(joining.body.error, "Pair 1 would have only Kofi in it. Give Kofi a partner, or leave Kofi not paired yet.");
    const four = await w.savePairs("rahul", [["kofi", 2, true], ["chloe", null, false]]);
    assert.equal(four.status, 400);
    assert.equal(four.body.error, "Pair 2 would have 4 people in it. A pair is two people, or three.");
    assert.equal(w.everything(), before, "a refused save writes nothing");
    // Moving both together is a pair of two.
    assert.equal((await w.savePairs("rahul", [["kofi", 3, true], ["chloe", 3, false]])).status, 200);
  });

  test("a pair left with one person by somebody leaving does not stop the facilitators saving anything else", async () => {
    w.seedGroupB();
    // Kofi leaves the programme: Chloe is alone in pair 1, and nobody lists Kofi any more.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__kofi`, { status: "withdrawn" });
    assert.equal((await w.savePairs("rahul", [["sofia", 2, true]])).status, 200);
    // Kofi can no longer be named.
    const named = await w.savePairs("rahul", [["kofi", 1, true]]);
    assert.equal(named.status, 409);
    assert.equal(named.body.error, "Somebody you named isn’t in Group B any more. Reload the page.");
    // Pair 1 is touched only when somebody joins or leaves it.
    assert.equal((await w.savePairs("rahul", [["farah", 1, false]])).status, 200);
  });

  test("who may type them: the group's live facilitators, a facilitator who holds a place in it, the programme's lead and admins", async () => {
    for (const who of ["rahul", "sofia", "farah", "claudia", "zach"]) {
      w.reset();
      const answer = await w.savePairs(who, [["chloe", 1, false], ["kofi", 1, true]]);
      assert.equal(answer.status, 200, `${who}: ${JSON.stringify(answer.body)}`);
      assert.equal(w.recordOf("kofi").laptop, true, who);
    }
    // Nobody else: another group's facilitator, another programme's lead, the run's track lead, a
    // reviewer, the group's own fellows, a fellow of another group, somebody who left, nobody.
    for (const who of ["tom", "grace", "tess", "yusuf", "lloyd", "chloe", "kofi", "amara", "sam", "nobody"]) {
      w.reset();
      const answer = await w.savePairs(who, [["chloe", 1, false], ["kofi", 1, true]]);
      assert.equal(answer.status, 403, `${who}: ${JSON.stringify(answer.body)}`);
      assert.deepEqual(w.records(), [], who);
    }
    // Signed out, and view-as, before anything else.
    assert.equal((await w.savePairs(null, [["chloe", 1, false]])).status, 401);
    const viewAs = await w.savePairs("zach", [["chloe", 1, false], ["kofi", 1, false]], { viewAs: true });
    assert.equal(viewAs.status, 403);
    assert.deepEqual(viewAs.body, { error: "view-as" });
    assert.deepEqual(w.records(), []);
  });

  test("an archived group's facilitator types nothing, and a facilitator of an archived group is nobody's", async () => {
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await w.savePairs("rahul", [["chloe", 1, false], ["kofi", 1, false]])).status, 403);
    const admin = await w.savePairs("zach", [["chloe", 1, false], ["kofi", 1, false]]);
    assert.equal(admin.status, 409);
    assert.equal(admin.body.error, "Group B is archived, so nothing on it changes.");
    assert.deepEqual(w.records(), []);
  });

  test("only the group's own people: nobody who left, nobody another group holds, nobody not told", async () => {
    for (const [uid, why] of [["amara", "in Group A"], ["sam", "left"], ["una", "not told, in Group C"], ["omar", "taken off"], ["tom", "another group's facilitator"]]) {
      const answer = await w.savePairs("rahul", [["chloe", 1, false], [uid, 1, false]]);
      assert.equal(answer.status, 409, `${uid}, ${why}`);
    }
    assert.deepEqual(w.records(), []);
  });

  test("the body is checked before anything is read; a week with no session in pairs, or changed since the page opened, refuses", async () => {
    const bad = [
      { weekId: "w3", blockId: W3_SESSION, entries: [{ uid: "chloe", pair: 1, laptop: false }] },
      { weekId: "w03", blockId: "", entries: [{ uid: "chloe", pair: 1, laptop: false }] },
      { weekId: "w03", blockId: W3_SESSION, entries: [] },
      { weekId: "w03", blockId: W3_SESSION, entries: [{ uid: "chloe", pair: 0, laptop: false }] },
      { weekId: "w03", blockId: W3_SESSION, entries: [{ uid: "chloe", pair: 31, laptop: false }] },
      { weekId: "w03", blockId: W3_SESSION, entries: [{ uid: "chloe", pair: "1", laptop: false }] },
      { weekId: "w03", blockId: W3_SESSION, entries: [{ uid: "chloe", pair: 1 }] },
      { weekId: "w03", blockId: W3_SESSION, entries: [{ uid: "a/b", pair: 1, laptop: false }] },
      { weekId: "w03", blockId: W3_SESSION, entries: [{ uid: "chloe", pair: 1, laptop: false }, { uid: "chloe", pair: 2, laptop: false }] },
    ];
    for (const body of bad) {
      // A member with no role meets the same 400 as a facilitator: nothing was read to tell them apart.
      for (const who of ["nobody", "rahul"]) {
        const answer = await w.call(who, w.routes.pairs.PUT, { groupId: B }, { course: true, body });
        assert.equal(answer.status, 400, `${who} ${JSON.stringify(body)}: ${JSON.stringify(answer.body)}`);
      }
    }
    const notJson = await w.call("rahul", w.routes.pairs.PUT, { groupId: B }, { course: true });
    assert.equal(notJson.status, 400);
    // Week 1 has no session in pairs.
    const week1 = await w.savePairs("rahul", [["chloe", 1, false], ["kofi", 1, false]], { weekId: "w01" });
    assert.equal(week1.status, 404);
    assert.equal(week1.body.error, "Week 1 has no session in pairs. Reload the page.");
    // The week was pasted again with a new session block since the page opened.
    const changed = await w.savePairs("rahul", [["chloe", 1, false], ["kofi", 1, false]], { blockId: "is-other" });
    assert.equal(changed.status, 409);
    assert.equal(changed.body.error, "Week 3 has changed since you opened this page. Reload it.");
    // Week 2 asks nothing about laptops.
    const laptop = await w.savePairs("rahul", [["chloe", 1, false], ["kofi", 1, true]], { weekId: "w02", blockId: W2_SESSION });
    assert.equal(laptop.status, 400);
    assert.equal(laptop.body.error, "Week 2 doesn’t ask who is bringing a laptop. Reload the page.");
    assert.equal((await w.savePairs("rahul", [["chloe", 1, false], ["kofi", 1, false]], { weekId: "w02", blockId: W2_SESSION })).status, 200);
    // A group nobody has.
    assert.equal((await w.savePairs("zach", [["chloe", 1, false]], { groupId: "no-such-group" })).status, 404);
    assert.equal((await w.savePairs("zach", [["chloe", 1, false]], { groupId: "a/b" })).status, 404);
    assert.deepEqual(w.records(), [w.pairPath("chloe", { blockId: W2_SESSION }), w.pairPath("kofi", { blockId: W2_SESSION })].sort());
  });

  test("a group's own copy of the week is the one that asks", async () => {
    // Group B's copy of week 3 has no session in pairs: nothing is typed for it.
    const copy = structuredClone(w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`));
    copy.blocks = copy.blocks.map((block) => (block.type === "inTheSession" ? { ...block, beforeYouCome: [] } : block));
    w.world.db.seed(`courseGroups/${B}/weeks/w03`, { ...copy, groupId: B, runId: RUN.agi });
    const answer = await w.savePairs("rahul", [["chloe", 1, false], ["kofi", 1, false]]);
    assert.equal(answer.status, 404);
    // Group A reads the run's week, which asks.
    assert.equal((await w.savePairs("sofia", [["amara", 1, false], ["dev", 1, true]], { groupId: A })).status, 200);
  });

  test("a run being destroyed takes no pairs", async () => {
    w.world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal((await w.savePairs("zach", [["chloe", 1, false], ["kofi", 1, false]])).status, 404);
    assert.deepEqual(w.records(), []);
  });
});

// ---------------------------------------------------------------------------
// 3. The pairs page and the group page's card
// ---------------------------------------------------------------------------

describe("3. the pairs page and the group page's card", () => {
  test("the pairs page: the pairs as they stand with the check, then a row per person, themselves included", async () => {
    w.seedGroupB();
    const page = await w.pairsPage("rahul");
    assert.equal(page.to, null);
    inOrder(page.text, [
      "Group B",
      "Week 3 · Pairs and laptops",
      "Pair everybody up for the session, with at least one laptop in each pair. A pair is two people, or three.",
      "The pairs",
      "Pair 1",
      "Chloe and Kofi",
      "Laptop: Kofi",
      "Pair 2",
      "Farah, Rahul and Sofia",
      "Laptop: Rahul",
      "Every pair has a laptop.",
      "Chloe Nguyen",
      "Pair",
      "Bringing a laptop",
      "Farah Hussain",
      "Kofi Asante",
      "Rahul Mehta",
      "Sofia Rossi",
      "Save",
      "Each person sees who they’re paired with, and who’s bringing a laptop, on their week 3 page. No email.",
    ]);
    // Each row's select holds the stored pair, and the switch the stored laptop.
    assert.match(page.html, /<option value="1" selected="">Pair 1<\/option>/);
    assert.equal((page.html.match(/type="checkbox" class="input" checked=""/g) ?? []).length, 2, "Kofi's and Rahul's laptops");
    // Labels belong to their controls.
    for (const uid of GROUP_B) assert.match(page.html, new RegExp(`<label class="drawLabel" for="[^"]*-${uid}-pair">Pair</label>`));
    // Save waits for the page to hydrate.
    assert.match(page.html, /<button type="button" class="buttonPrimary saveButton" disabled="">Save<\/button>/);
    // Nobody outside the group, and nobody who left, is listed.
    for (const name of ["Amara", "Sam", "Omar", "Una", "Tom"]) assert.doesNotMatch(page.text, new RegExp(name));
  });

  test("the check names a pair with no laptop, a pair of one, and who is not paired yet", async () => {
    w.seedPair("chloe", 1, false);
    w.seedPair("kofi", 1, false);
    w.seedPair("farah", 2, true);
    const page = await w.pairsPage("sofia");
    inOrder(page.text, ["Pair 1", "Chloe and Kofi", "No laptop yet", "Pair 2", "Farah", "Laptop: Farah", "Pair 2 has only Farah in it.", "Pair 1 has no laptop yet.", "Not paired yet: Rahul and Sofia"]);
    // Before anybody is paired.
    w.reset();
    inOrder((await w.pairsPage("sofia")).text, ["The pairs", "Nobody is paired yet.", "Chloe Nguyen"]);
  });

  test("a week that asks nothing about laptops has no switch and no laptop check", async () => {
    w.seedPair("chloe", 1, false, { blockId: W2_SESSION, weekNumber: 2 });
    w.seedPair("kofi", 1, false, { blockId: W2_SESSION, weekNumber: 2 });
    const page = await w.pairsPage("rahul", B, 2);
    inOrder(page.text, ["Week 2 · Pairs", "Pair everybody up for the session. A pair is two people, or three.", "Pair 1", "Chloe and Kofi", "Not paired yet: Farah, Rahul and Sofia", "Each person sees who they’re paired with on their week 2 page. No email."]);
    assert.doesNotMatch(page.text, /laptop/i);
  });

  test("a week with no session in pairs says so, by its address", async () => {
    const page = await w.pairsPage("rahul", B, 1);
    assert.match(page.text, /Week 1 has no session in pairs\./);
    assert.doesNotMatch(page.html, /<form|<select|Save/);
  });

  test("who reaches the pairs page: the group's facilitators, the lead by its address, and admins; everybody else is sent away", async () => {
    w.seedGroupB();
    for (const who of ["rahul", "sofia", "farah", "zach"]) {
      const page = await w.pairsPage(who);
      assert.equal(page.to, null, who);
      assert.match(page.html, new RegExp(`href="/learn/${encodeURIComponent(RUN.agi)}/group/${encodeURIComponent(B)}"`), `${who} goes back to the group page`);
    }
    const lead = await w.pairsPage("claudia");
    assert.equal(lead.to, null);
    assert.match(lead.text, /Chloe and Kofi/);
    assert.match(lead.html, /href="\/admin\/admissions\/forms\/[^"]+\/programmes\/[^"]+\/groups"/, "the lead goes back to the programme's Groups");
    for (const who of ["tom", "grace", "tess", "yusuf", "lloyd", "chloe", "kofi", "amara", "sam", "nobody"]) {
      assert.equal((await w.pairsPage(who)).to, "/learn", who);
    }
    assert.match((await w.pairsPage(null)).to, /^\/login\?next=/);
    assert.equal((await w.pairsPage("zach", "no-such-group")).to, "/learn");
    w.world.db.poke(`courseGroups/${B}`, { archived: true });
    for (const who of ["rahul", "zach"]) assert.equal((await w.pairsPage(who)).to, "/learn", `${who} on an archived group`);
  });

  test("the group page's card: the week the group meets next, each pair, the check and the way to the pairs page", async () => {
    w.seedGroupB();
    const page = await w.groupPage("rahul");
    inOrder(page.text, ["Pairs in Group B", "Pair 1", "Chloe and Kofi", "Laptop: Kofi", "Pair 2", "Farah, Rahul and Sofia", "Laptop: Rahul", "Every pair has a laptop.", "Change pairs and laptops"]);
    assert.match(page.html, new RegExp(`href="/learn/pairs/${encodeURIComponent(B)}\\?week=3"`));
    // An admin sees the same; another group's facilitator never reaches the page.
    inOrder((await w.groupPage("zach")).text, ["Pairs in Group B", "Pair 1", "Chloe and Kofi", "Laptop: Kofi"]);
    assert.notEqual((await w.groupPage("tom")).to, null);
    // Before anybody is paired.
    w.reset();
    inOrder((await w.groupPage("sofia")).text, ["Pairs in Group B", "Nobody is paired yet.", "Pair people up"]);
  });

  test("the card is drawn only for a week that asks: not for Group A's week without pairs, and not on a week written before blocks", async () => {
    // Group A meets on Thursday, in week 3 too: it asks. Take the session out of Group A's own copy.
    const copy = structuredClone(w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`));
    copy.blocks = copy.blocks.filter((block) => block.type !== "inTheSession");
    w.world.db.seed(`courseGroups/${A}/weeks/w03`, { ...copy, groupId: A, runId: RUN.agi });
    assert.doesNotMatch((await w.groupPage("sofia", A)).text, /Pairs in Group A/);
    assert.match((await w.groupPage("sofia", B)).text, /Pairs in Group B/);
    // Group C meets tomorrow, in week 3, with the run's week: it asks.
    assert.match((await w.groupPage("tom", C)).text, /Pairs in Group C/);
  });
});

// ---------------------------------------------------------------------------
// 4. Before you come, on the week page
// ---------------------------------------------------------------------------

/** The reader's own pair box on a week page, as words; "" when there is none. */
function pairBoxOf(html) {
  const at = html.indexOf('class="yourPair"');
  if (at === -1) return "";
  return textOf(html.slice(html.lastIndexOf("<", at), html.indexOf("</section>", at)));
}

describe("4. Before you come on the week page", () => {
  test("before anybody is paired, Before you come is the guide's own words as written, and the page is handed nothing new", async () => {
    const page = await w.weekPage("chloe", 3);
    inOrder(page.text, [
      "In the session",
      "Before you come (about 5 minutes). Your facilitators pair you up before the evening, and every pair has a laptop between them. If you’re bringing one, charge it and check that the example notebook opens.",
    ]);
    assert.equal(pairBoxOf(page.html), "");
    assert.ok(!("pairs" in page.shell.props), "the shell hands the page no pairs");
  });

  test("a fellow reads who they are paired with, by first name, and that their partner is bringing a laptop, under the guide's words", async () => {
    w.seedGroupB();
    const page = await w.weekPage("chloe", 3);
    inOrder(page.text, ["Before you come (about 5 minutes).", "the example notebook opens.", "Your pair", "You’re paired with Kofi.", "Kofi is bringing a laptop."]);
    assert.equal(pairBoxOf(page.html), "Your pair You’re paired with Kofi. Kofi is bringing a laptop.");
    // Handed as fields: first names and whether a laptop is coming, never a record or a uid.
    assert.deepEqual(page.shell.props.pairs, [
      { blockId: W3_SESSION, groupName: "Group B", laptops: true, partners: ["Kofi"], bringing: false, partnersBringing: ["Kofi"], askNames: ["Farah", "Rahul", "Sofia"] },
    ]);
  });

  test("their partner reads the same of them", async () => {
    w.seedGroupB();
    assert.equal(pairBoxOf((await w.weekPage("kofi", 3)).html), "Your pair You’re paired with Chloe. You’re bringing a laptop.");
  });

  test("a facilitator who holds a place, in the group's other pair, and a facilitator with no place who paired themselves", async () => {
    w.seedGroupB();
    assert.equal(pairBoxOf((await w.weekPage("farah", 3)).html), "Your pair You’re paired with Rahul and Sofia. Rahul is bringing a laptop.");
    assert.equal(pairBoxOf((await w.weekPage("rahul", 3)).html), "Your pair You’re paired with Farah and Sofia. You’re bringing a laptop.");
    // Sofia facilitates Group A too, where nobody is paired: one pair, its group not named.
    assert.equal(pairBoxOf((await w.weekPage("sofia", 3)).html), "Your pair You’re paired with Farah and Rahul. Rahul is bringing a laptop.");
  });

  test("nobody reads another pair: not the group's other fellows, not another group, not an admin reading the week", async () => {
    w.seedGroupB();
    const chloe = await w.weekPage("chloe", 3);
    const box = pairBoxOf(chloe.html);
    for (const name of ["Farah", "Rahul", "Sofia"]) assert.doesNotMatch(box, new RegExp(name), `Chloe's pair names ${name}`);
    assert.doesNotMatch(chloe.text, /Rahul is bringing|Farah, Rahul and Sofia|Pair 2/, "Chloe reads nothing of the other pair");
    // A fellow of another group, and an admin who takes part in no group, read no pair at all.
    for (const who of ["amara", "zach"]) {
      const page = await w.weekPage(who, 3);
      assert.ok(page.shell.props, who);
      assert.equal(pairBoxOf(page.html), "", who);
      assert.ok(!("pairs" in page.shell.props), `${who} is handed no pairs`);
      assert.doesNotMatch(page.text, /paired with|is bringing a laptop/, who);
    }
  });

  test("nobody in the pair bringing a laptop: the page says so, and who to tell", async () => {
    w.seedPair("chloe", 1, false);
    w.seedPair("kofi", 1, false);
    assert.equal(
      pairBoxOf((await w.weekPage("chloe", 3)).html),
      "Your pair You’re paired with Kofi. Nobody in your pair is bringing a laptop yet. If you can bring one, tell Farah, Rahul or Sofia.",
    );
    // A facilitator is not told to tell themselves.
    w.seedPair("rahul", 2, false);
    w.seedPair("sofia", 2, false);
    assert.equal(
      pairBoxOf((await w.weekPage("rahul", 3)).html),
      "Your pair You’re paired with Sofia. Nobody in your pair is bringing a laptop yet. If you can bring one, tell Farah or Sofia.",
    );
  });

  test("a laptop and no pair yet says only that", async () => {
    w.seedPair("chloe", null, true);
    assert.equal(pairBoxOf((await w.weekPage("chloe", 3)).html), "You’re bringing a laptop.");
  });

  test("a partner who has left the programme, or moved group, is nobody's partner", async () => {
    w.seedGroupB();
    w.world.db.poke(`courseEnrolments/${RUN.agi}__kofi`, { status: "withdrawn" });
    assert.equal(pairBoxOf((await w.weekPage("chloe", 3)).html), "", "Chloe is in no pair now");
    w.reset();
    w.seedGroupB();
    w.world.db.poke(`courseEnrolments/${RUN.agi}__kofi`, { groupId: A });
    assert.equal(pairBoxOf((await w.weekPage("chloe", 3)).html), "");
    assert.equal(pairBoxOf((await w.weekPage("kofi", 3)).html), "", "Group B's pairs are not Kofi's in Group A");
  });

  test("a week that asks nothing about laptops says who, and nothing of laptops", async () => {
    w.seedPair("chloe", 1, false, { blockId: W2_SESSION, weekNumber: 2 });
    w.seedPair("kofi", 1, false, { blockId: W2_SESSION, weekNumber: 2 });
    const page = await w.weekPage("chloe", 2);
    assert.equal(pairBoxOf(page.html), "Your pair You’re paired with Kofi.");
    // Week 3 is a different session: nobody is paired for it.
    assert.equal(pairBoxOf((await w.weekPage("chloe", 3)).html), "");
  });

  test("a laptop stored against a week that asks nothing about laptops is never said, to anybody", async () => {
    // The route refuses one; a row left over from an earlier paste of the week could still hold one.
    w.seedPair("chloe", 1, true, { blockId: W2_SESSION, weekNumber: 2 });
    w.seedPair("kofi", 1, true, { blockId: W2_SESSION, weekNumber: 2 });
    assert.equal(pairBoxOf((await w.weekPage("chloe", 2)).html), "Your pair You’re paired with Kofi.");
    // The reader itself hands the page no laptop on such a week, whatever is stored.
    const handed = (await w.weekShell("chloe", 2)).props.pairs;
    assert.deepEqual(handed.map((pair) => [pair.laptops, pair.bringing, pair.partnersBringing]), [[false, false, []]]);
    const page = await w.pairsPage("rahul", B, 2);
    assert.doesNotMatch(page.text, /laptop/i);
    // The form starts with no laptop, so a save sends none the route would refuse.
    const form = elementWith(page.element, "initial")?.props;
    assert.deepEqual(form.initial, { chloe: { pair: 1, laptop: false }, kofi: { pair: 1, laptop: false } });
    assert.equal((await w.savePairs("rahul", [["chloe", 1, false], ["kofi", 1, false]], { weekId: "w02", blockId: W2_SESSION })).status, 200);
    assert.equal(w.recordOf("kofi", { blockId: W2_SESSION }).laptop, false, "the save clears the stale laptop");
    w.reset();
    w.seedPair("chloe", null, true, { blockId: W2_SESSION, weekNumber: 2 });
    assert.equal(pairBoxOf((await w.weekPage("chloe", 2)).html), "");
  });

  test("the group's own copy of the week decides: a copy with no session in pairs shows none", async () => {
    w.seedGroupB();
    const copy = structuredClone(w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`));
    copy.blocks = copy.blocks.map((block) => (block.type === "inTheSession" ? { ...block, beforeYouCome: [] } : block));
    w.world.db.seed(`courseGroups/${B}/weeks/w03`, { ...copy, groupId: B, runId: RUN.agi });
    assert.equal(pairBoxOf((await w.weekPage("chloe", 3)).html), "");
  });

  test("a facilitator paired in two groups reads each, with the group named", async () => {
    w.seedGroupB();
    w.seedPair("sofia", 1, true, { groupId: A });
    w.seedPair("amara", 1, false, { groupId: A });
    const box = pairBoxOf((await w.weekPage("sofia", 3)).html);
    assert.match(box, /Your pair · Group A You’re paired with Amara\. You’re bringing a laptop\./);
    assert.match(box, /Your pair · Group B You’re paired with Farah and Rahul\. Rahul is bringing a laptop\./);
    // Amara reads Group A's pair alone.
    assert.equal(pairBoxOf((await w.weekPage("amara", 3)).html), "Your pair You’re paired with Sofia. Sofia is bringing a laptop.");
  });

  test("signed out, somebody who left and somebody not on the run reach no week page; a stored row of another run is nobody's", async () => {
    w.seedGroupB();
    assert.equal((await w.weekShell(null, 3)).to, "/login");
    assert.equal((await w.weekShell("sam", 3)).props, null, "somebody who left");
    assert.equal((await w.weekShell("nobody", 3)).props, null);
    // A row at Chloe's address that names another run is not read.
    w.reset();
    w.seedPair("kofi", 1, true);
    w.world.db.seed(w.pairPath("chloe"), { runId: "another-run", groupId: B, uid: "chloe", blockId: W3_SESSION, pair: 1, laptop: false });
    assert.equal(pairBoxOf((await w.weekPage("chloe", 3)).html), "");
  });
});

// ---------------------------------------------------------------------------
// 5. What takes them away
// ---------------------------------------------------------------------------

/** The store, with `count()` on every query it hands out, answered by counting what the query returns. */
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

describe("5. what takes them away", () => {
  test("destroying the run counts its records, deletes every one of them, and no other run's", async () => {
    w.seedGroupB();
    w.seedPair("amara", 1, true, { groupId: A });
    w.world.db.seed("coursePairs/another-run__grp-9__chloe__is-1", { runId: "another-run", groupId: "grp-9", uid: "chloe", blockId: "is-1", pair: 1, laptop: false });
    w.world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(w.world.courseDb);
    const run = w.lib.courses.normalizeCourseRun(RUN.agi, w.world.db.read(`courseRuns/${RUN.agi}`));
    const counts = await w.lib.courseDeletion.countRunDestroyTargets(db, run);
    assert.equal(counts.pairs, 6);
    const result = await w.lib.courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.pairs, 6);
    assert.deepEqual(w.records(), ["coursePairs/another-run__grp-9__chloe__is-1"]);
  });

  test("the records drain with the run's leaves, before the groups and the weeks they name, and the destroy dialog names them", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.indexOf("pairs") > -1, "the destroy has no stage for pairs");
    assert.ok(order.indexOf("pairs") < order.indexOf("groups") && order.indexOf("pairs") < order.indexOf("weeks"));
    assert.match(table, /drainQuery\(db, COURSE_PAIRS_COLLECTION, byRunId\(COURSE_PAIRS_COLLECTION\), budget\)/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /pairs: \{\s*label: "Pairs and laptops",\s*fate: "destroyed",/);
  });

  test("deleting an account deletes every record of theirs, on every run and in every group, and nobody else's; their partner is then in no pair", async () => {
    w.seedGroupB();
    w.seedPair("kofi", 1, false, { blockId: W2_SESSION, weekNumber: 2 });
    w.seedPair("kofi", 4, true, { groupId: A });
    w.world.db.seed("coursePairs/another-run__grp-9__kofi__is-1", { runId: "another-run", groupId: "grp-9", uid: "kofi", blockId: "is-1", pair: 1, laptop: false });
    assert.equal(await w.lib.accountDeletion.deleteCoursePairs(w.world.courseDb, "kofi"), 4);
    assert.deepEqual(
      w.records(),
      ["chloe", "farah", "rahul", "sofia"].map((uid) => w.pairPath(uid)).sort(),
      "nothing of Kofi's is left, and nobody else's record named Kofi",
    );
    assert.equal(await w.lib.accountDeletion.deleteCoursePairs(w.world.courseDb, "amara"), 0);
    // Chloe, whose partner Kofi was, is in no pair now.
    w.world.db.poke(`courseEnrolments/${RUN.agi}__kofi`, { status: "withdrawn" });
    assert.equal(pairBoxOf((await w.weekPage("chloe", 3)).html), "");
    inOrder((await w.groupPage("rahul")).text, ["Pairs in Group B", "Pair 1", "Chloe", "No laptop yet", "Pair 1 has only Chloe in it."]);
  });

  test("the account's cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*coursePairsDeleted: number;/m);
    assert.match(source, /^\s*coursePairsDeleted: 0,/m);
    assert.match(source, /try \{\s*summary\.coursePairsDeleted = await deleteCoursePairs\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/);
    assert.match(source, /return deleteOwnedCourseRows\(db, COURSE_PAIRS_COLLECTION, uid\);/);
  });

  test("leaving the programme deletes nothing, and nothing shows the leaver in a pair", async () => {
    w.seedGroupB();
    const before = w.records();
    w.world.db.poke(`courseEnrolments/${RUN.agi}__chloe`, { status: "withdrawn" });
    assert.deepEqual(w.records(), before);
    assert.ok(w.recordOf("chloe"), "the leaver's record stays until the run is destroyed or the account deleted");
    assert.equal(pairBoxOf((await w.weekPage("kofi", 3)).html), "You’re bringing a laptop.", "Kofi has no partner now, and still brings a laptop");
    const page = await w.pairsPage("rahul");
    assert.doesNotMatch(page.text, /Chloe/, "the pairs page lists nobody who left");
    // The leaving code does not touch the pairs at all.
    assert.doesNotMatch(readFileSync(join(SRC, "lib", "courses", "leaveRun.ts"), "utf8"), /coursePairs|COURSE_PAIRS_COLLECTION/);
  });
});

// ---------------------------------------------------------------------------
// 6. Who sees what, and every file that addresses the record
// ---------------------------------------------------------------------------

/** Every source file whose code (comments taken out) matches `pattern`, as "src/..." paths. */
function sourceFilesNaming(pattern) {
  const out = [];
  for (const file of walkSource(SRC)) {
    const code = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    if (pattern.test(code)) out.push(`src/${relative(SRC, file).split(sep).join("/")}`);
  }
  return out.sort();
}

/** A walk of the tree held to a named list, in both directions, each entry with its reason. */
function assertExactly(found, expected, what) {
  for (const [file, reason] of expected) assert.ok(reason.length > 20, `${file} is listed as ${what} with no reason`);
  assert.deepEqual(found.filter((file) => !expected.has(file)), [], `these files are ${what} and are not on the list`);
  assert.deepEqual([...expected.keys()].filter((file) => !found.includes(file)), [], `these files are listed as ${what} and no longer are`);
}

describe("6. who sees what, and every file that addresses the record", () => {
  test("every caller: their own pair on their week page, the group's pairs only for its facilitators, the lead and admins, and nothing about laptops beyond the group", async () => {
    w.seedGroupB();
    /** What each caller is shown: their week 3 page's box, the group page's card, the pairs page. */
    const expected = {
      // A fellow, and their partner.
      chloe: { week: "Your pair You’re paired with Kofi. Kofi is bringing a laptop.", group: false, pairs: false },
      kofi: { week: "Your pair You’re paired with Chloe. You’re bringing a laptop.", group: false, pairs: false },
      // A fellow of the same group in another pair, who facilitates it too.
      farah: { week: "Your pair You’re paired with Rahul and Sofia. Rahul is bringing a laptop.", group: true, pairs: true },
      // The facilitator who paired the group, themselves included, and a co-facilitator.
      rahul: { week: "Your pair You’re paired with Farah and Sofia. You’re bringing a laptop.", group: true, pairs: true },
      sofia: { week: "Your pair You’re paired with Farah and Rahul. Rahul is bringing a laptop.", group: true, pairs: true },
      // A fellow of another group, and another group's facilitator.
      amara: { week: "", group: false, pairs: false },
      tom: { week: "", group: false, pairs: false },
      // An admin reads every surface and takes part in none.
      zach: { week: "", group: true, pairs: true },
      // The programme's lead opens the pairs page and no group or week page of the run.
      claudia: { week: null, group: false, pairs: true },
      // Another programme's lead, the run's track lead, a reviewer, somebody who left, nobody, signed out.
      tess: { week: null, group: false, pairs: false },
      yusuf: { week: null, group: false, pairs: false },
      lloyd: { week: null, group: false, pairs: false },
      sam: { week: null, group: false, pairs: false },
      nobody: { week: null, group: false, pairs: false },
      [""]: { week: null, group: false, pairs: false },
    };
    const allPairs = ["Pair 1", "Chloe and Kofi", "Laptop: Kofi", "Pair 2", "Farah, Rahul and Sofia", "Laptop: Rahul", "Every pair has a laptop."];
    for (const [key, sees] of Object.entries(expected)) {
      const who = key || null;
      const week = await w.weekPage(who, 3);
      if (sees.week === null) assert.equal(week.shell.props, null, `${key || "signed out"} reaches no week page`);
      else assert.equal(pairBoxOf(week.html), sees.week, `${key}'s week page`);
      const group = await w.groupPage(who);
      if (sees.group) inOrder(group.text, ["Pairs in Group B", ...allPairs]);
      else assert.notEqual(group.to, null, `${key || "signed out"} reaches Group B's page`);
      const pairs = await w.pairsPage(who);
      if (sees.pairs) inOrder(pairs.text, ["The pairs", ...allPairs]);
      else assert.notEqual(pairs.to, null, `${key || "signed out"} reaches the pairs page`);
      // Nothing about another pair's laptop reaches anybody outside the group's staff and the pair itself.
      const shown = [week.text, group.text, pairs.text].join(" ");
      if (!sees.group && !sees.pairs) {
        assert.doesNotMatch(shown, /Laptop: |Rahul is bringing|Farah, Rahul and Sofia/, `${key || "signed out"} reads the group's pairs`);
        if (!["chloe", "kofi"].includes(key)) assert.doesNotMatch(shown, /Kofi is bringing|Chloe and Kofi/, `${key || "signed out"} reads pair 1`);
      }
    }
  });

  test("every file that addresses the record, and why it may", () => {
    assertExactly(
      sourceFilesNaming(/\bCOURSE_PAIRS_COLLECTION\b|["'`]coursePairs["'`]/),
      new Map([
        ["src/lib/firestore/coursePairs.ts", "the record's own shape, its id and its normaliser, with no reader of its own"],
        ["src/lib/courses/pairs/readers.ts", "the readers, by id, for the people each page may show: a group's pairs to its staff, a person's own pair to them"],
        ["src/app/api/courses/groups/[groupId]/pairs/route.ts", "the one writer, behind the draw's gate, for the group's live facilitators, the programme's lead and admins"],
        ["src/lib/firestore/courseDeletion.ts", "destroying a run counts and deletes its records, by `runId`"],
        ["src/lib/firestore/accountDeletion.ts", "deleting an account deletes every record of that person's, by `uid`"],
      ]),
      "addressing the pairs recorded for a session in pairs",
    );
  });

  test("every caller of the readers, each behind its own gate", () => {
    assertExactly(
      sourceFilesNaming(/\breadGroupPairs\(/),
      new Map([
        ["src/lib/courses/pairs/readers.ts", "the reader itself, and the person's own reader, which keeps one pair of what it reads"],
        ["src/app/(app)/learn/[runId]/group/[groupId]/page.tsx", "the group page's card, behind the page's own gate: the group's live facilitators and admins"],
        ["src/app/(app)/learn/pairs/[groupId]/page.tsx", "the pairs page, behind the draw's gate: the group's live facilitators, the programme's lead and admins"],
      ]),
      "reading every pair of a group",
    );
    assertExactly(
      sourceFilesNaming(/\breadOwnPairs\(/),
      new Map([
        ["src/lib/courses/pairs/readers.ts", "the reader itself, addressed by the session's own uid"],
        ["src/app/(app)/learn/[runId]/weeks/[n]/page.tsx", "the week page's server shell, for the reader alone, after the run's own gate"],
      ]),
      "reading a person's own pair",
    );
    assertExactly(
      sourceFilesNaming(/\breadPairRecords\(/),
      new Map([["src/lib/courses/pairs/readers.ts", "the one place records are read by id, for the two readers beside it"]]),
      "reading pair records",
    );
    // The gates, as the page and the route ask them, and the shell's reader asked for the session's own person.
    const code = (file) => readFileSync(join(SRC, file), "utf8");
    assert.match(code("app/(app)/learn/pairs/[groupId]/page.tsx"), /const gate = await drawGate\(db, user, group\);\s*if \(!gate\.ok \|\| group\.archived\) redirect\("\/learn"\);/);
    assert.match(code("app/api/courses/groups/[groupId]/pairs/route.ts"), /const gate = await drawGate\(db, actor, group\);\s*if \(!gate\.ok\) return NextResponse\.json\(\{ error: "Forbidden" \}, \{ status: 403 \}\);/);
    assert.match(code("app/(app)/learn/[runId]/weeks/[n]/page.tsx"), /return await readOwnPairs\(db, access\.user, access\.run\.id, access\.groups, access\.enrolment, weekNumber, new Date\(\)\);/);
    assert.match(
      code("app/(app)/learn/[runId]/group/[groupId]/page.tsx"),
      /const pairsWeek = drawWeek \? await readGroupPairs\(db, runId, groupId, drawWeek, drawList\) : null;/,
    );
    // The person's own reader hands the page first names and laptops of one pair, never a record.
    const readers = code("lib/courses/pairs/readers.ts");
    const own = /export async function readOwnPairs\([\s\S]*?\n\}/.exec(readers)?.[0] ?? "";
    assert.match(own, /const pair = pairOf\(groupPairs\.view, actor\.uid\);/);
    assert.match(own, /partners: partners\.map\(\(person\) => person\.firstName\),/);
    assert.doesNotMatch(own, /entries:|view:|\.\.\.groupPairs|\.\.\.record/, "the person's own reader hands on more than one pair");
  });
});
