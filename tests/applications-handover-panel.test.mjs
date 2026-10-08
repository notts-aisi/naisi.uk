/**
 * The "Course run" panel on a programme's Settings tab.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   /admin/admissions/forms/[roundId]/programmes/[programmeId]/setup
 *   src/features/applications/editor/RunHandOver.tsx, runHandOverWords.ts
 *
 * ## What this guards
 *
 * The panel is where an admin names the run a programme places people on
 * and presses the hand-over. It names people, so:
 *
 *  - THE PAGE DRAWS IT FOR AN ADMIN AND FOR NOBODY ELSE. A programme's lead
 *    opens the same Settings tab, and is drawn the settings and no panel.
 *    Nothing of the panel is in what the lead's page is built from, and
 *    nothing was read to build it.
 *  - WHAT IT SAYS IS WHAT THE SERVER SAID. The words are worked out from the
 *    panel the routes send, and where the server wrote a sentence the panel
 *    shows that sentence. This file reads the real panel after a real
 *    hand-over and holds the words to it.
 *  - IT ASKS THROUGH THE EDITOR'S ONE DOOR, and waits for the page to be
 *    live before anything can be pressed.
 *
 * Real: the page (a server component), its loaders, the routes that send the
 * panel, and the words. Faked: the usual doors, the page's gate (which hands
 * back whoever the test signed in), and the two client components the page
 * hands its props to, each of which records what it was handed.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import {
  AGI,
  AGI_HOLDERS,
  CAST,
  INCUBATOR,
  ROUND,
  RUN,
  loadJoin,
  makeWorld,
  namedSeed,
  seedWorld,
} from "./lib/handoverWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";
import { createLoader } from "./lib/tsLoader.mjs";

const made = makeWorld();
const { world, reset } = made;
const { press, panel, reply } = await loadJoin(made);
const words = await made.lib("..", "features", "applications", "editor", "runHandOverWords.ts");
const refusals = await made.lib("applications", "handover", "run.ts");

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-24T10:00:00Z") });
beforeEach(() => {
  mock.timers.setTime(Date.now() + 15 * 60_000);
  reset(namedSeed());
});

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const page = { handed: {}, createElement };
globalThis.__handoverPanel = page;
const records = (name) =>
  `export default function ${name}(props) {\n` +
  `  globalThis.__handoverPanel.handed.${name} = props;\n` +
  `  return globalThis.__handoverPanel.createElement('div', { 'data-drawn': '${name}' });\n` +
  "}";

const { loadTs: loadPage } = createLoader({
  stubs: new Map([
    ["server-only", "export {};"],
    ["firebase-admin/firestore", FIELD_VALUE_STUB],
    ["@/lib/firebase/admin", "export function getAdminDb() { return globalThis.__handover.db; }"],
    // The tab's gate, which has already turned away anybody with no way in.
    ["@/lib/firebase/pageGates", "export async function requireAdmissionsPage() { return globalThis.__handover.user; }"],
    ["@/features/applications/editor/ProgrammeSetup", records("ProgrammeSetup")],
    ["@/features/applications/editor/RunHandOver", records("RunHandOver")],
    ["@/features/applications/editor/ProgrammeSetup.module.css", "export default new Proxy({}, { get: (_, name) => String(name) });"],
    [
      "@/features/applications/editor/Refusals",
      "export function NoProgrammeHere() { return globalThis.__handoverPanel.createElement('p', null, 'no programme here'); }\n" +
        "export function SettingsAreTheLeads() { return globalThis.__handoverPanel.createElement('p', null, 'settings are the lead’s'); }",
    ],
  ]),
});
const { default: SetupPage } = await loadPage(
  join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)", "setup", "page.tsx"),
);

async function drawAs(who, programmeId = AGI) {
  world.user = made.sessionOf(who);
  page.handed = {};
  const reads = [];
  const collection = world.db.collection;
  world.db.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  try {
    const html = renderToStaticMarkup(await SetupPage({ params: Promise.resolve({ roundId: ROUND, programmeId }) }));
    return { html, handed: page.handed, reads };
  } finally {
    world.db.collection = collection;
  }
}

describe("the Settings tab draws the panel for an admin, and for nobody else", () => {
  test("an admin is drawn the settings and the panel, with what the route would send", async () => {
    await press();
    const drawn = await drawAs("zach");
    assert.ok(drawn.html.includes('data-drawn="ProgrammeSetup"'));
    assert.ok(drawn.html.includes('data-drawn="RunHandOver"'));
    assert.deepEqual(
      [drawn.handed.RunHandOver.roundId, drawn.handed.RunHandOver.programmeId],
      [ROUND, AGI],
    );
    assert.deepEqual(drawn.handed.RunHandOver.initial, await panel());
  });

  test("the programme's own lead is drawn the settings and no panel, and nothing was read for one", async () => {
    await press();
    const drawn = await drawAs("claudia");
    assert.ok(drawn.html.includes('data-drawn="ProgrammeSetup"'));
    assert.ok(!drawn.html.includes("RunHandOver"));
    assert.equal(drawn.handed.RunHandOver, undefined);
    // The panel's read lists the run's rows. A lead's page never asks for them.
    assert.ok(!drawn.reads.includes("courseApplications"), "a lead's page read the run's rows");
    assert.ok(!drawn.reads.includes("courseRuns"), "a lead's page read the run");
    const said = JSON.stringify(drawn.handed);
    for (const uid of AGI_HOLDERS) {
      assert.ok(!said.includes(CAST[uid].displayName), `${uid} is named in what a lead's page was handed`);
    }
    // The same page, for an admin, does read them.
    assert.ok((await drawAs("zach")).reads.includes("courseApplications"));
  });

  test("a reviewer is told the settings are the lead's, and somebody with no role that there is nothing here", async () => {
    assert.ok((await drawAs("lloyd")).html.includes("settings are the lead’s"));
    for (const who of ["yusuf", "amara", "nobody"]) {
      const drawn = await drawAs(who);
      assert.ok(drawn.html.includes("no programme here"), who);
      assert.equal(drawn.handed.RunHandOver, undefined, who);
    }
  });

  test("an admin on a programme with no course page is drawn the panel, saying so", async () => {
    const drawn = await drawAs("zach", INCUBATOR);
    assert.equal(drawn.handed.RunHandOver.initial.courseTied, false);
    assert.match(words.runHint(drawn.handed.RunHandOver.initial), /Tie this programme to its course page first/);
  });
});

// ---------------------------------------------------------------------------
// The words
// ---------------------------------------------------------------------------

describe("what the panel says, from what the server sent", () => {
  test("before a run is named: what picking one does, or that there is none to pick", async () => {
    reset(seedWorld());
    assert.match(words.runHint(await panel()), /^Pick the run this programme’s accepted people go onto\./);
    world.db.poke(`courseRuns/${RUN.agi}`, { archived: true });
    world.db.poke(`courseRuns/${RUN.agiSpring}`, { status: "cancelled" });
    assert.match(words.runHint(await panel()), /has no run that can be picked/);
  });

  test("once a run is named: where its people go, and that the run's own apply page is shut", async () => {
    const shown = await panel();
    assert.equal(
      words.runHint(shown),
      "People who hold a place on AGI Strategy are handed over to this run. Its own apply page takes no applications.",
    );
    assert.deepEqual(words.unpickable(shown), []);
  });

  test("a run that cannot be picked is listed with the server's own reason", async () => {
    world.db.seed("courseApplications/agi-strategy-spring-2027__run00002__nobody", {
      runId: RUN.agiSpring,
      uid: "nobody",
      status: "pending",
    });
    const reasons = words.unpickable(await panel());
    assert.deepEqual(reasons.map((choice) => [choice.id, choice.note]), [[RUN.agiSpring, refusals.RUN_HAS_APPLICATIONS]]);
  });

  test("once anybody is handed over, the line under the run is the server's sentence that it stays", async () => {
    await press();
    assert.equal(words.runHint(await panel()), refusals.RUN_LOCKED);
  });

  test("how many hold a place and how many are on the list, as the list fills", async () => {
    let shown = await panel();
    assert.equal(words.holdersLine(shown), "4 people hold a place on AGI Strategy. None of them is on the run’s list yet.");
    assert.equal(words.handOverButton(shown), "Hand over 4 people");

    world.db.seed(`courseApplications/${RUN.agi}__amara`, {
      runId: RUN.agi,
      uid: "amara",
      status: "accepted",
      fromForm: { roundId: ROUND, programmeId: AGI },
    });
    shown = await panel();
    assert.equal(words.holdersLine(shown), "4 people hold a place on AGI Strategy. 1 of them is on the run’s list.");
    assert.equal(words.handOverButton(shown), "Hand over 3 people");

    const pressed = await press();
    assert.equal(words.handOverReceipt(pressed.body.receipt), "3 people handed over. 1 person was already there.");
    shown = await panel();
    assert.equal(words.holdersLine(shown), "4 people hold a place on AGI Strategy, and all of them are on the run’s list.");
    assert.equal(words.handOverButton(shown), "Hand over anybody new");
    assert.equal(
      words.handOverReceipt((await press()).body.receipt),
      "Nobody new to hand over. Everybody who holds a place already has a row on the run’s list.",
    );
  });

  test("one person is one person", async () => {
    for (const uid of ["bea", "dev", "tariq"]) {
      await reply(uid, { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    }
    let shown = await panel();
    assert.equal(words.holdersLine(shown), "1 person holds a place on AGI Strategy. None of them is on the run’s list yet.");
    assert.equal(words.handOverButton(shown), "Hand over 1 person");
    assert.equal(words.handOverReceipt((await press()).body.receipt), "1 person handed over.");
    shown = await panel();
    assert.equal(words.holdersLine(shown), "1 person holds a place on AGI Strategy, and they are on the run’s list.");
    assert.equal(words.otherRowsLine(1), "1 row on this run’s list did not come from this programme.");
    assert.equal(words.otherRowsLine(3), "3 rows on this run’s list did not come from this programme.");
  });

  test("nobody holding a place is said as that, and a press then says so too", async () => {
    for (const uid of AGI_HOLDERS) {
      await reply(uid, { reply: "cant-make-it", reason: { kind: "times", other: "" } });
    }
    assert.equal(words.holdersLine(await panel()), "Nobody holds a place on AGI Strategy yet.");
    assert.equal(
      words.handOverReceipt((await press()).body.receipt),
      "Nobody holds a place on this programme yet, so nobody was handed over.",
    );
  });
});

// ---------------------------------------------------------------------------
// The component
// ---------------------------------------------------------------------------

describe("the panel itself", () => {
  const EDITOR = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "features", "applications", "editor");
  const code = stripSource(readFileSync(join(EDITOR, "RunHandOver.tsx"), "utf8"), { keepStrings: true });

  test("asks through the editor's one door, and nowhere else", () => {
    assert.ok(!/\bfetch\s*\(/.test(code), "the panel calls fetch itself");
    assert.match(code, /import \{ fetchRunPanel, postHandOver, putProgrammeRun \} from "\.\/editorClient";/);
  });

  test("nothing can be pressed before the page is live, or while a request is out", () => {
    assert.match(code, /const live = useHydrated\(\);/);
    assert.match(code, /const idle = live && busy === null;/);
    // The run box, the hand-over and the re-read each wait for it.
    assert.match(code, /disabled=\{!idle \|\| !panel\.courseTied \|\| panel\.runLocked !== null\}/);
    assert.match(code, /disabled=\{!idle \|\| panel\.blocked !== null\}/);
    assert.match(code, /className=\{styles\.quiet\} disabled=\{!idle\}/);
  });

  test("what stops a press is shown in the server's own words, and the button is held", () => {
    assert.match(code, /\{panel\.blocked !== null \? \(\s*<p className=\{shared\.notice\}>\{panel\.blocked\}<\/p>/);
  });

  test("it works nothing out for itself about who holds a place or which run can be picked", () => {
    for (const name of ["holdingOf", "runStanding", "placeHoldersOn", "decisionsSentAt"]) {
      assert.ok(!code.includes(name), `the panel names ${name}`);
    }
  });

  test("it uses the site's styled select", () => {
    assert.ok(!/<select\b/.test(code));
    assert.match(code, /import Select from "@\/components\/ui\/Select";/);
  });
});
