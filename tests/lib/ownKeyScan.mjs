/**
 * Finds every place a by-id map is asked about a key that is worked out when
 * the code runs. The guard that uses it is
 * `tests/applications-own-key-reads.test.mjs`, which says why that matters.
 *
 * ## Why a parser and not a pattern
 *
 * The question is about what an expression IS: a read or an assignment
 * target, a key that is a literal or one that is computed, an object that is
 * a map or an alias of one. Those are the parser's own distinctions, so each
 * file is parsed with the `typescript` devDependency (the one the shared
 * loader already compiles with) and the tree is walked. Nothing is compiled
 * and no type is resolved: this reads syntax, one file at a time. A comment
 * is not in the tree, a string is one node, and the code inside a template
 * literal or a JSX expression is code like any other.
 *
 * ## What counts as the map
 *
 * An expression denotes one of the maps when, with brackets, `!` and `as`
 * taken off, it is:
 *
 *  - an identifier or a property with one of the map names (`programmes`,
 *    `form.programmes`, `form?.programmes`, `form["programmes"]`);
 *  - the `.current` of one, which is how a React ref holds a map;
 *  - an ALIAS: a name this file binds to such an expression (`const p =
 *    form.programmes`, `const { programmes: p } = form`, `p = form.programmes`)
 *    or declares with a type that names a map (`given: Answers`,
 *    `byId: ApplicationForm["programmes"]`);
 *  - `a ?? b`, `a || b`, `a && b` or `c ? a : b` where either side is one;
 *  - for a map whose values are maps themselves (an application's `answers`:
 *    a question set's id, then a question's id), the value one level in,
 *    reached by a bracket or through the accessor.
 *
 * ALIASES ARE KEPT PER FILE, NOT PER SCOPE. A name bound to a map anywhere in
 * a file is treated as that map everywhere in the file. That can only report
 * too much, never too little, and a site reported wrongly is something a
 * person looks at once. A scanner that guessed at scopes could miss a read
 * without saying so.
 *
 * ## What is reported
 *
 *  - `read`: `map[key]` or `map?.[key]` where `key` is not a string or number
 *    literal, and the expression is not an assignment target, the operand of
 *    `delete`, or of `++` and `--`. A write names the key it creates, which
 *    is the id rule's business (`isId`), not this one's.
 *  - `in`: `key in map`. It answers true for a name the map only inherits.
 *  - `destructure`: `const { [key]: value } = map`, the same read written as
 *    a pattern.
 */
import { dirname, join, normalize, sep } from "node:path";
import ts from "typescript";

const K = ts.SyntaxKind;

/**
 * Parse one file. A file the parser cannot read is an error here and not an
 * empty result: a scanner that reads nothing reports nothing, and that would
 * look exactly like a clean file.
 */
function parse(fileName, sourceText) {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const problems = sourceFile.parseDiagnostics ?? [];
  if (problems.length > 0) {
    const first = problems[0];
    const { line } = sourceFile.getLineAndCharacterOfPosition(first.start ?? 0);
    throw new Error(
      `${fileName}:${line + 1} does not parse, so it cannot be scanned: ` +
        ts.flattenDiagnosticMessageText(first.messageText, " "),
    );
  }
  return sourceFile;
}

/** Brackets, `!`, `as` and `satisfies` change nothing about what is read. */
function peel(node) {
  let at = node;
  while (
    at &&
    (ts.isParenthesizedExpression(at) ||
      ts.isNonNullExpression(at) ||
      ts.isAsExpression(at) ||
      ts.isSatisfiesExpression(at) ||
      ts.isTypeAssertionExpression(at))
  ) {
    at = at.expression;
  }
  return at;
}

/** A key written out in the source: a string, a number, or a negative number. */
function isLiteralKey(node) {
  const key = peel(node);
  if (!key) return false;
  if (ts.isStringLiteralLike(key) || ts.isNumericLiteral(key)) return true;
  return ts.isPrefixUnaryExpression(key) && key.operator === K.MinusToken && ts.isNumericLiteral(key.operand);
}

/**
 * Which map `node` denotes, or null. `how` is `name` (the expression ends in
 * a map name), `alias` (a name this file binds to one) or `nested` (the value
 * one level into a map of maps).
 */
