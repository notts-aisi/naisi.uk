/**
 * THE KAIROS FILE, THROUGH ITS REAL ROUTE AND PAGE (src/lib/kairos/file.ts):
 * admins only, once the programme's last session is over, holding everybody
 * on it at the end who has not said no to sharing with Kairos (their name,
 * the programme, the sessions they came to, whether they finished, the
 * ratings they were given) and nothing else, each download recorded before
 * the file is handed over.
 *
 * Callers: an admin; the programme's lead; a facilitator; a fellow; a member
 * with no place; somebody signed out; a view-as session.
 *
 * The world is `tests/lib/ratingsWorld.mjs` (AGI Strategy once its run is
 * over). Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AFTER, AGI, B, DURING, ROUND, RUN, makeRatingsWorld, ratingsSeed } from "./lib/ratingsWorld.mjs";

const w = await makeRatingsWorld("__kairosFile");
const route = await w.loadTs(join("app", "api", "kairos", "export", "route.ts"));
const page = (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "surveys", "kairos", "page.tsx"))).default;
const { KAIROS_FILE_WORDS } = await w.loadTs(join("lib", "kairos", "words.ts"));

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = AFTER) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const said = (uid, shared) => ({ uid, shared, at: AFTER, via: "settings" });
/** Who finished: at least four sessions, set before the end. */
const RULE = { kind: "rule", runId: RUN.agi, atLeast: 4, setAt: new Date("2026-11-30T09:00:00Z") };

/** The file's raw answer, as `who`: a file, or a refusal. */
async function exportAs(who, body = { roundId: ROUND, programmeId: AGI }, { viewAs = false } = {}) {
  w.world.user = w.sessionOf(who);
  w.world.viewAs = viewAs;
  try {
    const response = await route.POST(
      new Request("https://naisi.invalid/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    );
    if (response instanceof Response) {
      return { status: response.status, text: await response.text(), headers: Object.fromEntries(response.headers) };
    }
    return { status: response.status, body: response.body };
  } finally {
    w.world.viewAs = false;
  }
}

const logged = () =>
  w.world.db
    .paths()
    .filter((path) => path.startsWith("dataExports/"))
    .map((path) => w.world.db.read(path));

/** The file's rows as arrays of cells, the header first. */
const rowsOf = (text) => text.trim().split(/\r?\n/).map((line) => line.split(","));

describe("who may download the Kairos file", () => {
  test("only an admin; everybody else is refused before anything is read, and nothing is recorded", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    for (const [who, why] of [
      ["claudia", "the programme's lead"],
      ["rahul", "a facilitator"],
      ["amara", "a fellow"],
      ["nobody", "a member with no place"],
    ]) {
      const refused = await exportAs(who);
      assert.deepEqual([refused.status, refused.body?.error], [403, KAIROS_FILE_WORDS.adminOnly], why);
    }
    assert.equal((await exportAs(null)).status, 401);
    assert.equal((await exportAs("zach", undefined, { viewAs: true })).status, 403, "a view-as session downloads nothing");
    assert.equal(logged().length, 0);
  });

  test("before the programme's last session is over there is no file; a programme that is not there is refused", async (t) => {
    clock(t, DURING);
    w.reset(ratingsSeed());
    const early = await exportAs("zach");
    assert.deepEqual([early.status, early.body?.error], [409, KAIROS_FILE_WORDS.notOver("Wed 9 Dec")]);
    t.mock.timers.setTime(AFTER.getTime());
    assert.equal((await exportAs("zach", { roundId: ROUND, programmeId: "no-such-programme" })).status, 404);
    assert.equal((await exportAs("zach", { roundId: "a/b", programmeId: AGI })).status, 400);
    assert.equal(logged().length, 0);
  });
});

describe("what the Kairos file holds", () => {
  test("everybody at the end who has not said no: the default, and one who changed back; never one who said no", async (t) => {
    clock(t);
    w.reset(
      ratingsSeed({
        [`courseFinishing/${RUN.agi}`]: RULE,
        "kairosChoices/bea": said("bea", false),
        "kairosChoices/dev": said("dev", true),
      }),
    );
    await w.rate("rahul", B, "amara", { f2: 4, f3: 5, f4: 3, f5: "strongYes" });
    await w.rate("sofia", B, "amara", { f2: 5 });
    await w.rate("claudia", B, "rahul", { f5: "yes" });
    const file = await exportAs("zach");
    assert.equal(file.status, 200, file.body?.error);
    assert.match(file.headers["content-disposition"], /attachment; filename="kairos-agi-strategy-2026-12-10\.csv"/);
    const [header, ...rows] = rowsOf(file.text);
    assert.deepEqual(header, [
      "Name",
      "Programme",
      "Sessions attended",
      "Of",
      "Finished",
      "Ratings",
      "Engagement (1 to 5)",
      "Grasp (1 to 5)",
      "Drive (1 to 5)",
      "Next step",
    ]);
    const names = rows.map((row) => row[0]);
    // "Their name" is the name they go by (`fullNameOfUser`), never a full
    // name: only the committee sees that, and this file goes to Kairos.
    assert.deepEqual(names, ["Amara", "Dev", "Rahul", "Sofia", "Tariq"]);
    assert.ok(!file.text.includes("Bea"), "somebody who said no is in the file");
    assert.deepEqual(rows[0], ["Amara", "AGI Strategy", "6", "6", "Yes", "2", "4; 5", "5", "3", "Strong yes"]);
    assert.deepEqual(rows[1], ["Dev", "AGI Strategy", "2", "6", "No", "0", "", "", "", ""]);
    assert.deepEqual(rows[2].slice(0, 6), ["Rahul", "AGI Strategy", "5", "6", "Yes", "1"]);
    assert.equal(rows[2][9], "Yes", "a facilitator's rating by the lead is in their row");
    assert.doesNotMatch(file.text, /@example\.com/, "never an address");
    assert.doesNotMatch(file.text, /Claudia|Reyes|Sofia,AGI Strategy,6,6,Yes,1/, "never who gave a rating");
  });

  test("somebody who left is not in it, and a survey answer never is", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    w.world.db.poke(`courseEnrolments/${RUN.agi}__tariq`, { status: "withdrawn", droppedOutAt: new Date("2026-11-20T09:00:00Z") });
    const file = await exportAs("zach");
    assert.ok(!file.text.includes("Tariq"), "a leaver's record goes to Kairos with their name");
    assert.equal(rowsOf(file.text)[0].length, 10, "a column beyond the record and the ratings");
  });

  test("an incubator's file adds the mentor rating's columns", async (t) => {
    clock(t);
    const seed = ratingsSeed();
    seed[`admissionRounds/${ROUND}`].programmes[AGI].kind = "incubator";
    w.reset(seed);
    await w.rate("rahul", B, "amara", { m1: 9 });
    const [header, first] = rowsOf((await exportAs("zach")).text);
    assert.deepEqual(header.slice(10), ["Support for the research (1 to 10)", "Skill (1 to 10)", "Independence (1 to 10)"]);
    assert.equal(first[10], "9");
  });
});

