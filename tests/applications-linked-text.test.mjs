/**
 * A line an author wrote can carry a link, and nothing else can make one.
 *
 * Run with `npm test` (Node's built-in runner, no dependencies).
 *
 * A question's help line is plain text. Two shapes in it are drawn as a link:
 * an address that begins `https://`, and `[words](https://address)`. Four
 * things are held here, and each fails on its own:
 *
 *  1. THE FUNCTION (`linkedParts` in `src/lib/applications/linkedText.ts`) is
 *     run against a table of hostile input: other schemes in any letter case,
 *     leading spaces and control characters, nested and unbalanced brackets,
 *     an address inside the words, quotes and angle brackets, characters that
 *     only look like the ones a link is written in, an address ending in a
 *     full stop or a bracket, an address with no site, and a very long one.
 *     Every row says exactly what comes back.
 *  2. THE COMPONENT (`src/features/applications/kit/LinkedText.tsx`) is
 *     rendered over the same table. It draws an anchor for each part the
 *     function called a link, for nothing else, and what it writes holds no
 *     element but its own.
 *  3. THE FORM draws every help line through that component: the real step is
 *     rendered with a set whose help lines are hostile.
 *  4. NOTHING ELSE UNDER THE FORM'S FOLDERS MAKES AN ADDRESS OUT OF STORED
 *     TEXT. Every `href` in those folders is read out of the source with the
 *     compiler's parser. One that is written out in full, or begins with a
 *     fixed path of this site, is what it says. Every other is listed below,
 *     file by file, with what it is built from, and the list is held both
 *     ways. One file's entry says "what an author typed": the component.
 *
 * What part 4 does not read: an address handed to the router in code, or an
 * address that leaves these folders as data for something else to draw. It
 * reads `href`, as an attribute and as a property, and the few ways markup
 * can be set as a string.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => readFileSync(join(REPO_ROOT, file), "utf8");

/** A stylesheet: every class it is asked for is its own name. */
const STYLES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const { loadTs } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    // The step's own stylesheets: every question it can draw is in its graph.
    ["./form.module.css", STYLES],
    ["./rank.module.css", STYLES],
    ["@/features/applications/kit/kit.module.css", STYLES],
  ]),
});

const FUNCTION_FILE = "src/lib/applications/linkedText.ts";
const COMPONENT_FILE = "src/features/applications/kit/LinkedText.tsx";

const linked = await loadTs(join("lib", "applications", "linkedText.ts"));
const { default: LinkedText } = await loadTs(join("features", "applications", "kit", "LinkedText.tsx"));
const { default: QuestionsStep } = await loadTs(join("features", "applications", "apply", "QuestionsStep.tsx"));
const { linkedParts, httpsHref, LINKS_HINT, MAX_LINK_ADDRESS, MAX_LINK_WORDS } = linked;

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

const T = (text) => ({ kind: "text", text });
const L = (text, href = text) => ({ kind: "link", text, href });

const A = "https://example.org/briefs";

/** Rows that stay exactly as typed: one text part, the whole of the input. */
const STAYS_TEXT = {
  "another scheme, in any letter case": [
    "http://example.org/briefs",
    "HTTP://EXAMPLE.ORG/briefs",
    "Http://example.org",
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "JAVASCRIPT:alert(document.cookie)",
    "jAvAsCrIpT:alert(1)",
    "javascript://example.org/%0aalert(1)",
    "data:text/html,<script>alert(1)</script>",
    "DATA:text/html;base64,PHNjcmlwdD4=",
    "mailto:someone@example.org",
    "MAILTO:someone@example.org",
    "vbscript:msgbox(1)",
    "ftp://example.org/briefs",
    "file:///etc/passwd",
    "tel:+441150000000",
    "//example.org/briefs",
    "/apply/autumn-2026",
    "apply/autumn-2026",
    "example.org/briefs",
    "www.example.org",
  ],
  "an https address that is part of another address": [
    "javascript:https://example.org/briefs",
    "blob:https://example.org/3f9a",
    "view-source:https://example.org/briefs",
    "xhttps://example.org/briefs",
    "nothttps://example.org/briefs",
    "redirect?to=https://example.org/briefs",
    "a/https://example.org/briefs",
  ],
  "another scheme inside the two brackets": [
    "[the briefs](http://example.org/briefs)",
    "[the briefs](javascript:alert(1))",
    "[the briefs](JAVASCRIPT:alert(1))",
    "[the briefs](javascript:https://example.org/briefs)",
    "[the briefs](data:text/html,hello)",
    "[the briefs](mailto:someone@example.org)",
    "[the briefs](//example.org/briefs)",
    "[the briefs](/apply/autumn-2026)",
    "[the briefs](example.org/briefs)",
    "[the briefs]()",
    "[the briefs](https://)",
  ],
  "a control character where the scheme should be": [
    " javascript:alert(1)",
    "\tjavascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "j\u0000avascript:alert(1)",
    "ht\ttps://example.org/briefs",
    "https:\n//example.org/briefs",
    "h\u0000ttps://example.org/briefs",
    "https://exa\tmple.org/briefs",
    "https://exa\u0000mple.org/briefs",
    // A space that takes up no room is not white space: the address does not start a word.
    "\u200bhttps://example.org/briefs",
  ],
  "a character that only looks like one a link is written in": [
    "\uff48ttps://example.org/briefs", // a full-width h
    "http\u0455://example.org/briefs", // a Cyrillic letter for the s
    "http\u017f://example.org/briefs", // a long s
    "https\uff1a//example.org/briefs", // a full-width colon
    "https:\u2215\u2215example.org/briefs", // division slashes
    "https://ex\u0430mple.org/briefs", // a Cyrillic letter in the site
    "https://example.org/p\u0430th", // and in the path
    "https://example\uff0eorg/briefs", // a full-width full stop
    "https://example\u3002org/briefs", // an ideographic full stop
    "https://example.org\u200b.elsewhere.example/briefs", // a space that takes up no room
    "https://example.org\u202e/sfeirb", // text told to run the other way
    "https://example.org/briefs\u2019s", // a curly apostrophe inside it
  ],
  "a site that is not the one it seems to name": [
    "https://example.org@elsewhere.example/briefs",
    "https://example.org:secret@elsewhere.example/briefs",
    "https://example.org%2f@elsewhere.example/briefs",
    "https://example.org\\@elsewhere.example/briefs",
    "https://elsewhere.example\\.example.org/briefs",
    "https://ex%61mple.org/briefs",
  ],
  "an address with no named site": [
    "https://",
    "https:///briefs",
    "https://?q=1",
    "https://#top",
    "https://.",
    "https://.org",
    "https://example",
    "https://example.",
    "https://example./briefs",
    "https://-example.org",
    "https://example-.org",
    "https://exa_mple.org",
    "https://a..org",
    "https://localhost/briefs",
    "https://127.0.0.1/briefs",
    "https://2130706433/briefs",
    "https://0x7f.1/briefs",
    "https://[::1]/briefs",
    "https://example.org:/briefs",
    "https://example.org:99999/briefs",
    "https://example.org:port/briefs",
    "https:/example.org/briefs",
    "https:example.org/briefs",
    "https//example.org/briefs",
  ],
};

