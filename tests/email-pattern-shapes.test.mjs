/**
 * Every regular expression that reads an email's wording, or what somebody
 * typed into a group, takes time in step with the length of the text.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials,
 * and no clock: nothing here is timed).
 *
 * ## What this guards
 *
 * The placement email is written from wording an admin saved and from values
 * people typed (`src/lib/courses/placementEmail.ts`), and a group's room is
 * read by `src/lib/courses/followable.ts` before either email prints it. A
 * pattern over text like that has to be linear whatever the text holds. The
 * shape that is not is easy to write and reads as harmless:
 *
 *     a tag is "<", then anything but ">", then ">"
 *
 * On a long run of `<` with no `>` in it, the search tries that from every
 * `<`, and every try reads to the end of the text: the work grows with the
 * square of the length. The repetition can match the very character the
 * pattern begins with, so each character it reads is also a place to begin
 * again, and there is more to match after it, so each try can fail late.
 *
 * Three things have to hold:
 *
 *  1. THE LIST IS THE TREE. Every regular expression literal in the two
 *     files is read out of the source and has to be on `PATTERNS`, in order,
 *     with what it reads and one line saying why it is linear. A pattern
 *     that is added, changed or removed fails here until its line is
 *     written. Neither file may build a pattern at run time, because one
 *     that is built cannot be read here.
 *  2. THE SHAPE RULE. Each pattern is parsed, and it may not have a
 *     repetition with no upper count that can match a character the pattern
 *     can begin with, where something still has to match after it. Nor a
 *     repetition with no upper count inside another one. A pattern the rule
 *     finds is allowed only when its entry says `argued: true`, and its line
 *     is then the argument: there is one, and the rule finds exactly that one.
 *  3. THE RULE FINDS WHAT IT IS FOR. It is run over the well-known slow
 *     shapes, the tag above among them, and has to find each, and over
 *     linear ones it has to pass. It refuses a pattern it cannot read, so
 *     nothing is passed unread.
 *
 * ## What it cannot see
 *
 * It reads patterns, so it cannot see a loop that reads the text again and
 * again. `tests/email-unfilled-tokens.test.mjs` runs the composer over long
 * hostile wording for that. It covers the two files named below and no
 * others: a new module that runs a pattern over an email's wording, or over
 * what somebody typed for one, is added to `PATTERNS`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// 1. Every pattern in the two files, and why it is linear
// ---------------------------------------------------------------------------

const BLOCK_TAG =
  "/(<\\/?(?:p|li|ul|ol|blockquote|h[1-6]|div|pre|hr|table|thead|tbody|tfoot|tr|td|th|dl|dt|dd|section|article|header|footer|figure|figcaption)\\b[^<>]*>)/i";

/**
 * EVERY REGULAR EXPRESSION LITERAL IN EACH FILE, in the order the source has
 * them. `reads` is the text it is run over, and `why` is the one line on why
 * it cannot take more than time in step with that text.
 */
