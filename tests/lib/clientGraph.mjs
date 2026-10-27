/**
 * The modules a client component reaches, walked once for every guard that
 * asks a question of them.
 *
 * `tests/client-server-boundary.test.mjs` asks whether any of them imports
 * `server-only` or the Admin SDK. `tests/fetch-keepalive.test.mjs` asks how
 * each `fetch(...)` among them treats its promise. Both need the same graph,
 * and a second copy of the walk would be a second place for the resolver to
 * go quiet, so the walk lives here.
 *
 * ## What the walk is
 *
 * Every file under `src` that begins with `"use client"`, then transitively
 * every relative and `@/` specifier those files reach. TYPE-ONLY IMPORTS ARE
 * SKIPPED, because TypeScript erases them and they carry nothing into the
 * bundle: `import type { AppointmentQueueRow } from
 * "@/lib/admissions/appointmentQueue"` reaches nothing. A value import of the
 * same module does, and that is the distinction the walker makes.
 *
 * Each client file is walked breadth first on its own, so the chain a caller
 * is handed is the shortest one from that file to the module it is about.
 * A package specifier (`react`, `server-only`, `firebase-admin/firestore`) is
 * not followed; it is handed to the caller's `onPackage`, with the chain that
 * reached the module importing it, and the caller decides what it means.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SRC = join(REPO_ROOT, "src");

/** Specifiers that are not JavaScript and so import nothing. */
const NOT_CODE = /\.(css|scss|sass|json|png|jpe?g|svg|webp|gif|avif|woff2?|md|txt|ico)$/i;

export function repoPath(file) {
  return file.slice(REPO_ROOT.length + 1).split(sep).join("/");
}

// ---------------------------------------------------------------------------
// Reading a module: comments out, then the import statements
// ---------------------------------------------------------------------------

/**
 * Strip comments while respecting strings, so a `//` inside a URL literal and
 * an apostrophe inside a prose comment both survive. This codebase comments
 * heavily and its comments are full of quotes and slashes, so a naive
 * comment-stripper would swallow half a file and the walk would go quiet,
 * which is the failure mode every guard built on this walk exists to prevent.
 */
function stripComments(source) {
  let out = "";
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out += ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === "\\") {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** `import ... from "x"` and `export ... from "x"`, however many lines it spans. */
const FROM_STATEMENT = /(?:^|\n)([ \t]*(?:import|export)\b[^;]*?\bfrom\s*["']([^"']+)["'])/g;
/** `import "x"`, the side-effect form, which is how `server-only` is pulled in. */
const BARE_IMPORT = /(?:^|\n)([ \t]*import\s*["']([^"']+)["'])/g;
/** `import("x")`, which does reach the bundle. */
const DYNAMIC_IMPORT = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/**
 * Is this statement erased at compile time?
 *
 * Two forms count: `import type { ... } from`, and a braces-only statement
 * whose every named specifier carries the inline `type` keyword. A default or
 * namespace binding outside the braces is a value, so those follow.
 */
function isTypeOnly(statement) {
  if (/^\s*(?:import|export)\s+type\b/.test(statement)) return true;
  const open = statement.indexOf("{");
  const close = statement.lastIndexOf("}");
  if (open === -1 || close < open) return false;
  const before = statement
    .slice(0, open)
    .replace(/^\s*(?:import|export)\s*/, "")
    .replace(/[,\s]/g, "");
  if (before.length > 0) return false;
  const specifiers = statement
    .slice(open + 1, close)
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (specifiers.length === 0) return false;
  return specifiers.every((entry) => /^type\s/.test(entry));
}

/** Every specifier this module pulls VALUES from, in source order. */
function valueSpecifiers(source) {
  const clean = stripComments(source);
  const out = [];
  for (const [, statement, specifier] of clean.matchAll(FROM_STATEMENT)) {
    if (isTypeOnly(statement)) continue;
    out.push(specifier);
  }
  for (const [, , specifier] of clean.matchAll(BARE_IMPORT)) out.push(specifier);
  for (const [, specifier] of clean.matchAll(DYNAMIC_IMPORT)) out.push(specifier);
  return out;
}

/**
 * Does this file open with the client directive?
 *
 * The directive has to be the first statement, but a leading docblock and
 * blank lines are allowed before it, so the check strips those first rather
 * than testing `startsWith`.
 */
function isClientModule(source) {
  let rest = source.replace(/^﻿/, "");
  for (;;) {
    const trimmed = rest.replace(/^\s+/, "");
    if (trimmed.startsWith("/*")) {
      const end = trimmed.indexOf("*/");
      if (end === -1) return false;
      rest = trimmed.slice(end + 2);
      continue;
    }
    if (trimmed.startsWith("//")) {
      const end = trimmed.indexOf("\n");
      if (end === -1) return false;
      rest = trimmed.slice(end + 1);
      continue;
    }
    return /^["']use client["']/.test(trimmed);
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

function resolveLocal(specifier, fromFile) {
  const base = specifier.startsWith("@/")
    ? join(SRC, specifier.slice(2))
    : resolve(dirname(fromFile), specifier);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    base,
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function sourceFilesUnder(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) sourceFilesUnder(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// The walk
// ---------------------------------------------------------------------------

/**
 * Walk the graph.
 *
 * `onPackage({ entry, chain, file, specifier })` is called for every package
 * specifier a reached module pulls values from: `entry` is the client file
 * whose walk met it, `chain` the modules from `entry` down to `file`, the
 * module that imports it.
 *
 * Returns `sources` (every file under `src`, by path, with its text),
 * `clientFiles`, `edgesFollowed`, `unresolved` (each `file -> specifier` a
 * walk could not resolve, every time a walk met it), and `reached`: every
 * module of the graph, client files included, each with the shortest chain
 * from the first client file whose walk reached it.
 */
export function walkClientGraph({ onPackage = () => {} } = {}) {
  const allFiles = sourceFilesUnder(SRC);
  const sources = new Map(allFiles.map((file) => [file, readFileSync(file, "utf8")]));
  const clientFiles = allFiles.filter((file) => isClientModule(sources.get(file)));

  let edgesFollowed = 0;
  const unresolved = [];
  const reached = new Map();

  for (const entry of clientFiles) {
    // Breadth first, so the chain reported is the shortest one to the offender.
    const queue = [[entry]];
    const seen = new Set([entry]);
    if (!reached.has(entry)) reached.set(entry, [entry]);
    while (queue.length > 0) {
      const chain = queue.shift();
      const file = chain[chain.length - 1];
      for (const specifier of valueSpecifiers(sources.get(file) ?? "")) {
        if (!specifier.startsWith(".") && !specifier.startsWith("@/")) {
          onPackage({ entry, chain, file, specifier });
          continue;
        }
        if (NOT_CODE.test(specifier)) continue;
        const target = resolveLocal(specifier, file);
        if (!target) {
          unresolved.push(`${repoPath(file)} -> ${specifier}`);
          continue;
        }
        if (!sources.has(target)) continue;
        edgesFollowed += 1;
        if (seen.has(target)) continue;
        seen.add(target);
        const next = [...chain, target];
        if (!reached.has(target)) reached.set(target, next);
        queue.push(next);
      }
    }
  }

  return { sources, clientFiles, edgesFollowed, unresolved, reached };
}
