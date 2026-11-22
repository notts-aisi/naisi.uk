/**
 * SUGGEST GROUPS FOR A PROGRAMME'S LEAD, WITHOUT CLAUDE (Sun 22 Nov 2026).
 *
 *   POST /api/admissions/forms/[roundId]/programmes/[programmeId]/arrangement
 *   src/lib/applications/arrange/load.ts (`loadArranging`, `arrangingReader`)
 *   src/lib/applications/arrange/advise.ts (`arrangeOptions`)
 *
 * ## What this guards
 *
 *  1. WHO: an admin and the programme's lead are answered a suggestion
 *     without Claude; a reviewer is refused in a sentence; the lead of
 *     another programme, the run's track lead, a facilitator and a member
 *     are answered as for a programme that is not there; somebody signed
 *     out is refused, and a view-as session is refused first. Nothing is
 *     written and nobody is emailed.
 *  2. CLAUDE IS AN ADMIN'S: asking Claude (`askClaude: true`) or asking a
 *     question (`ask`) is refused for everybody but an admin, the lead
 *     included, whatever else the request says, and the call to Claude is
 *     never made for them. An admin's request does reach it.
 *  3. A LEAD'S SUGGESTION IS BUILT FROM NOTHING THE LEAD MAY NOT READ: no
 *     row the board does not serve them (a row another programme's hand-over
 *     wrote on the run), no week of somebody whose application they may not
 *     read (Ines, on the run's own list, invited here without ranking it),
 *     and no Claude or Pangram read. Ines planted with distinctive times
 *     gives the lead exactly the answer she gives with none.
 *  4. THE PREVIEW BEFORE DECISION DAY STAYS AN ADMIN'S.
 *
 * Built on `tests/lib/peopleWorld.mjs` (Claudia leads AGI Strategy, Lloyd
 * reviews it, Tess leads Technical AI Safety, Yusuf is the run's track lead,
 * Rahul facilitates Group B), with Claude stubbed so a call is recorded and
 * nothing leaves this process.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { week } from "./lib/handoverWorld.mjs";
import { A, AGI, B, C, COURSE, ROUND, RUN, TOLD, makePeopleWorld, termSeed } from "./lib/peopleWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T12:00:00Z") });

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export const MAX_CALL_MS = 240000;
export const ANTHROPIC_API_URL = "https://api.anthropic.com";
export function claudeBaseUrl(value) { return value || ANTHROPIC_API_URL; }
export function claudeConfigured() { return true; }
export async function askClaudeForJson(input) {
  (globalThis.__suggestAsked ??= []).push(input);
  return { ok: false, reason: "Claude is not here." };
}`;

const w = await makePeopleWorld("__suggestSuite", [["@/lib/ai/claude", CLAUDE_STUB]]);
const route = await w.formRoute("programmes", "[programmeId]", "arrangement");
const { ARRANGE_ADMIN_OR_LEAD } = await w.loadTs("lib/applications/arrange/load.ts");
const { CLAUDE_ADMINS_ONLY, PREVIEW_ADMINS_ONLY } = await w.loadTs("lib/applications/arrange/advise.ts");

/** A marker planted in each field only an admin may read. */
const ADMINS_ONLY = {
  claudeSummary: "Reads the lighthouse case closely and carefully.",
  claudeStrength: "Asks sharp questions about the harbour.",
  claudeConcern: "Little said about the keepers' pay.",
};
/** Ines's week: Wednesday lunchtimes, which make Group C, and Saturday mornings, which nobody else marked. */
const INES_WEEK = week({ 3: [["12:00", "16:00"]], 6: [["09:00", "12:00"]] });
const NOTHING = week({});
/** Another term's hand-over, which wrote a row on this run that is not AGI Strategy's lead's. */
const ELSEWHERE = { roundId: "spring-2026__r0und0ld", programmeId: "older-programme" };

/**
 * The world: the term, the hand-over pressed, then on the run's own list
 * Ines (a row of the run's own form, invited to AGI Strategy without ranking
 * it, so its lead may not read her application) and Omar (a row another
 * term's hand-over wrote, which the board never serves the lead), both
 * placed by an admin. Amara is in Group B, Bea in Group A.
 */
