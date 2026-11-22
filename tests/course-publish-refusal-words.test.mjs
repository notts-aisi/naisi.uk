/**
 * EVERY SENTENCE THAT STOPS A PRESS OF PUBLISH, AS EACH READER READS IT.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The three emails' composers (`placementRefusal`, `incubatorStartRefusal`,
 * `facilitatingRefusal`) write each sentence for an admin, who presses: what
 * is missing, what to do, then ", then publish again.". Publish's own page and
 * the older board draw them for a programme's lead and a run's track lead
 * too, who do not publish (only an admin does) and cannot open Email designs
 * or the run panel. `refusalFor` in `src/lib/courses/publishWords.ts` says
 * each to its reader.
 *
 * ## What this guards
 *
 *  1. EVERY SENTENCE, BOTH READERS. Each composer is asked every problem it
 *     knows (each missing value, each reason a run has no first session, a
 *     token the email cannot fill, every token in its subject and in a
 *     paragraph, one group and several, and a problem it does not know). An
 *     admin's sentence comes back exactly as written. The lead's never says
 *     "publish again" and never names Email designs, keeps what is missing
 *     word for word, and ends by asking an admin to publish.
 *  2. NO SENTENCE IS LEFT OUT OF THE WALK. Every string in `src` that says
 *     ", then publish again." is read from the source: each must sit in one of
 *     the three composers, and each must be one the walk in 1 produced. A new
 *     sentence that the walk does not reach, or one written anywhere else,
 *     fails here.
 *  3. BOTH VIEWS AND BOTH ROUTES SAY THEM THROUGH THE ONE HELPER.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const { loadTs } = createLoader({ stubs: new Map([["server-only", "export {};"]]) });
const words = await loadTs(join("lib", "courses", "publishWords.ts"));
const placement = await loadTs(join("lib", "courses", "placementEmail.ts"));
const facilitating = await loadTs(join("lib", "courses", "facilitatingEmail.ts"));
const incubator = await loadTs(join("lib", "courses", "incubatorStartEmail.ts"));

const AGAIN = ", then publish again.";

/** The composers, and the files that hold them: the only places a sentence that stops a press is written. */
const COMPOSERS = {
  "lib/courses/placementEmail.ts": "the people's “Your group” email (`placementRefusal`)",
  "lib/courses/facilitatingEmail.ts": "the facilitators' “You’re facilitating” email (`facilitatingRefusal`)",
  "lib/courses/incubatorStartEmail.ts": "an incubator's “Placed on an incubator” email (`incubatorStartRefusal`)",
};

// ---------------------------------------------------------------------------
// Every problem each composer knows
// ---------------------------------------------------------------------------

const NO_FIRST = ["no-start-date", "no-taught-week", "no-session-time"];
const ONE = [{ name: "Group C" }];
const SEVERAL = [{ name: "Group C" }, { name: "Group D" }];
const UNNAMED = [{ name: "" }];

/** Each composer's answers for one problem, given to one group, to several and to a group with no name. */
function asked(compose, problems, extra = {}) {
  return [ONE, SEVERAL, UNNAMED].flatMap((groups) =>
    compose(groups.map((group) => ({ ...group, problems: problems.map((p) => ({ ...p })), ...extra }))),
  );
}

function placementSentences() {
  const out = [];
  for (const why of NO_FIRST) out.push(...asked(placement.placementRefusal, [{ kind: "no-first-session" }], { noFirstSession: why }));
  out.push(...asked(placement.placementRefusal, [{ kind: "no-group-name" }]));
  out.push(...asked(placement.placementRefusal, [{ kind: "no-site-address" }]));
  out.push(...asked(placement.placementRefusal, [{ kind: "unknown-token", tokens: ["shoeSize", "hatSize"] }]));
  out.push(...asked(placement.placementRefusal, [{ kind: "unknown-token", tokens: ["shoeSize"] }]));
  for (const token of placement.PLACEMENT_TOKENS) {
    for (const where of ["subject", "paragraph"]) {
      out.push(...asked(placement.placementRefusal, [{ kind: "cannot-leave-out", tokens: [token], where }]));
    }
  }
  out.push(...asked(placement.placementRefusal, [{ kind: "nothing-it-knows" }]));
  return out;
}

