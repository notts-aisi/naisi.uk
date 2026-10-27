/**
 * No two elements drawn side by side share a key.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * React tells siblings apart by their keys. Two children of one element with
 * the same key are one child to React: it logs "Encountered two children with
 * the same key" and may keep one's state for the other, or drop one. The
 * course editor drew its rubric card and its routes card side by side, each
 * keyed by the course's id so that it starts afresh for another course, and
 * so with one key between them (the stage four walk's B3). Each card's key now
 * names the card as well as the course, as the predictions card's always did.
 *
 * ## How it is held
 *
 * THE TREE. Every `.tsx` file under `src` is read with the compiler's own
 * parser. For every element and fragment, the elements it holds directly are
 * collected: through `{...}`, `a && b`, `a ?? b` and parentheses, never into a
 * function (a `.map` callback keys its own list, which the linter's
 * `react/jsx-key` asks for) or into another element or fragment (each keeps a
 * list of its own). The two branches of `a ? b : c` are one place, drawn one
 * at a time, so they may share a key with each other and with nothing else.
 * Two keys are the same when their source text is the same: `key={course.id}`
 * twice is a duplicate whatever the course.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { walkSource } from "./lib/functionScan.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** The key an element is given, as source text, or null. */
function keyOf(element, file) {
  const attributes = (ts.isJsxElement(element) ? element.openingElement : element).attributes.properties;
  for (const attribute of attributes) {
    if (ts.isJsxAttribute(attribute) && attribute.name.getText(file) === "key" && attribute.initializer) {
      return attribute.initializer.getText(file);
    }
  }
  return null;
}

/**
 * The keys one child of an element can draw, as a set: one key for an element,
 * every key either branch of a `? :` can draw, both sides of `&&`, `||` and
 * `??`. An element with no key, a fragment, a function and anything else draw
 * no key here.
 */
function keysOfChild(node, file) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
    const key = keyOf(node, file);
    return key === null ? [] : [{ key, at: node }];
  }
  if (ts.isJsxExpression(node)) return node.expression ? keysOfChild(node.expression, file) : [];
  if (ts.isParenthesizedExpression(node)) return keysOfChild(node.expression, file);
  if (ts.isConditionalExpression(node)) {
    // One branch or the other is drawn: a key both draw is one key in this place.
    const both = [...keysOfChild(node.whenTrue, file), ...keysOfChild(node.whenFalse, file)];
    return both.filter((entry, index) => both.findIndex((other) => other.key === entry.key) === index);
  }
  if (ts.isBinaryExpression(node)) return [...keysOfChild(node.left, file), ...keysOfChild(node.right, file)];
  return [];
}

/** Every pair of siblings with one key in a file's source, as "line key". */
function duplicateKeysIn(source, name = "file.tsx") {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = [];
  const visit = (node) => {
    if (ts.isJsxElement(node) || ts.isJsxFragment(node)) {
      const seen = new Set();
      for (const child of node.children) {
        for (const { key, at } of keysOfChild(child, file)) {
          if (seen.has(key)) found.push(`${file.getLineAndCharacterOfPosition(at.getStart(file)).line + 1} ${key}`);
          seen.add(key);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

describe("siblings never share a key", () => {
  test("the tree: no element in src draws two children with one key", () => {
    const found = [];
    let files = 0;
    for (const path of walkSource(SRC)) {
      if (!path.endsWith(".tsx")) continue;
      files += 1;
      for (const where of duplicateKeysIn(readFileSync(path, "utf8"), path)) found.push(`${relative(SRC, path).split(sep).join("/")}:${where}`);
    }
    assert.ok(files > 400, `read ${files} files: the walk reached too little of the tree`);
    assert.deepEqual(found, []);
  });

  test("the course editor's cards each have their own key, the course's id named with the card", () => {
    const editor = readFileSync(join(SRC, "features", "courses", "CourseEditor.tsx"), "utf8");
    for (const card of ["CourseRubricCard", "CourseRoutesCard", "CoursePredictionsCard"]) {
      const key = new RegExp(`<${card} key=\\{\`([a-z]+)-\\$\\{course\\.id\\}\`\\}`).exec(editor);
      assert.ok(key, `${card} is not keyed by its own name and the course's id`);
    }
  });

  test("the guard reads what it guards: siblings, conditional siblings, ternaries, maps and fragments", () => {
    // Two cards side by side with one key: the course editor before B3.
    assert.deepEqual(duplicateKeysIn("const a = <div><A key={course.id} /><b /><B key={course.id} /></div>;"), ["1 {course.id}"]);
    // Drawn on a condition, still side by side.
    assert.deepEqual(duplicateKeysIn('const a = <div>{x && <A key="k" />}<B key="k" /></div>;'), ['1 "k"']);
    assert.deepEqual(duplicateKeysIn('const a = <>{x ?? <A key="k" />}<B key="k" /></>;'), ['1 "k"']);
    // One branch or the other: one key in one place, never a duplicate.
    assert.deepEqual(duplicateKeysIn('const a = <div>{x ? <A key="k" /> : <B key="k" />}</div>;'), []);
    // A ternary's key against a sibling's is.
    assert.deepEqual(duplicateKeysIn('const a = <div>{x ? <A key="k" /> : null}<B key="k" /></div>;'), ['1 "k"']);
    // A list made by `.map` keys its own items; a fragment and another element keep lists of their own.
    assert.deepEqual(duplicateKeysIn("const a = <div>{xs.map((x) => <A key={x.id} />)}<B key={x.id} /></div>;"), []);
    assert.deepEqual(duplicateKeysIn('const a = <div><><A key="k" /></><B key="k" /></div>;'), []);
    assert.deepEqual(duplicateKeysIn('const a = <div><p><A key="k" /></p><B key="k" /></div>;'), []);
    // Keys that differ, as the cards' do now.
    assert.deepEqual(duplicateKeysIn("const a = <div><A key={`rubric-${id}`} /><B key={`routes-${id}`} /></div>;"), []);
  });
});