/** Rows with a link in them: what was typed, and exactly what comes back. */
const ROWS = [
  // --- the two shapes ---
  ["nothing typed", "", []],
  ["no address", "No wrong answer.", [T("No wrong answer.")]],
  ["an address alone", A, [L(A)]],
  ["an address in a sentence", `Read the briefs first: ${A}`, [T("Read the briefs first: "), L(A)]],
  ["words alone", `[the briefs](${A})`, [L("the briefs", A)]],
  [
    "words in a sentence",
    `Read [the briefs](${A}) before you rank.`,
    [T("Read "), L("the briefs", A), T(" before you rank.")],
  ],
  [
    "both shapes",
    `${A} and [a second](https://example.org/second)`,
    [L(A), T(" and "), L("a second", "https://example.org/second")],
  ],
  ["a site alone gains the slash a browser adds", "https://example.org", [L("https://example.org", "https://example.org/")]],
  ["the scheme in capitals", "HTTPS://EXAMPLE.ORG/Briefs", [L("HTTPS://EXAMPLE.ORG/Briefs", "https://example.org/Briefs")]],
  ["the scheme as a phone types it", "Https://example.org/briefs", [L("Https://example.org/briefs", A)]],
  ["a port", "https://example.org:8443/briefs", [L("https://example.org:8443/briefs")]],
  ["a site written in its plain coded form", "https://xn--exmple-cua.org/briefs", [L("https://xn--exmple-cua.org/briefs")]],
  [
    "a longer site that ends in another",
    "https://example.org.elsewhere.example/briefs",
    [L("https://example.org.elsewhere.example/briefs")],
  ],
  ["a query and a fragment", "https://example.org/briefs?week=2#a1", [L("https://example.org/briefs?week=2#a1")]],

  // --- leading spaces and control characters ---
  ["a space first", ` ${A}`, [T(" "), L(A)]],
  ["a tab first", `\t${A}`, [T("\t"), L(A)]],
  ["a line break first", `One line.\n${A}`, [T("One line.\n"), L(A)]],
  ["a control character first", `\u0000${A}`, [T("\u0000"), L(A)]],
  ["a no-break space first", `\u00a0${A}`, [T("\u00a0"), L(A)]],
  ["a control character after", `${A}\u0000more`, [L(A), T("\u0000more")]],
  ["a space that takes up no room after", `${A}\u200b`, [L(A), T("\u200b")]],
  [
    "a control character in the words",
    `[the\u0000briefs](${A})`,
    [T("[the\u0000briefs]("), L(A), T(")")],
  ],
  [
    "words told to run the other way, so they read as another address",
    "[\u202egro.elpmaxe//:sptth](https://elsewhere.example/briefs)",
    [T("[\u202egro.elpmaxe//:sptth]("), L("https://elsewhere.example/briefs"), T(")")],
  ],
  ["a space before the address in brackets", `[the briefs]( ${A})`, [T("[the briefs]( "), L(A), T(")")]],
  ["a tab before the address in brackets", `[the briefs](\t${A})`, [T("[the briefs](\t"), L(A), T(")")]],
  ["a space between the brackets", `[the briefs] (${A})`, [T("[the briefs] ("), L(A), T(")")]],

  // --- nested and unbalanced brackets ---
  ["brackets inside the words", `[[the briefs]](${A})`, [T("[[the briefs]]("), L(A), T(")")]],
  ["no closing bracket", `[the briefs](${A}`, [T("[the briefs]("), L(A)]],
  ["no square bracket closed", `[the briefs(${A})`, [T("[the briefs("), L(A), T(")")]],
  ["no square bracket opened", `the briefs](${A})`, [T("the briefs]("), L(A), T(")")]],
  ["one closing bracket too many", `[the briefs](${A}))`, [L("the briefs", A), T(")")]],
  [
    "brackets that belong to the address",
    "[the briefs](https://example.org/briefs_(autumn))",
    [L("the briefs", "https://example.org/briefs_(autumn)")],
  ],
  [
    "brackets that belong to the address, and the last one missing",
    "[the briefs](https://example.org/briefs_(autumn)",
    [T("[the briefs]("), L("https://example.org/briefs_(autumn)")],
  ],
  ["no words", `[](${A})`, [T("[]("), L(A), T(")")]],
  ["words that are only a space", `[ ](${A})`, [T("[ ]("), L(A), T(")")]],
  ["two pairs of square brackets", `[one][two](${A})`, [T("[one]"), L("two", A)]],
  ["two pairs of round brackets", `[one](two)(${A})`, [T("[one](two)("), L(A), T(")")]],
  ["an address in doubled brackets", `((${A}))`, [T("(("), L(A), T("))")]],
  [
    "brackets fifty deep",
    `${"[".repeat(50)}the briefs${"]".repeat(50)}(${A})`,
    [T(`${"[".repeat(50)}the briefs${"]".repeat(50)}(`), L(A), T(")")],
  ],

  // --- an address inside the words ---
  [
    "words that are another address: each address goes where it says",
    "[https://example.org/briefs](https://elsewhere.example/briefs)",
    [T("["), L(A), T("]("), L("https://elsewhere.example/briefs"), T(")")],
  ],
  [
    "words that are the same address",
    `[${A}](${A})`,
    [L(A, A)],
  ],
  [
    "words that name another site",
    "[example.org](https://elsewhere.example/briefs)",
    [T("[example.org]("), L("https://elsewhere.example/briefs"), T(")")],
  ],
  [
    "words that name another site with www",
    "[www.example.org](https://elsewhere.example)",
    [T("[www.example.org]("), L("https://elsewhere.example", "https://elsewhere.example/"), T(")")],
  ],
  [
    "words that are somebody's address at another site",
    "[someone@example.org](https://elsewhere.example/briefs)",
    [T("[someone@example.org]("), L("https://elsewhere.example/briefs"), T(")")],
  ],
  [
    "words that name another site in full-width letters",
    "[\uff45\uff58\uff41\uff4d\uff50\uff4c\uff45\uff0e\uff4f\uff52\uff47](https://elsewhere.example/briefs)",
    [
      T("[\uff45\uff58\uff41\uff4d\uff50\uff4c\uff45\uff0e\uff4f\uff52\uff47]("),
      L("https://elsewhere.example/briefs"),
      T(")"),
    ],
  ],
  [
    "words that name another site in another alphabet",
    "[\u0435x\u0430mple.org](https://elsewhere.example/briefs)",
    [T("[\u0435x\u0430mple.org]("), L("https://elsewhere.example/briefs"), T(")")],
  ],
  ["words that name the link's own site", `[example.org](${A})`, [L("example.org", A)]],
  ["words that name the link's own site, in capitals", `[EXAMPLE.ORG/briefs](${A})`, [L("EXAMPLE.ORG/briefs", A)]],
  ["words with a full stop that names no site", `[the briefs, e.g. A1 or B.2](${A})`, [L("the briefs, e.g. A1 or B.2", A)]],
  ["words that are another scheme are still only words", `[javascript:alert(1)](${A})`, [L("javascript:alert(1)", A)]],

  // --- quotes and angle brackets ---
  ["double quotes round it", `"${A}"`, [T('"'), L(A), T('"')]],
  ["single quotes round it", `'${A}'`, [T("'"), L(A), T("'")]],
  ["curly quotes round it", `\u201c${A}\u201d`, [T("\u201c"), L(A), T("\u201d")]],
  ["angle brackets round it", `<${A}>`, [T("<"), L(A), T(">")]],
  ["markup round it", `<a href="${A}">the briefs</a>`, [T('<a href="'), L(A), T('">the briefs</a>')]],
  [
    "an attribute after a double quote",
    `${A}" onmouseover="alert(1)`,
    [L(A), T('" onmouseover="alert(1)')],
  ],
  ["markup as the words", `[<b>the briefs</b>](${A})`, [L("<b>the briefs</b>", A)]],
  ["quotes as the words", `["the briefs"](${A})`, [L('"the briefs"', A)]],
  [
    "a double quote in the address in brackets",
    `[the briefs](${A}" onclick="alert(1))`,
    [T("[the briefs]("), L(A), T('" onclick="alert(1))')],
  ],
  [
    "an angle bracket in the address in brackets",
    "[the briefs](https://example.org/<script>)",
    [T("[the briefs]("), L("https://example.org/"), T("<script>)")],
  ],

  // --- an address ending in a full stop or a bracket ---
  ["a full stop after it", `See ${A}.`, [T("See "), L(A), T(".")]],
  ["a bracket after it", `(see ${A})`, [T("(see "), L(A), T(")")]],
  ["a bracket and a full stop after it", `(see ${A}).`, [T("(see "), L(A), T(").")]],
  ["a comma after it", `${A}, then rank them.`, [L(A), T(", then rank them.")]],
  ["two marks after it", `${A}!?`, [L(A), T("!?")]],
  ["a square bracket after it", `${A}]`, [L(A), T("]")]],
  ["an ellipsis after it", `${A}\u2026`, [L(A), T("\u2026")]],
  ["a full stop after a site alone", "https://example.org.", [L("https://example.org", "https://example.org/"), T(".")]],
  ["a closing bracket the address opened", "https://example.org/briefs_(autumn)", [L("https://example.org/briefs_(autumn)")]],
  [
    "a closing bracket the address opened, inside brackets",
    "(https://example.org/briefs_(autumn))",
    [T("("), L("https://example.org/briefs_(autumn)"), T(")")],
  ],
  ["a slash at the end is the address's own", "https://example.org/briefs/", [L("https://example.org/briefs/")]],
  ["a query that ends the sentence", "https://example.org/?q=briefs.", [L("https://example.org/?q=briefs"), T(".")]],
];