async function world({ inesWeek = INES_WEEK, sent = true } = {}) {
  const s = termSeed();
  s[`admissionAssessments/${ROUND}__amara`] = {
    roundId: ROUND,
    uid: "amara",
    read: {
      summary: ADMINS_ONLY.claudeSummary,
      programmes: { [AGI]: { lean: "strong", leanReason: "", fit: "" } },
      strengths: [ADMINS_ONLY.claudeStrength],
      concerns: [ADMINS_ONLY.claudeConcern],
      thinAnswers: [],
    },
    pangram: { answers: [{ key: "x", worthALook: true }], failed: [], tooShort: 0, at: "" },
  };
  const ines = s[`admissionApplications/${ROUND}__ines`];
  s[`admissionApplications/${ROUND}__ines`] = { ...ines, sent: { ...ines.sent, availability: inesWeek } };
  w.reset(s);
  assert.equal((await w.join.press("zach")).status, 200);
  for (const [uid, fromForm] of [
    ["ines", null],
    ["omar", ELSEWHERE],
  ]) {
    w.world.db.seed(`courseApplications/${RUN.agi}__${uid}`, {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid,
      displayName: uid === "ines" ? "Ines Carvalho" : "Omar Haddad",
      status: "accepted",
      fromForm,
      createdAt: TOLD,
      updatedAt: TOLD,
    });
  }
  const placed = await w.join.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "ines", groupId: C },
    { uid: "omar", groupId: A },
  ]);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  assert.equal(placed.body.placed, 4, JSON.stringify(placed.body));
  if (!sent) w.world.db.poke(`admissionRounds/${ROUND}`, { decisionsSentAt: null });
  w.world.mail.length = 0;
  globalThis.__suggestAsked = [];
}

const suggest = (who, body = { askClaude: false }, options = {}) =>
  w.call(who, route.POST, { roundId: ROUND, programmeId: AGI }, { body, ...options });

/** Every uid any group of any option says can make its time. */
const canMakeAll = (arrangement) => new Set(arrangement.options.flatMap((option) => option.groups.flatMap((group) => group.canMake)));

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who is answered a suggestion without Claude", () => {
  test("an admin and the programme's lead; a reviewer in a sentence; everybody else as no programme; nothing written", async () => {
    await world();
    const before = w.everything();
    const said = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null]) {
      const answer = await suggest(who);
      said[who ?? "signed out"] = answer.status;
      if (answer.status !== 200) {
        assert.deepEqual(Object.keys(answer.body), ["error"], `${who} is answered more than a refusal`);
        assert.doesNotMatch(JSON.stringify(answer.body), /Amara|Ines|lighthouse/, `${who} is told about somebody`);
      }
    }
    assert.deepEqual(said, { zach: 200, claudia: 200, lloyd: 403, tess: 404, yusuf: 404, rahul: 404, amara: 404, nobody: 404, "signed out": 401 });
    assert.equal((await suggest("lloyd")).body.error, ARRANGE_ADMIN_OR_LEAD);
    assert.equal(ARRANGE_ADMIN_OR_LEAD, "Only an admin or the programme’s lead can ask for an arrangement.");
    assert.equal(w.everything(), before, "asking for a suggestion wrote something");
    assert.equal(w.world.mail.length, 0, "asking for a suggestion emailed somebody");
    assert.deepEqual(globalThis.__suggestAsked, [], "a suggestion without Claude asked Claude");
  });

  test("a view-as session is refused before anything, the lead's included", async () => {
    await world();
    for (const who of ["claudia", "zach"]) assert.equal((await suggest(who, { askClaude: false }, { viewAs: true })).status, 403, who);
  });

  test("an empty body is the same 400 for everybody signed in", async () => {
    await world();
    for (const who of ["zach", "claudia", "lloyd", "amara"]) assert.equal((await suggest(who, {})).status, 400, who);
  });

  test("the answer's one field, for the lead as for an admin", async () => {
    await world();
    for (const who of ["zach", "claudia"]) assert.deepEqual(Object.keys((await suggest(who)).body), ["arrangement"], who);
  });
});

// ---------------------------------------------------------------------------
// 2. Claude
// ---------------------------------------------------------------------------

describe("2. asking Claude is an admin's alone", () => {
  test("the lead asking Claude, or asking a question, is refused before anything is read, and Claude is never called", async () => {
    await world();
    const before = w.everything();
    for (const body of [
      { askClaude: true },
      { askClaude: true, minutes: "120", startAgain: true },
      { ask: { question: "Who should facilitate Group B?", history: [], groups: [] } },
      { ask: { question: "Who?" }, askClaude: false },
    ]) {
      for (const who of ["claudia", "lloyd", "tess", "yusuf", "amara"]) {
        const answer = await suggest(who, body);
        assert.deepEqual([answer.status, answer.body], [403, { error: CLAUDE_ADMINS_ONLY }], `${who} ${JSON.stringify(body)}`);
      }
    }
    assert.equal(CLAUDE_ADMINS_ONLY, "Only an admin can ask Claude about groups.");
    assert.deepEqual(globalThis.__suggestAsked, [], "Claude was called for somebody who is not an admin");
    assert.equal(w.everything(), before);
  });

  test("an admin asking Claude does reach it, so the lead's silence above is the gate's", async () => {
    await world();
    const answer = await suggest("zach", { askClaude: true });
    assert.equal(answer.status, 500, JSON.stringify(answer.body));
    assert.equal(globalThis.__suggestAsked.length, 1);
  });

  test("the lead's suggestion says Claude was not asked, offers no Claude, and carries no Claude or Pangram read", async () => {
    await world();
    const admin = (await suggest("zach")).body.arrangement;
    // What an admin is sent, so the searches below look for something that exists.
    assert.equal(admin.people.amara.read.summary, ADMINS_ONLY.claudeSummary);
    assert.equal(admin.people.amara.flags, 1);
    assert.equal(admin.claudeConfigured, true);

    const lead = (await suggest("claudia")).body.arrangement;
    const wire = JSON.stringify(lead);
    for (const marker of Object.values(ADMINS_ONLY)) assert.ok(!wire.includes(marker), `the lead is sent ${marker}`);
    assert.equal(lead.asked, false);
    assert.equal(lead.claudeConfigured, false, "the lead is offered something that asks Claude");
    for (const [uid, person] of Object.entries(lead.people)) {
      assert.equal(person.read, null, `${uid} carries Claude's read`);
      assert.equal(person.flags, null, `${uid} carries Pangram's`);
      assert.equal(person.potential, null, `${uid} carries Claude's view as a facilitator`);
    }
    assert.deepEqual(globalThis.__suggestAsked, []);
  });
});

