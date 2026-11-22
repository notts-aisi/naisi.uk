/**
 * THE PERSON'S PANEL ON PEOPLE IN GROUPS (Sun 22 Nov 2026): any name on a
 * programme's board opens a panel beside it with the person's week, how each
 * group's session fits it, the way to their page and application, and moving
 * them.
 *
 *   GET /api/admissions/forms/[roundId]/programmes/[programmeId]/panel
 *   src/lib/applications/handover/boardPanel.ts, src/lib/applications/people/week.ts (`boardWeeksFor`)
 *   src/features/applications/groups/BoardPersonPanel.tsx, PeopleInGroups.tsx
 *
 * ## What this guards
 *
 *  1. WHO: the panel's read answers an admin and the programme's lead; a
 *     reviewer is told the groups are the lead's; another programme's lead,
 *     the run's track lead, a facilitator, a member, the person themselves
 *     and somebody signed out are told nothing. A view-as session reads as
 *     the person viewed. Nothing is written and nobody is emailed.
 *  2. WHAT A LEAD MAY NOT HAVE: a marker planted in Claude's and Pangram's
 *     reads, and a week planted for two people the lead may not read (Sofia,
 *     who facilitates two groups with no place and applied to another
 *     programme alone; Ines, invited here without ranking it and not yet
 *     answered), are searched for in the lead's answer and on the lead's
 *     page, and nothing worked out from either week arrives.
 *  3. EVERY STATE THE PANEL DRAWS: a lead's view, marked under four hours,
 *     nothing marked, no longer on file, a facilitator who holds a place, a
 *     week that is not this reader's to see, invited and not yet accepted,
 *     somebody who gave their place back, and the admin's view with its
 *     admins-only part.
 *  4. EVERY MOVE IS THE BOARD'S OWN: the panel's bars, "Move here" and "Move
 *     to…" call the card's move, whose refusals (a full group, a facilitator
 *     who sits in their group, the mid-term path once the groups have gone
 *     out) are the allocate route's, asked here before and after.
 *  5. THE BOARD'S STATES AND WORDS: a failed load in a sentence, never a raw
 *     word; no run editor; a card's menu without its own group.
 *
 * Built on `tests/lib/peopleWorld.mjs` (AGI Strategy after decision day:
 * Claudia leads it, Lloyd reviews it, Tess leads Technical AI Safety, Yusuf
 * is the run's track lead, Rahul and Sofia facilitate Group B, Sofia Group A
 * and Tom Group C, with no place on the run). Here the hand-over has put
 * the form's people on the run's list, Amara is in Group B, Bea in Group A,
 * and Dev holds a place, facilitates Group C and sits in it.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { week } from "./lib/handoverWorld.mjs";
import { A, AGI, B, C, ROUND, RUN, TAIS, makePeopleWorld, termSeed } from "./lib/peopleWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const codeOf = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T12:00:00Z") });

const w = await makePeopleWorld("__boardPanelSuite");
const route = await w.formRoute("programmes", "[programmeId]", "panel");
const panelModule = await w.loadTs(join("features", "applications", "groups", "BoardPersonPanel.tsx"));
const BoardPersonPanel = panelModule.default;
const { focusAfterPanel } = await w.loadTs(join("features", "applications", "groups", "panelFocus.ts"));
const words = await w.loadTs(join("features", "applications", "groups", "peopleInGroupsWords.ts"));
const boardParts = await w.loadTs(join("features", "applications", "groups", "peopleInGroupsBoard.ts"));
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const PeoplePage = (await w.loadTs(join(PROGRAMME, "(tabs)", "groups", "page.tsx"))).default;

/** A marker planted in each field only an admin may read. */
const ADMINS_ONLY = {
  claudeSummary: "Reads the lighthouse case closely and carefully.",
  claudeStrength: "Asks sharp questions about the harbour.",
  claudeConcern: "Little said about the keepers' pay.",
};
/** Saturday mornings: Sofia's week, on an application to Technical AI Safety alone. Nobody else marked a weekend. */
const SOFIA_WEEK = week({ 6: [["10:00", "11:30"]] });
/** Sunday afternoons: Ines's week. */
const INES_WEEK = week({ 0: [["15:00", "16:30"]] });

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The world: the term, the hand-over pressed, three people placed, Dev facilitating the group they sit in. */
async function world() {
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
  // Sofia facilitates Groups A and B, holds no place on the run, and applied to Technical AI Safety alone.
  const amara = s[`admissionApplications/${ROUND}__amara`];
  s[`admissionApplications/${ROUND}__sofia`] = {
    ...amara,
    uid: "sofia",
    email: "sofia@example.com",
    displayName: "Sofia Rossi",
    sent: { ...amara.sent, aboutYou: { ...amara.sent.aboutYou, preferredName: "Sofia" }, rankedProgrammeIds: [TAIS], availability: SOFIA_WEEK },
    draft: { ...amara.draft, rankedProgrammeIds: [TAIS] },
    status: "pooled",
    result: { kind: "no-offer", programmeId: null, publishedAt: new Date("2026-10-23T08:00:00Z"), email: "sent", emailedAt: new Date("2026-10-23T08:00:00Z") },
    attendance: null,
  };
  const ines = s[`admissionApplications/${ROUND}__ines`];
  s[`admissionApplications/${ROUND}__ines`] = { ...ines, sent: { ...ines.sent, availability: INES_WEEK } };
  w.reset(s);
  assert.equal((await w.join.press("zach")).status, 200);
  w.world.db.poke(`courseGroups/${C}`, { facilitatorUids: ["tom", "dev"] });
  const placed = await w.join.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "dev", groupId: C },
  ]);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  assert.equal(placed.body.placed, 3, JSON.stringify(placed.body));
  w.world.mail.length = 0;
}

