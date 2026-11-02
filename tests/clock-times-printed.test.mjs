/**
 * A time of day is printed in the house's clock, never as the stored "18:00".
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * House style writes a time as "6pm" or "1:30pm", and a weekly slot as
 * "Mondays 6pm to 8pm", never with a dash. A group's session stores its start
 * as a 24-hour wall clock (`startTimeLocal`, "18:00"), which is what a form
 * edits and a sort compares, and it reaches a page, an email or a notice only
 * through `clockWords`, or `slotRangeWords`, which uses it
 * (`src/lib/courses/sessionChange/words.ts`). The class this guards is the
 * stored value printed straight: Circles' person panel said "Wed 13:00" beside
 * rings that said "Wed 1pm", and eight more places printed a raw 24-hour time,
 * some with an en dash.
 *
 * ## How it is held
 *
 * THE TREE. Every `.ts` and `.tsx` file under `src` is read with the
 * compiler's own parser, and every place `startTimeLocal` or `endTimeLocal`
 * is put into text STRAIGHT is found: an interpolation in a template literal,
 * a child of a JSX element, a `+` that joins it to other text, or the value of
 * a JSX attribute somebody reads (`title`, `aria-label`, `alt`, `placeholder`,
 * `label`). Straight means the value itself: a name, a property read
 * (`group.session.startTimeLocal`, optional or not), or one of those behind
 * parentheses, a cast, a `!`, `??`, `||`, `&&` or a `? :`. A value handed to a
 * function first is not straight: that function is the formatter.
 *
 * Each hit is gone or listed in `ALLOWED`: the file, how the value is put and
 * the expression, how many times, and why it is no printed time (a sort key,
 * an id, a label stored and compared byte for byte, what a model is told).
 * Both directions: a hit nobody listed fails, and an entry the tree no longer
 * has fails too, so the list cannot outlive what it excuses.
 *
 * THE FORMATTER is executed below, as a table of stored times and what each
 * prints, and so is the scanner, on synthetic sources and near misses, so a
 * scanner that had quietly stopped matching fails rather than passes.
 *
 * THE STORED LABELS. Four entries in `ALLOWED` make a session's label in its
 * stored form ("Tuesdays 18:00" then the range mark and "19:30"), because an
 * application keeps the labels its applicant ticked and Publish compares them
 * byte for byte, so that form never moves. A person reads one only through
 * `sessionLabelWords` (src/lib/courses/outsideTheirTimes.ts), which says it as
 * `slotRangeWords` says the slot it was made from. That is executed below
 * against the stored form, and the screens that print a label are read with
 * the same scanner for one printed as it is stored.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { walkSource } from "./lib/functionScan.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const FIELDS = new Set(["startTimeLocal", "endTimeLocal"]);
/** JSX attributes whose value somebody reads, on screen or aloud. */
const READ_ATTRIBUTES = new Set(["title", "aria-label", "alt", "placeholder", "label"]);

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------

/**
 * The names a stored value goes by, as a variable and as a property. A stored
 * time goes by the two field names either way; a stored label, below, by the
 * names each screen gives one.
 */
const TIME_NAMES = { identifiers: FIELDS, properties: FIELDS };

/** Whether an expression IS one of the stored values `names` names, not something made from one. */
function isStraight(node, names = TIME_NAMES) {
  if (ts.isIdentifier(node)) return names.identifiers.has(node.text);
  if (ts.isPropertyAccessExpression(node)) return names.properties.has(node.name.text);
  if (ts.isElementAccessExpression(node)) {
    return ts.isStringLiteralLike(node.argumentExpression) && names.properties.has(node.argumentExpression.text);
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    (ts.isSatisfiesExpression && ts.isSatisfiesExpression(node))
  ) {
    return isStraight(node.expression, names);
  }
  if (ts.isConditionalExpression(node)) return isStraight(node.whenTrue, names) || isStraight(node.whenFalse, names);
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind;
    if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
      return isStraight(node.left, names) || isStraight(node.right, names);
    }
    if (op === ts.SyntaxKind.AmpersandAmpersandToken) return isStraight(node.right, names);
  }
  return false;
}

