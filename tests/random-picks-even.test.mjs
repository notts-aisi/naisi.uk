/**
 * NO CHARACTER IS PICKED BY A RANDOM BYTE'S REMAINDER WITHOUT A REJECTION.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * A random byte is one of 256 values. Folding it onto an alphabet whose
 * length does not divide 256 with `byte % alphabet.length` makes the first
 * `256 % length` characters likelier than the rest: over 36 characters the
 * first four come up 8 times in 256 and the other 32 only 7. Code scanning
 * flags exactly that shape (a remainder of a cryptographically random value
 * with no comparison of that value beside it), and it flags it whatever the
 * alphabet's length when the length is not written as a number.
 *
 * Three ways pass:
 *
 *  - draw each character with `randomInt(length)` (node:crypto), which is
 *    even by construction and draws no byte this scan could see;
 *  - throw away every byte at or above the largest multiple of the length
 *    that fits in a byte, as `src/lib/firestore/slugId.ts` does: the scan
 *    reads a comparison of the byte, in the function that takes the
 *    remainder, as that rejection, as code scanning does (whether the bound
 *    is the right one is for the function's own tests: the week item ids'
 *    are in `tests/course-week-blocks-model.test.mjs`);
 *  - a remainder by a power of two written as a number (`byte % 32`), which
 *    is even, and which code scanning passes too.
 *
 * ## What the scan reads
 *
 * Every `.ts` and `.tsx` file under `src`, with the compiler's own parser
 * (syntax only, one file at a time). A DRAW is a call of `getRandomValues`,
 * `randomBytes`, `randomFill` or `randomFillSync`, however it is reached
 * (`crypto.getRandomValues`, `globalThis.crypto.getRandomValues`, an
 * imported `randomBytes`). The BYTES a draw makes are the draw itself, a
 * name it is kept under, an array it fills, and an array written from
 * `Math.random()` (a browser's fallback). A BYTE is read from them by
 * `for (const byte of bytes)`, `bytes[i]`, a Buffer's `readUInt8` and its
 * kin, or the element given to a callback of `bytes.map(...)` and its kin or
 * of `Array.from(bytes, ...)`. A PICK is a remainder (`%`) whose left side is
 * such a byte. Each is read within the outermost function holding the draw,
 * nested callbacks included.
 *
 * ## What it reports instead of skipping
 *
 * Bytes that leave that function some way the scan does not follow, where a
 * remainder taken later would be out of its sight: returned, handed to a
 * function of another module, or kept in an object, an array or a field.
 * Bytes handed to a function declared in the same file are followed into
 * it. A flow the scan cannot follow fails here, by file and line; one that is
 * right as it is goes in `HANDED_ON` with its reason, and that list is held
 * both ways.
 *
 * ## What it is held to
 *
 * The scan is run on small sources of its own first (every shape above, the
 * ones it must flag and the ones it must pass), then on the tree, where it
 * must still see the three picks that throw bytes away (so a scan that went
 * blind fails rather than passing), and must find no pick without one.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { walkSource } from "./lib/functionScan.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** The calls that draw random bytes. */
const DRAWS = new Set(["getRandomValues", "randomBytes", "randomFill", "randomFillSync"]);
/** Of those, the ones that fill the array they are handed. */
const FILLS = new Set(["getRandomValues", "randomFill", "randomFillSync"]);
/** An array's methods whose callback is handed one element at a time (its first parameter; `reduce`'s second). */
const EACH = new Set(["map", "forEach", "filter", "some", "every", "find", "findIndex", "findLast", "findLastIndex", "flatMap"]);
const REDUCE = new Set(["reduce", "reduceRight"]);
/** A Buffer's reads of one number. */
const BUFFER_READ = /^read(?:Big)?U?Int(?:8|16|32|64)?(?:BE|LE)?$|^read(?:Double|Float)(?:BE|LE)$/;
/** What a holder of bytes may be asked without its bytes going anywhere. */
const SIZE = new Set(["length", "byteLength"]);
/** Methods that hand back part of the same bytes. */
const SLICES = new Set(["slice", "subarray"]);

