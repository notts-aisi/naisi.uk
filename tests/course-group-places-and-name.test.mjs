/**
 * A GROUP'S PLACES AND ITS NAME, changed on the group's page under its
 * programme, each through a route that checks it and writes the group's
 * History. Run with `npm test` (Node's built-in runner, no emulator, no
 * credentials).
 *
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/places   { places }
 *   PUT /api/admissions/forms/[roundId]/programmes/[programmeId]/groups/[groupId]/name     { name }
 *
 * On the sessions world: Group B (Tuesdays 6pm, 8 places, Rahul and Sofia
 * facilitating) holds four places that have not left (Amara, Dev, who is
 * not told yet, Ines and Omar) and one that has (Nina, withdrawn); Group A
 * and Group C beside it; Claudia leads AGI Strategy, Lloyd reviews it, Tess
 * leads another programme, Yusuf is the run's track lead, Zach an admin, and
 * Paula approves courses and leads nothing.
 *
 * ## What this guards
 *
 *  1. WHO: the programme's lead and an admin; a reviewer is told it is
 *     theirs; everybody else (a course approver who is not the lead, the
 *     run's track lead, a facilitator of the group, a member of it, another
 *     programme's lead) is answered as for a programme that is not there; a
 *     view-as session is refused first; somebody signed out is 401. Nothing
 *     is written for any of them.
 *  2. PLACES: the site's rule for a group's capacity, in its own sentences;
 *     never below the people in the group as the Groups tab counts them,
 *     plus the freed places offered in it and not answered; a group already
 *     below its people (the live site has one) reads true, opens, and is
 *     refused every save but one at least its people or no limit, a save of
 *     the number it has included. Each change writes `capacity`, `updatedAt`
 *     and one History row, and emails nobody.
 *  3. NAME: trimmed and its spaces folded; blank and too long refused in the
 *     older card's and Times' own sentences; another live group's name
 *     refused, compared as Add a group compares; an archived group's name is
 *     free. Each change writes `name`, `updatedAt` and one History row, and
 *     emails nobody.
 *  4. THE TRANSACTION decides on what it read: a person placed in the group,
 *     and a group renamed, between the first read and the write.
 *  5. THE PAGE: six rows in their order, Places and Name with their
 *     buttons, the line under the heading; History's Name and places filter
 *     and its empty sentence; every other History sentence unchanged.
 */
import { beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { walkSource } from "./lib/functionScan.mjs";
import { AGI, B, C, CAST, NOW, ROUND, RUN, makeSessionsWorld, updatesSeed } from "./lib/sessionsWorld.mjs";
import { applicationPath, session, userDoc } from "./lib/applicationsSmallTerm.mjs";

const ui = { h: createElement };
globalThis.__groupPlacesUi = ui;
const CLASS_NAMES = "export default new Proxy({}, { get: (_, name) => String(name) });";
const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const STYLESHEETS = new Set();
for (const file of walkSource(SRC)) {
  for (const [, specifier] of readFileSync(file, "utf8").matchAll(/from\s+"([^"]+\.module\.css)"/g)) {
    STYLESHEETS.add(specifier);
  }
}
const CARD = (name) => `export default function ${name}() { return globalThis.__groupPlacesUi.h("div", null, "[${name}]"); }`;

const w = await makeSessionsWorld("__groupPlaces", [
  [
    "next/navigation",
    "export function redirect(to) { throw Object.assign(new Error('NEXT_REDIRECT'), { to }); }\n" +
      "export function useSelectedLayoutSegment() { return 'groups'; }\n" +
      "export function useRouter() { return { refresh() {}, push() {}, replace() {} }; }",
  ],
  [
    "next/link",
    "export default ({ href, className, children, ...rest }) =>\n" +
      "  globalThis.__groupPlacesUi.h('a', { href, className, 'aria-label': rest['aria-label'] }, children);",
  ],
  ["./session", "export async function getCurrentUser() { return globalThis.__groupPlaces.user; }"],
  ["@/features/courses/GroupRoster", CARD("GroupRoster")],
  ["@/features/courses/AttendanceGrid", CARD("AttendanceGrid")],
  ["./useGroupRoster", "export function useGroupRoster() { return { memberCount: 3, loading: false, error: null, notYetTold: false, reload() {} }; }"],
  ["./useGroupWeeks", "export function groupNoticeUrl(groupId) { return `/api/courses/groups/${groupId}/notice`; }"],
  ...[...STYLESHEETS].map((path) => [path, CLASS_NAMES]),
]);
const { world, everything, loadTs } = w;