describe("every download is recorded before the file is handed over", () => {
  test("each press writes its row, and a row that cannot be written refuses the file", async (t) => {
    clock(t);
    w.reset(ratingsSeed({ "kairosChoices/bea": said("bea", false) }));
    assert.equal((await exportAs("zach")).status, 200);
    assert.equal((await exportAs("zach")).status, 200);
    const rows = logged();
    assert.equal(rows.length, 2, "each opening of the file is recorded");
    assert.equal(rows[0].kind, "kairos");
    assert.deepEqual(rows[0].scope, { roundId: ROUND, runId: RUN.agi });
    assert.equal(rows[0].rowCount, 5);
    assert.equal(rows[0].actorUid, "zach");
    assert.equal(rows[0].filename, "kairos-agi-strategy-2026-12-10.csv");

    const realCollection = w.world.db.collection;
    w.world.db.collection = (path) => {
      const found = realCollection(path);
      if (path === "dataExports") found.add = async () => { throw new Error("the log is down"); };
      return found;
    };
    t.mock.method(console, "error", () => {});
    try {
      const refused = await exportAs("zach");
      assert.deepEqual([refused.status, refused.body?.error], [503, KAIROS_FILE_WORDS.notRecorded]);
    } finally {
      w.world.db.collection = realCollection;
    }
  });
});

describe("the Kairos page", () => {
  test("each programme that names a run, with the file once its last session is over", async (t) => {
    clock(t);
    w.reset(ratingsSeed());
    const after = await w.page(page, {}, "zach");
    assert.ok(after.text.includes("AGI Strategy"));
    assert.ok(after.text.includes(KAIROS_FILE_WORDS.holds));
    assert.ok(after.text.includes(KAIROS_FILE_WORDS.download));
    t.mock.timers.setTime(DURING.getTime());
    const during = await w.page(page, {}, "zach");
    assert.ok(during.text.includes(KAIROS_FILE_WORDS.notOverLine("Wed 9 Dec")));
    assert.ok(!during.text.includes(KAIROS_FILE_WORDS.download), "a button for a file that cannot be made yet");
  });
});