/** The facilitators' and the incubator's composers share one shape of problem: a missing value, an unknown token, one that cannot be left out. */
function wholeEmailSentences(compose, tokens, missing) {
  const out = [];
  for (const token of missing) {
    if (token === "firstSession" || token === "lastSession") {
      for (const why of NO_FIRST) out.push(...asked(compose, [{ kind: "missing", token }], { noFirstSession: why }));
    } else {
      out.push(...asked(compose, [{ kind: "missing", token }]));
    }
  }
  out.push(...asked(compose, [{ kind: "unknown-token", tokens: ["shoeSize", "hatSize"] }]));
  out.push(...asked(compose, [{ kind: "unknown-token", tokens: ["shoeSize"] }]));
  for (const token of tokens) {
    for (const where of ["subject", "paragraph"]) out.push(...asked(compose, [{ kind: "cannot-leave-out", tokens: [token], where }]));
  }
  out.push(...asked(compose, [{ kind: "nothing-it-knows" }]));
  return out;
}

const SENTENCES = [
  ...new Set([
    ...placementSentences(),
    ...wholeEmailSentences(facilitating.facilitatingRefusal, facilitating.FACILITATING_TOKENS, [
      "groupName",
      "weeklySlot",
      "firstSession",
      "lastSession",
      "groupUrl",
      ...facilitating.FACILITATING_TOKENS,
    ]),
    ...wholeEmailSentences(incubator.incubatorStartRefusal, incubator.INCUBATOR_START_TOKENS, [
      "weeklySlot",
      "firstSession",
      "programmeUrl",
      ...incubator.INCUBATOR_START_TOKENS,
    ]),
  ]),
];

// ---------------------------------------------------------------------------
// 1. Every sentence, both readers
// ---------------------------------------------------------------------------

describe("1. every sentence that stops a press, for an admin and for a lead", () => {
  test("the walk reaches the sentences: each of the three composers, each kind", () => {
    const asking = SENTENCES.filter((sentence) => sentence.endsWith(AGAIN));
    assert.ok(asking.length >= 25, `only ${asking.length} sentences ask their reader to publish again`);
  });

  for (const sentence of SENTENCES) {
    test(sentence, () => {
      assert.equal(words.refusalFor(sentence, "admin"), sentence, "an admin's sentence changed");
      const lead = words.refusalFor(sentence, "lead");
      assert.doesNotMatch(lead, /publish again/, lead);
      assert.doesNotMatch(lead, /Email designs/, lead);
      if (!sentence.endsWith(AGAIN)) {
        // A sentence that asks nothing of its reader is the same for both.
        assert.equal(lead, sentence);
        assert.doesNotMatch(sentence, /Email designs/, "a sentence names Email designs and asks nothing");
        return;
      }
      assert.match(lead, /(then ask an admin to publish|then to publish)\.$/, lead);
      // What is missing is said word for word: only what to do changes.
      const body = sentence.slice(0, -AGAIN.length);
      const problem = body.slice(0, body.lastIndexOf(". ") + 1);
      assert.ok(problem.length > 0, "a sentence with no problem before its instruction");
      assert.ok(lead.startsWith(`${problem} `), lead);
    });
  }

  test("the lead's forms, each exactly", () => {
    const lead = (sentence) => words.refusalFor(sentence, "lead");
    assert.equal(
      lead("Group C has no session time, so its people cannot be told when they first meet. Set its day and time, then publish again."),
      "Group C has no session time, so its people cannot be told when they first meet. Set its day and time, then ask an admin to publish.",
    );
    assert.equal(
      lead("This run has no start date, so nobody can be told when their first session is. Set the start date on the run, then publish again."),
      "This run has no start date, so nobody can be told when their first session is. Ask an admin to set the start date on the run, then to publish.",
    );
    assert.equal(
      lead("This run’s plan has no taught week, so there is no first session to tell anybody about. Add a week to the run’s plan, then publish again."),
      "This run’s plan has no taught week, so there is no first session to tell anybody about. Ask an admin to add a week to the run’s plan, then to publish.",
    );
    assert.equal(
      lead("The “Your group” email uses {shoeSize}, which this email cannot fill. Correct its wording in Email designs, then publish again."),
      "The “Your group” email uses {shoeSize}, which this email cannot fill. Ask an admin to change the email’s wording, then to publish.",
    );
    assert.equal(
      lead(
        "Group C has no room or meeting link, and the “You’re facilitating” email uses {where} in its subject, where it cannot be left out. Set its room, or take {where} out of the subject in Email designs, then publish again.",
      ),
      "Group C has no room or meeting link, and the “You’re facilitating” email uses {where} in its subject, where it cannot be left out. Set its room, or ask an admin to change the email’s wording, then ask an admin to publish.",
    );
  });
});

