/**
 * Reading a TypeScript file as a set of FUNCTIONS, for the guards that ask a
 * question of every function in a folder.
 *
 * `tests/lib/routeScan.mjs` reads a route file as its handlers, by bracket
 * matching, which is enough for `export async function GET(`. The guards that
 * use this file ask about library code instead: which functions a module
 * exports, what each is handed, and what it reaches through the other
 * functions of its own file. That needs the parameter list read properly (a
 * type literal, a default value, a destructuring pattern), so this file uses
 * the compiler's own parser, the `typescript` devDependency the loader beside
 * it already depends on. Nothing is type-checked and no program is built: one
 * file at a time, syntax only.
 *
 * ## What a function is here
 *
 * A function declared at the top of a module: `function f() {}`, or
 * `const f = () => {}` / `const f = function () {}`. A function nested inside
 * another is part of the one that holds it, which is what a guard asking
 * "does this function reach that call" wants.
 *
 * ## What it reports instead of skipping
 *
 * A function can leave a module in forms this file does not read as one: a
 * name exported in a list (`export { a }`), everything from another module
 * (`export * from`), a default export, a class, or a constant that holds a
 * function somewhere inside it (an object of handlers, say). Each is reported
 * in `scanModule().otherExports`, and never skipped:
 *
 *  - `export { a }` where `a` is a function of this module is simply that
 *    function, exported, and is read as one;
 *  - `export { a }` where `a` was imported is reported as `{ kind: "handed-on",
 *    name, from }`, so a guard can follow it to the module that declares it;
 *  - everything else is reported as `{ kind: "unread", what }`.
 *
 * A guard that walks "every exported function" decides what to do about each
 * of those, in writing, because a function exported in a form this scanner
 * cannot read would otherwise be invisible to the guard rather than reported
 * by it. An exported constant with no function in it (a string, a number, a
 * list of words) is not a function in any form and is not reported.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

/** Every `.ts` and `.tsx` file under `dir`, depth first, in directory order. */
export function* walkSource(dir) {
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walkSource(full);
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".d.ts")) yield full;
  }
}

const isExported = (node) =>
  (node.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
const isDefault = (node) =>
  (node.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword);

/** Every name a parameter binds: its own, or each one a destructuring pattern takes out. */
function boundNames(name, out = []) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const element of name.elements) if (!ts.isOmittedExpression(element)) boundNames(element.name, out);
  return out;
}

/** Every type a type annotation names: `Promise<Foo["bar"]>` names `Promise` and `Foo`. */
function typeNamesIn(node, out = new Set()) {
  if (!node) return out;
  const visit = (child) => {
    if (ts.isTypeReferenceNode(child)) {
      let name = child.typeName;
      while (ts.isQualifiedName(name)) name = name.left;
      out.add(name.text);
    } else if (ts.isTypeQueryNode(child)) {
      // `typeof SOMETHING` names a value, not a type: nothing to look up.
      return;
    }
    ts.forEachChild(child, visit);
  };
  visit(node);
  return out;
}

/**
 * One module, read once.
 *
 * `functions` is every function declared at the top of the module, exported
 * or not, by name. Each carries its parameters (`name` as written, `names`
 * every name it binds, `type` the annotation's text or "", `typeNames` the
 * types that annotation names), its body's text and where the body starts.
 *
 * `types` is the text of every type alias and interface the module declares,
 * by name. `imports` maps each imported name to the specifier it came from.
 */
