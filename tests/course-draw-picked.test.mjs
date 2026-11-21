/**
 * THE DRAW FOLLOWS A PACK EACH PERSON PICKED, driven through the real draw
 * page, its route, the person's own pick route and the overview as every kind
 * of caller:
 *
 *  1. a week whose pack each person picks and whose cases a facilitator gives
 *     out: the pick shown as words, each case list from the person's own
 *     pick, somebody who has not picked waiting; as a facilitator, the lead,
 *     an admin, a facilitator who takes part and a co-facilitator, who is
 *     handed nothing of a facilitator's own pick;
 *  2. a pick stays once a case that follows it is given, in the owner's
 *     sentence, and is free again once the case is taken back;
 *  3. "Their pick changed": a case held from a pack the person has left;
 *  4. a case with a content note, given only with the row's "Asked for this
 *     one", for a facilitator, the lead and an admin alike;
 *  5. "Swap two people" swaps only what a facilitator gives;
 *  6. every sentence, word for word.
 *
 * The world is `tests/lib/packsAndCasesWorld.mjs` (AGI Strategy in week 3,
 * Group B: Chloe, Farah and Kofi taking part; Rahul, Sofia and Farah
 * facilitating; Claudia leads the programme; Zach is an admin), with week 3's
 * Choose one made one each person picks, as the world's suite does for This
 * week's work. A week whose pack a facilitator gives out is the world's own,
 * and `tests/course-hub-packs-and-cases.test.mjs` runs it unchanged.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { B, NOW, RUN, W3, makePacksAndCasesWorld } from "./lib/packsAndCasesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const w = await makePacksAndCasesWorld("__drawPicked");
const swap = await w.loadTs(join("lib", "courses", "packsAndCases", "swap.ts"));

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());
beforeEach(() => w.reset());

const NOTE = "The sources quote abusive posts: talk to your facilitator before you take this one.";
const NOT_THEIRS = (name) => `Only ${name}, the programme’s lead or an admin can give ${name} a case.`;

/** Week 3's first Choose one made one each person picks, retitled when asked; the case study still given out, keyed by it. */
function pickedWeek({ title = null } = {}) {
  const stored = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`);
  const blocks = structuredClone(stored.blocks);
  const part = blocks.find((block) => block.type === "part" && block.blocks.some((child) => child.id === W3.given));
  const chooseOne = part.blocks.find((child) => child.id === W3.given);
  chooseOne.givenBy = "fellow";
  if (title) chooseOne.title = title;
  w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, { ...stored, blocks });
  return blocks;
}

/** A pick and a case written straight to the store, as the routes leave them. */
function seedRecord(uid, blockId, fields) {
  w.world.db.seed(`coursePacksAndCases/${RUN.agi}__${uid}__${blockId}`, {
    runId: RUN.agi,
    uid,
    weekId: "w03",
    weekNumber: 3,
    blockId,
    givenAt: NOW,
    ...fields,
  });
}
const seedPick = (uid, packId) => seedRecord(uid, W3.given, { kind: "pack", packId });
const seedCase = (uid, caseId, ready = false) => seedRecord(uid, W3.caseStudy, { kind: "talk", caseId, ready });

/** Each select of a page: whether it takes a press, and its options, the chosen one starred. */
function selects(html) {
  return [...html.matchAll(/<select[^>]*>(.*?)<\/select>/g)].map(([whole, inner]) => ({
    disabled: /<select[^>]* disabled=""/.test(whole),
    options: [...inner.matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map(([, , chosen, words]) => `${chosen ? "*" : ""}${words}`),
  }));
}

/** Each phrase, in this order, somewhere in `text`. */
function inOrder(text, phrases) {
  let from = 0;
  for (const phrase of phrases) {
    const at = text.indexOf(phrase, from);
    assert.ok(at >= 0, `missing, or out of order: "${phrase}"`);
    from = at + phrase.length;
  }
}

/** The props the draw page hands its editor (a client component, so every one of them reaches the browser). */
function editorProps(node) {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = editorProps(child);
      if (found) return found;
    }
    return null;
  }
  if (node.props && "talks" in node.props && "hidden" in node.props) return node.props;
  return node.props ? editorProps(node.props.children) : null;
}

/** `who` saves the draw with each entry's own fields. */
const saveRaw = (who, entries) => w.call(who, w.routes.draw.PUT, { groupId: B }, { course: true, body: { weekId: "w03", entries } });

// ---------------------------------------------------------------------------
// 1. A picked week, end to end
// ---------------------------------------------------------------------------

describe("1. a week whose pack each person picks: the page and the route follow the pick", () => {
  test("the facilitator: each pick as words, each case list from the pick, and somebody who has not picked waits", async () => {
    pickedWeek();
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.pick("rahul", W3.given, "w03", W3.elections)).status, 200);
    const page = await w.drawPage("rahul");
    assert.equal(page.to, null);
    inOrder(page.text, [
      "Group B · after session 2",
      // The title names only what the facilitator gives out.
      "Cases",
      "Week 3 · Cases",
      "In week 3 each person picks their own pack. You give out the case, from that pack’s list.",
      "Chloe Nguyen",
      "Pack",
      "Elections",
      "Their pick",
      "Case",
      "Kofi Asante",
      "Pack",
      "Hasn’t picked a pack yet",
      "Case",
      "Waits for a pack",
      "Kofi picks on their week 3 page. You can give the case once they have.",
      "Rahul",
      "Elections",
      "Their pick",
      "Save",
      "Each person sees theirs on their week 3 page. No email.",
    ]);
    // Never the word "pack" where the week says otherwise, and never the old greyed-out list.
    assert.doesNotMatch(page.text, /Choose a pack first|Choose an? \w+ first/);
    // A pick is words, never a list: the Week picker, then a case list for Chloe, Kofi and Rahul.
    const lists = selects(page.html);
    assert.equal(lists.length, 4);
    assert.deepEqual(lists[1], { disabled: false, options: ["*Not given yet", "The surprise result, 2016"] });
    assert.deepEqual(lists[2], { disabled: true, options: ["*Waits for a pack"] });
    assert.deepEqual(lists[3], { disabled: false, options: ["*Not given yet", "The surprise result, 2016"] });
    for (const list of lists) assert.ok(!list.options.some((option) => /Elections|Markets|Technology/.test(option)), "a pick drawn as a list");

    // Saved through the route: the case is read against the pick, inside the transaction.
    let answer = await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, W3.surprise]]);
    assert.deepEqual([answer.status, answer.body], [200, { ok: true, saved: 1 }]);
    assert.equal(w.recordOf("chloe", W3.caseStudy).caseId, W3.surprise);
    // A case from a pack Chloe did not pick, and a case for Kofi, who has not picked: refused, as for a pack given out.
    answer = await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, W3.crash]]);
    assert.deepEqual([answer.status, answer.body.error], [400, "Chloe Nguyen’s case isn’t one their list offers. Choose one of its cases, or leave it not given yet."]);
    answer = await w.saveDraw("rahul", "w03", [["kofi", W3.caseStudy, W3.crash]]);
    assert.equal(answer.status, 400);
    // A pick is the person's own: the draw never types one.
    answer = await w.saveDraw("rahul", "w03", [["kofi", W3.given, W3.markets]]);
    assert.deepEqual([answer.status, answer.body.error], [400, "That isn’t given out in week 3. Reload the page."]);
    assert.equal(w.recordOf("kofi", W3.given), null);
    assert.equal(w.recordOf("chloe", W3.caseStudy).caseId, W3.surprise);

    // The page now holds it, and Chloe reads her case on her week page; nobody is emailed.
    assert.deepEqual(selects((await w.drawPage("rahul")).html)[1].options, ["*The surprise result, 2016"]);
    assert.match((await w.weekPage("chloe", 3)).text, /The surprise result, 2016/);
    assert.equal(w.world.mail.length, 0);
  });

  test("the lead and an admin: every row, a facilitator's own pick included, and they give its case", async () => {
    for (const who of ["claudia", "zach"]) {
      w.reset();
      pickedWeek();
      assert.equal((await w.pick("farah", W3.given, "w03", W3.markets)).status, 200);
      const page = await w.drawPage(who);
      inOrder(page.text, ["Farah Hussain", "Pack", "Markets", "Their pick", "Case", "Not given yet", "The crash nobody priced, 2008", "Kofi Asante"]);
      assert.doesNotMatch(page.text, /Picks their own/, who);
      assert.deepEqual(editorProps(page.element).hidden, [], who);
      const answer = await w.saveDraw(who, "w03", [["farah", W3.caseStudy, W3.crash]]);
      assert.deepEqual([answer.status, answer.body], [200, { ok: true, saved: 1 }], who);
      assert.equal(w.recordOf("farah", W3.caseStudy).caseId, W3.crash, who);
    }
  });

  test("a facilitator who takes part sees their own pick and gives their own case; their co-facilitators' stay theirs", async () => {
    pickedWeek();
    assert.equal((await w.pick("farah", W3.given, "w03", W3.markets)).status, 200);
    assert.equal((await w.pick("rahul", W3.given, "w03", W3.elections)).status, 200);
    const page = await w.drawPage("farah");
    inOrder(page.text, ["Farah Hussain", "Markets", "Their pick", "The crash nobody priced, 2008", "Rahul", "Picks their own", NOT_THEIRS("Rahul")]);
    assert.deepEqual(editorProps(page.element).hidden.sort(), ["rahul", "sofia"]);
    const answer = await w.saveDraw("farah", "w03", [["farah", W3.caseStudy, W3.crash]]);
    assert.equal(answer.status, 200);
    assert.equal(w.recordOf("farah", W3.caseStudy).caseId, W3.crash);
  });

  test("a co-facilitator is handed nothing of a facilitator's own pick: not in the page, not in its editor's props, not in the route's answer", async () => {
    pickedWeek();
    // Nobody else in the group is on Markets, so the word could only come from Farah's own pick.
    for (const uid of ["chloe", "kofi"]) assert.equal((await w.pick(uid, W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.pick("farah", W3.given, "w03", W3.markets)).status, 200);
    assert.equal((await w.saveDraw("claudia", "w03", [["farah", W3.caseStudy, W3.crash]])).status, 200);

    const page = await w.drawPage("rahul");
    inOrder(page.text, ["Farah Hussain", "Pack", "Picks their own", "Case", NOT_THEIRS("Farah"), "Kofi Asante"]);
    assert.doesNotMatch(page.html, /Markets|The crash nobody priced/);
    const props = editorProps(page.element);
    assert.deepEqual(props.hidden.sort(), ["farah", "sofia"]);
    assert.deepEqual(props.picks.farah, {});
    assert.deepEqual(props.initial.farah, { packs: {}, cases: {} });
    assert.deepEqual(props.picks.chloe, { [W3.given]: W3.elections });
    // Nothing of Farah's: no pick and no case, anywhere in what the editor is handed of the people.
    const ofPeople = JSON.stringify([props.people, props.initial, props.picks, props.hidden]);
    assert.ok(!ofPeople.includes(W3.markets) && !ofPeople.includes(W3.crash), "a facilitator's own pick reached a co-facilitator's editor");

    // The route: Farah's case is refused whatever its value, in one answer that says nothing of her pick.
    const answers = [];
    for (const value of [W3.crash, W3.surprise, null]) {
      const answer = await w.saveDraw("rahul", "w03", [["farah", W3.caseStudy, value]]);
      answers.push([answer.status, answer.body]);
    }
    assert.deepEqual(answers, Array(3).fill([403, { error: NOT_THEIRS("Farah") }]));
    // Given with a tick, or alongside somebody else's: the same.
    const ticked = await saveRaw("rahul", [{ uid: "chloe", blockId: W3.caseStudy, value: W3.surprise }, { uid: "farah", blockId: W3.caseStudy, value: W3.surprise, asked: true }]);
    assert.deepEqual([ticked.status, ticked.body], [403, { error: NOT_THEIRS("Farah") }]);
    assert.equal(w.recordOf("farah", W3.caseStudy).caseId, W3.crash);
    assert.equal(w.recordOf("chloe", W3.caseStudy), null);
    // Somebody else's case saves, and never trips over Farah's.
    assert.equal((await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, W3.surprise]])).status, 200);

    // Farah changes her pick to one her case does not follow: Rahul's page is the same page, byte for byte.
    const before = (await w.drawPage("rahul")).html;
    seedPick("farah", W3.technology);
    assert.equal((await w.drawPage("rahul")).html, before);
  });
});

// ---------------------------------------------------------------------------
// 2. A pick stays once its case is given
// ---------------------------------------------------------------------------

describe("2. a pick stays once a case that follows it is given", () => {
  test("refused in the owner's sentence, word for word, naming whom to ask as the week page names them", async () => {
    pickedWeek({ title: "Pathway" });
    const groupB = w.world.db.read(`courseGroups/${B}`);
    w.world.db.seed(`courseGroups/${B}`, { ...groupB, facilitatorUids: ["rahul"] });
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, W3.surprise]])).status, 200);
    const answer = await w.pick("chloe", W3.given, "w03", W3.markets);
    assert.deepEqual([answer.status, answer.body.error], [409, "Your case has been given, so your pathway stays as it is. To switch, ask Rahul."]);
    assert.equal(w.recordOf("chloe", W3.given).packId, W3.elections);
    // Rahul is the one Chloe's week page names.
    assert.deepEqual((await w.overview("chloe")).body.askToSwap, ["Rahul"]);
  });

  test("with several facilitators, and with nobody else to ask, the same naming as the week page", async () => {
    pickedWeek();
    for (const uid of ["chloe", "farah"]) assert.equal((await w.pick(uid, W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.saveDraw("claudia", "w03", [["chloe", W3.caseStudy, W3.surprise], ["farah", W3.caseStudy, W3.surprise]])).status, 200);
    for (const [who, ask] of [
      ["chloe", "Rahul, Sofia or Farah"],
      ["farah", "Rahul or Sofia"],
    ]) {
      const answer = await w.pick(who, W3.given, "w03", W3.markets);
      assert.deepEqual([answer.status, answer.body.error], [409, `Your case has been given, so your pack stays as it is. To switch, ask ${ask}.`], who);
      assert.equal((await w.overview(who)).body.askToSwap.join(", ").replace(/, (\w+)$/, " or $1"), ask, who);
    }
    // Farah the only facilitator: nobody else to ask, so nobody is named, as the week page names nobody.
    const groupB = w.world.db.read(`courseGroups/${B}`);
    w.world.db.seed(`courseGroups/${B}`, { ...groupB, facilitatorUids: ["farah"] });
    const alone = await w.pick("farah", W3.given, "w03", W3.markets);
    assert.deepEqual([alone.status, alone.body.error], [409, "Your case has been given, so your pack stays as it is."]);
    assert.deepEqual((await w.overview("farah")).body.askToSwap, []);
  });

  test("free as today before any case, the same pick again is fine, and taking the case back frees it", async () => {
    pickedWeek();
    assert.equal((await w.pick("kofi", W3.given, "w03", W3.markets)).status, 200);
    assert.equal((await w.pick("kofi", W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.saveDraw("rahul", "w03", [["kofi", W3.caseStudy, W3.surprise]])).status, 200);
    assert.equal((await w.pick("kofi", W3.given, "w03", W3.markets)).status, 409);
    assert.equal((await w.pick("kofi", W3.given, "w03", W3.elections)).status, 200, "the pick they have");
    // The facilitator takes the case back: the pick is free again.
    assert.equal((await w.saveDraw("rahul", "w03", [["kofi", W3.caseStudy, null]])).status, 200);
    assert.equal((await w.pick("kofi", W3.given, "w03", W3.markets)).status, 200);
    assert.equal(w.recordOf("kofi", W3.given).packId, W3.markets);
    // The session still closes it, in today's words.
    w.at("2026-11-17T18:00:00Z");
    const late = await w.pick("kofi", W3.given, "w03", W3.elections);
    assert.deepEqual([late.status, late.body.error], [409, "Your session has started, so your choice stays as it is."]);
  });

  test("a Choose one no case follows is free as today, case or no case", async () => {
    // The world's own week 3: its second Choose one is picked, and no case is grouped by it.
    w.seedDraw("chloe", "w3", { pack: W3.elections, caseId: W3.surprise });
    assert.equal((await w.pick("chloe", W3.picked, "w03", W3.atWork)).status, 200);
    assert.equal((await w.pick("chloe", W3.picked, "w03", W3.inPublic)).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. Their pick changed
// ---------------------------------------------------------------------------

describe("3. a case held from a pack the person has since left", () => {
  test("their row says \"Their pick changed\", keeps the case shown, and the facilitator puts it right", async () => {
    pickedWeek();
    seedPick("chloe", W3.markets);
    seedCase("chloe", W3.surprise, true);
    const page = await w.drawPage("rahul");
    inOrder(page.text, [
      "Chloe Nguyen",
      "Markets",
      "Their pick changed",
      "Case",
      "The case they hold is from the pack they picked before. Give them one from this list, or Not given yet.",
    ]);
    assert.deepEqual(selects(page.html)[1], { disabled: false, options: ["*The surprise result, 2016", "The crash nobody priced, 2008"] });
    // Put right: a case from the pack they picked; the ready mark, which was for the old case, is cleared.
    const answer = await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, W3.crash]]);
    assert.equal(answer.status, 200);
    assert.deepEqual([w.recordOf("chloe", W3.caseStudy).caseId, w.recordOf("chloe", W3.caseStudy).ready], [W3.crash, false]);
    const after = await w.drawPage("rahul");
    assert.doesNotMatch(after.text, /Their pick changed/);
    inOrder(after.text, ["Chloe Nguyen", "Markets", "Their pick", "The crash nobody priced, 2008"]);
  });
});

// ---------------------------------------------------------------------------
// 4. A case with a content note
// ---------------------------------------------------------------------------

describe("4. a case with a content note: given only when the row says they asked for it", () => {
  test("the route refuses it without the row's tick and takes it with it, for a facilitator, the lead and an admin", async () => {
    for (const who of ["rahul", "claudia", "zach"]) {
      w.reset();
      w.seedDraw("chloe", "w3", { pack: W3.elections });
      let answer = await saveRaw(who, [{ uid: "chloe", blockId: W3.caseStudy, value: W3.closeCall }]);
      assert.deepEqual([answer.status, answer.body.error], [400, "Chloe Nguyen’s case isn’t one their list offers. Choose one of its cases, or leave it not given yet."], who);
      answer = await saveRaw(who, [{ uid: "chloe", blockId: W3.caseStudy, value: W3.closeCall, asked: false }]);
      assert.equal(answer.status, 400, who);
      // The tick is the row's own: another row's does not count.
      answer = await saveRaw(who, [
        { uid: "chloe", blockId: W3.caseStudy, value: W3.closeCall },
        { uid: "kofi", blockId: W3.given, value: W3.markets, asked: true },
      ]);
      assert.equal(answer.status, 400, who);
      assert.equal(w.recordOf("chloe", W3.caseStudy), null, who);
      answer = await saveRaw(who, [{ uid: "chloe", blockId: W3.caseStudy, value: W3.closeCall, asked: true }]);
      assert.deepEqual([answer.status, answer.body], [200, { ok: true, saved: 1 }], who);
      assert.equal(w.recordOf("chloe", W3.caseStudy).caseId, W3.closeCall, who);
      // Nothing of the tick is stored.
      assert.ok(!("asked" in w.recordOf("chloe", W3.caseStudy)), who);
      // Held already and left as it is: a later save touching Chloe needs no tick again.
      answer = await saveRaw(who, [{ uid: "chloe", blockId: W3.given, value: W3.elections }]);
      assert.deepEqual([answer.status, answer.body], [200, { ok: true, saved: 0 }], who);
    }
    // The tick is a yes or a no.
    const bad = await saveRaw("rahul", [{ uid: "chloe", blockId: W3.caseStudy, value: W3.closeCall, asked: "yes" }]);
    assert.equal(bad.status, 400);
  });

  test("the page: out of every list until the row is ticked, the count under the people, and once given its note beside it", async () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    w.seedDraw("kofi", "w3", { pack: W3.markets });
    let page = await w.drawPage("rahul");
    assert.doesNotMatch(page.html, /The close call, 2019/);
    // One tick, on the one row whose list has such a case: Chloe's (Elections); Markets has none, Farah has no pack.
    assert.equal((page.html.match(/Asked for this one/g) ?? []).length, 2, "the tick and the line under the people");
    assert.match(page.html, /<label class="drawAsked"><input type="checkbox" class="drawAskedBox"\/><span>Asked for this one<\/span><\/label>/);
    inOrder(page.text, [
      "Chloe Nguyen",
      "The surprise result, 2016",
      "Asked for this one",
      "Kofi Asante",
      "1 Elections case has a content note, so it isn’t in the list to give out. To give one to somebody who asked for it, tick Asked for this one on their row.",
      "Save",
    ]);

    assert.equal((await saveRaw("rahul", [{ uid: "chloe", blockId: W3.caseStudy, value: W3.closeCall, asked: true }])).status, 200);
    page = await w.drawPage("rahul");
    // The row opens ticked, the case in its list marked, and its note under it.
    assert.match(page.html, /<input type="checkbox" class="drawAskedBox" checked=""\/><span>Asked for this one<\/span>/);
    assert.deepEqual(selects(page.html)[2].options, ["The surprise result, 2016", "*The close call, 2019 (content note)"]);
    inOrder(page.text, ["Chloe Nguyen", "The close call, 2019 (content note)", NOTE, "Asked for this one", "Farah Hussain"]);
  });

  test("a pack whose every case has a content note: No case to give, and the line says what to do", async () => {
    const stored = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`);
    const blocks = structuredClone(stored.blocks);
    const caseStudy = blocks.find((block) => block.id === W3.caseStudy);
    caseStudy.groups[0].cases = caseStudy.groups[0].cases.filter((item) => item.id !== W3.surprise);
    w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, { ...stored, blocks });
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    const page = await w.drawPage("rahul");
    assert.deepEqual(selects(page.html)[2], { disabled: true, options: ["*No case to give"] });
    inOrder(page.text, [
      "Chloe Nguyen",
      "No case to give",
      "Every Elections case here has a content note, so none can be given out. If Chloe asked for one, tick Asked for this one.",
      "Asked for this one",
    ]);
    assert.doesNotMatch(page.text, /Tell /);
  });

  test("on a week whose pack each person picks, the same", async () => {
    pickedWeek();
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await saveRaw("rahul", [{ uid: "chloe", blockId: W3.caseStudy, value: W3.closeCall }])).status, 400);
    assert.equal((await saveRaw("rahul", [{ uid: "chloe", blockId: W3.caseStudy, value: W3.closeCall, asked: true }])).status, 200);
    assert.match((await w.drawPage("rahul")).text, /The close call, 2019 \(content note\)/);
  });
});

