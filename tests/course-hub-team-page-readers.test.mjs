/**
 * Every file in `src` that touches what a team writes on its page says what
 * it does with it, and nothing hands it to a browser but the server's own
 * pages for the readers the gate allows.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The rule this guards
 *
 * What anybody in an incubator's team writes on its page (`courseTeamEntries`:
 * a week's check-in, a link, the hand-in) is seen by everybody in the team,
 * the programme's lead and admins, and by nobody else (privacy policy v7,
 * "Your team's page"). One gate decides the team's people
 * (`teamPagePerson` in `src/lib/courses/teamPage/access.ts`), the Teams tab's
 * own gate decides the lead and admins, and the collection is read in one
 * file and written in one other. The class of failure is a new reader, a new
 * writer, or a browser file reaching the readers, any of which would carry a
 * team's words to somebody the policy does not name.
 *
 * ## How it is held
 *
 * THE TREE. Every file under `src` that names the collection is listed in
 * `TOUCHES` with what it does, both directions, and its claim is read out of
 * the source. A new file fails here until somebody decides.
 *
 * THE ROUTES. Every handler under `src/app/api/courses/runs/[runId]/team/` is
 * refused during view-as first and asks the gate before it writes.
 *
 * THE BROWSER. No `"use client"` file imports the gate, the readers or the
 * writers, and nothing addresses the collection through the client SDK.
 *
 * What the readers then show is executed in
 * `tests/course-hub-team-page-{routes,pages,deletion}.test.mjs`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { walkSource } from "./lib/functionScan.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(REPO_ROOT, "src");
const inSrc = (file) => relative(SRC, file).split(sep).join("/");

/** Code with comments gone and strings kept, so a collection named in a string is seen. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });
const FILES = [...walkSource(SRC)].map((file) => [inSrc(file), codeOf(file)]);

/** Names the collection: by its constant, or by its name in a string. */
const NAMES_COLLECTION = /\bTEAM_ENTRIES_COLLECTION\b|["'`]courseTeamEntries["'`]/;

/**
 * Every file that names the collection, what it does, and a literal it must
 * still contain for that to hold.
 */
const TOUCHES = {
  "lib/courses/teamPage/model.ts": {
    does: "defines it",
    proof: ['export const TEAM_ENTRIES_COLLECTION = "courseTeamEntries";'],
  },
  "lib/courses/teamPage/load.ts": {
    does: "reads it for a team's page, its hand-in and the lead's list, after the gate",
    proof: [
      'const snap = await db.collection(TEAM_ENTRIES_COLLECTION).where("teamId", "==", teamId).get();',
      'const snap = await db.collection(TEAM_ENTRIES_COLLECTION).where("runId", "==", run.id).get();',
    ],
  },
  "lib/courses/teamPage/write.ts": {
    does: "writes it, for somebody the gate let through",
    proof: ["export async function saveCheckIn(", "export async function addLink(", "export async function removeLink(", "export async function saveHandIn("],
  },
  "lib/firestore/accountDeletion.ts": {
    does: "takes a deleted account's uid off what it saved last",
    proof: ['const snap = await db.collection(TEAM_ENTRIES_COLLECTION).where("byUid", "==", uid).get();'],
  },
  "lib/firestore/courseDeletion.ts": {
    does: "counts it in a run's destroy and drains it",
    proof: ["drainQuery(db, TEAM_ENTRIES_COLLECTION, byRunId(TEAM_ENTRIES_COLLECTION), budget)"],
  },
};

describe("the tree", () => {
  test("every file that names the collection is listed, and every listed file names it", () => {
    const naming = FILES.filter(([, code]) => NAMES_COLLECTION.test(code)).map(([file]) => file).sort();
    assert.deepEqual(naming, Object.keys(TOUCHES).sort());
  });

  test("each listed file still does what its entry says", () => {
    for (const [file, { proof }] of Object.entries(TOUCHES)) {
      const code = FILES.find(([path]) => path === file)?.[1] ?? "";
      for (const line of proof) assert.ok(code.includes(line), `${file} no longer contains ${JSON.stringify(line)}`);
    }
  });

  test("the reader reads only after the gate: every way in asks teamPagePerson or the Teams tab's gate first", () => {
    const load = FILES.find(([path]) => path === "lib/courses/teamPage/load.ts")[1];
    for (const name of ["loadTeamPage", "loadHandInPage", "teamCardFor"]) {
      const body = load.slice(load.indexOf(`export async function ${name}(`));
      assert.match(body.slice(0, body.indexOf("\n}\n")), /await teamPagePerson\(db, user, runId\)/, name);
    }
    const lead = FILES.find(([path]) => path === "lib/courses/teamPage/lead.ts")[1];
    for (const name of ["loadTeamHandIns", "loadLeadTeamPage"]) {
      const body = lead.slice(lead.indexOf(`export async function ${name}(`));
      assert.match(body.slice(0, body.indexOf("\n}\n")), /const gate = await teamsGate\(db, user, roundId, programmeId\);\s*if \(!gate\.ok\)/, name);
    }
  });
});

describe("the routes", () => {
  const ROUTES = FILES.filter(([file]) => file.startsWith("app/api/courses/runs/[runId]/team/") && file.endsWith("/route.ts"));

  test("there are the four, and each mutating handler is refused during view-as first, then asks the gate before it writes", () => {
    assert.deepEqual(ROUTES.map(([file]) => file).sort(), [
      "app/api/courses/runs/[runId]/team/check-in/route.ts",
      "app/api/courses/runs/[runId]/team/hand-in/route.ts",
      "app/api/courses/runs/[runId]/team/links/[linkId]/route.ts",
      "app/api/courses/runs/[runId]/team/links/route.ts",
    ]);
    for (const [file, code] of ROUTES) {
      const handlers = [...code.matchAll(/export async function (GET|POST|PUT|PATCH|DELETE)\(/g)].map((m) => m[1]);
      assert.ok(handlers.length > 0 && !handlers.includes("GET"), `${file}: ${handlers}`);
      for (const method of handlers) {
        const body = code.slice(code.indexOf(`export async function ${method}(`));
        // The body opens after the signature, whose parameters carry braces of their own.
        const first = body.slice(body.indexOf(") {\n") + 4).trim();
        assert.ok(first.startsWith("const blocked = await assertNotImpersonating();"), `${file} ${method}: view-as is not refused first`);
        const gate = body.indexOf("await teamPagePerson(db, user, runId)");
        const write = Math.min(
          ...["await saveCheckIn(", "await addLink(", "await removeLink(", "await saveHandIn("]
            .map((call) => body.indexOf(call))
            .filter((at) => at >= 0),
        );
        assert.ok(gate > 0 && gate < write, `${file} ${method}: writes before the gate`);
      }
    }
  });
});

describe("the browser", () => {
  test("no browser file imports the gate, the readers or the writers", () => {
    const SERVER_ONLY = /from "@\/lib\/courses\/teamPage\/(access|load|lead|write)"/;
    const offenders = FILES.filter(([, code]) => /^\s*["']use client["']/.test(code) && SERVER_ONLY.test(code)).map(([file]) => file);
    assert.deepEqual(offenders, []);
    for (const file of ["access", "load", "lead", "write"]) {
      const code = FILES.find(([path]) => path === `lib/courses/teamPage/${file}.ts`)[1];
      assert.match(code, /^import "server-only";/, `${file}.ts is not server-only`);
    }
  });

  test("nothing addresses the collection through the client SDK", () => {
    const CLIENT = /\b(?:doc|collection)\(\s*[^,()]+,\s*["'`]courseTeamEntries["'`]/;
    assert.deepEqual(FILES.filter(([, code]) => CLIENT.test(code)).map(([file]) => file), []);
  });
});