export function scanModule(file) {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const functions = new Map();
  const types = new Map();
  const imports = new Map();
  const otherExports = [];

  const record = (name, node, exported) => {
    const body = node.body;
    functions.set(name, {
      name,
      exported,
      file,
      params: node.parameters.map((param) => ({
        name: param.name.getText(source),
        names: boundNames(param.name),
        type: param.type ? param.type.getText(source) : "",
        typeNames: [...typeNamesIn(param.type)],
      })),
      body: body ? body.getText(source) : "",
      /** The whole function as written, signature and all. */
      text: node.getText(source),
      line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
    });
  };

  /** True where a value has a function somewhere inside it. */
  const holdsFunction = (node) => {
    let found = false;
    const visit = (child) => {
      if (found) return;
      if (ts.isArrowFunction(child) || ts.isFunctionExpression(child) || ts.isMethodDeclaration(child)) {
        found = true;
        return;
      }
      ts.forEachChild(child, visit);
    };
    visit(node);
    return found;
  };
  const lineOf = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
  /** Names exported in a list, settled once every declaration has been read. */
  const listed = [];

  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const from = statement.moduleSpecifier.text;
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, from);
      const bindings = clause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const element of bindings.elements) imports.set(element.name.text, from);
      } else if (bindings && ts.isNamespaceImport(bindings)) {
        imports.set(bindings.name.text, from);
      }
    } else if (ts.isFunctionDeclaration(statement)) {
      if (isDefault(statement) || !statement.name) {
        otherExports.push({ kind: "unread", what: `export default function, line ${lineOf(statement)}` });
      } else {
        record(statement.name.text, statement, isExported(statement));
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const value = declaration.initializer;
        const name = declaration.name.getText(source);
        if (value && (ts.isArrowFunction(value) || ts.isFunctionExpression(value))) {
          record(name, value, isExported(statement));
        } else if (isExported(statement) && value && holdsFunction(value)) {
          otherExports.push({ kind: "unread", what: `export const ${name}, which holds a function` });
        }
      }
    } else if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
      types.set(statement.name.text, statement.getText(source));
    } else if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      const clause = statement.exportClause;
      if (!clause || !ts.isNamedExports(clause)) {
        otherExports.push({ kind: "unread", what: statement.getText(source).replace(/\s+/g, " ") });
        continue;
      }
      for (const element of clause.elements) {
        if (element.isTypeOnly) continue;
        listed.push({
          local: (element.propertyName ?? element.name).text,
          as: element.name.text,
          // `export { a } from "./b"` names its source itself.
          from: statement.moduleSpecifier ? statement.moduleSpecifier.text : null,
        });
      }
    } else if (ts.isExportAssignment(statement)) {
      otherExports.push({ kind: "unread", what: "export default" });
    } else if (ts.isClassDeclaration(statement) && isExported(statement)) {
      otherExports.push({ kind: "unread", what: `export class ${statement.name?.text ?? ""}` });
    }
  }
  for (const { local, as, from } of listed) {
    const own = from === null ? functions.get(local) : undefined;
    if (own && local === as) own.exported = true;
    else if (own) otherExports.push({ kind: "unread", what: `export { ${local} as ${as} }` });
    else if (from !== null) otherExports.push({ kind: "handed-on", name: local, as, from });
    else if (imports.has(local)) otherExports.push({ kind: "handed-on", name: local, as, from: imports.get(local) });
    // Anything else in the list is a type or a constant of this module.
    else if (!types.has(local)) otherExports.push({ kind: "unread", what: `export { ${local} }` });
  }
  return { file, text, functions, types, imports, otherExports };
}

/** True where `body` calls `name(`: the name as a whole word, then an opening bracket. */
export function calls(body, name) {
  return new RegExp(`(?<![A-Za-z0-9_$.])${name}\\s*\\(`).test(body);
}

/** Where `body` first calls `name(`, or -1. */
export function firstCall(body, name) {
  const found = new RegExp(`(?<![A-Za-z0-9_$.])${name}\\s*\\(`).exec(body);
  return found ? found.index : -1;
}

/**
 * The functions of its own module that `name` reaches, itself first: every
 * function it calls, and every function those call, each once. A call is the
 * function's name followed by a bracket, so a function handed on as a value
 * (`items.map(rowFor)`) is found too, by its name alone.
 */
export function reachOf(module, name) {
  const seen = [];
  const queue = [name];
  while (queue.length > 0) {
    const next = queue.shift();
    if (seen.includes(next)) continue;
    const fn = module.functions.get(next);
    if (!fn) continue;
    seen.push(next);
    for (const other of module.functions.keys()) {
      if (other === next || seen.includes(other)) continue;
      if (new RegExp(`(?<![A-Za-z0-9_$.])${other}(?![A-Za-z0-9_$])`).test(fn.body)) queue.push(other);
    }
  }
  return seen.map((found) => module.functions.get(found));
}

/**
 * The file an import names, or null for a package. `./x` and `../x` are read
 * against the importing file and `@/x` against `srcRoot`, trying `.ts`, then
 * `.tsx`, then an `index` of either, the order the loader beside this file
 * resolves in.
 */
export function resolveImport(fromFile, specifier, srcRoot) {
  let base;
  if (specifier.startsWith("@/")) base = join(srcRoot, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(fromFile, "..", specifier);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Not this spelling: try the next.
    }
  }
  return null;
}