const placesRoute = await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "places");
const nameRoute = await w.formRoute("programmes", "[programmeId]", "groups", "[groupId]", "name");
const P = await loadTs("lib/courses/placesAndName/words.ts");
const set = await loadTs("lib/courses/placesAndName/set.ts");
const pageWords = await loadTs("lib/courses/groupPage/words.ts");
const model = await loadTs("lib/courses/groupPage/model.ts");
const audit = await loadTs("lib/firestore/courseAudit.ts");
const { groupCapacityError } = await loadTs("lib/firestore/courseGroups.ts");
const { REFUSAL: TIMES } = await loadTs("lib/courses/groupTimes/words.ts");
const ADMIN_GROUP = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "groups", "[groupId]");
const { default: ProgrammeGroupPage } = await loadTs(join(ADMIN_GROUP, "page.tsx"));

const A = "agi-autumn-2026-thursday__grp00002";

// A course approver who leads nothing, as the session hands one over.
const approver = session("paula", "member", false, "Paula Grant");
CAST.paula = { ...approver, permissions: { ...approver.permissions, approveCourse: true } };

function seed(over = {}) {
  const base = updatesSeed();
  base["users/paula"] = userDoc(CAST.paula);
  return { ...base, ...over };
}

beforeEach(() => {
  w.reset(seed());
  for (const uid of ["claudia", "lloyd", "tess"]) world.db.poke(`users/${uid}`, { admissionsReviewer: true });
});

const stored = (groupId = B) => world.db.read(`courseGroups/${groupId}`);
const historyRows = (kind) =>
  world.db
    .paths()
    .filter((path) => path.startsWith("courseAudit/"))
    .map((path) => world.db.read(path))
    .filter((row) => row.kind === kind);
const short = (answer) => [answer.status, answer.body?.error ?? null];
const params = (groupId) => ({ roundId: ROUND, programmeId: AGI, groupId });
const places = (who, groupId, value, options = {}) =>
  w.call(who, placesRoute.PUT, params(groupId), { body: options.body ?? { places: value }, viewAs: options.viewAs });
const rename = (who, groupId, value, options = {}) =>
  w.call(who, nameRoute.PUT, params(groupId), { body: options.body ?? { name: value }, viewAs: options.viewAs });