const partsOf = (parts) => parts.map((part) => ({ ...part }));

describe("which parts of a line are links", () => {
  for (const [name, input, expected] of ROWS) {
    test(name, () => {
      assert.deepEqual(partsOf(linkedParts(input)), expected);
    });
  }

  for (const [group, inputs] of Object.entries(STAYS_TEXT)) {
    test(`stays text, exactly as typed: ${group}`, () => {
      for (const input of inputs) {
        assert.deepEqual(
          partsOf(linkedParts(input)),
          [T(input)],
          `${JSON.stringify(input)} was not left as the text it is`,
        );
        // And again in the middle of a sentence, where it starts a word.
        assert.deepEqual(
          partsOf(linkedParts(`See ${input} first`)).filter((part) => part.kind === "link"),
          [],
          `${JSON.stringify(input)} became a link inside a sentence`,
        );
      }
    });
  }

  test("every link in the table is https, on a named site, with nothing before the site", () => {
    let links = 0;
    for (const [name, input] of ROWS) {
      const parts = linkedParts(input);
      for (const [at, part] of parts.entries()) {
        assert.ok(part.text.length > 0, `${name}: a part with nothing in it`);
        if (at > 0) {
          assert.ok(
            !(part.kind === "text" && parts[at - 1].kind === "text"),
            `${name}: two text parts side by side`,
          );
        }
        if (part.kind !== "link") continue;
        links += 1;
        const url = new URL(part.href);
        assert.equal(url.protocol, "https:", name);
        assert.ok(part.href.startsWith("https://"), name);
        assert.equal(url.username + url.password, "", name);
        assert.match(url.hostname, /^[a-z0-9-]+(\.[a-z0-9-]+)+$/, name);
        assert.equal(part.href, url.href, `${name}: the address is not the one the parser writes`);
      }
    }
    assert.ok(links >= 60, `only ${links} links came out of the table: it has stopped being read`);
  });

  test("nothing typed is lost: the parts read back as the line, with only a link's brackets and address gone", () => {
    const literal = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    for (const [name, input] of ROWS) {
      // A text part is itself. A link part is its own text standing bare, or
      // its text in square brackets with an address in round ones after it.
      const shape = linkedParts(input)
        .map((part) =>
          part.kind === "text"
            ? literal(part.text)
            : `(?:${literal(part.text)}|\\[${literal(part.text)}\\]\\([^\\s<>"\\[\\]]*\\))`,
        )
        .join("");
      assert.match(input, new RegExp(`^${shape}$`, "s"), `${name}: the parts do not read back as what was typed`);
    }
    for (const inputs of Object.values(STAYS_TEXT)) {
      for (const input of inputs) {
        assert.equal(linkedParts(input).map((part) => part.text).join(""), input);
      }
    }
  });

  test("the editor's sentence about links describes what is drawn", () => {
    const example = /\[the words\]\(https:\/\/[a-z.]+\)/.exec(LINKS_HINT);
    assert.ok(example, "the sentence no longer gives an example of words with an address");
    assert.deepEqual(partsOf(linkedParts(example[0])), [L("the words", "https://example.org/")]);
    assert.match(LINKS_HINT, /An address that starts https:\/\/ becomes a link\./);
    // The sentence itself is drawn as text, and has to read as text: its own
    // "https://" names no site, and its example is the only link in it.
    assert.deepEqual(
      linkedParts(LINKS_HINT).filter((part) => part.kind === "link").map((part) => part.text),
      ["the words"],
    );
    // It is beside the box it describes.
    const card = read("src/features/applications/editor/QuestionCard.tsx");
    const box = card.indexOf('id={`${ids}-help`}');
    const hint = card.indexOf("{LINKS_HINT}");
    assert.ok(box !== -1 && hint > box && hint - box < 700, "the sentence is not under the Help text box");
    assert.match(card.slice(box, hint), /aria-describedby=\{`\$\{ids\}-help-links`\}/);
  });
});

