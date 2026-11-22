/**
 * THE PROGRAMME'S LEAD'S ARRANGING (Sun 22 Nov 2026): "Suggest groups" on
 * People in groups, on Columns and on Rings, opens Circles' arranging for the
 * lead as it does for an admin, read through the lead's own route and with
 * nothing of Claude or Pangram.
 *
 *   GET /api/admissions/forms/[roundId]/programmes/[programmeId]/arranging
 *   src/lib/applications/arrange/circles.ts (`loadLeadArranging`)
 *   src/features/applications/circles/Circles.tsx, PersonPanel.tsx (`forLead`)
 *
 * ## What this guards
 *
 *  1. WHO: the lead's route answers the programme's lead and an admin once
 *     decisions have gone out; a reviewer in a sentence; the lead of another
 *     programme, the run's track lead, a facilitator and a member as for no
 *     programme; somebody signed out and a view-as session are refused.
 *     Circles' own route answers everybody exactly as it did: an admin alone.
 *     Nothing is written and nobody is emailed.
 *  2. NOTHING THE LEAD MAY NOT HAVE: markers planted in Claude's and
 *     Pangram's reads, and in the week of Ines (on the run's own list,
 *     invited here without ranking it), are searched for in the lead's
 *     answer, in the drawn arranging and in the drawn person panel; a row
 *     another hand-over wrote never reaches the lead; and every week and
 *     offer the lead's answer carries is one the panel's own read already
 *     gives the lead.
 *  3. APPLY: the lead's Apply goes through the same routes as an admin's,
 *     each admitting the lead, and emails nobody; the screen offers it in the
 *     same states for both (once decisions have gone out and the run is
 *     named, before and after Publish alike), and Publish stays an admin's.
 *
 * Built on `tests/lib/peopleWorld.mjs` (Claudia leads AGI Strategy, Lloyd
 * reviews it, Tess leads Technical AI Safety, Yusuf is the run's track lead,
 * Rahul facilitates Group B).
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { week } from "./lib/handoverWorld.mjs";
import { A, AGI, B, C, COURSE, ROUND, RUN, TOLD, makePeopleWorld, termSeed } from "./lib/peopleWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T12:00:00Z") });

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const codeOf = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

const CLAUDE_STUB = `
export const CLAUDE_MODEL = "claude-opus-5-5";
export const MAX_CALL_MS = 240000;
export const ANTHROPIC_API_URL = "https://api.anthropic.com";
export function claudeBaseUrl(value) { return value || ANTHROPIC_API_URL; }
export function claudeConfigured() { return true; }
export async function askClaudeForJson(input) {
  (globalThis.__leadArrangingAsked ??= []).push(input);
  return { ok: false, reason: "Claude is not here." };
}`;

const w = await makePeopleWorld("__leadArrangingSuite", [["@/lib/ai/claude", CLAUDE_STUB]]);
const route = await w.formRoute("programmes", "[programmeId]", "arranging");
const circlesRoute = await w.formRoute("programmes", "[programmeId]", "circles");
const arrangementRoute = await w.formRoute("programmes", "[programmeId]", "arrangement");
const panelRoute = await w.formRoute("programmes", "[programmeId]", "panel");
const groupsRoute = await w.formRoute("programmes", "[programmeId]", "groups");
const timeRoute = await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "time");
const facilitatorsRoute = await w.courseRoute("groups", "[groupId]", "facilitators");
const Circles = (await w.loadTs(join("features", "applications", "circles", "Circles.tsx"))).default;
const PersonPanel = (await w.loadTs(join("features", "applications", "circles", "PersonPanel.tsx"))).default;
const circlesWords = await w.loadTs(join("features", "applications", "circles", "circlesWords.ts"));
const { changesBetween, placementOrder } = await w.loadTs("lib/applications/arrange/changes.ts");
const { draftOf, liveFacts, liveRings } = await w.loadTs("features/applications/circles/circlesModel.ts");

const PARAMS = { roundId: ROUND, programmeId: AGI };

/** A marker planted in each field only an admin may read. */
const ADMINS_ONLY = {
  claudeSummary: "Reads the lighthouse case closely and carefully.",
  claudeStrength: "Asks sharp questions about the harbour.",
  claudeConcern: "Little said about the keepers' pay.",
};
/** Ines's week: Wednesday lunchtimes, which make Group C, and Saturday mornings, which nobody else marked. */
const INES_WEEK = week({ 3: [["12:00", "16:00"]], 6: [["09:00", "12:00"]] });
const ELSEWHERE = { roundId: "spring-2026__r0und0ld", programmeId: "older-programme" };

