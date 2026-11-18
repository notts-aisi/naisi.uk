/**
 * A ROUTE SETS NO FRAMING HEADER.
 *
 * How a response's body is framed (its length, its encoding, how it is
 * transferred) is the server's to say. Next.js drops `Content-Length`,
 * `Content-Encoding` and `Transfer-Encoding` from the Response a route
 * handler returns and frames the body itself, so a route that sets one of
 * them states something no browser is ever told, and a test of the handler
 * alone would go on believing it.
 *
 * This walks every source file under `src` and holds each mention of one of
 * the three names, in code, to the one thing a source file may do with it:
 * read it off a request (`headers.get("content-length")`, `headers.has(...)`,
 * the name alone as the call's one argument). Every other mention fails,
 * however it is written: a key of a headers object, `headers.set` or
 * `headers.append` with its arguments on any line, a pair in an array handed
 * to `new Headers`, a pattern, a line of a template, or the name kept in a
 * constant for later.
 *
 * THE CODE IS READ AS CODE. A file is parsed with the TypeScript compiler,
 * and the names are looked for in what the parser says is a piece of text
 * the program holds: a string, a template, a pattern, text between tags. So
 * a comment may name them (the two routes that send a file say why they set
 * none), and nothing a string happens to contain (the start of a comment
 * inside `accept="image/*"`, two slashes inside an address) can hide the
 * code after it.
 *
 * A STRING IS READ AS WHAT IT HOLDS, not as it is typed: a name written with
 * an escape (`"Content\u002DLength"`, `'content-\x6cength'`, a string
 * carried over a line end) holds the name all the same and fails all the
 * same. An escape is the one way the typed text of a string can differ from
 * what it holds, so the files parsed are the ones that name a header, hold a
 * backslash anywhere, or name one of Node's own constants for the three
 * (`constants.HTTP2_HEADER_CONTENT_LENGTH`), which fail wherever they stand,
 * as a name or inside a string.
 *
 * A READING IS ONE FORM: `.get("content-length")` or `.has(...)`, the name a
 * plain string and the call's one argument. A name in brackets
 * (`headers["content-length"]`) fails as a read too: what a route is handed
 * is a `Headers`, which answers nothing to brackets.
 *
 * WHAT IT CANNOT SEE: a name put together when the code runs
 * (`"Content-" + "Length"`), and a pattern that would match a name without
 * spelling one (`/content.length/`, or one written with escapes). No reading
 * of the source finds those.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const FRAMING = "content-length|content-encoding|transfer-encoding";
/** One of the three names, anywhere in a run of text. */
const NAMES_ONE = new RegExp(FRAMING, "i");
/** Each of them, for counting and for where it sits. */
const EVERY_NAME = new RegExp(FRAMING, "gi");
/** A piece of text that is one of the three names and nothing else. */
const A_NAME_ALONE = new RegExp(`^(?:${FRAMING})$`, "i");
/** Node's own constant for one of the three (`constants.HTTP2_HEADER_CONTENT_LENGTH`). */
const A_CONSTANT_FOR_ONE = /^HTTP2_HEADER_(?:CONTENT_LENGTH|CONTENT_ENCODING|TRANSFER_ENCODING)$/;
/** That constant's name inside a piece of text, as a read of it by name is (`constants["HTTP2_HEADER_CONTENT_LENGTH"]`). */
const NAMES_A_CONSTANT = /HTTP2_HEADER_(?:CONTENT_LENGTH|CONTENT_ENCODING|TRANSFER_ENCODING)/;
/**
 * Whether a file can hold one at all: it names one, it names such a
 * constant, or it has a backslash in it (a string written with an escape
 * holds what its typed text does not show).
 */
const MIGHT_HOLD_ONE = new RegExp(`${FRAMING}|HTTP2_HEADER_|\\\\`, "i");

/** How the compiler should read a file, by its extension. */
function kindOf(fileName) {
  if (/\.(tsx|jsx)$/.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.(js|mjs|cjs)$/.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

/** A piece of text the program holds: a string, a template or one of its parts, a pattern, text between tags. */
function isTextOfTheProgram(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node) ||
    ts.isRegularExpressionLiteral(node) ||
    ts.isJsxText(node)
  );
}