/** Whether a `+` operand is text: a string, a template, or another `+` with text in it. */
function isText(node) {
  if (ts.isStringLiteralLike(node) || ts.isTemplateExpression(node)) return true;
  if (ts.isParenthesizedExpression(node)) return isText(node.expression);
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken && (isText(node.left) || isText(node.right));
}

/**
 * Every place in one file's source that puts a stored time (or, given other
 * `names`, another stored value) into text straight, as `{ kind, expr, line }`.
 * `kind` is "template", "jsx", "concatenation" or "attribute"; `expr` is the
 * expression as written.
 */
function rawTimesIn(source, name = "file.tsx", names = TIME_NAMES) {
  const kindOfScript = name.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, kindOfScript);
  const found = [];
  const hit = (kind, node) =>
    found.push({ kind, expr: node.getText(file), line: file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1 });
  const visit = (node) => {
    if (ts.isTemplateSpan(node) && isStraight(node.expression, names)) hit("template", node.expression);
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      isStraight(node.expression, names)
    ) {
      hit("jsx", node.expression);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      if (isStraight(node.left, names) && isText(node.right)) hit("concatenation", node.left);
      if (isStraight(node.right, names) && isText(node.left)) hit("concatenation", node.right);
    }
    if (
      ts.isJsxAttribute(node) &&
      READ_ATTRIBUTES.has(node.name.getText(file)) &&
      node.initializer &&
      ts.isJsxExpression(node.initializer) &&
      node.initializer.expression &&
      isStraight(node.initializer.expression, names)
    ) {
      hit("attribute", node.initializer.expression);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

// ---------------------------------------------------------------------------
// What is not a printed time
// ---------------------------------------------------------------------------

/**
 * Each place the tree puts a stored time into text and nobody reads it as a
 * time: keyed by file (from `src`), how, and the expression, with how many
 * times and why.
 */
const ALLOWED = [
  {
    file: "app/(app)/dashboard/HomeFacilitator.tsx",
    kind: "template",
    expr: "next.startTimeLocal",
    count: 1,
    why: "a sort key: the next session's date key and its 24-hour start, compared as text so the soonest group sorts first, and never shown",
  },
  {
    file: "features/applications/circles/PersonPanel.tsx",
    kind: "template",
    expr: "start.session.startTimeLocal",
    count: 1,
    why: "the React key of one start time in a list, made of its day and its stored start: an id, never shown",
  },
  {
    file: "lib/applications/arrange/options.ts",
    kind: "template",
    expr: "group.session.startTimeLocal",
    count: 2,
    why: "the identity of a group and of an arrangement option (a day, a stored start and the people in it), compared to tell two apart, and never shown",
  },
  {
    file: "lib/applications/arrange/advice.ts",
    kind: "template",
    expr: "group.session.startTimeLocal",
    count: 2,
    why:
      "the arrangement advice's message to the model about each group, in the stored 24-hour clock the model reads without doubt; " +
      "drawn on no screen, and tests/applications-arrange-advice.test.mjs holds its lines",
  },
  {
    file: "app/api/courses/runs/[runId]/apply/route.ts",
    kind: "template",
    expr: "session.startTimeLocal",
    count: 2,
    why:
      "the availability label an applicant ticks, stored on their application as this label and compared with a group's label " +
      "byte for byte (`placedOutsideTheirTimes` in src/lib/courses/outsideTheirTimes.ts): a stored format, which moves only with the labels already stored. " +
      "Where it is printed, it is printed through `sessionLabelWords` (below)",
  },
  {
    file: "features/courses/fetchCourses.ts",
    kind: "template",
    expr: "session.startTimeLocal",
    count: 1,
    why:
      "the apply page's chip VALUE, posted back as the value the apply route matches and stores: the same stored label, a form value. " +
      "The chip prints it through `sessionLabelWords`",
  },
  {
    file: "app/api/courses/runs/[runId]/applications/route.ts",
    kind: "template",
    expr: "session.startTimeLocal",
    count: 1,
    why:
      "the admissions queue's group label, sent in the stored form so it stays byte for byte the labels applicants ticked, " +
      "read beside it on the same card; the queue prints both through `sessionLabelWords`",
  },
  {
    file: "lib/courses/outsideTheirTimes.ts",
    kind: "template",
    expr: "session.startTimeLocal",
    count: 1,
    why:
      "`sessionLabelOf`, a group's label in the stored form, compared byte for byte with the labels somebody ticked; " +
      "a person reads it only through `sessionLabelWords`, beside it",
  },
];

const keyOf = (entry) => `${entry.file} ${entry.kind} ${entry.expr}`;

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

describe("no stored time of day is printed straight", () => {
  const found = new Map();
  let files = 0;
  for (const full of walkSource(SRC)) {
    files += 1;
    const file = relative(SRC, full).split(sep).join("/");
    for (const hit of rawTimesIn(readFileSync(full, "utf8"), full)) {
      const key = `${file} ${hit.kind} ${hit.expr}`;
      const at = found.get(key) ?? { file, kind: hit.kind, expr: hit.expr, lines: [] };
      at.lines.push(hit.line);
      found.set(key, at);
    }
  }

  test("the walk read the tree", () => {
    assert.ok(files > 1000, `read ${files} files: the walk reached too little of the tree`);
  });

  test("every place that puts one into text is listed, as often as it does", () => {
    const listed = new Map(ALLOWED.map((entry) => [keyOf(entry), entry]));
    const unlisted = [...found.values()]
      .filter((at) => !listed.has(`${at.file} ${at.kind} ${at.expr}`))
      .map((at) => `${at.file}:${at.lines.join(",")} (${at.kind}) ${at.expr}`);
    assert.deepEqual(
      unlisted,
      [],
      "A stored time is printed straight. Say it in the house's clock with `clockWords` or `slotRangeWords` " +
        "(src/lib/courses/sessionChange/words.ts), or, if nobody reads it as a time, list it in ALLOWED with why.",
    );
    for (const entry of ALLOWED) {
      const at = found.get(keyOf(entry));
      if (!at) continue;
      assert.equal(at.lines.length, entry.count, `${keyOf(entry)} is put into text ${at.lines.length} times, not ${entry.count}`);
    }
  });

  test("every listed place is still in the tree, with a reason", () => {
    assert.deepEqual(
      ALLOWED.filter((entry) => !found.has(keyOf(entry))).map(keyOf),
      [],
      "a listed place no longer puts a stored time into text: take its entry out",
    );
    for (const entry of ALLOWED) {
      assert.ok(["template", "jsx", "concatenation", "attribute"].includes(entry.kind), `${keyOf(entry)}: no such kind`);
      assert.ok(typeof entry.why === "string" && entry.why.length >= 60, `${keyOf(entry)}: a reason is missing or too short to be one`);
      assert.ok(Number.isInteger(entry.count) && entry.count > 0, `${keyOf(entry)}: says how many times`);
    }
    assert.equal(new Set(ALLOWED.map(keyOf)).size, ALLOWED.length, "an entry is listed twice");
  });
});

describe("the scanner reads what it guards", () => {
  const kinds = (source, name) => rawTimesIn(source, name).map((hit) => `${hit.kind} ${hit.expr}`);

  test("each way of printing one straight", () => {
    assert.deepEqual(kinds("const a = `${s.startTimeLocal}`;", "a.ts"), ["template s.startTimeLocal"]);
    assert.deepEqual(kinds("const a = `Next: ${when}, ${next?.session?.startTimeLocal ?? \"\"}`;", "a.ts"), [
      'template next?.session?.startTimeLocal ?? ""',
    ]);
    assert.deepEqual(kinds("const a = `${(s.startTimeLocal as string)}`;", "a.ts"), ["template (s.startTimeLocal as string)"]);
    assert.deepEqual(kinds("const a = `${on ? s.startTimeLocal : \"\"}`;", "a.ts"), ['template on ? s.startTimeLocal : ""']);
    assert.deepEqual(kinds("const a = `${endTimeLocal}`;", "a.ts"), ["template endTimeLocal"]);
    assert.deepEqual(kinds("const a = `${s[\"startTimeLocal\"]}`;", "a.ts"), ['template s["startTimeLocal"]']);
    assert.deepEqual(kinds("const a = <p>Meets at {value.startTimeLocal}</p>;", "a.tsx"), ["jsx value.startTimeLocal"]);
    assert.deepEqual(kinds("const a = <>{on && s.startTimeLocal}</>;", "a.tsx"), ["jsx on && s.startTimeLocal"]);
    assert.deepEqual(kinds('const a = "Starts " + s.startTimeLocal;', "a.ts"), ["concatenation s.startTimeLocal"]);
    assert.deepEqual(kinds('const a = s.startTimeLocal + " London";', "a.ts"), ["concatenation s.startTimeLocal"]);
    assert.deepEqual(kinds("const a = <b title={s.startTimeLocal} aria-label={s.endTimeLocal} />;", "a.tsx"), [
      "attribute s.startTimeLocal",
      "attribute s.endTimeLocal",
    ]);
  });

  test("and the near misses it must leave alone", () => {
    for (const [source, name] of [
      ["const a = `${clockWords(s.startTimeLocal)}`;", "a.ts"],
      ["const a = `${slotRangeWords(s.weekday, s.startTimeLocal, s.durationMinutes)}`;", "a.ts"],
      ["const a = <p>{clockWords(value.startTimeLocal)}</p>;", "a.tsx"],
      ["const a = <TimeField value={value.startTimeLocal} />;", "a.tsx"],
      ["const a = <Row key={s.startTimeLocal} />;", "a.tsx"],
      ["const a = s.startTimeLocal < t.startTimeLocal;", "a.ts"],
      ["const minutes = s.startTimeLocal.split(\":\").map(Number);", "a.ts"],
      ["const start = s.startTimeLocal;", "a.ts"],
      ["const a = { startTimeLocal: s.startTimeLocal };", "a.ts"],
      ["// `${s.startTimeLocal}` in a comment\nconst a = 1;", "a.ts"],
      ['const a = "s.startTimeLocal";', "a.ts"],
      ["const a = `${s.startTime}`;", "a.ts"],
      ["const a = minutes + s.durationMinutes;", "a.ts"],
    ]) {
      assert.deepEqual(rawTimesIn(source, name), [], source);
    }
  });

  test("the line it reports is the line the value is on", () => {
    assert.deepEqual(rawTimesIn("const a = 1;\nconst b = `x ${s.startTimeLocal}`;", "a.ts").map((hit) => hit.line), [2]);
  });
});

// ---------------------------------------------------------------------------
// The formatter
// ---------------------------------------------------------------------------

const { loadTs } = createLoader({ stubs: new Map() });
const words = await loadTs(join("lib", "courses", "sessionChange", "words.ts"));

describe("the house's clock", () => {
  test("clockWords: a stored time as the site writes one, and nothing for anything else", () => {
    for (const [stored, said] of [
      ["18:00", "6pm"],
      ["13:30", "1:30pm"],
      ["09:05", "9:05am"],
      ["00:00", "12am"],
      ["12:00", "12pm"],
      ["12:45", "12:45pm"],
      ["23:59", "11:59pm"],
    ]) {
      assert.equal(words.clockWords(stored), said, stored);
    }
    for (const nonsense of ["", "6pm", "24:00", "18:60", "1800", "18:0", "8:00"]) {
      assert.equal(words.clockWords(nonsense), "", nonsense);
    }
  });

  test("slotRangeWords: a weekly slot with when it ends, never a dash", () => {
    assert.equal(words.slotRangeWords(1, "18:00", 120), "Mondays 6pm to 8pm");
    assert.equal(words.slotRangeWords(2, "18:00", 90), "Tuesdays 6pm to 7:30pm");
    assert.equal(words.slotRangeWords(3, "13:00", 60), "Wednesdays 1pm to 2pm");
    assert.equal(words.slotRangeWords(0, "23:30", 60), "Sundays 11:30pm to 12:30am", "past midnight on the wall clock");
    // With no length, the start alone; with no day or time, nothing.
    assert.equal(words.slotRangeWords(4, "18:00", 0), "Thursdays 6pm");
    assert.equal(words.slotRangeWords(4, "18:00", Number.NaN), "Thursdays 6pm");
    assert.equal(words.slotRangeWords(7, "18:00", 60), "");
    assert.equal(words.slotRangeWords(1, "", 60), "");
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      for (const minutes of [30, 60, 90, 120, 150]) {
        const said = words.slotRangeWords(weekday, "18:15", minutes);
        assert.doesNotMatch(said, /[\u2013\u2014]|\b\d{2}:\d{2}\b/, said);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The stored labels
// ---------------------------------------------------------------------------

const labels = await loadTs(join("lib", "courses", "outsideTheirTimes.ts"));

/** The stored form's range mark, by its code point: it belongs to the stored labels, never to house words. */
const RANGE = "\u2013";

/**
 * Every screen that prints a stored session label, with the names it gives
 * one: the variable a chip or a slot is drawn from, and the property a group's
 * label or an application's line is read from. Each prints a label through the
 * words named here, and never as it is stored.
 */
const LABEL_SCREENS = [
  {
    file: "features/courses/ApplyForm.tsx",
    names: { identifiers: new Set(["label"]), properties: new Set(["sessionLabel", "availability"]) },
    words: ["sessionLabelWords", "availabilityLineWords"],
    why: "the run's own apply page: each chip, and the line of times on an application already sent",
  },
  {
    file: "features/courses/AdmissionsQueue.tsx",
    names: { identifiers: new Set(["slot"]), properties: new Set(["sessionLabel", "availability"]) },
    words: ["sessionLabelWords"],
    why: "the admissions queue: the times an applicant ticked, and each group in the preferred group menu",
  },
  {
    file: "features/courses/AllocationBoard.tsx",
    names: { identifiers: new Set(["slot"]), properties: new Set(["sessionLabel", "availability"]) },
    words: ["sessionLabelWords"],
    why: "the allocation board: a card's times, its Can't make chip, and each column's session",
  },
];

describe("a stored session label: stored as it always was, printed in the house's clock", () => {
  test("the stored form has not moved, byte for byte", () => {
    assert.equal(labels.sessionLabelOf({ weekday: 2, startTimeLocal: "18:00", durationMinutes: 90 }), `Tuesdays 18:00${RANGE}19:30`);
    assert.equal(labels.sessionLabelOf({ weekday: 0, startTimeLocal: "23:30", durationMinutes: 60 }), `Sundays 23:30${RANGE}00:30`);
    assert.equal(labels.sessionLabelOf({ weekday: 4, startTimeLocal: "10:00", durationMinutes: 0 }), "Thursdays 10:00");
    assert.equal(labels.sessionLabelOf({ weekday: 2, startTimeLocal: "", durationMinutes: 90 }), "");
  });

  test("a label prints as slotRangeWords says the slot it was made from, never with a dash or a 24-hour time", () => {
    assert.equal(labels.sessionLabelWords(`Tuesdays 18:00${RANGE}19:30`), "Tuesdays 6pm to 7:30pm");
    assert.equal(labels.sessionLabelWords(`Sundays 23:30${RANGE}00:30`), "Sundays 11:30pm to 12:30am");
    assert.equal(labels.sessionLabelWords("Thursdays 10:00"), "Thursdays 10am");
    for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
      for (const startTimeLocal of ["00:00", "09:05", "12:00", "13:30", "18:00", "23:30"]) {
        for (const durationMinutes of [0, 30, 60, 90, 120, 1440]) {
          const stored = labels.sessionLabelOf({ weekday, startTimeLocal, durationMinutes });
          const printed = labels.sessionLabelWords(stored);
          assert.equal(printed, words.slotRangeWords(weekday, startTimeLocal, durationMinutes), stored);
          assert.doesNotMatch(printed, /[\u2013\u2014]|\b\d{2}:\d{2}\b/, printed);
        }
      }
    }
  });

  test("anything that is not a label in the stored form prints as it is", () => {
    for (const text of [
      "",
      "Mondays after six",
      `Tuesday 18:00${RANGE}19:30`,
      "Tuesdays 18:00 - 19:30",
      "Tuesdays 24:00",
      "tuesdays 18:00",
      " Tuesdays 18:00",
    ]) {
      assert.equal(labels.sessionLabelWords(text), text, JSON.stringify(text));
    }
  });

  test("an application's stored line prints each label in the house's clock, and the rest as it is", () => {
    assert.equal(
      labels.availabilityLineWords(`Tuesdays 18:00${RANGE}19:30, Thursdays 10:00${RANGE}11:30`),
      "Tuesdays 6pm to 7:30pm, Thursdays 10am to 11:30am",
    );
    assert.equal(labels.availabilityLineWords(`Mondays 18:00${RANGE}20:00`), "Mondays 6pm to 8pm");
    assert.equal(labels.availabilityLineWords("Weekday evenings, mostly"), "Weekday evenings, mostly");
    assert.equal(labels.availabilityLineWords(""), "");
  });

  test("each screen that prints one prints it through those words, and never as it is stored", () => {
    for (const screen of LABEL_SCREENS) {
      const source = readFileSync(join(SRC, screen.file), "utf8");
      for (const word of screen.words) {
        assert.match(
          source,
          new RegExp(`import \\{[^}]*\\b${word}\\b[^}]*\\} from "@/lib/courses/outsideTheirTimes";`),
          `${screen.file} no longer imports ${word}`,
        );
        assert.match(source, new RegExp(`\\b${word}\\(`), `${screen.file} no longer prints through ${word}`);
      }
      assert.deepEqual(
        rawTimesIn(source, screen.file, screen.names).map((hit) => `${screen.file}:${hit.line} (${hit.kind}) ${hit.expr}`),
        [],
        `${screen.why}: a stored label is printed as it is stored. Print it through ${screen.words.join(" or ")}.`,
      );
      assert.ok(screen.why.length >= 40, `${screen.file}: says what it prints`);
    }
  });

  test("and the check finds a label printed as it is stored", () => {
    const names = LABEL_SCREENS[2].names;
    const found = (source, name) => rawTimesIn(source, name, names).map((hit) => `${hit.kind} ${hit.expr}`);
    assert.deepEqual(found("const a = <li>{slot}</li>;", "a.tsx"), ["jsx slot"]);
    assert.deepEqual(found('const a = <p>{group.sessionLabel || "No session time set"}</p>;', "a.tsx"), [
      'jsx group.sessionLabel || "No session time set"',
    ]);
    assert.deepEqual(found("const a = `${g.name} \u00b7 ${g.sessionLabel}`;", "a.ts"), ["template g.sessionLabel"]);
    assert.deepEqual(found("const a = <dd>{application.availability}</dd>;", "a.tsx"), ["jsx application.availability"]);
    // Printed through the words, compared, or used as a key: none of them is a label printed as it is stored.
    assert.deepEqual(found("const a = <li>{sessionLabelWords(slot)}</li>;", "a.tsx"), []);
    assert.deepEqual(found("const a = <li key={slot} className={slot === g.sessionLabel ? ok : no} />;", "a.tsx"), []);
    assert.deepEqual(found("const a = <p>{row.availability.length > 0 ? <b /> : null}</p>;", "a.tsx"), []);
  });
});