const PATTERNS = {
  "src/lib/courses/placementEmail.ts": [
    {
      pattern: "/[&<>\"']/g",
      reads: "a typed value, as it is escaped",
      why: "one character at a time, with nothing repeated, so each character is read once",
    },
    {
      pattern: "/\\s+/g",
      reads: "a typed value, as it is put on one line",
      why: "the run of space is the whole pattern, so nothing after it can fail and send the search back",
    },
    { pattern: "/\\{/g", reads: "a typed value", why: "one fixed character, with nothing repeated, so each character is read once" },
    { pattern: "/\\}/g", reads: "a typed value", why: "one fixed character, with nothing repeated, so each character is read once" },
    {
      pattern: "/\\{([a-zA-Z][a-zA-Z0-9_]*)\\}/g",
      reads: "the wording, for its tokens",
      why: "a try begins at a curly bracket and the name it then reads cannot hold one, so no try begins inside another",
    },
    {
      pattern: BLOCK_TAG,
      reads: "a rich-text block, as it is split into units",
      why: "a try begins at `<` and what it reads up to `>` cannot hold another `<`, so each try stops where the next begins",
    },
    {
      pattern: "/^<\\/?([a-z0-9]+)/i",
      reads: "one block tag, for its name",
      why: "tied to the start of a tag already found, so there is one try, and nothing follows the name it reads",
    },
    { pattern: "/<(?:img|hr)\\b/i", reads: "a written block", why: "fixed words after `<`, with nothing repeated, so each character is read once" },
    {
      pattern: "/<[^<>]*>/g",
      reads: "a written block, with its tags taken away",
      why: "a try begins at `<` and what it reads up to `>` cannot hold another `<`, so each try stops where the next begins",
    },
    {
      pattern: "/&nbsp;|&#160;|&#xa0;/gi",
      reads: "a written block, with its tags taken away",
      why: "three fixed spellings of one character, with nothing repeated, so each character is read once",
    },
    {
      pattern: "/\\s+/g",
      reads: "the subject, as it is put on one line",
      why: "the run of space is the whole pattern, so nothing after it can fail and send the search back",
    },
  ],
  "src/lib/courses/followable.ts": [
    {
      pattern: "/\\s+/g",
      reads: "a group's room, as it is put on one line",
      why: "the run of space is the whole pattern, so nothing after it can fail and send the search back",
    },
    { pattern: "/:\\/\\//", reads: "a group's room", why: "three fixed characters, with nothing repeated, so each character is read once" },
    {
      pattern: "/\\b(?:mailto|tel|sms|callto|skype|facetime|zoommtg|msteams|webcal):/i",
      reads: "a group's room",
      why: "a fixed list of short words and a colon, with nothing repeated, so each try is a few characters long",
    },
    { pattern: "/\\bwww\\.[a-z0-9]/i", reads: "a group's room", why: "four fixed characters and one more, with nothing repeated, so each try is five characters long" },
    {
      pattern: "/[a-z0-9]\\.[a-z]{2,}(?![a-z0-9-])/i",
      reads: "a group's room",
      argued: true,
      why: "a try needs a dot straight after its first character, and the letters it goes on to read hold no dot, so no try begins inside what another has read",
    },
    {
      pattern: "/\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b/",
      reads: "a group's room",
      why: "every repetition is counted, twelve digits and three dots at most, so each try has a fixed length",
    },
    {
      pattern: "/(?:\\d[\\s().-]{0,2}){9}/",
      reads: "a group's room",
      why: "every repetition is counted, nine digits with two characters after each at most, so each try has a fixed length",
    },
  ],
};

