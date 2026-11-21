/**
 * Four things carried over from the last review of one-week visits, each
 * mended and held here.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *  1. CHANGE A SESSION'S PANEL asks for its preview again after a 409 that
 *     carries the visit emails (`visitEmails`), as the register's correction
 *     sheet does, so a press after the visits changed is not refused for ever
 *     (`afterChangeRefused`, `src/features/courses/groupPage/changeRefused.ts`).
 *  2. THE COLUMN ROUTE'S HEADER no longer says a correction emails nobody: It
 *     didn't happen tells the people visiting the session.
 *  3. ONE RULE for "does the visit card offer Can't make it": the page's
 *     (`cardAsksFor` beside `facilitatesGroup`), asked by the staff call-off's
 *     sentence and by the reminders, on the group the place is in NOW and the
 *     standing behind the role.
 *  4. WITHDRAWN WITH THE VISIT IS KEPT PER WEEK: a week of the same request the
 *     person withdrew themselves never reads as withdrawn with the visit, on
 *     the Requests page or on their own list; a request stored with the flag
 *     on the whole request reads as it always did.
 *
 * The world is week 3 of AGI Strategy's run (`tests/lib/leavingWorld.mjs`):
 * Tue 17 Nov 2026 at noon.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { A, AGI, NOW, ROUND, RUN, makeLeavingWorld } from "./lib/leavingWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const source = (...parts) => readFileSync(join(SRC, ...parts), "utf8");

const w = await makeLeavingWorld("__visitCarriedFixes");
const { world, call } = w;
const visitRoute = await w.formRoute("programmes", "[programmeId]", "people", "[uid]", "visit");
const askRoute = await w.courseRoute("groups", "[groupId]", "excused");
const { afterChangeRefused } = await w.loadTs(join("features", "courses", "groupPage", "changeRefused.ts"));
const { cardAsksFor } = await w.loadTs(join("lib", "courses", "cantMakeIt", "seat.ts"));
const { normalizeExcusedRequest } = await w.loadTs(join("lib", "firestore", "courseExcusedRequests.ts"));
const { excusedFor } = await w.loadTs(join("lib", "courses", "excused", "own.ts"));
const { loadExcusedRequestPage } = await w.loadTs(join("lib", "courses", "excused", "page.ts"));
const enrolments = await w.loadTs(join("lib", "firestore", "courseEnrolments.ts"));
const { normalizeCourseRun } = await w.loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await w.loadTs(join("lib", "firestore", "courseGroups.ts"));
const { readVisitFacts, dbReader, standingVisits } = await w.loadTs(join("lib", "courses", "visit", "plan.ts"));

const read = (path) => world.db.read(path);
const seatPath = (uid) => `courseEnrolments/${RUN.agi}__${uid}`;
const visit = (who, uid, body) => call(who, visitRoute.POST, { roundId: ROUND, programmeId: AGI, uid }, { body, course: true });
async function arrange(uid, weekNumber, hostGroupId) {
  const shown = await visit("zach", uid, { weekNumber, hostGroupId, preview: true });
  assert.equal(shown.status, 200, JSON.stringify(shown.body));
  const saved = await visit("zach", uid, { weekNumber, hostGroupId, emailCount: shown.body.preview.emails, overLimit: shown.body.preview.overLimit !== null });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
}
/** Staff call a visit off as the page does: the count its standing visit shows sent back. */
async function callOff(uid, weekNumber) {
  const read_ = await readVisitFacts(dbReader(world.courseDb), world.courseDb, RUN.agi, uid, "ahead", new Date());
  assert.equal(read_.ok, true, JSON.stringify(read_));
  const standing = standingVisits(read_.facts, "zach", new Date()).find((each) => each.weekNumber === weekNumber);
  assert.ok(standing, `no standing visit in week ${weekNumber}`);
  return visit("zach", uid, { weekNumber, callOff: true, emailCount: standing.emails });
}
const requestPaths = () => world.db.paths().filter((path) => /^courseRequests\/[^/]+$/.test(path));

beforeEach(() => {
  mock.timers.setTime(NOW.getTime());
  w.reset();
});