/**
 * Random bytes that leave the function drawing them and are right as they
 * are, by "file:line": none today. An entry says where the bytes go and why
 * no character is picked from them there.
 */
const HANDED_ON = new Map([]);

const strip = (node) => {
  let out = node;
  for (;;) {
    if (ts.isParenthesizedExpression(out) || ts.isAsExpression(out) || ts.isNonNullExpression(out)) out = out.expression;
    else if (ts.isTypeAssertionExpression?.(out)) out = out.expression;
    else if (ts.isSatisfiesExpression?.(out)) out = out.expression;
    else return out;
  }
};

const isFunctionLike = (node) =>
  ts.isFunctionDeclaration(node) ||
  ts.isFunctionExpression(node) ||
  ts.isArrowFunction(node) ||
  ts.isMethodDeclaration(node) ||
  ts.isConstructorDeclaration(node) ||
  ts.isGetAccessorDeclaration(node) ||
  ts.isSetAccessorDeclaration(node);

/** The name a call is made by: `randomBytes(…)`, `crypto.getRandomValues(…)`. */
function calleeName(call) {
  const callee = strip(call.expression);
  if (ts.isIdentifier(callee)) return callee.text;
  if (ts.isPropertyAccessExpression(callee)) return callee.name.text;
  return null;
}

const isDraw = (node) => ts.isCallExpression(node) && DRAWS.has(calleeName(node) ?? "");

/** True for an identifier that is a use of a name, not a property's or a declaration's own name. */
function isReference(id) {
  const parent = id.parent;
  if (!parent) return true;
  if (ts.isPropertyAccessExpression(parent) && parent.name === id) return false;
  if ((ts.isPropertyAssignment(parent) || ts.isPropertyDeclaration(parent) || ts.isMethodDeclaration(parent)) && parent.name === id) return false;
  if ((ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) && parent.name === id) return false;
  if ((ts.isFunctionDeclaration(parent) || ts.isFunctionExpression(parent)) && parent.name === id) return false;
  if (ts.isImportSpecifier(parent) || ts.isImportClause(parent) || ts.isExportSpecifier(parent) || ts.isNamespaceImport(parent)) return false;
  return true;
}

function walk(node, visit) {
  visit(node);
  ts.forEachChild(node, (child) => walk(child, visit));
}

/** The outermost function holding `node`, or the file itself for code at the top of a module. */
function unitOf(node) {
  let unit = node.getSourceFile();
  for (let at = node.parent; at; at = at.parent) if (isFunctionLike(at)) unit = at;
  return unit;
}

/** Functions declared by name in a file, so bytes handed to one can be followed into it. */
function functionsOf(source) {
  const byName = new Map();
  walk(source, (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) byName.set(node.name.text, node);
    else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const value = strip(node.initializer);
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) byName.set(node.name.text, value);
    }
  });
  return byName;
}

const isPowerOfTwo = (node) => {
  const value = strip(node);
  if (!ts.isNumericLiteral(value)) return false;
  const n = Number(value.text.replace(/_/g, ""));
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
};