function mapOf(node, ctx) {
  const at = peel(node);
  if (!at) return null;
  if (ts.isIdentifier(at)) {
    if (ctx.names.has(at.text)) return { name: at.text, how: "name" };
    const alias = ctx.aliases.get(at.text) ?? ctx.fieldAliases.get(at.text);
    return alias ? { name: alias, how: "alias" } : null;
  }
  if (ts.isPropertyAccessExpression(at)) {
    if (ctx.names.has(at.name.text)) return { name: at.name.text, how: "name" };
    const alias = ctx.fieldAliases.get(at.name.text);
    if (alias) return { name: alias, how: "alias" };
    // A ref holds its map under `.current`.
    return at.name.text === "current" ? mapOf(at.expression, ctx) : null;
  }
  if (ts.isElementAccessExpression(at)) {
    const key = peel(at.argumentExpression);
    if (key && ts.isStringLiteralLike(key) && ctx.names.has(key.text)) return { name: key.text, how: "name" };
    return nestedIn(at.expression, ctx);
  }
  if (ts.isCallExpression(at)) {
    // The accessor hands back the value under a key. One level into a map of
    // maps, that value is a map as well.
    if (ts.isIdentifier(at.expression) && ctx.accessors.has(at.expression.text) && at.arguments.length > 0) {
      return nestedIn(at.arguments[0], ctx);
    }
    return null;
  }
  if (
    ts.isBinaryExpression(at) &&
    (at.operatorToken.kind === K.QuestionQuestionToken ||
      at.operatorToken.kind === K.BarBarToken ||
      at.operatorToken.kind === K.AmpersandAmpersandToken)
  ) {
    return mapOf(at.left, ctx) ?? mapOf(at.right, ctx);
  }
  if (ts.isConditionalExpression(at)) return mapOf(at.whenTrue, ctx) ?? mapOf(at.whenFalse, ctx);
  return null;
}

/** The value one level into `outer`, when `outer` is a map whose values are maps. */
function nestedIn(outer, ctx) {
  const map = mapOf(outer, ctx);
  if (!map || map.how === "nested" || !ctx.nested.has(map.name)) return null;
  return { name: map.name, how: "nested" };
}

/** Which map a declared type names, or null. */
function mapOfType(type, ctx) {
  if (!type) return null;
  if (ts.isParenthesizedTypeNode(type)) return mapOfType(type.type, ctx);
  if (ts.isTypeOperatorNode(type)) return mapOfType(type.type, ctx);
  if (ts.isUnionTypeNode(type) || ts.isIntersectionTypeNode(type)) {
    for (const member of type.types) {
      const found = mapOfType(member, ctx);
      if (found) return found;
    }
    return null;
  }
  if (ts.isIndexedAccessTypeNode(type)) {
    const index = type.indexType;
    if (ts.isLiteralTypeNode(index) && ts.isStringLiteral(index.literal) && ctx.names.has(index.literal.text)) {
      return index.literal.text;
    }
    return null;
  }
  if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) {
    const named = ctx.typeNames.get(type.typeName.text);
    if (named) return named;
    // `Readonly<X>` and `Partial<X>` are still X to a read.
    if ((type.typeName.text === "Readonly" || type.typeName.text === "Partial") && type.typeArguments?.length === 1) {
      return mapOfType(type.typeArguments[0], ctx);
    }
  }
  return null;
}

function isAssignment(kind) {
  return kind >= K.FirstAssignment && kind <= K.LastAssignment;
}

/** True when `node` is written to, deleted or stepped, and so is not a read. */
function isWriteTarget(node) {
  let child = node;
  let parent = node.parent;
  while (
    parent &&
    (ts.isParenthesizedExpression(parent) || ts.isNonNullExpression(parent) || ts.isAsExpression(parent))
  ) {
    child = parent;
    parent = parent.parent;
  }
  if (!parent) return false;
  if (ts.isBinaryExpression(parent) && parent.left === child && isAssignment(parent.operatorToken.kind)) return true;
  if (ts.isDeleteExpression(parent)) return true;
  if (ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent)) {
    return parent.operator === K.PlusPlusToken || parent.operator === K.MinusMinusToken;
  }
  return false;
}

/** One line of source text, however the expression was laid out. */
function textOf(node, sourceFile) {
  return node.getText(sourceFile).replace(/\s+/g, " ");
}

/** Names a binding pattern gives to a map by renaming it: `{ programmes: p }`. */
function renamedIn(pattern, ctx, bind) {
  if (!ts.isObjectBindingPattern(pattern)) return;
  for (const element of pattern.elements) {
    const from = element.propertyName;
    if (from && (ts.isIdentifier(from) || ts.isStringLiteral(from)) && ctx.names.has(from.text)) {
      if (ts.isIdentifier(element.name)) bind(element.name.text, from.text);
    }
    if (!ts.isIdentifier(element.name)) renamedIn(element.name, ctx, bind);
  }
}

/**
 * Every alias the file declares, to a fixed point so an alias of an alias is
 * found whichever comes first in the file.
 */