const ask = (who, options) => w.call(who, route.GET, { roundId: ROUND, programmeId: AGI }, options);

/** Every chart in an answer, with whose it is. */
function chartsIn(panel) {
  return Object.entries(panel.people).flatMap(([uid, person]) => (person.week && "chart" in person.week ? [[uid, person.week.chart]] : []));
}
/** How many marked stretches a chart has on a day. */
const freeOn = (chart, day) => chart.days.find((each) => each.name === day).free.length;

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who reads the panel", () => {
  test("an admin and the programme's lead; a reviewer is told the groups are the lead's; everybody else nothing", async () => {
    await world();
    const before = w.everything();
    const said = {};
    for (const who of ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null]) {
      const answer = await ask(who);
      said[who ?? "signed out"] = answer.status;
      if (answer.status !== 200) {
        assert.deepEqual(Object.keys(answer.body), ["error"], `${who} is answered more than a refusal`);
        assert.doesNotMatch(JSON.stringify(answer.body), /Amara|Sofia|lighthouse/, `${who} is told about somebody`);
      }
    }
    assert.deepEqual(said, { zach: 200, claudia: 200, lloyd: 403, tess: 404, yusuf: 404, rahul: 404, amara: 404, nobody: 404, "signed out": 401 });
    assert.equal(w.everything(), before, "reading the panel wrote something");
    assert.equal(w.world.mail.length, 0, "reading the panel emailed somebody");
  });

  test("the answer's one field, and a view-as session reads as the person viewed", async () => {
    await world();
    const lead = await ask("claudia");
    assert.deepEqual(Object.keys(lead.body), ["panel"]);
    assert.deepEqual(Object.keys(lead.body.panel).sort(), ["foot", "people", "viewer"]);
    assert.equal(lead.body.panel.viewer, "lead");
    assert.equal(lead.body.panel.foot, "Admins and AGI Strategy’s lead see this. Facilitators never do.");
    const viewing = await ask("claudia", { viewAs: true });
    assert.deepEqual(viewing.body, lead.body, "a view-as session is answered more, or less, than the lead");
  });

  test("before decisions go out nobody is read, for an admin or the lead", async () => {
    await world();
    w.world.db.poke(`admissionRounds/${ROUND}`, { decisionsSentAt: null });
    for (const who of ["zach", "claudia"]) assert.deepEqual((await ask(who)).body.panel.people, {}, who);
  });
});