describe("an address passes several checks, and each is still there", () => {
  // The checks overlap on purpose: an address that slips one is stopped by
  // the next. So loosening one of them changes nothing the table can see, and
  // each is held here by its own words.
  const fn = stripSource(read(FUNCTION_FILE), { keepStrings: true });

  test("the scheme is compared letter by letter, in plain letters", () => {
    assert.match(fn, /const SCHEME = "https:\/\/";/);
    assert.match(
      fn,
      /const same = typed === wanted \|\| \(wanted >= 0x61 && wanted <= 0x7a && typed === wanted - 0x20\);\s*if \(!same\) return false;/,
    );
  });

  test("every character of it is one an address is written in", () => {
    assert.match(fn, /const ADDRESS_CHARS = \/\^\[A-Za-z0-9\\-\._~:\/\?#@!\$&'\(\)\*\+,;=%\]\*\$\/;/);
    assert.match(fn, /if \(!ADDRESS_CHARS\.test\(address\) \|\| !schemeAt\(address, 0\)\) return null;/);
  });

  test("what is typed before the path is a site's name and at most a port", () => {
    assert.match(fn, /const typed = \/\^\(\[A-Za-z0-9\.-\]\+\)\(\?::\[0-9\]\{1,5\}\)\?\$\/\.exec\(authority\);\s*if \(!typed\) return null;/);
    assert.match(fn, /const host = typed\[1\]\.toLowerCase\(\);\s*if \(!isSiteName\(host\)\) return null;/);
  });

  test("and the platform's parser agrees about the scheme, the site and that nothing comes before it", () => {
    assert.match(
      fn,
      /if \(url\.protocol !== "https:" \|\| url\.username !== "" \|\| url\.password !== ""\) return null;\s*if \(url\.hostname !== host\) return null;\s*return url\.href\.startsWith\(SCHEME\) \? url\.href : null;/,
    );
  });

  test("the check itself, asked directly", () => {
    assert.equal(httpsHref(A), A);
    assert.equal(httpsHref("https://example.org"), "https://example.org/");
    for (const refused of [
      "",
      "https://",
      "http://example.org/briefs",
      "https:/example.org/briefs",
      "https:example.org/briefs",
      "ftp://ab.example.org/briefs",
      "abcde://example.org/briefs",
      " https://example.org/briefs",
      "https://example.org/briefs ",
      "https://example.org/a b",
      "https://example.org@elsewhere.example/",
      "https://example/",
    ]) {
      assert.equal(httpsHref(refused), null, `${JSON.stringify(refused)} was taken for an https address on a named site`);
    }
  });
});

describe("how long a line can be", () => {
  const head = "https://example.org/";

  test("an address is linked up to its longest length, and not one character beyond", () => {
    const longest = head + "a".repeat(MAX_LINK_ADDRESS - head.length);
    assert.equal(longest.length, MAX_LINK_ADDRESS);
    assert.deepEqual(partsOf(linkedParts(longest)), [L(longest)]);
    assert.deepEqual(partsOf(linkedParts(`${longest}a`)), [T(`${longest}a`)]);
    assert.equal(httpsHref(`${longest}a`), null);
    // Inside the two brackets as well.
    assert.deepEqual(partsOf(linkedParts(`[the briefs](${longest})`)), [L("the briefs", longest)]);
    assert.equal(linkedParts(`[the briefs](${longest}a)`).filter((part) => part.kind === "link").length, 0);
  });

  test("words are linked up to their longest length", () => {
    const words = "w".repeat(MAX_LINK_WORDS);
    assert.deepEqual(partsOf(linkedParts(`[${words}](${A})`)), [L(words, A)]);
    assert.deepEqual(partsOf(linkedParts(`[${words}w](${A})`)), [T(`[${words}w](`), L(A), T(")")]);
  });

  test("a very long line is read in time that grows with its length, whatever it holds", () => {
    const size = 200_000;
    const fill = (piece) => piece.repeat(Math.ceil(size / piece.length)).slice(0, size);
    const lines = {
      "nothing but opening brackets": fill("["),
      "words never closed": fill("[a"),
      "an address in brackets never closed": fill("[a](x"),
      "addresses in brackets, one after another": fill("(https://"),
      "the scheme over and over": fill("https://"),
      "an address and nothing but closing brackets": `${head}${fill(")")}`,
      "an address in brackets that only opens more": `[a](${head}${fill("(")}`,
      "one long word": fill("a"),
      "a long run that reads as a site": `[${fill("a.")}](${A})`,
      "addresses that open and never end, with a space now and then": fill(`${"(https://a".repeat(180)} `),
      "addresses with a port no site has": fill("(https://example.org:99999/"),
      "words that read as a site, as long as words may be, over and over": fill(`[${"a.".repeat(149)}a](${A}) `),
      "an address in brackets as long as an address may be, never closed": fill(`[a](${head}${"x".repeat(1990)}`),
      "real links, thousands of them": fill(`[the briefs](${A}) and ${A}. `),
    };
    for (const [name, line] of Object.entries(lines)) {
      const before = performance.now();
      const parts = linkedParts(line);
      const took = performance.now() - before;
      assert.ok(took < 3000, `${name}: ${Math.round(took)} ms for ${line.length} characters`);
      for (const part of parts) {
        if (part.kind === "link") assert.ok(part.href.startsWith("https://example.org/"), name);
      }
    }
    // The last line is the one with links in it, so it proves the others were read at all.
    const real = linkedParts(lines["real links, thousands of them"]).filter((part) => part.kind === "link");
    assert.ok(real.length > 5000, `only ${real.length} links were found in a line full of them`);
  });
});

// ---------------------------------------------------------------------------
// 2. The component
// ---------------------------------------------------------------------------

const unescape = (html) =>
  html
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&");

/** Every element in a piece of markup, as its opening tag. Text is escaped, so a `<` is always a tag. */
const tagsIn = (html) => html.match(/<[^>]*>/g) ?? [];

const NEW_TAB = '<span class="visually-hidden"> (opens in a new tab)</span>';

/** The anchors a piece of markup holds: where each goes and what it shows. */
function anchorsIn(html) {
  const anchors = [];
  const pattern = /<a href="([^"]*)" target="_blank" rel="noopener noreferrer"( class="[^"]*")?>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    assert.ok(match[3].endsWith(NEW_TAB), "a link does not say that it opens in a new tab");
    anchors.push({ href: unescape(match[1]), text: unescape(match[3].slice(0, -NEW_TAB.length)) });
  }
  return anchors;
}

