/**
 * A request the page sends without waiting for its answer has to outlive the
 * page, or be a read.
 *
 * ## The bug this exists for
 *
 * A browser cancels every request still in flight when the page that sent it
 * goes away: a full page load, a closed tab, a link to another site. Code that
 * waits for a request shows the person it is waiting (a busy button, "Saving"),
 * so they stay until it is answered. Code that sends a request and carries on
 * gives them no reason to stay, and when they leave at once the request dies
 * with the page and what it was for never happens.
 *
 * The Approvals page did exactly that. Approve wrote the role, then posted to
 * `/api/admin/application-emails/send` without waiting, and that route takes
 * about half a second. In the course hub's browser specs the next page load
 * came 128 to 189 ms after the post began; the browser cancelled the post and
 * the welcome email was never sent. An admin who approves somebody and clicks
 * elsewhere straight away loses the email the same way, with no sign of it.
 *
 * `keepalive: true` is the platform's answer: the browser finishes the request
 * after the page has gone. Its one limit is size. The bodies of a page's
 * keepalive requests in flight at once may total 64 KB, and a request that
 * would pass that is refused outright (its promise rejects and nothing is
 * sent), so a body that can grow without bound must not take the flag.
 *
 * ## What this does
 *
 * It reads every module a `"use client"` file reaches (the walk in
 * `tests/lib/clientGraph.mjs`, shared with the client/server boundary guard)
 * with the TypeScript parser, finds every `fetch(...)`, and follows the promise
 * outward until something holds it. Following climbs through a `.then`,
 * `.catch` or `.finally` chain, through an argument handed to a call or an
 * element of an array (`Promise.all([...])`), and through brackets, `as`, `!`
 * and the branches of `?:`, `&&`, `||` and `??`. Then:
 *
 *  - WAITED FOR: awaited, or assigned to a name, or returned from a function
 *    whose every call this guard can find and each of which waits for it. A
 *    function's calls are found when it is a `.then`, `.catch`, `.finally`,
 *    `.map` or `.flatMap` callback (its value flows into that call), called on
 *    the spot, held by a name in this file (through `useCallback` too), or
 *    handed to a function declared in this file that calls the parameter.
 *  - NOT WAITED FOR: a statement on its own, or `void`.
 *
 * Two lines are drawn on purpose. An await is waiting: an async function that
 * awaits its request holds the code that uses the answer and shows the person
 * it is busy, whether or not anything waits for the function itself. And a
 * promise held by a name is taken as waited for, because what happens to it
 * next is that name's business (a ref a cleanup awaits, a list settled later).
 *
 * A request that is not waited for must pass `keepalive: true` in an options
 * object written where `fetch` is called, unless it is a READ: a GET (what a
 * call with no `method` sends) or a HEAD. A read changes nothing on the server
 * (`tests/get-handlers-readonly.test.mjs` holds every GET route to that), so
 * leaving cancels only an answer nobody is left to see. The writes are the
 * requests whose purpose dies with the page.
 *
 * ## What it reports instead of skipping
 *
 * Each of these fails with its file and line, never passes quietly:
 *
 *  - a request not waited for whose options this guard cannot read: options
 *    passed as a variable or built by a call, a spread that could carry
 *    `keepalive` or `method`, or a `keepalive` or `method` that is not written
 *    as a literal;
 *  - a promise that ends somewhere this guard does not read, or is returned
 *    from a function it cannot follow to its calls (a wrapper it cannot see
 *    through: exported, handed on as a value, handed to a function from
 *    another file, written in a JSX attribute);
 *  - `fetch` itself handed on as a value (`retry(fetch)`, `const f = fetch`),
 *    or a local binding named `fetch`, since the calls made through either
 *    are out of sight;
 *  - a `new Request(...)`, which can carry its own method and keepalive where
 *    the options this guard reads cannot show them.
 *
 * A request passing `keepalive: true` written at the call passes whatever
 * happens to its promise, so that flag is always a way out of the second
 * kind.
 *
 * ## The fix shape, when this test goes red
 *
 * Add `keepalive: true` to the options object at the call, and change nothing
 * else about the request. First check the body stays well under 64 KB at its
 * largest (the limits on the fields it carries are the usual proof). When the
 * person needs to know the request failed, waiting for it and saying so is the
 * better fix. When the body can grow past the limit, the call goes in
 * `ALLOWLIST` below with the reason, and the allowlist is checked in both
 * directions: an entry that names no failing call fails too.
 *
 * The last block of this file breaks the guard on purpose against the real
 * tree on every run: each request's flag taken off in turn must turn it red,
 * and so must an allowlist entry with no failing call behind it.
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { repoPath, walkClientGraph } from "./lib/clientGraph.mjs";

/**
 * Calls that may stay without `keepalive` although nothing waits for them.
 * Each names its file and its first argument exactly as written, and says why
 * the flag is wrong for it. Checked both ways: an entry must match exactly one
 * call this guard would otherwise fail.
 */
