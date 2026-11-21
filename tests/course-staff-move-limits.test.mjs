/**
 * HOW OFTEN THE MOVE BUTTON EMAILS: the limits on a move to another group for
 * good made mid-term (`src/lib/courses/staffMove/limits.ts`).
 *
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/people/[uid]/move
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * A move emails the person and each facilitator of both groups. Two stored
 * counters bound it, in the notice lane's `courseNudges` as
 * `emailrate__<key>`: four moves of one person on one run in a day, and forty
 * moves by one presser in a day. This file holds:
 *
 *  1. under the limits, a move is made and claims one of each;
 *  2. at the limit by person, and by presser: the preview says the sentence
 *     before the press, and the press is refused in it (429) with nothing
 *     written, nothing claimed and nobody emailed;
 *  3. real presses fill the counter, and the next is refused;
 *  4. a day after the counter began, it has room again;
 *  5. the claim is made in the move's own transaction, with its writes, so
 *     a press refused for any reason claims nothing; and the preview reads
 *     the same counters the press claims.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`),
 * Tue 17 Nov 2026 at noon, as `tests/course-staff-move.test.mjs` uses it.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AGI, C, D, NOW, ROUND, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const w = await makeLeavingWorld("__staffMoveLimits");
const { world, call } = w;
const moveRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "move");
const limits = await w.loadTs(join("lib", "courses", "staffMove", "limits.ts"));
const { MOVE_LIMITS, MOVE_LIMIT_WORDS } = limits;
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const source = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

const DAY_MS = 24 * 60 * 60 * 1000;
/** Freya's counter on the run the world moves her on: per person, per run. */
const PERSON_KEY = `staffmoved__${RUN.agi}__freya`;
const read = (path) => world.db.read(path);
const counter = (key) => read(`courseNudges/emailrate__${key}`);
const everything = () => JSON.stringify(world.db.paths().sort().map((path) => [path, read(path)]));

const move = (who, uid, body) => call(who, moveRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
const preview = (who, uid, toGroupId) => move(who, uid, { toGroupId, preview: true });
/** A press made the way the page makes one: the preview's week and count sent back. */
async function press(who, uid, toGroupId) {
  const shown = await preview(who, uid, toGroupId);
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  return move(who, uid, { toGroupId, weekNumber: shown.body.preview.weekNumber, emailCount: shown.body.preview.emails });
}

/** A counter as a claim leaves it: `count` claims in a window that began `agoMs` ago. */
function seedCounter(key, count, agoMs = 60 * 60 * 1000) {
  world.db.seed(`courseNudges/emailrate__${key}`, {
    kind: "staff-email-throttle",
    key,
    windowStartAt: new Date(Date.now() - agoMs),
    count,
    updatedAt: new Date(Date.now() - agoMs),
  });
}

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
  for (const [groupId, count] of [
    [C, 2],
    [D, 2],
  ]) {
    world.db.poke(`courseGroups/${groupId}`, { memberCount: count });
  }
});

describe("the limits", () => {
  test("four moves of one person on one run in a day, forty by one presser", () => {
    assert.deepEqual({ ...MOVE_LIMITS }, { perPersonDay: 4, perPresserDay: 40 });
  });

  test("their sentences say what was not done", () => {
    assert.equal(
      MOVE_LIMIT_WORDS.personDay("Freya", 4),
      "Freya has been moved 4 times in the last day, so this move wasn’t made and nobody was emailed: try again tomorrow, or ask an admin.",
    );
    assert.equal(
      MOVE_LIMIT_WORDS.personDay("", 4),
      "They have been moved 4 times in the last day, so this move wasn’t made and nobody was emailed: try again tomorrow, or ask an admin.",
    );
    assert.equal(
      MOVE_LIMIT_WORDS.presserDay(40),
      "You’ve made 40 moves in the last day, so this move wasn’t made and nobody was emailed: try again tomorrow, or ask an admin.",
    );
    assert.equal(MOVE_LIMIT_WORDS.unread, "The limits on a move’s emails couldn’t be read, so nothing was moved and nobody was emailed. Try again.");
  });
});

