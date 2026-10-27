/**
 * Saying who finished: the two routes behind the programme's own gate, as
 * every kind of caller.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/finishing/rule
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/finishing
 *
 * ## What this guards
 *
 *  1. WHO. The programme's lead and admins, decided from the form before the
 *     run is read. A reviewer is refused; the lead of another programme, the
 *     run's track lead, a facilitator and every member are told the
 *     programme is not there; somebody signed out is told to sign in; a
 *     view-as session is turned away first. A refusal writes nothing.
 *  2. THE BODY is checked before anything is read, for everybody alike.
 *  3. THE RULE is stored, cleared, and refused above the most sessions any
 *     group meets, or on a programme with no run on the site.
 *  4. A SWITCH, once the last session is over and not before: stored where it
 *     differs from the suggestion with who pressed it and when, removed when
 *     it goes back, refused for somebody who left and for anybody not on the
 *     caller's own list (a lead's list holds only people Publish has told).
 *     The answer is the section as it now stands, "Changed by you" in it.
 *  5. NOBODY IS EMAILED (the mail door throws here).
 *
 * Real: both handlers, the gate, the libraries. Faked: the session, the
 * Admin SDK handle, the view-as guard, the mail door and the clock.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import {
  AGI,
  BEFORE,
  END,
  ROUND,
  RULE,
  RUN,
  decision,
  decisionPath,
  finishSeed,
  makeFinishWorld,
  rulePath,
  short,
} from "./lib/finishWorld.mjs";
import { A, enrolment } from "./lib/hubAttendanceWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: END });

const made = await makeFinishWorld("__finishRoutes");
const { world, reset, ask, everything, call, routes } = made;
const words = made.lib.words;

beforeEach(() => {
  mock.timers.setTime(END.getTime());
  reset();
});

/** Everybody but the lead and admins, with the answer each meets. */
const REFUSED = [
  ["lloyd", "the programme's reviewer", 403, words.LEADS_AND_ADMINS],
  ["tess", "the lead of another programme", 404, words.NO_PROGRAMME],
  ["yusuf", "the run's track lead", 404, words.NO_PROGRAMME],
  ["rahul", "a facilitator of one of its groups", 404, words.NO_PROGRAMME],
  ["amara", "a member who finished", 404, words.NO_PROGRAMME],
  ["bea", "a member who did not", 404, words.NO_PROGRAMME],
  ["sam", "a member who left", 404, words.NO_PROGRAMME],
  [null, "somebody signed out", 401, "Not signed in"],
];

const stored = () => world.db.paths().filter((path) => path.startsWith("courseFinishing/")).sort();

// ---------------------------------------------------------------------------
// 1 and 2. Who, and the body
// ---------------------------------------------------------------------------

describe("1. who may, and a refusal writes nothing", () => {
  test("the lead and an admin set the rule", async () => {
    for (const who of ["claudia", "zach"]) {
      const said = await ask.rule(who, 4);
      assert.equal(said.status, 200, who);
      assert.deepEqual(said.body, { ok: true, rule: { atLeast: 4, sessions: 6 } });
    }
    assert.deepEqual(world.db.read(rulePath).atLeast, 4);
    assert.equal(world.db.read(rulePath).kind, "rule");
  });

  test("everybody else is refused the rule, and nothing is written", async () => {
    for (const [who, what, status, error] of REFUSED) {
      const before = everything();
      assert.deepEqual(short(await ask.rule(who, 4)), [status, error], what);
      assert.equal(everything(), before, `${what}'s refusal wrote something`);
    }
  });

  test("everybody else is refused a switch, and nothing is written", async () => {
    world.db.seed(rulePath, RULE(4));
    for (const [who, what, status, error] of REFUSED) {
      const before = everything();
      assert.deepEqual(short(await ask.decide(who, "bea", true)), [status, error], what);
      assert.equal(everything(), before, `${what}'s refusal wrote something`);
    }
  });

  test("a view-as session is turned away before anything else, an admin's included", async () => {
    for (const who of ["zach", "claudia"]) {
      const before = everything();
      assert.equal((await ask.rule(who, 4, { viewAs: true })).status, 403);
      assert.equal((await ask.decide(who, "bea", true, { viewAs: true })).status, 403);
      assert.equal(everything(), before);
    }
  });

  test("a programme that names no run, and one whose run is being destroyed, say so", async () => {
    world.db.poke(`admissionRounds/${ROUND}`, { [`programmes.${AGI}.runId`]: null });
    assert.deepEqual(short(await ask.rule("claudia", 4)), [409, words.NO_RUN]);
    reset();
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.deepEqual(short(await ask.rule("claudia", 4)), [409, words.RUN_GONE]);
    assert.deepEqual(short(await ask.decide("zach", "bea", true)), [409, words.RUN_GONE]);
    assert.deepEqual(stored(), []);
  });
});

