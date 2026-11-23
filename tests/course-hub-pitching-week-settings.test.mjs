/**
 * Pitching week's settings on a programme's Groups, Pitches: the card, and
 * the one route that saves it
 * (`PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/pitching-week`).
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * The world is the incubator's teams world (`tests/lib/teamsWorld.mjs`): Tess
 * leads the incubator, Yusuf reviews it, Claudia leads AGI Strategy (a
 * fellowship) and facilitates nothing here, Tomas is the run's track lead,
 * Sofia facilitates its Thursday group, Amara holds a place, Zach is the
 * admin. Week 3 is ticked as pitching week, the run's teams come from the
 * pitches (or from the agenda, as a suite says), teams of 2 to 4, made on
 * Thursday 19 November, up to 3 picks each.
 *
 * Held here: who may save (the programme's lead and admins, nobody else, no
 * view-as session); every check the run editor's Pitching week section made,
 * field by field; the same stored fields, and nothing else on the run; a
 * save that changes nothing writes nothing; once the run has teams, how they
 * are made stays as it is, and the pitches, picks and teams are never
 * touched; what each kind of programme is shown on Pitches (teams from the
 * pitches, teams from the agenda, no teams at all); and Pitches offered on
 * Groups for every incubator.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { AGI, AT, CALLERS, INC, INCUBATOR, PITCH, ROUND, RUN, makeTeamsWorld, short, teamsSeed, textOf } from "./lib/teamsWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makeTeamsWorld("__pitchingWeekSettings");
const { world, reset, call, loadTs, loadUi, sessionOf, ask, everything } = made;

const ROUTE = await loadTs(join("app", "api", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "pitching-week", "route.ts"));
const SETTINGS = await loadTs(join("lib", "courses", "pitching", "settings.ts"));
const TABS = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const { default: PitchesPage } = await loadUi(join(TABS, "groups", "pitches", "page.tsx"));
const { default: FacilitatorsPage } = await loadUi(join(TABS, "groups", "facilitators", "page.tsx"));

const RUN_PATH = `courseRuns/${INC.run}`;
const params = (programmeId = INCUBATOR) => ({ roundId: ROUND, programmeId });

/** What the card sends for the stored settings, with `over` changed. */
const body = (over = {}) => ({ teamsFrom: "pitches", pickLimit: 3, teamSizeMin: 2, teamSizeMax: 4, teamsMadeOn: "2026-11-19", ...over });
const save = (who, payload, { programmeId = INCUBATOR, viewAs = false } = {}) => call(who, ROUTE.PUT, params(programmeId), { body: payload, viewAs });