// ---------------------------------------------------------------------------
// 2. No sentence is left out of the walk
// ---------------------------------------------------------------------------

/** Every .ts and .tsx file under `src`, as a path from `src`. */
function sourceFiles(dir = SRC) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [relative(SRC, path).split("\\").join("/")] : [];
  });
}

/** Each string in a file whose words say ", then publish again.", as a pattern its sentences match (`${…}` matching anything). */
function againLiterals(file) {
  const text = readFileSync(join(SRC, file), "utf8");
  if (!text.includes("publish again")) return [];
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found = [];
  const escape = (part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const visit = (node) => {
    let parts = null;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) parts = [node.text];
    else if (ts.isTemplateExpression(node)) parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
    if (parts && parts.join("").includes(AGAIN.slice(0, -1))) {
      found.push({ line: source.getLineAndCharacterOfPosition(node.getStart()).line + 1, parts, pattern: new RegExp(`${parts.map(escape).join("[\\s\\S]*?")}$`) });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("2. no sentence that stops a press is written where the walk does not reach it", () => {
  const files = sourceFiles();
  // The helper's own constant, which it matches the end of each sentence on,
  // is the one other place the words are written.
  const HELPER = "lib/courses/publishWords.ts";
  const writing = files.map((file) => [file, againLiterals(file)]).filter(([file, found]) => found.length > 0 && file !== HELPER);

  test("the helper holds the words once, as what it matches, and writes no sentence of its own", () => {
    assert.deepEqual(againLiterals(HELPER).map((literal) => literal.parts.join("")), [AGAIN]);
  });

  test("every one sits in one of the three composers, and each composer still writes some", () => {
    assert.deepEqual(
      writing.map(([file]) => file).sort(),
      Object.keys(COMPOSERS).sort(),
      "a sentence asking to publish again is written outside the composers (add it to them, or say why here)",
    );
  });

  test("every one is a sentence the walk produced, so every one is said to a lead", () => {
    const missed = [];
    for (const [file, found] of writing) {
      for (const literal of found) {
        // A part that ends mid-sentence (", then publish again" is completed by
        // a later part of the same template) is matched as the whole template.
        if (!SENTENCES.some((sentence) => literal.pattern.test(sentence))) missed.push(`${file}:${literal.line} ${literal.parts.join("…")}`);
      }
    }
    assert.deepEqual(missed, [], "the walk in section 1 does not reach these: teach it the problem that writes them");
  });
});

// ---------------------------------------------------------------------------
// 3. Both views and both routes, through the one helper
// ---------------------------------------------------------------------------

describe("3. both views and both routes say them through the one helper", () => {
  const read = (path) => readFileSync(join(SRC, path), "utf8");

  test("Publish's own page and the older board's Publish area draw them for their reader", () => {
    assert.match(read("features/applications/groups/PublishGroups.tsx"), /refusalsFor\(preview\.refusals, admin \? "admin" : "lead"\)\.map\(/);
    assert.match(read("features/courses/AllocationPublish.tsx"), /refusalsFor\(summary\.refusals, reader\)\.map\(/);
    for (const file of ["features/applications/groups/PublishGroups.tsx", "features/courses/AllocationPublish.tsx"]) {
      assert.doesNotMatch(read(file), /(preview|summary)\.refusals\.map\(/, `${file} draws a refusal as written`);
    }
  });

  test("the two routes, which only an admin passes, answer an admin's", () => {
    for (const file of ["app/api/courses/runs/[runId]/allocation/publish/route.ts", "app/api/courses/runs/[runId]/allocation/publish/test/route.ts"]) {
      const code = read(file);
      assert.match(code, /refusalsFor\(plan\.refusals, "admin"\)/, file);
      assert.doesNotMatch(code, /\.\.\.plan\.refusals\]/, `${file} answers a refusal as written`);
    }
  });
});