describe("2. the body is checked before anything is read", () => {
  test("every signed-in caller meets the same 400 for a body that is not one", async () => {
    for (const who of ["zach", "claudia", "lloyd", "tess", "amara"]) {
      world.db.stats.reads = 0;
      assert.deepEqual(short(await ask.rule(who, "four")), [400, "The number of sessions has to be a whole number from 1 to 60."], String(who));
      assert.deepEqual(short(await ask.decide(who, "a/b", true)), [400, "Say whose switch this is."], String(who));
      assert.equal(world.db.stats.reads, 0, `${who}'s malformed body was read past`);
    }
    const raw = await call("claudia", routes.rule.PUT, { roundId: ROUND, programmeId: AGI }, { body: "{not json" });
    assert.deepEqual(short(raw), [400, "Invalid JSON body"]);
  });
});

// ---------------------------------------------------------------------------
// 3. The rule
// ---------------------------------------------------------------------------

describe("3. the rule", () => {
  test("is stored with when it was set, and cleared with null", async () => {
    assert.equal((await ask.rule("claudia", 4)).status, 200);
    const rule = world.db.read(rulePath);
    assert.deepEqual([rule.runId, rule.atLeast, rule.setAt.toISOString()], [RUN.agi, 4, END.toISOString()]);
    assert.deepEqual((await ask.rule("claudia", null)).body, { ok: true, rule: { atLeast: null, sessions: 6 } });
    assert.equal(world.db.read(rulePath), undefined);
  });

  test("can be set before the end, and changed after it", async () => {
    mock.timers.setTime(BEFORE.getTime());
    assert.equal((await ask.rule("claudia", 4)).status, 200);
    mock.timers.setTime(END.getTime());
    assert.equal((await ask.rule("zach", 5)).status, 200);
    assert.equal(world.db.read(rulePath).atLeast, 5);
  });

  test("asking for more sessions than any group meets is refused, at the edge and past it", async () => {
    assert.equal((await ask.rule("claudia", 6)).status, 200);
    assert.deepEqual(short(await ask.rule("claudia", 7)), [409, "This programme’s groups meet 6 times, so nobody can come to more sessions than that."]);
    assert.equal(world.db.read(rulePath).atLeast, 6);
  });

  test("another programme's ids are not this one: Tess's rule lands on her own run, never on AGI Strategy's", async () => {
    assert.deepEqual(short(await ask.rule("tess", 3, { programmeId: AGI })), [404, words.NO_PROGRAMME]);
    assert.equal(world.db.read(rulePath), undefined);
  });
});

// ---------------------------------------------------------------------------
// 4. A switch
// ---------------------------------------------------------------------------

