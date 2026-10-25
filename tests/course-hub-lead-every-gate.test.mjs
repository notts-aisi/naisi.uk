/**
 * The lead of the programme that names a course run passes every gate a
 * run's track lead passes, and is found in one place.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## The class this guards
 *
 * A programme's lead does a run's track lead's work on the run their
 * programme names (Q1). Their power is worked out from the form when they
 * ask, by one module (`src/lib/courses/programmeLead.ts`), and handed to the
 * routes by one gate (`runStaffingOf` and `doesTrackLeadWork` in
 * `src/lib/courses/runStaffing.ts`). Three ways that can quietly stop being
 * true, each walked for over the whole of `src`:
 *
 *  1. A ROUTE THAT ASKS THE TRACK-LEAD BAR ITSELF. A new gate that tests
 *     `courseRuns.trackLeadUids` with `isNamedWithStanding` admits a track
 *     lead and refuses the programme's lead. Every file that names that bar
 *     is the gate's own module, the registry of bars, or listed below with
 *     the reason it is no gate on a run. And a route that has the gate's
 *     answer never reads the track lead out of it alone.
 *  2. A SECOND PLACE THAT FINDS WHO LEADS THE PROGRAMME NAMING A RUN. Every
 *     file that asks the lead's bar (`admissionRounds.leadUid`) is the one
 *     module, or is listed with what it asks instead (a lead on their own
 *     form). Every caller of `programmeNaming`, which finds the programme
 *     naming a run for the hand-over's own writer and picker, reads no lead.
 *  3. A REGISTER WRITE THAT TAKES THE READ GATE. The lead reads every
 *     register of their run through `gateGroupRegisterRead`; the register's
 *     GET is the only handler that may ask it, and every write keeps
 *     `gateGroupRegister`.
 *
 * What the routes then do is executed in `tests/course-hub-lead-routes.test.mjs`
 * and `tests/course-hub-lead-registers.test.mjs`.
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
/** A file's code with its comments gone and its strings kept. */
const codeOf = (file) => stripSource(readFileSync(file, "utf8"), { keepStrings: true });
const FILES = [...walkSource(SRC)].map((file) => [inSrc(file), codeOf(file)]);
const read = (path) => FILES.find(([file]) => file === path)?.[1] ?? null;

// ---------------------------------------------------------------------------
// 1. The track lead's bar
// ---------------------------------------------------------------------------

/** The two files whose job is the bar itself. */
const THE_GATE = ["lib/courses/runStaffing.ts", "lib/firebase/eligibility.ts"];

/** Every other file that names the track lead's bar, and why it is no gate a programme's lead should pass. */
const NOT_A_RUN_GATE = {
  "app/api/courses/me/route.ts":
    "the member area's own list of runs and the doors on them: it asks whether the caller stands as a track lead at all, to draw a door, and grants nothing on a run. A programme's lead reaches their run from the programme's page",
  "app/api/courses/[courseId]/templates/route.ts":
    "a course's saved templates, read by the run editor's picker for a track lead of any run of the course: a course-level read for the run editor, which a programme's lead is not given",
  "app/api/courses/runs/[runId]/overview/route.ts":
    "the member's run overview, which admits a learner, a facilitator or an admin and no track lead: it reports whether the caller is one in its access block, and grants nothing for it",
  "features/courses/runAccess.ts":
    "the learning space's page gate under /learn, the cohort's own doors: a programme's lead reaches their run from the programme's page, and the routes behind both doors admit them",
};

