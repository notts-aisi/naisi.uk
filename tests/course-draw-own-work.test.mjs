/**
 * WHOSE PICK IS A FACILITATOR'S OWN, ON THE PATHWAYS AND CASES PAGE AND ITS
 * ROUTE: anybody in a group's draw who facilitates a live group of the run,
 * this one or another (`facilitatingOnRunOf`, the one answer every reader of
 * a person's work asks). Their own pick, and the case that follows it, are
 * read by the programme's lead and admins only, so the group's facilitators
 * get "Picks their own" for that row and the route refuses them its case.
 *
 *  1. Chloe holds a place in Group B and facilitates Group A. A place in one
 *     group and a live group facilitated elsewhere comes about when the
 *     board placed somebody while the group they facilitate was archived,
 *     and that group was brought back afterwards (the board and every
 *     appointment refuse it while both groups are live), or from a record
 *     written before those refusals. The page, its editor's props, the route,
 *     This week's work and Chloe's own week page all hold her pick back from
 *     Group B's facilitators; the lead and an admin are unchanged; while
 *     Group A is archived it staffs nobody and she is a fellow like anybody.
 *  2. THE GUARD: every place under `src/lib/courses/packsAndCases`, the draw's
 *     route and the draw's page that decides whether a pick is somebody's own
 *     work asks `hidesOwnPick`, which reads `ownWork`, which `drawPeople` sets
 *     from the run-wide set alone, and every caller of `drawPeople` hands it
 *     `facilitatingOnRunOf`. Both registries are checked both ways.
 *
 * The world is `tests/lib/packsAndCasesWorld.mjs` (AGI Strategy in week 3;
 * Group B: Chloe, Farah and Kofi taking part, Rahul, Sofia and Farah
 * facilitating; Group A facilitated by Sofia; Claudia leads the programme;
 * Zach is an admin), with week 3's Choose one made one each person picks.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, mock, test } from "node:test";
import { A, NOW, RUN, W3, makePacksAndCasesWorld } from "./lib/packsAndCasesWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const w = await makePacksAndCasesWorld("__drawOwnWork");

before(() => mock.timers.enable({ apis: ["Date"], now: NOW }));
after(() => mock.timers.reset());
beforeEach(() => w.reset());

const NOT_THEIRS = (name) => `Only ${name}, the programme’s lead or an admin can give ${name} a case.`;

/** Week 3's first Choose one made one each person picks; the case study still given out, keyed by it. */
function pickedWeek() {
  const stored = w.world.db.read(`courseRuns/${RUN.agi}/weeks/w03`);
  const blocks = structuredClone(stored.blocks);
  const part = blocks.find((block) => block.type === "part" && block.blocks.some((child) => child.id === W3.given));
  part.blocks.find((child) => child.id === W3.given).givenBy = "fellow";
  w.world.db.seed(`courseRuns/${RUN.agi}/weeks/w03`, { ...stored, blocks });
}

