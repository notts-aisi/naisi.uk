/**
 * PEOPLE IN GROUPS SHOWN AS COLUMNS OR RINGS (Sun 22 Nov 2026): one board,
 * shown two ways, the choice kept in the address; Circles' old address
 * opens it as Rings.
 *
 *   src/features/applications/groups/boardShow.ts (`boardShowOf`, `withShow`)
 *   src/features/applications/groups/ringsModel.ts (`ringsOf`, `fitOf`), RingsBoard.tsx, PeopleInGroups.tsx
 *   src/app/(app)/admin/.../programmes/[programmeId]/(tabs)/groups/page.tsx and groups/circles/page.tsx
 *   GET /api/admissions/forms/[roundId]/programmes/[programmeId]/panel (Rings' one feed of anybody's time)
 *   GET /api/admissions/forms/[roundId]/programmes/[programmeId]/circles (kept, an admin's arranging)
 *
 * ## What this guards
 *
 *  1. THE ADDRESS: no choice, each choice and a wrong value; the page hands
 *     the board what the address says and nothing else; the toolbar's two
 *     links and the row of views carry the choice on. No file adds a use of
 *     the browser's storage for it (the privacy policy's own test of every
 *     key the site keeps passes unchanged; here, the four files that carry
 *     the choice are searched for one).
 *  2. WHO: every kind of reader at People in groups shown each way, at
 *     Circles' old address, and at the two routes Rings reads. The choice
 *     never changes who is let in; the old address forwards exactly the two
 *     readers People in groups admits.
 *  3. WHAT A LEAD MAY NOT HAVE: a marker in each admins-only field (Claude's
 *     read, Pangram's flag) and a week planted for Sofia, whom the lead may
 *     not read and who is put in a ring here, are searched for in the lead's
 *     answer, in the rings drawn from it and in the lead's page; no tag or
 *     sentence about Sofia's time arrives, while an admin is drawn both, and
 *     the lead is drawn the marks of the people they may read.
 *  4. RINGS IS THE SAME BOARD: its moves are the card's own, its legend is
 *     Circles' own (the lead's without Claude and Pangram), and an admin's
 *     Suggest groups goes through Circles' own route, which the lead is
 *     never offered.
 *
 * Built on `tests/lib/peopleWorld.mjs`, as `tests/course-hub-board-panel.test.mjs`
 * is: AGI Strategy after decision day, Claudia leads it, Lloyd reviews it,
 * Tess leads Technical AI Safety, Yusuf is the run's track lead, Rahul and
 * Sofia facilitate Group B, Sofia Group A and Tom Group C.
 */
import { describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { week } from "./lib/handoverWorld.mjs";
import { A, AGI, B, C, ROUND, TAIS, makePeopleWorld, termSeed } from "./lib/peopleWorld.mjs";
import { stripSource } from "./lib/stripSource.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const codeOf = (path) => stripSource(readFileSync(join(SRC, path), "utf8"), { keepStrings: true });

mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-17T12:00:00Z") });

const w = await makePeopleWorld("__boardRingsSuite");
const panelRoute = await w.formRoute("programmes", "[programmeId]", "panel");
const circlesRoute = await w.formRoute("programmes", "[programmeId]", "circles");
const PROGRAMME = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]");
const PeoplePage = (await w.loadTs(join(PROGRAMME, "(tabs)", "groups", "page.tsx"))).default;
const CirclesAddress = (await w.loadTs(join(PROGRAMME, "(tabs)", "groups", "circles", "page.tsx"))).default;
const TimesPage = (await w.loadTs(join(PROGRAMME, "(tabs)", "groups", "times", "page.tsx"))).default;
const show = await w.loadTs(join("features", "applications", "groups", "boardShow.ts"));
const model = await w.loadTs(join("features", "applications", "groups", "ringsModel.ts"));
const RingsBoard = (await w.loadTs(join("features", "applications", "groups", "RingsBoard.tsx"))).default;
const circlesWords = await w.loadTs(join("features", "applications", "circles", "circlesWords.ts"));