describe("1. every gate a run's track lead passes, the programme's lead passes", () => {
  const naming = FILES.filter(([, code]) => code.includes('"courseRuns.trackLeadUids"')).map(([file]) => file).sort();

  test("the scan is reading: it finds the gate's own module", () => {
    assert.ok(FILES.length > 400, `only ${FILES.length} files were read`);
    assert.ok(naming.includes("lib/courses/runStaffing.ts"), "the scan no longer sees the one gate");
  });

  test("nothing names the track lead's bar but the gate, the registry, and the files listed with their reasons", () => {
    assert.deepEqual(
      naming.filter((file) => !THE_GATE.includes(file) && !Object.hasOwn(NOT_A_RUN_GATE, file)),
      [],
      "These test the track lead's bar themselves, so they admit a run's track lead and refuse the lead of the " +
        "programme that names the run. Ask runStaffingOf and doesTrackLeadWork (src/lib/courses/runStaffing.ts), " +
        "or list the file in NOT_A_RUN_GATE with why it is no gate on a run.",
    );
    for (const [file, why] of Object.entries(NOT_A_RUN_GATE)) {
      assert.ok(naming.includes(file), `${file} is listed and no longer names the bar`);
      assert.ok(why.length > 60, `${file} needs its reason written down`);
    }
  });

  test("the gate is one predicate, and it lets the lead in", () => {
    const gate = read("lib/courses/runStaffing.ts");
    assert.match(gate, /return staffing\.isAdmin \|\| staffing\.isTrackLead \|\| staffing\.leadOf !== null;/);
    assert.match(gate, /leadOf: isAdmin \? null : await programmeLedBy\(db, actor, run\.id\),/);
    assert.match(gate, /isTrackLead: isNamedWithStanding\(actor, "courseRuns\.trackLeadUids", run\.trackLeadUids\),/);
  });

  test("a route with the gate's answer never takes the track lead out of it alone", () => {
    const alone = [];
    for (const [file, code] of FILES) {
      for (const match of code.matchAll(/staffing\.isTrackLead(?!\s*\|\|\s*staffing\.leadOf !== null)/g)) {
        alone.push(`${file}: ${code.slice(match.index, match.index + 60).replace(/\s+/g, " ")}`);
      }
    }
    assert.deepEqual(alone, [], "the track lead is read without the programme's lead beside it");
  });

  test("every file that asks the gate asks it about the caller", () => {
    const askers = FILES.filter(([, code]) => /\brunStaffingOf\(/.test(code)).map(([file]) => file);
    assert.ok(askers.length >= 16, `only ${askers.length} files ask the gate`);
    for (const file of askers.filter((file) => file !== "lib/courses/runStaffing.ts")) {
      const code = read(file);
      for (const call of code.matchAll(/\brunStaffingOf\(\s*db,\s*(\w+),/g)) {
        assert.equal(call[1], "actor", `${file} asks the gate about somebody other than the caller`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. One place finds the lead of the programme that names a run
// ---------------------------------------------------------------------------

/** The files that ask the lead's bar, and what each asks. */
const ASKS_THE_LEAD_BAR = {
  "lib/courses/programmeLead.ts":
    "THE ONE ANSWER to who leads the programme that names a course run, and whether they still stand, for a gate and for a sender",
  "lib/applications/access.ts":
    "roleOnProgramme: a programme's lead on their own form, read from the form the request names; it says nothing about any run",
  "lib/applications/roles.ts":
    "the writer of a programme's lead and reviewers, which asks whether the caller leads the programme they are changing",
  "lib/applications/review/load.ts":
    "the review screens' own list of the programmes the caller leads on the form being read; it says nothing about any run",
  "lib/firebase/eligibility.ts": "the registry of bars, where the lead's bar is defined",
};

/** The callers of `programmeNaming`, and what they find with it. Neither reads a lead. */
const FINDS_THE_NAMING_PROGRAMME = {
  "lib/applications/handover/run.ts": "the writer that names a run refuses a run another programme already names",
  "lib/applications/handover/load.ts": "the panel's picker leaves out the runs another programme already names",
};

describe("2. the lead of the programme that names a run is found in one module", () => {
  test("every file that asks the lead's bar is the one module, or asks it about a form", () => {
    const asking = FILES.filter(([, code]) => code.includes('"admissionRounds.leadUid"')).map(([file]) => file).sort();
    assert.deepEqual(
      asking,
      Object.keys(ASKS_THE_LEAD_BAR).sort(),
      "A file asks whether somebody is a programme's lead and is not listed. If it is asking who leads the " +
        "programme that names a run, call readRunLead or programmeLedBy (src/lib/courses/programmeLead.ts).",
    );
  });

  test("the callers of programmeNaming find a programme and read no lead", () => {
    const callers = FILES.filter(([, code]) => /\bprogrammeNaming\(/.test(code)).map(([file]) => file).sort();
    assert.deepEqual(callers, Object.keys(FINDS_THE_NAMING_PROGRAMME).sort());
    for (const file of callers) {
      assert.ok(!/\.leadUid\b/.test(read(file)), `${file} finds the programme naming a run and reads its lead itself`);
    }
  });

  test("the one module asks the bar through isNamedWithStanding, once", () => {
    const code = read("lib/courses/programmeLead.ts");
    assert.equal([...code.matchAll(/isNamedWithStanding\(/g)].length, 1);
    assert.match(code, /return isNamedWithStanding\(person, "admissionRounds\.leadUid", naming\.leadUid\);/);
    // A sender's lead is read from their own account, never a copy.
    assert.match(code, /leadsNamingProgramme\(standingUserOf\(named\.leadUid, data\), named\)/);
  });

  test("Publish's facilitators' email is signed through the one module", () => {
    const code = read("lib/courses/allocationPublish.ts");
    assert.match(code, /const lead = await readRunLead\(db, runId, naming\);/);
    assert.ok(!/\.leadUid\b/.test(code), "Publish reads a programme's lead itself");
  });
});

// ---------------------------------------------------------------------------
// 3. The register's read gate
// ---------------------------------------------------------------------------

describe("3. the register's read gate is the GET's alone", () => {
  test("only the register's route asks it, once, inside its GET", () => {
    const askers = FILES.filter(([, code]) => /\bgateGroupRegisterRead\(/.test(code)).map(([file]) => file).sort();
    assert.deepEqual(askers, ["app/api/courses/groups/[groupId]/attendance/route.ts", "lib/courses/registerAccess.ts"]);
    const code = read("app/api/courses/groups/[groupId]/attendance/route.ts");
    const calls = [...code.matchAll(/\bgateGroupRegisterRead\(/g)].map((match) => match.index);
    assert.equal(calls.length, 1);
    const get = code.indexOf("export async function GET(");
    const post = code.indexOf("export async function POST(");
    assert.ok(get >= 0 && post > get, "the route's handlers have moved");
    assert.ok(calls[0] > get && calls[0] < post, "the read gate is asked outside the GET");
  });

  test("every write to a register keeps the facilitators' and admins' gate", () => {
    for (const file of [
      "app/api/courses/groups/[groupId]/attendance/route.ts",
      "app/api/courses/groups/[groupId]/attendance/push/route.ts",
      "app/api/courses/groups/[groupId]/participant-notes/route.ts",
    ]) {
      assert.match(read(file), /\bgateGroupRegister\(groupId, actor, db\)/, file);
    }
  });
});