const ALLOWLIST = [
  {
    file: "src/features/admin/useCollaboratorVerification.ts",
    address: '"/api/admin/collaborators/verification"',
    reason:
      "A read sent as a POST so it can carry the list of collaborator ids. Its answer only fills " +
      "the Collaborators page, which drops it once it is left, so leaving loses nothing; and its " +
      "body grows with the number of collaborators, so keepalive's 64 KB limit could refuse it " +
      "outright.",
  },
];

// ---------------------------------------------------------------------------
// Reading one module
// ---------------------------------------------------------------------------

/** Methods that read: what leaving cancels is only an answer. */
const READS = new Set(["GET", "HEAD"]);
/** Methods of a promise that hand on a promise of their own. */
const CHAIN = new Set(["then", "catch", "finally"]);
/** Array methods whose callback's value lands in what the call returns. */
const FLOWS_INTO_RESULT = new Set(["map", "flatMap"]);
/** The globals `fetch` can be reached through as a property. */
const GLOBALS = new Set(["window", "globalThis", "self"]);
const LOGICAL = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
const ASSIGNMENT = new Set([
  ts.SyntaxKind.EqualsToken,
  ts.SyntaxKind.BarBarEqualsToken,
  ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  ts.SyntaxKind.QuestionQuestionEqualsToken,
]);
/** Far deeper than any wrapper in the tree; a guard against a loop it does not see. */
const MAX_DEPTH = 8;

const waited = (how) => ({ kind: "waited", how });
const notWaited = (how) => ({ kind: "not-waited", how });
const unresolved = (how) => ({ kind: "unresolved", how });

/** Not waited for anywhere beats unresolved anywhere, which beats waited for everywhere. */
function combine(fates) {
  return (
    fates.find((fate) => fate.kind === "not-waited") ??
    fates.find((fate) => fate.kind === "unresolved") ??
    waited(fates.map((fate) => fate.how).join("; "))
  );
}

/** Brackets and type assertions say nothing about where a value goes. */
function isTransparent(node) {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isTypeAssertionExpression(node)
  );
}

/** A node with the brackets and assertions around it climbed out of. */
function outermost(node) {
  let current = node;
  while (current.parent && isTransparent(current.parent)) current = current.parent;
  return current;
}

/** The name a property or method is called by, or null when it is computed. */
function memberName(name) {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNoSubstitutionTemplateLiteral(name)) return name.text;
  return null;
}

/** `x.name(...)` or `x?.name(...)`: the method's name, or null for anything else. */
function methodCalled(call) {
  return ts.isCallExpression(call) && ts.isPropertyAccessExpression(call.expression)
    ? call.expression.name.text
    : null;
}

/** Does this identifier stand for a value here, rather than name a property, a key or a type? */
function isValueUse(identifier) {
  const parent = identifier.parent;
  if (ts.isPropertyAccessExpression(parent) && parent.name === identifier) return false;
  if (ts.isQualifiedName(parent)) return false;
  if (ts.isTypeQueryNode(parent) || ts.isTypeReferenceNode(parent)) return false;
  // `typeof fetch === "function"` asks about it without calling it or handing it on.
  if (ts.isTypeOfExpression(parent)) return false;
  if (ts.isJsxAttribute(parent) && parent.name === identifier) return false;
  if (ts.isBindingElement(parent) && parent.propertyName === identifier) return false;
  if (
    (ts.isPropertyAssignment(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent) ||
      ts.isGetAccessorDeclaration(parent) ||
      ts.isSetAccessorDeclaration(parent) ||
      ts.isEnumMember(parent)) &&
    parent.name === identifier
  ) {
    return false;
  }
  return true;
}

/** Every identifier called `name` inside `scope` that stands for a value, `except` the one declaring it. */
function valueUsesOf(name, scope, except) {
  const uses = [];
  const visit = (node) => {
    if (ts.isIdentifier(node) && node.text === name && node !== except && isValueUse(node)) uses.push(node);
    ts.forEachChild(node, visit);
  };
  visit(scope);
  return uses;
}

