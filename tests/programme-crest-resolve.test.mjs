/**
 * No file but one picks a programme crest (run via `npm test`, Node's
 * built-in runner, reading the source tree and nothing else).
 *
 * Which crest a page shows is decided in `src/lib/crests/resolve.ts`: a
 * programme's own, then its course's, then the NAISI emblem; for a run, the
 * programme that names it, then its course's; for a course, its own. Two
 * pages with two rules would show one programme two ways, and a crest picked
 * by a programme's name or slug would put the wrong mark on the next term's
 * programme of the same name. So this walks every `.ts`, `.tsx` and `.css`
 * under `src` and holds:
 *
 *  1. A CREST IS NEVER SPELLED OUT. The four keys are written in
 *     `src/lib/crests/keys.ts` and in the drawings of
 *     `src/components/ProgrammeCrest.tsx`, and nowhere else in code, and the
 *     `--programme-*` colours are read by that component and declared in
 *     `src/theme/tokens.css`, never named by a page's stylesheet.
 *  2. A STORED OR SENT CREST IS READ BY THE FILES LISTED BELOW, each with
 *     what it reads, and by no other. A page gets the resolver's answer
 *     instead, under the name `shownCrest`. The list is held both ways: a
 *     file that stops reading a crest leaves it.
 *  3. ONLY THE RESOLVER CHOOSES BETWEEN CRESTS. Nowhere else does a crest
 *     sit beside `??` or `||`, and no other conditional reads two crests.
 *     The three answers are defined there and nowhere else.
 *  4. A CREST IS DRAWN BY `ProgrammeMark` ALONE, which puts the emblem in a
 *     crest's place, and every `ProgrammeMark` is handed the resolver's
 *     answer: a `crestFor...` call, or a value named `shownCrest`.
 *
 * What this cannot see is a file that reads a crest under another name; the
 * list in (2) and the naming in (4) are what make one show up in review.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const COMPONENT = "src/components/ProgrammeCrest.tsx";
const KEYS_MODULE = "src/lib/crests/keys.ts";
const MARK = "src/components/ProgrammeMark.tsx";
const RESOLVER = "src/lib/crests/resolve.ts";
const TOKENS = "src/theme/tokens.css";
const KEYS = ["agi-strategy", "technical-ai-safety", "governance-macrostrategy", "alignment"];

/**
 * Every file that reads a stored or sent `crest`, with what it reads. A new
 * reader is added here with its reason, or, better, takes the resolver's
 * answer instead.
 */
const CREST_READERS = new Map([
  [KEYS_MODULE, "defines the four keys and `isCrestKey`, the check every stored or sent crest is held to"],
  [RESOLVER, "the one place a crest is chosen: a programme's or a run's, then its course's"],
  ["src/lib/crests/choice.ts", "reads the crest a request sends, for both of its writers"],
  ["src/lib/firestore/courses.ts", "`normalizeCourse`: a course's stored crest, one of the four or none"],
  ["src/lib/applications/normalise.ts", "`normaliseProgramme`: a programme's stored crest, one of the four or none"],
  ["src/lib/applications/editor/parse.ts", "reads the crest a programme's settings change sends"],
  ["src/lib/applications/editor/write.ts", "writes a programme's crest, admin only, when it changes"],
  ["src/lib/applications/editor/views.ts", "projects the programme's own crest to its Settings"],
  ["src/lib/applications/lifecycle/publicTerm.ts", "projects the programme's own crest to a visitor's page, for the resolver"],
  ["src/app/api/courses/[courseId]/crest/route.ts", "reads the crest an admin sends for a course"],
  ["src/features/courses/CourseEditor.tsx", "shows a course's stored crest in its picker"],
  ["src/features/applications/editor/ProgrammeSetup.tsx", "shows a programme's stored crest in its picker"],
]);

function walk(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else if (/\.(?:tsx?|css)$/.test(name)) found.push(path);
  }
  return found;
}

