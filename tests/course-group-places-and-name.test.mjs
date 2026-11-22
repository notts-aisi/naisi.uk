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
 * and Group C beside it. The cast: the programme's lead, its reviewer, the
 * lead of another programme, the run's track lead, an admin, and a course
 * approver who leads nothing, each a fixture of the world.
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
 *     plus the seats freed places hold in it (offered and not answered, or
 *     accepted by somebody not placed yet, as `waitingOnGroups` counts them);
 *     a group already
 *     below its people (the live site has one) reads true, opens, and is
 *     refused every save but one at least its people or no limit, a save of
 *     the number it has included. Each change writes `capacity`, `updatedAt`
 *     and one History row, and emails nobody; a save that changes nothing
 *     writes nothing and answers no sentence.
 *  3. NAME: trimmed and its spaces folded; blank and too long refused in the
 *     older card's and Times' own sentences; another live group's name
 *     refused, compared as Add a group compares; an archived group's name is
 *     free. Each change writes `name`, `updatedAt` and one History row, and
 *     emails nobody.
 *  4. THE TRANSACTION decides on what it read: a person placed in the group,
 *     and a group renamed, between the first read and the write.
 *  5. THE PAGE: six rows in their order, laid out as rows (label, value,
 *     button, ruled between; on a phone the label above), Places and Name
 *     with their buttons, the line under the heading; both panels with Close
 *     in the head and the hint under the field; History's Name and places
 *     filter and its empty sentence.
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
/** The world's one admin, by role. */
const ADMIN = Object.keys(CAST).find((uid) => CAST[uid].role === "admin");

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
    assert.equal((await places(ADMIN, B, 6, { viewAs: true })).status, 403);
    assert.equal((await rename(ADMIN, B, "Wednesday afternoons", { viewAs: true })).status, 403);
    assert.deepEqual(short(await places("nobody", B, null, { body: { places: "six" } })), [400, P.PLACES_REFUSAL.notANumber]);
    assert.deepEqual(short(await places("nobody", B, null, { body: { places: 6, tell: true } })), [400, P.PLACES_REFUSAL.body]);
    assert.deepEqual(short(await rename("nobody", B, "   ")), [400, P.NAME_REFUSAL.blank]);
    assert.equal(everything(), before);
  });

  test("the programme's lead and an admin change both, and nobody is emailed", async () => {
    for (const [who, number, name] of [
      [ADMIN, 6, "Tuesday evenings"],
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
    assert.deepEqual(short(await places(ADMIN, B, 0)), [400, TIMES.places]);
    assert.deepEqual(short(await places(ADMIN, B, 41)), [400, groupCapacityError(41, "admissions")]);
    assert.deepEqual(short(await places(ADMIN, B, 6.5)), [400, groupCapacityError(6.5, "admissions")]);
    assert.equal(everything(), before);
    // An open-enrolment run takes no "no limit", in groupCapacityError's sentence.
    world.db.poke(`courseRuns/${RUN.agi}`, { enrolMode: "open" });
    assert.deepEqual(short(await places(ADMIN, B, null)), [400, groupCapacityError(null, "open")]);
  });

  test("never below the people in the group, as the Groups tab counts them: Nina, who left, and the stored counter do not count", async () => {
    world.db.poke(`courseGroups/${B}`, { memberCount: 1 });
    const before = everything();
    const refused = await places(ADMIN, B, 3);
    assert.deepEqual(short(refused), [409, "Group B has 4 people in it, so its places can’t go below 4. Move somebody out first, or set 4 or more."]);
    assert.equal(everything(), before);
    const at = await places(ADMIN, B, 4);
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
        [B, ADMIN, "Changed the places from 8 to 4.", 8, 4, 0],
        [B, "claudia", "Changed the places from 4 to no limit.", 4, null, 0],
      ],
    );
    assert.deepEqual(world.mail, []);
  });

  test("the number it already has writes nothing", async () => {
    const before = everything();
    const same = await places(ADMIN, B, 8);
    // No sentence: the panel closes and the page says nothing.
    assert.deepEqual([same.status, same.body.changed, same.body.message], [200, false, ""]);
    assert.equal(everything(), before);
  });

  test("a group already below its people (places 1, four in it) reads true, and only a number at least its people, or no limit, saves", async () => {
    world.db.poke(`courseGroups/${B}`, { capacity: 1 });
    // The page's row and the panel's hint read true.
    const view = await read();
    assert.deepEqual(view.places, { capacity: 1, inGroup: 4, heldSeats: 0, noLimitAllowed: true });
    assert.equal(P.placesRowWords(view.places.capacity, view.places.inGroup), "1 place · 4 in the group");
    assert.equal(P.placesHint("Group B", view.places), "Leave it empty for no limit. Group B has 4 people in it, so it can’t be fewer than 4.");
    // A save that leaves the number as it is is refused too, and so is anything below four.
    const before = everything();
    for (const number of [1, 2, 3]) {
      assert.deepEqual(short(await places("claudia", B, number)), [409, P.belowFloorWords("Group B", { inGroup: 4, heldSeats: 0 })], String(number));
    }
    assert.equal(everything(), before);
    assert.equal((await places("claudia", B, 4)).status, 200);
    world.db.poke(`courseGroups/${B}`, { capacity: 1 });
    assert.equal((await places("claudia", B, null)).status, 200);
    assert.equal(stored().capacity, null);
  });

  test("a freed place offered in the group and not answered holds a seat; one declined, or withdrawn, does not", async () => {
    world.db.seed(applicationPath("wen"), offeredOn(B));
    const view = await read();
    assert.deepEqual(view.places, { capacity: 8, inGroup: 4, heldSeats: 1, noLimitAllowed: true });
    assert.equal(
      P.placesHint("Group B", view.places, view.places.noLimitAllowed),
      "Leave it empty for no limit. Group B has 4 people in it and 1 freed place offered or accepted, so it can’t be fewer than 5.",
    );
    const before = everything();
    assert.deepEqual(
      short(await places(ADMIN, B, 4)),
      [409, "Group B has 4 people in it and 1 freed place offered or accepted, so its places can’t go below 5."],
    );
    assert.equal(everything(), before);
    assert.equal((await places(ADMIN, B, 5)).status, 200);
    for (const over of [
      { invitation: { programmeId: "agi-strategy", replyBy: "2026-11-25", response: "declined", respondedAt: new Date("2026-11-19T09:00:00Z"), lastReminderOn: null } },
      { status: "withdrawn" },
    ]) {
      w.reset(seed());
      world.db.seed(applicationPath("wen"), offeredOn(B, over));
      assert.equal((await places(ADMIN, B, 4)).status, 200, JSON.stringify(over));
    }
    // An offer in another group's name is that group's.
    w.reset(seed());
    world.db.seed(applicationPath("wen"), offeredOn(C));
    assert.equal((await places(ADMIN, B, 4)).status, 200);
  });

  test("a freed place accepted by somebody not placed yet holds a seat too, until they are placed", async () => {
    const accepted = { invitation: { programmeId: "agi-strategy", replyBy: "2026-11-25", response: "accepted", respondedAt: new Date("2026-11-19T09:00:00Z"), lastReminderOn: null } };
    world.db.seed(applicationPath("wen"), offeredOn(B, accepted));
    assert.equal((await read()).places.heldSeats, 1);
    assert.deepEqual(
      short(await places(ADMIN, B, 4)),
      [409, "Group B has 4 people in it and 1 freed place offered or accepted, so its places can’t go below 5."],
    );
    // Once Wen is placed in a group on the run, the seat is the place: counted with the people of the group it is in.
    world.db.seed(`courseEnrolments/${RUN.agi}__wen`, { ...world.db.read(`courseEnrolments/${RUN.agi}__amara`), uid: "wen", groupId: A, status: "active" });
    assert.equal((await read()).places.heldSeats, 0);
    assert.equal((await places(ADMIN, B, 4)).status, 200);
  });

  test("seats held with nobody in the group: the refusal says only what is true", async () => {
    for (const path of world.db.paths().filter((each) => each.startsWith("courseEnrolments/"))) {
      if (world.db.read(path).groupId === B) world.db.poke(path, { groupId: A });
    }
    // Two freed places offered in Group B's name, on Wen's application and Dev's.
    world.db.seed(applicationPath("wen"), offeredOn(B));
    world.db.seed(applicationPath("dev"), { ...offeredOn(B), uid: "dev" });
    assert.equal((await read()).places.inGroup, 0);
    const answer = await places(ADMIN, B, 1);
    assert.deepEqual(short(answer), [409, "Group B has 2 freed places offered or accepted, so its places can’t go below 2."]);
    assert.doesNotMatch(answer.body.error, /Move somebody out/);
  });

  test("an open-enrolment run's hint does not offer no limit", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { enrolMode: "open" });
    const view = await read();
    assert.equal(view.places.noLimitAllowed, false);
    assert.equal(P.placesHint("Group B", view.places, view.places.noLimitAllowed), "Group B has 4 people in it, so it can’t be fewer than 4.");
    assert.equal(P.placesHint("Group D", { inGroup: 0, heldSeats: 0 }, false), "");
  });

  test("the words with nobody in it, with one, and with held seats alone", () => {
    assert.equal(P.placesHint("Group D", { inGroup: 0, heldSeats: 0 }), "Leave it empty for no limit.");
    assert.equal(P.placesHint("Group D", { inGroup: 1, heldSeats: 0 }), "Leave it empty for no limit. Group D has 1 person in it, so it can’t be fewer than 1.");
    assert.equal(P.placesHint("Group D", { inGroup: 0, heldSeats: 2 }), "Leave it empty for no limit. Group D has 2 freed places offered or accepted, so it can’t be fewer than 2.");
    assert.equal(P.belowFloorWords("Group C", { inGroup: 6, heldSeats: 2 }), "Group C has 6 people in it and 2 freed places offered or accepted, so its places can’t go below 8.");
    assert.equal(P.belowFloorWords("Group D", { inGroup: 0, heldSeats: 2 }), "Group D has 2 freed places offered or accepted, so its places can’t go below 2.");
    assert.equal(P.placesRowWords(null, 6), "No limit · 6 in the group");
    assert.equal(P.placesRowWords(8, 6), "8 places · 6 in the group");
    assert.equal(P.placesSavedWords("Group C", 10), "Group C now takes 10. Nobody was emailed.");
    assert.equal(P.placesHistoryWords(null, 8), "Changed the places from no limit to 8.");
  });

  test("a group that is not the run's, or is archived, is refused", async () => {
    world.db.poke(`courseGroups/${C}`, { runId: RUN.tais });
    assert.deepEqual(short(await places(ADMIN, C, 6)), [404, P.PLACES_REFUSAL.noGroup]);
    assert.deepEqual(short(await places(ADMIN, "no-such-group", 6)), [404, P.PLACES_REFUSAL.noGroup]);
    world.db.poke(`courseGroups/${B}`, { archived: true });
    const before = everything();
    assert.deepEqual(short(await places(ADMIN, B, 6)), [409, P.PLACES_REFUSAL.archived]);
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
    // The name it has, once trimmed and folded, writes nothing and answers no sentence; a change of case alone is a rename.
    const before = everything();
    for (const same of ["Wednesday afternoons", "  Wednesday   afternoons "]) {
      const answer = await rename("claudia", B, same);
      assert.deepEqual([answer.status, answer.body.changed, answer.body.message], [200, false, ""], same);
    }
    world.db.poke(`courseGroups/${B}`, { name: "Wednesday  afternoons" });
    const spaced = everything();
    assert.equal((await rename("claudia", B, "Wednesday afternoons")).body.changed, false, "a stored name with doubled spaces is the same name");
    assert.equal(everything(), spaced);
    world.db.poke(`courseGroups/${B}`, { name: "Wednesday afternoons" });
    assert.equal(everything(), before);
    assert.equal((await rename("claudia", B, "wednesday afternoons")).body.changed, true);
  });

  test("another live group's name is refused, compared as Add a group compares; an archived group's is free", async () => {
    const before = everything();
    for (const name of ["Group A", "group a", "  GROUP   A "]) {
      assert.deepEqual(short(await rename(ADMIN, B, name)), [409, "Group A is already one of this run’s groups. Give Group B another name."], name);
    }
    assert.equal(everything(), before);
    world.db.poke(`courseGroups/${A}`, { archived: true });
    assert.equal((await rename(ADMIN, B, "Group A")).status, 200);
    assert.equal(stored().name, "Group A");
  });

  test("a group that is not the run's, or is archived, is refused", async () => {
    world.db.poke(`courseGroups/${C}`, { runId: RUN.tais });
    assert.deepEqual(short(await rename(ADMIN, C, "Group Z")), [404, P.NAME_REFUSAL.noGroup]);
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.deepEqual(short(await rename(ADMIN, B, "Group Z")), [409, P.NAME_REFUSAL.archived]);
    assert.equal(stored().name, "Group B");
  });
});