// ---------------------------------------------------------------------------
// 2. Nothing a lead may not have
// ---------------------------------------------------------------------------

describe("2. what the lead is never sent", () => {
  test("an admin is answered Sofia's and Ines's weeks and Claude's read; the lead none of them, nor anything worked out from either week", async () => {
    await world();
    const admin = (await ask("zach")).body.panel;
    // What an admin is sent, so the searches below look for something that exists.
    assert.equal(admin.people.sofia.week.kind, "given");
    assert.equal(freeOn(admin.people.sofia.week.chart, "Sat"), 1);
    assert.equal(admin.people.ines.week.kind, "given");
    assert.equal(freeOn(admin.people.ines.week.chart, "Sun"), 1);
    assert.deepEqual(admin.people.amara.claude.lines, [
      `Claude’s lean: strong. ${ADMINS_ONLY.claudeSummary}`,
      `Strengths: ${ADMINS_ONLY.claudeStrength}.`,
      `Concerns: ${ADMINS_ONLY.claudeConcern}.`,
    ]);
    assert.equal(admin.people.amara.claude.flagged, true);

    const lead = (await ask("claudia")).body.panel;
    const wire = JSON.stringify(lead);
    // Sofia: one answer and nothing else, no offer, no link, no fit.
    assert.deepEqual(lead.people.sofia, { week: { kind: "may-not" } });
    // Ines is no People row for the lead, and no facilitator: not on the lead's board at all.
    assert.ok(!("ines" in lead.people), "the lead is answered about somebody invited who did not rank the programme");
    // No chart the lead is sent has a weekend stretch: nobody the lead may read marked one.
    for (const [uid, chart] of chartsIn(lead)) {
      assert.equal(freeOn(chart, "Sat") + freeOn(chart, "Sun"), 0, `${uid}'s chart carries a weekend the lead may not read`);
    }
    for (const marker of Object.values(ADMINS_ONLY)) assert.ok(!wire.includes(marker), `the lead is sent ${marker}`);
    for (const word of [/Pangram/, /Claude/, /"claude"/, /As a facilitator/, /@/]) assert.doesNotMatch(wire, word, `the lead is sent ${word}`);
    // Everybody the lead may not read is one answer and nothing else.
    for (const [uid, person] of Object.entries(lead.people)) {
      if (person.week?.kind === "may-not") assert.ok(!("offered" in person) && !("claude" in person), `${uid} carries more than the one answer`);
    }
  });

  test("somebody who never applied on the form: the lead's answer is the one for a week they may not read, and an admin's says nothing of a week", async () => {
    await world();
    const lead = (await ask("claudia")).body.panel;
    // Rahul and Tom facilitate with no application on the form; Sofia applied to another programme alone.
    assert.deepEqual(lead.people.sofia, { week: { kind: "may-not" } });
    for (const uid of ["rahul", "tom"]) {
      assert.deepEqual(lead.people[uid], lead.people.sofia, `the lead can tell ${uid} never applied from Sofia, who applied elsewhere`);
      assert.equal(JSON.stringify(lead.people[uid]), JSON.stringify(lead.people.sofia));
    }
    const admin = (await ask("zach")).body.panel;
    for (const uid of ["rahul", "tom"]) {
      assert.deepEqual(admin.people[uid], {}, `an admin is told something about ${uid}'s week`);
      const drawn = draw({ subject: { kind: "facilitator", uid, facilitates: [] }, name: "Rahul Mehta", read: readOf(admin) });
      assert.ok(!drawn.text.includes("When they’re free"), `an admin is drawn a week section for ${uid}`);
    }
  });

  test("an admin is told whether the programme's lead sees each week; the lead is never sent it", async () => {
    await world();
    const admin = (await ask("zach")).body.panel;
    // Amara ranked AGI Strategy, so its lead reads Amara's week; Sofia applied to Technical AI Safety alone.
    assert.equal(admin.people.amara.leadSees, true);
    assert.equal(admin.people.sofia.leadSees, false);
    assert.ok(!("leadSees" in admin.people.zach), "an admin is told about their own week");
    const lead = (await ask("claudia")).body.panel;
    for (const [uid, person] of Object.entries(lead.people)) assert.ok(!("leadSees" in person), `the lead is sent leadSees for ${uid}`);
  });

  test("the lead's page carries none of it either", async () => {
    await world();
    const drawn = await w.draw(PeoplePage, "claudia", { roundId: ROUND, programmeId: AGI });
    for (const marker of [...Object.values(ADMINS_ONLY), "Sofia’s week", "Only admins see"]) assert.ok(!drawn.html.includes(marker), `the page carries ${marker}`);
    assert.doesNotMatch(drawn.html, /class="free"/, "the page draws a week");
    assert.equal(drawn.wrote, false);
  });

  test("nobody is answered about their own week or Claude's read of them, an admin included", async () => {
    await world();
    const admin = (await ask("zach")).body.panel;
    assert.equal(admin.people.zach.week, null);
    assert.ok(!("claude" in admin.people.zach));
    assert.ok(!("applicationHref" in admin.people.zach));
  });
});