const PARAMS = { roundId: ROUND, programmeId: AGI };
const BOARD_PATH = `/admin/admissions/forms/${ROUND}/programmes/${AGI}/groups`;

/** A marker planted in each field only an admin may read. */
const ADMINS_ONLY = {
  claudeSummary: "Reads the lighthouse case closely and carefully.",
  claudeStrength: "Asks sharp questions about the harbour.",
  claudeConcern: "Little said about the keepers' pay.",
};
/** Saturday mornings: Sofia's week, on her application to Technical AI Safety alone. It fits none of the groups. */
const SOFIA_WEEK = week({ 6: [["10:00", "11:30"]] });
const SOFIA_CANT = "Sofia Rossi didn’t mark this time as free on their application.";

const text = (html) =>
  html
    .replace(/<!-- -->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The world: the term, the hand-over pressed, three people placed, Claude's and Pangram's reads of Amara, Sofia's week. */
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
  w.reset(s);
  assert.equal((await w.join.press("zach")).status, 200);
  const placed = await w.join.place("zach", [
    { uid: "amara", groupId: B },
    { uid: "bea", groupId: A },
    { uid: "dev", groupId: C },
  ]);
  assert.equal(placed.status, 200, JSON.stringify(placed.body));
  w.world.mail.length = 0;
}

const panelFor = async (who, options) => (await w.call(who, panelRoute.GET, PARAMS, options));
async function boardFor(who) {
  const board = await w.join.board(who);
  assert.equal(board.status, 200, JSON.stringify(board.body));
  return board.body;
}

/**
 * The rings as `who` is drawn them, from the board's own rows and the panel's
 * own answer to `who`, with Sofia sitting in Group A as one of its people
 * (the allocation route never sends her, who holds no place: she is put in a
 * ring here so that a week the lead may not read is one the rings could
 * give away).
 */
async function ringsFor(who) {
  const board = await boardFor(who);
  const panel = (await panelFor(who)).body.panel;
  const bea = board.people.find((row) => row.uid === "bea");
  const rows = [...board.people, { ...bea, uid: "sofia", displayName: "Sofia Rossi", groupId: A, timeAnswer: null }];
  const names = new Map(rows.map((row) => [row.uid, row.displayName]));
  const rings = model.ringsOf({
    groups: board.groups,
    membersOf: (groupId) => rows.filter((row) => row.groupId === groupId),
    nameOf: (uid) => names.get(uid) ?? "NAISI member",
    panel,
    admin: panel.viewer === "admin",
    published: true,
  });
  const html = renderToStaticMarkup(
    createElement(RingsBoard, {
      roundId: ROUND,
      programmeId: AGI,
      rings,
      tray: [],
      selected: "sofia",
      selectedName: "Sofia Rossi",
      moveHere: (ring) => (ring.id === A ? null : model.moveHereWords(panel.people.sofia, ring.id)),
      busy: false,
      onOpen() {},
      onMoveHere() {},
      legend: panel.viewer === "admin" ? circlesWords.LEGEND : circlesWords.LEGEND_LEAD,
    }),
  );
  return { board, panel, rings, html, text: text(html) };
}

/** Sofia's name tag on a ring, as drawn. */
const sofiaChip = (html) => /<button[^>]*title="Sofia Rossi"[^>]*>/.exec(html)?.[0] ?? "";

// ---------------------------------------------------------------------------
// 1. The address
// ---------------------------------------------------------------------------