/** A freed place offered in this group's name and not answered yet, on Wen's application. */
function offeredOn(groupId, over = {}) {
  return {
    ...world.db.read(applicationPath("wen")),
    result: { kind: "no-offer", programmeId: null, publishedAt: new Date("2026-10-09T13:20:00Z"), email: "sent", emailedAt: new Date("2026-10-09T13:20:00Z") },
    invitation: { programmeId: "agi-strategy", replyBy: "2026-11-25", response: null, respondedAt: null, lastReminderOn: null },
    freedPlace: { groupId, offeredAt: new Date("2026-11-18T10:00:00Z"), email: "sent", emailedAt: new Date("2026-11-18T10:00:00Z"), emailClaimedAt: null },
    status: "invited",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. who may change a group's places and name", () => {
  const REFUSED = [
    [null, 401, "Not signed in", "somebody signed out"],
    ["lloyd", 403, "notYours", "the programme's reviewer"],
    ["paula", 404, "noProgramme", "a course approver who is not the lead"],
    ["yusuf", 404, "noProgramme", "the run's track lead"],
    ["rahul", 404, "noProgramme", "a facilitator of the group"],
    ["sofia", 404, "noProgramme", "a facilitator of the group and another"],
    ["amara", 404, "noProgramme", "somebody in the group"],
    ["tess", 404, "noProgramme", "the lead of another programme"],
    ["nobody", 404, "noProgramme", "a member on nothing"],
  ];
  for (const [who, status, key, what] of REFUSED) {
    test(`${what} is refused both, and nothing is written`, async () => {
      const before = everything();
      const one = await places(who, B, 6);
      const two = await rename(who, B, "Wednesday afternoons");
      const expect = (refusal) => (key === "Not signed in" ? key : refusal[key]);
      assert.deepEqual(short(one), [status, expect(P.PLACES_REFUSAL)]);
      assert.deepEqual(short(two), [status, expect(P.NAME_REFUSAL)]);
      assert.equal(everything(), before);
    });
  }

  test("a view-as session is refused first, an admin's too, and a body that is not one before anything is read", async () => {
    const before = everything();
    assert.equal((await places("zach", B, 6, { viewAs: true })).status, 403);
    assert.equal((await rename("zach", B, "Wednesday afternoons", { viewAs: true })).status, 403);
    assert.deepEqual(short(await places("nobody", B, null, { body: { places: "six" } })), [400, P.PLACES_REFUSAL.notANumber]);
    assert.deepEqual(short(await places("nobody", B, null, { body: { places: 6, tell: true } })), [400, P.PLACES_REFUSAL.body]);
    assert.deepEqual(short(await rename("nobody", B, "   ")), [400, P.NAME_REFUSAL.blank]);
    assert.equal(everything(), before);
  });

  test("the programme's lead and an admin change both, and nobody is emailed", async () => {
    for (const [who, number, name] of [
      ["zach", 6, "Tuesday evenings"],
      ["claudia", 10, "Group B"],
    ]) {
      const one = await places(who, B, number);
      assert.equal(one.status, 200, `${who}: ${JSON.stringify(one.body)}`);
      assert.deepEqual(one.body, {
        ok: true,
        changed: true,
        groupId: B,
        groupName: stored().name,
        places: number,
        message: P.placesSavedWords(stored().name, number),
      });
      const two = await rename(who, B, name);
      assert.equal(two.status, 200, `${who}: ${JSON.stringify(two.body)}`);
      assert.equal(two.body.groupName, name);
      assert.equal(stored().name, name);
      assert.equal(stored().capacity, number);
    }
    assert.deepEqual(world.mail, []);
  });
});

// ---------------------------------------------------------------------------
// 2. Places
// ---------------------------------------------------------------------------

