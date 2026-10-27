/**
 * Who leads the programme that names a course run, and are they still
 * standing: the one answer (`src/lib/courses/programmeLead.ts`), the gate
 * built on it (`src/lib/courses/runStaffing.ts`), the row rule that takes its
 * answer (`rowIsServedTo`), and the facilitators' email it signs.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 * ## What this guards
 *
 *  1. ONE PROGRAMME OR NOBODY. The programme on any form whose `runId` names
 *     the run, and nobody when two do.
 *  2. DERIVED WHEN ASKED. A lead who is replaced, whose programme stops
 *     naming the run, or who no longer meets the bar (demoted, not
 *     SU-recognised, refused, waiting) is nobody on the run at the next
 *     question. Nothing is copied onto the run.
 *  3. NEVER MORE THAN THE ONE RUN. A lead is nobody on another programme's
 *     run; a reviewer, a track lead and a facilitator are no lead.
 *  4. THE ROWS. An admin is served every row the form wrote; the lead the
 *     rows their own programme's hand-over wrote and no other; anybody else
 *     none of them.
 *  5. THE SIGNATURE. Publish's facilitators' email is signed by the lead only
 *     while they still stand.
 *
 * Real: the modules, the standing table, the store's reads, Publish's test
 * route and its composers. Stubbed: the session, the Admin SDK handle and
 * the mail door (`tests/lib/handoverWorld.mjs`).
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { render } from "@react-email/render";
import { loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { AGI, B, C, A, PERSONAS, ROUND, RUN, TAIS, formPath, leadSeed } from "./lib/leadWorld.mjs";

const made = makeWorld("__leadOneAnswer");
const { world, reset, lib, call, sessionOf } = made;
const join_ = await loadJoin(made);
const lead = await lib("courses", "programmeLead.ts");
const staffingLib = await lib("courses", "runStaffing.ts");
const rows = await lib("firestore", "courseApplications.ts");

mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-27T17:38:00Z") });

beforeEach(() => {
  reset(leadSeed(), { now: () => new Date() });
});

/** Every read of a collection the next call makes, by collection. */
function countReads(run) {
  const reads = [];
  const collection = world.db.collection;
  world.db.collection = (path) => {
    reads.push(path);
    return collection(path);
  };
  return run().finally(() => {
    world.db.collection = collection;
  }).then((value) => ({ value, reads }));
}

const setLead = (programmeId, uid) => world.db.poke(formPath, { [`programmes.${programmeId}.leadUid`]: uid });
const setRun = (programmeId, runId) => world.db.poke(formPath, { [`programmes.${programmeId}.runId`]: runId });
const setAccount = (uid, fields) => world.db.poke(`users/${uid}`, fields);

// ---------------------------------------------------------------------------
// 1. Which programme names a run
// ---------------------------------------------------------------------------

describe("1. one programme names a run, or nobody does", () => {
  test("the programme whose runId names the run, with its lead and short name", async () => {
    assert.deepEqual(await lead.readNamingProgramme(world.db, RUN.agi), {
      roundId: ROUND,
      programmeId: AGI,
      leadUid: "claudia",
      shortName: "AGI Strategy",
      kind: "fellowship",
    });
    assert.deepEqual(await lead.readNamingProgramme(world.db, RUN.tais), {
      roundId: ROUND,
      programmeId: TAIS,
      leadUid: "tess",
      shortName: "Technical AI Safety",
      kind: "fellowship",
    });
  });

  test("a run nobody names, and an empty id, have no programme", async () => {
    assert.equal(await lead.readNamingProgramme(world.db, RUN.other), null);
    assert.equal(await lead.readNamingProgramme(world.db, RUN.agiSpring), null);
    assert.equal(await lead.readNamingProgramme(world.db, ""), null);
  });

  test("two programmes naming one run name nobody: the answer is never a guess between them", async () => {
    setRun(TAIS, RUN.agi);
    assert.equal(await lead.readNamingProgramme(world.db, RUN.agi), null);
    for (const uid of ["claudia", "tess"]) {
      assert.equal(await lead.programmeLedBy(world.db, sessionOf(uid), RUN.agi), null, uid);
    }
    assert.equal(await lead.readRunLead(world.db, RUN.agi), null);
  });

  test("a programme on another form names its run as well as one on this form", async () => {
    world.db.seed("admissionRounds/spring-2027__sprngfrm", {
      ...world.db.read(formPath),
      label: "Spring 2027",
      slug: "spring-2027",
      programmes: {
        ...world.db.read(formPath).programmes,
        [AGI]: { ...world.db.read(formPath).programmes[AGI], runId: RUN.agiSpring, leadUid: "nadia" },
        [TAIS]: { ...world.db.read(formPath).programmes[TAIS], runId: null },
      },
    });
    assert.deepEqual(await lead.readNamingProgramme(world.db, RUN.agiSpring), {
      roundId: "spring-2027__sprngfrm",
      programmeId: AGI,
      leadUid: "nadia",
      shortName: "AGI Strategy",
      kind: "fellowship",
    });
    assert.deepEqual(await lead.programmeLedBy(world.db, sessionOf("nadia"), RUN.agiSpring), {
      roundId: "spring-2027__sprngfrm",
      programmeId: AGI,
    });
    // And she is nobody on this term's run.
    assert.equal(await lead.programmeLedBy(world.db, sessionOf("nadia"), RUN.agi), null);
  });

  test("a name every object carries is not a programme", () => {
    const form = { round: { id: ROUND }, programmeIds: ["constructor", "__proto__", AGI], programmes: { [AGI]: { runId: "x", leadUid: "claudia", shortName: "AGI Strategy", kind: "incubator" } } };
    assert.deepEqual(lead.namingProgrammeIn([form], "x"), {
      roundId: ROUND,
      programmeId: AGI,
      leadUid: "claudia",
      shortName: "AGI Strategy",
      kind: "incubator",
    });
    assert.equal(lead.namingProgrammeIn([form], "y"), null);
  });
});