// ---------------------------------------------------------------------------
// 3. Nothing the lead may not read
// ---------------------------------------------------------------------------

describe("3. a lead's suggestion is built from nothing the lead may not read", () => {
  test("an admin is arranged Ines's week and Omar; the lead neither Omar nor anything of Ines's week", async () => {
    await world();
    const admin = (await suggest("zach")).body.arrangement;
    assert.ok("omar" in admin.people, "an admin is not arranged a row another hand-over wrote");
    assert.equal(admin.people.ines.week.said, true);
    assert.ok(admin.people.ines.week.marked.some((stretch) => stretch.weekday === 6), "an admin is not sent Ines's Saturday");
    assert.ok(canMakeAll(admin).has("ines"), "an admin's suggestion does not know Ines can make Group C");

    const lead = (await suggest("claudia")).body.arrangement;
    assert.ok(!("omar" in lead.people), "the lead is arranged a row the board does not serve them");
    assert.doesNotMatch(JSON.stringify(lead), /omar|Omar/, "the lead is told about Omar");
    // Ines is on the lead's board (a row of the run's own form), and nothing of her week is.
    assert.equal(lead.people.ines.name, "Ines Carvalho");
    assert.deepEqual(lead.people.ines.week, { said: false, marked: [], fromFirstMark: false });
    assert.equal(lead.people.ines.offered, false);
    assert.equal(lead.people.ines.littleMarked, false);
    assert.ok(!canMakeAll(lead).has("ines"), "the lead's suggestion says Ines can make a group's time");
    for (const option of lead.options) {
      assert.ok(!option.nearUids.includes("ines"), "the lead is told Ines is near a time");
    }
    // Nobody the lead may read marked a Saturday, so no stretch the lead is sent has one.
    for (const [uid, person] of Object.entries(lead.people)) {
      assert.ok(!person.week.marked.some((stretch) => stretch.weekday === 6), `${uid}'s week carries a Saturday the lead may not read`);
    }
  });

  test("Ines with distinctive times gives the lead exactly the answer Ines with none gives", async () => {
    await world({ inesWeek: INES_WEEK });
    const withTimes = (await suggest("claudia")).body.arrangement;
    const adminWithTimes = (await suggest("zach")).body.arrangement;
    await world({ inesWeek: NOTHING });
    const withNone = (await suggest("claudia")).body.arrangement;
    const adminWithNone = (await suggest("zach")).body.arrangement;
    assert.deepEqual(withTimes, withNone, "something in the lead's answer is worked out from Ines's week");
    // An admin's answer does change, so the equality above is the gate's and not the seed's.
    assert.notDeepEqual(adminWithTimes.people.ines, adminWithNone.people.ines);
  });

  test("an admin's suggestion is what it was: every row, every week", async () => {
    await world();
    const admin = (await suggest("zach")).body.arrangement;
    for (const uid of ["amara", "bea", "ines", "omar"]) assert.ok(uid in admin.people, uid);
    assert.equal(admin.people.amara.week.said, true);
    assert.equal(admin.people.bea.week.said, false);
  });
});

// ---------------------------------------------------------------------------
// 4. Before decision day
// ---------------------------------------------------------------------------

describe("4. the preview before decision day stays an admin's", () => {
  test("the lead is refused in a sentence and an admin is answered a preview", async () => {
    await world({ sent: false });
    const lead = await suggest("claudia");
    assert.deepEqual([lead.status, lead.body], [403, { error: PREVIEW_ADMINS_ONLY }]);
    assert.equal(PREVIEW_ADMINS_ONLY, "Only an admin can ask for an arrangement before decisions go out.");
    const admin = await suggest("zach");
    assert.equal(admin.status, 200, JSON.stringify(admin.body));
    assert.equal(admin.body.arrangement.preview, true);
    // A reviewer and somebody with no role are refused as after decision day.
    assert.equal((await suggest("lloyd")).status, 403);
    assert.equal((await suggest("tess")).status, 404);
  });
});