describe("2. a group's places", () => {
  test("the body: a number, or null for no limit; nothing else", () => {
    assert.deepEqual(set.parsePlacesBody({ places: 8 }), { ok: true, value: 8 });
    assert.deepEqual(set.parsePlacesBody({ places: null }), { ok: true, value: null });
    assert.deepEqual(set.parsePlacesBody({}), { ok: false, error: P.PLACES_REFUSAL.notANumber });
    assert.deepEqual(set.parsePlacesBody({ places: "8" }), { ok: false, error: P.PLACES_REFUSAL.notANumber });
    assert.deepEqual(set.parsePlacesBody([]), { ok: false, error: P.PLACES_REFUSAL.body });
    assert.equal(P.PLACES_REFUSAL.notANumber, TIMES.places);
  });

  test("the site's rule for a group's capacity, in its own sentences, and nothing written", async () => {
    const before = everything();
    assert.deepEqual(short(await places("zach", B, 0)), [400, TIMES.places]);
    assert.deepEqual(short(await places("zach", B, 41)), [400, groupCapacityError(41, "admissions")]);
    assert.deepEqual(short(await places("zach", B, 6.5)), [400, groupCapacityError(6.5, "admissions")]);
    assert.equal(everything(), before);
    // An open-enrolment run takes no "no limit", in groupCapacityError's sentence.
    world.db.poke(`courseRuns/${RUN.agi}`, { enrolMode: "open" });
    assert.deepEqual(short(await places("zach", B, null)), [400, groupCapacityError(null, "open")]);
  });

  test("never below the people in the group, as the Groups tab counts them: Nina, who left, and the stored counter do not count", async () => {
    world.db.poke(`courseGroups/${B}`, { memberCount: 1 });
    const before = everything();
    const refused = await places("zach", B, 3);
    assert.deepEqual(short(refused), [409, "Group B has 4 people in it, so its places can’t go below 4. Move somebody out first, or set 4 or more."]);
    assert.equal(everything(), before);
    const at = await places("zach", B, 4);
    assert.equal(at.status, 200, JSON.stringify(at.body));
    assert.equal(stored().capacity, 4);
    assert.ok(stored().updatedAt instanceof Date);
    // No limit is never below anybody.
    const open = await places("claudia", B, null);
    assert.deepEqual([open.status, open.body.message], [200, "Group B now has no limit. Nobody was emailed."]);
    assert.equal(stored().capacity, null);
    // Each change wrote one row of the group's History, who, from what and to what, emailing nobody.
    assert.deepEqual(
      historyRows("group-places-changed").map((row) => [row.groupId, row.actorUid, row.detail, row.before.places, row.after.places, row.emailed]),
      [
        [B, "zach", "Changed the places from 8 to 4.", 8, 4, 0],
        [B, "claudia", "Changed the places from 4 to no limit.", 4, null, 0],
      ],
    );
    assert.deepEqual(world.mail, []);
  });

  test("the number it already has writes nothing", async () => {
    const before = everything();
    const same = await places("zach", B, 8);
    assert.deepEqual([same.status, same.body.changed, same.body.message], [200, false, "Group B now takes 8. Nobody was emailed."]);
    assert.equal(everything(), before);
  });

  test("a group already below its people (places 1, four in it) reads true, and only a number at least its people, or no limit, saves", async () => {
    world.db.poke(`courseGroups/${B}`, { capacity: 1 });
    // The page's row and the panel's hint read true.
    const view = await read();
    assert.deepEqual(view.places, { capacity: 1, inGroup: 4, freedOffers: 0 });
    assert.equal(P.placesRowWords(view.places.capacity, view.places.inGroup), "1 place · 4 in the group");
    assert.equal(P.placesHint("Group B", view.places), "Leave it empty for no limit. Group B has 4 people in it, so it can’t be fewer than 4.");
    // A save that leaves the number as it is is refused too, and so is anything below four.
    const before = everything();
    for (const number of [1, 2, 3]) {
      assert.deepEqual(short(await places("claudia", B, number)), [409, P.belowFloorWords("Group B", { inGroup: 4, freedOffers: 0 })], String(number));
    }
    assert.equal(everything(), before);
    assert.equal((await places("claudia", B, 4)).status, 200);
    world.db.poke(`courseGroups/${B}`, { capacity: 1 });
    assert.equal((await places("claudia", B, null)).status, 200);
    assert.equal(stored().capacity, null);
  });

  test("a freed place offered in the group and not answered holds a seat; one answered, or withdrawn, does not", async () => {
    world.db.seed(applicationPath("wen"), offeredOn(B));
    const view = await read();
    assert.deepEqual(view.places, { capacity: 8, inGroup: 4, freedOffers: 1 });
    assert.equal(P.placesHint("Group B", view.places), "Leave it empty for no limit. Group B has 4 people in it and 1 freed place offered, so it can’t be fewer than 5.");
    const before = everything();
    assert.deepEqual(
      short(await places("zach", B, 4)),
      [409, "Group B has 4 people in it and 1 freed place offered, so its places can’t go below 5. Move somebody out first, or set 5 or more."],
    );
    assert.equal(everything(), before);
    assert.equal((await places("zach", B, 5)).status, 200);
    for (const over of [
      { invitation: { programmeId: "agi-strategy", replyBy: "2026-11-25", response: "declined", respondedAt: new Date("2026-11-19T09:00:00Z"), lastReminderOn: null } },
      { status: "withdrawn" },
    ]) {
      w.reset(seed());
      world.db.seed(applicationPath("wen"), offeredOn(B, over));
      assert.equal((await places("zach", B, 4)).status, 200, JSON.stringify(over));
    }
    // An offer in another group's name is that group's.
    w.reset(seed());
    world.db.seed(applicationPath("wen"), offeredOn(C));
    assert.equal((await places("zach", B, 4)).status, 200);
  });

  test("the words with nobody in it, with one, and with offers alone", () => {
    assert.equal(P.placesHint("Group D", { inGroup: 0, freedOffers: 0 }), "Leave it empty for no limit.");
    assert.equal(P.placesHint("Group D", { inGroup: 1, freedOffers: 0 }), "Leave it empty for no limit. Group D has 1 person in it, so it can’t be fewer than 1.");
    assert.equal(P.placesHint("Group D", { inGroup: 0, freedOffers: 2 }), "Leave it empty for no limit. Group D has 2 freed places offered, so it can’t be fewer than 2.");
    assert.equal(P.placesRowWords(null, 6), "No limit · 6 in the group");
    assert.equal(P.placesRowWords(8, 6), "8 places · 6 in the group");
    assert.equal(P.placesSavedWords("Group C", 10), "Group C now takes 10. Nobody was emailed.");
    assert.equal(P.placesHistoryWords(null, 8), "Changed the places from no limit to 8.");
  });

  test("a group that is not the run's, or is archived, is refused", async () => {
    world.db.poke(`courseGroups/${C}`, { runId: RUN.tais });
    assert.deepEqual(short(await places("zach", C, 6)), [404, P.PLACES_REFUSAL.noGroup]);
    assert.deepEqual(short(await places("zach", "no-such-group", 6)), [404, P.PLACES_REFUSAL.noGroup]);
    world.db.poke(`courseGroups/${B}`, { archived: true });
    const before = everything();
    assert.deepEqual(short(await places("zach", B, 6)), [409, P.PLACES_REFUSAL.archived]);
    assert.equal(everything(), before);
  });
});