/** The term after the hand-over, Ines and Omar on the run's own list, four people placed by an admin. */
async function world({ sent = true } = {}) {
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
  s[`admissionApplications/${ROUND}__ines`] = { ...ines, sent: { ...ines.sent, availability: INES_WEEK } };
  w.reset(s);
  assert.equal((await w.join.press("zach")).status, 200);
  for (const [uid, fromForm, name] of [
    ["ines", null, "Ines Carvalho"],
    ["omar", ELSEWHERE, "Omar Haddad"],
  ]) {
    w.world.db.seed(`courseApplications/${RUN.agi}__${uid}`, {
      runId: RUN.agi,
      courseId: COURSE.agi,
      uid,
      displayName: name,
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
  assert.equal(placed.body.placed, 4, JSON.stringify(placed.body));
  if (!sent) w.world.db.poke(`admissionRounds/${ROUND}`, { decisionsSentAt: null });
  w.world.mail.length = 0;
  globalThis.__leadArrangingAsked = [];
}

const arranging = (who, options) => w.call(who, route.GET, PARAMS, options);
const circles = (who, options) => w.call(who, circlesRoute.GET, PARAMS, options);

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who reads the lead's arranging", () => {
  test("the programme's lead and an admin; a reviewer in a sentence; everybody else as no programme; nothing written", async () => {
    await world();
    const before = w.everything();
    const said = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null]) {
      const answer = await arranging(who);
      said[who ?? "signed out"] = answer.status;
      if (answer.status !== 200) {
        assert.deepEqual(Object.keys(answer.body), ["error"], `${who} is answered more than a refusal`);
        assert.doesNotMatch(JSON.stringify(answer.body), /Amara|Ines|lighthouse/, `${who} is told about somebody`);
      } else {
        assert.deepEqual(Object.keys(answer.body), ["circles"]);
      }
    }
    assert.deepEqual(said, { zach: 200, claudia: 200, lloyd: 403, tess: 404, yusuf: 404, rahul: 404, amara: 404, nobody: 404, "signed out": 401 });
    assert.equal((await arranging("lloyd")).body.error, "Only an admin or the programme’s lead can ask for an arrangement.");
    assert.equal((await arranging("claudia", { viewAs: true })).status, 403, "a view-as session reads the lead's arranging");
    assert.equal(w.everything(), before, "reading the lead's arranging wrote something");
    assert.equal(w.world.mail.length, 0);
    assert.deepEqual(globalThis.__leadArrangingAsked, []);
  });

  test("Circles' own route answers everybody as it did: an admin alone", async () => {
    await world();
    const said = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", null]) said[who ?? "signed out"] = (await circles(who)).status;
    assert.deepEqual(said, { zach: 200, claudia: 403, lloyd: 403, tess: 403, yusuf: 403, rahul: 403, amara: 403, "signed out": 401 });
  });

  test("before decisions go out the lead is read nobody", async () => {
    await world({ sent: false });
    const answer = await arranging("claudia");
    assert.deepEqual([answer.status, answer.body], [409, { error: "Decisions haven’t gone out yet." }]);
  });
});

// ---------------------------------------------------------------------------
// 2. Nothing the lead may not have
// ---------------------------------------------------------------------------