/** Chloe, who holds a place in Group B, facilitates Group A too; `archived` archives Group A. */
function chloeFacilitatesA({ archived = false } = {}) {
  const groupA = w.world.db.read(`courseGroups/${A}`);
  w.world.db.seed(`courseGroups/${A}`, { ...groupA, facilitatorUids: [...groupA.facilitatorUids, "chloe"], archived });
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

/** The props the draw page hands its editor. */
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

/** This week's work as the group page draws it for `who`. */
async function table(who) {
  const { text } = await w.groupPage(who);
  const at = text.indexOf("This week’s work");
  assert.ok(at >= 0, `${who}: no This week's work`);
  const end = text.indexOf("Facilitators’ own work", at);
  return text.slice(at, end > 0 ? end : undefined);
}

describe("1. somebody who facilitates another live group of the run", () => {
  test("Group B's facilitators are handed nothing of Chloe's pick, and are refused the case that follows it", async () => {
    pickedWeek();
    chloeFacilitatesA();
    // Nobody else in the group is on Markets, so the word could only come from Chloe's own pick.
    assert.equal((await w.pick("kofi", W3.given, "w03", W3.elections)).status, 200);
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.markets)).status, 200);
    assert.equal((await w.saveDraw("claudia", "w03", [["chloe", W3.caseStudy, W3.crash]])).status, 200);

    for (const who of ["rahul", "farah"]) {
      const page = await w.drawPage(who);
      inOrder(page.text, ["Chloe Nguyen", "Pack", "Picks their own", "Case", NOT_THEIRS("Chloe"), "Kofi Asante"]);
      assert.doesNotMatch(page.html, /Markets|The crash nobody priced/, who);
      const props = editorProps(page.element);
      assert.ok(props.hidden.includes("chloe"), `${who}: Chloe's row is not held back`);
      assert.deepEqual(props.picks.chloe, {}, who);
      assert.deepEqual(props.initial.chloe, { packs: {}, cases: {} }, who);
      // Kofi, who facilitates nothing, is shown as before.
      assert.deepEqual(props.picks.kofi, { [W3.given]: W3.elections }, who);

      // The route: one answer whatever the value, so it says nothing of her pick; nothing is written.
      const answers = [];
      for (const value of [W3.crash, W3.surprise, null]) {
        const answer = await w.saveDraw(who, "w03", [["chloe", W3.caseStudy, value]]);
        answers.push([answer.status, answer.body]);
      }
      assert.deepEqual(answers, Array(3).fill([403, { error: NOT_THEIRS("Chloe") }]), who);
      assert.equal(w.recordOf("chloe", W3.caseStudy).caseId, W3.crash, who);
      // Kofi's case still saves, and never trips over Chloe's.
      assert.equal((await w.saveDraw(who, "w03", [["kofi", W3.caseStudy, W3.surprise]])).status, 200, who);
    }

    // This week's work: Chloe's pick and case blank for Group B's facilitators.
    for (const who of ["rahul", "farah"]) {
      const words = await table(who);
      assert.doesNotMatch(words, /Markets|The crash nobody priced/, who);
    }
    // Her own week page names nobody to ask about that case: Group B's facilitators cannot change it.
    assert.deepEqual((await w.overview("chloe")).body.askToSwapPicked, []);
  });

  test("the lead and an admin read Chloe's pick and give its case, as before", async () => {
    for (const who of ["claudia", "zach"]) {
      w.reset();
      pickedWeek();
      chloeFacilitatesA();
      assert.equal((await w.pick("chloe", W3.given, "w03", W3.markets)).status, 200);
      const page = await w.drawPage(who);
      inOrder(page.text, ["Chloe Nguyen", "Pack", "Markets", "Their pick", "Case"]);
      assert.ok(!editorProps(page.element).hidden.includes("chloe"), who);
      const answer = await w.saveDraw(who, "w03", [["chloe", W3.caseStudy, W3.crash]]);
      assert.deepEqual([answer.status, answer.body], [200, { ok: true, saved: 1 }], who);
    }
  });

  test("while Group A is archived it staffs nobody: Chloe's pick is read like any fellow's", async () => {
    pickedWeek();
    chloeFacilitatesA({ archived: true });
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.markets)).status, 200);
    const page = await w.drawPage("rahul");
    inOrder(page.text, ["Chloe Nguyen", "Pack", "Markets", "Their pick", "Case"]);
    assert.ok(!editorProps(page.element).hidden.includes("chloe"));
    assert.equal((await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, W3.crash]])).status, 200);
    assert.ok((await w.overview("chloe")).body.askToSwapPicked.length > 0, "a fellow's case names whom to ask");
  });

  test("nobody who facilitates nothing changes: Chloe's pick is shown to Group B's facilitators", async () => {
    pickedWeek();
    assert.equal((await w.pick("chloe", W3.given, "w03", W3.markets)).status, 200);
    const page = await w.drawPage("rahul");
    inOrder(page.text, ["Chloe Nguyen", "Pack", "Markets", "Their pick", "Case"]);
    assert.deepEqual(editorProps(page.element).hidden.sort(), ["farah", "sofia"]);
    assert.equal((await w.saveDraw("rahul", "w03", [["chloe", W3.caseStudy, W3.crash]])).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 2. The guard
// ---------------------------------------------------------------------------

/** Code with its comments taken out, so a sentence about a rule never stands in for it. */
const uncommented = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const rel = (file) => relative(ROOT, file).split("\\").join("/");

/** The files that decide what a reader of a group's draw is shown of a person's pick and case. */
const SCOPE = [
  join(SRC, "lib", "courses", "packsAndCases"),
  join(SRC, "app", "api", "courses", "groups", "[groupId]", "draw"),
  join(SRC, "app", "(app)", "learn", "draw", "[groupId]"),
];
const inScope = () => [...walkSource(SRC)].filter((file) => SCOPE.some((dir) => file.startsWith(dir + "/")));

/**
 * Every call of `hidesOwnPick` in scope, by file, with how many and why. A
 * new place that keeps a pick back is added here, with its reason.
 */
const HIDES_OWN_PICK = {
  // `drawRowsFor` (what the page hands its editor) and `weekWorkOf` (This week's work, the pack and the case).
  "src/lib/courses/packsAndCases/readers.ts": 3,
  // Whether to ask who reads a facilitator's own work, and whose case the route refuses.
  "src/app/api/courses/groups/[groupId]/draw/route.ts": 2,
  // Whether to ask who reads a facilitator's own work.
  "src/app/(app)/learn/draw/[groupId]/page.tsx": 1,
};

/**
 * Every caller of `drawPeople` in the tree, with the run-wide set it hands
 * over. Each must be `facilitatingOnRunOf`'s answer.
 */
const DRAW_PEOPLE_CALLERS = {
  // `drawRosterOf`: the page's, the route's and the Overview's people, from the run's live groups.
  "src/lib/courses/packsAndCases/readers.ts": 2,
  // The group page's draw, card, pairs and This week's work.
  "src/app/(app)/learn/[runId]/group/[groupId]/page.tsx": 1,
  // The programme's week page for the lead and admins.
  "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/week/page.tsx": 1,
  // The group summary's slips tonight.
  "src/app/api/courses/groups/[groupId]/summary/route.ts": 1,
};

/** Reading a person's `facilitates` to decide what is shown: never done in scope (the caller's `gate.facilitates` is not a person's). */
const PERSON_FACILITATES = /\b(?!gate\b)\w+\??\.facilitates\b/;

describe("2. one answer to whose pick is a facilitator's own", () => {
  test("hidesOwnPick reads ownWork, and drawPeople sets ownWork from the run-wide set alone", () => {
    const readers = uncommented(readFileSync(join(SRC, "lib", "courses", "packsAndCases", "readers.ts"), "utf8"));
    assert.match(
      readers,
      /export function hidesOwnPick\(person: DrawPerson, viewer: \{ uid: string; seesOwnWork: boolean \}\): boolean \{\s*return person\.ownWork && person\.uid !== viewer\.uid && !viewer\.seesOwnWork;\s*\}/,
    );
    const drawPeople = /export function drawPeople\([\s\S]*?\n\}/.exec(readers);
    assert.ok(drawPeople, "could not find drawPeople");
    assert.match(drawPeople[0], /runFacilitators: ReadonlySet<string>,/);
    assert.match(drawPeople[0], /ownWork: facilitates \|\| runFacilitators\.has\(person\.uid\),/);
    assert.match(drawPeople[0], /facilitates: true, ownWork: true \}/);
    // The roster the page and the route read hands it the run's live groups.
    assert.match(readers, /const runFacilitators = facilitatingOnRunOf\(group, records\.groups\);/);
    assert.match(readers, /import \{ facilitatingOnRunOf \} from "@\/lib\/courses\/writtenAnswers\/access";/);
  });

  test("in scope, ownWork is read only by hidesOwnPick, a person's facilitates never decides it, and each call is registered", () => {
    const found = {};
    const files = inScope();
    assert.ok(files.length >= 5, `the scan found ${files.length} files in scope`);
    for (const file of files) {
      const code = uncommented(readFileSync(file, "utf8"));
      const name = rel(file);
      const reads = [...code.matchAll(/\.ownWork\b/g)].length;
      if (name === "src/lib/courses/packsAndCases/readers.ts") assert.equal(reads, 1, `${name} reads ownWork outside hidesOwnPick`);
      else assert.equal(reads, 0, `${name} reads ownWork for itself`);
      assert.doesNotMatch(code, PERSON_FACILITATES, `${name} decides whose pick is a facilitator's own from this group alone`);
      assert.doesNotMatch(code, /\bfacilitatesOnRun\(|\.facilitatorUids\.includes\(/, `${name} works out who facilitates for itself`);
      const calls = [...code.matchAll(/\bhidesOwnPick\(/g)].length - (/export function hidesOwnPick\(/.test(code) ? 1 : 0);
      if (calls > 0) found[name] = calls;
    }
    assert.deepEqual(found, HIDES_OWN_PICK, "a call of hidesOwnPick in scope is not registered, or a registered one has gone");
    // The scan sees what it claims to.
    for (const sample of ["person.facilitates && person.uid !== viewer.uid", "row?.facilitates", "people.some((p) => p.facilitates)"]) {
      assert.match(sample, PERSON_FACILITATES, sample);
    }
    assert.doesNotMatch("gate.facilitates || gate.isAdmin", PERSON_FACILITATES);
  });

  test("every caller of drawPeople hands it facilitatingOnRunOf", () => {
    const found = {};
    for (const file of walkSource(SRC)) {
      const code = uncommented(readFileSync(file, "utf8"));
      const calls = [...code.matchAll(/\bdrawPeople\(/g)].length - (/export function drawPeople\(/.test(code) ? 1 : 0);
      if (calls === 0) continue;
      const name = rel(file);
      found[name] = calls;
      for (const call of code.matchAll(/\bdrawPeople\(([^;]*)/g)) {
        if (/^\s*\n?\s*people: ReadonlyArray/.test(call[1])) continue;
        assert.match(call[1], /facilitatingOnRunOf\(|runFacilitators\)/, `${name}: drawPeople is not handed facilitatingOnRunOf`);
      }
    }
    assert.deepEqual(found, DRAW_PEOPLE_CALLERS, "a caller of drawPeople is not registered, or a registered one has gone");
  });
});