// ---------------------------------------------------------------------------
// 2 and 3. Who leads it, at the moment of asking
// ---------------------------------------------------------------------------

describe("2. the lead, asked at the moment of use", () => {
  test("the lead of the programme that names the run, and nobody else on the cast", async () => {
    const led = {};
    for (const [uid] of PERSONAS) {
      if (!uid) continue;
      const answer = await lead.programmeLedBy(world.db, sessionOf(uid), RUN.agi);
      led[uid] = answer ? `${answer.roundId}/${answer.programmeId}` : null;
    }
    assert.deepEqual(led, {
      zach: null,
      claudia: `${ROUND}/${AGI}`,
      tess: null,
      lloyd: null,
      yusuf: null,
      rahul: null,
      amara: null,
      nobody: null,
    });
  });

  test("the lead of another programme leads that programme's run, and only it", async () => {
    assert.deepEqual(await lead.programmeLedBy(world.db, sessionOf("tess"), RUN.tais), { roundId: ROUND, programmeId: TAIS });
    assert.equal(await lead.programmeLedBy(world.db, sessionOf("claudia"), RUN.tais), null);
    assert.equal(await lead.programmeLedBy(world.db, sessionOf("tess"), RUN.agi), null);
  });

  test("a lead who no longer meets the bar is nobody on the run, whatever the form still says", async () => {
    for (const [why, fields] of [
      ["moved to member", { role: "member" }],
      ["committee no longer SU-recognised", { suRecognised: false }],
      ["refused", { role: "rejected" }],
      ["waiting", { role: "pending" }],
    ]) {
      reset(leadSeed(), { now: () => new Date() });
      setAccount("claudia", fields);
      assert.equal(await lead.programmeLedBy(world.db, sessionOf("claudia"), RUN.agi), null, why);
      assert.equal(await lead.readRunLead(world.db, RUN.agi), null, why);
      assert.equal(world.db.read(formPath).programmes[AGI].leadUid, "claudia", "nothing was tidied away");
    }
  });

  test("a lead replaced by another is nobody at once, and the new lead is the lead", async () => {
    setLead(AGI, "nadia");
    assert.equal(await lead.programmeLedBy(world.db, sessionOf("claudia"), RUN.agi), null);
    assert.deepEqual(await lead.programmeLedBy(world.db, sessionOf("nadia"), RUN.agi), { roundId: ROUND, programmeId: AGI });
    assert.equal((await lead.readRunLead(world.db, RUN.agi)).uid, "nadia");
  });

  test("a programme that stops naming the run takes its lead with it", async () => {
    setRun(AGI, RUN.agiSpring);
    assert.equal(await lead.programmeLedBy(world.db, sessionOf("claudia"), RUN.agi), null);
    assert.equal(await lead.readRunLead(world.db, RUN.agi), null);
    assert.deepEqual(await lead.programmeLedBy(world.db, sessionOf("claudia"), RUN.agiSpring), { roundId: ROUND, programmeId: AGI });
  });

  test("a programme with no lead leads nobody", async () => {
    setLead(AGI, null);
    assert.equal(await lead.readRunLead(world.db, RUN.agi), null);
    for (const uid of ["claudia", "zach"]) {
      assert.equal(await lead.programmeLedBy(world.db, sessionOf(uid), RUN.agi), null, uid);
    }
  });

  test("an account below the bar is answered without the forms being read", async () => {
    for (const uid of ["rahul", "amara", "nobody"]) {
      const { value, reads } = await countReads(() => lead.programmeLedBy(world.db, sessionOf(uid), RUN.agi));
      assert.equal(value, null, uid);
      assert.deepEqual(reads, [], `${uid}'s answer read ${reads.join(", ")}`);
    }
  });

  test("the lead as a sender names them: their own first name, read from their own account, and nothing is kept", async () => {
    const before = made.everything();
    const { value, reads } = await countReads(() => lead.readRunLead(world.db, RUN.agi));
    assert.deepEqual(value, {
      uid: "claudia",
      firstName: "Claudia",
      naming: { roundId: ROUND, programmeId: AGI, leadUid: "claudia", shortName: "AGI Strategy", kind: "fellowship" },
    });
    assert.deepEqual([...new Set(reads)].sort(), ["admissionRounds", "users"]);
    assert.equal(made.everything(), before, "asking wrote something");
    // A lead whose account is gone leads nobody.
    await world.db.collection("users").doc("claudia").delete();
    assert.equal(await lead.readRunLead(world.db, RUN.agi), null);
  });
});