// ---------------------------------------------------------------------------
// 4. The transaction decides on what it read
// ---------------------------------------------------------------------------

describe("4. the transaction decides on what it read", () => {
  test("somebody placed in the group between the first read and the write is counted, and the places are not lowered past them", async () => {
    world.db.beforeCommit = () => world.db.poke(`courseEnrolments/${RUN.agi}__bea`, { groupId: B });
    const answer = await places(ADMIN, B, 4);
    assert.deepEqual(short(answer), [409, "Group B has 5 people in it, so its places can’t go below 5. Move somebody out first, or set 5 or more."]);
    assert.equal(stored().capacity, 8);
    assert.deepEqual(historyRows("group-places-changed"), []);
  });

  test("another group given the name between the first read and the write is answered, not renamed over", async () => {
    world.db.beforeCommit = () => world.db.poke(`courseGroups/${A}`, { name: "Wednesday afternoons" });
    const answer = await rename(ADMIN, B, "Wednesday afternoons");
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
function read(viewer = "admin", viewerUid = ADMIN) {
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
    for (const who of [ADMIN, "claudia"]) {
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

  test("History: Name and places second, the two kinds under it, and both empty sentences", async () => {
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
    await rename(ADMIN, B, "Wednesday afternoons");
    const view = await read();
    const mine = model.filterHistory(view.history.rows, "name-and-places");
    assert.deepEqual(
      mine.map((row) => [row.actorName, row.headline]),
      [
        [CAST[ADMIN].displayName, "Renamed Group B to Wednesday afternoons."],
        [CAST.claudia.displayName, "Changed the places from 8 to 10."],
      ],
    );
    assert.deepEqual(model.filterHistory(view.history.rows, "time-and-room"), []);
  });

  test("both panels have Close in the head, the hint under the field, and Rename's refusal under its hint", async () => {
    const { default: PlacesPanel } = await loadTs(join("features", "courses", "groupPage", "PlacesPanel.tsx"));
    const { default: NamePanel } = await loadTs(join("features", "courses", "groupPage", "NamePanel.tsx"));
    const noop = () => {};
    const placesHtml = renderToStaticMarkup(
      createElement(PlacesPanel, {
        groupName: "Group B",
        places: { capacity: 8, inGroup: 4, heldSeats: 0, noLimitAllowed: true },
        placesPath: "/api/places",
        onClose: noop,
        onDone: noop,
      }),
    );
    const placesText = text(placesHtml);
    assert.match(placesText, /^Change Group B’s places Close How many people Group B takes/, placesText);
    const at = (said, html = placesHtml) => html.indexOf(said);
    assert.ok(at("<input") > at(">Places</label>") && at("<input") < at("Leave it empty for no limit."), "label, field, then hint");
    assert.ok(at("Leave it empty for no limit.") < at("This is Group B’s own limit."), "the hint before the note");
    const nameHtml = renderToStaticMarkup(createElement(NamePanel, { groupName: "Group B", namePath: "/api/name", onClose: noop, onDone: noop }));
    assert.match(text(nameHtml), /^Rename Group B Close Group name/);
    assert.ok(at("<input", nameHtml) < at(P.NAME_HINT, nameHtml), "the field, then the hint");
    // Rename's refusal is drawn after the hint; Places' stands where the hint was, under the field.
    const nameSource = readFileSync(join(SRC, "features", "courses", "groupPage", "NamePanel.tsx"), "utf8");
    assert.ok(nameSource.indexOf("{P.NAME_HINT}") < nameSource.indexOf("{problem}"), "Rename's refusal under its hint");
    const placesSource = readFileSync(join(SRC, "features", "courses", "groupPage", "PlacesPanel.tsx"), "utf8");
    assert.ok(placesSource.indexOf("<Input") < placesSource.indexOf("{problem}"), "Places' refusal under the field");
    // A number field the browser cannot read reads as empty: it is refused in the panel, never sent as no limit.
    assert.match(placesSource, /setBadInput\(e\.target\.validity\?\.badInput === true\)/);
    assert.match(placesSource, /if \(badInput\) \{\n\s+setProblem\(P\.PLACES_REFUSAL\.notANumber\);\n\s+return;/);
    // A save that changed nothing closes the panel and says nothing.
    assert.match(placesSource, /onDone\(body\.changed === false \? null :/);
    assert.match(nameSource, /onDone\(body\.changed === false \? null :/);
  });

  test("How the group meets is rows: label, value and button side by side, ruled between; on a phone the label above", () => {
    const css = readFileSync(join(SRC, "features", "courses", "groupPage", "GroupPage.module.css"), "utf8");
    const rule = (selector, from = 0) => {
      const at = css.indexOf(`${selector} {`, from);
      assert.ok(at >= 0, `no rule for ${selector}`);
      return css.slice(at, css.indexOf("}", at));
    };
    assert.match(rule(".meets"), /flex-direction: column;/);
    assert.doesNotMatch(css, /\.meets \{[^}]*auto-fit/, "the grid of tiles is gone");
    const row = rule(".meetsItem");
    assert.match(row, /grid-template-columns: 11rem minmax\(0, 1fr\) auto;/);
    assert.match(row, /border-top: 1px solid var\(--color-border\);/);
    assert.match(rule(".meetsItem:first-child"), /border-top: 0;/);
    assert.match(rule(".meetsAction"), /justify-content: flex-end;/);
    const phone = css.indexOf("@media (max-width: 36rem)");
    assert.ok(phone >= 0);
    const phoneRow = rule(".meetsItem", phone);
    assert.match(phoneRow, /grid-template-columns: minmax\(0, 1fr\) auto;/);
    assert.match(phoneRow, /"label label"\s+"value action";/);
    // The buttons keep their 44px.
    assert.match(rule(".button,\n.buttonPrimary"), /min-height: 2\.75rem;/);
  });

  test("the panels' words, word for word", () => {
    assert.equal(P.placesPanelTitle("Group C"), "Change Group C’s places");
    assert.equal(P.placesLede("Group C"), "How many people Group C takes. People are placed up to this number, and Group C shows Full when it’s reached.");
    assert.equal(P.placesOwnLimitNote("Group C"), "This is Group C’s own limit. What the programme’s public page says about places is set on Settings, under Dates and places.");
    assert.equal(P.EMAILS_NOBODY, "This emails nobody.");
    assert.equal(P.SAVE_PLACES, "Save places");
    assert.equal(P.belowFloorWords("Group C", { inGroup: 6, heldSeats: 0 }), "Group C has 6 people in it, so its places can’t go below 6. Move somebody out first, or set 6 or more.");
    assert.equal(P.renamePanelTitle("Group C"), "Rename Group C");
    assert.equal(P.NAME_FIELD, "Group name");
    assert.equal(P.NAME_HINT, "The name shows in every email, register and calendar entry from now on. Nobody is emailed about the change.");
    assert.equal(P.SAVE_THE_NAME, "Save the name");
    assert.equal(P.nameTakenWords("Group B", "Group C"), "Group B is already one of this run’s groups. Give Group C another name.");
    assert.equal(P.renamedWords("Group C", "Wednesday afternoons"), "Group C is now Wednesday afternoons. Nobody was emailed.");
  });
});