describe("1. Change a session's panel after a refusal about the visits", () => {
  test("a 409 that carries the visit emails asks for the preview again; one that carries the count does too; anything else does not", () => {
    assert.deepEqual(afterChangeRefused(409, { error: "Who is visiting this session has changed since the page was opened. Check it, then press again.", visitEmails: 3 }), { askAgain: true, emailsSaid: null });
    assert.deepEqual(afterChangeRefused(409, { error: "x", emails: 5 }), { askAgain: true, emailsSaid: 5 });
    assert.deepEqual(afterChangeRefused(409, { error: "x", emails: 5, visitEmails: 0 }), { askAgain: true, emailsSaid: 5 });
    assert.deepEqual(afterChangeRefused(409, { error: "x" }), { askAgain: false, emailsSaid: null });
    assert.deepEqual(afterChangeRefused(400, { visitEmails: 2 }), { askAgain: false, emailsSaid: null });
    assert.deepEqual(afterChangeRefused(409, null), { askAgain: false, emailsSaid: null });
  });

  test("the panel asks it, and asks for its preview again on its answer", () => {
    const panel = source("features", "courses", "groupPage", "ChangePanel.tsx");
    // The press of the change itself (the update it may post after is another route, with no visits).
    const press = panel.slice(panel.indexOf("async function press()"), panel.indexOf("async function", panel.indexOf("async function press()") + 10));
    assert.ok(press.length > 200, "the press moved: re-read the panel");
    assert.match(press, /const refused = afterChangeRefused\(answer\.status, answer\.body\);\s*if \(refused\.askAgain\) \{[\s\S]{0,400}setNonce\(\(n\) => n \+ 1\);/);
    assert.doesNotMatch(press, /answer\.status === 409 && typeof answer\.body\?\.emails === "number"/, "the old branch, which ignored the visit emails, is gone");
  });
});

describe("2. the column route's header", () => {
  test("says the correction emails nobody in the group, and that the people visiting are told", () => {
    const route = source("app", "api", "courses", "groups", "[groupId]", "attendance", "column", "route.ts");
    assert.doesNotMatch(route, /Nobody is emailed by a correction\./);
    assert.match(route, /The correction itself emails nobody in the group\./);
    assert.match(route, /src\/lib\/courses\/visit\/hostOff\.ts/);
  });
});

describe("3. one rule for whether the visit card offers Can't make it", () => {
  const group = (facilitatorUids) => ({ id: "g", runId: RUN.agi, facilitatorUids, archived: false });
  const member = { role: "member", email: "m@example.com" };

  test("the page's rule: asks unless they facilitate, with standing, the group their place is in now", () => {
    assert.equal(cardAsksFor("kai", member, group(["kai"])), false, "facilitates the group they are in now");
    assert.equal(cardAsksFor("kai", member, group(["sofia"])), true, "facilitates nothing they are in now");
    assert.equal(cardAsksFor("kai", { role: "pending" }, group(["kai"])), true, "named without standing: no facilitator");
    assert.equal(cardAsksFor("kai", null, group(["kai"])), true, "no account read");
    assert.equal(cardAsksFor("kai", member, null), true, "no group");
  });

  test("the staff call-off's sentence and the reminders both ask it, of the group the place is in now; nothing else words it", () => {
    const plan = source("lib", "courses", "visit", "plan.ts");
    assert.match(plan, /cardAsks: cardAsksFor\(facts\.place\.uid, facts\.accounts\.get\(facts\.place\.uid\), facts\.groups\.find\(\(group\) => group\.id === facts\.place\.groupId\) \?\? null\)/);
    assert.doesNotMatch(plan, /cardAsks: !home\.facilitatorUids\.includes/);
    const reminders = source("lib", "scheduler", "jobs", "weekReminders.ts");
    assert.match(reminders, /facilitatesOwnGroup = !cardAsksFor\(uid, /);
    const own = source("lib", "courses", "excused", "own.ts");
    assert.match(own, /const asks = !facilitatesGroup\(user, group\);/, "the page's own rule is the one asked");
  });
});

describe("4. withdrawn with the visit, per week", () => {
  const ownList = async (uid) => {
    const groups = world.db
      .paths()
      .filter((path) => /^courseGroups\/[^/]+$/.test(path))
      .map((path) => normalizeCourseGroup(path.split("/")[1], read(path)))
      .filter((group) => group.runId === RUN.agi);
    const seat = enrolments.normalizeCourseEnrolment(`${RUN.agi}__${uid}`, read(seatPath(uid)));
    const own = await excusedFor(world.courseDb, { user: w.sessionOf(uid), run: normalizeCourseRun(RUN.agi, read(`courseRuns/${RUN.agi}`)), enrolment: seat, groups, now: new Date() });
    return own.requests;
  };

  test("the normaliser: a week's own mark; a request stored with the mark on it reads it on each withdrawn week, as before", () => {
    const week = (sessionKey, status, extra = {}) => ({ sessionKey, status, asked: "before", offered: { online: false }, decidedByUid: null, decidedAt: null, reply: "", withdrawnAt: null, register: null, ...extra });
    const base = { kind: "excused", status: "withdrawn", runId: RUN.agi, groupId: A, subjectUid: "chloe", history: [] };
    const perWeek = normalizeExcusedRequest("r1", { ...base, change: { weeks: [week("w04", "withdrawn", { withdrawnWithVisit: true }), week("w05", "withdrawn")] } });
    assert.deepEqual(perWeek.weeks.map((each) => [each.sessionKey, each.withdrawnWithVisit]), [["w04", true], ["w05", false]]);
    assert.equal(perWeek.withdrawnWithVisit, true);
    const legacy = normalizeExcusedRequest("r2", { ...base, withdrawnWithVisit: true, change: { weeks: [week("w04", "withdrawn"), week("w05", "waiting")] } });
    assert.deepEqual(legacy.weeks.map((each) => [each.sessionKey, each.withdrawnWithVisit]), [["w04", true], ["w05", false]]);
    const none = normalizeExcusedRequest("r3", { ...base, change: { weeks: [week("w04", "withdrawn")] } });
    assert.deepEqual([none.withdrawnWithVisit, none.weeks[0].withdrawnWithVisit], [false, false]);
  });

  test("a request about two visited weeks: she withdraws week 5 herself, the week 4 visit is called off; only week 4 reads as withdrawn with the visit, and week 5 stays on her own list", async () => {
    await arrange("chloe", 4, A);
    await arrange("chloe", 5, A);
    const asked = await call("chloe", askRoute.POST, { groupId: A }, { body: { sessionKeys: ["w04", "w05"], reason: "A family wedding that fortnight.", inPerson: true, ownOnline: true, otherOnline: true }, course: true });
    assert.equal(asked.status, 200, JSON.stringify(asked.body));
    const [path] = requestPaths();
    // Week 5 withdrawn by her, as her own withdrawal writes it.
    const stored = read(path);
    world.db.poke(path, {
      change: { ...stored.change, weeks: stored.change.weeks.map((each) => (each.sessionKey === "w05" ? { ...each, status: "withdrawn", withdrawnAt: new Date() } : each)) },
    });
    const off = await callOff("chloe", 4);
    assert.equal(off.status, 200, JSON.stringify(off.body));
    const after = read(path);
    assert.deepEqual(after.change.weeks.map((each) => [each.sessionKey, each.status, each.withdrawnWithVisit ?? false]), [["w04", "withdrawn", true], ["w05", "withdrawn", false]]);
    assert.equal("withdrawnWithVisit" in after, false, "never on the whole request");

    const page = await loadExcusedRequestPage(world.courseDb, w.sessionOf("zach"), path.split("/")[1], new Date());
    assert.equal(page.status, "ok");
    assert.deepEqual(page.view.weeks.map((each) => [each.sessionKey, each.withdrawnWithVisit ?? false]), [["w04", true], ["w05", false]]);

    const list = await ownList("chloe");
    const mine = list.find((request) => request.id === path.split("/")[1]);
    assert.ok(mine, "the request with a week she withdrew herself stays on her list");
    assert.deepEqual(mine.weeks.map((each) => [each.sessionKey, each.state]), [["w05", "withdrawn"]]);
  });
});
