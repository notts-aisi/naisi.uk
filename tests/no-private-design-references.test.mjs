/**
 * No comment, document or test reason points at design material that is not
 * in this repository (run via `npm test`, Node's built-in test runner, no
 * dependencies).
 *
 * WHY. The repository is public. Pages were drawn on design boards kept
 * elsewhere, each with a short id, and decisions were taken against a
 * numbered list of questions kept elsewhere too. A line that says "as board
 * xx-something draws it" or "(Q25)" sends a reader to material they cannot
 * open, so it tells them nothing. Say what the page is ("the facilitator's
 * group page") or what was decided ("a facilitator may hold a place on the
 * programme they facilitate").
 *
 * WHAT IT MATCHES. Shapes, never names: this file lists no board id.
 *
 *  1. A BOARD ID: a short lower-case prefix, a hyphen and words, like
 *     "ab-some-page", optionally ending "-phone". On its own that shape is
 *     also ordinary English ("in-person", "co-facilitator") and code ("en-GB",
 *     a test's "ev-b"), so it is matched only where it reads as a reference:
 *     after "board" or "boards", ending "-phone", followed by "draws", by a
 *     version ("v21") or by "option B". Where the prefix is one of the short
 *     area prefixes those ids began with (AREA below), it is also matched
 *     inside a parenthesis, before "'s", and, for the prefixes that are never
 *     English, on its own. The capitalised ids ("P-something", "S-something",
 *     "SV-something") and the numbered job ids ("job-5-07-something") are
 *     matched wherever they stand.
 *  2. A QUESTION NUMBER: "Q" and one or two digits, anywhere ("Q25", "Q32 A");
 *     a parenthesised "C" and a number ("(C29)"); "plan item 8", "clash 33",
 *     and a round's numbered item ("R3-7"). A few files use Q1 to Q3 or C1 to
 *     C9 as real ids (the survey questionnaire's items, the labels the
 *     coursework prompts give a week's questions); those are listed in
 *     REAL_IDS, file by file and token by token, each with what it is.
 *
 * WHAT IT CANNOT MATCH SAFELY. A bare id whose prefix is also an English
 * prefix or a test id's ("in-", "en-", "ev-", a one-letter one), standing on
 * its own with nothing around it that reads as a reference; and other private
 * codes that are a capital letter and a number, which collide with real ids
 * (survey items, room names, PDF font names). Those are for whoever writes the
 * comment: the rule is the same.
 *
 * Every list is checked in both directions: an entry that excuses nothing any
 * more fails, so a list cannot outlive what it was written for. The walk is
 * over every tracked file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** This file states the shapes and their samples, so it is not searched for them. */
const SELF = "tests/no-private-design-references.test.mjs";

/** Read as bytes by whatever uses them. Nothing in these is searched. */
const BINARY = /\.(?:png|jpe?g|gif|ico|webp|avif|woff2?|ttf|otf|pdf|mp4|zip)$/i;

/** Written by the package manager. */
const GENERATED = /(?:^|\/)package-lock\.json$/;

function git(args) {
  try {
    return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (err) {
    // A failed look is a failure, never a pass.
    throw new Error(
      `could not ask git (git ${args.join(" ")}): ${err.message}. This guard reads the tracked tree, so it needs a git checkout.`,
    );
  }
}

const TRACKED = git(["ls-files", "-z"]).split("\0").filter(Boolean);
const SEARCHED = TRACKED.filter((file) => !BINARY.test(file) && !GENERATED.test(file) && file !== SELF);
const TEXT = new Map(SEARCHED.map((file) => [file, readFileSync(join(REPO_ROOT, file), "utf8")]));

/** Every match of a pattern in the searched tree, with where it is. */
function find(pattern) {
  assert.ok(pattern.global, `${pattern} must be a global pattern`);
  const found = [];
  for (const [file, body] of TEXT) {
    const lines = body.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      for (const match of lines[i].matchAll(pattern)) found.push({ file, line: i + 1, text: match[0] });
    }
  }
  return found;
}

const where = (hit) => `${hit.file}:${hit.line}`;

// ---------------------------------------------------------------------------
// 1. Board ids
// ---------------------------------------------------------------------------

/** Any short prefix, a hyphen and words: the shape of a board id. */
const ANY_ID = String.raw`[a-z]{1,3}-[a-z0-9]+(?:-[a-z0-9]+)*`;
/** The short area prefixes the board ids began with. */
const AREA = String.raw`(?:wk|st|sv|en|ev|pr|pub|adm|in|j)`;
const AREA_ID = String.raw`${AREA}-[a-z0-9]+(?:-[a-z0-9]+)*`;
/** Area prefixes that are never English or a test's id, so safe on their own. */
const AREA_ALONE = String.raw`(?:wk|st|sv|pr|pub)-[a-z0-9]+(?:-[a-z0-9]+)*`;
/** Not the middle or the tail of a longer word, path, address or token. */
const START = String.raw`(?<![\w./@#:-])`;

