/**
 * WHAT THE BOARD SAYS BEFORE A MOVE MADE MID-TERM NAMES A TIME ANSWER ONLY TO
 * A READER OF TIME ANSWERS. The question before the press
 * (`POST /api/courses/runs/[runId]/allocate` with `preview: true`) says what
 * the move leaves behind on the old group, among it the sessions somebody
 * ticked under "Most weeks, not all". That tick is part of their time
 * answer, which an admin and the programme's lead read and a run's track
 * lead does not (`readsTimeAnswers`). So the question names it to the first
 * two alone, and the press, which words nothing, reads none.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * Chloe is in Group B, which met weeks 1 and 2 and meets tonight; she applied
 * to the run itself, so the run's track lead (Yusuf) is served her row on the
 * board. Claudia leads the programme; Zach is an admin.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { A, B, C, D, NOW, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";
import { walkSource } from "./lib/functionScan.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const w = await makeLeavingWorld("__boardMoveTimeAnswer");
const { world, call } = w;

const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const preview = (who, placements) => call(who, w.routes.allocate.POST, { runId: RUN.agi }, { body: { placements, preview: true }, course: true });
const TICKED = "Chloe ticked Group B’s week 5 session under “Most weeks, not all”. That no longer applies once Chloe moves.";

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  for (const [groupId, count] of [
    [A, 4],
    [B, 3],
    [C, 2],
    [D, 2],
  ]) {
    world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  }
  // Chloe answered "Most weeks, not all" about Group B, ticking its week 5 session.
  world.db.poke(seatPath("chloe"), { timeAnswer: { kind: "mostWeeks", sessionKeys: ["w05"], forGroupId: B, at: new Date("2026-11-01T10:00:00Z") } });
});

describe("the board's question before a move made mid-term", () => {
  test("names the sessions ticked under Most weeks, not all to an admin and the programme's lead", async () => {
    for (const who of ["zach", "claudia"]) {
      const shown = await preview(who, [{ uid: "chloe", groupId: C }]);
      assert.equal(shown.status, 200, `${who}: ${JSON.stringify(shown.body)}`);
      const [entry] = shown.body.preview;
      assert.equal(typeof entry.fromWeek, "number", who);
      assert.ok(entry.words.includes(TICKED), `${who}: ${entry.words}`);
    }
  });

  test("names nothing of the time answer to a run's track lead, who is served the row", async () => {
    const board = await call("yusuf", w.routes.board.GET, { runId: RUN.agi }, { course: true });
    assert.equal(board.status, 200, JSON.stringify(board.body));
    assert.ok(JSON.stringify(board.body).includes("chloe"), "the track lead is served Chloe's row");
    const shown = await preview("yusuf", [{ uid: "chloe", groupId: C }]);
    assert.equal(shown.status, 200, JSON.stringify(shown.body));
    const said = JSON.stringify(shown.body);
    assert.doesNotMatch(said, /Most weeks|ticked|w05|week 5/, said);
    // Nothing is written by a preview.
    assert.equal(world.db.read(seatPath("chloe")).groupId, B);
  });
});

// ---------------------------------------------------------------------------
// The guard: who is told what a move leaves behind
// ---------------------------------------------------------------------------

const uncommented = (code) => code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const rel = (file) => relative(ROOT, file).split("\\").join("/");

/** Every call of `leftBehindOf` and `planBoardMove`, with what it is handed for the reader, and why. */
const CALLERS = {
  // The move page and its route: the programme's lead and admins alone, who read time answers.
  "src/lib/courses/staffMove/plan.ts": ["leftBehindOf(db, facts, weekNumber, { timeAnswers: true })"],
  // The board's question, handed the caller's answer; the press words nothing and reads none.
  "src/lib/courses/staffMove/board.ts": [
    "leftBehindOf(db, { run, from, place }, week.weekNumber, { timeAnswers })",
    "planBoardMove(db, input.run, input.uid, input.toGroupId, input.now, false, false)",
  ],
  // The board's preview: asked of the one function that decides who reads time answers.
  "src/app/api/courses/runs/[runId]/allocate/route.ts": ["planBoardMove(db, run, uid, groupId, now, true, readsTimeAnswers(staffing))"],
};

describe("every reader of what a move leaves behind says who it reads for", () => {
  test("each call of leftBehindOf and planBoardMove is registered with its reader, both ways", () => {
    const found = {};
    for (const file of walkSource(SRC)) {
      const code = uncommented(readFileSync(file, "utf8"));
      const calls = [...code.matchAll(/(?<!function )\b(leftBehindOf|planBoardMove)\([^;]*?\)(?=[;,\n])/g)]
        .map((match) => match[0].replace(/\s+/g, " "))
        .filter((text) => !/^\w+\(\s*db: Firestore/.test(text));
      if (calls.length > 0) found[rel(file)] = calls;
    }
    assert.deepEqual(found, CALLERS);
    // The function that decides it, as the board's own GET asks it.
    const staffing = readFileSync(join(SRC, "lib", "courses", "runStaffing.ts"), "utf8");
    assert.match(staffing, /export function readsTimeAnswers\(staffing: RunStaffing\): boolean \{\s*return staffing\.isAdmin \|\| staffing\.leadOf !== null;\s*\}/);
  });
});
