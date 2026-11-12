/**
 * The lead of the programme that names a course run reads every register of
 * that run, and takes one in a facilitator's place, marks only.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   GET   /api/courses/groups/[groupId]/attendance            (reads)
 *   POST  /api/courses/groups/[groupId]/attendance            (marks)
 *   PATCH /api/courses/groups/[groupId]/attendance            (an admin's correction)
 *   POST  /api/courses/groups/[groupId]/attendance/push       (finishing a register)
 *   POST  /api/courses/groups/[groupId]/participant-notes     (a note on a person)
 *
 * ## What this guards
 *
 *  1. EVERY REGISTER OF THE RUN, READ ONLY. The lead reads each group's
 *     register, an archived group's too, with the people Publish has told,
 *     as the group's facilitators do; corrections stay an admin's. The
 *     register's notes, on a person or on a session, are the group's
 *     facilitators' and admins': the lead reads the marks and no note.
 *  2. THE LEAD TAKES A REGISTER, MARKS ONLY (CHANGED ON PURPOSE, November
 *     2026: until then the lead was refused every write). The lead marks a
 *     register and finishes it, which records that they took it in the
 *     facilitators' place; a note on the session or on a person, and an
 *     admin's correction after Finish, stay the group's facilitators' and
 *     admins', and are refused with nothing written.
 *  3. NOBODY ELSE READS MORE. The lead of another programme, the programme's
 *     reviewer, a facilitator of another group, a member and somebody signed
 *     out are refused as before, and the lead of another programme reads
 *     their own run's registers and no others. The run's track lead reads
 *     the marks as the lead does (CHANGED ON PURPOSE with item 2: whoever
 *     may take a register reads it).
 *  4. WORKED OUT WHEN USED. A lead who no longer meets the bar, who is
 *     replaced or whose programme stops naming the run reads nothing.
 *
 * Real: the register's handlers and every library under them. Stubbed: the
 * session, the Admin SDK handle, the view-as guard and the mail door.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { FIELD_VALUE_STUB } from "./lib/applicationsStore.mjs";
import { groupDoc, loadJoin, makeWorld } from "./lib/handoverWorld.mjs";
import { A, AGI, B, C, PERSONAS, RUN, formPath, leadSeed, slot } from "./lib/leadWorld.mjs";

const FIRESTORE = FIELD_VALUE_STUB.replace(
  "export class Timestamp {}",
  "export class Timestamp {" +
    " static now() { return new Date(); }" +
    " static fromDate(date) { return date; }" +
    " static fromMillis(ms) { return new Date(ms); }" +
    " }" +
    " export class FieldPath { static documentId() { return '__name__'; } }",
);
const made = makeWorld("__leadRegisters", [["firebase-admin/firestore", FIRESTORE]]);
const { world, reset, call, everything, courseRoute } = made;
const join_ = await loadJoin(made);
const register = await courseRoute("groups", "[groupId]", "attendance");
const push = await courseRoute("groups", "[groupId]", "attendance", "push");
const participantNotes = await courseRoute("groups", "[groupId]", "participant-notes");

// People are placed and told on Tue 27 Oct, before the run starts, and the
// registers are read on Thu 5 Nov, after Group B's first session (Tue 3 Nov).
const PLACED_ON = new Date("2026-10-27T17:38:00Z");
const READ_ON = new Date("2026-11-05T20:00:00Z");
mock.timers.enable({ apis: ["Date"], now: PLACED_ON });

const TAIS_GROUP = "tais-autumn-2026-wednesday__grp00011";

/** The term with everybody placed and told: Amara and Dev in B, Bea in A, Tariq in C. */
async function told(seed = leadSeed()) {
  mock.timers.setTime(PLACED_ON.getTime());
  seed[`courseGroups/${TAIS_GROUP}`] = groupDoc({
    runId: RUN.tais,
    courseId: "technical-ai-safety__c0urse02",
    name: "Wednesday group",
    facilitatorUids: ["tom"],
    session: slot({ weekday: 3 }),
  });
  reset(seed, { now: () => new Date() });
  assert.equal((await join_.press()).status, 200);
  const placed = await join_.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "dev", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "tariq", groupId: C },
  ]);
  assert.equal(placed.body.placed, 4);
  assert.equal((await join_.publish("zach")).status, 200);
  world.mail.length = 0;
  mock.timers.setTime(READ_ON.getTime());
}

const read = (who, groupId) => call(who, register.GET, { groupId }, { course: true });
const mark = (who, groupId, uid) =>
  call(who, register.POST, { groupId }, { body: { weekNumber: 1, marks: [{ uid, status: "present" }] }, course: true });

beforeEach(async () => {
  await told();
});

// ---------------------------------------------------------------------------
// 1. Every register, read only
// ---------------------------------------------------------------------------