// ---------------------------------------------------------------------------
// 3. Name
// ---------------------------------------------------------------------------

describe("3. a group's name", () => {
  test("the body: trimmed and its spaces folded; blank and too long in the older card's and Times' own sentences", () => {
    assert.deepEqual(set.parseNameBody({ name: "  Wednesday   afternoons " }), { ok: true, value: "Wednesday afternoons" });
    assert.deepEqual(set.parseNameBody({ name: " \t " }), { ok: false, error: "Give the group a name." });
    assert.deepEqual(set.parseNameBody({ name: 7 }), { ok: false, error: "Give the group a name." });
    assert.deepEqual(set.parseNameBody({ name: "x".repeat(81) }), { ok: false, error: "A group’s name can be at most 80 characters." });
    assert.deepEqual(set.parseNameBody({ name: "x".repeat(80) }), { ok: true, value: "x".repeat(80) });
    assert.deepEqual(set.parseNameBody({ name: "Group E", tell: true }), { ok: false, error: P.NAME_REFUSAL.body });
    // The older card says the blank one the same way.
    const card = readFileSync(join(SRC, "features", "courses", "GroupEditor.tsx"), "utf8");
    assert.ok(card.includes('setError("Give the group a name.")'));
  });

  test("a rename writes the name, the stamp and one History row, says what it did, and emails nobody", async () => {
    const answer = await rename("claudia", B, "  Wednesday   afternoons ");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, {
      ok: true,
      changed: true,
      groupId: B,
      groupName: "Wednesday afternoons",
      message: "Group B is now Wednesday afternoons. Nobody was emailed.",
    });
    assert.equal(stored().name, "Wednesday afternoons");
    assert.ok(stored().updatedAt instanceof Date);
    assert.deepEqual(
      historyRows("group-renamed").map((row) => [row.groupId, row.actorUid, row.detail, row.before.name, row.after.name, row.emailed]),
      [[B, "claudia", "Renamed Group B to Wednesday afternoons.", "Group B", "Wednesday afternoons", 0]],
    );
    assert.deepEqual(world.mail, []);
    // The name it has writes nothing; a change of case alone is a rename.
    const before = everything();
    assert.equal((await rename("claudia", B, "Wednesday afternoons")).body.changed, false);
    assert.equal(everything(), before);
    assert.equal((await rename("claudia", B, "wednesday afternoons")).body.changed, true);
  });

  test("another live group's name is refused, compared as Add a group compares; an archived group's is free", async () => {
    const before = everything();
    for (const name of ["Group A", "group a", "  GROUP   A "]) {
      assert.deepEqual(short(await rename("zach", B, name)), [409, "Group A is already one of this run’s groups. Give Group B another name."], name);
    }
    assert.equal(everything(), before);
    world.db.poke(`courseGroups/${A}`, { archived: true });
    assert.equal((await rename("zach", B, "Group A")).status, 200);
    assert.equal(stored().name, "Group A");
  });

  test("a group that is not the run's, or is archived, is refused", async () => {
    world.db.poke(`courseGroups/${C}`, { runId: RUN.tais });
    assert.deepEqual(short(await rename("zach", C, "Group Z")), [404, P.NAME_REFUSAL.noGroup]);
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.deepEqual(short(await rename("zach", B, "Group Z")), [409, P.NAME_REFUSAL.archived]);
    assert.equal(stored().name, "Group B");
  });
});