// ---------------------------------------------------------------------------
// The gate built on it
// ---------------------------------------------------------------------------

describe("3. a run's track lead's work: an admin, a track lead, or the naming programme's lead", () => {
  test("every persona, on the run AGI Strategy names", async () => {
    const run = world.db.read(`courseRuns/${RUN.agi}`);
    const answers = {};
    for (const [uid] of PERSONAS) {
      if (!uid) continue;
      const staffing = await staffingLib.runStaffingOf(world.db, sessionOf(uid), { id: RUN.agi, trackLeadUids: run.trackLeadUids });
      answers[uid] = [staffing.isAdmin, staffing.isTrackLead, staffing.leadOf?.programmeId ?? null, staffingLib.doesTrackLeadWork(staffing)];
    }
    assert.deepEqual(answers, {
      zach: [true, false, null, true],
      claudia: [false, false, AGI, true],
      tess: [false, false, null, false],
      lloyd: [false, false, null, false],
      yusuf: [false, true, null, true],
      rahul: [false, false, null, false],
      amara: [false, false, null, false],
      nobody: [false, false, null, false],
    });
  });

  test("nothing is copied onto the run: its track leads are only who an admin named", async () => {
    const run = world.db.read(`courseRuns/${RUN.agi}`);
    await staffingLib.runStaffingOf(world.db, sessionOf("claudia"), { id: RUN.agi, trackLeadUids: run.trackLeadUids });
    await join_.board("claudia");
    assert.deepEqual(world.db.read(`courseRuns/${RUN.agi}`).trackLeadUids, ["yusuf"]);
  });
});

// ---------------------------------------------------------------------------
// 4. The rows
// ---------------------------------------------------------------------------

describe("4. who a row is served to", () => {
  const own = { fromForm: null };
  const agi = { fromForm: { roundId: ROUND, programmeId: AGI } };
  const tais = { fromForm: { roundId: ROUND, programmeId: TAIS } };
  const otherForm = { fromForm: { roundId: "spring-2027__sprngfrm", programmeId: AGI } };

  test("an admin every row, the lead their own programme's, anybody else only the run's own", () => {
    const viewers = {
      admin: { isAdmin: true, leadOf: null },
      "AGI's lead": { isAdmin: false, leadOf: { roundId: ROUND, programmeId: AGI } },
      "TAIS's lead": { isAdmin: false, leadOf: { roundId: ROUND, programmeId: TAIS } },
      "a track lead": { isAdmin: false, leadOf: null },
    };
    const served = Object.fromEntries(
      Object.entries(viewers).map(([who, viewer]) => [
        who,
        [own, agi, tais, otherForm].map((row) => rows.rowIsServedTo(row, viewer)),
      ]),
    );
    assert.deepEqual(served, {
      admin: [true, true, true, true],
      "AGI's lead": [true, true, false, false],
      "TAIS's lead": [true, false, true, false],
      "a track lead": [true, false, false, false],
    });
  });
});

// ---------------------------------------------------------------------------
// 5. The signature on the facilitators' email
// ---------------------------------------------------------------------------

describe("5. Publish's facilitators' email is signed by the lead while they stand", () => {
  async function facilitatingTestText(who) {
    await join_.press();
    const placed = await join_.place("zach", [
      { uid: "amara", groupId: B },
      { uid: "dev", groupId: B },
      { uid: "bea", groupId: A },
      { uid: "tariq", groupId: C },
    ]);
    assert.equal(placed.body.placed, 4, JSON.stringify(placed.body));
    const sent = await call(who, join_.routes.publishTest.POST, { runId: RUN.agi }, { course: true });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const mail = world.mail.find((message) => message.subject.startsWith("[TEST] You’re facilitating"));
    assert.ok(mail, "no facilitators' test went");
    return (await render(mail.react)).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  }

  test("signed by Claudia, AGI Strategy's lead", async () => {
    const text = await facilitatingTestText("zach");
    assert.match(text, /Claudia AGI Strategy lead, NAISI/);
  });

  test("a lead who no longer stands signs nothing, and the rest of the email goes", async () => {
    setAccount("claudia", { suRecognised: false });
    const text = await facilitatingTestText("zach");
    assert.ok(!text.includes("Claudia"), "a lead who no longer stands signed it");
    assert.ok(!text.includes("lead, NAISI"));
    assert.match(text, /Open your group/);
  });

  test("a replaced lead's successor signs it", async () => {
    setLead(AGI, "nadia");
    const text = await facilitatingTestText("zach");
    assert.match(text, /Nadia AGI Strategy lead, NAISI/);
    assert.ok(!text.includes("Claudia"));
  });
});