describe("1. the lead reads every register of their run", () => {
  test("each group's, with the people Publish told, as its facilitators read it", async () => {
    for (const [groupId, facilitator, people] of [
      [B, "rahul", ["amara", "dev"]],
      [A, "sofia", ["bea"]],
      [C, "tom", ["tariq"]],
    ]) {
      const asLead = await read("claudia", groupId);
      assert.equal(asLead.status, 200, `${groupId}: ${JSON.stringify(asLead.body)}`);
      assert.deepEqual(asLead.body.members.map((member) => member.uid).sort(), people, groupId);
      const asFacilitator = await read(facilitator, groupId);
      // The same rows, each named by the names rule for its reader: the lead,
      // on the committee, sees the account's full name; a facilitator who is
      // not on it, the name the person goes by.
      const rowsOf = (body) => body.members.map(({ uid, joinedWeekNumber }) => ({ uid, joinedWeekNumber }));
      assert.deepEqual(rowsOf(asLead.body), rowsOf(asFacilitator.body), groupId);
      const account = (uid) => world.db.read(`users/${uid}`);
      for (const member of asLead.body.members) assert.equal(member.displayName, account(member.uid).displayName, `${groupId}: the lead's name for ${member.uid}`);
      for (const member of asFacilitator.body.members) {
        assert.equal(member.displayName, account(member.uid).profile.preferredName, `${groupId}: the facilitator's name for ${member.uid}`);
      }
      assert.deepEqual(asLead.body.sessions.map((session) => session.sessionKey), asFacilitator.body.sessions.map((session) => session.sessionKey));
      assert.equal(asLead.body.canEditPushed, false, "a lead corrects nothing");
    }
  });

  // Changed when the facilitators' notes became theirs and admins': the lead used to be sent
  // the facilitators' notes on a person with the marks. The register's notes
  // are now the group's facilitators' and admins', so the lead reads the
  // mark and no note, a session's own note included, while the facilitators
  // and an admin read both, as strictly as before.
  // The names rule (privacy v15: "Only the committee sees your full name;
  // everyone else sees the name you go by"), on the register's own rows.
  test("each reader is shown the register's people by the names rule: the committee and admins in full, a facilitator by the name each goes by", async () => {
    world.db.poke("users/amara", { "profile.preferredName": "Mara", "profile.fullName": "Amara Okafor-Bello" });
    const rowsAs = async (who) => (await read(who, B)).body.members.map((member) => [member.uid, member.displayName]);
    for (const who of ["zach", "claudia"]) {
      assert.deepEqual(await rowsAs(who), [["amara", "Amara Okafor-Bello (Mara)"], ["dev", "Dev Patel"]], who);
    }
    assert.deepEqual(await rowsAs("rahul"), [["dev", "Dev"], ["amara", "Mara"]], "a facilitator who is not on the committee");
    assert.doesNotMatch(JSON.stringify((await read("rahul", B)).body), /Okafor/, "a facilitator is sent a full name");
  });

  test("the marks a facilitator saved, and none of the register's notes", async () => {
    const marked = await call("rahul", register.POST, { groupId: B }, {
      body: { weekNumber: 1, marks: [{ uid: "amara", status: "present" }], notes: "Ran late because of the fire alarm." },
      course: true,
    });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const noted = await call("rahul", participantNotes.POST, { groupId: B }, { body: { weekNumber: 1, uid: "dev", note: "Quiet this week." }, course: true });
    assert.equal(noted.status, 200, JSON.stringify(noted.body));
    const asLead = (await read("claudia", B)).body;
    const key = asLead.sessions[0].sessionKey;
    assert.equal(asLead.records[key].amara, "present");
    assert.deepEqual(asLead.participantNotes, {}, "the lead is sent a facilitator's note on a person");
    assert.equal(asLead.sessions[0].notes, "", "the lead is sent the session's own note");
    assert.doesNotMatch(JSON.stringify(asLead), /Quiet this week|fire alarm/);
    for (const who of ["rahul", "sofia", "zach"]) {
      const answer = (await read(who, B)).body;
      assert.equal(answer.records[key].amara, "present", who);
      assert.equal(answer.participantNotes[key].dev, "Quiet this week.", who);
      assert.equal(answer.sessions[0].notes, "Ran late because of the fire alarm.", who);
    }
  });

  test("an archived group's register too, which its facilitators no longer read", async () => {
    world.db.poke(`courseGroups/${C}`, { archived: true });
    assert.equal((await read("claudia", C)).status, 200);
    assert.equal((await read("tom", C)).status, 403);
  });

  // CHANGED ON PURPOSE (November 2026). Until then a move after Publish made
  // somebody untold, so this test moved Dev to make one. A move now keeps
  // somebody told, so Dev is on Group A's register at once; somebody placed
  // and not told (taken off the run and put back) still is not.
  test("somebody told their group and moved after Publish is on the lead's register at once, as on the facilitators'", async () => {
    await join_.place("claudia", [{ uid: "dev", groupId: A }]);
    for (const who of ["claudia", "sofia"]) {
      const body = (await read(who, A)).body;
      assert.deepEqual(body.members.map((member) => member.uid).sort(), ["bea", "dev"], who);
      assert.equal(body.notYetTold, false, who);
    }
  });

  test("somebody placed and not yet told is not on the lead's register, as on the facilitators'", async () => {
    const removed = await call("claudia", join_.routes.remove.POST, { runId: RUN.agi, uid: "dev" }, { course: true });
    assert.equal(removed.status, 200, JSON.stringify(removed.body));
    await join_.place("claudia", [{ uid: "dev", groupId: A }]);
    for (const who of ["claudia", "sofia"]) {
      const body = (await read(who, A)).body;
      assert.deepEqual(body.members.map((member) => member.uid), ["bea"], who);
      assert.equal(body.notYetTold, true, who);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Marking stays the facilitators' and admins'
// ---------------------------------------------------------------------------

describe("2. the lead takes a register, marks only", () => {
  // CHANGED ON PURPOSE (November 2026). This test asserted that every write
  // by the lead was refused. The lead now takes a register in the
  // facilitators' place: the notes, the note drawer and an admin's
  // correction are still refused, each with nothing written or sent, and
  // the marks the lead saves record that the lead took the register.
  test("a note on the session, a note on a person and a correction are refused, and nothing is written or sent", async () => {
    const before = everything();
    const answers = [
      await call("claudia", register.POST, { groupId: B }, {
        body: { weekNumber: 1, marks: [{ uid: "amara", status: "present" }], notes: "A note." },
        course: true,
      }),
      await call("claudia", register.PATCH, { groupId: B }, { body: { weekNumber: 1, marks: [{ uid: "amara", status: "absent" }] }, course: true }),
      await call("claudia", participantNotes.POST, { groupId: B }, { body: { weekNumber: 1, uid: "amara", note: "x" }, course: true }),
    ];
    assert.deepEqual(answers.map((answer) => answer.status), [403, 403, 403]);
    assert.equal(everything(), before);
    assert.deepEqual(world.mail, []);
  });

  test("the lead's marks are saved in the facilitators' place, and the lead finishes the register", async () => {
    const marked = await mark("claudia", B, "amara");
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const stored = world.db.read(`courseAttendance/${RUN.agi}__${B}__w01`);
    assert.equal(stored.records.amara, "present");
    assert.equal(stored.setBy.amara.byUid, "claudia");
    assert.equal(stored.setBy.amara.how, "cover");
    assert.equal(stored.cover.kind, "self");
    assert.equal(stored.cover.byUid, "claudia");
    assert.deepEqual(stored.cover.covering, ["rahul", "sofia"]);
    const pushed = await call("claudia", push.POST, { groupId: B }, { body: { weekNumber: 1 }, course: true });
    assert.equal(pushed.status, 200, JSON.stringify(pushed.body));
    assert.ok(world.db.read(`courseAttendance/${RUN.agi}__${B}__w01`).pushedAt, "the lead finished it");
  });

  test("the group's facilitator and an admin still mark", async () => {
    assert.equal((await mark("rahul", B, "amara")).status, 200);
    assert.equal((await mark("zach", B, "dev")).status, 200);
  });
});

// ---------------------------------------------------------------------------
// 3. Nobody else reads more
// ---------------------------------------------------------------------------

describe("3. who reads a register, as every kind of caller", () => {
  test("Group B's register", async () => {
    const got = {};
    for (const [uid] of PERSONAS) got[uid ?? "signed out"] = (await read(uid, B)).status;
    assert.deepEqual(got, {
      zach: 200,
      claudia: 200,
      tess: 403,
      lloyd: 403,
      // CHANGED ON PURPOSE (November 2026): the run's track lead takes a
      // register in a facilitator's place, so reads it, as the lead does.
      yusuf: 200,
      rahul: 200,
      amara: 403,
      nobody: 403,
      "signed out": 401,
    });
  });

  test("a facilitator of another group of the run reads only their own", async () => {
    assert.equal((await read("tom", B)).status, 403);
    assert.equal((await read("tom", C)).status, 200);
  });

  test("the lead of another programme reads their own run's registers, and AGI Strategy's lead reads none of them", async () => {
    assert.equal((await read("tess", TAIS_GROUP)).status, 200);
    assert.equal((await read("claudia", TAIS_GROUP)).status, 403);
  });

  test("a group that does not exist is the same refusal as one that is not yours", async () => {
    assert.equal((await read("claudia", "no-such-group__grp99999")).status, 403);
    assert.equal((await read("zach", "no-such-group__grp99999")).status, 404);
  });
});

// ---------------------------------------------------------------------------
// 4. Worked out when used
// ---------------------------------------------------------------------------

describe("4. a lead who stops leading the run reads nothing", () => {
  for (const [why, change] of [
    ["moved to member", () => world.db.poke("users/claudia", { role: "member" })],
    ["no longer SU-recognised", () => world.db.poke("users/claudia", { suRecognised: false })],
    ["replaced by another", () => world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "nadia" })],
    ["whose programme stops naming the run", () => world.db.poke(formPath, { [`programmes.${AGI}.runId`]: RUN.agiSpring })],
  ]) {
    test(`a lead ${why}`, async () => {
      change();
      for (const groupId of [B, A, C]) assert.equal((await read("claudia", groupId)).status, 403, groupId);
    });
  }

  test("the new lead reads every register at once", async () => {
    world.db.poke(formPath, { [`programmes.${AGI}.leadUid`]: "nadia" });
    for (const groupId of [B, A, C]) assert.equal((await read("nadia", groupId)).status, 200, groupId);
  });
});

// ---------------------------------------------------------------------------
// 5. The register's notes, as every kind of caller
// ---------------------------------------------------------------------------

describe("5. the register's notes are the group's facilitators' and admins'", () => {
  /** Rahul marks week 1 with a note on the session and one on Dev, as the register's own routes take them. */
  async function noted() {
    const marked = await call("rahul", register.POST, { groupId: B }, {
      body: { weekNumber: 1, marks: [{ uid: "amara", status: "late" }], notes: "Started ten minutes late." },
      course: true,
    });
    assert.equal(marked.status, 200, JSON.stringify(marked.body));
    const note = await call("rahul", participantNotes.POST, { groupId: B }, { body: { weekNumber: 1, uid: "dev", note: "Asked about week 2." }, course: true });
    assert.equal(note.status, 200, JSON.stringify(note.body));
  }

  test("each caller of Group B's register: who reads the marks, who reads the notes, who is refused", async () => {
    await noted();
    const said = {};
    for (const who of ["rahul", "sofia", "zach", "claudia", "tess", "lloyd", "yusuf", "tom", "amara", "bea", "nobody", null]) {
      const answer = await read(who, B);
      if (answer.status !== 200) {
        said[who ?? "signed out"] = answer.status;
        continue;
      }
      const key = answer.body.sessions[0].sessionKey;
      said[who] = {
        mark: answer.body.records[key]?.amara ?? null,
        onDev: answer.body.participantNotes[key]?.dev ?? null,
        onSession: answer.body.sessions[0].notes,
      };
    }
    const both = { mark: "late", onDev: "Asked about week 2.", onSession: "Started ten minutes late." };
    assert.deepEqual(said, {
      // The group's facilitator, its co-facilitator and an admin: the marks and every note.
      rahul: both,
      sofia: both,
      zach: both,
      // The programme's lead: the marks, and no note of either kind.
      claudia: { mark: "late", onDev: null, onSession: "" },
      tess: 403,
      lloyd: 403,
      // The run's track lead (CHANGED ON PURPOSE, November 2026: refused
      // until then): the marks, and no note of either kind, as the lead.
      yusuf: { mark: "late", onDev: null, onSession: "" },
      // Another group's facilitator, a member of the group, a member of another group.
      tom: 403,
      amara: 403,
      bea: 403,
      nobody: 403,
      "signed out": 401,
    });
  });

  test("an archived group's register: the lead still reads its marks and still no note, an admin reads both", async () => {
    await noted();
    world.db.poke(`courseGroups/${B}`, { archived: true });
    const asLead = (await read("claudia", B)).body;
    const asAdmin = (await read("zach", B)).body;
    const key = asLead.sessions[0].sessionKey;
    assert.equal(asLead.records[key].amara, "late");
    assert.deepEqual(asLead.participantNotes, {});
    assert.equal(asLead.sessions[0].notes, "");
    assert.equal(asAdmin.participantNotes[key].dev, "Asked about week 2.");
    assert.equal(asAdmin.sessions[0].notes, "Started ten minutes late.");
    assert.equal((await read("rahul", B)).status, 403, "an archived group's facilitator reads it");
  });

  test("a lead who also facilitates the group reads its notes as its facilitator", async () => {
    await noted();
    world.db.poke(`courseGroups/${B}`, { facilitatorUids: ["rahul", "sofia", "claudia"] });
    const answer = (await read("claudia", B)).body;
    const key = answer.sessions[0].sessionKey;
    assert.equal(answer.participantNotes[key].dev, "Asked about week 2.");
    assert.equal(answer.sessions[0].notes, "Started ten minutes late.");
  });
});