describe("under the limits", () => {
  test("a move is made, emails its three people and claims one of each counter", async () => {
    const saved = await press("claudia", "freya", C);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(world.mail.length, 3);
    assert.equal(counter(PERSON_KEY).count, 1);
    assert.equal(counter("staffmover__claudia").count, 1);
  });

  test("one below each limit, the preview and the press both go ahead", async () => {
    seedCounter(PERSON_KEY, MOVE_LIMITS.perPersonDay - 1);
    seedCounter("staffmover__claudia", MOVE_LIMITS.perPresserDay - 1);
    const saved = await press("claudia", "freya", C);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(counter(PERSON_KEY).count, MOVE_LIMITS.perPersonDay);
    assert.equal(counter("staffmover__claudia").count, MOVE_LIMITS.perPresserDay);
  });
});

describe("at a limit: the preview says it, and the press is refused with nothing written, claimed or sent", () => {
  for (const [label, key, words, otherKey] of [
    ["by person", PERSON_KEY, () => MOVE_LIMIT_WORDS.personDay("Freya", MOVE_LIMITS.perPersonDay), "staffmover__claudia"],
    ["by presser", "staffmover__claudia", () => MOVE_LIMIT_WORDS.presserDay(MOVE_LIMITS.perPresserDay), PERSON_KEY],
  ]) {
    test(label, async () => {
      // What the page showed before the limit was reached, as a press would send it back.
      const shown = (await preview("claudia", "freya", C)).body.preview;
      seedCounter(key, label === "by person" ? MOVE_LIMITS.perPersonDay : MOVE_LIMITS.perPresserDay);
      const before = everything();

      const ahead = await preview("claudia", "freya", C);
      assert.deepEqual([ahead.status, ahead.body.error], [429, words()], "the preview says the same before the press");

      const refused = await move("claudia", "freya", { toGroupId: C, weekNumber: shown.weekNumber, emailCount: shown.emails });
      assert.deepEqual([refused.status, refused.body.error], [429, words()]);
      assert.equal(everything(), before, "nothing written, and no counter claimed");
      assert.equal(counter(otherKey), undefined);
      assert.deepEqual(world.mail, [], "nobody emailed");
      assert.equal(read(`courseEnrolments/${RUN.agi}__freya`).groupId, D, "still in the group they were in");
    });
  }

  test("an admin is held to it as the lead is", async () => {
    seedCounter("staffmover__zach", MOVE_LIMITS.perPresserDay);
    const ahead = await preview("zach", "freya", C);
    assert.deepEqual([ahead.status, ahead.body.error], [429, MOVE_LIMIT_WORDS.presserDay(MOVE_LIMITS.perPresserDay)]);
    // Another presser is not.
    assert.equal((await preview("claudia", "freya", C)).status, 200);
  });

  test("real presses fill the person's counter, and the next press is refused", async () => {
    seedCounter(PERSON_KEY, MOVE_LIMITS.perPersonDay - 1);
    assert.equal((await press("claudia", "freya", C)).status, 200);
    world.mail.length = 0;
    // Moved back the same way: the counter is full, so it is refused before anything is read about the week.
    const back = await preview("claudia", "freya", D);
    assert.deepEqual([back.status, back.body.error], [429, MOVE_LIMIT_WORDS.personDay("Freya", MOVE_LIMITS.perPersonDay)]);
    assert.deepEqual(world.mail, []);
  });
});

describe("per person on a run", () => {
  test("four moves of a person on another run do not refuse a move of them on this one, and are not counted by it", async () => {
    const OTHER = `staffmoved__${RUN.other}__freya`;
    seedCounter(OTHER, MOVE_LIMITS.perPersonDay);
    const saved = await press("claudia", "freya", C);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(counter(PERSON_KEY).count, 1, "this run's counter");
    assert.equal(counter(OTHER).count, MOVE_LIMITS.perPersonDay, "the other run's, untouched");
  });

  test("and the other way: four moves on this run say nothing about the other run", async () => {
    seedCounter(PERSON_KEY, MOVE_LIMITS.perPersonDay);
    const person = { uid: "freya", firstName: "Freya" };
    assert.deepEqual(await limits.moveLimitRefusal(world.courseDb, RUN.agi, person, "claudia"), {
      ok: false,
      status: 429,
      error: MOVE_LIMIT_WORDS.personDay("Freya", MOVE_LIMITS.perPersonDay),
    });
    assert.equal(await limits.moveLimitRefusal(world.courseDb, RUN.other, person, "claudia"), null);
  });
});