/** The one use allowed: the name alone, as the only argument of a call to `.get` or `.has`. */
function isAReading(node) {
  if (!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) return false;
  if (!A_NAME_ALONE.test(node.text)) return false;
  const call = node.parent;
  if (!call || !ts.isCallExpression(call) || call.arguments.length !== 1 || call.arguments[0] !== node) return false;
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee) && (callee.name.text === "get" || callee.name.text === "has");
}

/**
 * What a file's code does with the three names: `set` is every mention that
 * is not a reading, as `{ line, text }`, and `read` is how many readings
 * there are. A file that could not hold one (`MIGHT_HOLD_ONE`) is not parsed.
 */
function framingIn(source, fileName = "file.ts") {
  const out = { set: [], read: 0 };
  if (!MIGHT_HOLD_ONE.test(source)) return out;
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kindOf(fileName));
  const lines = source.split("\n");
  const lineAt = (position) => file.getLineAndCharacterOfPosition(position).line + 1;
  const visit = (node) => {
    if (ts.isIdentifier(node) && A_CONSTANT_FOR_ONE.test(node.text)) {
      const line = lineAt(node.getStart(file));
      out.set.push({ line, text: lines[line - 1].trim() });
    }
    if (isTextOfTheProgram(node) && (NAMES_ONE.test(node.text) || NAMES_A_CONSTANT.test(node.text))) {
      if (isAReading(node)) {
        out.read += 1;
      } else {
        // Each name where it is written. A name spelt with an escape is not in the written text: it is given the line its text starts on.
        const start = node.getStart(file);
        const written = source.slice(start, node.end);
        const places = [...written.matchAll(EVERY_NAME)].map((match) => start + match.index);
        for (const position of places.length > 0 ? places : [start]) {
          const line = lineAt(position);
          out.set.push({ line, text: lines[line - 1].trim() });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return out;
}

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("a framing header is found however it is set, and on the line that names it", () => {
  const SET = [
    ["a key of a headers object", 'const init = { headers: { "Content-Length": String(bytes.length) } };', 1],
    ["headers.set", "res.headers.set('content-encoding', 'gzip');", 1],
    ["headers.append", 'headers.append("Transfer-Encoding", "chunked");', 1],
    ["a pair in an array", 'const headers = new Headers([["Content-Length", "5"]]);', 1],
    ["a call whose arguments start on the next line", 'headers.set(\n  "Content-Length",\n  String(bytes.length),\n);', 2],
    ["an object whose key is on a line of its own", 'const response = new Response(body, {\n  headers: {\n    "Content-Encoding": encoding,\n  },\n});', 3],
    ["a key worked out in brackets", "const headers = { [`Transfer-Encoding`]: how };", 1],
    ["a header set by its name in brackets", 'headers["Content-Length"] = String(size);', 1],
    ["the name kept for later", 'const LENGTH = "content-length";\nheaders.set(LENGTH, size);', 1],
    ["a name inside a longer string", "const line = `Content-Length: ${size}`;", 1],
    ["a name on the second line of a template", "const raw = `HTTP/1.1 200 OK\nContent-Length: ${size}\n`;", 2],
    ["a pattern", "const strip = /^content-length$/i;", 1],
    // What a string happens to contain never hides the code after it.
    ["after an address in the same line", 'fetch("https://example.org/a", { headers: { "Content-Length": "1" } });', 1],
    ["after two slashes inside a string", 'const note = "a // b"; headers.set("Content-Encoding", "gzip");', 1],
    ["after two slashes inside a template", 'const note = `a // b`; headers.append("Transfer-Encoding", "chunked");', 1],
    ["after the start of a comment inside a string", 'const accept = "image/*";\nheaders.set("Content-Length", size); /* done */', 2],
    // A string is read as what it holds, however it is typed.
    ["a hyphen written as an escape", 'headers.set("Content\\u002DLength", size);', 1],
    ["a letter written as an escape", "headers.set('content-\\x6cength', size);", 1],
    ["a hyphen escaped for no reason", 'headers.set("Content\\-Encoding", "gzip");', 1],
    ["a name carried over a line end inside a string", 'headers.set("Transfer-\\\nEncoding", "chunked");', 1],
    ["an escape in a template, given the line the template starts on", "const raw = `HTTP/1.1 200 OK\nContent\\u{2d}Length: ${size}\n`;", 1],
    ["Node's own constant for one", "headers.set(constants.HTTP2_HEADER_CONTENT_LENGTH, String(size));", 1],
    ["that constant taken out of the module first", "const { HTTP2_HEADER_TRANSFER_ENCODING } = constants;", 1],
    ["that constant read by its name in brackets", 'headers.set(constants["HTTP2_HEADER_CONTENT_LENGTH"], String(size));', 1],
    ["that name in brackets, typed with an escape", 'headers.set(constants["HTTP2_HEADER_CONTENT\\x5FENCODING"], "gzip");', 1],
  ];
  for (const [what, source, line] of SET) {
    const { set } = framingIn(source);
    assert.equal(set.length, 1, `${what} was not found exactly once`);
    assert.equal(set[0].line, line, `${what} was found on the wrong line`);
  }
  // The same in a file with tags in it.
  const page = 'export function Pick() {\n  return <input type="file" accept="image/*" />;\n}\nexport function send(headers: Headers, n: number) {\n  headers.set("Content-Length", String(n));\n}\n';
  assert.deepEqual(framingIn(page, "Pick.tsx").set.map((found) => found.line), [5]);
  // Two on one line are two, and two in one string are two.
  assert.equal(framingIn('h.set("Content-Length", n); h.set("Content-Encoding", e);').set.length, 2);
  assert.equal(framingIn("const both = `Content-Length: 1\\r\\nContent-Encoding: gzip`;").set.length, 2);
});

test("reading one off a request is left alone, and so is a comment that names one", () => {
  for (const source of [
    'const declared = Number(req.headers.get("content-length") ?? "0");',
    'if (req.headers.has("Transfer-Encoding")) refuse();',
    "const declared = req.headers.get(\n  'content-length',\n);",
    "const declared = req.headers?.get(`content-encoding`);",
    "// No Content-Length: the server frames a response.\nexport const runtime = 'nodejs';",
    "/* Content-Encoding and\n   Transfer-Encoding are the server's. */\nexport const runtime = 'nodejs';",
    "/**\n * `Content-Length` is dropped from what a route returns.\n */\nexport const runtime = 'nodejs';",
    'const headers = { "Content-Type": "application/pdf" };',
  ]) {
    assert.deepEqual(framingIn(source).set, [], source);
  }
  assert.equal(framingIn('const declared = req.headers.get("content-length");').read, 1);
  // A read and a set in one file: the set is found, the read is not.
  const both = 'const declared = req.headers.get("content-length");\nres.headers.set("Content-Length", declared);';
  assert.deepEqual(framingIn(both).set.map((found) => found.line), [2]);
  assert.equal(framingIn(both).read, 1);
  // Anything else done with what `.get` is handed is not a reading of the name alone.
  assert.equal(framingIn('headers.get("content-length" + suffix);').set.length, 1);
  assert.equal(framingIn('headers.get("content-length", fallback);').set.length, 1);
  assert.equal(framingIn('lookup("content-length");').set.length, 1);
  // A reading typed with an escape is a reading still, and a name in brackets is not one.
  assert.deepEqual(framingIn('const declared = req.headers.get("content\\x2dlength");'), { set: [], read: 1 });
  assert.equal(framingIn('const declared = req.headers["content-length"];').set.length, 1);
  // A file that could not hold one is not parsed, and one with a backslash in it is.
  assert.deepEqual(framingIn("export const runtime = 'nodejs';"), { set: [], read: 0 });
  assert.deepEqual(framingIn('const tab = "a\\tb";'), { set: [], read: 0 });
});

test("no source file sets a response's length, encoding or transfer encoding", () => {
  const files = sourceFiles(SRC);
  assert.ok(files.length > 500, `only ${files.length} source files were walked: the walk is broken`);
  const found = [];
  let read = 0;
  for (const file of files) {
    const name = relative(REPO_ROOT, file);
    const framing = framingIn(readFileSync(file, "utf8"), name);
    read += framing.read;
    for (const { line, text } of framing.set) found.push(`${name}:${line}: ${text}`);
  }
  assert.deepEqual(
    found,
    [],
    "the server frames a response; a source file names one of these headers only to read it off a request",
  );
  // The walk reads code the way the checks above do: the one reading in the tree is seen as a reading.
  assert.ok(read >= 1, "no reading of a framing header was found, and src/lib/applications/applicant/requests.ts makes one: the walk or the check is broken");
});