// ---------------------------------------------------------------------------
// 3. Every state the panel draws
// ---------------------------------------------------------------------------

/** The board's own rows and groups, as the allocation route answers `who`. */
async function boardFor(who) {
  const board = await w.join.board(who);
  assert.equal(board.status, 200, JSON.stringify(board.body));
  return board.body;
}

function draw(props) {
  const html = renderToStaticMarkup(
    createElement(BoardPersonPanel, {
      firstName: props.name.split(" ")[0],
      detail: "",
      coming: false,
      columnName: (id) => ({ [A]: "Group A", [B]: "Group B", [C]: "Group C" })[id] ?? "To place",
      options: [],
      busy: false,
      onMove() {},
      onTakeOff() {},
      onStopFacilitating() {},
      onClose() {},
      ...props,
    }),
  );
  return { html, text: text(html) };
}
const readOf = (panel) => ({ panel, loading: false, failed: false, retry() {} });
const rowSubject = (board, uid, columnId) => ({
  kind: "row",
  row: board.people.find((row) => row.uid === uid),
  columnId,
  facilitates: board.groups.filter((group) => group.facilitatorUids.includes(uid) && columnId === group.id),
});

describe("3. the panel in every state", () => {
  test("a lead's view: the week, each group's line with Move here, In this group, the foot, and no Claude or Pangram", async () => {
    await world();
    const [board, panel] = [await boardFor("claudia"), (await ask("claudia")).body.panel];
    const { html, text: said } = draw({ subject: rowSubject(board, "amara", B), name: "Amara Okafor", read: readOf(panel), coming: true });
    assert.match(said, /^Amara Okafor .*Group B Coming/);
    assert.match(said, /Open Amara’s page Open their application When they’re free/);
    assert.ok(said.includes(words.CHART_KEY));
    assert.match(said, /Group B · Tuesdays 6pm All 2 hours in their time In this group/);
    assert.match(said, /Group A · Thursdays 6pm All 2 hours in their time Move here/);
    assert.match(said, /Group C · Wednesdays 1pm None of it in their time Move here \(can’t make it\)/);
    assert.ok(said.includes("Admins and AGI Strategy’s lead see this. Facilitators never do."));
    assert.match(html, /aria-label="Move Amara Okafor to Group A, Thu 6pm"/);
    assert.match(said, /Move to… .*Take off the run…$/);
    assert.doesNotMatch(said, /Claude|Pangram|Only admins see this/);
  });

  test("marked under four hours, and nothing marked", async () => {
    await world();
    const [board, panel] = [await boardFor("claudia"), (await ask("claudia")).body.panel];
    const tariq = draw({ subject: rowSubject(board, "tariq", boardParts.POOL), name: "Tariq Mensah", read: readOf(panel) });
    assert.ok(tariq.text.includes("Marked under 4 hours in the week. The lighter shade runs from their first mark each day to the end of the day."));
    assert.ok(!tariq.text.includes(words.CHART_KEY));
    assert.match(tariq.text, /To place .*Placing Not in a group\. Pick a group on the chart, or another column, to move them\./);
    const bea = draw({ subject: rowSubject(board, "bea", A), name: "Bea Lindqvist", read: readOf(panel) });
    assert.ok(bea.text.includes("They haven’t said when they’re free, so nothing is shaded."));
    assert.doesNotMatch(bea.html, /class="free"/);
    // Somebody to place with nothing marked is not told to pick a group on a chart they cannot press.
    const unplaced = draw({ subject: rowSubject(board, "bea", boardParts.POOL), name: "Bea Lindqvist", read: readOf(panel) });
    assert.ok(!unplaced.text.includes("Pick a group on the chart"), unplaced.text);
    assert.doesNotMatch(unplaced.html, /<button[^>]*class="bar/, "a chart with nothing marked is pressable");
  });

  test("no longer on file: a row from the form whose application is gone", async () => {
    await world();
    const [board, panel] = [await boardFor("zach"), (await ask("zach")).body.panel];
    const tariq = board.people.find((row) => row.uid === "tariq");
    const gone = { ...tariq, uid: "zara", fromForm: { ...tariq.fromForm, availability: "not-on-file", canMakeGroupIds: [] } };
    const drawn = draw({ subject: { kind: "row", row: gone, columnId: C, facilitates: [] }, name: "Zara Khan", read: readOf(panel) });
    assert.ok(drawn.text.includes("When they’re free When they’re free is no longer on file, so nothing is shaded."));
  });

  test("a facilitator who holds a place: why they can't be moved, and Stop facilitating", async () => {
    await world();
    const [board, panel] = [await boardFor("claudia"), (await ask("claudia")).body.panel];
    const drawn = draw({ subject: rowSubject(board, "dev", C), name: "Dev Patel", read: readOf(panel) });
    assert.match(drawn.text, /Facilitates Group C/);
    assert.ok(drawn.text.includes("Facilitates Group C, so they sit in it and can’t be moved to another group. To move them, change who facilitates Group C first."));
    assert.match(drawn.text, /Stop facilitating Group C/);
    assert.ok(!drawn.text.includes("When they’re free"), "a facilitator who sits in their group is drawn a week to move them by");
    assert.ok(!drawn.text.includes("Move to…"));
  });

  test("a week that is not this reader's to see: the owner's sentence and nothing else, while an admin sees it", async () => {
    await world();
    const board = await boardFor("claudia");
    const facilitates = board.groups.filter((group) => group.facilitatorUids.includes("sofia"));
    const subject = { kind: "facilitator", uid: "sofia", facilitates };
    const asLead = draw({ subject, name: "Sofia Rossi", read: readOf((await ask("claudia")).body.panel) });
    assert.match(asLead.text, /^Sofia Rossi Facilitating, with no place on the run Facilitates Group B and Group A/);
    assert.ok(asLead.text.includes("When they’re free Only admins see when Sofia is free."));
    for (const word of ["another programme", "applied", "Technical AI Safety", "in their time", "Move here"]) assert.ok(!asLead.text.includes(word), `the lead is drawn ${word}`);
    assert.doesNotMatch(asLead.html, /class="free"|class="bar/);
    const asAdmin = draw({ subject, name: "Sofia Rossi", read: readOf((await ask("zach")).body.panel) });
    assert.match(asAdmin.html, /class="free"/);
    assert.ok(!asAdmin.text.includes("Only admins see when"));
    // The programme's lead may not read Sofia's week, so the admin is not told it does.
    assert.ok(asAdmin.text.includes("Only admins see this."), asAdmin.text);
    assert.ok(!asAdmin.text.includes("AGI Strategy’s lead see this"), "an admin is told the lead sees a week the lead may not read");
    // Somebody who never applied on the form: an admin is drawn nothing about their week.
    const rahul = draw({ subject: { kind: "facilitator", uid: "rahul", facilitates }, name: "Rahul Mehta", read: readOf((await ask("zach")).body.panel) });
    assert.ok(!rahul.text.includes("When they’re free"), "an admin is told about the week of somebody who never applied");
  });

  test("invited and not yet accepted, and somebody who gave their place back", async () => {
    await world();
    const panel = (await ask("claudia")).body.panel;
    const ruth = draw({ subject: { kind: "invited", uid: "ruth", line: "Invited Tue 27 Oct · fits B" }, name: "Ruth Adler", read: readOf(panel) });
    assert.match(ruth.text, /^Ruth Adler Invited Tue 27 Oct · fits B Invited/);
    assert.ok(ruth.text.includes("Ruth hasn’t accepted the invitation yet, so they can’t be placed."));
    assert.match(ruth.text, /Open their application/);
    assert.ok(!ruth.text.includes("When they’re free"));
    assert.equal(panel.people.nina.gaveBack.line, "Gave their place back on Fri 23 Oct");
    const nina = draw({ subject: { kind: "gave-back", uid: "nina", line: null }, name: "Nina Petrova", read: readOf(panel) });
    assert.match(nina.text, /^Nina Petrova Gave their place back on Fri 23 Oct Gave their place back/);
    assert.match(nina.text, /Open Nina’s page/);
    if (panel.people.nina.gaveBack.reason) assert.ok(nina.text.includes(`Their reason: “${panel.people.nina.gaveBack.reason}”`));
  });

  test("the admin's view: Claude and Pangram in their own part, marked as an admin's", async () => {
    await world();
    const [board, panel] = [await boardFor("zach"), (await ask("zach")).body.panel];
    const drawn = draw({ subject: rowSubject(board, "amara", B), name: "Amara Okafor", read: readOf(panel) });
    assert.match(drawn.text, /Claude and Pangram Only admins see this/);
    for (const marker of Object.values(ADMINS_ONLY)) assert.ok(drawn.text.includes(marker), marker);
    // Amara ranked AGI Strategy: its lead does see Amara's week, and the admin is told so.
    assert.ok(drawn.text.includes("Admins and AGI Strategy’s lead see this. Facilitators never do."));
    assert.match(drawn.text, /Pangram: 1 answer worth a look/);
    assert.doesNotMatch(drawn.text, /As a facilitator/, "a rating Claude made for an arrangement is drawn on the board");
  });

  test("while the read is on its way, and when it fails", () => {
    const row = { uid: "x", enrolmentStatus: "active", fromForm: null };
    const loading = draw({ subject: { kind: "row", row, columnId: boardParts.POOL, facilitates: [] }, name: "Pat Doe", read: { panel: null, loading: true, failed: false, retry() {} } });
    assert.ok(loading.text.includes(words.PANEL_LOADING));
    const failed = draw({ subject: { kind: "row", row, columnId: boardParts.POOL, facilitates: [] }, name: "Pat Doe", read: { panel: null, loading: false, failed: true, retry() {} } });
    assert.ok(failed.text.includes("When they’re free couldn’t be loaded. Check your connection. Try again"));
    assert.ok(!failed.text.includes("Pick a group on the chart"));
    // A refusal is the board's own sentence for it, never "check your connection".
    const refused = draw({ subject: { kind: "row", row, columnId: boardParts.POOL, facilitates: [] }, name: "Pat Doe", read: { panel: null, loading: false, failed: true, failedStatus: 403, retry() {} } });
    assert.ok(refused.text.includes("Only this programme’s lead or an admin can see its groups. Try again"), refused.text);
    assert.equal(words.panelFailedWords(404), "Only this programme’s lead or an admin can see its groups.");
    assert.equal(words.panelFailedWords(401), "You’re signed out. Sign in again to see the groups.");
    assert.equal(words.panelFailedWords(500), words.PANEL_FAILED);
    assert.equal(words.panelFailedWords(undefined), words.PANEL_FAILED);
  });
});

// ---------------------------------------------------------------------------
// 4. Every move is the board's own
// ---------------------------------------------------------------------------

describe("4. the panel's moves, its keys and where the focus goes", () => {
  test("Escape closes the panel, unless the Move to… menu inside took it first", () => {
    assert.equal(panelModule.escapeClosesPanel({ key: "Escape", defaultPrevented: false }), true);
    assert.equal(panelModule.escapeClosesPanel({ key: "Escape", defaultPrevented: true }), false, "Escape in the menu closes the whole panel");
    assert.equal(panelModule.escapeClosesPanel({ key: "Enter", defaultPrevented: false }), false);
    // The menu marks the key handled when it closes itself on Escape.
    assert.match(readFileSync(join(SRC, "components/ui/Dropdown.tsx"), "utf8"), /if \(e\.key === "Escape"\) \{\s*e\.preventDefault\(\);/);
    assert.match(codeOf("features/applications/groups/BoardPersonPanel.tsx"), /if \(escapeClosesPanel\(event\)\) onClose\(\);/);
  });

  test("closing the panel gives the focus back to the name that opened it, or the name where it is now, or the board", () => {
    const target = (connected) => ({ isConnected: connected, focus() {} });
    const opener = target(true);
    const moved = target(true);
    const board = target(true);
    assert.equal(focusAfterPanel(opener, () => moved, board), opener);
    // Moved to another column: the card is drawn again, so the name that opened the panel is gone.
    assert.equal(focusAfterPanel(target(false), () => moved, board), moved);
    // Taken off the run: their name is on the board no more.
    assert.equal(focusAfterPanel(target(false), () => null, board), board);
    assert.equal(focusAfterPanel(null, () => null, target(false)), null);
    const code = codeOf("features/applications/groups/PeopleInGroups.tsx");
    assert.match(code, /onClose=\{closePanel\}/);
    assert.match(code, /querySelector<HTMLElement>\(`\[data-panel-name="\$\{globalThis\.CSS\.escape\(uid\)\}"\]`\)/);
    // Every name that opens a panel can be found again by it.
    assert.equal((code.match(/data-panel-name=\{/g) ?? []).length, 4);
    assert.equal((code.match(/onClick=\{\(event\) => (?:onOpen|openPanel)\(/g) ?? []).length, 4);
  });

  test("every control goes through the board's own move, the take-off sheet and the facilitators route; the panel fetches nothing", () => {
    const panel = codeOf("features/applications/groups/BoardPersonPanel.tsx");
    assert.doesNotMatch(panel, /\bfetch\(/, "the panel sends something of its own");
    const board = codeOf("features/applications/groups/PeopleInGroups.tsx");
    assert.match(board, /if \(subject\.kind === "row" && columnId !== \(panelGroup\?\.id \?\? POOL\)\) void moveOne\(subject\.row\.uid, columnId\);/);
    assert.match(board, /if \(subject\.kind === "row"\) setTakingOff\(subject\.row\.uid\);/);
    assert.match(board, /fetch\(`\/api\/courses\/groups\/\$\{encodeURIComponent\(group\.id\)\}\/facilitators`/);
    assert.match(board, /if \(!window\.confirm\(STOP_CONFIRM\(nameOf\(uid\), group\.name\)\)\) return;/);
    // The group's facilitators are read as they are now, before the question, and the list sent is that one without them.
    const stop = board.slice(board.indexOf("const stopFacilitating"));
    assert.ok(stop.indexOf("/allocation`") > 0 && stop.indexOf("/allocation`") < stop.indexOf("window.confirm(STOP_CONFIRM"), "the list is not read before the question");
    assert.match(stop, /const next = current\.filter\(\(each\) => each !== uid\);/);
    assert.match(stop, /body: JSON\.stringify\(\{ uids: next \}\)/);
    // The one way a card moves anybody: the mid-term question first, then the allocate route.
    assert.equal((board.match(/await place\(\[placement\]\)/g) ?? []).length, 1);
  });

  test("before the groups go out: a full group and a facilitator who sits in their group are refused, as on a card", async () => {
    await world();
    w.world.db.poke(`courseGroups/${A}`, { capacity: 1 });
    const full = await w.join.place("claudia", [{ uid: "tariq", groupId: A }]);
    assert.deepEqual(full.body.rejected, [{ uid: "tariq", reason: "group-full" }]);
    assert.equal(words.notMovedWords("Tariq Mensah", "Group A", "group-full"), "Tariq Mensah wasn’t moved: Group A is full.");
    const facilitator = await w.join.place("claudia", [{ uid: "dev", groupId: B }]);
    assert.deepEqual(facilitator.body.rejected, [{ uid: "dev", reason: "facilitates-another-group" }]);
    // Before Publish, a move asks no question about weeks.
    const preview = await w.call("claudia", w.join.routes.allocate.POST, { runId: RUN.agi }, { body: { placements: [{ uid: "amara", groupId: A }], preview: true }, course: true });
    assert.deepEqual([preview.body.preview[0].fromWeek, preview.body.preview[0].refusal], [null, null]);
    assert.equal(w.world.mail.length, 0, "a move emailed somebody");
  });

  test("after the groups go out: moving somebody told their group takes the mid-term path", async () => {
    await world();
    w.world.db.poke(`courseRuns/${RUN.agi}`, { allocationPublishedAt: new Date("2026-10-28T18:00:00Z") });
    w.world.db.poke(`courseEnrolments/${RUN.agi}__amara`, { allocatedEmailAt: new Date("2026-10-28T18:00:00Z") });
    const preview = await w.call("claudia", w.join.routes.allocate.POST, { runId: RUN.agi }, { body: { placements: [{ uid: "amara", groupId: A }], preview: true }, course: true });
    assert.equal(preview.status, 200, JSON.stringify(preview.body));
    const [said] = preview.body.preview;
    assert.ok(said.fromWeek !== null || said.refusal !== null, `a move after the groups went out asked nothing: ${JSON.stringify(said)}`);
    assert.equal(w.world.mail.length, 0, "a preview emailed somebody");
  });
});

// ---------------------------------------------------------------------------
// 5. The board's states and words
// ---------------------------------------------------------------------------

describe("5. the board's states and words", () => {
  test("a failed load is said in a sentence, never the route's raw word", () => {
    assert.equal(words.loadFailedWords(undefined), "The groups couldn’t be loaded. Check your connection.");
    assert.equal(words.loadFailedWords(500), "The groups couldn’t be loaded. Check your connection.");
    assert.equal(words.loadFailedWords(503), "The groups couldn’t be loaded. Check your connection.");
    assert.equal(words.loadFailedWords(401), "You’re signed out. Sign in again to see the groups.");
    assert.equal(words.loadFailedWords(403), "Only this programme’s lead or an admin can see its groups.");
    assert.equal(words.loadFailedWords(404), "The course run is no longer on the site.");
    const board = codeOf("features/applications/groups/PeopleInGroups.tsx");
    assert.match(board, /\{words\.loadFailedWords\(error\.status\)\}/);
    assert.doesNotMatch(board, /\{error\.message\}/, "the board shows the route's own word");
  });

  test("no groups yet sends an admin and the lead to Times alone", () => {
    assert.equal(words.NO_GROUPS, "This run has no groups yet. Add them on the Times view.");
    assert.doesNotMatch(codeOf("features/applications/groups/peopleInGroupsWords.ts"), /run editor\./);
  });

  test("a card's menu leaves out the group the person is in", () => {
    const groups = [
      { id: "ga", name: "Group A", capacity: 8 },
      { id: "gb", name: "Group B", capacity: 8 },
    ];
    assert.deepEqual(
      boardParts.menuOptions({ enrolmentStatus: "active" }, groups, () => 1, "gb").map((option) => option.label),
      ["To place", "Group A · 1 of 8", "Take off the run…"],
    );
    assert.deepEqual(
      boardParts.menuOptions({ enrolmentStatus: "active" }, groups, () => 1).map((option) => option.label),
      ["To place", "Group A · 1 of 8", "Group B · 1 of 8", "Take off the run…"],
    );
  });
});