const isExported = (node) =>
  (ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Export) !== 0;

/** `useCallback(fn, deps)` or `React.useCallback(fn, deps)`, which hands back `fn` itself. */
function isUseCallback(node) {
  if (!ts.isCallExpression(node)) return false;
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === "useCallback";
  return (
    ts.isPropertyAccessExpression(callee) &&
    callee.name.text === "useCallback" &&
    ts.isIdentifier(callee.expression) &&
    callee.expression.text === "React"
  );
}

/** The declarations that would give a module a binding of its own called `fetch`. */
const DECLARES = [
  ts.isVariableDeclaration,
  ts.isParameter,
  ts.isFunctionDeclaration,
  ts.isImportSpecifier,
  ts.isImportClause,
  ts.isBindingElement,
];

/**
 * Read one module. Returns every `fetch(...)` call, each with what it sends,
 * what happens to its promise, the verdict and its syntax node, plus the uses
 * of `fetch` that are not calls (`loose`), each with why it cannot be read.
 */
function readModule(fileName, text) {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const textOf = (node) => node.getText(source).replace(/\s+/g, " ");
  const kindOf = (node) => ts.SyntaxKind[node.kind];

  /** Every function this module declares under `name`, in any scope, `useCallback` seen through. */
  const declaredFunctions = (name) => {
    const found = [];
    const visit = (node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === name && node.body) found.push(node);
      else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
        let value = outermostInner(node.initializer);
        if (isUseCallback(value) && value.arguments[0]) value = outermostInner(value.arguments[0]);
        if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) found.push(value);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    return found;
  };

  /** Where a promise-valued expression goes, climbing until something holds it. */
  const fateOf = (start, depth, path) => {
    let node = start;
    for (;;) {
      const parent = node.parent;
      if (!parent) return unresolved("nothing holds it");
      if (isTransparent(parent)) {
        node = parent;
        continue;
      }
      // `p.then(...)`, `p.catch(...)`, `p.finally(...)`: the chain carries it on.
      if (
        ts.isPropertyAccessExpression(parent) &&
        parent.expression === node &&
        CHAIN.has(parent.name.text) &&
        ts.isCallExpression(parent.parent) &&
        parent.parent.expression === parent
      ) {
        node = parent.parent;
        continue;
      }
      // Handed to a call, or held in an array: it goes where that goes.
      if ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.arguments?.includes(node)) {
        node = parent;
        continue;
      }
      if (ts.isArrayLiteralExpression(parent)) {
        node = parent;
        continue;
      }
      if (ts.isConditionalExpression(parent) && parent.condition !== node) {
        node = parent;
        continue;
      }
      if (ts.isBinaryExpression(parent) && parent.right === node && LOGICAL.has(parent.operatorToken.kind)) {
        node = parent;
        continue;
      }
      if (ts.isAwaitExpression(parent)) return waited(`awaited, line ${lineOf(parent)}`);
      if (ts.isVariableDeclaration(parent) && parent.initializer === node) {
        return waited(`assigned, line ${lineOf(parent)}`);
      }
      if (ts.isPropertyDeclaration(parent) && parent.initializer === node) {
        return waited(`assigned, line ${lineOf(parent)}`);
      }
      if (ts.isBinaryExpression(parent) && parent.right === node && ASSIGNMENT.has(parent.operatorToken.kind)) {
        return waited(`assigned, line ${lineOf(parent)}`);
      }
      if (ts.isReturnStatement(parent)) {
        let fn = parent.parent;
        while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
        if (!fn) return unresolved(`returned at line ${lineOf(parent)} from outside any function`);
        return returnedFrom(fn, depth, path);
      }
      if (ts.isArrowFunction(parent) && parent.body === node) return returnedFrom(parent, depth, path);
      if (ts.isExpressionStatement(parent)) return notWaited(`a statement on its own, line ${lineOf(parent)}`);
      if (ts.isVoidExpression(parent)) return notWaited(`void, line ${lineOf(parent)}`);
      return unresolved(`held by ${kindOf(parent)} at line ${lineOf(parent)}, which this guard does not read`);
    }
  };

  /** The calls a function's return value goes to, followed to where each one goes. */
  const callsGo = (calls, depth, path) =>
    calls.length === 0 ? waited("never called") : combine(calls.map((call) => fateOf(call, depth + 1, path)));

  /** The uses of `name` in `scope`: each a direct call, or the reason this guard cannot follow it. */
  const callsOfName = (name, scope, except, what) => {
    const calls = [];
    for (const use of valueUsesOf(name, scope, except)) {
      const parent = use.parent;
      if (ts.isCallExpression(parent) && parent.expression === use) calls.push(parent);
      else return { cannot: unresolved(`${what} is handed on as a value at line ${lineOf(use)}`) };
    }
    return { calls };
  };

  /** Where the value a function returns goes. */
  const returnedFrom = (fn, depth, path) => {
    const label = `the function at line ${lineOf(fn)}`;
    if (depth >= MAX_DEPTH) return unresolved(`returned through more than ${MAX_DEPTH} functions`);
    if (path.includes(fn)) return waited("a call of itself");
    const next = [...path, fn];
    const holder = outermost(fn);
    const parent = holder.parent;

    // Called on the spot: `(() => fetch(...))()`.
    if (ts.isCallExpression(parent) && parent.expression === holder) return fateOf(parent, depth + 1, next);

    if (ts.isCallExpression(parent) && parent.arguments.includes(holder)) {
      const method = methodCalled(parent);
      // A promise chain's callback, or `.map`: its value lands in what the call returns.
      if (method && (CHAIN.has(method) || FLOWS_INTO_RESULT.has(method))) return fateOf(parent, depth + 1, next);
      // `const send = useCallback(fn, deps)` hands back `fn` itself.
      if (isUseCallback(parent) && parent.arguments[0] === holder) {
        const declaration = outermost(parent).parent;
        if (ts.isVariableDeclaration(declaration) && ts.isIdentifier(declaration.name)) {
          return followName(declaration.name, declaration, depth, next);
        }
        return unresolved(`returned from a useCallback at line ${lineOf(parent)} that no name holds`);
      }
      // Handed to a function this module declares: follow what it does with that parameter.
      const callee = ts.isIdentifier(parent.expression) ? parent.expression.text : null;
      if (callee) {
        const declared = declaredFunctions(callee);
        if (declared.length !== 1) {
          return unresolved(
            `returned to ${callee}() at line ${lineOf(parent)}, which ` +
              (declared.length === 0 ? "is not declared in this file" : "this file declares more than once"),
          );
        }
        const target = declared[0];
        const parameter = target.parameters[parent.arguments.indexOf(holder)];
        if (!parameter || parameter.dotDotDotToken || !ts.isIdentifier(parameter.name)) {
          return unresolved(`returned to ${callee}() at line ${lineOf(parent)}, through a parameter this guard cannot name`);
        }
        const { calls, cannot } = callsOfName(parameter.name.text, target.body, parameter.name, `${callee}()'s ${parameter.name.text}`);
        return cannot ?? callsGo(calls, depth, next);
      }
      return unresolved(`returned to ${textOf(parent.expression)}() at line ${lineOf(parent)}, which this guard cannot see into`);
    }

    // Held by a name: every use of the name must be a call this guard can follow.
    if (ts.isFunctionDeclaration(fn) && fn.name) return followName(fn.name, fn, depth, next);
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return followName(parent.name, parent, depth, next);

    return unresolved(`returned from ${label}, held by ${kindOf(parent)}, which this guard cannot follow to its calls`);
  };

  /** Follow every call of a named function. Exported means its calls are in other files. */
  const followName = (nameNode, declaration, depth, path) => {
    const name = nameNode.text;
    if (isExported(declaration)) {
      return unresolved(`returned from ${name}(), which is exported, so its calls are in other files`);
    }
    const { calls, cannot } = callsOfName(name, source, nameNode, `${name}`);
    return cannot ?? callsGo(calls, depth, path);
  };

  /** What the options object written at the call says, as far as this guard can read it. */
  const optionsOf = (call) => {
    const [address, init] = call.arguments;
    const addressCarriesInit = address !== undefined && ts.isNewExpression(outermostInner(address));
    if (init === undefined) return { keepalive: "absent", method: addressCarriesInit ? null : "GET" };
    const object = outermostInner(init);
    if (!ts.isObjectLiteralExpression(object)) {
      return { unreadable: `its options are ${textOf(init)}, not an object written at the call` };
    }
    let keepalive = "absent";
    let method = addressCarriesInit ? null : "GET";
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property)) {
        keepalive = "unreadable";
        method = null;
        continue;
      }
      const name = property.name ? memberName(property.name) : null;
      if (name === null) {
        keepalive = "unreadable";
        method = null;
        continue;
      }
      const value = ts.isPropertyAssignment(property) ? outermostInner(property.initializer) : null;
      if (name === "keepalive") {
        if (value?.kind === ts.SyntaxKind.TrueKeyword) keepalive = "true";
        else if (value?.kind === ts.SyntaxKind.FalseKeyword) keepalive = "false";
        else keepalive = "unreadable";
      } else if (name === "method") {
        method = value && (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value))
          ? value.text.toUpperCase()
          : null;
      }
    }
    return { keepalive, method };
  };

  const calls = [];
  const loose = [];
  const visit = (node) => {
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Request") {
      loose.push({
        line: lineOf(node),
        what: textOf(node).slice(0, 80),
        why: "a Request object can carry its own method and keepalive, which this guard does not read",
      });
    }
    const viaGlobal =
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "fetch" &&
      ts.isIdentifier(node.expression) &&
      GLOBALS.has(node.expression.text);
    const bare = ts.isIdentifier(node) && node.text === "fetch" && isValueUse(node);
    if (viaGlobal || bare) {
      const parent = node.parent;
      if (ts.isCallExpression(parent) && parent.expression === node) {
        calls.push(judge(parent));
      } else if (bare && DECLARES.some((declares) => declares(parent)) && parent.name === node) {
        loose.push({ line: lineOf(node), what: "fetch", why: "a local named fetch hides the browser's, so the calls through it are out of sight" });
      } else {
        loose.push({
          line: lineOf(node),
          what: textOf(parent).slice(0, 80),
          why: "fetch is handed on as a value, so the calls made through it are out of sight",
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  /** One call, judged. */
  const judge = (call) => {
    const address = call.arguments[0] ? textOf(call.arguments[0]) : "(nothing)";
    const options = optionsOf(call);
    const base = { line: lineOf(call), address, method: options.method ?? "?", node: call };
    if (options.keepalive === "true") return { ...base, verdict: "keepalive" };
    if (!options.unreadable && READS.has(options.method)) return { ...base, verdict: "read" };
    const fate = fateOf(call, 0, []);
    if (fate.kind === "waited") return { ...base, verdict: "waited", how: fate.how };
    if (fate.kind === "unresolved") {
      return { ...base, verdict: "unresolved", how: `this guard cannot tell what waits for it: ${fate.how}` };
    }
    if (options.unreadable) return { ...base, verdict: "unresolved", how: `not waited for (${fate.how}), and ${options.unreadable}` };
    if (options.keepalive === "unreadable") {
      return { ...base, verdict: "unresolved", how: `not waited for (${fate.how}), and keepalive is set in a way this guard cannot read` };
    }
    if (options.method === null) {
      return { ...base, verdict: "unresolved", how: `not waited for (${fate.how}), and this guard cannot read its method to tell a read from a write` };
    }
    return { ...base, verdict: "missing", how: `not waited for (${fate.how}), and no keepalive: true` };
  };

  visit(source);
  return { calls, loose };
}

/** An expression with its brackets and assertions taken off, from the inside. */
function outermostInner(node) {
  let current = node;
  while (isTransparent(current)) current = current.expression;
  return current;
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/** Read every module of the client graph that names fetch or Request, once. */
function readClientGraph({ sources, reached }) {
  const modules = [];
  for (const file of reached.keys()) {
    const text = sources.get(file);
    // A module that never names either has nothing here to read.
    if (!text.includes("fetch") && !text.includes("Request")) continue;
    modules.push({ file: repoPath(file), path: file, ...readModule(file, text) });
  }
  return modules;
}

/** Every call this guard fails, before the allowlist, as `{ file, line, address, verdict, how }`. */
function failingCalls(modules) {
  const out = [];
  for (const { file, calls } of modules) {
    for (const call of calls) {
      if (call.verdict === "missing" || call.verdict === "unresolved") out.push({ file, ...call });
    }
  }
  return out;
}

/** Split the failing calls by the allowlist: those it excuses, those it does not, and entries that match nothing. */
function applyAllowlist(failing, allowlist) {
  const excused = new Set();
  const stale = [];
  for (const entry of allowlist) {
    const matches = failing.filter((call) => call.file === entry.file && call.address === entry.address);
    if (matches.length !== 1) {
      stale.push(`${entry.file} ${entry.address}: matches ${matches.length} failing calls, not one`);
      continue;
    }
    excused.add(matches[0]);
  }
  return { open: failing.filter((call) => !excused.has(call)), stale };
}

const describeCall = (call) => `${call.file}:${call.line}  ${call.method} ${call.address}\n    ${call.how}`;

const graph = walkClientGraph();
const modules = readClientGraph(graph);
const allCalls = modules.flatMap(({ file, calls }) => calls.map((call) => ({ file, ...call })));
const failing = failingCalls(modules);
const { open, stale } = applyAllowlist(failing, ALLOWLIST);

describe("requests a page does not wait for outlive it", () => {
  test("the scan is not vacuous: it read the client graph and found its requests", () => {
    // A walk or a parser that found nothing would pass everything below.
    // These floors sit far under the counts on 27 Oct 2026: 809 modules
    // walked, 272 fetch calls in them, 17 sent without waiting that are not
    // reads (the ones this guard holds to the flag).
    assert.ok(graph.reached.size > 300, `only ${graph.reached.size} modules walked; the walk is broken`);
    assert.ok(allCalls.length > 100, `only ${allCalls.length} fetch calls found; the scan is broken`);
    const heldToTheFlag = allCalls.filter((call) => !["waited", "read"].includes(call.verdict)).length;
    assert.ok(heldToTheFlag > 5, `only ${heldToTheFlag} requests sent without waiting; the scan is broken`);
  });

  test("fetch is only ever called, and never through a Request this guard cannot read", () => {
    const loose = modules.flatMap(({ file, loose: found }) =>
      found.map((use) => `${file}:${use.line}  ${use.what}\n    ${use.why}`),
    );
    assert.deepEqual(
      loose,
      [],
      "this guard reads fetch calls where they are written. Call fetch directly with its options " +
        "at the call, or teach this guard to read the new form, before relying on it.",
    );
  });

  test("every request not waited for passes keepalive: true, or is a read", () => {
    assert.deepEqual(
      open.map(describeCall),
      [],
      "these requests are sent without waiting for the answer, or this guard cannot tell what " +
        "waits for them (each line says which). Leaving the page at once cancels a request nobody " +
        "waits for, and what it was for never happens. Add keepalive: true to the options object " +
        "at the call (check the body stays well under 64 KB), or wait for the answer when the " +
        "person must know it failed, or, when the body can grow past 64 KB, put the call in " +
        "ALLOWLIST with the reason. See the docblock at the top of this file.",
    );
  });

  test("the allowlist names only calls that need it, each with its reason", () => {
    assert.deepEqual(stale, [], "an allowlist entry no longer matches exactly one failing call: delete or correct it");
    for (const entry of ALLOWLIST) {
      assert.ok(
        typeof entry.reason === "string" && entry.reason.length > 60,
        `${entry.file} ${entry.address} needs a written reason, not a placeholder`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// The reader, held to each form it claims to read
// ---------------------------------------------------------------------------

/**
 * One small module per form, with the verdict each of its fetch calls gets
 * and how many uses of fetch it cannot read. A form this table does not hold
 * is a form nobody has checked the reader on.
 */
const POST = '{ method: "POST" }';
const FORMS = [
  ["an awaited write", `async function f() { await fetch("/a", ${POST}); }`, ["waited"]],
  ["a write left as a statement", `function f() { fetch("/a", ${POST}).catch(() => {}); }`, ["missing"]],
  ["a write thrown away with void", `function f() { void fetch("/a", ${POST}); }`, ["missing"]],
  ["a write with the flag", 'function f() { fetch("/a", { method: "POST", keepalive: true }).catch(() => {}); }', ["keepalive"]],
  ["a write with the flag set false", 'function f() { fetch("/a", { method: "POST", keepalive: false }); }', ["missing"]],
  ["a read with no options", 'function f() { fetch("/a").then((r) => r.json()); }', ["read"]],
  ["a read named as one", 'function f() { fetch("/a", { method: "head" }); }', ["read"]],
  ["a write held by a name", `function f() { const p = fetch("/a", ${POST}); return p; }`, ["waited"]],
  ["a write assigned to a ref", `function f(ref) { ref.current = fetch("/a", ${POST}); }`, ["waited"]],
  ["a write in an awaited Promise.all", `async function f() { await Promise.all([fetch("/a", ${POST})]); }`, ["waited"]],
  ["a write in a Promise.all left as a statement", `function f() { Promise.all([fetch("/a", ${POST})]); }`, ["missing"]],
  ["a write behind brackets and as", `async function f() { await (fetch("/a", ${POST}) as Promise<Response>); }`, ["waited"]],
  ["a write in a branch left as a statement", `function f(c) { c ? fetch("/a", ${POST}) : null; }`, ["missing"]],
  ["a write after && left as a statement", `function f(c) { c && fetch("/a", ${POST}); }`, ["missing"]],
  ["a write through window", `function f() { window.fetch("/a", ${POST}).catch(() => {}); }`, ["missing"]],
  ["options in a variable", 'function f(init) { fetch("/a", init).catch(() => {}); }', ["unresolved"]],
  ["options built by a call", 'function f(a) { void fetch("/a", put(a)); }', ["unresolved"]],
  ["a spread that could carry the flag", 'function f(init) { fetch("/a", { method: "POST", ...init }); }', ["unresolved"]],
  ["a spread before the flag", 'function f(init) { fetch("/a", { ...init, keepalive: true }); }', ["keepalive"]],
  ["a spread after the flag", 'function f(init) { fetch("/a", { keepalive: true, ...init }); }', ["unresolved"]],
  ["a flag from a variable", 'function f(leaving) { fetch("/a", { method: "POST", keepalive: leaving }); }', ["unresolved"]],
  ["a method from a variable", 'function f(m) { fetch("/a", { method: m }); }', ["unresolved"]],
  ["options in a variable, awaited", 'async function f(init) { await fetch("/a", init); }', ["waited"]],
  [
    "a wrapper whose call is awaited",
    `function send() { return fetch("/a", ${POST}); } async function g() { await send(); }`,
    ["waited"],
  ],
  [
    "a wrapper whose call is a statement",
    `function send() { return fetch("/a", ${POST}); } async function g() { await send(); send(); }`,
    ["missing"],
  ],
  ["an exported wrapper", `export function send() { return fetch("/a", ${POST}); }`, ["unresolved"]],
  ["an exported arrow", `export const send = () => fetch("/a", ${POST});`, ["unresolved"]],
  [
    "a wrapper handed on as a value",
    `const send = () => fetch("/a", ${POST}); function g() { other(send); }`,
    ["unresolved"],
  ],
  ["a wrapper nobody calls", `function send() { return fetch("/a", ${POST}); }`, ["waited"]],
  [
    "a request handed to a helper here that awaits it",
    `async function act(run) { await run(); } function g() { act(() => fetch("/a", ${POST})); }`,
    ["waited"],
  ],
  [
    "a request handed to a helper here that drops it",
    `function act(run) { run(); } function g() { act(() => fetch("/a", ${POST})); }`,
    ["missing"],
  ],
  [
    "a request handed to a helper from another file",
    `import { act } from "./x"; function g() { act(() => fetch("/a", ${POST})); }`,
    ["unresolved"],
  ],
  [
    "a request handed to forEach",
    `function g(ids) { ids.forEach((id) => fetch("/a", ${POST})); }`,
    ["unresolved"],
  ],
  [
    "requests mapped into an awaited Promise.all",
    `async function g(ids) { await Promise.all(ids.map((id) => fetch("/a", ${POST}))); }`,
    ["waited"],
  ],
  [
    "a request returned into a chain left as a statement",
    `function g(token) { token.then((t) => fetch("/a", ${POST})); }`,
    ["missing"],
  ],
  [
    "a request returned into an awaited chain",
    `async function g(token) { await token.then((t) => fetch("/a", ${POST})); }`,
    ["waited"],
  ],
  [
    "a request returned from a block body into a chain left as a statement",
    `function g(token) { token.then((t) => { return fetch("/a", ${POST}); }); }`,
    ["missing"],
  ],
  [
    "a request through useCallback, called as a statement",
    `function g() { const run = useCallback(() => fetch("/a", ${POST}), []); run(); }`,
    ["missing"],
  ],
  [
    "a request through React.useCallback, awaited",
    `function g() { const run = React.useCallback(() => fetch("/a", ${POST}), []); return async () => { await run(); }; }`,
    ["waited"],
  ],
  ["a request called on the spot", `function g() { (() => fetch("/a", ${POST}))(); }`, ["missing"]],
  [
    "a retry that calls itself, awaited",
    `function attempt(n) { return fetch("/a", ${POST}).catch(() => (n > 0 ? attempt(n - 1) : null)); } async function g() { await attempt(3); }`,
    ["waited"],
  ],
  ["a request in a JSX handler", `const B = () => <button onClick={() => fetch("/a", ${POST})} />;`, ["unresolved"], 0, "x.tsx"],
  ["fetch held by another name", 'const f = fetch; function g() { void f("/a"); }', [], 1],
  ["fetch handed to a helper", 'function g() { retry(fetch, "/a"); }', [], 1],
  ["a local named fetch", `function g(fetch) { fetch("/a", ${POST}); }`, ["missing"], 1],
  ["a Request object", `function g() { return new Request("/a", ${POST}); }`, [], 1],
  ["a typeof check", 'const ok = typeof fetch === "function";', [], 0],
  ["another API's fetch method", `function g(client) { client.fetch("/a", ${POST}); }`, [], 0],
];

describe("the reader behind this guard", () => {
  for (const [name, code, verdicts, loose = 0, fileName = "x.ts"] of FORMS) {
    test(name, () => {
      const read = readModule(fileName, code);
      assert.deepEqual(
        read.calls.map((call) => call.verdict),
        verdicts,
        read.calls.map((call) => `${call.verdict}: ${call.how ?? ""}`).join("\n"),
      );
      assert.equal(read.loose.length, loose, JSON.stringify(read.loose));
    });
  }
});

// ---------------------------------------------------------------------------
// This guard, broken on purpose against the real tree, both ways
// ---------------------------------------------------------------------------

/** The module's text with one call's `keepalive` key renamed, so the flag is gone and every line keeps its number. */
function withoutFlag(text, call) {
  const options = outermostInner(call.node.arguments[1]);
  const flag = options.properties.findLast((property) => property.name && memberName(property.name) === "keepalive");
  return text.slice(0, flag.name.getStart()) + "keepaliveTakenOff" + text.slice(flag.name.end);
}

/** The module's text with `keepalive: true` written first in one call's options. */
function withFlag(text, call) {
  const at = outermostInner(call.node.arguments[1]).getStart() + 1;
  return `${text.slice(0, at)} keepalive: true,${text.slice(at)}`;
}

describe("this guard, broken on purpose", () => {
  test("taking the flag off any request in the tree that carries it turns this guard red", () => {
    // Every request that passes today because of its flag is read again with
    // the flag taken off. One that nothing waits for must then fail; one that
    // is waited for, or a read, carried the flag as belt and braces.
    const red = [];
    const other = [];
    for (const scanned of modules) {
      const text = graph.sources.get(scanned.path);
      for (const call of scanned.calls.filter((found) => found.verdict === "keepalive")) {
        const again = readModule(scanned.path, withoutFlag(text, call)).calls.find(
          (found) => found.line === call.line && found.address === call.address,
        );
        const where = { file: scanned.file, line: call.line, address: call.address };
        if (again && (again.verdict === "missing" || again.verdict === "unresolved")) red.push(where);
        else if (!again || (again.verdict !== "waited" && again.verdict !== "read")) other.push(where);
      }
    }
    assert.deepEqual(other, [], "a request read again without its flag came back as something this guard does not name");
    // Sixteen on 27 Oct 2026: the ten the keepalive fix flagged and the six
    // that already had it. The floor only says the proof still has material.
    assert.ok(red.length > 5, `only ${red.length} requests turned red without their flag`);
    const excused = red.filter((where) =>
      ALLOWLIST.some((entry) => entry.file === where.file && entry.address === where.address),
    );
    assert.deepEqual(excused, [], "the allowlist would excuse these, so taking their flag off would not turn this guard red");
  });

  test("an allowlist entry that names no failing call turns this guard red", () => {
    const ghost = {
      file: "src/features/admin/ApprovalCard.tsx",
      address: '"/api/no-such-route"',
      reason: "An address no call in this file sends to, so no failing call answers to this entry.",
    };
    const { stale: found } = applyAllowlist(failing, [...ALLOWLIST, ghost]);
    assert.ok(found.includes(`${ghost.file} ${ghost.address}: matches 0 failing calls, not one`), found.join("\n"));
  });

  test("an allowlisted request that gains the flag leaves its entry stale, and that turns this guard red", () => {
    for (const entry of ALLOWLIST) {
      const scanned = modules.find((found) => found.file === entry.file);
      const call = scanned.calls.find((found) => found.address === entry.address);
      const flagged = { ...scanned, ...readModule(scanned.path, withFlag(graph.sources.get(scanned.path), call)) };
      const failingAfter = failingCalls(modules.map((found) => (found === scanned ? flagged : found)));
      const { stale: found } = applyAllowlist(failingAfter, ALLOWLIST);
      assert.ok(found.includes(`${entry.file} ${entry.address}: matches 0 failing calls, not one`), found.join("\n"));
    }
  });
});