const rel = (path) => relative(REPO_ROOT, path).split(sep).join("/");
const FILES = walk(SRC).map((path) => {
  const source = readFileSync(path, "utf8");
  const css = path.endsWith(".css");
  return {
    file: rel(path),
    css,
    // Comments removed and string bodies emptied, so neither can be read as code.
    code: css ? source.replace(/\/\*[\s\S]*?\*\//g, " ") : stripSource(source),
    // Comments removed and strings kept, to find a string that is written out.
    text: css ? source.replace(/\/\*[\s\S]*?\*\//g, " ") : stripSource(source, { keepStrings: true }),
  };
});
const CODE_FILES = FILES.filter((f) => !f.css);

/** True for a file that reads a `crest` off something: a property, an index, a `get`, or a pattern. */
function readsCrest({ code, text }) {
  return (
    /(?:\.|\?\.)crest\b/.test(code) ||
    /\[\s*["'`]crest["'`]\s*\]/.test(text) ||
    /\.get\(\s*["'`]crest["'`]\s*\)/.test(text) ||
    /\{[^{}]*\bcrest\b[^{}]*\}\s*=[^=>]/.test(code) ||
    /\bisCrestKey\s*\(/.test(code)
  );
}

test("the walk sees the tree", () => {
  assert.ok(CODE_FILES.length > 500, `only ${CODE_FILES.length} files: the walk has stopped looking`);
  for (const file of [COMPONENT, KEYS_MODULE, MARK, RESOLVER, TOKENS]) {
    assert.ok(FILES.some((f) => f.file === file), `${file} is not where this guard looks for it`);
  }
});

/**
 * Files that write a crest key's word for something that is not a crest, with
 * the word and what it means there. Checked both ways: each listed file must
 * still write its word, so a stale entry fails rather than hiding a crest.
 */
const SAME_WORD_NOT_A_CREST = new Map([
  ["src/lib/surveys/templates.ts", ["alignment", "an incubator's research strand, which words the impact questionnaire's question about research skills for that strand"]],
  ["src/lib/surveys/words.ts", ["alignment", "the same strand, choosing its label in a survey's words"]],
  ["src/app/(app)/admin/(admin-only)/surveys/new/page.tsx", ["alignment", "the same strand, counting an incubator template's questions"]],
]);

test("no crest is spelled out in code but in the keys and the drawings", () => {
  const spelled = [];
  for (const { file, text, css } of FILES) {
    if (file === COMPONENT || file === KEYS_MODULE || css) continue;
    for (const key of KEYS) {
      if (SAME_WORD_NOT_A_CREST.get(file)?.[0] === key) continue;
      if (new RegExp(`["'\`]${key}["'\`]`).test(text)) spelled.push(`${file}: "${key}"`);
    }
  }
  assert.deepEqual(
    spelled,
    [],
    "a crest key is written out here. A page shows the crest an admin set, through src/lib/crests/resolve.ts; it never names one, and never works one out from a programme's name or slug.",
  );
});

test("every file that writes a crest key's word for something else still does, as listed", () => {
  for (const [file, [word, why]] of SAME_WORD_NOT_A_CREST) {
    assert.ok(KEYS.includes(word), `${file}: "${word}" is not a crest key, so it needs no entry`);
    assert.ok(why.length > 0, `${file}: say what "${word}" means there`);
    const found = FILES.find((f) => f.file === file);
    assert.ok(found, `${file} is listed as writing "${word}" but is not in the tree`);
    assert.ok(new RegExp(`["'\`]${word}["'\`]`).test(found.text), `${file} no longer writes "${word}": take its entry out`);
  }
});

test("the programme colours are declared once and read only by the component", () => {
  const css = FILES.filter((f) => f.css && f.file !== TOKENS && /--programme-/.test(f.code)).map((f) => f.file);
  assert.deepEqual(css, [], "a stylesheet names a programme's colour: draw the crest with ProgrammeMark instead");
  const code = CODE_FILES.filter((f) => f.file !== COMPONENT && /--programme-/.test(f.text)).map((f) => f.file);
  assert.deepEqual(code, [], "code names a programme's colour token: only ProgrammeCrest reads them");
});

test("a stored or sent crest is read by the listed files and no other, and every listed file reads one", () => {
  const readers = CODE_FILES.filter(readsCrest).map((f) => f.file).sort();
  assert.deepEqual(
    readers.filter((file) => !CREST_READERS.has(file)),
    [],
    "these read a crest and are not in CREST_READERS. A page takes the resolver's answer (`shownCrest`); a new reader of the stored field is listed with what it reads.",
  );
  assert.deepEqual(
    [...CREST_READERS.keys()].filter((file) => !readers.includes(file)).sort(),
    [],
    "these are in CREST_READERS and no longer read a crest. Remove the entry.",
  );
  for (const [file, why] of CREST_READERS) {
    assert.ok(typeof why === "string" && why.length > 20, `${file}: say what it reads`);
  }
});

/**
 * True when one statement holds a conditional and reads the crest of two
 * different things: `a.crest ? a.crest : b.crest`. A reader that checks one
 * stored value and keeps it (`isCrestKey(raw.crest) ? raw.crest : null`)
 * reads one thing twice, which is not a choice.
 */
function choosesInAConditional(code) {
  for (const statement of code.split(/[;{}]/)) {
    // A conditional's question mark: not `?.`, `??`, or an optional `?:`.
    if (!/[^?.]\?(?![?.:])/.test(statement)) continue;
    const holders = new Set([...statement.matchAll(/([\w$]+(?:\??\.[\w$]+)*)\??\.crest\b/g)].map((m) => m[1]));
    if (holders.size >= 2) return true;
  }
  return false;
}

test("only the resolver chooses between crests", () => {
  const choosing = [];
  for (const { file, code } of CODE_FILES) {
    if (file === RESOLVER) continue;
    const fallback =
      /(?:\.|\?\.|\b)crest\s*(?:\?\?|\|\|)/.test(code) || /(?:\?\?|\|\|)\s*[\w$.?!]*(?:\.|\?\.)crest\b/.test(code);
    if (fallback || choosesInAConditional(code)) choosing.push(file);
  }
  assert.deepEqual(
    choosing,
    [],
    "these choose between crests themselves. Ask src/lib/crests/resolve.ts instead: crestForProgramme, crestForRun or crestForCourse.",
  );
  const defining = CODE_FILES.filter((f) => /\bfunction\s+crestFor(?:Programme|Run|Course)\b|\bcrestFor(?:Programme|Run|Course)\s*=/.test(f.code)).map(
    (f) => f.file,
  );
  assert.deepEqual(defining, [RESOLVER], "the three answers are defined in the resolver and nowhere else");
});

test("a crest is drawn by ProgrammeMark alone, and every ProgrammeMark is handed the resolver's answer", () => {
  const drawing = CODE_FILES.filter(
    (f) =>
      f.file !== COMPONENT &&
      (/<ProgrammeCrest\b/.test(f.code) || /import\s*\{[^}]*\bProgrammeCrest\b[^}]*\}\s*from/.test(f.code)),
  ).map((f) => f.file);
  assert.deepEqual(drawing, [MARK], "ProgrammeCrest is drawn outside ProgrammeMark, which is what puts the emblem in a crest's place");

  const unresolved = [];
  for (const { file, code } of CODE_FILES) {
    for (const [tag] of code.matchAll(/<ProgrammeMark\b[^>]*>/g)) {
      const shown = tag.match(/\bshown=\{([^}]*)\}/)?.[1] ?? "";
      if (!/\bcrestFor(?:Programme|Run|Course)\s*\(|\bshownCrests?\b/.test(shown)) unresolved.push(`${file}: ${tag}`);
    }
  }
  assert.deepEqual(
    unresolved,
    [],
    "a ProgrammeMark is handed something that is not the resolver's answer. Pass `shown={crestFor...(...)}`, or a value named shownCrest that came from one.",
  );
  assert.ok(
    CODE_FILES.some((f) => f.file !== MARK && /<ProgrammeMark\b/.test(f.code)),
    "nothing draws a ProgrammeMark: the walk has stopped seeing them",
  );
});