/** The staff named on the form carry the flag the admissions pages' gate reads. */
function admitted() {
  for (const uid of ["tess", "yusuf", "claudia"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
}

beforeEach(() => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
  admitted();
});

/** The run's document, without its last-written stamp. */
function runNow() {
  const { updatedAt, ...rest } = world.db.read(RUN_PATH);
  void updatedAt;
  return rest;
}

/** Every pitch, pick and team on the store, as one string. */
const pitchesPicksAndTeams = () =>
  JSON.stringify(
    world.db
      .paths()
      .filter((path) => path.startsWith("coursePitches/") || path.startsWith("courseTeams/"))
      .sort()
      .map((path) => [path, world.db.read(path)]),
  );

async function draw(who, Component = PitchesPage, programmeId = INCUBATOR) {
  world.user = sessionOf(who);
  try {
    const element = await Component({ params: Promise.resolve(params(programmeId)), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(element);
    return { html, text: textOf(html), to: null };
  } catch (err) {
    if (err?.to) return { html: "", text: "", to: err.to };
    throw err;
  }
}

describe("1. who may save", () => {
  test("the programme's lead and an admin; a reviewer is refused; anybody with no role is told there is no programme; a view-as session first", async () => {
    const expected = {
      zach: 200,
      tess: 200,
      yusuf: 403,
      claudia: 404,
      tomas: 404,
      sofia: 404,
      amara: 404,
      wen: 404,
      null: 401,
    };
    for (const [who, words] of CALLERS) {
      reset();
      admitted();
      const before = everything();
      const answer = await save(who, body({ pickLimit: 2 }));
      assert.equal(answer.status, expected[String(who)], `${words}: ${JSON.stringify(answer.body)}`);
      if (answer.status !== 200) assert.equal(everything(), before, `${words} wrote something`);
    }
    reset();
    admitted();
    const before = everything();
    for (const who of ["zach", "tess"]) assert.equal((await save(who, body({ pickLimit: 2 }), { viewAs: true })).status, 403, who);
    assert.equal(everything(), before);
  });

  test("an empty body is the same 400 for everybody signed in, before anything is read", async () => {
    for (const [who] of CALLERS) {
      if (who === null) continue;
      assert.deepEqual(short(await save(who, {})), [400, SETTINGS.SEND_EVERY_SETTING], who);
    }
  });

  test("the lead of another programme is told there is no programme on an incubator it has no role on, and gets in on its own fellowship", async () => {
    // Claudia leads AGI Strategy, a fellowship, and so may set its picks.
    const answer = await save("claudia", { teamsFrom: null, pickLimit: 2, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null }, { programmeId: AGI });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`).pitchSettings.pickLimit, 2);
    assert.equal((await save("claudia", body())).status, 404);
  });
});

describe("2. every check the run editor made, field by field", () => {
  const refusals = [
    ["pickLimit 0", { pickLimit: 0 }, "How many pitches a person may pick is a whole number from 1 to 10."],
    ["pickLimit 11", { pickLimit: 11 }, "How many pitches a person may pick is a whole number from 1 to 10."],
    ["pickLimit 2.5", { pickLimit: 2.5 }, "How many pitches a person may pick is a whole number from 1 to 10."],
    ["pickLimit as words", { pickLimit: "three" }, "Send every setting of pitching week, each a value or null."],
    ["the smallest alone", { teamSizeMax: null }, "Give the smallest and the largest team together, or leave both blank."],
    ["the largest alone", { teamSizeMin: null }, "Give the smallest and the largest team together, or leave both blank."],
    ["the smaller second", { teamSizeMin: 5, teamSizeMax: 3 }, "A team’s size is two whole numbers from 1 to 12, the smaller first."],
    ["a team of 13", { teamSizeMax: 13 }, "A team’s size is two whole numbers from 1 to 12, the smaller first."],
    ["a team of 0", { teamSizeMin: 0 }, "A team’s size is two whole numbers from 1 to 12, the smaller first."],
    ["no such day", { teamsMadeOn: "2026-02-30" }, "Give the day the teams are made as a real date."],
    ["a day in words", { teamsMadeOn: "next Thursday" }, "Give the day the teams are made as a real date."],
    ["a third way", { teamsFrom: "both" }, "Teams are made from the pitches, from the agenda, or not set yet."],
  ];
  for (const [what, over, error] of refusals) {
    test(`${what} is refused, and nothing is written`, async () => {
      const before = everything();
      assert.deepEqual(short(await save("tess", body(over))), [400, error]);
      assert.equal(everything(), before);
    });
  }

  test("a key left out is refused: every setting is sent", async () => {
    for (const key of SETTINGS.PITCHING_WEEK_KEYS) {
      const payload = body();
      delete payload[key];
      assert.deepEqual(short(await save("tess", payload)), [400, SETTINGS.SEND_EVERY_SETTING], key);
    }
  });

  test("the card reads its boxes the run editor's way, with the same checks before it sends", () => {
    const boxes = (over = {}) => ({ madeFrom: "pitches", pickLimit: "3", teamMin: "2", teamMax: "4", teamsMadeOn: "2026-11-19", ...over });
    assert.deepEqual(SETTINGS.inputFromBoxes(boxes()), {
      ok: true,
      input: { teamsFrom: "pitches", settings: { pickLimit: 3, teamSize: { min: 2, max: 4 }, teamsMadeOn: "2026-11-19" } },
    });
    assert.deepEqual(SETTINGS.inputFromBoxes(boxes({ madeFrom: "", pickLimit: " ", teamMin: "", teamMax: "", teamsMadeOn: "" })), {
      ok: true,
      input: { teamsFrom: null, settings: { pickLimit: null, teamSize: null, teamsMadeOn: null } },
    });
    assert.deepEqual(SETTINGS.inputFromBoxes(boxes({ teamMax: "" })), { ok: false, error: SETTINGS.SIZES_TOGETHER });
    assert.equal(SETTINGS.inputFromBoxes(boxes({ pickLimit: "3.5" })).ok, false);
    assert.equal(SETTINGS.inputFromBoxes(boxes({ pickLimit: "three" })).ok, false);
    assert.equal(SETTINGS.inputFromBoxes(boxes({ madeFrom: "hand" })).ok, false);
  });
});

describe("3. what a save writes", () => {
  test("the same stored fields as the run editor, and nothing else on the run", async () => {
    const before = runNow();
    const answer = await save("tess", { teamsFrom: "agenda", pickLimit: 2, teamSizeMin: 3, teamSizeMax: 5, teamsMadeOn: "2026-11-26" });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(answer.body.message, "Pitching week saved.");
    const after = runNow();
    assert.deepEqual(after.pitchSettings, { pickLimit: 2, teamSizeMin: 3, teamSizeMax: 5, teamsMadeOn: "2026-11-26" });
    assert.equal(after.teamsFrom, "agenda");
    const { pitchSettings: a, teamsFrom: b, ...restBefore } = before;
    const { pitchSettings: c, teamsFrom: d, ...restAfter } = after;
    void a;
    void b;
    void c;
    void d;
    assert.deepEqual(restAfter, restBefore, "only the two fields changed");
    assert.ok(world.db.read(RUN_PATH).updatedAt, "the run's last-written stamp");
  });

  test("blank boxes are stored as null, as the run editor stores them", async () => {
    assert.equal((await save("zach", { teamsFrom: null, pickLimit: null, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null })).status, 200);
    assert.deepEqual(runNow().pitchSettings, { pickLimit: null, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null });
    assert.equal(runNow().teamsFrom, null);
  });

  test("a save that changes nothing writes nothing and says so", async () => {
    const before = everything();
    const answer = await save("tess", body());
    assert.deepEqual([answer.status, answer.body.saved, answer.body.message], [200, false, "Nothing changed, so nothing was saved."]);
    assert.equal(everything(), before);
  });

  test("which week is pitching week is never written: it is that week's own tick", async () => {
    const weeks = () => JSON.stringify(world.db.paths().filter((path) => path.startsWith(`${RUN_PATH}/weeks/`)).sort().map((path) => [path, world.db.read(path)]));
    const before = weeks();
    assert.equal((await save("tess", body({ pickLimit: 1 }))).status, 200);
    assert.equal(weeks(), before);
  });
});

describe("4. a save while teams are already made", () => {
  test("how teams are made stays as it is once the run has a team, and pitches, picks and teams are untouched", async () => {
    assert.equal((await ask.fromPitch("tess", PITCH.probe)).status, 200);
    const kept = pitchesPicksAndTeams();
    for (const teamsFrom of ["agenda", null]) {
      const before = everything();
      assert.deepEqual(short(await save("tess", body({ teamsFrom }))), [409, SETTINGS.TEAMS_MADE_ALREADY], String(teamsFrom));
      assert.equal(everything(), before);
    }
    // The sizes, the picks and the day may still change; the team keeps its people.
    const answer = await save("tess", body({ pickLimit: 1, teamSizeMin: 3, teamSizeMax: 6, teamsMadeOn: "2026-11-26" }));
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(pitchesPicksAndTeams(), kept);
    assert.deepEqual(runNow().pitchSettings, { pickLimit: 1, teamSizeMin: 3, teamSizeMax: 6, teamsMadeOn: "2026-11-26" });
    assert.equal(runNow().teamsFrom, "pitches");
  });

  test("before any team, how they are made may change, and no pitch or pick moves", async () => {
    const kept = pitchesPicksAndTeams();
    assert.equal((await save("tess", body({ teamsFrom: "agenda" }))).status, 200);
    assert.equal(pitchesPicksAndTeams(), kept);
  });
});

describe("4b. who may, and whether a team exists, asked inside the transaction that writes", () => {
  const FORM = `admissionRounds/${ROUND}`;
  /** Make `change` after the route's first read of the form and before its transaction opens. */
  function beforeTheTransaction(change) {
    const run = world.courseDb.runTransaction;
    let done = false;
    world.courseDb.runTransaction = (fn) => {
      if (!done) {
        done = true;
        change();
      }
      return run.call(world.courseDb, fn);
    };
  }

  test("a lead replaced after the first read is refused, before the transaction or while it runs, and the run is not written", async () => {
    for (const when of ["before", "while"]) {
      reset();
      admitted();
      const run = JSON.stringify(world.db.read(RUN_PATH));
      const change = () => world.db.poke(FORM, { [`programmes.${INCUBATOR}.leadUid`]: "claudia" });
      if (when === "before") beforeTheTransaction(change);
      else world.db.beforeCommit = change;
      const answer = await save("tess", body({ pickLimit: 2 }));
      assert.deepEqual(short(answer), [404, "That programme is not on this form."], when);
      assert.equal(JSON.stringify(world.db.read(RUN_PATH)), run, `${when}: the run was written`);
    }
  });

  test("the run the programme names when the transaction reads the form is the one written", async () => {
    beforeTheTransaction(() => world.db.poke(FORM, { [`programmes.${INCUBATOR}.runId`]: RUN.agi }));
    const incubatorRun = JSON.stringify(world.db.read(RUN_PATH).pitchSettings);
    const answer = await save("tess", { teamsFrom: null, pickLimit: 2, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.equal(JSON.stringify(world.db.read(RUN_PATH).pitchSettings), incubatorRun, "the run no longer named was written");
    assert.equal(world.db.read(`courseRuns/${RUN.agi}`).pitchSettings.pickLimit, 2);
  });

  test("a team made while the transaction runs stops a change of how teams are made", async () => {
    world.db.beforeCommit = () => world.db.seed("courseTeams/made-meanwhile", { runId: INC.run, courseId: INC.course, groupId: INC.thursday, name: "Made meanwhile", project: "", source: { kind: "hand" }, memberUids: [], toldAs: [] });
    const answer = await save("tess", body({ teamsFrom: "agenda" }));
    assert.deepEqual(short(answer), [409, SETTINGS.TEAMS_MADE_ALREADY]);
    assert.equal(runNow().teamsFrom, "pitches");
  });
});

describe("5. what each kind of programme is shown on Pitches", () => {
  test("teams from the pitches, with a pitching week: the card with the week and its first session, then the pitches", async () => {
    for (const who of ["zach", "tess"]) {
      const { html, text } = await draw(who);
      assert.match(
        text,
        /Pitching week Week 3 · Thu 12 Nov Teams are made from Not set yet The pitches from pitching week The agenda people ranked on the application form Pitches each person may pick Smallest team Largest team Teams are made on Teams show on the Teams tab once they’re made\. Save pitching week Pitches from week 3 \(4\)/,
        who,
      );
      assert.match(html, /<option value="pitches" selected="">The pitches from pitching week<\/option>/, who);
      assert.match(html, /id="pitching-pick-limit"[^>]*value="3"/, who);
      assert.match(html, /id="pitching-teams-made-on"[^>]*value="2026-11-19"/, who);
      // Drawn disabled until the page's script arrives.
      assert.match(html, /<button type="submit"[^>]*disabled=""[^>]*>Save pitching week<\/button>/, who);
    }
  });

  test("teams from the pitches, with no pitching week: the card, the board's sentence, and the way to the Weeks tab", async () => {
    world.db.poke(`${RUN_PATH}/weeks/w03`, { pitching: false });
    const { html, text } = await draw("tess");
    assert.match(text, /^.*Pitching week Teams are made from/);
    assert.ok(!text.includes("Week 3 ·"), "no week to name");
    assert.match(
      text,
      /No week of Research incubator’s course run is pitching week\. Tick “This is pitching week” in that week’s settings on the Weeks tab, and its pitches show here\. Open the Weeks tab/,
    );
    assert.match(html, new RegExp(`<a href="/admin/admissions/forms/${ROUND}/programmes/${INCUBATOR}/weeks"[^>]*>Open the Weeks tab</a>`));
  });

  test("teams from the agenda, with no pitching week: the card says none is needed, and nothing asks for one", async () => {
    reset(teamsSeed({ madeFrom: "agenda" }));
    admitted();
    world.db.poke(`${RUN_PATH}/weeks/w03`, { pitching: false });
    const { text } = await draw("tess");
    assert.match(text, /Pitching week Teams are made from the agenda people ranked, so no pitching week is needed\. Teams are made from/);
    assert.ok(!text.includes("No week of"), text);
    assert.ok(!text.includes("Open the Weeks tab"), text);
  });

  test("a programme with no teams: no Pitches until it has a pitching week, and then the picks alone", async () => {
    const before = await draw("claudia", PitchesPage, AGI);
    assert.match(before.text, /No week of AGI Strategy’s course run is pitching week\./);
    assert.ok(!before.text.includes("Save pitching week"), "no card on a programme with no teams and no pitching week");
    world.db.seed(`courseRuns/${RUN.agi}/weeks/w02`, { weekNumber: 2, title: "Pitching", pitching: true, published: true });
    const { text } = await draw("claudia", PitchesPage, AGI);
    assert.match(text, /Pitching week Week 2/);
    assert.match(text, /Pitches each person may pick This programme has no teams, so only how many pitches each person may pick is set here\. Save pitching week/);
    for (const absent of ["Teams are made from", "Smallest team", "Largest team", "Teams are made on", "Teams show on the Teams tab"]) {
      assert.ok(!text.includes(absent), absent);
    }
  });

  test("the reviewer is shown the list is the lead's, with no card", async () => {
    const { text } = await draw("yusuf");
    assert.match(text, /Only the lead and admins can open the pitches/);
    assert.ok(!text.includes("Save pitching week"));
  });
});

describe("5b. a programme with no teams, and one whose teams come from the agenda", () => {
  test("a programme with no teams sets only the picks: changing anything else there is refused, and nothing is written", async () => {
    const fellowship = { teamsFrom: null, pickLimit: 2, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null };
    for (const over of [{ teamsFrom: "agenda" }, { teamSizeMin: 2, teamSizeMax: 4 }, { teamsMadeOn: "2026-11-26" }]) {
      const before = everything();
      assert.deepEqual(short(await save("claudia", { ...fellowship, ...over }, { programmeId: AGI })), [400, SETTINGS.PICKS_ONLY_HERE], JSON.stringify(over));
      assert.equal(everything(), before);
    }
    assert.equal((await save("claudia", fellowship, { programmeId: AGI })).status, 200);
  });

  test("teams from the agenda with no pitching week: no box for picks, where nobody pitches", async () => {
    reset(teamsSeed({ madeFrom: "agenda" }));
    admitted();
    world.db.poke(`${RUN_PATH}/weeks/w03`, { pitching: false });
    const { html, text } = await draw("tess");
    assert.ok(!text.includes("Pitches each person may pick"), text);
    assert.ok(!html.includes('id="pitching-pick-limit"'));
    for (const shown of ["Teams are made from", "Smallest team", "Largest team", "Teams are made on"]) assert.ok(text.includes(shown), shown);
    // With a pitching week, people pitch and pick, so the box is drawn.
    world.db.poke(`${RUN_PATH}/weeks/w03`, { pitching: true });
    assert.ok((await draw("tess")).html.includes('id="pitching-pick-limit"'));
  });
});

describe("6. Pitches is offered on Groups for every incubator", () => {
  test("an incubator with no pitching week still offers Pitches; a fellowship with none does not", async () => {
    world.db.poke(`${RUN_PATH}/weeks/w03`, { pitching: false });
    const views = (html) => [.../<nav[^>]*aria-label="Groups views"[^>]*>(.*?)<\/nav>/.exec(html)[1].matchAll(/<a [^>]*>([^<]+)<\/a>/g)].map((m) => m[1]);
    assert.ok(views((await draw("tess", FacilitatorsPage)).html).includes("Pitches"));
    assert.ok(!views((await draw("claudia", FacilitatorsPage, AGI)).html).includes("Pitches"));
  });
});

describe("7. the card's one press", () => {
  test("it sends every setting to the one route, and nothing else", async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const code = readFileSync(fileURLToPath(new URL("../src/features/applications/pitches/PitchingWeekCard.tsx", import.meta.url)), "utf8");
    assert.equal([...code.matchAll(/\bfetch\(/g)].length, 1, "one press");
    assert.match(code, /\/pitching-week`/);
    assert.match(code, /method: "PUT"/);
    assert.match(code, /body: JSON\.stringify\(bodyOf\(read\.input\)\)/);
    assert.doesNotMatch(code, /updateRun|firebase\/firestore/, "never client-direct");
  });
});
