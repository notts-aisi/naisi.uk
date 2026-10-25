/**
 * Pitching week's settings: which week it is, and the run's numbers, read,
 * written and turned into words.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  - The week is a tick on the run's week document (`pitching`), saved by the
 *    week editor with the week's details; only a stored `true` is on.
 *  - The run's settings (`pitchSettings`) have no defaults: unset is null,
 *    and anything out of range or malformed reads as unset. The run editor's
 *    write refuses what the reader would not keep.
 *  - Every sentence built from them leaves out what is not set, and names the
 *    lead only while the lead stands.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { AT, INC, INCUBATOR, ROUND, makePitchingWorld } from "./lib/pitchingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: AT.wednesdayNoon });

const made = await makePitchingWorld("__pitchingSettings");
const { world, reset, ask, loadTs, loadClient } = made;
const courses = await loadTs(join("lib", "firestore", "courses.ts"));
const words = await loadTs(join("lib", "courses", "pitching", "words.ts"));
const runProgramme = await loadTs(join("lib", "applications", "handover", "runProgramme.ts"));
const mutations = await loadClient(join("features", "courses", "courseMutations.ts"));

beforeEach(() => {
  mock.timers.setTime(AT.wednesdayNoon.getTime());
  reset();
});

describe("which week", () => {
  test("only a stored true is pitching week", () => {
    for (const [value, on] of [[true, true], [false, false], ["true", false], [1, false], [undefined, false]]) {
      assert.equal(courses.normalizeCourseWeek("w03", { pitching: value }).pitching, on, String(value));
    }
  });

  test("the week editor saves the tick with the week's details", async () => {
    await mutations.saveWeek(INC.run, "w03", { pitching: true });
    await mutations.saveWeek(INC.run, "w04", { pitching: false });
    assert.deepEqual(
      world.clientWrites.map(([kind, path, data]) => [kind, path, data.pitching]),
      [
        ["update", `courseRuns/${INC.run}/weeks/w03`, true],
        ["update", `courseRuns/${INC.run}/weeks/w04`, false],
      ],
    );
  });
});

describe("the run's settings", () => {
  test("read: whole numbers in range, a team size as a pair, a real date; anything else is unset", () => {
    assert.deepEqual(courses.normalizePitchSettings(undefined), { pickLimit: null, teamSize: null, teamsMadeOn: null });
    assert.deepEqual(
      courses.normalizePitchSettings({ pickLimit: 3, teamSizeMin: 2, teamSizeMax: 4, teamsMadeOn: "2026-11-19" }),
      { pickLimit: 3, teamSize: { min: 2, max: 4 }, teamsMadeOn: "2026-11-19" },
    );
    for (const raw of [
      { pickLimit: 0 },
      { pickLimit: 11 },
      { pickLimit: 2.5 },
      { pickLimit: "3" },
      { teamSizeMin: 4, teamSizeMax: 2 },
      { teamSizeMin: 2 },
      { teamSizeMin: 2, teamSizeMax: 13 },
      { teamsMadeOn: "2026-02-31" },
      { teamsMadeOn: "Thu 19 Nov" },
      "nonsense",
      [3],
    ]) {
      assert.deepEqual(
        courses.normalizePitchSettings(raw),
        { pickLimit: null, teamSize: null, teamsMadeOn: null },
        JSON.stringify(raw),
      );
    }
    assert.equal(courses.normalizeCourseRun("r", {}).pitchSettings.pickLimit, null);
  });

  test("the run editor writes the four fields, and refuses what would not be read back", async () => {
    await mutations.updateRun(INC.run, {
      pitchSettings: { pickLimit: 3, teamSize: { min: 2, max: 4 }, teamsMadeOn: "2026-11-19" },
    });
    await mutations.updateRun(INC.run, { pitchSettings: { pickLimit: null, teamSize: null, teamsMadeOn: null } });
    assert.deepEqual(
      world.clientWrites.map(([, path, data]) => [path, data.pitchSettings]),
      [
        [`courseRuns/${INC.run}`, { pickLimit: 3, teamSizeMin: 2, teamSizeMax: 4, teamsMadeOn: "2026-11-19" }],
        [`courseRuns/${INC.run}`, { pickLimit: null, teamSizeMin: null, teamSizeMax: null, teamsMadeOn: null }],
      ],
    );
    for (const [settings, error] of [
      [{ pickLimit: 11, teamSize: null, teamsMadeOn: null }, "How many pitches a person may pick is a whole number from 1 to 10."],
      [{ pickLimit: null, teamSize: { min: 5, max: 3 }, teamsMadeOn: null }, "A team’s size is two whole numbers from 1 to 12, the smaller first."],
      [{ pickLimit: null, teamSize: null, teamsMadeOn: "2026-13-01" }, "Give the day the teams are made as a real date."],
    ]) {
      await assert.rejects(() => mutations.updateRun(INC.run, { pitchSettings: settings }), { message: error });
    }
    assert.equal(world.clientWrites.length, 2, "a refused setting was written");
  });
});

describe("the words", () => {
  const settings = { pickLimit: 3, teamSize: { min: 2, max: 4 }, teamsMadeOn: "2026-11-19" };

  test("the teams sentence leaves out what is not set, and says who only when a lead stands", () => {
    assert.equal(words.teamsWords(settings, "Zach"), "Zach makes the teams on Thu 19 Nov. Teams are 2 to 4 people.");
    assert.equal(words.teamsWords(settings, null), "The teams are made on Thu 19 Nov. Teams are 2 to 4 people.");
    assert.equal(words.teamsWords({ ...settings, teamsMadeOn: null }, "Zach"), "Teams are 2 to 4 people.");
    assert.equal(words.teamsWords({ ...settings, teamSize: { min: 3, max: 3 } }, "Zach"), "Zach makes the teams on Thu 19 Nov. Teams are 3 people.");
    assert.equal(words.teamsWords({ pickLimit: 3, teamSize: null, teamsMadeOn: null }, "Zach"), null);
  });

  test("a session today before five is today's, and its time is the London wall clock", () => {
    const start = { at: new Date("2026-11-12T13:00:00Z"), dateKey: "2026-11-12", startTimeLocal: "13:00" };
    assert.equal(words.sessionWords(start, new Date("2026-11-12T09:00:00Z")), "today’s session at 1pm");
    assert.equal(words.sessionWords(start, new Date("2026-11-11T22:30:00Z")), "the session on Thu 12 Nov at 1pm");
    const evening = { at: new Date("2026-10-22T17:30:00Z"), dateKey: "2026-10-22", startTimeLocal: "18:30" };
    assert.equal(words.sessionWords(evening, new Date("2026-10-22T08:00:00Z")), "tonight’s session at 6:30pm");
    // 23:30 UTC on the 21st is already the 22nd in London.
    assert.equal(words.sessionWords(evening, new Date("2026-10-21T23:30:00Z")), "tonight’s session at 6:30pm");
  });

  test("the eyebrow names the programme's kind and short name, or the course when no programme names the run", () => {
    assert.equal(words.eyebrowWords({ kind: "incubator", shortName: "Alignment Research" }, "Alignment Research Incubator", 3), "Incubator: Alignment Research · Week 3");
    assert.equal(words.eyebrowWords(null, "Research Incubator", 3), "Research Incubator · Week 3");
  });

  test("the lead is the lead of the programme that names the run, held to the lead's bar", async () => {
    assert.deepEqual(await runProgramme.runProgrammeOf(world.courseDb, INC.run), {
      kind: "incubator",
      shortName: "Research incubator",
      leadFirstName: "Tess",
    });
    world.db.poke("users/tess", { role: "member", suRecognised: false });
    assert.equal((await runProgramme.runProgrammeOf(world.courseDb, INC.run)).leadFirstName, null);
    assert.equal(
      (await ask.view("amara")).body.view.teams,
      "The teams are made on Thu 19 Nov. Teams are 2 to 4 people.",
    );
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${INCUBATOR}.runId`]: null });
    assert.equal(await runProgramme.runProgrammeOf(world.courseDb, INC.run), null);
    assert.equal((await ask.view("amara")).body.view.eyebrow, "Research Incubator · Week 3");
  });
});