const RELATIONAL = new Set([
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

/**
 * Reads one source text. Returns the picks it found (`{ line, text, even,
 * why }`) and the flows it could not follow (`{ line, text, where }`).
 */
export function scanSource(text, fileName = "source.ts") {
  const source = ts.createSourceFile(
    fileName,
    text,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const textOf = (node) => node.getText(source).replace(/\s+/g, " ");
  const local = functionsOf(source);
  const picks = [];
  const unresolved = [];
  const seenPicks = new Set();
  const seenFlows = new Set();
  const done = new Set();

  /** Reads one unit, given the names that already hold bytes or a byte when it starts (a followed call's parameters). */
  function readUnit(unit, seeds = { holders: [], bytes: [] }) {
    const key = `${unit.pos}:${seeds.holders.join(",")}|${seeds.bytes.join(",")}`;
    if (done.has(key)) return;
    done.add(key);
    const holders = new Set(seeds.holders);
    const bytes = new Set(seeds.bytes);

    const isHolder = (node) => {
      const value = strip(node);
      if (isDraw(value)) return true;
      if (ts.isIdentifier(value)) return holders.has(value.text);
      if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression) && SLICES.has(value.expression.name.text)) {
        return isHolder(value.expression.expression);
      }
      return false;
    };
    const mentionsMathRandom = (node) => {
      let found = false;
      walk(node, (child) => {
        if (
          ts.isCallExpression(child) &&
          ts.isPropertyAccessExpression(child.expression) &&
          child.expression.name.text === "random" &&
          ts.isIdentifier(child.expression.expression) &&
          child.expression.expression.text === "Math"
        ) {
          found = true;
        }
      });
      return found;
    };
    /** A byte read from bytes: a name holding one, `bytes[i]`, `bytes.readUInt8(i)`. */
    const isByte = (node) => {
      const value = strip(node);
      if (ts.isIdentifier(value)) return bytes.has(value.text);
      if (ts.isElementAccessExpression(value)) return isHolder(value.expression);
      if (ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression)) {
        return BUFFER_READ.test(value.expression.name.text) && isHolder(value.expression.expression);
      }
      return false;
    };
    const bindName = (name, into) => {
      if (ts.isIdentifier(name) && !into.has(name.text)) {
        into.add(name.text);
        return true;
      }
      return false;
    };

    // The names that come to hold bytes, or a byte, until nothing new is found.
    for (let grew = true; grew; ) {
      grew = false;
      walk(unit, (node) => {
        if (ts.isVariableDeclaration(node) && node.initializer) {
          if (isHolder(node.initializer)) grew = bindName(node.name, holders) || grew;
          else if (isByte(node.initializer)) grew = bindName(node.name, bytes) || grew;
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
          const left = strip(node.left);
          if (ts.isIdentifier(left) && isHolder(node.right)) grew = bindName(left, holders) || grew;
          else if (ts.isIdentifier(left) && isByte(node.right)) grew = bindName(left, bytes) || grew;
          // An array written from Math.random() byte by byte is a browser's fallback for the generator.
          if (ts.isElementAccessExpression(left) && ts.isIdentifier(strip(left.expression)) && mentionsMathRandom(node.right)) {
            grew = bindName(strip(left.expression), holders) || grew;
          }
        }
        if (ts.isCallExpression(node) && FILLS.has(calleeName(node) ?? "") && node.arguments[0]) {
          const filled = strip(node.arguments[0]);
          if (ts.isIdentifier(filled)) grew = bindName(filled, holders) || grew;
        }
        if (ts.isForOfStatement(node) && isHolder(node.expression)) {
          const declared = node.initializer;
          if (ts.isVariableDeclarationList(declared)) {
            for (const declaration of declared.declarations) grew = bindName(declaration.name, bytes) || grew;
          } else if (ts.isIdentifier(declared)) {
            grew = bindName(declared, bytes) || grew;
          }
        }
        if (ts.isCallExpression(node)) {
          const callee = strip(node.expression);
          let callback = null;
          let at = 0;
          if (ts.isPropertyAccessExpression(callee) && isHolder(callee.expression)) {
            if (EACH.has(callee.name.text)) callback = node.arguments[0];
            if (REDUCE.has(callee.name.text)) {
              callback = node.arguments[0];
              at = 1;
            }
          }
          if (
            ts.isPropertyAccessExpression(callee) &&
            callee.name.text === "from" &&
            ts.isIdentifier(callee.expression) &&
            callee.expression.text === "Array" &&
            node.arguments[0] &&
            isHolder(node.arguments[0])
          ) {
            callback = node.arguments[1] ?? null;
          }
          const fn = callback ? strip(callback) : null;
          if (fn && (ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && fn.parameters[at]) {
            grew = bindName(fn.parameters[at].name, bytes) || grew;
          }
        }
      });
    }

    // Every remainder of a byte, and whether it is thrown away beside it.
    const compared = (pick) => {
      const left = strip(pick);
      let found = false;
      walk(unit, (node) => {
        if (found || !ts.isBinaryExpression(node) || !RELATIONAL.has(node.operatorToken.kind)) return;
        for (const side of [strip(node.left), strip(node.right)]) {
          if (ts.isIdentifier(left) && ts.isIdentifier(side) && side.text === left.text) found = true;
          if (!ts.isIdentifier(left) && isByte(side) && !ts.isIdentifier(side)) {
            // `bytes[i] >= 252` throws away a byte read the same way from the same bytes.
            const holderOf = (n) => strip(ts.isElementAccessExpression(n) ? n.expression : n.expression.expression).getText(source);
            if (holderOf(side) === holderOf(left)) found = true;
          }
        }
      });
      return found;
    };
    walk(unit, (node) => {
      if (!ts.isBinaryExpression(node)) return;
      const kind = node.operatorToken.kind;
      if (kind !== ts.SyntaxKind.PercentToken && kind !== ts.SyntaxKind.PercentEqualsToken) return;
      if (!isByte(node.left)) return;
      const id = `${node.pos}`;
      if (seenPicks.has(id)) return;
      seenPicks.add(id);
      const even = isPowerOfTwo(node.right) ? "a power of two" : compared(node.left) ? "thrown away" : null;
      picks.push({ line: lineOf(node), text: textOf(node), even: even !== null, why: even ?? "a remainder of every byte" });
    });

    // Where bytes go that the scan does not follow.
    const flow = (node, where) => {
      const id = `${node.pos}:${where}`;
      if (seenFlows.has(id)) return;
      seenFlows.add(id);
      unresolved.push({ line: lineOf(node), text: textOf(node), where });
    };
    /** Bytes handed to a call: followed into a function of this file, reported for any other. */
    const handedTo = (node, call, kind) => {
      const name = calleeName(call);
      if (kind === "holder" && name && FILLS.has(name) && call.arguments[0] === node) return;
      const target = name && ts.isIdentifier(strip(call.expression)) ? local.get(name) : undefined;
      const index = call.arguments.indexOf(node);
      if (target && index >= 0 && target.parameters[index] && ts.isIdentifier(target.parameters[index].name)) {
        const param = target.parameters[index].name.text;
        readUnit(target, kind === "holder" ? { holders: [param], bytes: [] } : { holders: [], bytes: [param] });
        return;
      }
      // `Array.from(bytes, (byte) => …)` reads one byte at a time, as above.
      if (kind === "holder" && name === "from" && call.arguments[0] === node && call.arguments[1]) return;
      flow(node, `handed to ${name ?? "a call"}`);
    };
    const followUse = (node, kind) => {
      let at = node;
      while (at.parent && (ts.isParenthesizedExpression(at.parent) || ts.isAsExpression(at.parent) || ts.isNonNullExpression(at.parent))) {
        at = at.parent;
      }
      const parent = at.parent;
      if (!parent) return;
      if (ts.isCallExpression(parent) && parent.arguments.includes(at)) return handedTo(at, parent, kind);
      if (ts.isReturnStatement(parent) || (ts.isArrowFunction(parent) && parent.body === at)) return flow(at, "returned");
      if (ts.isArrayLiteralExpression(parent) || ts.isPropertyAssignment(parent) || ts.isShorthandPropertyAssignment(parent) || ts.isSpreadElement(parent)) {
        return flow(at, "kept in an object or an array");
      }
      if (ts.isBinaryExpression(parent) && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken && parent.right === at) {
        const left = strip(parent.left);
        if (!ts.isIdentifier(left)) return flow(at, "kept in a field");
      }
      if (kind === "holder" && ts.isPropertyAccessExpression(parent) && parent.expression === at) {
        const member = parent.name.text;
        const called = ts.isCallExpression(parent.parent) && parent.parent.expression === parent;
        if (SIZE.has(member) || SLICES.has(member) || EACH.has(member) || REDUCE.has(member) || BUFFER_READ.test(member)) return;
        // Written out whole: `randomBytes(32).toString("base64url")`.
        if (member === "toString" && called) return;
        return flow(at, `read as .${member}`);
      }
    };
    walk(unit, (node) => {
      if (isDraw(node)) followUse(node, "holder");
      if (ts.isIdentifier(node) && isReference(node)) {
        if (holders.has(node.text)) followUse(node, "holder");
        else if (bytes.has(node.text)) followUse(node, "byte");
      }
    });
  }

  // Every function that draws, or writes an array from Math.random() (a browser's fallback for the generator).
  const units = new Set();
  walk(source, (node) => {
    if (isDraw(node)) units.add(unitOf(node));
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isElementAccessExpression(strip(node.left)) &&
      /\bMath\.random\s*\(/.test(node.right.getText(source))
    ) {
      units.add(unitOf(node));
    }
  });
  for (const unit of units) readUnit(unit);
  return { picks, unresolved };
}

/** Every source file under `src`, as "src/..." with its scan. */
function scanTree() {
  const out = [];
  for (const file of walkSource(SRC)) {
    const path = `src/${relative(SRC, file).split(sep).join("/")}`;
    const { picks, unresolved } = scanSource(readFileSync(file, "utf8"), file);
    out.push({ path, picks, unresolved });
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. The scan, on sources of its own
// ---------------------------------------------------------------------------

const scan = (text) => scanSource(text, "example.ts");
const unevenIn = (text) => scan(text).picks.filter((pick) => !pick.even).map((pick) => pick.text);
const evenIn = (text) => scan(text).picks.filter((pick) => pick.even).map((pick) => pick.text);

describe("1. what the scan flags and what it passes", () => {
  test("a remainder of every byte is flagged, however the bytes are drawn and read", () => {
    const flagged = [
      // The event codes' fallback before it drew with randomInt.
      `import { randomBytes } from "node:crypto";
       function slug() { let out = ""; for (const byte of randomBytes(6)) out += A[byte % A.length]; return out; }`,
      // Kept under a name first.
      `function slug() { const bytes = randomBytes(6); let out = ""; for (const byte of bytes) out += A[byte % A.length]; return out; }`,
      // An array the browser's generator fills, read by index.
      `function slug() { const bytes = new Uint8Array(6); crypto.getRandomValues(bytes); let out = "";
         for (let i = 0; i < bytes.length; i += 1) out += A[bytes[i] % 36]; return out; }`,
      // The week item ids before this change: the generator, or Math.random's bytes when there is none.
      `function id() { const bytes = new Uint8Array(10);
         if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
         else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
         let tail = ""; for (const byte of bytes) tail += A[byte % A.length]; return tail; }`,
      // Math.random's bytes alone.
      `function id() { const bytes = []; for (let i = 0; i < 6; i += 1) bytes[i] = Math.floor(Math.random() * 256);
         return bytes.map((byte) => A[byte % 36]).join(""); }`,
      // A callback of the bytes, and Array.from's.
      `const id = () => Array.from(randomBytes(6)).length + [...randomBytes(6).map((b) => A[b % 36])].join("");`,
      `const id = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => A[b % 36]).join("");`,
      // A byte kept under a name, a Buffer's read, a byte of the draw itself, and a compound remainder.
      `function id() { const bytes = randomBytes(2); const first = bytes[0]; return A[first % 36] + A[bytes.readUInt8(1) % 36]; }`,
      `const one = () => A[randomBytes(1)[0] % 36];`,
      `function id() { let byte = randomBytes(1)[0]; byte %= 36; return A[byte]; }`,
      // A comparison of something else beside it is no rejection.
      `function id() { const bytes = randomBytes(6); let out = ""; for (let i = 0; i < bytes.length; i += 1) out += A[bytes[i] % 36]; return out; }`,
      // Bytes handed to a function of the same file are followed into it.
      `function pick(bytes) { let out = ""; for (const byte of bytes) out += A[byte % 36]; return out; }
       export function id() { return pick(randomBytes(6)); }`,
      `function letter(byte) { return A[byte % 36]; }
       export function id() { let out = ""; for (const byte of randomBytes(6)) out += letter(byte); return out; }`,
      // A remainder by a length that happens to be 32 is still flagged, as code scanning flags it.
      `const A = "abcdefghijkmnpqrstuvwxyz23456789";
       function slug() { let out = ""; for (const byte of randomBytes(6)) out += A[byte % A.length]; return out; }`,
    ];
    for (const text of flagged) {
      assert.equal(unevenIn(text).length >= 1, true, `not flagged:\n${text}`);
    }
    assert.deepEqual(unevenIn(flagged[0]), ["byte % A.length"]);
    assert.deepEqual(unevenIn(flagged[2]), ["bytes[i] % 36"]);
    assert.deepEqual(unevenIn(flagged[9]), ["byte %= 36"]);
    assert.deepEqual(unevenIn(flagged[11]), ["byte % 36"], "the function the bytes are handed to");
  });

  test("throwing bytes away beside the remainder passes, as slugId's loop does", () => {
    const slugIdLoop = `
      const UNBIASED_BELOW = 252;
      function randomSuffix() {
        let out = "";
        const bytes = new Uint8Array(16);
        while (out.length < 8) {
          crypto.getRandomValues(bytes);
          for (const byte of bytes) {
            if (byte >= UNBIASED_BELOW) continue;
            out += BASE36[byte % 36];
            if (out.length === 8) break;
          }
        }
        return out;
      }`;
    assert.deepEqual(unevenIn(slugIdLoop), []);
    assert.deepEqual(evenIn(slugIdLoop), ["byte % 36"]);
    // Read by index, the comparison read the same way.
    const byIndex = `function id() { const bytes = randomBytes(12); let out = "";
      for (let i = 0; i < bytes.length; i += 1) { if (bytes[i] >= 252) continue; out += A[bytes[i] % 36]; } return out; }`;
    assert.deepEqual(unevenIn(byIndex), []);
    assert.deepEqual(evenIn(byIndex), ["bytes[i] % 36"]);
    // In a callback, thrown away in the one before it.
    const chained = `const id = () => [...randomBytes(12)].length + randomBytes(12).filter((b) => b < 252).map((b) => A[b % 36]).join("");`;
    assert.deepEqual(unevenIn(chained), []);
  });

  test("randomInt, a power of two written as a number, a mask, hexadecimal and a whole encoding all pass", () => {
    const passing = [
      `import { randomInt } from "node:crypto";
       function slug() { const A = "abcdefghijkmnpqrstuvwxyz23456789"; let out = "in-";
         for (let i = 0; i < 6; i += 1) out += A[randomInt(A.length)]; return out; }`,
      `function slug() { let out = ""; for (const byte of randomBytes(6)) out += A[byte % 32]; return out; }`,
      `function code() { const bytes = randomBytes(8); let code = ""; for (let at = 0; at < 8; at += 1) code += A[bytes[at] & 31]; return code; }`,
      `function id() { const bytes = crypto.getRandomValues(new Uint8Array(10)); let id = "";
         for (const byte of bytes) id += byte.toString(16).padStart(2, "0"); return id; }`,
      `export function token() { return randomBytes(32).toString("base64url"); }`,
      `function b64url(buf) { return buf.toString("base64").replace(/=+$/, ""); }
       export function opaque() { return b64url(randomBytes(32)); }`,
      // A remainder of something that is not a random byte.
      `function week(i) { return (i % 7) + randomBytes(4).length; }`,
    ];
    for (const text of passing) {
      const { picks, unresolved } = scan(text);
      assert.deepEqual(picks.filter((pick) => !pick.even), [], `flagged:\n${text}`);
      assert.deepEqual(unresolved, [], `not followed:\n${text}`);
    }
    assert.deepEqual(evenIn(passing[1]), ["byte % 32"]);
  });

  test("bytes that leave where they were drawn are reported, never skipped", () => {
    const left = (text) => scan(text).unresolved.map((flow) => flow.where);
    assert.deepEqual(left(`import { pick } from "./pick"; export function id() { return pick(randomBytes(6)); }`), ["handed to pick"]);
    assert.deepEqual(left(`export function bytes() { return crypto.getRandomValues(new Uint8Array(6)); }`), ["returned"]);
    assert.deepEqual(left(`export const bytes = () => randomBytes(6);`), ["returned"]);
    assert.deepEqual(left(`export function keep(box) { const bytes = randomBytes(6); box.bytes = bytes; }`), ["kept in a field"]);
    assert.deepEqual(left(`export function keep() { const bytes = randomBytes(6); return { bytes }; }`), ["kept in an object or an array"]);
    assert.deepEqual(left(`export function wrap() { return Buffer.from(randomBytes(6)); }`), ["handed to from"]);
    // A single byte handed to another module's function.
    assert.deepEqual(left(`import { letter } from "./letter"; export function id() { let out = ""; for (const byte of randomBytes(6)) out += letter(byte); return out; }`), [
      "handed to letter",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 2. The tree
// ---------------------------------------------------------------------------

describe("2. every character picked from a random byte in src is drawn evenly", () => {
  const tree = scanTree();

  test("no character is picked by a random byte's remainder without throwing bytes away", () => {
    const uneven = tree.flatMap(({ path, picks }) =>
      picks.filter((pick) => !pick.even).map((pick) => `${path}:${pick.line}  ${pick.text}`),
    );
    assert.deepEqual(
      uneven,
      [],
      "these pick a character by a random byte's remainder with no rejection: draw each character with randomInt " +
        "(node:crypto), or throw away bytes at or above the largest multiple of the alphabet's length, as " +
        "src/lib/firestore/slugId.ts does",
    );
  });

  test("the scan still sees the picks that throw bytes away", () => {
    const even = new Set(tree.flatMap(({ path, picks }) => picks.filter((pick) => pick.even).map(() => path)));
    for (const path of [
      "src/lib/firestore/slugId.ts",
      "src/lib/applications/editor/ids.ts",
      "src/lib/courses/weekBlocks/model.ts",
    ]) {
      assert.ok(even.has(path), `the scan no longer sees the even pick in ${path}: it has gone blind, or the file draws another way now`);
    }
  });

  test("random bytes that leave where they were drawn are listed with a reason, and the list holds nothing stale", () => {
    const found = tree.flatMap(({ path, unresolved }) => unresolved.map((flow) => ({ key: `${path}:${flow.line}`, ...flow })));
    for (const [key, reason] of HANDED_ON) assert.ok(reason.length > 20, `${key} is listed with no reason`);
    assert.deepEqual(
      found.filter((flow) => !HANDED_ON.has(flow.key)).map((flow) => `${flow.key}  ${flow.text}: ${flow.where}`),
      [],
      "random bytes leave the function that draws them, where this scan cannot see a character picked from them: " +
        "pick where they are drawn, or list the flow in HANDED_ON with why no character is picked from them",
    );
    const keys = new Set(found.map((flow) => flow.key));
    assert.deepEqual([...HANDED_ON.keys()].filter((key) => !keys.has(key)), [], "listed in HANDED_ON and no longer found");
  });
});
