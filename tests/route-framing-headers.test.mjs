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
 * This walks every source file under `src` and fails one that sets any of
 * the three on a response: as a key of a headers object, or through
 * `headers.set` or `headers.append`. Reading one from a request is left
 * alone.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");

const FRAMING = "content-length|content-encoding|transfer-encoding";
/** `"Content-Length": ...` as a key, or `.set("Content-Length", ...)` / `.append(...)`. */
const SETS_ONE = new RegExp(`(?:["'\`](?:${FRAMING})["'\`]\\s*:)|(?:\\.(?:set|append)\\(\\s*["'\`](?:${FRAMING})["'\`])`, "i");

function sourceFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) out.push(path);
  }
  return out;
}

test("the pattern finds a framing header set each of the three ways, and leaves a read alone", () => {
  assert.ok(SETS_ONE.test('headers: { "Content-Length": String(bytes.length) }'));
  assert.ok(SETS_ONE.test("res.headers.set('content-encoding', 'gzip')"));
  assert.ok(SETS_ONE.test('headers.append("Transfer-Encoding", "chunked")'));
  assert.equal(SETS_ONE.test('Number(req.headers.get("content-length") ?? "0")'), false);
  assert.equal(SETS_ONE.test('"Content-Type": "application/pdf"'), false);
});

test("no source file sets a response's length, encoding or transfer encoding", () => {
  const files = sourceFiles(SRC);
  assert.ok(files.length > 500, `only ${files.length} source files were walked: the walk is broken`);
  const found = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, index) => {
      if (SETS_ONE.test(line)) found.push(`${relative(REPO_ROOT, file)}:${index + 1}: ${line.trim()}`);
    });
  }
  assert.deepEqual(found, [], "the server frames a response; a route sets none of these headers");
});