// ---------------------------------------------------------------------------
// 5. Swap two people
// ---------------------------------------------------------------------------

describe("5. Swap two people swaps only what a facilitator gives", () => {
  /** The swap's rows over week 3 as stored, with these holdings. */
  function rows({ picks = {}, cases = {}, asked = {}, hidden = [] } = {}) {
    const blocks = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`).blocks;
    const talk = w.lib.model.drawTalkOf(blocks, w.lib.model.talksOf(blocks).find((each) => each.id === W3.caseStudy));
    const draw = w.lib.model.drawOf(blocks);
    return {
      talks: [talk],
      pickedIds: new Set(draw.picked.map((block) => block.id)),
      titleOf: () => "Pack",
      nameOf: (uid) => uid.charAt(0).toUpperCase() + uid.slice(1),
      caseOf: (uid) => cases[uid] ?? null,
      pickOf: (uid) => picks[uid] ?? null,
      askedOf: (uid) => asked[uid] === true,
      hidden: (uid) => hidden.includes(uid),
    };
  }

  test("across two people who have not picked the same pack, it is refused in one sentence", () => {
    pickedWeek();
    const refused = swap.swapRefusedWords;
    const across = "Chloe and Kofi haven’t picked the same pack, so their cases can’t be swapped.";
    assert.equal(refused("chloe", "kofi", rows({ picks: { chloe: W3.elections, kofi: W3.markets }, cases: { chloe: W3.surprise } })), across);
    assert.equal(refused("chloe", "kofi", rows({ picks: { chloe: W3.elections }, cases: { chloe: W3.surprise } })), across, "one has not picked");
    // The same pick: their cases swap. No case on either side: nothing moves, nothing refused.
    assert.equal(refused("chloe", "kofi", rows({ picks: { chloe: W3.elections, kofi: W3.elections }, cases: { chloe: W3.surprise } })), null);
    assert.equal(refused("chloe", "kofi", rows({ picks: { chloe: W3.elections, kofi: W3.markets } })), null);
    // A facilitator's own, on a co-facilitator's page.
    assert.equal(refused("chloe", "farah", rows({ picks: { chloe: W3.elections }, hidden: ["farah"] })), NOT_THEIRS("Farah"));
  });

  test("a case with a content note goes only to somebody who asked for one", () => {
    w.seedDraw("chloe", "w3", { pack: W3.elections });
    const refused = swap.swapRefusedWords;
    const noted = rows({ cases: { chloe: W3.closeCall, kofi: W3.surprise } });
    assert.equal(refused("chloe", "kofi", noted), "Chloe’s case has a content note and Kofi hasn’t asked for one, so they can’t be swapped.");
    assert.equal(refused("kofi", "chloe", noted), "Chloe’s case has a content note and Kofi hasn’t asked for one, so they can’t be swapped.");
    assert.equal(refused("chloe", "kofi", rows({ cases: { chloe: W3.closeCall, kofi: W3.surprise }, asked: { kofi: true } })), null);
    // A week whose packs a facilitator gives out swaps everything given, as it always has.
    assert.equal(refused("chloe", "kofi", rows({ cases: { chloe: W3.surprise, kofi: W3.crash } })), null);
  });

  test("the page's swap asks this rule, and the route refuses the same save whichever way it arrives", async () => {
    const editor = readFileSync(join(SRC, "features", "courses", "packsAndCases", "DrawEditor.tsx"), "utf8");
    assert.match(editor, /function swap\(\) \{\n\s+if \(!swapA \|\| !swapB \|\| swapA === swapB\) return;\n\s+const refused = swapRefusedWords\(swapA, swapB, \{/);
    pickedWeek();
    seedPick("chloe", W3.elections);
    seedCase("chloe", W3.surprise);
    seedPick("kofi", W3.markets);
    seedCase("kofi", W3.crash);
    const answer = await w.saveDraw("claudia", "w03", [
      ["chloe", W3.caseStudy, W3.crash],
      ["kofi", W3.caseStudy, W3.surprise],
    ]);
    assert.equal(answer.status, 400);
    assert.deepEqual([w.recordOf("chloe", W3.caseStudy).caseId, w.recordOf("kofi", W3.caseStudy).caseId], [W3.surprise, W3.crash]);
  });
});

// ---------------------------------------------------------------------------
// 6. The words
// ---------------------------------------------------------------------------

describe("6. every new sentence, word for word", () => {
  test("the draw's and the pick's words", () => {
    const words = w.lib.words;
    assert.equal(words.pickStaysWords("Pathway", ["Rahul"]), "Your case has been given, so your pathway stays as it is. To switch, ask Rahul.");
    assert.equal(words.pickStaysWords("Pathway", ["Rahul", "Sofia"]), "Your case has been given, so your pathway stays as it is. To switch, ask Rahul or Sofia.");
    assert.equal(words.pickStaysWords("Pathway", []), "Your case has been given, so your pathway stays as it is.");
    assert.equal(words.choosePackFirstWords("Pathway", "Chloe"), "Choose Chloe’s pathway first.");
    assert.equal(words.choosePackFirstWords("Pathway"), "Choose a pathway first");
    assert.equal(words.pickedLedeWords(3, "Pathway"), "In week 3 each person picks their own pathway. You give out the case, from that pathway’s list.");
    assert.equal(words.THEIR_PICK, "Their pick");
    assert.equal(words.THEIR_PICK_CHANGED, "Their pick changed");
    assert.equal(words.pickChangedLineWords("Pathway"), "The case they hold is from the pathway they picked before. Give them one from this list, or Not given yet.");
    assert.equal(words.notPickedYetWords("Pathway"), "Hasn’t picked a pathway yet");
    assert.equal(words.waitsForPackWords("Pathway"), "Waits for a pathway");
    assert.equal(words.picksOnWeekPageWords("Daniel", 3), "Daniel picks on their week 3 page. You can give the case once they have.");
    assert.equal(words.PICKS_THEIR_OWN, "Picks their own");
    assert.equal(words.ownCaseGivenByWords("Rahul"), NOT_THEIRS("Rahul"));
    assert.equal(words.ASKED_FOR_THIS_ONE, "Asked for this one");
    assert.equal(words.notedCaseOptionWords("The close call, 2019"), "The close call, 2019 (content note)");
    assert.equal(words.NO_CASE_TO_GIVE, "No case to give");
    assert.equal(words.everyCaseNotedWords("Misuse", "Chloe"), "Every Misuse case here has a content note, so none can be given out. If Chloe asked for one, tick Asked for this one.");
    assert.equal(
      words.notedCasesWords(2, "Misuse"),
      "2 Misuse cases have a content note, so they aren’t in the list to give out. To give one to somebody who asked for it, tick Asked for this one on their row.",
    );
    assert.equal(words.swapAcrossPicksWords("Aisha", "Chloe", "Pathway"), "Aisha and Chloe haven’t picked the same pathway, so their cases can’t be swapped.");
    assert.equal(words.swapNotedWords("Aisha", "Chloe"), "Aisha’s case has a content note and Chloe hasn’t asked for one, so they can’t be swapped.");
  });
});