describe("2. what the lead is never sent or drawn", () => {
  test("an admin's Circles carries the planted reads and Ines's week; the lead's answer none of them", async () => {
    await world();
    const admin = (await circles("zach")).body.circles;
    // What an admin is sent, so the searches below look for something that exists.
    assert.equal(admin.people.amara.read.summary, ADMINS_ONLY.claudeSummary);
    assert.equal(admin.people.amara.flags, 1);
    assert.ok(admin.people.ines.week.marked.some((stretch) => stretch.weekday === 6));
    assert.ok(admin.groups.find((group) => group.id === C).canMake.includes("ines"));
    assert.ok("omar" in admin.people);

    const lead = (await arranging("claudia")).body.circles;
    const wire = JSON.stringify(lead);
    for (const marker of Object.values(ADMINS_ONLY)) assert.ok(!wire.includes(marker), `the lead is sent ${marker}`);
    assert.doesNotMatch(wire, /omar|Omar/, "the lead is sent a row the board does not serve them");
    assert.equal(lead.claudeConfigured, false, "the lead's screen is told Claude is set up");
    for (const [uid, person] of Object.entries(lead.people)) {
      assert.equal(person.read, null, `${uid} carries Claude's read`);
      assert.equal(person.flags, null, `${uid} carries Pangram's`);
      assert.equal(person.potential, null, `${uid} carries a rating`);
      assert.ok(!person.week.marked.some((stretch) => stretch.weekday === 6), `${uid}'s week carries Ines's Saturday`);
    }
    // Ines: on the lead's board, and nothing of the application.
    assert.deepEqual(
      { week: lead.people.ines.week, offered: lead.people.ines.offered, href: lead.people.ines.href, unread: lead.people.ines.unread, littleMarked: lead.people.ines.littleMarked },
      { week: { said: false, marked: [], fromFirstMark: false }, offered: false, href: "", unread: true, littleMarked: false },
    );
    for (const group of lead.groups) assert.ok(!group.canMake.includes("ines"), `${group.name} says Ines can make its time`);
    // An admin's answer never carries the lead's mark.
    assert.doesNotMatch(JSON.stringify(admin), /"unread"/);
  });

  test("every week and offer the lead is sent is one the panel's own read already gives the lead", async () => {
    await world();
    const lead = (await arranging("claudia")).body.circles;
    const panel = (await w.call("claudia", panelRoute.GET, PARAMS)).body.panel;
    const board = (await w.join.board("claudia")).body;
    const onBoard = new Set(board.people.map((row) => row.uid));
    for (const [uid, person] of Object.entries(lead.people)) {
      assert.ok(onBoard.has(uid), `${uid} is on the lead's arranging and not on the lead's board`);
      const theirs = panel.people[uid] ?? {};
      if (person.week.said) assert.equal(theirs.week?.kind, "given", `${uid}'s week is sent to the lead's arranging and not to the lead's panel`);
      if (person.offered) assert.equal(theirs.offered, true, `${uid}'s offer to facilitate is sent where the panel sends none`);
      if (person.href) assert.ok(theirs.applicationHref, `${uid} is given a way to an application the panel gives no way to`);
    }
    // Somebody on the lead's board with no week the lead may read: nothing of a week in either.
    assert.ok(onBoard.has("ines"));
    assert.notEqual(panel.people.ines?.week?.kind, "given");
  });

  test("the lead's suggestion through the arrangement route carries the same marks, and nothing of Claude", async () => {
    await world();
    const said = await w.call("claudia", arrangementRoute.POST, PARAMS, { body: { askClaude: false } });
    assert.equal(said.status, 200, JSON.stringify(said.body));
    assert.equal(said.body.arrangement.people.ines.unread, true);
    assert.equal(said.body.arrangement.people.ines.href, "");
    assert.deepEqual(globalThis.__leadArrangingAsked, []);
  });

  test("the drawn arranging, opened on the lead's suggestion, names neither service, asks neither and leads nowhere an admin's alone", async () => {
    await world();
    const live = (await arranging("claudia")).body.circles;
    const arrangement = (await w.call("claudia", arrangementRoute.POST, PARAMS, { body: { askClaude: false } })).body.arrangement;
    const html = renderToStaticMarkup(
      createElement(Circles, { initial: live, opening: { arrangement, error: null }, onLeave() {}, leaveLabel: circlesWords.BACK_TO_COLUMNS, forLead: true }),
    );
    const said = text(html);
    for (const marker of [...Object.values(ADMINS_ONLY), circlesWords.LEDE, circlesWords.LEGEND]) assert.ok(!said.includes(marker), `the lead's arranging draws ${marker}`);
    for (const word of [/Claude/, /Pangram/, /\/setup"/, />Go to Settings</, /Only admins see this/]) {
      assert.doesNotMatch(html, word, `the lead's arranging draws ${word}`);
    }
    assert.ok(said.includes(circlesWords.LEDE_LEAD), said.slice(0, 300));
    assert.ok(said.includes(circlesWords.BACK_TO_COLUMNS));
    assert.ok(said.includes(circlesWords.SUGGEST), "the lead is not offered Suggest groups");
    // An admin's arranging, drawn the same way, does name them: the searches above are of something real.
    const admin = (await circles("zach")).body.circles;
    const adminHtml = renderToStaticMarkup(createElement(Circles, { initial: admin, onLeave() {} }));
    assert.match(adminHtml, /Claude/);
  });

  test("the drawn person panel for somebody the lead may not read: no week, no offer, no application, no Claude or Pangram", async () => {
    await world();
    const live = (await arranging("claudia")).body.circles;
    const rings = liveRings(live);
    const draw = (person, forLead) =>
      text(
        renderToStaticMarkup(
          createElement(PersonPanel, {
            person,
            ring: rings.find((ring) => ring.memberUids.includes(person.uid)) ?? null,
            rings,
            grid: live.grid,
            preview: false,
            outside: 0,
            starts: [],
            facilitatorsHref: "/x",
            disabled: false,
            onMove() {},
            onStart() {},
            onRole() {},
            onFacilitate() {},
            onClose() {},
            runId: live.runId,
            onAnswerChanged() {},
            forLead,
          }),
        ),
      );
    const ines = draw(live.people.ines, true);
    assert.ok(ines.includes(circlesWords.ONLY_ADMINS_SEE_WEEK), ines);
    for (const word of [circlesWords.OPEN_APPLICATION, circlesWords.NO_WEEK, circlesWords.OFFERED, circlesWords.DIDNT_OFFER, "Pangram", "Claude", "can’t make"]) {
      assert.ok(!ines.includes(word), `the lead's panel for Ines draws ${word}`);
    }
    const amara = draw(live.people.amara, true);
    assert.ok(amara.includes(circlesWords.OPEN_APPLICATION), "the lead's panel loses the way to an application the lead may read");
    for (const word of ["Pangram", "Claude", ...Object.values(ADMINS_ONLY)]) assert.ok(!amara.includes(word), `the lead's panel for Amara draws ${word}`);
    assert.equal(circlesWords.ONLY_ADMINS_SEE_WEEK, "Only admins see when they’re free.");
  });

  test("the lead's words are an admin's without Claude, Pangram or Settings", () => {
    assert.equal(
      circlesWords.LEDE_LEAD,
      "Each ring is one of the run’s groups, with the people in it now. Click a person to see their week against every group’s time, and to move them. A move saves straight away, as on People in groups. Nobody is emailed: Publish tells people their group.",
    );
    assert.ok(circlesWords.LEDE.startsWith(circlesWords.LEDE_LEAD.split(", and to move them")[0]));
    assert.equal(circlesWords.notOnListWords(["Kemi Adeyemi"], false), "Kemi Adeyemi holds a place but isn’t on the run’s list yet, so they can’t be placed. An admin hands them over on the Settings tab.");
    assert.equal(circlesWords.notOnListWords(["Kemi Adeyemi"]), "Kemi Adeyemi holds a place but isn’t on the run’s list yet, so they can’t be placed. Hand them over on the Settings tab.");
    assert.equal(circlesWords.BACK_TO_COLUMNS, "Back to the columns");
    for (const words of [circlesWords.LEDE_LEAD, circlesWords.LEGEND_LEAD, circlesWords.ONLY_ADMINS_SEE_WEEK, circlesWords.ONLY_ADMINS_SEE_WEEK_SHORT]) {
      assert.doesNotMatch(words, /Claude|Pangram|[–—]/);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Apply
// ---------------------------------------------------------------------------

describe("3. Apply, for the lead, is an admin's Apply", () => {
  test("the lead's Apply goes through the same routes, each admitting the lead, and emails nobody", async () => {
    await world();
    const live = (await arranging("claudia")).body.circles;
    // A preview that moves Bea to Group C, gives the new group a time and adds Ines to nothing else.
    const groupOf = (id) => live.groups.find((group) => group.id === id);
    const option = {
      key: "A",
      title: "",
      pros: [],
      cons: [],
      preferred: true,
      size: 8,
      unplaced: [],
      nearUids: [],
      movedUids: [],
      groups: [
        { key: "A1", id: A, name: groupOf(A).name, session: groupOf(A).session, timeIsNew: false, room: 8, memberUids: [], facilitators: [], why: "", canMake: [], existing: null },
        { key: "A2", id: B, name: groupOf(B).name, session: groupOf(B).session, timeIsNew: false, room: 8, memberUids: ["amara"], facilitators: [], why: "", canMake: [], existing: null },
        { key: "A3", id: C, name: groupOf(C).name, session: groupOf(C).session, timeIsNew: false, room: 8, memberUids: ["ines", "bea"], facilitators: [], why: "", canMake: [], existing: null },
        { key: "A4", id: null, name: "Group D", session: { weekday: 5, startTimeLocal: "14:00", durationMinutes: 120 }, timeIsNew: true, room: 6, memberUids: ["dev"], facilitators: [], why: "", canMake: [], existing: null },
      ],
    };
    const draft = draftOf(option, live);
    const changes = changesBetween(liveFacts(live), draft);
    assert.ok(changes.groups.length === 1 && changes.places.length >= 2, JSON.stringify(changes));
    const idOf = new Map(draft.map((group) => [group.key, group.id]));
    for (const group of changes.groups) {
      const made = await w.call("claudia", groupsRoute.POST, PARAMS, {
        body: { name: group.name, weekday: group.session.weekday, start: group.session.startTimeLocal, minutes: group.session.durationMinutes, places: group.room },
      });
      assert.equal(made.status, 200, JSON.stringify(made.body));
      idOf.set(group.key, made.body.groupId);
    }
    for (const time of changes.times) {
      const saved = await w.call("claudia", timeRoute.PUT, { ...PARAMS, groupId: time.groupId }, { body: { weekday: time.session.weekday, start: time.session.startTimeLocal, from: time.from } });
      assert.equal(saved.status, 200, JSON.stringify(saved.body));
    }
    const placed = await w.join.place("claudia", placementOrder(changes.places).map((place) => ({ uid: place.uid, groupId: place.to ? idOf.get(place.to) : null })));
    assert.equal(placed.status, 200, JSON.stringify(placed.body));
    assert.deepEqual(placed.body.rejected, []);
    for (const each of changes.facilitators) {
      const staffed = await w.call("claudia", facilitatorsRoute.POST, { groupId: idOf.get(each.key) }, { body: { uids: each.uids }, course: true });
      assert.equal(staffed.status, 200, JSON.stringify(staffed.body));
    }
    const after = (await arranging("claudia")).body.circles;
    assert.equal(after.people.bea.groupId, C);
    assert.equal(after.people.dev.groupId, idOf.get("A4"));
    assert.equal(w.world.mail.length, 0, "the lead's Apply emailed somebody");
    // Read again, the same preview sends nothing.
    assert.equal(changesBetween(liveFacts(after), draftOf({ ...option, groups: option.groups.map((group) => (group.key === "A4" ? { ...group, id: idOf.get("A4") } : group)) }, after)).count, 0);
  });

  test("Apply is offered in the same states for the lead and an admin, and Publish stays an admin's", async () => {
    const screen = codeOf("features/applications/circles/Circles.tsx");
    // The one rule, with nothing of who is looking in it: decisions out, the run named, and a suggestion that is not a preview.
    assert.match(screen, /const applies = Boolean\(live\.sent && live\.runId && preview && !preview\.view\.preview\);/);
    const rule = /const applies = [^;]+;/.exec(screen)[0];
    assert.doesNotMatch(rule, /forLead|admin/);
    await world();
    const pressed = await w.join.publish("claudia");
    assert.equal(pressed.status, 403, JSON.stringify(pressed.body));
  });
});
