/**
 * No link wraps an article.
 *
 * Run with `npm test` (Node's built-in runner; the compiler's parser, no
 * program and no type check).
 *
 * ## Why
 *
 * In Chromium a link whose content is an `article` gets no accessible name:
 * `<a href="..."><article><h3>Words</h3></article></a>` is read as a link
 * with no name (checked on 26 Oct 2026), while the same link round a `div`, a
 * `section` or a `span` is named by its heading. My programmes' run cards were
 * unnamed links for that reason: `RunCard` built its card as
 * `<Card as="article">` in a variable and handed it to a `Link` as its
 * children.
 *
 * ## What this walks
 *
 * Every `.tsx` file under `src`, and every `.ts` file for its imports and
 * exports. It starts from EVERY PLACE AN ARTICLE IS MADE: an `<article>`
 * element, any element given `as="article"` (Card's, or any component that
 * takes its tag from `as`), and any element whose tag is a name bound to the
 * word. From each it follows the element outwards to everywhere it can end up:
 *
 *  - up through the JSX it sits in, past parentheses, conditions
 *    (`a ? b : c`, `a && b`, `a ?? b`), arrays and fragments;
 *  - into a variable that holds it, and on from every use of that variable, as
 *    RunCard's `card` was;
 *  - out of the function that returns it: from a component to every element
 *    that renders the component anywhere in `src`, from a helper to every call
 *    of it, from a `.map` or `useMemo` callback to the call;
 *  - into a component it is handed to, as children or as a prop: the walk
 *    follows that prop inside the component, the same way, to see whether the
 *    component puts it inside a link of its own, and then on from where the
 *    component is used.
 *
 * A LINK is an `<a>`, the default export of `next/link` under whatever name a
 * file gives it, the email components' `Link` and `Button`, or a package's
 * `X.a`. Reaching one is a failure, named by the
 * link's place and the article's. A component of this site that puts its
 * children inside a link (a `Link` wrapper) is found the same way, by
 * following the children into it. Route modules' default exports (a page, a
 * layout) are where the walk stops: Next renders them, and no layout puts its
 * children inside a link (the last test holds that).
 *
 * ## What it reports instead of skipping
 *
 * Whatever it cannot follow: an `as` it cannot read as a word, an article
 * handed to a package's component other than a link or React's own
 * containers, stored in an object or handed to a function, or a component
 * that renders one and is used as a value rather than an element. Each is in
 * `CANNOT_FOLLOW` with the reason it is safe, and the list is checked both
 * ways, so a new one fails here until somebody has looked at it.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { walkSource } from "./lib/functionScan.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const posix = (path) => path.split(sep).join("/");

/**
 * Everything the walk cannot follow from an article, by file and what it
 * met, with why it is safe. Empty: every article in the tree can be followed
 * to the place Next renders it.
 */
const CANNOT_FOLLOW = new Map([]);

/** React's own components, which render their children where they stand. */
const REACT_CONTAINERS = new Set(["Fragment", "Suspense", "StrictMode", "Profiler"]);

/** A package's components that render an `<a>` round their children, by package. */
const PACKAGE_LINKS = new Map([
  ["next/link", new Set(["default"])],
  ["@react-email/components", new Set(["Link", "Button"])],
]);

/** The files Next renders itself: a page and the layouts round it, where the walk stops. */
const ROUTE_FILES = new Set(["page", "layout", "template", "default", "error", "global-error", "not-found", "loading"]);

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/**
 * Reads `files` (path to text) as the modules under `srcRoot`, and follows
 * every article made in them outwards. Answers where each article is made,
 * how many links there are, every link that wraps an article, and everything
 * it could not follow.
 */