describe("1. how the board is shown is the address's, and nothing else's", () => {
  test("no choice, each choice and a wrong value", () => {
    assert.equal(show.boardShowOf(undefined), "columns");
    assert.equal(show.boardShowOf("rings"), "rings");
    assert.equal(show.boardShowOf("columns"), "columns");
    for (const wrong of ["Rings", "RINGS", " rings", "ring", "circles", "", "banana", ["rings"], ["rings", "columns"], 1, null]) {
      assert.equal(show.boardShowOf(wrong), "columns", JSON.stringify(wrong));
    }
    assert.equal(show.withShow(BOARD_PATH, "columns"), BOARD_PATH);
    assert.equal(show.withShow(BOARD_PATH, undefined), BOARD_PATH);
    assert.equal(show.withShow(BOARD_PATH, "rings"), `${BOARD_PATH}?show=rings`);
    assert.equal(show.withShow(`${BOARD_PATH}/times?length=90`, "rings"), `${BOARD_PATH}/times?length=90&show=rings`);
  });

  test("the page hands the board what the address says, and its two links and the row of views carry it on", async () => {
    await world();
    for (const [query, want] of [
      [{}, "columns"],
      [{ show: "rings" }, "rings"],
      [{ show: "columns" }, "columns"],
      [{ show: "banana" }, "columns"],
      [{ show: ["rings", "rings"] }, "columns"],
    ]) {
      const drawn = await w.draw(PeoplePage, "zach", PARAMS, query);
      assert.equal(drawn.element.props.show, want, JSON.stringify(query));
      // The toolbar: Columns and Rings, the one shown marked.
      const columns = /<a href="([^"]+)"[^>]*aria-current="?(true)?[^>]*>Columns<\/a>|<a href="([^"]+)"[^>]*>Columns<\/a>/.exec(drawn.html);
      assert.ok(columns, "no Columns link");
      assert.ok(drawn.html.includes(`href="${BOARD_PATH}"`), "Columns does not open the plain address");
      assert.ok(drawn.html.includes(`href="${BOARD_PATH}?show=rings"`), "Rings does not open ?show=rings");
      const chosen = [...drawn.html.matchAll(/<a [^>]*aria-current="true"[^>]*>(Columns|Rings)<\/a>/g)].map((m) => m[1]);
      assert.deepEqual(chosen, [want === "rings" ? "Rings" : "Columns"], JSON.stringify(query));
      // The row of views carries Rings on, and only Rings.
      const views = /<nav class="views" aria-label="Groups views">(.*?)<\/nav>/.exec(drawn.html)[1];
      const hrefs = [...views.matchAll(/href="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
      assert.ok(hrefs.length >= 4);
      for (const href of hrefs) assert.equal(href.endsWith("?show=rings"), want === "rings", href);
      assert.doesNotMatch(views, /Circles|\/circles/, "the row of views still offers Circles");
      // Publish's page is opened carrying the choice, so its way back keeps it.
      assert.ok(drawn.html.includes(`href="${BOARD_PATH}/publish${want === "rings" ? "?show=rings" : ""}"`), "Publish groups… loses the choice");
    }
  });

  test("another view reached from Rings carries it back, and the Times view's link opens Rings", async () => {
    await world();
    const times = await w.draw(TimesPage, "zach", PARAMS, { show: "rings" });
    const views = /<nav class="views" aria-label="Groups views">(.*?)<\/nav>/.exec(times.html)[1];
    assert.ok(views.includes(`href="${BOARD_PATH}?show=rings"`), "People in groups from Times loses Rings");
    const plain = await w.draw(TimesPage, "zach", PARAMS, {});
    assert.ok(/<nav class="views" aria-label="Groups views">.*?href="[^"]+\/groups"/.test(plain.html), "a plain Times opens People in groups with a choice");
  });

  test("nothing that carries the choice keeps it anywhere but the address", () => {
    for (const file of [
      "features/applications/groups/boardShow.ts",
      "features/applications/groups/PeopleInGroups.tsx",
      "features/applications/groups/RingsBoard.tsx",
      "features/applications/groups/ringsModel.ts",
      "features/applications/groups/GroupsViews.tsx",
      "features/applications/groups/BoardPersonPanel.tsx",
    ]) {
      const code = codeOf(file);
      for (const store of [/localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/, /\bcookies\(/]) {
        assert.doesNotMatch(code, store, `${file} keeps something in ${store}`);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Who
// ---------------------------------------------------------------------------

const READERS = ["zach", "claudia", "lloyd", "tess", "yusuf", "rahul", "amara", "nobody", null];

/** What a page was for `who`: where it sent them, or the state it drew, or the board. */
function outcomeOf(drawn) {
  if (drawn.to) return `to ${drawn.to}`;
  if (drawn.text.includes("There is no programme here")) return "no programme";
  if (drawn.text.includes("Only the programme’s lead and admins can open Groups")) return "not yours";
  if (drawn.element?.props?.view?.run) return "board";
  return `drawn: ${drawn.text.slice(0, 80)}`;
}

describe("2. who is let in, either way, at the old address and at the routes Rings reads", () => {
  test("People in groups answers every reader the same whichever way it is shown", async () => {
    await world();
    const said = {};
    for (const who of READERS) {
      const each = [];
      for (const query of [{}, { show: "rings" }, { show: "columns" }, { show: "banana" }]) {
        each.push(outcomeOf(await w.draw(PeoplePage, who, PARAMS, query)));
      }
      assert.equal(new Set(each).size, 1, `${who} is answered differently by the choice: ${each.join(" | ")}`);
      said[who ?? "signed out"] = each[0];
    }
    assert.equal(said.zach, "board");
    assert.equal(said.claudia, "board");
    assert.equal(said.lloyd, "not yours");
    assert.equal(said.tess, "no programme");
    for (const who of ["yusuf", "rahul", "amara", "nobody", "signed out"]) assert.notEqual(said[who], "board", `${who} is drawn the board`);
  });

  test("Circles' old address forwards an admin and the lead to Rings, says the reviewer's refusal, and nothing else", async () => {
    await world();
    const before = w.everything();
    for (const who of READERS) {
      const old = await w.draw(CirclesAddress, who, PARAMS);
      const board = outcomeOf(await w.draw(PeoplePage, who, PARAMS, { show: "rings" }));
      if (who === "zach" || who === "claudia") {
        assert.equal(old.to, `${BOARD_PATH}?show=rings`, who);
        assert.equal(board, "board", who);
      } else {
        // Anybody People in groups does not admit is told what it tells them, and never forwarded.
        assert.equal(outcomeOf(old), board, `${who} is answered otherwise at the old address`);
        assert.ok(!(old.to ?? "").includes("/groups"), `${who} is forwarded to the board`);
      }
      assert.ok(!old.html.includes("Amara") && !old.html.includes("lighthouse"), `${who} is told about somebody at the old address`);
    }
    // A programme that is not on the form, and an address that is no id.
    assert.equal(outcomeOf(await w.draw(CirclesAddress, "zach", { roundId: ROUND, programmeId: "no-such-programme" })), "no programme");
    assert.equal(outcomeOf(await w.draw(CirclesAddress, "zach", { roundId: ROUND, programmeId: "../x" })), "no programme");
    assert.equal(w.everything(), before, "the old address wrote something");
    assert.equal(w.world.mail.length, 0);
  });

  test("a view-as session is the person viewed, at the old address and at both routes Rings reads", async () => {
    await world();
    w.world.viewAs = true;
    try {
      assert.equal((await w.draw(CirclesAddress, "claudia", PARAMS)).to, `${BOARD_PATH}?show=rings`);
    } finally {
      w.world.viewAs = false;
    }
    const lead = await panelFor("claudia");
    const viewing = await panelFor("claudia", { viewAs: true });
    assert.deepEqual(viewing.body, lead.body, "a view-as session is answered more, or less, than the lead");
    assert.equal((await w.call("claudia", circlesRoute.GET, PARAMS, { viewAs: true })).status, 403);
  });

  test("Circles' route, kept for an admin's arranging, answers an admin alone as it did", async () => {
    await world();
    const said = {};
    for (const who of READERS) said[who ?? "signed out"] = (await w.call(who, circlesRoute.GET, PARAMS)).status;
    assert.deepEqual(said, { zach: 200, claudia: 403, lloyd: 403, tess: 403, yusuf: 403, rahul: 403, amara: 403, nobody: 403, "signed out": 401 });
  });

  test("the panel's read, Rings' one feed of anybody's time, as each reader", async () => {
    await world();
    const said = {};
    for (const who of READERS) said[who ?? "signed out"] = (await panelFor(who)).status;
    assert.deepEqual(said, { zach: 200, claudia: 200, lloyd: 403, tess: 404, yusuf: 404, rahul: 404, amara: 404, nobody: 404, "signed out": 401 });
  });
});

// ---------------------------------------------------------------------------
// 3. Nothing a lead may not have
// ---------------------------------------------------------------------------

describe("3. what the lead is never sent or drawn on Rings", () => {
  test("an admin's rings mark Sofia's time, Pangram's flag and Claude's legend; the lead's none of them", async () => {
    await world();
    const admin = await ringsFor("zach");
    // What an admin is drawn, so the searches below look for something that exists.
    assert.equal(admin.panel.people.sofia.week.kind, "given");
    assert.equal(model.fitOf(admin.panel.people.sofia, A), "cant");
    assert.ok(admin.text.includes(SOFIA_CANT), admin.text);
    assert.match(sofiaChip(admin.html), /chipOff/);
    assert.match(admin.html, /aria-label="Pangram flagged answers"/);
    assert.ok(admin.text.includes("what Claude made of their application"));
    assert.ok(admin.text.includes("“!” is a Pangram flag"));
    assert.ok(admin.html.includes("Move here (can’t make it)"), "an admin is not told Sofia can't make another group");

    const lead = await ringsFor("claudia");
    const wire = JSON.stringify(lead.panel);
    assert.deepEqual(lead.panel.people.sofia, { week: { kind: "may-not" } });
    for (const marker of Object.values(ADMINS_ONLY)) {
      assert.ok(!wire.includes(marker), `the lead is sent ${marker}`);
      assert.ok(!lead.html.includes(marker), `the lead is drawn ${marker}`);
    }
    // Sofia: on the ring by name, and nothing about her time: no red tag, no sentence, no "(can't make it)".
    assert.ok(sofiaChip(lead.html), "Sofia is not on the lead's ring");
    assert.doesNotMatch(sofiaChip(lead.html), /chipOff/, "the lead is drawn a red tag on Sofia");
    assert.ok(!lead.text.includes(SOFIA_CANT), "the lead is told Sofia didn't mark the time");
    assert.ok(!lead.html.includes("Move here (can’t make it)"), "the lead is told which groups Sofia can't make");
    assert.ok(lead.html.includes(">Move here<"), "Moving Sofia is not offered the lead at all");
    for (const ring of lead.rings) {
      const her = ring.members.find((member) => member.uid === "sofia");
      if (her) assert.deepEqual([her.cant, her.flagged], [false, false]);
      assert.ok(!ring.warnings.some((line) => line.startsWith("Sofia")), `${ring.name} says ${ring.warnings.join(" ")}`);
    }
    // No Claude and no Pangram anywhere, the legend included.
    for (const word of [/Pangram/, /Claude/, /aria-label="Pangram flagged answers"/, /As a facilitator/]) assert.doesNotMatch(lead.html, word, `the lead is drawn ${word}`);
    assert.equal(lead.text.endsWith(circlesWords.LEGEND_LEAD), true);
  });

  test("the lead is drawn the marks of the people they may read, and only those", async () => {
    await world();
    const lead = await ringsFor("claudia");
    // Bea sent the form with nothing marked: the lead may read it, so Group A says so.
    assert.equal(lead.panel.people.bea.week.kind, "none-given");
    const bea = lead.board.people.find((row) => row.uid === "bea").displayName;
    assert.ok(lead.text.includes(`${bea} didn’t mark this time as free on their application.`), lead.text);
    assert.match(new RegExp(`<button[^>]*title="${bea}"[^>]*>`).exec(lead.html)?.[0] ?? "", /chipOff/, "Bea's tag is not red for the lead");
    // Every red tag the lead is drawn is somebody whose week the lead was answered.
    for (const ring of lead.rings) {
      for (const member of ring.members.filter((each) => each.cant)) {
        assert.ok(["given", "none-given"].includes(lead.panel.people[member.uid]?.week?.kind), `${member.uid} is tagged without a week the lead may read`);
      }
    }
  });

  test("the reading of a week a reader was answered, and of one they were not", () => {
    const chart = (keys) => ({ hours: [], days: [{ name: "Mon", free: [], readAs: null, bars: keys.map((key) => ({ key })) }] });
    assert.equal(model.fitOf(null, A), "unknown");
    assert.equal(model.fitOf({ week: null }, A), "unknown", "the reader's own week");
    assert.equal(model.fitOf({ week: { kind: "may-not" } }, A), "unknown");
    assert.equal(model.fitOf({ week: { kind: "not-on-file" } }, A), "unknown");
    assert.equal(model.fitOf({ week: { kind: "none-given", chart: chart([A]) } }, A), "cant");
    assert.equal(model.fitOf({ week: { kind: "none-given", chart: chart([A]) } }, B), "unknown", "a group with no time on their chart");
    const given = { week: { kind: "given", chart: chart([A, B]), littleMarked: false, groups: [{ key: A, fits: true }, { key: B, fits: false }] } };
    assert.equal(model.fitOf(given, A), "fits");
    assert.equal(model.fitOf(given, B), "cant");
    assert.equal(model.fitOf(given, C), "unknown");
    assert.equal(model.moveHereWords({ week: { kind: "may-not" } }, B), "Move here");
    assert.equal(model.moveHereWords(given, B), "Move here (can’t make it)");
  });

  test("the lead's page, shown as Rings, carries nothing of anybody's week and nothing of Claude or Pangram", async () => {
    await world();
    const drawn = await w.draw(PeoplePage, "claudia", PARAMS, { show: "rings" });
    assert.equal(drawn.element.props.show, "rings");
    const props = JSON.stringify(drawn.element.props.view);
    for (const marker of [...Object.values(ADMINS_ONLY), SOFIA_CANT, "Sofia’s week", "Only admins see"]) {
      assert.ok(!drawn.html.includes(marker), `the page carries ${marker}`);
      assert.ok(!props.includes(marker), `the board's props carry ${marker}`);
    }
    assert.doesNotMatch(props, /"availability"|"marked"|"chart"|"week"/, "the board's props carry a week");
    assert.doesNotMatch(drawn.html, /class="free"|Pangram|Claude|Suggest groups/, "the lead's page draws a week, a read, or an admin's arranging");
    assert.equal(drawn.wrote, false);
    // An admin's page, shown as Rings, offers Suggest groups; shown as Columns, it does not.
    assert.match((await w.draw(PeoplePage, "zach", PARAMS, { show: "rings" })).html, />Suggest groups</);
    assert.doesNotMatch((await w.draw(PeoplePage, "zach", PARAMS, {})).html, /Suggest groups/);
  });
});

// ---------------------------------------------------------------------------
// 4. The same board
// ---------------------------------------------------------------------------

describe("4. Rings is the same board, its moves the card's own", () => {
  test("a ring's Move here is the card's move, and Suggest groups is Circles' own route and suggestion", () => {
    const board = codeOf("features/applications/groups/PeopleInGroups.tsx");
    assert.match(board, /onMoveHere=\{\(groupId\) => \{\s*if \(subject\?\.kind === "row"\) void moveOne\(subject\.row\.uid, groupId\);/);
    // The one way a card moves anybody, still one: the mid-term question first, then the allocate route.
    assert.equal((board.match(/await place\(\[placement\]\)/g) ?? []).length, 1);
    // Rings' marks come from the panel's one read, never the allocation route's own fit marks.
    const rings = codeOf("features/applications/groups/ringsModel.ts");
    assert.doesNotMatch(rings, /fromForm|canMakeGroupIds|availability|markedRanges|fetch\(/);
    assert.doesNotMatch(codeOf("features/applications/groups/RingsBoard.tsx"), /\bfetch\(|fromForm/);
    // Suggest groups reads Circles' route and asks for a suggestion without Claude; the button is an admin's on Rings alone.
    assert.match(board, /fetch\(`\$\{base\}\/circles`, \{ cache: "no-store" \}\)/);
    assert.match(board, /JSON\.stringify\(\{ askClaude: false, minutes: String\(circles\.minutes\), startAgain: false \}\)/);
    assert.match(board, /\{rings && admin \? \(\s*<button/);
    // Shown as Rings, everybody's week is read at once; on Columns only once a panel is opened.
    assert.match(board, /useBoardPanel\(view\.roundId, view\.programmeId, openUid !== null \|\| rings, groupsKey\)/);
  });

  test("the words: Circles' rings, legend and warnings, the lead's legend without Claude and Pangram", () => {
    assert.equal(
      circlesWords.LEGEND_LEAD,
      "Click a person to see their week, then click a ring, or a group on their chart, to move them. A red tag is somebody who didn’t mark that time as free, “Not told yet” is somebody Publish hasn’t told their group, and “Moved” is somebody told their group and moved since, whom the next Publish emails.",
    );
    assert.doesNotMatch(circlesWords.LEGEND_LEAD, /Claude|Pangram|!/);
    assert.equal(circlesWords.WARN.cant("Kemi Adeyemi"), "Kemi Adeyemi didn’t mark this time as free on their application.");
    assert.equal(circlesWords.WARN.noFacilitator, "No facilitator.");
    assert.equal(circlesWords.whereLine("Group C"), "In Group C. Pick a group on the chart, or click another ring, to move them.");
    assert.equal(model.tagName("Amara Okafor"), "Amara O.");
  });

  test("a ring says how full it is and its time, names its facilitators with no place, and says it has none", async () => {
    await world();
    const admin = await ringsFor("zach");
    const ringC = admin.rings.find((ring) => ring.id === C);
    assert.ok(ringC.members.some((member) => member.uid === "dev"));
    // Group B: Rahul and Sofia facilitate it with no place on the run, by first name, each a button to their panel.
    const b = admin.rings.find((ring) => ring.id === B);
    assert.deepEqual(b.outside.map((f) => f.firstName).sort(), ["Rahul", "Sofia"]);
    assert.match(admin.text, /Facilitating, with no place on the run: (Rahul and Sofia|Sofia and Rahul)/);
    // A group with nobody facilitating it says so, as Circles did.
    const none = model.ringsOf({
      groups: [{ ...admin.board.groups[0], facilitatorUids: [], facilitatorFirstNames: [], facilitatorNames: [] }],
      membersOf: () => [],
      nameOf: () => "",
      panel: null,
      admin: true,
      published: false,
    });
    assert.deepEqual(none[0].warnings, ["No facilitator."]);
    // While the panel's read is on its way, or failed, nothing about anybody's time is drawn.
    const waiting = model.ringsOf({
      groups: admin.board.groups,
      membersOf: (id) => admin.board.people.filter((row) => row.groupId === id),
      nameOf: (uid) => uid,
      panel: null,
      admin: true,
      published: true,
    });
    for (const ring of waiting) for (const member of ring.members) assert.equal(member.cant, false, `${member.uid} is tagged with no answer`);
  });
});
