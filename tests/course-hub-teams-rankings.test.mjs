/**
 * What people ranked on the application form is read for one page only: an
 * incubator's Teams tab, for its lead and admins.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule
 *
 * Each person's ranks ("1st: Compute governance") are answers from their own
 * application. The programme's lead and admins may read them; a reviewer, a
 * group's facilitator, the run's track lead and the people taking part may
 * not. `src/lib/applications/handover/agenda.ts` is the one reader of them
 * for the course side, and the Teams tab's loader reads it only after its
 * gate (`teamsGate`) has decided the caller is the lead or an admin.
 * `tests/course-hub-teams-routes.test.mjs` executes that for every caller.
 *
 * ## What this file holds
 *
 * The tree: every file under `src` that imports the agenda reader is the
 * loader and nothing else, and the loader asks for the rankings in one place,
 * inside the function that takes a gate that has said yes. A second page or a
 * route that wants the rankings fails here until somebody decides who it is
 * for, rather than reading them in silence.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const AGENDA = "src/lib/applications/handover/agenda.ts";
const LOADER = "src/lib/applications/handover/teamsLoad.ts";

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry)) yield full;
  }
}

const rel = (file) => relative(REPO_ROOT, file).split("\\").join("/");

/** Where an import specifier in `file` points, as a path under the repository, or null for a package. */
function target(file, specifier) {
  let path;
  if (specifier.startsWith("@/")) path = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) path = resolve(dirname(file), specifier);
  else return null;
  const out = rel(path);
  return /\.tsx?$/.test(out) ? out : `${out}.ts`;
}

/** Every module a file imports or re-exports, by path. Comments are stripped first, strings kept. */
function importsOf(file) {
  const code = stripSource(readFileSync(file, "utf8"), { keepStrings: true });
  const out = [];
  for (const match of code.matchAll(/\b(?:from|import)\s*\(?\s*["'`]([^"'`]+)["'`]/g)) {
    const path = target(file, match[1]);
    if (path) out.push(path);
  }
  return out;
}

describe("the rankings' one reader", () => {
  test("the agenda reader is imported by the Teams tab's loader and by nothing else", () => {
    const importers = [...walk(SRC)].filter((file) => importsOf(file).includes(AGENDA)).map(rel);
    assert.deepEqual(importers, [LOADER]);
  });

  test("the loader asks for the rankings once, inside the reader that takes a gate that said yes", () => {
    const code = stripSource(readFileSync(join(REPO_ROOT, LOADER), "utf8"));
    assert.equal(code.match(/\breadRankings\(/g)?.length, 1, "the rankings are read in more than one place");
    assert.equal(code.match(/\bfindAgenda\(/g)?.length, 1);
    const reader = code.slice(code.indexOf("export async function readTeamsContext("));
    const body = reader.slice(0, reader.indexOf("\nexport "));
    assert.match(body, /gate: Extract<TeamsGate, \{ ok: true \}>/);
    assert.match(body, /\breadRankings\(/);
    // The tab's loader decides who may before it reads the run at all.
    const load = code.slice(code.indexOf("export async function loadProgrammeTeams("));
    assert.ok(
      load.indexOf("teamsGate(") < load.indexOf("teamsRun(") && load.indexOf("teamsRun(") < load.indexOf("readTeamsContext("),
      "the loader reads the run or the people before its gate",
    );
  });

  test("the walk finds an import however it is written", () => {
    const file = join(SRC, "lib", "applications", "handover", "somewhere.ts");
    assert.equal(target(file, "./agenda"), AGENDA);
    assert.equal(target(file, "@/lib/applications/handover/agenda"), AGENDA);
    assert.equal(target(join(SRC, "app", "page.tsx"), "../lib/applications/handover/agenda"), AGENDA);
    assert.equal(target(file, "react"), null);
  });
});