const BOARD_IDS = {
  "an id after the word board": new RegExp(String.raw`\b[Bb]oards?\s+${ANY_ID}\b`, "g"),
  "an id ending -phone": new RegExp(String.raw`${START}${ANY_ID}-phone\b`, "g"),
  "an id that draws something": new RegExp(String.raw`${START}${ANY_ID}(?:'s)? draws?\b`, "g"),
  "an id with a version": new RegExp(String.raw`${START}${ANY_ID} v\d+\b`, "g"),
  "an id with a board's option": new RegExp(String.raw`${START}${ANY_ID},? [Oo]ption [A-D]\b`, "g"),
  "an area id in a parenthesis": new RegExp(String.raw`\(${AREA_ID}(?=[),;:]|,? and )`, "g"),
  "an area id's possessive": new RegExp(String.raw`${START}${AREA_ID}['’]s?(?![\w])`, "g"),
  "an area id on its own": new RegExp(String.raw`${START}${AREA_ALONE}(?![\w-])`, "g"),
  "a capitalised id": new RegExp(String.raw`${START}(?:P|S|SV)-[a-z][a-z0-9]*(?:-[a-z0-9]+)*\b`, "g"),
  "a numbered job id": new RegExp(String.raw`\bjob-(?:\d+-\d+|[A-Z]\d+)(?:-[a-z0-9]+)*\b`, "g"),
};

// ---------------------------------------------------------------------------
// 2. Question numbers
// ---------------------------------------------------------------------------

const NUMBERS = {
  "a question number": /\bQ\d{1,2}(?: ?[A-D](?![\w]))?(?![\w])/g,
  "a parenthesised decision code": /\(C\d{1,2}\)/g,
  "a plan item": /\bplan item \d/gi,
  "a clash number": /\bclash \d/gi,
  "a round's numbered item": /\bR\d-\d+\b/g,
};

/**
 * Files where a token of the question-number shape is a real id, with the
 * tokens each may carry. Nothing else in these files is excused.
 */
const REAL_IDS = [
  {
    why:
      "The survey questionnaire's fixed items: Q1 to Q3 are 'How it went' (`q_q1` to `q_q3`) and C1 to C9 the " +
      "items asked at the start and at the end, by the names the templates give them.",
    files: {
      "docs/surveys.md": ["Q1", "Q2", "Q3", "(C9)"],
      "scripts/e2e-fixtures/course-hub-programme-surveys.mjs": ["Q1", "Q2", "Q3", "(C1)", "(C4)"],
      "src/lib/surveys/templates.ts": ["Q1", "Q2", "Q3"],
      "src/lib/surveys/leadTab.ts": ["Q1", "Q2", "Q3"],
      "src/features/surveys/lead/LeadSurveysTab.tsx": ["Q1", "Q2", "Q3"],
      "tests/e2e/course-hub-programme-surveys.spec.mjs": ["Q1", "Q2", "Q3"],
      "tests/surveys-items.test.mjs": ["Q1", "Q3"],
      "tests/surveys-lead-tab.test.mjs": ["Q2", "(C1)", "(C4)"],
      "tests/surveys-required.test.mjs": ["Q2"],
      "tests/surveys-routes.test.mjs": ["Q3"],
    },
  },
  {
    why:
      "The labels the coursework and week review prompts give a week's questions (\"Q1\", \"Q2\"), in the prompts " +
      "themselves, in the tests that hold what comes back, and in the end-to-end harness's fake model, which reads them.",
    files: {
      "scripts/e2e/lib/fakeClaude.mjs": ["Q1"],
      "src/lib/courses/coursework/claude.ts": ["Q1", "Q2"],
      "src/lib/courses/coursework/input.ts": ["Q1"],
      "src/lib/courses/weekReview/claude.ts": ["Q1", "Q2"],
      "src/lib/courses/weekReview/input.ts": ["Q2"],
      "tests/coursework-claude.test.mjs": ["Q1", "Q7"],
      "tests/week-review.test.mjs": ["Q7"],
    },
  },
  {
    why: "Sample text a test or a comment uses: a worksheet's title (\"Q1/Q2 review\") and a week's sample questions (\"Q1?\").",
    files: {
      "src/app/api/worksheets/circulations/[circulationId]/export/route.ts": ["Q1", "Q2"],
      "tests/course-hub-week-questions.test.mjs": ["Q1", "Q2", "Q3", "Q4", "Q5"],
    },
  },
  {
    why:
      "Published privacy policies, frozen byte for byte by tests/privacy-policy.test.mjs: a policy people accepted " +
      "is never edited, comments included. The policy in force carries none.",
    files: Object.fromEntries(
      [7, 8, 9, 10, 11, 12, 13, 14].map((v) => [`src/content/legal/privacy/v${v}.tsx`, ["Q41", "Q46", "Q49 A", "Q51 B"]]),
    ),
  },
];

