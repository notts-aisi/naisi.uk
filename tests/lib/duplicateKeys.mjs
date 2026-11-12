/**
 * Every key written twice in one object literal of a file, read from its
 * SOURCE TEXT. An evaluated object cannot show this: the later of two equal
 * keys silently wins, so the earlier one is dead text that can say something
 * else and nothing notices. A registry keyed by route or page is exactly
 * where that hides.
 *
 * The file is parsed with the `typescript` devDependency, as
 * `functionScan.mjs` parses source. Keys written as a name, a string, a
 * number or a template with no substitution are compared; a computed key
 * that is not one of those cannot be read without running the file, so it is
 * REPORTED as unresolved, never skipped.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * `{ duplicates, unresolved }` for one file: each duplicate as its key and the
 * lines of every place it is written in the one object; each unresolved
 * computed key as its text and line.
 */
export function duplicateKeysIn(file) {
  return duplicateKeysInText(readFileSync(file, "utf8"), file);
}

/** The same, for source text: what a guard runs on a sample first, to show the scan reads. */
export function duplicateKeysInText(text, name = "source.mjs") {
  const source = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  const duplicates = [];
  const unresolved = [];
  const keyOf = (key) => {
    if (ts.isIdentifier(key) || ts.isStringLiteral(key) || ts.isNumericLiteral(key) || ts.isNoSubstitutionTemplateLiteral(key)) return key.text;
    if (ts.isComputedPropertyName(key)) {
      const inner = key.expression;
      if (ts.isStringLiteral(inner) || ts.isNumericLiteral(inner) || ts.isNoSubstitutionTemplateLiteral(inner)) return inner.text;
      unresolved.push({ key: key.getText(source), line: lineOf(key) });
      return null;
    }
    return null;
  };
  const visit = (node) => {
    if (ts.isObjectLiteralExpression(node)) {
      const lines = new Map();
      for (const property of node.properties) {
        if (!property.name) continue;
        const key = keyOf(property.name);
        if (key === null) continue;
        lines.set(key, [...(lines.get(key) ?? []), lineOf(property)]);
      }
      for (const [key, at] of lines) if (at.length > 1) duplicates.push({ key, lines: at });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return { duplicates, unresolved };
}