// ---------------------------------------------------------------------------
// 4. The transaction decides on what it read
// ---------------------------------------------------------------------------

describe("4. the transaction decides on what it read", () => {
  test("somebody placed in the group between the first read and the write is counted, and the places are not lowered past them", async () => {
    world.db.beforeCommit = () => world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { groupId: B });
    const answer = await places("zach", B, 4);
    assert.deepEqual(short(answer), [409, "Group B has 5 people in it, so its places can’t go below 5. Move somebody out first, or set 5 or more."]);
    assert.equal(stored().capacity, 8);
    assert.deepEqual(historyRows("group-places-changed"), []);
  });

  test("another group given the name between the first read and the write is answered, not renamed over", async () => {
    world.db.beforeCommit = () => world.db.poke(`courseGroups/${A}`, { name: "Wednesday afternoons" });
    const answer = await rename("zach", B, "Wednesday afternoons");
    assert.deepEqual(short(answer), [409, "Wednesday afternoons is already one of this run’s groups. Give Group B another name."]);
    assert.equal(stored().name, "Group B");
    assert.deepEqual(historyRows("group-renamed"), []);
  });
});

// ---------------------------------------------------------------------------
// 5. The page
// ---------------------------------------------------------------------------

const text = (html) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function draw(who) {
  world.user = { ...w.sessionOf(who), admissionsReviewer: world.db.read(`users/${who}`)?.admissionsReviewer === true };
  world.course = true;
  const element = await ProgrammeGroupPage({ params: Promise.resolve(params(B)), searchParams: Promise.resolve({}) });
  const html = renderToStaticMarkup(element);
  world.course = false;
  return { html, text: text(html) };
}