// ---------------------------------------------------------------------------
// The checks
// ---------------------------------------------------------------------------

test("the walk reads the tree", () => {
  assert.ok(SEARCHED.length > 1000, `only ${SEARCHED.length} files were searched; the walk is not reading the tree`);
  assert.ok(TEXT.has("src/app/layout.tsx"), "the walk did not reach src/app/layout.tsx");
  assert.ok(TEXT.has("docs/surveys.md"), "the walk did not reach docs/surveys.md");
});

test("each shape still recognises the thing it is named for, and leaves ordinary words alone", () => {
  // Made-up ids in the shape of the real ones, never a real one.
  const samples = {
    "an id after the word board": "as board xy-sample draws it",
    "an id ending -phone": "(xy-sample-phone)",
    "an id that draws something": "as xy-sample draws it",
    "an id with a version": "xy-sample v21 says",
    "an id with a board's option": "(xy-sample, option B)",
    "an area id in a parenthesis": "the page (wk-sample) and",
    "an area id's possessive": "en-sample's line",
    "an area id on its own": "the head st-sample shows",
    "a capitalised id": "since SV-sample",
    "a numbered job id": "job-9-99-sample",
    "a question number": "(Q99 B)",
    "a parenthesised decision code": "a note (C99)",
    "a plan item": "plan item 9",
    "a clash number": "clash 99",
    "a round's numbered item": "R9-9:",
  };
  const ordinary = [
    "in-person sessions",
    "an in-progress task",
    "toLocaleDateString(\"en-GB\")",
    "a co-facilitator's report",
    "the event ev-b, seeded",
    "the room C20 on Tuesday",
    "(max-width: 48rem)",
    "the AI-safety group",
    "an SU-recognised member",
  ];
  const all = { ...BOARD_IDS, ...NUMBERS };
  assert.deepEqual(Object.keys(samples).sort(), Object.keys(all).sort(), "every shape needs a sample");
  for (const [kind, pattern] of Object.entries(all)) {
    assert.ok(new RegExp(pattern.source, pattern.flags).test(samples[kind]), `the shape "${kind}" no longer matches its own sample`);
    for (const text of ordinary) {
      assert.ok(!new RegExp(pattern.source, pattern.flags).test(text), `the shape "${kind}" matches ordinary text: ${text}`);
    }
  }
});

test("no tracked file names a design board by its id", () => {
  const offenders = [];
  for (const [kind, pattern] of Object.entries(BOARD_IDS)) {
    for (const hit of find(pattern)) offenders.push(`${where(hit)} ${kind}: ${hit.text}`);
  }
  assert.deepEqual(
    offenders,
    [],
    "A design board's id means nothing to a reader of this repository: the board is not in it. " +
      "Say what the page is (\"the facilitator's group page\", \"the Weeks tab\") or what was decided.",
  );
});

test("no tracked file points at a decision by its number", () => {
  const allowed = new Map();
  for (const group of REAL_IDS) {
    assert.ok(group.why.length > 40, "a REAL_IDS group needs a reason");
    for (const [file, tokens] of Object.entries(group.files)) {
      assert.ok(!allowed.has(file), `${file} is listed twice in REAL_IDS`);
      allowed.set(file, new Map(tokens.map((token) => [token, 0])));
    }
  }
  const offenders = [];
  for (const [kind, pattern] of Object.entries(NUMBERS)) {
    for (const hit of find(pattern)) {
      const tokens = allowed.get(hit.file);
      if (tokens && tokens.has(hit.text)) tokens.set(hit.text, tokens.get(hit.text) + 1);
      else offenders.push(`${where(hit)} ${kind}: ${hit.text}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    "A number from a list kept elsewhere means nothing to a reader of this repository. Say what was decided " +
      "(\"a facilitator may hold a place on the programme they facilitate\"). If the token is a real id in the " +
      "code, list it in REAL_IDS with what it is.",
  );
  const unused = [];
  for (const [file, tokens] of allowed) {
    for (const [token, count] of tokens) if (count === 0) unused.push(`${file} ${token}`);
  }
  assert.deepEqual(unused, [], "REAL_IDS excuses a token its file no longer carries. Remove it.");
});