export function makeWalker(files, srcRoot) {
  const modules = new Map();
  for (const [file, text] of files) {
    const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    modules.set(file, { file, sf, exports: exportsOf(sf) });
  }
  const shown = (file) => posix(relative(dirname(srcRoot), file));
  const where = (mod, node) => `${shown(mod.file)}:${mod.sf.getLineAndCharacterOfPosition(node.getStart(mod.sf)).line + 1}`;
  const snippet = (mod, node) => node.getText(mod.sf).replace(/\s+/g, " ").slice(0, 70);

  const violations = [];
  const unresolved = new Set();
  const cannot = (mod, node, what) => unresolved.add(`${shown(mod.file)}: ${what}: ${snippet(mod, node)}`);

  function resolveSpec(fromFile, spec) {
    let base;
    if (spec.startsWith("@/")) base = join(srcRoot, spec.slice(2));
    else if (spec.startsWith("./") || spec.startsWith("../")) base = join(dirname(fromFile), spec);
    else return { pkg: spec };
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
      if (modules.has(candidate)) return { mod: modules.get(candidate) };
    }
    return { missing: spec };
  }

  /** A top-level function or variable of `mod`, by name, as the function that renders it. */
  function functionNamed(mod, name) {
    for (const st of mod.sf.statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return st;
      if (ts.isVariableStatement(st)) {
        for (const decl of st.declarationList.declarations) {
          if (ts.isIdentifier(decl.name) && decl.name.text === name) return functionIn(decl.initializer);
        }
      }
    }
    return null;
  }

  /** The function an expression is, through `memo(...)` and `forwardRef(...)`. */
  function functionIn(expr) {
    if (!expr) return null;
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) return expr;
    if (ts.isCallExpression(expr) && /^(?:React\.)?(?:memo|forwardRef)$/.test(expr.expression.getText())) return functionIn(expr.arguments[0]);
    if (ts.isParenthesizedExpression(expr)) return functionIn(expr.expression);
    return null;
  }

  /** What an exported name of `mod` is: a function of this site, a package's export, or null. */
  function resolveExport(mod, name, seen = new Set()) {
    const key = `${mod.file}#${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const entry = mod.exports.get(name);
    if (!entry) return null;
    if (entry.spec) {
      const target = resolveSpec(mod.file, entry.spec);
      return target.mod ? resolveExport(target.mod, entry.name, seen) : target.pkg ? { pkg: target.pkg, name: entry.name } : null;
    }
    if (entry.node) return { mod, fn: entry.node, name: entry.local ?? "default" };
    if (entry.expression) {
      if (ts.isIdentifier(entry.expression)) return { mod, fn: functionNamed(mod, entry.expression.text), name: entry.expression.text };
      return { mod, fn: functionIn(entry.expression), name: "default" };
    }
    const fn = functionNamed(mod, entry.local);
    if (fn) return { mod, fn, name: entry.local };
    const imported = importBinding(mod.sf, entry.local);
    return imported ? resolveImport(mod, imported, seen) : null;
  }

  function resolveImport(mod, binding, seen = new Set()) {
    const target = resolveSpec(mod.file, binding.spec);
    if (target.pkg) return { pkg: target.pkg, name: binding.name };
    if (!target.mod) return null;
    return resolveExport(target.mod, binding.name, seen);
  }

  /** What a name means at `node`: its declaration, searching outwards through the scopes that hold it. */
  function declarationOf(name, node) {
    for (let scope = node; scope; scope = scope.parent) {
      const found = declaredIn(scope, name);
      if (found) return found;
    }
    return null;
  }

  /** What the tag of a JSX element is: a word, a link, a function of this site, a package's, or a parameter. */
  function tagOf(mod, element) {
    const tag = ts.isJsxSelfClosingElement(element) || ts.isJsxOpeningElement(element) ? element.tagName : element.openingElement.tagName;
    // A tag that starts in lower case is the element of that name, whatever a
    // variable of the same name in scope holds (the news page has `article`).
    if (ts.isIdentifier(tag) && /^[a-z]/.test(tag.text)) return { word: tag.text };
    if (ts.isPropertyAccessExpression(tag)) {
      const last = tag.name.text;
      if (/^[a-z]/.test(last)) return { word: last };
      return { unknown: tag.getText(mod.sf) };
    }
    if (!ts.isIdentifier(tag)) return { unknown: tag.getText(mod.sf) };
    const decl = declarationOf(tag.text, tag);
    if (!decl) return { unknown: tag.text };
    if (decl.kind === "import") {
      const target = resolveImport(mod, decl);
      if (target?.pkg && PACKAGE_LINKS.get(target.pkg)?.has(target.name)) return { link: true };
      if (target?.pkg === "react" && REACT_CONTAINERS.has(target.name)) return { word: "fragment" };
      if (target?.pkg) return { pkg: `${target.pkg} ${target.name}` };
      if (target?.fn) return { component: target };
      return { unknown: tag.text };
    }
    if (decl.kind === "function" || decl.kind === "variable") {
      const fn = decl.kind === "function" ? decl.node : functionIn(decl.node.initializer);
      if (fn) return { component: { mod, fn, name: tag.text } };
      const init = decl.kind === "variable" ? decl.node.initializer : null;
      const words = init ? wordsOf(init) : null;
      if (words) return { words };
      return { unknown: tag.text };
    }
    if (decl.kind === "param") return { param: decl };
    return { unknown: tag.text };
  }

  /** Is this element a link, read in `ctx` (where a parameter's tag is the using element's word)? */
  function isLink(mod, element, ctx, quiet = false) {
    const tag = tagOf(mod, element);
    if (tag.link) return true;
    if (tag.word) return tag.word === "a";
    if (tag.words) return tag.words.includes("a");
    if (tag.param) {
      const words = paramTagWords(tag.param, ctx);
      if (words === null) {
        if (!quiet) cannot(mod, element, "a tag from a prop it cannot read");
        return false;
      }
      return words.includes("a");
    }
    return false;
  }

  /** The words a tag taken from a component's prop can be, from the element using it, or null when unreadable. */
  function paramTagWords(decl, ctx) {
    const prop = decl.prop;
    if (!prop || !ctx?.usage?.element || ctx.component !== decl.fn) return null;
    const attr = attributeOf(ctx.usage.element, prop);
    if (attr === undefined) {
      const fallback = decl.initializer ? wordsOf(decl.initializer) : null;
      return fallback ?? [];
    }
    return attr ? wordsOf(attr) : null;
  }

  // ----- following one article outwards -------------------------------------

  /**
   * Follows the value of `start` (an element, or an expression holding one)
   * outwards from where it is. `ctx.component`, when set, is the component
   * whose prop is being followed: reaching its return is where the walk goes
   * back to the element that used it.
   */
  function follow(mod, start, ctx, why) {
    const seenKey = `${mod.file}:${start.pos}:${start.end}:${ctx.usage ? ctx.usage.key : ""}`;
    if (ctx.seen.has(seenKey)) return;
    ctx.seen.add(seenKey);
    let node = start;
    for (;;) {
      const parent = node.parent;
      if (!parent || ts.isSourceFile(parent)) return;
      if (
        ts.isParenthesizedExpression(parent) ||
        ts.isAsExpression(parent) ||
        ts.isNonNullExpression(parent) ||
        (ts.isSatisfiesExpression && ts.isSatisfiesExpression(parent)) ||
        ts.isArrayLiteralExpression(parent) ||
        ts.isSpreadElement(parent) ||
        ts.isJsxFragment(parent)
      ) {
        node = parent;
        continue;
      }
      if (ts.isConditionalExpression(parent)) {
        if (node === parent.condition) return;
        node = parent;
        continue;
      }
      if (ts.isBinaryExpression(parent)) {
        const op = parent.operatorToken.kind;
        const passes =
          (op === ts.SyntaxKind.AmpersandAmpersandToken && node === parent.right) ||
          op === ts.SyntaxKind.BarBarToken ||
          op === ts.SyntaxKind.QuestionQuestionToken;
        if (!passes) return;
        node = parent;
        continue;
      }
      if (ts.isJsxExpression(parent)) {
        node = parent;
        continue;
      }
      if (ts.isJsxElement(parent) && parent.children.includes(node)) {
        if (isLink(mod, parent, ctx)) {
          violations.push({ link: where(mod, parent), article: why.article, via: [...why.via, where(mod, parent)] });
          return;
        }
        handedTo(mod, parent, "children", ctx, why);
        node = parent;
        continue;
      }
      if (ts.isJsxAttribute(parent)) {
        const element = parent.parent.parent;
        const prop = parent.name.getText(mod.sf);
        const tag = tagOf(mod, element);
        if (tag.word || tag.words) return;
        if (tag.link) {
          if (prop === "children") violations.push({ link: where(mod, element), article: why.article, via: [...why.via, where(mod, element)] });
          return;
        }
        handedTo(mod, ts.isJsxOpeningElement(element) ? element.parent : element, prop, ctx, why);
        node = ts.isJsxOpeningElement(element) ? element.parent : element;
        continue;
      }
      if (ts.isReturnStatement(parent)) {
        returned(mod, enclosingFunction(parent), ctx, why);
        return;
      }
      if ((ts.isArrowFunction(parent) || ts.isFunctionExpression(parent)) && parent.body === node) {
        returned(mod, parent, ctx, why);
        return;
      }
      if (ts.isVariableDeclaration(parent) && parent.initializer === node && ts.isIdentifier(parent.name)) {
        for (const use of usesOfVariable(parent)) follow(mod, use, ctx, { ...why, via: [...why.via, `${parent.name.text} at ${where(mod, use)}`] });
        return;
      }
      if (ts.isCallExpression(parent) && parent.arguments.includes(node)) {
        if (/^(?:React\.)?cloneElement$/.test(parent.expression.getText(mod.sf))) {
          node = parent;
          continue;
        }
        cannot(mod, parent, "an article handed to a function");
        return;
      }
      if (ts.isExpressionStatement(parent)) return;
      cannot(mod, parent, `an article in a ${ts.SyntaxKind[parent.kind]}`);
      return;
    }
  }

  /** The value has been handed to `element`'s prop `prop`: follow it inside, if the element is a component of this site. */
  function handedTo(mod, element, prop, ctx, why) {
    const tag = tagOf(mod, element);
    if (tag.word || tag.words || tag.link || tag.param) return;
    if (tag.pkg) {
      cannot(mod, element, `an article handed to ${tag.pkg}`);
      return;
    }
    if (!tag.component?.fn) {
      cannot(mod, element, "an article handed to a component it cannot find");
      return;
    }
    const { mod: home, fn } = tag.component;
    const usageKey = `${mod.file}:${element.pos}:${prop}`;
    if (ctx.stack.includes(`${home.file}:${fn.pos}:${prop}`)) return;
    const inner = { seen: ctx.seen, stack: [...ctx.stack, `${home.file}:${fn.pos}:${prop}`], component: fn, usage: { element, key: usageKey } };
    for (const use of usesOfProp(home, fn, prop, inner, why)) follow(home, use, inner, { ...why, via: [...why.via, `${prop} of ${where(mod, element)}`] });
  }

  /** The value is what `fn` returns: go on from wherever its result goes. */
  function returned(mod, fn, ctx, why) {
    if (!fn) {
      cannot(mod, mod.sf, "an article returned from outside a function");
      return;
    }
    if (ctx.component === fn) return;
    const parent = fn.parent;
    if (ts.isCallExpression(parent) && parent.arguments.includes(fn)) {
      const callee = parent.expression.getText(mod.sf);
      if (/\.(?:map|flatMap)$/.test(callee) || /^(?:React\.)?useMemo$/.test(callee)) {
        follow(mod, parent, ctx, why);
        return;
      }
    }
    const named = nameOfFunction(mod, fn);
    if (!named) {
      cannot(mod, fn, "an article returned from a function it cannot name");
      return;
    }
    if (named.routeRoot) return;
    if (named.component) {
      for (const use of rendersOf(named)) {
        follow(use.mod, use.element, { seen: ctx.seen, stack: [], component: null, usage: null }, { ...why, via: [...why.via, where(use.mod, use.element)] });
      }
      return;
    }
    for (const call of callsOf(named)) follow(call.mod, call.node, { seen: ctx.seen, stack: [], component: null, usage: null }, { ...why, via: [...why.via, where(call.mod, call.node)] });
  }

  /** A function's name, whether it is a component, and whether Next renders it itself. */
  function nameOfFunction(mod, fn) {
    let name = null;
    let exportedDefault = false;
    if (ts.isFunctionDeclaration(fn)) {
      name = fn.name?.text ?? "default";
      exportedDefault = (fn.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    } else {
      let holder = fn.parent;
      while (holder && (ts.isParenthesizedExpression(holder) || (ts.isCallExpression(holder) && /^(?:React\.)?(?:memo|forwardRef)$/.test(holder.expression.getText(mod.sf))))) holder = holder.parent;
      if (holder && ts.isVariableDeclaration(holder) && ts.isIdentifier(holder.name)) name = holder.name.text;
      else if (holder && ts.isExportAssignment(holder)) {
        name = "default";
        exportedDefault = true;
      }
    }
    if (!name) return null;
    const defaultEntry = mod.exports.get("default");
    if (!exportedDefault && defaultEntry?.expression && ts.isIdentifier(defaultEntry.expression) && defaultEntry.expression.text === name) exportedDefault = true;
    const routeRoot = exportedDefault && ROUTE_FILES.has(basename(mod.file).replace(/\.tsx?$/, "")) && posix(mod.file).includes("/app/");
    return { mod, fn, name, exportedDefault, routeRoot, component: name === "default" || /^[A-Z]/.test(name) };
  }

  /** Is `found` (an export resolved from somewhere) the function `named`? */
  const isTheFunction = (found, named) => found && found.mod === named.mod && found.fn === named.fn;

  /** The local names, in each module, that mean `named`. */
  function bindingsOf(named) {
    const out = [];
    for (const mod of modules.values()) {
      if (mod === named.mod && named.name !== "default") out.push({ mod, name: named.name, top: true });
      for (const st of mod.sf.statements) {
        if (!ts.isImportDeclaration(st) || !st.importClause || st.importClause.isTypeOnly) continue;
        for (const binding of bindingsOfImport(st)) {
          if (isTheFunction(resolveImport(mod, binding), named)) out.push({ mod, name: binding.local, top: true });
        }
      }
    }
    return out;
  }

  /** Every element in `src` that renders the component `named`, and every use of it as a value, reported. */
  function rendersOf(named) {
    const out = [];
    for (const { mod, name } of bindingsOf(named)) {
      visit(mod.sf, (node) => {
        if (!ts.isIdentifier(node) || node.text !== name) return;
        const decl = declarationOf(name, node);
        const declared = decl && (decl.kind === "import" || decl.kind === "function" || decl.kind === "variable");
        if (!declared || isDeclarationName(node) || isPropertyName(node) || inImportOrExport(node) || inType(node)) return;
        const parent = node.parent;
        if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent)) && parent.tagName === node) {
          out.push({ mod, element: ts.isJsxOpeningElement(parent) ? parent.parent : parent });
          return;
        }
        if (ts.isJsxClosingElement(parent)) return;
        if (ts.isExportAssignment(parent)) return;
        cannot(mod, node, `${name}, which renders an article, used as a value`);
      });
    }
    return out;
  }

  /** Every call of the helper `named` in `src`: called by name, or handed to `.map` as its callback. */
  function callsOf(named) {
    const out = [];
    for (const { mod, name } of bindingsOf(named)) {
      visit(mod.sf, (node) => {
        if (!ts.isIdentifier(node) || node.text !== name || isDeclarationName(node) || isPropertyName(node) || inImportOrExport(node) || inType(node)) return;
        const parent = node.parent;
        if (ts.isCallExpression(parent) && parent.expression === node) out.push({ mod, node: parent });
        else if (ts.isCallExpression(parent) && parent.arguments.includes(node) && /\.(?:map|flatMap)$/.test(parent.expression.getText(mod.sf))) {
          out.push({ mod, node: parent });
        } else cannot(mod, node, `${name}, which returns an article, used as a value`);
      });
    }
    return out;
  }

  /**
   * Every place inside the component `fn` where its prop `prop` is used as a
   * value, for the walk to follow; and a prop spread onto an element is
   * followed into that element.
   */
  function usesOfProp(home, fn, prop, ctx, why) {
    const out = [];
    const param = fn.parameters?.[0];
    if (!param) return out;
    const fromPattern = (pattern) => {
      let rest = null;
      for (const element of pattern.elements) {
        if (element.dotDotDotToken) rest = element.name;
        else if ((element.propertyName ?? element.name).getText(home.sf) === prop && ts.isIdentifier(element.name)) {
          out.push(...usesOfName(element.name, fn));
          return;
        }
      }
      if (rest && ts.isIdentifier(rest)) whole(rest);
    };
    const whole = (ident) => {
      for (const use of usesOfName(ident, fn)) {
        const parent = use.parent;
        if (ts.isJsxSpreadAttribute(parent)) {
          const element = parent.parent.parent;
          const container = ts.isJsxOpeningElement(element) ? element.parent : element;
          const hasChildren = ts.isJsxElement(container) && container.children.some((child) => !ts.isJsxText(child) || child.text.trim() !== "");
          if (prop === "children" && !hasChildren && isLink(home, element, ctx)) {
            violations.push({ link: where(home, element), article: why.article, via: [...why.via, where(home, element)] });
          } else if (prop !== "children" || !hasChildren) {
            handedTo(home, container, prop, ctx, why);
            follow(home, container, ctx, why);
          }
        } else if (ts.isPropertyAccessExpression(parent) && parent.expression === use) {
          if (parent.name.text === prop) out.push(parent);
        } else if (ts.isVariableDeclaration(parent) && parent.initializer === use && ts.isObjectBindingPattern(parent.name)) {
          fromPattern(parent.name);
        } else {
          cannot(home, use, `the props of a component an article is handed to, used whole`);
        }
      }
    };
    if (ts.isObjectBindingPattern(param.name)) fromPattern(param.name);
    else if (ts.isIdentifier(param.name)) whole(param.name);
    return out;
  }

  // ----- where an article is made ------------------------------------------

  /** Every article made in the modules, followed outwards. */
  function walk() {
  const sites = [];
  let links = 0;
  for (const mod of modules.values()) {
    if (!mod.file.endsWith(".tsx")) continue;
    visit(mod.sf, (node) => {
      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
      const element = ts.isJsxOpeningElement(node) ? node.parent : node;
      if (isLink(mod, node, null, true)) links += 1;
      const tag = tagOf(mod, node);
      let made = tag.word === "article" || Boolean(tag.words?.includes("article"));
      const as = attributeOf(node, "as");
      if (as !== undefined && !tag.word) {
        const words = as ? wordsOf(as) : null;
        if (words === null) cannot(mod, node, "an as it cannot read as a word");
        else if (words.includes("article")) made = true;
      }
      if (!made) return;
      const article = where(mod, node);
      sites.push(article);
      follow(mod, element, { seen: new Set(), stack: [], component: null, usage: null }, { article, via: [article] });
    });
  }
  return { sites, links, violations: [...violations], unresolved: [...unresolved].sort() };
  }

  /**
   * Where the default export of `file` puts the children it is handed: every
   * link it puts them inside, as an article handed to it as children would
   * meet one. Empty when they reach no link.
   */
  function childrenLinks(file) {
    const mod = modules.get(file);
    const entry = mod ? resolveExport(mod, "default") : null;
    if (!entry?.fn) return [`${shown(file)}: no default export the walk can read`];
    const before = violations.length;
    const ctx = { seen: new Set(), stack: [], component: entry.fn, usage: { element: null, key: `children of ${file}` } };
    const why = { article: "its children", via: [] };
    for (const use of usesOfProp(mod, entry.fn, "children", ctx, why)) follow(mod, use, ctx, why);
    return violations.splice(before).map((v) => v.link);
  }

  return { walk, childrenLinks };
}

/** Every article made in `files` (path to text, the modules under `srcRoot`), followed outwards. */
export function walkArticles(files, srcRoot) {
  return makeWalker(files, srcRoot).walk();
}

// ---------------------------------------------------------------------------
// Reading syntax
// ---------------------------------------------------------------------------

function visit(node, fn) {
  fn(node);
  ts.forEachChild(node, (child) => visit(child, fn));
}

function exportsOf(sf) {
  const exports = new Map();
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && st.exportClause && ts.isNamedExports(st.exportClause) && !st.isTypeOnly) {
      for (const el of st.exportClause.elements) {
        const local = (el.propertyName ?? el.name).text;
        exports.set(el.name.text, st.moduleSpecifier ? { spec: st.moduleSpecifier.text, name: local } : { local });
      }
    }
    if (ts.isExportAssignment(st) && !st.isExportEquals) exports.set("default", { expression: st.expression });
    const modifiers = ts.canHaveModifiers(st) ? (ts.getModifiers(st) ?? []) : [];
    const exported = modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    const isDefault = modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
    if (exported && ts.isFunctionDeclaration(st)) exports.set(isDefault ? "default" : st.name.text, { local: st.name?.text ?? null, node: st });
    if (exported && ts.isVariableStatement(st)) {
      for (const decl of st.declarationList.declarations) if (ts.isIdentifier(decl.name)) exports.set(decl.name.text, { local: decl.name.text });
    }
  }
  return exports;
}

function bindingsOfImport(st) {
  const out = [];
  const spec = st.moduleSpecifier.text;
  const clause = st.importClause;
  if (clause.name) out.push({ kind: "import", spec, name: "default", local: clause.name.text });
  const named = clause.namedBindings;
  if (named && ts.isNamedImports(named)) {
    for (const el of named.elements) if (!el.isTypeOnly) out.push({ kind: "import", spec, name: (el.propertyName ?? el.name).text, local: el.name.text });
  }
  return out;
}

function importBinding(sf, name) {
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !st.importClause || st.importClause.isTypeOnly) continue;
    const found = bindingsOfImport(st).find((binding) => binding.local === name);
    if (found) return found;
  }
  return null;
}

/** The binding named `name` in a binding name (an identifier or a pattern), and the prop it takes, or null. */
function bindingNamed(nameNode, name, prop = null) {
  if (ts.isIdentifier(nameNode)) return nameNode.text === name ? { node: nameNode, prop } : null;
  for (const element of nameNode.elements ?? []) {
    if (ts.isOmittedExpression(element)) continue;
    const key = element.propertyName ? element.propertyName.getText() : ts.isIdentifier(element.name) ? element.name.text : null;
    const hit = bindingNamed(element.name, name, element.dotDotDotToken ? null : key);
    if (hit) return { ...hit, initializer: hit.node === element.name ? element.initializer : hit.initializer };
  }
  return null;
}

/** A name declared directly in `scope`, and what declares it. */
function declaredIn(scope, name) {
  if (ts.isFunctionLike(scope)) {
    for (const param of scope.parameters ?? []) {
      const hit = bindingNamed(param.name, name);
      if (hit) return { kind: "param", node: hit.node, fn: scope, prop: hit.prop, initializer: hit.initializer ?? null };
    }
    if (ts.isFunctionExpression(scope) && scope.name?.text === name) return { kind: "function", node: scope };
  }
  const statements = ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope) || ts.isCaseClause(scope) || ts.isDefaultClause(scope) ? scope.statements : null;
  if (statements) {
    for (const st of statements) {
      if (ts.isFunctionDeclaration(st) && st.name?.text === name) return { kind: "function", node: st };
      if (ts.isClassDeclaration(st) && st.name?.text === name) return { kind: "class", node: st };
      if (ts.isVariableStatement(st)) {
        for (const decl of st.declarationList.declarations) {
          const hit = bindingNamed(decl.name, name);
          if (hit) return ts.isIdentifier(decl.name) ? { kind: "variable", node: decl } : { kind: "destructured", node: decl };
        }
      }
      if (ts.isImportDeclaration(st) && st.importClause && !st.importClause.isTypeOnly) {
        const binding = bindingsOfImport(st).find((each) => each.local === name);
        if (binding) return binding;
      }
    }
  }
  if ((ts.isForStatement(scope) || ts.isForOfStatement(scope) || ts.isForInStatement(scope)) && scope.initializer && ts.isVariableDeclarationList(scope.initializer)) {
    for (const decl of scope.initializer.declarations) if (bindingNamed(decl.name, name)) return { kind: "loop", node: decl };
  }
  if (ts.isCatchClause(scope) && scope.variableDeclaration && bindingNamed(scope.variableDeclaration.name, name)) return { kind: "catch" };
  return null;
}

function isDeclarationName(node) {
  const parent = node.parent;
  return (
    ((ts.isVariableDeclaration(parent) || ts.isFunctionDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent) || ts.isClassDeclaration(parent)) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.propertyName === node)
  );
}

function isPropertyName(node) {
  const parent = node.parent;
  return (
    (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
    (ts.isPropertyAssignment(parent) && parent.name === node) ||
    ts.isJsxAttribute(parent) ||
    (ts.isQualifiedName(parent) && parent.right === node) ||
    ts.isPropertySignature(parent) ||
    ts.isMethodDeclaration(parent)
  );
}

function inImportOrExport(node) {
  for (let up = node.parent; up; up = up.parent) {
    if (ts.isImportDeclaration(up) || ts.isExportDeclaration(up)) return true;
    if (ts.isStatement(up)) return false;
  }
  return false;
}

function inType(node) {
  for (let up = node.parent; up; up = up.parent) {
    if (ts.isTypeNode(up)) return true;
    if (ts.isStatement(up) || ts.isExpression(up)) return false;
  }
  return false;
}

function enclosingFunction(node) {
  for (let up = node.parent; up; up = up.parent) if (ts.isFunctionLike(up)) return up;
  return null;
}

/** Every use of the variable `decl` declares, by the same scope rules as everything else here. */
function usesOfVariable(decl) {
  return usesOfName(decl.name, null);
}

/** Every use of the binding `nameNode`, within its scope. */
function usesOfName(nameNode, fn) {
  const name = nameNode.text;
  const target = declarationOf(name, nameNode);
  const scope = fn ?? nameNode.parent;
  let top = scope;
  while (top.parent && !ts.isSourceFile(top)) top = top.parent;
  const out = [];
  visit(top, (node) => {
    if (!ts.isIdentifier(node) || node === nameNode || node.text !== name) return;
    if (isDeclarationName(node) || isPropertyName(node) || inImportOrExport(node) || inType(node)) return;
    const parent = node.parent;
    if ((ts.isJsxOpeningElement(parent) || ts.isJsxSelfClosingElement(parent) || ts.isJsxClosingElement(parent)) && parent.tagName === node) return;
    const found = declarationOf(name, node);
    if (found && target && found.node === target.node) out.push(ts.isShorthandPropertyAssignment(parent) ? node : node);
  });
  return out;
}

function declarationOf(name, node) {
  for (let scope = node; scope; scope = scope.parent) {
    const found = declaredIn(scope, name);
    if (found) return found;
  }
  return null;
}

/** The value of attribute `name` on an opening element: undefined when absent, null when it is not an expression to read. */
function attributeOf(opening, name) {
  const attributes = (ts.isJsxElement(opening) ? opening.openingElement : opening).attributes.properties;
  for (const attr of attributes) {
    if (!ts.isJsxAttribute(attr) || attr.name.getText() !== name) continue;
    if (!attr.initializer) return null;
    if (ts.isStringLiteral(attr.initializer)) return attr.initializer;
    if (ts.isJsxExpression(attr.initializer)) return attr.initializer.expression ?? null;
    return null;
  }
  return undefined;
}

/** The words an expression can be, read without running it, or null when it cannot be read as words. */
function wordsOf(expr) {
  if (!expr) return null;
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return [expr.text];
  if (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr)) return wordsOf(expr.expression);
  if (ts.isConditionalExpression(expr)) {
    const a = wordsOf(expr.whenTrue);
    const b = wordsOf(expr.whenFalse);
    return a && b ? [...a, ...b] : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

function sourceFiles() {
  const files = new Map();
  for (const file of walkSource(SRC)) files.set(file, readFileSync(file, "utf8"));
  return files;
}

const walker = makeWalker(sourceFiles(), SRC);
const tree = walker.walk();

describe("the tree", () => {
  test("the walk reads the tree: the links, and the articles it knows by name", () => {
    assert.ok(tree.links >= 500, `only ${tree.links} links found`);
    for (const known of [
      "src/app/(public)/ThisTerm.tsx",
      // Its own `article` variable once hid this page's article from the walk.
      "src/app/(public)/news/[slug]/page.tsx",
      "src/features/admin/ApprovalCard.tsx",
      "src/features/admissions/AppointmentsQueue.tsx",
      "src/features/courses/RunCard.tsx",
    ]) {
      assert.ok(tree.sites.some((site) => site.startsWith(`${known}:`)), `no article found in ${known}`);
    }
    assert.ok(tree.sites.length >= 15, `only ${tree.sites.length} articles found`);
  });

  test("no link wraps an article", () => {
    assert.deepEqual(
      tree.violations.map((v) => `the link at ${v.link} wraps the article made at ${v.article} (${v.via.join(" > ")})`),
      [],
      "A link whose content is an article has no accessible name in Chromium. Make the card inside the link a div (Card as=\"div\"), as RunCard's and the left card's are.",
    );
  });

  test("everything the walk cannot follow is listed, with why it is safe, and nothing more", () => {
    assert.deepEqual(tree.unresolved, [...CANNOT_FOLLOW.keys()].sort());
    for (const [what, why] of CANNOT_FOLLOW) assert.ok(why.length >= 40, `${what}: the reason is missing or too short`);
  });
});

// ---------------------------------------------------------------------------
// The walk, on shapes made for it
// ---------------------------------------------------------------------------

const FIXTURE = "/fixture/src";
const fixture = (files) =>
  walkArticles(new Map(Object.entries(files).map(([path, text]) => [`${FIXTURE}/${path}`, text])), FIXTURE);
const CARD =
  'export default function Card({ as: Tag = "div", children, ...rest }) { return <Tag {...rest}>{children}</Tag>; }';
const found = (result) => result.violations.map((v) => `${v.link} < ${v.article}`);

describe("the walk sees each way a link can come to wrap an article", () => {
  test("an article written inside a link, and one inside an a, whatever a variable in scope is called", () => {
    const result = fixture({
      "One.tsx":
        'import Link from "next/link";\nexport default function One({ article }) {\n  return <Link href="/x"><article><h3>{article.title}</h3></article></Link>;\n}',
      "Two.tsx": 'export default function Two() {\n  return (\n    <a href="/y">\n      <div><article /></div>\n    </a>\n  );\n}',
    });
    assert.deepEqual(found(result), ["src/One.tsx:3 < src/One.tsx:3", "src/Two.tsx:3 < src/Two.tsx:4"]);
  });

  test("RunCard's old shape: Card as=article built into a variable, then handed to a link as its children", () => {
    const result = fixture({
      "ui/Card.tsx": CARD,
      "RunCard.tsx":
        'import Link from "next/link";\nimport Card from "./ui/Card";\nexport default function RunCard({ linked }) {\n' +
        '  const card = (\n    <Card as="article" padding="md">\n      <h3>Title</h3>\n    </Card>\n  );\n' +
        "  if (!linked) return card;\n  return (\n    <Link href=\"/learn/r\">\n      {card}\n    </Link>\n  );\n}",
      "Hub.tsx": 'import RunCard from "./RunCard";\nexport default function Hub() { return <ul><li><RunCard linked /></li></ul>; }',
    });
    assert.deepEqual(found(result), ["src/RunCard.tsx:11 < src/RunCard.tsx:5"]);
  });

  test("a component whose output is an article, rendered inside a link in another file, under another name", () => {
    const result = fixture({
      "Story.tsx": "export function Story() { return <article><h3>A story</h3></article>; }",
      "List.tsx":
        'import NextLink from "next/link";\nimport { Story as Item } from "./Story";\nexport default function List({ ids }) {\n' +
        '  return <ul>{ids.map((id) => (<li key={id}><NextLink href={id}><Item /></NextLink></li>))}</ul>;\n}',
    });
    assert.deepEqual(found(result), ["src/List.tsx:4 < src/Story.tsx:1"]);
  });

  test("a component of the site that puts its children inside a link, handed an article", () => {
    const result = fixture({
      "Out.tsx": 'export function Out({ href, children }) { return <a href={href} rel="noopener">{children}</a>; }',
      "Spread.tsx": 'import Link from "next/link";\nexport function Spread(props) { return <Link {...props} />; }',
      "Use.tsx":
        'import { Out } from "./Out";\nimport { Spread } from "./Spread";\nexport default function Use() {\n' +
        '  return (<>\n    <Out href="/a"><article /></Out>\n    <Spread href="/b"><article /></Spread>\n  </>);\n}',
    });
    assert.deepEqual(found(result), ["src/Out.tsx:1 < src/Use.tsx:5", "src/Spread.tsx:2 < src/Use.tsx:6"]);
  });

  test("through a condition, a fragment, a list and a helper that returns it", () => {
    const result = fixture({
      "Mixed.tsx":
        'import Link from "next/link";\nfunction story(n) { return n > 1 ? <article key={n} /> : null; }\n' +
        "export default function Mixed({ show, items }) {\n" +
        '  return <Link href="/m">{show && <>{items.map((n) => story(n))}</>}</Link>;\n}',
    });
    assert.deepEqual(found(result), ["src/Mixed.tsx:4 < src/Mixed.tsx:2"]);
  });

  test("a helper handed to .map by name, its articles inside a link", () => {
    const result = fixture({
      "Cards.tsx":
        'import Link from "next/link";\nconst card = (c) => <article key={c}>{c}</article>;\n' +
        'export default function Cards({ items }) {\n  return <Link href="/z">{items.map(card)}</Link>;\n}',
    });
    assert.deepEqual(found(result), ["src/Cards.tsx:4 < src/Cards.tsx:2"]);
    assert.deepEqual(result.unresolved, []);
  });

  test("nothing is found where no link wraps an article", () => {
    const result = fixture({
      "ui/Card.tsx": CARD,
      "Fine.tsx":
        'import Link from "next/link";\nimport Card from "./ui/Card";\nexport default function Fine() {\n' +
        "  return (<>\n" +
        '    <Link href="/1"><div><h3>A div</h3></div></Link>\n' +
        '    <Link href="/2"><section><h3>A section</h3></section></Link>\n' +
        '    <Link href="/3"><span>A span</span></Link>\n' +
        '    <Link href="/4"><Card as="div"><h3>Card as a div</h3></Card></Link>\n' +
        '    <article><Link href="/5">A link inside an article</Link></article>\n' +
        '    <Card as="article"><h3>An article on its own</h3></Card>\n' +
        "  </>);\n}",
    });
    assert.deepEqual(found(result), []);
    assert.deepEqual(result.unresolved, []);
    assert.equal(result.sites.length, 2);
    assert.equal(result.links, 5);
  });

  test("what it cannot follow is reported, never skipped", () => {
    const result = fixture({
      "Odd.tsx":
        'import Card from "./Card";\nimport { Motion } from "some-package";\nexport default function Odd({ tag }) {\n' +
        "  const kept = { card: <article /> };\n" +
        "  return (<>\n    <Card as={tag} />\n    <Motion><article /></Motion>\n    {String(<article />)}\n  </>);\n}",
      "Card.tsx": CARD,
    });
    assert.deepEqual(result.unresolved, [
      "src/Odd.tsx: an article handed to a function: String(<article />)",
      "src/Odd.tsx: an article handed to some-package Motion: <Motion><article /></Motion>",
      "src/Odd.tsx: an article in a PropertyAssignment: card: <article />",
      "src/Odd.tsx: an as it cannot read as a word: <Card as={tag} />",
    ]);
  });
});

describe("no layout puts its children inside a link", () => {
  test("every layout and template renders its children outside any link", () => {
    const layouts = [...walkSource(SRC)].filter((file) => /[\\/]app[\\/]/.test(file) && /[\\/](?:layout|template)\.tsx$/.test(file));
    assert.ok(layouts.length >= 10, `only ${layouts.length} layouts found`);
    // Each is handed its children as Next hands it a page, and followed.
    const wrappers = layouts.flatMap((file) => walker.childrenLinks(file).map((link) => `${posix(relative(ROOT, file))}: ${link}`));
    assert.deepEqual(wrappers, []);
  });
});