const { loadGroupPage } = await loadTs("lib/courses/groupPage/load.ts");
const { normalizeCourseRun } = await loadTs("lib/firestore/courses.ts");
const { normalizeCourseGroup } = await loadTs("lib/firestore/courseGroups.ts");
function read(viewer = "admin", viewerUid = "zach") {
  return loadGroupPage(world.courseDb, {
    run: normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`)),
    group: normalizeCourseGroup(B, world.db.read(`courseGroups/${B}`)),
    viewer,
    viewerUid,
    now: new Date(NOW),
  });
}

describe("5. the group's page: six rows, and History's new filter", () => {
  test("How Group B meets has six rows in order, Length folded into Day and time, then Archive", async () => {
    for (const who of ["zach", "claudia"]) {
      const drawn = await draw(who);
      assert.ok(drawn.text.includes("Leads and admins change all of this. Facilitators change one week and set the link."), who);
      const at = (said) => drawn.text.indexOf(said);
      const order = [
        "Day and time Tuesdays, 6pm to 8pm · 2 hours Change",
        "Room ",
        "Meeting link ",
        "Facilitators Rahul",
        "Places 8 places · 4 in the group Change",
        "Name Group B Rename",
        "Archive",
      ];
      for (const said of order) assert.ok(at(said) >= 0, `${who}: missing "${said}" in ${drawn.text.slice(0, 900)}`);
      const indexes = order.map(at);
      assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b), `${who}: the rows are out of order`);
      assert.doesNotMatch(drawn.text, /Length 2 hours/, "the Length row folded into Day and time");
      assert.ok(drawn.html.includes('aria-label="Change: Places"'));
    }
  });

  test("the facilitator's page is handed no places, and the routes' addresses are the page's", async () => {
    assert.equal((await read("facilitator", "rahul")).places, null);
    const page = readFileSync(join(SRC, ADMIN_GROUP, "page.tsx"), "utf8");
    assert.match(page, /placesPath: `\$\{groupApi\}\/places`/);
    assert.match(page, /namePath: `\$\{groupApi\}\/name`/);
  });

  test("History: Name and places second, the two kinds under it, the empty sentences the board's", async () => {
    assert.deepEqual(pageWords.HISTORY_FILTERS.map((each) => each.label), ["Everything", "Name and places", "Time and room", "People", "Link", "Registers"]);
    assert.equal(audit.courseAuditCategory("group-places-changed"), "name-and-places");
    assert.equal(audit.courseAuditCategory("group-renamed"), "name-and-places");
    assert.equal(audit.courseAuditCategory("group-room-changed"), "time-and-room");
    assert.equal(
      pageWords.NO_HISTORY_LINE,
      "Nothing has changed yet. Each change to the group’s name, places, time, room, link or people is kept here from the day it’s made.",
    );
    assert.equal(pageWords.nothingUnderWords("Name and places"), "Nothing under Name and places yet.");
    await places("claudia", B, 10);
    w.at(new Date(NOW.getTime() + 60_000));
    await rename("zach", B, "Wednesday afternoons");
    const view = await read();
    const mine = model.filterHistory(view.history.rows, "name-and-places");
    assert.deepEqual(
      mine.map((row) => [row.actorName, row.headline]),
      [
        [CAST.zach.displayName, "Renamed Group B to Wednesday afternoons."],
        [CAST.claudia.displayName, "Changed the places from 8 to 10."],
      ],
    );
    assert.deepEqual(model.filterHistory(view.history.rows, "time-and-room"), []);
  });

  test("the panels' words, word for word", () => {
    assert.equal(P.placesPanelTitle("Group C"), "Change Group C’s places");
    assert.equal(P.placesLede("Group C"), "How many people Group C takes. People are placed up to this number, and Group C shows Full when it’s reached.");
    assert.equal(P.placesOwnLimitNote("Group C"), "This is Group C’s own limit. What the programme’s public page says about places is set on Settings, under Dates and places.");
    assert.equal(P.EMAILS_NOBODY, "This emails nobody.");
    assert.equal(P.SAVE_PLACES, "Save places");
    assert.equal(P.belowFloorWords("Group C", { inGroup: 6, freedOffers: 0 }), "Group C has 6 people in it, so its places can’t go below 6. Move somebody out first, or set 6 or more.");
    assert.equal(P.renamePanelTitle("Group C"), "Rename Group C");
    assert.equal(P.NAME_FIELD, "Group name");
    assert.equal(P.NAME_HINT, "The name shows in every email, register and calendar entry from now on. Nobody is emailed about the change.");
    assert.equal(P.SAVE_THE_NAME, "Save the name");
    assert.equal(P.nameTakenWords("Group B", "Group C"), "Group B is already one of this run’s groups. Give Group C another name.");
    assert.equal(P.renamedWords("Group C", "Wednesday afternoons"), "Group C is now Wednesday afternoons. Nobody was emailed.");
  });
});