function collectAliases(sourceFile, ctx) {
  let grew = true;
  const bind = (name, map) => {
    if (ctx.names.has(name) || ctx.aliases.has(name)) return;
    ctx.aliases.set(name, map);
    grew = true;
  };
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) {
      if (ts.isIdentifier(node.name)) {
        const byType = "type" in node ? mapOfType(node.type, ctx) : null;
        const byValue = node.initializer ? mapOf(node.initializer, ctx) : null;
        if (byType) bind(node.name.text, byType);
        else if (byValue) bind(node.name.text, byValue.name);
      } else {
        renamedIn(node.name, ctx, bind);
      }
    } else if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === K.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      const byValue = mapOf(node.right, ctx);
      if (byValue) bind(node.left.text, byValue.name);
    } else if (ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) {
      // A field declared with a map's type under another name is one too.
      if (node.name && ts.isIdentifier(node.name)) {
        const byType = mapOfType(node.type, ctx);
        if (byType && !ctx.names.has(node.name.text) && !ctx.fieldAliases.has(node.name.text)) {
          ctx.fieldAliases.set(node.name.text, byType);
          grew = true;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  while (grew) {
    grew = false;
    visit(sourceFile);
  }
}

/** The module an import names, as a path from the repository root with no extension. */
function resolveImport(fileName, specifier, repoRoot) {
  let path;
  if (specifier.startsWith("@/")) path = join(repoRoot, "src", specifier.slice(2));
  else if (specifier.startsWith(".")) path = join(dirname(fileName), specifier);
  else return specifier;
  return normalize(path).slice(normalize(repoRoot).length + 1).split(sep).join("/");
}

/**
 * How one file comes by the accessor, for the rule that there is one.
 *
 * Returns:
 *  - `imports`: each way the file takes the exported name from another module
 *    (`{ local, from }`, `from` resolved to a path from the repository root
 *    with no extension): a named import, under its own name or another, and
 *    `const { own } = keys` where `keys` is `import * as keys from "..."`;
 *  - `passesOn`: the modules this file hands the name on from, under the same
 *    name: `export { own } from "..."`, or an import of it followed by
 *    `export { own }`;
 *  - `defines`: true when the file declares a FUNCTION of that name itself;
 *  - `calls`: how many times the file calls it, under any local name it took
 *    it as, or under its exported name when it took it from nowhere.
 */
export function accessorUse(fileName, sourceText, { repoRoot, exported = "own" }) {
  const sourceFile = parse(fileName, sourceText);
  const imports = [];
  const passesOn = [];
  const namespaces = new Map();
  let exportsItsImport = false;
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement) && statement.importClause?.namedBindings) {
      const bindings = statement.importClause.namedBindings;
      const from = resolveImport(fileName, statement.moduleSpecifier.text, repoRoot);
      if (ts.isNamespaceImport(bindings)) {
        namespaces.set(bindings.name.text, from);
        continue;
      }
      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === exported) imports.push({ local: element.name.text, from });
      }
    } else if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) {
        if (element.name.text !== exported || (element.propertyName ?? element.name).text !== exported) continue;
        if (statement.moduleSpecifier) {
          passesOn.push(resolveImport(fileName, statement.moduleSpecifier.text, repoRoot));
        } else {
          exportsItsImport = true;
        }
      }
    }
  }
  let defines = false;
  const declarations = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === exported) defines = true;
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (
        ts.isIdentifier(node.name) &&
        node.name.text === exported &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        defines = true;
      }
      // `const { own } = keys`, where `keys` is a whole module taken by name.
      if (ts.isObjectBindingPattern(node.name) && ts.isIdentifier(node.initializer)) {
        const from = namespaces.get(node.initializer.text);
        for (const element of from ? node.name.elements : []) {
          const taken = element.propertyName ?? element.name;
          if (ts.isIdentifier(taken) && taken.text === exported && ts.isIdentifier(element.name)) {
            imports.push({ local: element.name.text, from });
          }
        }
      }
    }
    ts.forEachChild(node, declarations);
  };
  declarations(sourceFile);
  if (exportsItsImport) {
    for (const entry of imports) if (entry.local === exported) passesOn.push(entry.from);
  }

  const locals = new Set(imports.map((entry) => entry.local));
  if (locals.size === 0) locals.add(exported);
  let calls = 0;
  const count = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && locals.has(node.expression.text)) calls += 1;
    ts.forEachChild(node, count);
  };
  count(sourceFile);
  return { imports, passesOn, defines, calls };
}

/**
 * Scan one file's text. `maps` gives the map names, which of them hold maps
 * as their values (`nested`), the named types that are a map (`typeNames`:
 * type name to map name) and the name the accessor is exported under
 * (`accessor`); a file that imports it under another name is followed.
 *
 * Returns the sites in source order: `{ kind, map, how, text, line, start,
 * end, fix }`. `fix` is the same read written through the accessor, for the
 * failure message, or null where there is no one-line rewrite.
 */