describe("the counter filled between the page and the press", () => {
  test("refused inside the move's own transaction: 429, nothing written, nothing claimed, nobody emailed", async () => {
    const shown = (await preview("claudia", "freya", C)).body.preview;
    // Another lead's moves fill Freya's counter as this press's transaction begins.
    const db = world.courseDb;
    const original = db.runTransaction;
    let before = null;
    db.runTransaction = async function (fn) {
      if (before === null) {
        seedCounter(PERSON_KEY, MOVE_LIMITS.perPersonDay);
        before = everything();
      }
      return original.call(this, fn);
    };
    let refused;
    try {
      refused = await move("claudia", "freya", { toGroupId: C, weekNumber: shown.weekNumber, emailCount: shown.emails });
    } finally {
      db.runTransaction = original;
    }
    assert.notEqual(before, null, "the press ran a transaction");
    assert.deepEqual([refused.status, refused.body.error], [429, MOVE_LIMIT_WORDS.personDay("Freya", MOVE_LIMITS.perPersonDay)]);
    assert.equal(everything(), before, "nothing written by the press, nothing claimed");
    assert.equal(counter(PERSON_KEY).count, MOVE_LIMITS.perPersonDay);
    assert.equal(counter("staffmover__claudia"), undefined);
    assert.equal(read(`courseEnrolments/${RUN.agi}__freya`).groupId, D, "nothing moved");
    assert.deepEqual(world.mail, [], "nobody emailed");
  });
});

describe("the window passing", () => {
  test("a counter that began a day ago has room again, and starts afresh", async () => {
    seedCounter(PERSON_KEY, MOVE_LIMITS.perPersonDay, DAY_MS + 60_000);
    seedCounter("staffmover__claudia", MOVE_LIMITS.perPresserDay, DAY_MS + 60_000);
    const saved = await press("claudia", "freya", C);
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(counter(PERSON_KEY).count, 1);
    assert.equal(counter("staffmover__claudia").count, 1);
  });

  test("a minute short of a day, it is still full", async () => {
    seedCounter(PERSON_KEY, MOVE_LIMITS.perPersonDay, DAY_MS - 60_000);
    assert.equal((await preview("claudia", "freya", C)).status, 429);
    mock.timers.setTime(NOW.getTime() + 2 * 60_000);
    assert.equal((await preview("claudia", "freya", C)).status, 200);
  });
});

describe("where the limits sit", () => {
  test("the save reads them in the move's own transaction, and claims them only with the move's own writes", () => {
    const save = source("lib", "courses", "staffMove", "save.ts");
    const body = save.slice(save.indexOf("export async function saveMove("));
    const confirm = body.slice(body.indexOf("async confirm(tx, seen"), body.indexOf("alsoWrite(tx, seen)"));
    assert.match(confirm, /await moveLimitsIn\(tx, db, input\.runId, facts\.person, input\.actor\.uid\)/);
    assert.match(confirm, /if \(limits\.refusal\) return \{ kind: "limit", error: limits\.refusal \};/);
    const also = body.slice(body.indexOf("alsoWrite(tx, seen)"));
    assert.match(also, /^alsoWrite\(tx, seen\) \{\s*claimLimits\(\);/);
    assert.ok(body.indexOf("moveLimitsIn(") < body.indexOf("sendMoveEmail("));
  });

  test("a press refused because the week changed under it (409) claims nothing", async () => {
    // The press sends back a week the move is not from.
    const shown = (await preview("claudia", "freya", C)).body.preview;
    const stale = await move("claudia", "freya", { toGroupId: C, weekNumber: shown.weekNumber + 1, emailCount: shown.emails });
    assert.equal(stale.status, 409);
    assert.equal(counter(PERSON_KEY), undefined);
    assert.equal(counter("staffmover__claudia"), undefined);
    assert.deepEqual(world.mail, []);
  });

  test("the plan (the page and the preview) reads the same counters, after its own refusals", () => {
    const plan = source("lib", "courses", "staffMove", "plan.ts");
    const body = plan.slice(plan.indexOf("export async function planMove("));
    const peek = body.indexOf("await moveLimitRefusal(db, facts.run.id, facts.person, actorUid)");
    assert.notEqual(peek, -1);
    assert.ok(body.indexOf("weekRefusal(") < peek);
    // One list of windows for both.
    const own = source("lib", "courses", "staffMove", "limits.ts");
    assert.equal([...own.matchAll(/moveLimitWindows\(runId, person, actorUid\)/g)].length, 2);
  });
});