const draw = (text, props = {}) => renderToStaticMarkup(createElement(LinkedText, { text, ...props }));

describe("the component draws what the function passed, and nothing else", () => {
  const everyLine = [
    ...ROWS.map(([, input]) => input),
    ...Object.values(STAYS_TEXT).flat(),
    LINKS_HINT,
  ];

  test("one anchor for each link part, to the address the function gave, over the whole table", () => {
    let drawn = 0;
    for (const input of everyLine) {
      const html = draw(input);
      const links = linkedParts(input).filter((part) => part.kind === "link");
      assert.deepEqual(
        anchorsIn(html),
        links.map((part) => ({ href: part.href, text: part.text })),
        `${JSON.stringify(input)} was not drawn as the function read it`,
      );
      // Nothing is drawn that is not text, the anchor or the words for a screen reader.
      for (const tag of tagsIn(html)) {
        assert.match(
          tag,
          /^<a href="https:\/\/[^"]*" target="_blank" rel="noopener noreferrer">$|^<\/a>$|^<span class="visually-hidden">$|^<\/span>$/,
          `${JSON.stringify(input)} drew ${tag}`,
        );
      }
      assert.equal((html.match(/<a /g) ?? []).length, links.length);
      drawn += links.length;
    }
    assert.ok(drawn >= 60, `only ${drawn} anchors were drawn over the table`);
  });

  test("what stays text is drawn with no anchor at all", () => {
    for (const input of Object.values(STAYS_TEXT).flat()) {
      const html = draw(input);
      assert.ok(!html.includes("<a"), `${JSON.stringify(input)} was drawn with a link`);
      assert.equal(unescape(html), input, `${JSON.stringify(input)} was not drawn as the text it is`);
    }
  });

  test("the whole line is there to read, in order", () => {
    for (const [name, input] of ROWS) {
      const shown = unescape(draw(input).replace(/<[^>]*>/g, "")).split(" (opens in a new tab)").join("");
      assert.equal(shown, linkedParts(input).map((part) => part.text).join(""), name);
    }
  });

  test("a link takes the look it is handed, and only on the anchor", () => {
    const html = draw(`Read [the briefs](${A}).`, { linkClassName: "inlineLink" });
    assert.equal(
      html,
      `Read <a href="${A}" target="_blank" rel="noopener noreferrer" class="inlineLink">the briefs${NEW_TAB}</a>.`,
    );
  });

  test("the component reads the text only through the function, and sets nothing as markup", () => {
    const code = stripSource(read(COMPONENT_FILE), { keepStrings: true });
    assert.ok(!/dangerouslySetInnerHTML/.test(code));
    assert.deepEqual(code.match(/href=\{[^}]*\}|href="[^"]*"/g), ["href={part.href}"]);
    assert.match(code, /\{linkedParts\(text\)\.map\(\(part, at\) =>\s*part\.kind === "link" \? \(/);
    assert.equal((code.match(/<a\b/g) ?? []).length, 1, "the component draws an anchor somewhere else");
    assert.match(code, /target="_blank" rel="noopener noreferrer"/);
    // And the function makes a link part in two places, each straight after
    // its own check of the address has passed.
    const fn = stripSource(read(FUNCTION_FILE), { keepStrings: true });
    assert.equal((fn.match(/kind: "link",/g) ?? []).length, 2, "a link part is made somewhere new in the function's file");
    assert.match(
      fn,
      /const href = httpsHref\(address\);\s*if \(!href\) return null;\s*return \{ part: \{ kind: "link", text: address, href \}/,
      "a bare address is made into a link without the check of the address before it",
    );
    assert.match(
      fn,
      /const href = httpsHref\(text\.slice\(from, end\)\);\s*if \(!href\) return null;\s*const words = text\.slice\(at \+ 1, close\);\s*if \(!wordsSuit\(words, href\)\) return null;\s*return \{ part: \{ kind: "link", text: words, href \}/,
      "words are made into a link without the checks of the address and the words before it",
    );
  });
});

// ---------------------------------------------------------------------------
// 3. The form
// ---------------------------------------------------------------------------

describe("the form draws every help line through the component", () => {
  const question = (id, type, help, more = {}) => ({
    id,
    text: `Question ${id}`,
    help,
    type,
    options: [],
    optionsFromRanking: false,
    wordLimit: null,
    required: true,
    scored: false,
    ...more,
  });
  const HOSTILE = "[the briefs](javascript:alert(1)) <img src=x onerror=alert(1)> http://example.org/old";
  const TYPES = [
    ["short", {}],
    ["long", {}],
    ["choice", { options: ["One", "Two", "Three"] }],
    ["choice", { options: ["Yes", "No"] }],
    ["multi", { options: ["One", "Two"] }],
    ["scale", { options: ["Low", "Middle", "High"] }],
  ];
  const stepFor = (help) =>
    renderToStaticMarkup(
      createElement(QuestionsStep, {
        set: {
          id: "shared",
          roundId: "autumn",
          role: "general",
          scope: { type: "kind", kind: "fellowship" },
          label: "Fellowships",
          intro: "",
          questions: TYPES.map(([type, more], at) => question(`q${at}`, type, help, more)),
          createdAt: null,
          updatedAt: null,
        },
        answers: {},
        optionsOf: (id) => TYPES[Number(id.slice(1))][1].options ?? [],
        onAnswer: () => {},
        showProblems: false,
      }),
    );

  test("a help line with an address is drawn with its link, on every kind of question", () => {
    const html = stepFor(`Read the briefs first: ${A}. Then [say which](https://example.org/which).`);
    const anchors = anchorsIn(html);
    assert.equal(anchors.length, TYPES.length * 2, "a kind of question drew its help line without its links");
    for (const [at, anchor] of anchors.entries()) {
      assert.deepEqual(
        anchor,
        at % 2 === 0 ? { href: A, text: A } : { href: "https://example.org/which", text: "say which" },
      );
    }
    assert.equal((html.match(/class="inlineLink"/g) ?? []).length, TYPES.length * 2);
  });

  test("a hostile help line is drawn as the text it is, on every kind of question", () => {
    const html = stepFor(HOSTILE);
    assert.ok(!html.includes("<a"), "a help line that holds no https address was drawn with a link");
    assert.ok(!html.includes("<img"), "markup in a help line was drawn as markup");
    assert.equal(html.split(HOSTILE.replace(/</g, "&lt;").replace(/>/g, "&gt;")).length - 1, TYPES.length);
  });

  test("no field draws a help line any other way", () => {
    const fields = stripSource(read("src/features/applications/apply/fields.tsx"), { keepStrings: true });
    // Every place a help line is drawn hands it to `HelpLine`, and `HelpLine`
    // hands it to the component.
    assert.ok(!/>\s*\{help\}\s*</.test(fields), "a field draws its help line as a bare text node");
    assert.equal((fields.match(/\{help \? <HelpLine id=\{`\$\{id\}-[th]`\} text=\{help\} \/> : null\}/g) ?? []).length, 3);
    assert.match(
      fields,
      /function HelpLine\(\{ id, text \}: \{ id: string; text: string \}\) \{\s*return \(\s*<p id=\{id\} className=\{styles\.help\}>\s*<LinkedText text=\{text\} linkClassName=\{styles\.inlineLink\} \/>\s*<\/p>\s*\);\s*\}/,
    );
    // The step hands a question's own help line to nothing but a field's `help`.
    const step = stripSource(read("src/features/applications/apply/QuestionsStep.tsx"), { keepStrings: true });
    assert.equal((step.match(/question\.help/g) ?? []).length, 1);
    assert.match(step, /const help = question\.help \|\| undefined;/);
    assert.ok(!/\{help\}\s*<|>\s*\{help\}/.test(step), "the step draws a help line itself");
  });
});

// ---------------------------------------------------------------------------
// 4. Every address under the form's folders
// ---------------------------------------------------------------------------

const FOLDERS = [
  "src/features/applications",
  "src/lib/applications",
  "src/app/(public)/apply",
  "src/app/(public)/applications",
  "src/app/(app)/admin/admissions/forms",
  "src/app/api/admissions/forms",
];

const squash = (text) => text.replace(/\s+/g, " ").trim();

/** An address written out in full is what it says. These are the ways one may begin. */
const FIXED_ADDRESS = /^(\/(?!\/)|#|\?|mailto:[a-z0-9.-]+@[a-z0-9.-]+$|https:\/\/[a-z0-9.-]+\/)/;

/**
 * A template that begins with a fixed path of this site: `/apply/${id}`.
 * Whatever is put into it afterwards, it is a page on this site: only the very
 * start of an address can name another one.
 */
const isSitePath = (node) =>
  ts.isTemplateExpression(node) && /^\/[a-z]/.test(node.head.text);

/** Every `href` in one file: the ones written out, and the expressions the rest are built from. */
function addressesIn(file) {
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const fixed = [];
  const built = [];
  const take = (expression) => {
    if (!expression) built.push("(no value)");
    else if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      fixed.push(expression.text);
    } else if (!isSitePath(expression)) built.push(squash(expression.getText(source)));
  };
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "href") {
      const value = node.initializer;
      take(value && ts.isJsxExpression(value) ? value.expression : value);
    } else if (ts.isPropertyAssignment(node) && node.name.getText(source) === "href") {
      take(node.initializer);
    } else if (ts.isShorthandPropertyAssignment(node) && node.name.getText(source) === "href") {
      built.push("href");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { fixed, built: built.sort() };
}

/**
 * Every file under the form's folders with an address that is built, and what
 * it is built from. `authored` is true for an address made out of text an
 * author typed, and it is true once.
 */
const BUILT = new Map([
  [
    "src/features/applications/kit/LinkedText.tsx",
    {
      authored: true,
      built: ["part.href"],
      from: "what an author typed, as `linkedParts` passed it: the one place stored text becomes an address",
    },
  ],
  [
    "src/lib/applications/linkedText.ts",
    {
      built: ["href", "href"],
      from: "the function itself: the two places it makes a link part, each from the address `httpsHref` returned",
    },
  ],
  [
    "src/features/applications/apply/AboutStep.tsx",
    { built: ["email.profileHref", "email.profileHref"], from: "the profile page's fixed path, handed in by the form" },
  ],
  [
    "src/features/applications/apply/ApplicationForm.tsx",
    { built: ["hrefFor(each.id)"], from: "`?step=` and a step's id from `stepsFor`, encoded" },
  ],
  [
    "src/features/applications/apply/CheckStep.tsx",
    {
      built: [
        "PRIVACY_HREF",
        "SU_PAGE_URL",
        "agreement.href",
        "href",
        'hrefFor("about")',
        'hrefFor("availability")',
        'hrefFor("facilitating")',
        "hrefFor(issue.stepId)",
        "hrefFor(orderStep)",
        "hrefFor(stepId)",
      ],
      from: "the form's own steps (`?step=` and a step id), the privacy page's fixed path, and the Students' Union's address kept in `src/content/socials.ts`",
    },
  ],
  [
    "src/features/applications/apply/FacilitatingStep.tsx",
    { built: ["FACILITATORS_HREF"], from: "a constant in the file" },
  ],
  [
    "src/features/applications/apply/JoinAccount.tsx",
    {
      built: ["signInHref", "signInHref", "signInHref"],
      from: "`signInHrefFor`: the sign-in page with the form's own address to come back to",
    },
  ],
  [
    "src/features/applications/apply/JoinStep.tsx",
    { built: ["signInHref"], from: "`signInHrefFor`: the sign-in page with the form's own address to come back to" },
  ],
  [
    "src/features/applications/apply/checkText.ts",
    { built: ["POLICIES.privacy.href"], from: "the privacy page's path, from the list of policies" },
  ],
  [
    "src/features/applications/decisionDay/DecisionEmailBody.tsx",
    { built: ["button.href"], from: "a decision email's button, whose address `emailCopy.ts` takes from the links the send built" },
  ],
  [
    "src/features/applications/decisionDay/SendBoard.tsx",
    { built: ["pool"], from: "the pooled applicants page of this form, from its id" },
  ],
  [
    "src/features/applications/decisionDay/parts.tsx",
    { built: ["termPath(roundId)", "termPath(roundId)"], from: "the term's own page, from the form's id" },
  ],
  [
    "src/features/applications/editor/FormEditor.tsx",
    { built: ["homeHref", "homeHref"], from: "the term's own page, handed in by the page that draws the editor" },
  ],
  [
    "src/features/applications/editor/ProgrammeSetup.tsx",
    {
      built: ["formHref", "streamSetId ? `${formHref}?set=${encodeURIComponent(streamSetId)}` : formHref"],
      from: "the form editor's path, from the form's id and a question set's id",
    },
  ],
  [
    "src/features/applications/editor/ProgrammeTabs.tsx",
    { built: ["`${base}/${tab.segment}`"], from: "a programme's own pages: its path and one of the tabs listed in the file" },
  ],
  [
    "src/features/applications/editor/Refusals.tsx",
    {
      built: [
        "FORMS_PATH",
        "`${FORMS_PATH}/${encodeURIComponent(roundId)}/programmes/${encodeURIComponent(programmeId)}/applications`",
        "`${FORMS_PATH}/${encodeURIComponent(roundId)}`",
        "`${FORMS_PATH}/${encodeURIComponent(roundId)}`",
        "href",
      ],
      from: "the list of forms, and pages under it built from ids taken from the address",
    },
  ],
  [
    "src/features/applications/home/YourApplications.tsx",
    {
      built: ["LIST_PATH", "`${LIST_PATH}/${encodeURIComponent(row.roundId)}`"],
      from: "the list of somebody's applications, and one of them by its form's id",
    },
  ],
  [
    "src/features/applications/lifecycle/TermHome.tsx",
    { built: ["pooled.link.href", "row.link.href"], from: "pages of this term, as `lifecycle/termHome.ts` built them" },
  ],
  [
    "src/features/applications/lifecycle/TermState.tsx",
    { built: ["line.link.href", "pointer.href"], from: "pages of this term, as `lifecycle/view.ts` built them" },
  ],
  [
    "src/features/applications/review/ApplicationsBoard.tsx",
    {
      built: ["`${listPath}/${nextUid}`", "`${listPath}/${row.uid}`", "href"],
      from: "a programme's list of applications, and one application by its owner's account id",
    },
  ],
  [
    "src/features/applications/review/ReviewScreen.tsx",
    {
      built: [
        "`${listPath}/${encodeURIComponent(queue.nextUid)}`",
        "`${listPath}/${encodeURIComponent(queue.previousUid)}`",
        "listPath",
        "nextHref",
      ],
      from: "a programme's list of applications, and the next or previous one by its owner's account id",
    },
  ],
  [
    "src/features/applications/status/StatusPage.tsx",
    {
      built: ["EVENTS", "EVENTS", "HUB", "`mailto:${CONTACT}`", "applyHref", "applyHref", "applyHref"],
      from: "constants in the file (two pages of this site and the society's own address), and the form's page from its id",
    },
  ],
  [
    "src/lib/applications/applicant/join.ts",
    {
      built: ["joinReturnFor(bare[1])", "marked"],
      from: "the form's own address with its mark, built from an id alone after the whole shape of a return address has matched",
    },
  ],
  [
    "src/lib/applications/decisionDay/emailCopy.ts",
    {
      built: [
        "input.links.application",
        "input.links.application",
        "input.links.application",
        "input.links.application",
        "input.links.events",
      ],
      from: "the person's own application page and the events page, built by the send from the site's address and the form's id",
    },
  ],
  [
    "src/lib/applications/lifecycle/termHome.ts",
    {
      built: ["`${home}/pool`", "`${home}/pool`", "`${home}/send`", "href", "href", "href"],
      from: "pages of this term: the term's own path and a programme's id",
    },
  ],
  [
    "src/lib/applications/lifecycle/view.ts",
    {
      built: ["`${home}${fixAt}`", "`${home}/form`"],
      from: "pages of this term: the term's own path and where readiness says a thing is put right",
    },
  ],
  [
    "src/app/(public)/applications/[roundId]/page.tsx",
    { built: ["row.href"], from: "one of the older rounds' own pages, from the status hub's rows" },
  ],
  [
    "src/app/(public)/applications/page.tsx",
    { built: ["row.href"], from: "one of the older rounds' own pages, from the status hub's rows" },
  ],
  [
    "src/app/(app)/admin/admissions/forms/[roundId]/page.tsx",
    {
      built: ["`${base}/setup`", "`${home}/form`", "card?.action.href ?? `${base}/applications`"],
      from: "pages of this term: the term's own path and a programme's id",
    },
  ],
  [
    "src/app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/layout.tsx",
    { built: ["home"], from: "the term's own page, from the form's id" },
  ],
  [
    "src/app/(app)/admin/admissions/forms/page.tsx",
    { built: ["applicationFormPath(form.id)"], from: "a form's own page, from its id" },
  ],
]);

describe("no other file under the form's folders makes an address out of stored text", () => {
  const found = new Map();
  const everyFile = [];
  for (const folder of FOLDERS) {
    for (const file of walkSource(join(REPO_ROOT, folder))) {
      const name = relative(REPO_ROOT, file).split(sep).join("/");
      everyFile.push(name);
      found.set(name, addressesIn(file));
    }
  }

  test("the walk reads the form's folders", () => {
    assert.ok(everyFile.length > 150, `only ${everyFile.length} files were read`);
    for (const must of [COMPONENT_FILE, FUNCTION_FILE, "src/features/applications/apply/fields.tsx"]) {
      assert.ok(everyFile.includes(must), `${must} is not under the folders the walk reads`);
    }
    // The reader finds the addresses it is known to hold.
    assert.deepEqual(found.get("src/features/applications/apply/JoinStep.tsx").fixed.sort(), [
      "/",
      "https://policies.google.com/privacy",
      "https://policies.google.com/terms",
      "mailto:ai-safety@uonsu.com",
    ]);
  });

  test("an address written out in full is a page of this site, a fixed https address or the society's own", () => {
    for (const [file, { fixed }] of found) {
      for (const address of fixed) {
        assert.match(address, FIXED_ADDRESS, `${file} writes out ${JSON.stringify(address)}`);
      }
    }
  });

  test("every address that is built is on the list, with what it is built from", () => {
    for (const [file, { built }] of found) {
      const listed = BUILT.get(file);
      if (built.length === 0) continue;
      assert.ok(
        listed,
        `${file} builds an address (${built.join(", ")}) and is not on the list. ` +
          "If it is made from text an author or an applicant typed, draw that text through " +
          "`LinkedText` instead. Otherwise add the file to BUILT with what the address is built from.",
      );
      assert.deepEqual(
        built,
        [...listed.built].sort(),
        `${file} builds an address the list does not have, or no longer builds one it has. ` +
          "Read the new one before adding it: an address made from stored text is drawn through `LinkedText`.",
      );
    }
  });

  test("the list names nothing that is not there, and says what each is built from", () => {
    for (const [file, entry] of BUILT) {
      assert.ok(found.has(file), `${file} is on the list and is not under the form's folders`);
      assert.ok(found.get(file).built.length > 0, `${file} is on the list and builds no address`);
      assert.ok(entry.from.trim().length >= 20, `${file} is listed with no account of what its addresses are built from`);
    }
  });

  test("one file makes an address out of what an author typed: the component", () => {
    const authored = [...BUILT].filter(([, entry]) => entry.authored === true).map(([file]) => file);
    assert.deepEqual(authored, [COMPONENT_FILE]);
    assert.deepEqual(BUILT.get(COMPONENT_FILE).built, ["part.href"]);
    // And only the component imports the function. The editor's two files
    // import the one sentence they show beside a box, and nothing else.
    const importers = everyFile.filter((file) => /from "@\/lib\/applications\/linkedText"/.test(read(file))).sort();
    const editorFiles = [
      "src/features/applications/editor/FormEditor.tsx",
      "src/features/applications/editor/QuestionCard.tsx",
    ];
    assert.deepEqual(importers, [...editorFiles, COMPONENT_FILE]);
    for (const file of editorFiles) {
      assert.match(
        read(file),
        /import \{ LINKS_HINT \} from "@\/lib\/applications\/linkedText";/,
        `${file} imports more of the function's file than the sentence it shows`,
      );
    }
    // And two places draw an author's line through the component: a question's
    // help line, and the line a set's author wrote for applicants.
    const drawers = everyFile.filter((file) => /<LinkedText\b/.test(read(file))).sort();
    assert.deepEqual(drawers, [
      "src/features/applications/apply/SetLine.tsx",
      "src/features/applications/apply/fields.tsx",
    ]);
  });

  test("nothing under the form's folders sets markup from a string, or sends the browser to an address in code", () => {
    for (const file of everyFile) {
      const code = stripSource(read(file));
      for (const [pattern, what] of [
        [/dangerouslySetInnerHTML/, "sets markup from a string"],
        [/\.(innerHTML|outerHTML)\b/, "sets markup from a string"],
        [/\binsertAdjacentHTML\(/, "sets markup from a string"],
        [/\bdocument\.write\(/, "writes markup from a string"],
        [/\bwindow\.open\(/, "opens an address in code"],
        [/\blocation\.(assign|replace)\(/, "sends the browser to an address in code"],
        [/\blocation\.href\s*=[^=]/, "sends the browser to an address in code"],
      ]) {
        assert.ok(!pattern.test(code), `${file} ${what}`);
      }
    }
  });
});