/** Every regular expression literal in a source file, and every pattern built at run time. */
function patternsIn(path) {
  const text = readFileSync(join(REPO_ROOT, ...path.split("/")), "utf8");
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const literals = [];
  const built = [];
  const walk = (node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) literals.push(node.getText(file));
    if ((ts.isNewExpression(node) || ts.isCallExpression(node)) && node.expression.getText(file) === "RegExp") {
      built.push(node.getText(file));
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
  return { literals, built };
}

// ---------------------------------------------------------------------------
// 2. The shape rule
// ---------------------------------------------------------------------------

/** The characters a pattern is tried against: every kind these files write or could be handed. */
const PROBES = [..."aZ5 _-.<>{}:/&()\"'@+#;=,!?|^$*[]\\\n\t"];

/** A pattern, parsed into the few shapes the rule needs. It throws on anything it does not know. */
function parse(literal) {
  const close = literal.lastIndexOf("/");
  const source = literal.slice(1, close);
  const flags = literal.slice(close + 1);
  const fold = (ch) => (flags.includes("i") ? ch.toLowerCase() : ch);
  let at = 0;

  const SHORTHAND = {
    d: (ch) => /\d/.test(ch),
    w: (ch) => /\w/.test(ch),
    s: (ch) => /\s/.test(ch),
  };

  /** One escaped thing: a shorthand class, or a character written with a backslash. */
  function escaped() {
    at += 1;
    const c = source[at];
    at += 1;
    if (c in SHORTHAND) return SHORTHAND[c];
    if (c.toLowerCase() in SHORTHAND && c !== c.toLowerCase()) return (ch) => !SHORTHAND[c.toLowerCase()](ch);
    if (c === "n") return (ch) => ch === "\n";
    if (c === "t") return (ch) => ch === "\t";
    if (c === "r") return (ch) => ch === "\r";
    if (/[a-zA-Z0-9]/.test(c)) throw new Error(`the rule cannot read \\${c} in ${literal}`);
    return (ch) => ch === c;
  }

  function characterClass() {
    at += 1;
    const negated = source[at] === "^";
    if (negated) at += 1;
    const tests = [];
    while (source[at] !== "]") {
      if (at >= source.length) throw new Error(`a class is not closed in ${literal}`);
      if (source[at] === "\\") {
        tests.push(escaped());
      } else if (source[at + 1] === "-" && source[at + 2] !== "]") {
        const from = fold(source[at]);
        const to = fold(source[at + 2]);
        at += 3;
        tests.push((ch) => fold(ch) >= from && fold(ch) <= to);
      } else {
        const c = fold(source[at]);
        at += 1;
        tests.push((ch) => fold(ch) === c);
      }
    }
    at += 1;
    return { type: "char", test: (ch) => tests.some((one) => one(ch)) !== negated };
  }

  function atom() {
    const c = source[at];
    if (c === "(") {
      at += 1;
      let type = "group";
      if (source.startsWith("?:", at)) at += 2;
      else if (source.startsWith("?=", at) || source.startsWith("?!", at)) {
        type = "look";
        at += 2;
      } else if (source[at] === "?") throw new Error(`the rule cannot read a group written (${source.slice(at, at + 3)} in ${literal}`);
      const body = alternatives();
      if (source[at] !== ")") throw new Error(`a group is not closed in ${literal}`);
      at += 1;
      return { type, body };
    }
    if (c === "[") return characterClass();
    if (c === "\\") {
      if (source[at + 1] === "b" || source[at + 1] === "B") {
        at += 2;
        return { type: "edge" };
      }
      const start = at;
      const test = escaped();
      // A shorthand is folded by itself. A written character is compared as the flags say.
      const shorthand = /[dwsDWS]/.test(source[start + 1]);
      return { type: "char", test: shorthand ? test : (ch) => test(ch) || test(fold(ch)) };
    }
    if (c === "^" || c === "$") {
      at += 1;
      return { type: "edge", start: c === "^" };
    }
    at += 1;
    if (c === ".") return { type: "char", test: (ch) => flags.includes("s") || ch !== "\n" };
    return { type: "char", test: (ch) => fold(ch) === fold(c) };
  }

  function counted() {
    const body = atom();
    const c = source[at];
    let count = null;
    if (c === "*") count = [0, Infinity, 1];
    else if (c === "+") count = [1, Infinity, 1];
    else if (c === "?") count = [0, 1, 1];
    else if (c === "{") {
      const written = /^\{(\d+)(,(\d*))?\}/.exec(source.slice(at));
      if (written) count = [Number(written[1]), written[2] === undefined ? Number(written[1]) : written[3] === "" ? Infinity : Number(written[3]), written[0].length];
    }
    if (!count) return body;
    at += count[2];
    // A lazy repetition reaches as far as a greedy one.
    if (source[at] === "?") at += 1;
    return { type: "repeat", min: count[0], max: count[1], body };
  }

  function sequence() {
    const items = [];
    while (at < source.length && source[at] !== "|" && source[at] !== ")") items.push(counted());
    return { type: "seq", items };
  }

  function alternatives() {
    const options = [sequence()];
    while (source[at] === "|") {
      at += 1;
      options.push(sequence());
    }
    return { type: "alt", options };
  }

  const tree = alternatives();
  if (at !== source.length) throw new Error(`the rule stopped reading ${literal} at ${at}`);
  return { tree, flags };
}

/** The characters a shape can begin with, and whether it can match nothing at all. */
function begins(node) {
  if (node.type === "char") return { chars: new Set(PROBES.filter(node.test)), empty: false };
  if (node.type === "edge" || node.type === "look") return { chars: new Set(), empty: true };
  if (node.type === "group") return begins(node.body);
  if (node.type === "repeat") {
    const inner = begins(node.body);
    return { chars: inner.chars, empty: inner.empty || node.min === 0 };
  }
  if (node.type === "alt") {
    const all = node.options.map(begins);
    return { chars: new Set(all.flatMap((one) => [...one.chars])), empty: all.some((one) => one.empty) };
  }
  const chars = new Set();
  for (const item of node.items) {
    const one = begins(item);
    for (const ch of one.chars) chars.add(ch);
    if (!one.empty) return { chars, empty: false };
  }
  return { chars, empty: true };
}

/** Tied to the start of the text, so that there is one place to begin and not one for each character. */
function tiedToStart(node) {
  if (node.type === "alt") return node.options.every(tiedToStart);
  if (node.type === "group") return tiedToStart(node.body);
  if (node.type === "seq") return node.items.length > 0 && node.items[0].type === "edge" && node.items[0].start === true;
  return false;
}

const shown = (chars) => chars.map((ch) => JSON.stringify(ch)).join(" ");

/**
 * What the rule finds in a pattern: nothing, or each repetition with no upper
 * count that can go on reading from a place the pattern could also begin, or
 * that sits inside another.
 */
function slowShapes(literal) {
  const { tree, flags } = parse(literal);
  const start = begins(tree).chars;
  const oneBeginning = tiedToStart(tree) && !flags.includes("m");
  const found = [];
  const walk = (node, followed, insideOpen) => {
    if (node.type === "alt") node.options.forEach((option) => walk(option, followed, insideOpen));
    else if (node.type === "group" || node.type === "look") walk(node.body, followed, insideOpen);
    else if (node.type === "seq") {
      node.items.forEach((item, index) => walk(item, followed || index < node.items.length - 1, insideOpen));
    } else if (node.type === "repeat") {
      const open = node.max === Infinity;
      if (open && insideOpen) found.push("a repetition with no upper count inside another");
      const again = [...begins(node.body).chars].filter((ch) => start.has(ch));
      if (open && followed && !oneBeginning && again.length > 0) {
        found.push(`a repetition with no upper count that can match ${shown(again.slice(0, 4))}, which the pattern can begin with, and more to match after it`);
      }
      // Whatever is repeated can be followed by itself.
      walk(node.body, followed || node.max > 1, insideOpen || open);
    }
  };
  walk(tree, false, false);
  return found;
}

// ---------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------

describe("every pattern in the two files is on the list, with its line", () => {
  for (const [path, listed] of Object.entries(PATTERNS)) {
    test(`${path}: the list is the file, in order`, () => {
      const { literals, built } = patternsIn(path);
      assert.deepEqual(built, [], "a pattern built at run time cannot be read here: write it as a literal");
      assert.deepEqual(
        literals,
        listed.map((entry) => entry.pattern),
        "A pattern was added, changed or removed. Hold it to the shape rule in this file, then write its line: what it reads, and why it takes time in step with that.",
      );
    });
  }

  test("every pattern says what it reads and why it is linear, in a sentence", () => {
    for (const [path, listed] of Object.entries(PATTERNS)) {
      for (const entry of listed) {
        assert.ok(String(entry.reads).trim().length >= 10, `${path} ${entry.pattern}: what it reads is a placeholder`);
        assert.ok(String(entry.why).trim().length >= 60, `${path} ${entry.pattern}: the reason is a placeholder`);
      }
    }
  });

  test("the files are the two this guard is for, and both hold patterns", () => {
    assert.deepEqual(Object.keys(PATTERNS), ["src/lib/courses/placementEmail.ts", "src/lib/courses/followable.ts"]);
    for (const path of Object.keys(PATTERNS)) assert.ok(patternsIn(path).literals.length >= 7, path);
  });
});

describe("no pattern has the shape that reads the text again from every character", () => {
  for (const [path, listed] of Object.entries(PATTERNS)) {
    for (const [index, entry] of listed.entries()) {
      test(`${path} #${index + 1} ${entry.pattern.length > 60 ? `${entry.pattern.slice(0, 57)}...` : entry.pattern}`, () => {
        const found = slowShapes(entry.pattern);
        if (entry.argued === true) {
          assert.ok(found.length > 0, "this pattern is marked as argued, and the rule finds nothing in it: take the mark away");
        } else {
          assert.deepEqual(
            found,
            [],
            "This pattern can take time that grows with the square of the text. Give the repetition a class that cannot match what the pattern begins with, or a count. " +
              "If it is linear all the same, say why in its line and mark it `argued: true`.",
          );
        }
      });
    }
  }

  test("one pattern is argued, and its line is the argument", () => {
    const argued = Object.values(PATTERNS).flatMap((listed) => listed.filter((entry) => entry.argued === true));
    assert.deepEqual(argued.map((entry) => entry.pattern), ["/[a-z0-9]\\.[a-z]{2,}(?![a-z0-9-])/i"]);
    assert.match(argued[0].why, /needs a dot straight after its first character/);
  });
});

describe("the rule finds what it is for", () => {
  /** Shapes that grow with the square of the text, or worse. */
  const SLOW = {
    "a tag that can run past the next one": "/<[^>]*>/g",
    "a block tag that can run past the next one":
      "/(<\\/?(?:p|li|ul|ol|blockquote|h[1-6]|div|pre|hr|table|thead|tbody|tfoot|tr|td|th|dl|dt|dd|section|article|header|footer|figure|figcaption)\\b[^>]*>)/i",
    "a paragraph and everything up to its end": "/(<p\\b[^>]*>[\\s\\S]*?<\\/p>)/i",
    "a scheme read from every letter of a long word": "/[a-z][a-z0-9+.-]*:\\/\\//i",
    "space at the end of a text": "/\\s+$/",
    "space at either end of a text": "/^\\s+|\\s+$/g",
    "digits, then a letter": "/\\d+x/",
    "a word, then a dot": "/\\w+\\./",
    "anything, then a full stop": "/.*\\./",
    "a repetition inside a repetition": "/x(?:a+)+y/",
    "labels with a repetition inside each": "/(?:^|[^a-z0-9.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+[a-z]{2,}(?![a-z0-9-])/i",
  };
  /** Shapes that are linear, and that the rule has no business finding. */
  const LINEAR = {
    "a tag that stops at the next one": "/<[^<>]*>/g",
    "a run of space, and nothing after it": "/\\s+/g",
    "a token": "/\\{([a-zA-Z][a-zA-Z0-9_]*)\\}/g",
    "a name tied to the start of the text": "/^<\\/?([a-z0-9]+)/i",
    "a counted run of digits": "/(?:\\d[\\s().-]{0,2}){9}/",
    "a letter, then counted digits": "/x\\d{1,3}y/",
    "digits after a fixed letter": "/x\\d+y/",
  };

  for (const [name, pattern] of Object.entries(SLOW)) {
    test(`it finds ${name}`, () => {
      assert.ok(slowShapes(pattern).length > 0, `${pattern} was passed`);
    });
  }

  for (const [name, pattern] of Object.entries(LINEAR)) {
    test(`it passes ${name}`, () => {
      assert.deepEqual(slowShapes(pattern), []);
    });
  }

  test("it says what it found, in words", () => {
    assert.deepEqual(slowShapes("/<[^>]*>/g"), [
      'a repetition with no upper count that can match "<", which the pattern can begin with, and more to match after it',
    ]);
    assert.deepEqual(slowShapes("/x(?:a+)+y/"), ["a repetition with no upper count inside another"]);
  });

  test("it refuses a pattern it cannot read, so nothing is passed unread", () => {
    for (const unread of ["/(a)\\1/", "/\\p{L}+x/u", "/(?<=a)b+c/", "/(?<name>a)+b/", "/[a-z/", "/(ab/"]) {
      assert.throws(() => slowShapes(unread), /cannot read|not closed|stopped reading/, unread);
    }
  });

  test("every pattern on the list is one it can read", () => {
    for (const listed of Object.values(PATTERNS)) {
      for (const entry of listed) assert.doesNotThrow(() => slowShapes(entry.pattern), entry.pattern);
    }
  });
});