export function scanForComputedReads(fileName, sourceText, maps) {
  const sourceFile = parse(fileName, sourceText);
  const exported = maps.accessor ?? "own";
  const ctx = {
    names: new Set(maps.names),
    nested: new Set(maps.nested ?? []),
    typeNames: new Map(maps.typeNames ?? []),
    accessors: new Set([exported]),
    aliases: new Map(),
    fieldAliases: new Map(),
  };
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) continue;
    for (const element of bindings.elements) {
      // Imported under another name, the accessor is still the accessor.
      if ((element.propertyName ?? element.name).text === exported) ctx.accessors.add(element.name.text);
    }
  }
  collectAliases(sourceFile, ctx);

  const sites = [];
  const report = (kind, node, map, fix) => {
    const start = node.getStart(sourceFile);
    const { line } = sourceFile.getLineAndCharacterOfPosition(start);
    sites.push({
      kind,
      map: map.name,
      how: map.how,
      text: textOf(node, sourceFile),
      line: line + 1,
      start,
      end: node.getEnd(),
      fix,
    });
  };
  const visit = (node) => {
    if (ts.isElementAccessExpression(node) && !isLiteralKey(node.argumentExpression)) {
      const map = mapOf(node.expression, ctx);
      if (map && !isWriteTarget(node)) {
        const object = textOf(node.expression, sourceFile);
        report("read", node, map, `${exported}(${object}, ${textOf(node.argumentExpression, sourceFile)})`);
      }
    } else if (ts.isBinaryExpression(node) && node.operatorToken.kind === K.InKeyword) {
      const map = mapOf(node.right, ctx);
      if (map) {
        const object = textOf(node.right, sourceFile);
        report("in", node, map, `${exported}(${object}, ${textOf(node.left, sourceFile)}) !== undefined`);
      }
    } else if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && node.initializer) {
      const map = mapOf(node.initializer, ctx);
      if (map && node.name.elements.some((element) => element.propertyName && ts.isComputedPropertyName(element.propertyName))) {
        report("destructure", node, map, null);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return sites;
}

/** `Record<string, X>` with X anything but `unknown`, through `Readonly`, `Partial`, `| null` and brackets. */
function recordOfString(type) {
  if (!type) return null;
  if (ts.isParenthesizedTypeNode(type) || ts.isTypeOperatorNode(type)) return recordOfString(type.type);
  if (ts.isUnionTypeNode(type)) {
    for (const member of type.types) {
      const found = recordOfString(member);
      if (found) return found;
    }
    return null;
  }
  if (!ts.isTypeReferenceNode(type) || !ts.isIdentifier(type.typeName)) return null;
  const args = type.typeArguments ?? [];
  if ((type.typeName.text === "Readonly" || type.typeName.text === "Partial") && args.length === 1) {
    return recordOfString(args[0]);
  }
  if (type.typeName.text !== "Record" || args.length !== 2) return null;
  if (args[0].kind !== K.StringKeyword || args[1].kind === K.UnknownKeyword) return null;
  return type;
}

/** `useState<Record<string, X>>(...)` or `useRef<Record<string, X>>(...)`. */
function hookHoldingAMap(node) {
  if (!node || !ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return null;
  const hook = node.expression.text;
  if (hook !== "useState" && hook !== "useRef") return null;
  return node.typeArguments?.length === 1 && recordOfString(node.typeArguments[0]) ? hook : null;
}

/**
 * Every name one file DECLARES as a map from any string to something.
 * `Record<string, unknown>` is left out: that is a stored document, read by
 * field names the code spells.
 *
 * Returns `{ name, where, line, text }` in source order. `where` is `field`
 * for a field of a type (the name travels with the type, to every file that
 * is handed one) and `local` for a parameter, a variable with a written
 * type, and what `useState<Record<string, X>>` or `useRef<Record<string, X>>`
 * hands back (the name means this in its own file).
 *
 * A map whose type is only inferred is not seen here. That is why the reads
 * of the maps other code is handed are found by name wherever they are, and
 * this list only adds to those names.
 */
export function declaredStringMaps(fileName, sourceText) {
  const sourceFile = parse(fileName, sourceText);
  const found = [];
  const note = (name, where, node) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    found.push({ name, where, line: line + 1, text: textOf(node, sourceFile) });
  };
  const visit = (node) => {
    if ((ts.isPropertySignature(node) || ts.isPropertyDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      if (recordOfString(node.type)) note(node.name.text, "field", node);
    } else if ((ts.isParameter(node) || ts.isVariableDeclaration(node)) && ts.isIdentifier(node.name)) {
      if (recordOfString(node.type) || hookHoldingAMap(node.initializer) === "useRef") {
        note(node.name.text, "local", node);
      }
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isArrayBindingPattern(node.name) &&
      hookHoldingAMap(node.initializer) === "useState"
    ) {
      const first = node.name.elements[0];
      if (first && ts.isBindingElement(first) && ts.isIdentifier(first.name)) note(first.name.text, "local", node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