describe("4. a switch", () => {
  beforeEach(() => world.db.seed(rulePath, RULE(4)));

  test("before the last session is over it is refused, saying when", async () => {
    mock.timers.setTime(BEFORE.getTime());
    assert.deepEqual(short(await ask.decide("claudia", "bea", true)), [409, "Who finished can be said once the last session is over, on Wed 9 Dec."]);
    assert.deepEqual(stored(), [rulePath]);
  });

  test("ticking somebody the rule did not is stored, with who and when, and answered as the section", async () => {
    const said = await ask.decide("claudia", "bea", true);
    assert.equal(said.status, 200);
    const stored = world.db.read(decisionPath("bea"));
    assert.deepEqual(
      [stored.kind, stored.runId, stored.uid, stored.finished, stored.byUid, stored.at.toISOString()],
      ["person", RUN.agi, "bea", true, "claudia", END.toISOString()],
    );
    const bea = said.body.model.rows.find((row) => row.uid === "bea");
    assert.deepEqual([bea.finished, bea.changed], [true, "Changed by you"]);
    assert.equal(said.body.model.counts, "6 finished · 4 not");
  });

  test("putting it back to what the rule says removes the change, and the mark goes", async () => {
    await ask.decide("claudia", "bea", true);
    const said = await ask.decide("claudia", "bea", false);
    assert.equal(said.status, 200);
    assert.equal(world.db.read(decisionPath("bea")), undefined);
    assert.equal(said.body.model.rows.find((row) => row.uid === "bea").changed, null);
  });

  test("a switch pressed to what the rule already says stores nothing; unticking stores the change", async () => {
    assert.equal((await ask.decide("claudia", "amara", true)).status, 200);
    assert.equal(world.db.read(decisionPath("amara")), undefined);
    assert.equal((await ask.decide("claudia", "amara", false)).status, 200);
    assert.equal(world.db.read(decisionPath("amara")).finished, false);
  });

  test("at least 6, the switch follows the one rule: Chloe, at every session Group B held, is its suggestion, so ticking her stores nothing", async () => {
    world.db.seed(rulePath, RULE(6));
    const on = await ask.decide("claudia", "chloe", true);
    assert.equal(on.status, 200);
    assert.equal(world.db.read(decisionPath("chloe")), undefined);
    assert.deepEqual(
      [on.body.model.rows.find((row) => row.uid === "chloe").finished, on.body.model.rows.find((row) => row.uid === "chloe").changed],
      [true, null],
    );
    // Unticking her is the lead disagreeing with the rule: stored, and marked.
    const off = await ask.decide("claudia", "chloe", false);
    assert.equal(world.db.read(decisionPath("chloe")).finished, false);
    assert.equal(off.body.model.rows.find((row) => row.uid === "chloe").changed, "Changed by you");
    // Yasmin came to five of the six Group D held: the rule does not tick her, so ticking her is stored.
    await ask.decide("claudia", "yasmin", true);
    assert.equal(world.db.read(decisionPath("yasmin")).finished, true);
  });

  test("an admin's change is named for the lead, and the lead's own for the admin", async () => {
    await ask.decide("zach", "farah", true);
    await ask.decide("claudia", "kofi", true);
    const forLead = (await ask.decide("claudia", "tariq", false)).body.model.rows;
    assert.deepEqual(
      ["farah", "kofi"].map((uid) => forLead.find((row) => row.uid === uid).changed),
      ["Changed by Zach", "Changed by you"],
    );
    const forAdmin = (await ask.decide("zach", "tariq", false)).body.model.rows;
    assert.deepEqual(
      ["farah", "kofi"].map((uid) => forAdmin.find((row) => row.uid === uid).changed),
      ["Changed by you", "Changed by Claudia"],
    );
  });

  test("somebody who left is refused, whether they left or were taken off", async () => {
    assert.deepEqual(short(await ask.decide("claudia", "sam", true)), [409, "Sam Whitfield left the programme, so they aren’t on the list of who finished."]);
    assert.deepEqual(short(await ask.decide("zach", "omar", true)), [409, "Omar Haddad left the programme, so they aren’t on the list of who finished."]);
    assert.deepEqual(stored(), [rulePath]);
  });

  test("a person Publish never told is on an admin's list and not on the lead's", async () => {
    assert.deepEqual(short(await ask.decide("claudia", "una", false)), [404, words.NOT_ON_THE_LIST]);
    assert.equal((await ask.decide("zach", "una", false)).status, 200);
    assert.equal(world.db.read(decisionPath("una")).finished, false);
  });

  test("somebody who is nobody on the run, and a facilitator, are not on the list", async () => {
    for (const uid of ["nobody", "rahul", "claudia"]) {
      assert.deepEqual(short(await ask.decide("claudia", uid, true)), [404, words.NOT_ON_THE_LIST], uid);
    }
  });

  test("nobody decides their own switch: a lead or an admin who is also a learner on the run is refused, and nothing is written", async () => {
    for (const uid of ["claudia", "zach"]) world.db.seed(`courseEnrolments/${RUN.agi}__${uid}`, enrolment(uid, A));
    const before = everything();
    for (const [who, finished] of [
      ["claudia", true],
      ["claudia", false],
      ["zach", true],
      ["zach", false],
    ]) {
      assert.deepEqual(short(await ask.decide(who, who, finished)), [403, words.OWN_FINISHED], `${who} ${finished}`);
    }
    assert.equal(everything(), before);
    assert.deepEqual(stored(), [rulePath]);
    // They are on the list, so it is the refusal that stops them, and each
    // still decides somebody else.
    assert.equal((await ask.decide("claudia", "bea", true)).status, 200);
    assert.equal((await ask.decide("zach", "tariq", true)).status, 200);
    assert.deepEqual([world.db.read(decisionPath("bea")).byUid, world.db.read(decisionPath("tariq")).byUid], ["claudia", "zach"]);
  });

  test("with no rule, the lead ticks people by hand, and unticking one goes back to nobody", async () => {
    reset(finishSeed());
    const said = await ask.decide("claudia", "amara", true);
    assert.equal(said.body.model.counts, "1 finished · 9 not");
    assert.equal(said.body.model.sentence, words.NO_RULE_SENTENCE);
    await ask.decide("claudia", "amara", false);
    assert.equal(world.db.read(decisionPath("amara")), undefined);
  });

  test("a decision already stored is replaced, never doubled", async () => {
    world.db.seed(decisionPath("tariq"), decision("tariq", true, "zach"));
    await ask.decide("claudia", "tariq", true);
    assert.equal(world.db.read(decisionPath("tariq")).byUid, "claudia");
    assert.equal(stored().filter((path) => path.endsWith("__tariq")).length, 1);
  });

  test("the answer names nobody by address and carries no stored document", async () => {
    const said = await ask.decide("claudia", "bea", true);
    const json = JSON.stringify(said.body);
    assert.doesNotMatch(json, /@/);
    assert.doesNotMatch(json, /"kind":"person"|"byUid"|"atLeast"/);
  });
});
