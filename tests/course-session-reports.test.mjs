/**
 * A facilitator's session report (privacy policy v15, "Session reports"): two
 * minutes straight after the register, on a phone.
 * Who writes one, what it keeps, who it may pick, when it is open, who reads
 * it, and what takes it away.
 *
 * Run with `npm test` (Node's built-in runner, no emulator, no credentials).
 *
 *   PUT /api/courses/groups/[groupId]/session-report    one facilitator's own report on one session
 *   /learn/[runId]/group/[groupId]/report               the form, for the group's live facilitators
 *   .../programmes/[programmeId]/surveys/reports        every report of the run, for its lead and admins
 *   clearSessionReports, destroyRunCascade              an account that is deleted, a run that is destroyed
 *
 * ## What this guards
 *
 *  1. THE RULES, pure: what a press of Send may carry, when a session's report
 *     is open (from its start until the group's next held session starts, or
 *     a week after the last one), and who an answer may pick.
 *  2. WHO WRITES. A live facilitator of the group, each their own report, and
 *     nobody else: not a co-facilitator's, not the programme's lead's, not an
 *     admin's, not anybody in the group, not a view-as session. Every refusal
 *     writes nothing and emails nobody.
 *  3. WHAT IT KEEPS, AND WHO IT PICKS. The answers by their question ids,
 *     everybody picked by account, the week's parts as they read, when it was
 *     first sent and when last. People are picked from the session's
 *     register, never its facilitators.
 *  4. THE PAGES. The facilitator's page draws the form while the report is
 *     open, and the register leads there once it is finished, for the group's
 *     facilitators only. The lead's page draws every report of the run, with
 *     names, for the lead and admins alone; the Surveys tab leads there with
 *     a count and no name.
 *  5. WHAT TAKES IT AWAY. Deleting an account takes the person's entries out
 *     of every report that picks them, and keeps the reports the account
 *     wrote with no writer at all, id included. Destroying the run deletes
 *     every report on it, counted first.
 *  6. NEVER IN NOTES. Every file that addresses the collection is listed with
 *     why, every caller of its readers too, and the notes kept about a person
 *     never reach either.
 *
 * Real: the route, the pages, the loaders, the readers, the cascades and the
 * components, against the in-memory store. Faked: see
 * `tests/lib/facilitatorPagesWorld.mjs`.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { enrolment, registerPath } from "./lib/hubAttendanceWorld.mjs";
import { A, AGI, B, C, NOW, ROUND, RUN, find, makeFacilitatorPagesWorld, textOf } from "./lib/facilitatorPagesWorld.mjs";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

mock.timers.enable({ apis: ["Date"], now: NOW });

/** What the register's grid is handed through its data hook, by the suite. */
const UI = "__sessionReportsGrid";
globalThis[UI] = { attendance: null };

const w = await makeFacilitatorPagesWorld("__sessionReports", [
  ["./useAttendance", `export default function useAttendance() { return globalThis[${JSON.stringify(UI)}].attendance; }`],
  ["@/components/ui/Modal", "export default function Modal(props) { return props.open ? props.children : null; }"],
]);
const { world, at, draw, call, courseRoute, loadTs, everything, routes } = w;

const reportRoute = await courseRoute("groups", "[groupId]", "session-report");
const model = await loadTs(join("lib", "courses", "sessionReports", "model.ts"));
const record = await loadTs(join("lib", "firestore", "courseSessionReports.ts"));
const words = await loadTs(join("lib", "courses", "sessionReports", "words.ts"));
const readers = await loadTs(join("lib", "courses", "sessionReports", "readers.ts"));
const accountDeletion = await loadTs(join("lib", "firestore", "accountDeletion.ts"));
const courseDeletion = await loadTs(join("lib", "firestore", "courseDeletion.ts"));
const { normalizeCourseRun } = await loadTs(join("lib", "firestore", "courses.ts"));
const { normalizeCourseGroup } = await loadTs(join("lib", "firestore", "courseGroups.ts"));
const { resolveSessions } = await loadTs(join("lib", "courses", "sessions.ts"));
const { default: AttendanceGrid } = await loadTs(join("features", "courses", "AttendanceGrid.tsx"));
const { default: LeadSurveysTab } = await loadTs(join("features", "surveys", "lead", "LeadSurveysTab.tsx"));

const GROUP_DIR = join("app", "(app)", "learn", "[runId]", "group", "[groupId]");
const TABS_DIR = join("app", "(app)", "admin", "admissions", "forms", "[roundId]", "programmes", "[programmeId]", "(tabs)");
const reportPage = (await loadTs(join(GROUP_DIR, "report", "page.tsx"))).default;
const leadPage = (await loadTs(join(TABS_DIR, "surveys", "reports", "page.tsx"))).default;

const RUN_HOME = `/learn/${RUN.agi}`;
const REPORT_PAGE = `${RUN_HOME}/group/${B}/report`;
const BASE = `/admin/admissions/forms/${ROUND}/programmes/${AGI}`;

/**
 * Group B's week 2, a whole report: Chloe and Kofi engaged well, Farah seemed
 * not to have done the readings, Kofi might need a hand. Group B's week 2
 * register has Chloe present, Farah late and Kofi present.
 */
const FULL = {
  sessionKey: "w02",
  answers: {
    how: 4,
    wentWell: "  The race discussion got everyone talking; Chloe and Kofi disagreed well.\r\nMore of that.  ",
    didnt: "Ran 10 minutes over.",
    unclear: ["something-else"],
    engaged: [
      { uid: "chloe", note: "Brought the compute reading into the race debate." },
      { uid: "kofi", note: "" },
    ],
    notRead: ["farah"],
    needsHand: [{ uid: "kofi", note: "Arrives after a lab; missed the first half hour." }],
    forLead: "",
  },
};

/** One report through the route, as `who`. */
const send = (who, body = FULL, { groupId = B, viewAs = false } = {}) =>
  call(who, reportRoute.PUT, { groupId }, { body, course: true, viewAs });

/** A body whose answers are the full report's, with some replaced. */
const withAnswers = (answers, sessionKey = FULL.sessionKey) => ({ sessionKey, answers: { ...FULL.answers, ...answers } });

const reportPaths = () => world.db.paths().filter((path) => path.startsWith("courseSessionReports/")).sort();
const reportPath = (writer, groupId = B, sessionKey = "w02") => `courseSessionReports/${RUN.agi}__${groupId}__${sessionKey}__${writer}`;

/** A part of a week, as a pasted week stores it. */
const part = (id, title) => ({ id, type: "part", title, time: "", framing: [], blocks: [] });

/** Group B's week 2 written as blocks, with three parts, the run's copy. */
function weekTwoWithParts() {
  world.db.poke(`courseRuns/${RUN.agi}/weeks/w02`, {
    blocks: [
      part("pt-power", "Why powerful AI might seek power"),
      part("pt-races", "Races between AI developers"),
      part("pt-compute", "Compute as a lever for governance"),
    ],
  });
}

beforeEach(() => {
  w.reset();
  globalThis[UI].attendance = null;
});

// ---------------------------------------------------------------------------
// 1. The rules, pure
// ---------------------------------------------------------------------------

describe("1. the rules, pure", () => {
  test("a whole report is read with its words trimmed, its line breaks made plain and nobody picked twice", () => {
    const parsed = model.parseReportBody({
      ...FULL,
      answers: { ...FULL.answers, engaged: [...FULL.answers.engaged, { uid: "chloe", note: "Again." }], notRead: ["farah", "farah"] },
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.sessionKey, "w02");
    assert.deepEqual(parsed.answers, {
      how: 4,
      wentWell: "The race discussion got everyone talking; Chloe and Kofi disagreed well.\nMore of that.",
      didnt: "Ran 10 minutes over.",
      unclear: ["something-else"],
      engaged: [
        { uid: "chloe", note: "Brought the compute reading into the race debate." },
        { uid: "kofi", note: "" },
      ],
      notRead: ["farah"],
      needsHand: [{ uid: "kofi", note: "Arrives after a lab; missed the first half hour." }],
      forLead: "",
    });
  });

  test("only how the session went needs an answer: everything else may be left out", () => {
    const parsed = model.parseReportBody({ sessionKey: "w03", answers: { how: 1 } });
    assert.deepEqual(parsed, {
      ok: true,
      sessionKey: "w03",
      answers: { how: 1, wentWell: "", didnt: "", unclear: [], engaged: [], notRead: [], needsHand: [], forLead: "" },
    });
    for (const how of [undefined, null, 0, 6, 2.5, "4"]) {
      assert.deepEqual(model.parseReportBody({ sessionKey: "w03", answers: { how } }), { ok: false, error: words.REPORT_REFUSAL.how }, String(how));
    }
  });

  test("a body that is not a report's, or names no session, is refused in a sentence", () => {
    for (const body of [null, "a report", [], { sessionKey: "w03" }, { sessionKey: "w03", answers: [] }]) {
      assert.deepEqual(model.parseReportBody(body), { ok: false, error: words.REPORT_REFUSAL.body }, JSON.stringify(body));
    }
    for (const sessionKey of [undefined, 3, "w3", "week3", "w03-1", "w03-5", "w03/x", "w003"]) {
      assert.deepEqual(model.parseReportBody({ sessionKey, answers: { how: 3 } }), { ok: false, error: words.REPORT_REFUSAL.session }, String(sessionKey));
    }
    assert.equal(model.parseReportBody({ sessionKey: "w03-2", answers: { how: 3 } }).ok, true, "a week's second session is a session");
    for (const answers of [
      { how: 3, wentWell: 7 },
      { how: 3, unclear: "pt-power" },
      { how: 3, unclear: ["pt power"] },
      { how: 3, engaged: ["chloe"] },
      { how: 3, engaged: [{ uid: "a/b" }] },
      { how: 3, notRead: [{ uid: "chloe" }] },
      { how: 3, needsHand: [{ uid: "kofi", note: 4 }] },
    ]) {
      assert.deepEqual(model.parseReportBody({ sessionKey: "w03", answers }), { ok: false, error: words.REPORT_REFUSAL.body }, JSON.stringify(answers));
    }
  });

  test("an answer over its limit is refused, saying the limit; one at it is kept", () => {
    const { text, aboutOne } = record.SESSION_REPORT_LIMITS;
    assert.deepEqual(model.parseReportBody({ sessionKey: "w03", answers: { how: 3, wentWell: "x".repeat(text + 1) } }), {
      ok: false,
      error: "What went well is too long: keep it to 2,000 characters.",
    });
    assert.deepEqual(model.parseReportBody({ sessionKey: "w03", answers: { how: 3, forLead: "x".repeat(text + 1) } }), {
      ok: false,
      error: "Your note for the lead and admins is too long: keep it to 2,000 characters.",
    });
    assert.deepEqual(model.parseReportBody({ sessionKey: "w03", answers: { how: 3, needsHand: [{ uid: "kofi", note: "x".repeat(aboutOne + 1) }] } }), {
      ok: false,
      error: "What you wrote about somebody you picked is too long: keep it to 300 characters.",
    });
    assert.equal(model.parseReportBody({ sessionKey: "w03", answers: { how: 3, didnt: "x".repeat(text), engaged: [{ uid: "chloe", note: "x".repeat(aboutOne) }] } }).ok, true);
  });

  test("a session's report opens at its start and closes when the group's next held session starts, or a week after the last", () => {
    const run = normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const group = normalizeCourseGroup(B, world.db.read(`courseGroups/${B}`));
    const sessions = resolveSessions(run, group);
    const second = model.reportWindowOf(sessions, "w02");
    assert.deepEqual(
      [second.opensAt.toISOString(), second.closesAt.toISOString(), second.nextWeekNumber],
      ["2026-11-10T18:00:00.000Z", "2026-11-17T18:00:00.000Z", 3],
    );
    const last = model.reportWindowOf(sessions, "w06");
    assert.deepEqual([last.opensAt.toISOString(), last.closesAt.toISOString(), last.nextWeekNumber], ["2026-12-08T18:00:00.000Z", "2026-12-15T18:00:00.000Z", null]);
    assert.equal(model.reportWindowOf(sessions, "w07"), null, "a session the group does not hold has no report");

    assert.equal(model.windowStateAt(second, new Date("2026-11-10T17:59:00Z")), "not-yet");
    assert.equal(model.windowStateAt(second, new Date("2026-11-10T18:00:00Z")), "open");
    assert.equal(model.windowStateAt(second, new Date("2026-11-17T17:59:00Z")), "open");
    assert.equal(model.windowStateAt(second, new Date("2026-11-17T18:00:00Z")), "closed");

    // Week 3 called off: week 2's report runs on to week 4's start, and week 3 has none.
    const cancelled = normalizeCourseGroup(B, {
      ...world.db.read(`courseGroups/${B}`),
      sessionChanges: { w03: { kind: "cancelled", reason: "Both away.", dateKey: "2026-11-17", byUid: "rahul", at: NOW } },
    });
    const withGap = resolveSessions(run, cancelled);
    assert.equal(model.reportWindowOf(withGap, "w03"), null);
    const runsOn = model.reportWindowOf(withGap, "w02");
    assert.deepEqual([runsOn.closesAt.toISOString(), runsOn.nextWeekNumber], ["2026-11-24T18:00:00.000Z", 4]);

    // A group with no time set has no dated session, so no report.
    const undated = normalizeCourseGroup(C, { ...world.db.read(`courseGroups/${C}`), session: { ...world.db.read(`courseGroups/${C}`).session, startTimeLocal: "" } });
    assert.equal(model.reportWindowOf(resolveSessions(run, undated), "w02"), null);
  });

  test("with no session named, a report is for the latest of the group's sessions that has started, never one called off", () => {
    const run = normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`));
    const group = normalizeCourseGroup(B, world.db.read(`courseGroups/${B}`));
    const sessions = resolveSessions(run, group);
    assert.equal(model.latestStartedSession(sessions, NOW).sessionKey, "w02");
    assert.equal(model.latestStartedSession(sessions, new Date("2026-11-17T18:00:00Z")).sessionKey, "w03");
    assert.equal(model.latestStartedSession(sessions, new Date("2026-11-03T17:00:00Z")), null);
    const cancelled = normalizeCourseGroup(B, {
      ...world.db.read(`courseGroups/${B}`),
      sessionChanges: { w02: { kind: "cancelled", reason: "Both away.", dateKey: "2026-11-10", byUid: "rahul", at: NOW } },
    });
    assert.equal(model.latestStartedSession(resolveSessions(run, cancelled), NOW).sessionKey, "w01");
  });

  test("who an answer may pick: who engaged and who had not read from the people here, who needs a hand from the group", () => {
    const came = new Set(["chloe", "farah"]);
    const inGroup = new Set(["chloe", "farah", "kofi"]);
    const answers = (over) => ({ engaged: [], notRead: [], needsHand: [], ...over });
    assert.equal(model.pickRefusal(answers({ engaged: [{ uid: "chloe", note: "" }], notRead: ["farah"], needsHand: [{ uid: "kofi", note: "" }] }), came, inGroup), null);
    assert.equal(model.pickRefusal(answers({ engaged: [{ uid: "kofi", note: "" }] }), came, inGroup), words.REPORT_REFUSAL.pickedCame);
    assert.equal(model.pickRefusal(answers({ notRead: ["kofi"] }), came, inGroup), words.REPORT_REFUSAL.pickedCame);
    assert.equal(model.pickRefusal(answers({ needsHand: [{ uid: "omar", note: "" }] }), came, inGroup), words.REPORT_REFUSAL.pickedGroup);
    assert.equal(model.unclearRefusal({ unclear: ["pt-a", "something-else"] }, new Set(["pt-a"])), null);
    assert.equal(model.unclearRefusal({ unclear: ["pt-b"] }, new Set(["pt-a"])), words.REPORT_REFUSAL.parts);
  });

  test("a stored report is read leniently: who it picks is its answers', once each, and a row that cannot be placed is nobody's", () => {
    const read = record.normalizeSessionReport("r1", {
      runId: RUN.agi,
      groupId: B,
      sessionKey: "w02",
      weekNumber: 2,
      writerUid: "rahul",
      answers: {
        how: 9,
        engaged: [{ uid: "chloe", note: "x".repeat(400) }, { uid: "chloe" }, "kofi", { uid: "" }],
        notRead: ["farah", "farah", 3],
        needsHand: [{ uid: "kofi" }],
        unclear: ["pt-a", 7, "pt-a"],
      },
      aboutUids: ["somebody-else"],
      parts: [{ id: "pt-a", title: "A part" }, { title: "No id" }],
    });
    assert.equal(read.answers.how, null);
    assert.deepEqual(read.answers.engaged, [{ uid: "chloe", note: "x".repeat(300) }]);
    assert.deepEqual(read.answers.notRead, ["farah"]);
    assert.deepEqual(read.answers.needsHand, [{ uid: "kofi", note: "" }]);
    assert.deepEqual(read.answers.unclear, ["pt-a"]);
    assert.deepEqual(read.aboutUids, ["chloe", "farah", "kofi"]);
    assert.deepEqual(read.parts, [{ id: "pt-a", title: "A part" }]);
    assert.equal(read.occurrence, 1);
    assert.equal(record.normalizeSessionReport("r2", { runId: RUN.agi, groupId: B, weekNumber: 2 }), null);
    assert.equal(record.normalizeSessionReport("r3", { runId: RUN.agi, sessionKey: "w02", weekNumber: 2 }), null);
    assert.equal(record.normalizeSessionReport("r4", { groupId: B, sessionKey: "w02", weekNumber: 0 }), null);
  });

  test("one person comes out of every answer that picks them, and nothing else changes", () => {
    const answers = record.normalizeReportAnswers(FULL.answers);
    const without = record.answersWithout(answers, "kofi");
    assert.deepEqual(without.engaged.map((pick) => pick.uid), ["chloe"]);
    assert.deepEqual(without.needsHand, []);
    assert.deepEqual(without.notRead, ["farah"]);
    assert.deepEqual(record.aboutUidsOf(without), ["chloe", "farah"]);
    assert.equal(without.wentWell, answers.wentWell);
  });

  test("the words: no dash of either kind, no pronoun guessed, and nothing a member would read as marking them", () => {
    assert.equal(words.reportTitle(3), "How did week 3 go?");
    assert.equal(words.reportTitle(3, 2), "How did week 3, session 2 go?");
    assert.equal(
      words.reportIntro("Group C", "Wed 18 Nov", "Claudia"),
      "Group C, Wed 18 Nov. Claudia and admins read this. Nobody in the group does on the site, though anyone can ask for what’s written about them.",
    );
    assert.equal(words.reportIntro("Group C", "Wed 18 Nov", ""), "Group C, Wed 18 Nov. Admins read this. Nobody in the group does on the site, though anyone can ask for what’s written about them.");
    assert.equal(words.standOutLabel("Aisha"), "What made Aisha stand out?");
    assert.equal(words.aWordAboutLabel("Leo"), "A word about Leo");
    assert.equal(words.forLeadLabel("Claudia"), "Anything for Claudia or the admins?");
    assert.equal(words.forLeadLabel(""), "Anything for the admins?");
    assert.equal(words.REPORT_WORDS.next, "Next: two minutes on how it went.");
    assert.equal(words.changeUntilLine(new Date("2026-11-24T18:00:00Z"), 4), "You can change it until week 4 starts, Tue 24 Nov at 6pm.");
    assert.equal(words.changeUntilLine(new Date("2026-12-15T18:00:00Z"), null), "You can change it until Tue 15 Dec at 6pm.");
    assert.equal(words.sentLine(new Date("2026-11-18T20:14:00Z")), "Sent Wed 18 Nov at 8:14pm.");
    assert.equal(words.tabLineWords(0), "None yet: each group’s facilitators can send one after each session. Only you and admins read them.");
    assert.equal(words.tabLineWords(1), "1 report from the groups’ facilitators, with names. Only you and admins read them.");
    const source = readFileSync(join(SRC, "lib", "courses", "sessionReports", "words.ts"), "utf8");
    assert.doesNotMatch(source, /[\u2013\u2014]/, "the words carry a dash");
    assert.doesNotMatch(source, /\b(?:he|she|his|her|him|hers)\b/i, "the words guess a pronoun");
    assert.doesNotMatch(source.replace(/^\s*(?:\/\/|\*).*$/gm, ""), /\b(?:mark(?:s|ed)?|grades?|scores?)\b/i, "the words mark, grade or score somebody");
  });
});

// ---------------------------------------------------------------------------
// 2. Who writes
// ---------------------------------------------------------------------------

describe("2. who writes a report on Group B's week 2", () => {
  test("its two facilitators, each their own, and nobody else", async () => {
    const said = {};
    for (const who of ["rahul", "sofia", "zach", "claudia", "tess", "lloyd", "yusuf", "tom", "grace", "chloe", "amara", "nobody", null]) {
      const answer = await send(who);
      said[who ?? "signed out"] = answer.status === 200 ? "wrote" : `${answer.status} ${answer.body.error}`;
    }
    assert.deepEqual(said, {
      rahul: "wrote",
      sofia: "wrote",
      // An admin reads reports on the programme's page and writes none.
      zach: `403 ${words.REPORT_REFUSAL.notYours}`,
      // The programme's lead reads them and writes none.
      claudia: "403 Forbidden",
      tess: "403 Forbidden",
      lloyd: "403 Forbidden",
      yusuf: "403 Forbidden",
      // Other groups' facilitators, somebody in the group, somebody in another group.
      tom: "403 Forbidden",
      grace: "403 Forbidden",
      chloe: "403 Forbidden",
      amara: "403 Forbidden",
      nobody: "403 Forbidden",
      "signed out": "401 Not signed in",
    });
    assert.deepEqual(reportPaths(), [reportPath("rahul"), reportPath("sofia")], "the two facilitators wrote one report each");
    assert.deepEqual(world.mail, [], "a report emailed somebody");
  });

  test("every refusal writes nothing", async () => {
    const before = everything();
    for (const who of ["zach", "claudia", "tom", "chloe", null]) await send(who);
    await send("rahul", { sessionKey: "w02", answers: {} });
    await send("rahul", FULL, { viewAs: true });
    assert.equal(everything(), before);
  });

  test("a view-as session is refused first, even as the group's own facilitator", async () => {
    const answer = await send("rahul", FULL, { viewAs: true });
    assert.deepEqual([answer.status, answer.body.error], [403, "view-as"]);
    assert.deepEqual(reportPaths(), []);
  });

  test("the body is checked before anything is read, so everybody signed in meets the same 400 on an empty one", async () => {
    for (const who of ["rahul", "zach", "claudia", "tom", "chloe", "nobody"]) {
      const answer = await call(who, reportRoute.PUT, { groupId: B }, { body: {}, course: true });
      assert.deepEqual([answer.status, answer.body.error], [400, words.REPORT_REFUSAL.body], who);
    }
    assert.equal((await call(null, reportRoute.PUT, { groupId: B }, { body: {}, course: true })).status, 401);
  });

  test("a group that is not there is the same refusal as one that is not yours; an admin is told it is missing", async () => {
    assert.equal((await send("rahul", FULL, { groupId: "no-such-group__grp99999" })).status, 403);
    const asAdmin = await send("zach", FULL, { groupId: "no-such-group__grp99999" });
    assert.deepEqual([asAdmin.status, asAdmin.body.error], [404, "Group not found"]);
  });

  test("an archived group's facilitator, one who no longer stands behind the role, and a run being destroyed write nothing", async () => {
    world.db.poke(`courseGroups/${B}`, { archived: true });
    assert.equal((await send("rahul")).status, 403);
    world.db.poke(`courseGroups/${B}`, { archived: false });
    world.db.poke("users/rahul", { role: "pending" });
    assert.equal((await send("rahul")).status, 403);
    world.db.poke(`courseRuns/${RUN.agi}`, { destroying: true });
    assert.equal((await send("sofia")).status, 404);
    assert.deepEqual(reportPaths(), []);
  });

  test("a facilitator of one group writes on that group only", async () => {
    assert.equal((await send("sofia", { sessionKey: "w03", answers: { how: 5, engaged: [{ uid: "amara", note: "" }] } }, { groupId: A })).status, 200);
    assert.equal((await send("tom", FULL)).status, 403);
    assert.deepEqual(reportPaths(), [reportPath("sofia", A, "w03")]);
  });
});

// ---------------------------------------------------------------------------
// 3. What a report keeps, and who it picks
// ---------------------------------------------------------------------------

describe("3. what a report keeps, and who it picks", () => {
  test("its run, group and session, its writer, its answers by question, everybody picked by account, and when it was sent", async () => {
    const answer = await send("rahul");
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    assert.deepEqual(answer.body, { ok: true, sentAt: NOW.toISOString(), updatedAt: NOW.toISOString() });
    const stored = world.db.read(reportPath("rahul"));
    assert.deepEqual(
      { ...stored, sentAt: stored.sentAt.toISOString(), updatedAt: stored.updatedAt.toISOString() },
      {
        runId: RUN.agi,
        groupId: B,
        sessionKey: "w02",
        weekNumber: 2,
        occurrence: 1,
        writerUid: "rahul",
        answers: {
          how: 4,
          wentWell: "The race discussion got everyone talking; Chloe and Kofi disagreed well.\nMore of that.",
          didnt: "Ran 10 minutes over.",
          unclear: ["something-else"],
          engaged: [
            { uid: "chloe", note: "Brought the compute reading into the race debate." },
            { uid: "kofi", note: "" },
          ],
          notRead: ["farah"],
          needsHand: [{ uid: "kofi", note: "Arrives after a lab; missed the first half hour." }],
          forLead: "",
        },
        aboutUids: ["chloe", "farah", "kofi"],
        parts: [],
        sentAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
      },
    );
    assert.deepEqual(Object.keys(stored.answers), [...record.SESSION_REPORT_QUESTIONS], "the answers are not keyed by the fixed question ids");
  });

  test("a second press replaces the answers and keeps when the report was first sent", async () => {
    await send("rahul");
    at("2026-11-17T09:30:00Z");
    const later = await send("rahul", withAnswers({ how: 3, engaged: [], notRead: [], needsHand: [], wentWell: "Changed my mind." }));
    assert.equal(later.status, 200);
    const stored = world.db.read(reportPath("rahul"));
    assert.equal(stored.answers.how, 3);
    assert.equal(stored.answers.wentWell, "Changed my mind.");
    assert.deepEqual(stored.aboutUids, []);
    assert.equal(stored.sentAt.toISOString(), NOW.toISOString());
    assert.equal(stored.updatedAt.toISOString(), "2026-11-17T09:30:00.000Z");
    assert.deepEqual(reportPaths(), [reportPath("rahul")]);
  });

  test("two facilitators of one group write two reports, and neither touches the other's", async () => {
    await send("rahul");
    await send("sofia", withAnswers({ how: 2, wentWell: "Sofia's view.", engaged: [], notRead: [], needsHand: [] }));
    assert.equal(world.db.read(reportPath("rahul")).answers.how, 4);
    assert.equal(world.db.read(reportPath("sofia")).answers.how, 2);
    assert.equal(world.db.read(reportPath("sofia")).answers.wentWell, "Sofia's view.");
  });

  test("who engaged well and who had not read are the people the register has down as here", async () => {
    // Kofi is down as here, so may be picked; Farah came late, which is here too.
    assert.equal((await send("rahul", withAnswers({ engaged: [{ uid: "farah", note: "" }], notRead: ["kofi"] }))).status, 200);
    // Week 1: Kofi was excused, and Omar, staff took off since, was there.
    world.db.poke(registerPath(B, 2), { records: { chloe: "present", farah: "late", kofi: "absent" } });
    for (const answers of [{ engaged: [{ uid: "kofi", note: "" }] }, { notRead: ["kofi"] }, { engaged: [{ uid: "amara", note: "" }] }, { notRead: ["sofia"] }]) {
      const answer = await send("rahul", withAnswers({ engaged: [], notRead: [], needsHand: [], ...answers }));
      assert.deepEqual([answer.status, answer.body.error], [400, words.REPORT_REFUSAL.pickedCame], JSON.stringify(answers));
    }
  });

  test("who might need a hand is anybody on the register, never somebody who left or another group's", async () => {
    world.db.poke(registerPath(B, 2), { records: {} });
    assert.equal((await send("rahul", withAnswers({ engaged: [], notRead: [], needsHand: [{ uid: "kofi", note: "" }] }))).status, 200);
    for (const uid of ["omar", "amara", "una", "rahul"]) {
      const answer = await send("rahul", withAnswers({ engaged: [], notRead: [], needsHand: [{ uid, note: "" }] }));
      assert.deepEqual([answer.status, answer.body.error], [400, words.REPORT_REFUSAL.pickedGroup], uid);
    }
  });

  test("never the group's facilitators, even one who holds a place in it", async () => {
    world.db.seed(`courseEnrolments/${RUN.agi}__sofia`, enrolment("sofia", B));
    world.db.poke(registerPath(B, 2), { records: { chloe: "present", farah: "late", kofi: "present", sofia: "present" } });
    for (const answers of [{ engaged: [{ uid: "sofia", note: "" }] }, { notRead: ["sofia"] }, { needsHand: [{ uid: "sofia", note: "" }] }]) {
      const answer = await send("rahul", withAnswers({ engaged: [], notRead: [], needsHand: [], ...answers }));
      assert.equal(answer.status, 400, JSON.stringify(answers));
    }
  });

  test("what seemed unclear is the week's own parts, from the group's copy first, and something else", async () => {
    weekTwoWithParts();
    const ticked = await send("rahul", withAnswers({ unclear: ["pt-compute", "something-else"] }));
    assert.equal(ticked.status, 200, JSON.stringify(ticked.body));
    assert.deepEqual(world.db.read(reportPath("rahul")).parts, [
      { id: "pt-power", title: "Why powerful AI might seek power" },
      { id: "pt-races", title: "Races between AI developers" },
      { id: "pt-compute", title: "Compute as a lever for governance" },
    ]);
    const unknown = await send("rahul", withAnswers({ unclear: ["pt-elsewhere"] }));
    assert.deepEqual([unknown.status, unknown.body.error], [400, words.REPORT_REFUSAL.parts]);

    // Group B's own copy of the week, with a part of its own in place of one.
    world.db.seed(`courseGroups/${B}/weeks/w02`, {
      weekNumber: 2,
      title: "Week 2 readings",
      published: true,
      blocks: [part("pt-power", "Why powerful AI might seek power"), part("pt-own", "Group B's own part")],
    });
    assert.equal((await send("rahul", withAnswers({ unclear: ["pt-own"] }))).status, 200);
    assert.deepEqual(world.db.read(reportPath("rahul")).parts.map((each) => each.id), ["pt-power", "pt-own"]);
    assert.equal((await send("rahul", withAnswers({ unclear: ["pt-compute"] }))).status, 400);
  });

  test("a report opens when its session starts and closes when the group's next session starts", async () => {
    const tonight = await send("rahul", withAnswers({ engaged: [], notRead: [], needsHand: [] }, "w03"));
    assert.deepEqual([tonight.status, tonight.body.error], [409, "Week 3’s report opens when the session starts."]);
    const first = await send("rahul", withAnswers({ engaged: [], notRead: [], needsHand: [] }, "w01"));
    assert.deepEqual([first.status, first.body.error], [409, "Week 1’s report has closed: it could be changed until week 2 started."]);
    at("2026-11-17T18:00:00Z");
    const closed = await send("rahul");
    assert.deepEqual([closed.status, closed.body.error], [409, "Week 2’s report has closed: it could be changed until week 3 started."]);
    assert.equal((await send("rahul", withAnswers({ engaged: [], notRead: [], needsHand: [] }, "w03"))).status, 200);
  });

  test("a session the group does not hold, one called off and one the register says did not happen have no report", async () => {
    const unheld = await send("rahul", withAnswers({}, "w09"));
    assert.deepEqual([unheld.status, unheld.body.error], [400, words.REPORT_REFUSAL.session]);
    world.db.poke(`courseGroups/${B}`, {
      sessionChanges: { w02: { kind: "cancelled", reason: "Both away.", dateKey: "2026-11-10", byUid: "rahul", at: NOW } },
    });
    const cancelled = await send("rahul");
    assert.deepEqual([cancelled.status, cancelled.body.error], [409, "Week 2 didn’t happen, so it has no report."]);
    world.db.poke(`courseGroups/${B}`, { sessionChanges: {} });
    world.db.poke(registerPath(B, 2), { held: false });
    const notHeld = await send("rahul");
    assert.deepEqual([notHeld.status, notHeld.body.error], [409, "Week 2 didn’t happen, so it has no report."]);
    // A group with no time set: its sessions have no day to open at.
    world.db.poke(registerPath(B, 2), { held: true });
    world.db.poke(`courseGroups/${B}`, { session: { ...world.db.read(`courseGroups/${B}`).session, startTimeLocal: "" } });
    const undated = await send("rahul");
    assert.deepEqual([undated.status, undated.body.error], [409, "Week 2 has no day and time yet, so its report can’t open."]);
    assert.deepEqual(reportPaths(), []);
  });
});

// ---------------------------------------------------------------------------
// 4. The pages
// ---------------------------------------------------------------------------

/** The facilitator's report page as `who`. */
const reportPageAs = (who, session) => draw(reportPage, who, { runId: RUN.agi, groupId: B }, session ? { session } : {});
/** The programme's session reports as `who`. */
const leadPageAs = (who) => draw(leadPage, who, { roundId: ROUND, programmeId: AGI });

/** The register's grid, drawn with the register route's own answer to `who`, and handed `reportHref`. */
async function gridAs(who, reportHref) {
  const answer = await call(who, routes.register.GET, { groupId: B }, { course: true });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  globalThis[UI].attendance = {
    ...answer.body,
    loading: false,
    loaded: true,
    error: null,
    reload: () => {},
    mark: async () => {},
    edit: async () => ({}),
    push: async () => ({}),
    saveNote: async () => ({}),
  };
  return renderToStaticMarkup(createElement(AttendanceGrid, { groupId: B, reportHref }));
}

describe("4. the pages", () => {
  test("the facilitator's page: the group's two facilitators; everybody else, an admin included, is sent to the run's home", async () => {
    const said = {};
    for (const who of ["rahul", "sofia", "zach", "claudia", "tom", "chloe", "nobody", null]) {
      const drawn = await reportPageAs(who);
      said[who ?? "signed out"] = drawn.to ?? "drawn";
      assert.equal(drawn.wrote, false, `${who}'s page wrote something`);
    }
    assert.deepEqual(said, {
      rahul: "drawn",
      sofia: "drawn",
      zach: RUN_HOME,
      claudia: RUN_HOME,
      tom: RUN_HOME,
      chloe: RUN_HOME,
      nobody: RUN_HOME,
      "signed out": "/login",
    });
  });

  test("the form: the latest session's, its people from the register, and the lead named", async () => {
    weekTwoWithParts();
    const drawn = await reportPageAs("rahul");
    const form = find(drawn.element, "SessionReportForm")[0]?.props;
    assert.ok(form, drawn.text);
    assert.equal(form.sessionKey, "w02");
    assert.deepEqual(form.came.map((person) => [person.uid, person.name, person.firstName]), [
      ["chloe", "Chloe Nguyen", "Chloe"],
      ["farah", "Farah Hussain", "Farah"],
      ["kofi", "Kofi Asante", "Kofi"],
    ]);
    assert.deepEqual(form.inGroup.map((person) => person.uid), ["chloe", "farah", "kofi"]);
    assert.deepEqual(form.parts.map((each) => each.id), ["pt-power", "pt-races", "pt-compute"]);
    assert.equal(form.answers, null);
    assert.equal(form.leadFirstName, "Claudia");
    assert.equal(form.changeUntil, "You can change it until week 3 starts, Tue 17 Nov at 6pm.");
    for (const said of [
      "After the register · 2 minutes",
      "How did week 2 go?",
      "Group B, Tue 10 Nov. Claudia and admins read this. Nobody in the group does on the site, though anyone can ask for what’s written about them.",
      "How did the session go? 1 2 3 4 5 Badly Really well",
      "What went well?",
      "What didn’t?",
      "What seemed unclear to the group? Why powerful AI might seek power Races between AI developers Compute as a lever for governance Something else",
      "Who engaged well? Chloe Nguyen Farah Hussain Kofi Asante",
      "Did anyone seem not to have done the readings? Chloe Nguyen Farah Hussain Kofi Asante",
      "Anyone who might need a hand? Chloe Nguyen Farah Hussain Kofi Asante",
      "Anything for Claudia or the admins?",
      "Send report",
    ]) {
      assert.ok(drawn.text.includes(said), `the page does not say: ${said}\n${drawn.text}`);
    }
    // Send waits for the page's script; every box is the browser's own.
    assert.match(drawn.html, /<button type="submit" class="send" disabled="">Send report<\/button>/);
    assert.match(drawn.html, /placeholder="Optional"/);
  });

  test("once sent, the form starts from the writer's own answers, and a line about each person picked is open", async () => {
    await send("rahul");
    const drawn = await reportPageAs("rahul", "w02");
    const form = find(drawn.element, "SessionReportForm")[0].props;
    assert.equal(form.answers.how, 4);
    assert.equal(form.sent, "Sent Tue 17 Nov at 12pm.");
    assert.ok(drawn.text.includes("What made Chloe stand out?"));
    assert.ok(drawn.text.includes("What made Kofi stand out?"));
    assert.ok(drawn.text.includes("A word about Kofi"));
    assert.ok(!drawn.text.includes("What made Farah stand out?"));
    assert.match(drawn.html, /value="Brought the compute reading into the race debate."/);
    // Sofia's page is her own: nothing of Rahul's report reaches it.
    const hers = find((await reportPageAs("sofia", "w02")).element, "SessionReportForm")[0].props;
    assert.equal(hers.answers, null);
    assert.equal(hers.sent, "");
  });

  test("a session not started yet, one closed, one called off, and a group that has not met yet", async () => {
    const tonight = await reportPageAs("rahul", "w03");
    assert.ok(tonight.text.includes("Week 3’s report opens when the session starts, Tue 17 Nov at 6pm."), tonight.text);
    assert.equal(find(tonight.element, "SessionReportForm").length, 0);

    at("2026-11-10T19:00:00Z");
    await send("rahul", withAnswers({ engaged: [], notRead: [], needsHand: [] }, "w02"));
    at(NOW);
    const first = await reportPageAs("rahul", "w01");
    assert.ok(first.text.includes("Week 1’s report closed when week 2 started, Tue 10 Nov at 6pm."), first.text);
    assert.ok(first.text.includes("You didn’t send a report on this session."));

    at("2026-11-18T09:00:00Z");
    const closed = await reportPageAs("rahul", "w02");
    assert.ok(closed.text.includes("Week 2’s report closed when week 3 started, Tue 17 Nov at 6pm."), closed.text);
    assert.ok(closed.text.includes("What you sent"));
    assert.ok(closed.text.includes("How it went 4 of 5"), closed.text);
    assert.equal(find(closed.element, "SessionReportForm").length, 0);

    at(NOW);
    world.db.poke(registerPath(B, 2), { held: false });
    assert.ok((await reportPageAs("rahul", "w02")).text.includes("Week 2 didn’t happen, so it has no report."));

    at("2026-11-02T12:00:00Z");
    assert.ok((await reportPageAs("rahul")).text.includes("Reports open when the group’s first session starts."));
  });

  test("the register leads its facilitators on to the report once its session is finished, and nobody else", async () => {
    const page = (await w.registerPage("rahul")).element;
    assert.equal(find(page, "AttendanceGrid")[0].props.reportHref, REPORT_PAGE);
    assert.equal(find((await w.registerPage("sofia")).element, "AttendanceGrid")[0].props.reportHref, REPORT_PAGE);
    assert.equal(find((await w.registerPage("zach")).element, "AttendanceGrid")[0].props.reportHref, undefined);

    // Week 2 finished, week 3 not started: the foot is about week 2.
    const finished = await gridAs("rahul", REPORT_PAGE);
    assert.ok(finished.includes(`href="${REPORT_PAGE}?session=w02"`), "the finished register does not lead to its report");
    assert.ok(textOf(finished).includes("Next: two minutes on how it went."));
    assert.ok(!(await gridAs("zach", undefined)).includes("/report?session="), "an admin's register leads to a report");

    // A finished register that says its session did not happen: it has no report.
    world.db.poke(registerPath(B, 2), { held: false });
    assert.ok(!(await gridAs("rahul", REPORT_PAGE)).includes("/report?session="), "a session that did not happen leads to a report");
    world.db.poke(registerPath(B, 2), { held: true });

    // Tonight's session has started and is not finished: no way on yet.
    at("2026-11-17T19:00:00Z");
    assert.ok(!(await gridAs("rahul", REPORT_PAGE)).includes("/report?session="), "an unfinished register leads to a report");
  });

  test("the lead's page: the programme's lead and admins; a reviewer is told so, another lead finds no programme", async () => {
    await send("rahul");
    const said = {};
    for (const who of ["claudia", "zach", "lloyd", "tess", "rahul", "chloe", null]) {
      const drawn = await leadPageAs(who);
      said[who ?? "signed out"] =
        drawn.to ??
        (drawn.text.includes("Session reports What each group’s facilitators")
          ? "reports"
          : drawn.text.includes(words.RUN_REPORTS_WORDS.refusalTitle)
            ? "refused"
            : drawn.text.startsWith("There is no programme here")
              ? "no programme"
              : drawn.text);
      assert.ok(!drawn.text.includes("Chloe Nguyen") || said[who ?? "signed out"] === "reports", `${who} is shown a name`);
    }
    assert.deepEqual(said, {
      claudia: "reports",
      zach: "reports",
      // The programme's reviewer: the reports are the lead's and admins'.
      lloyd: "refused",
      // The lead of another programme on the form holds no role on this one.
      tess: "no programme",
      // Nobody else is admitted by the admissions tree (the proxy sends a
      // stranger to sign in before the page is reached).
      rahul: "/dashboard",
      chloe: "/dashboard",
      "signed out": "/dashboard",
    });
  });

  test("the lead's page: every report whole, newest week first, with its group, writer, day and the people it picks by name", async () => {
    at("2026-11-12T19:30:00Z");
    assert.equal((await send("sofia", { sessionKey: "w03", answers: { how: 5, wentWell: "Group A flew.", engaged: [{ uid: "amara", note: "Led the debate." }] } }, { groupId: A })).status, 200);
    at(NOW);
    weekTwoWithParts();
    assert.equal((await send("rahul", withAnswers({ unclear: ["pt-races", "something-else"], forLead: "Can we swap rooms?" }))).status, 200);
    assert.equal((await send("sofia", withAnswers({ how: 3, wentWell: "", didnt: "", unclear: [], engaged: [], notRead: [], needsHand: [] }))).status, 200);

    const weeks = await readers.readRunSessionReports(world.courseDb, RUN.agi);
    // Each writer by the name they go by (`fullNameOfUser`, since the full names change).
    assert.deepEqual(weeks.map((week) => [week.weekNumber, week.reports.map((report) => `${report.groupName} · ${report.writerName}`)]), [
      [3, ["Group A · Sofia"]],
      [2, ["Group B · Rahul", "Group B · Sofia"]],
    ]);
    const rahuls = weeks[1].reports[0];
    assert.deepEqual(
      { ...rahuls, sessionAt: rahuls.sessionAt.toISOString(), sentAt: rahuls.sentAt.toISOString(), updatedAt: rahuls.updatedAt.toISOString() },
      {
        id: `${RUN.agi}__${B}__w02__rahul`,
        groupId: B,
        groupName: "Group B",
        writerName: "Rahul",
        weekNumber: 2,
        occurrence: 1,
        sessionAt: "2026-11-10T18:00:00.000Z",
        sentAt: NOW.toISOString(),
        updatedAt: NOW.toISOString(),
        how: 4,
        wentWell: "The race discussion got everyone talking; Chloe and Kofi disagreed well.\nMore of that.",
        didnt: "Ran 10 minutes over.",
        unclear: ["Races between AI developers", "Something else"],
        engaged: [
          { name: "Chloe Nguyen", note: "Brought the compute reading into the race debate." },
          { name: "Kofi Asante", note: "" },
        ],
        notRead: ["Farah Hussain"],
        needsHand: [{ name: "Kofi Asante", note: "Arrives after a lab; missed the first half hour." }],
        forLead: "Can we swap rooms?",
      },
    );

    const drawn = await leadPageAs("claudia");
    for (const said of [
      "Surveys Session reports What each group’s facilitators reported after each session, with names.",
      "Week 3 Group A · Sofia Thu 12 Nov · Sent Thu 12 Nov at 7:30pm How it went 5 of 5 What went well Group A flew. Engaged well Amara Okafor : Led the debate.",
      "Week 2 Group B · Rahul Tue 10 Nov · Sent Tue 17 Nov at 12pm How it went 4 of 5",
      "What seemed unclear Races between AI developers Something else",
      "Engaged well Chloe Nguyen : Brought the compute reading into the race debate. Kofi Asante",
      "Seemed not to have done the readings Farah Hussain",
      "Might need a hand Kofi Asante : Arrives after a lab; missed the first half hour.",
      "For the lead and admins Can we swap rooms?",
      "Group B · Sofia Tue 10 Nov · Sent Tue 17 Nov at 12pm How it went 3 of 5",
    ]) {
      assert.ok(drawn.text.includes(said), `the lead's page does not say: ${said}\n${drawn.text}`);
    }
    assert.ok(drawn.html.includes(`href="${BASE}/surveys"`), "the page does not lead back to the Surveys tab");
  });

  test("the lead's page before any report, and the Surveys tab's row that leads to it: a count, never a name", async () => {
    assert.ok((await leadPageAs("claudia")).text.includes("No facilitator has sent a report yet."));
    assert.equal(await readers.countRunSessionReports(world.courseDb, RUN.agi), 0);
    await send("rahul");
    await send("sofia");
    assert.equal(await readers.countRunSessionReports(world.courseDb, RUN.agi), 2);

    const view = { programmeKind: "fellowship", surveys: [], change: null, end: null, sources: null, links: { ratings: true, anonymousForm: false } };
    const tab = renderToStaticMarkup(createElement(LeadSurveysTab, { view, base: BASE, reports: 2 }));
    assert.ok(tab.includes(`href="${BASE}/surveys/reports"`));
    assert.ok(textOf(tab).includes("Session reports Read them 2 reports from the groups’ facilitators, with names. Only you and admins read them."), textOf(tab));
    for (const name of ["Chloe", "Kofi", "Farah", "Rahul", "Sofia"]) assert.ok(!tab.includes(name), `the tab names ${name}`);
    const noRun = renderToStaticMarkup(createElement(LeadSurveysTab, { view, base: BASE, reports: null }));
    assert.ok(!noRun.includes("/surveys/reports"), "a programme with no run is offered its reports");

    // The tab counts only once its own gate has answered, and only the run it names.
    const tabPage = readFileSync(join(SRC, TABS_DIR, "surveys", "page.tsx"), "utf8");
    const code = tabPage.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.ok(code.indexOf('if (outcome.status === "not-yours") {') < code.indexOf("countRunSessionReports(db, view.run.id)"));
  });
});

// ---------------------------------------------------------------------------
// 5. What takes reports away
// ---------------------------------------------------------------------------

/**
 * The store, with `count()` on every query it hands out, answered by counting
 * what the query returns. Everything else is the store's own.
 */
function counting(target) {
  return new Proxy(target, {
    get(object, property) {
      const value = object[property];
      if (property === "count" && object.isQuery) {
        return () => ({
          get: async () => {
            const snap = await object.get();
            return { data: () => ({ count: snap.docs.length }) };
          },
        });
      }
      if (typeof value === "function" && ["collection", "doc", "where", "limit", "select"].includes(property)) {
        return (...args) => counting(value.apply(object, args));
      }
      return typeof value === "function" ? value.bind(object) : value;
    },
  });
}

describe("5. what takes reports away", () => {
  beforeEach(async () => {
    assert.equal((await send("rahul")).status, 200);
    assert.equal((await send("sofia", withAnswers({ how: 2, engaged: [{ uid: "chloe", note: "Kept going." }], notRead: [], needsHand: [] }))).status, 200);
    assert.equal((await send("sofia", { sessionKey: "w03", answers: { how: 5, engaged: [{ uid: "amara", note: "" }] } }, { groupId: A })).status, 200);
    // Another run's report, which no cascade here may touch.
    world.db.seed("courseSessionReports/elsewhere", {
      runId: "another-run",
      groupId: "another-group",
      sessionKey: "w01",
      weekNumber: 1,
      writerUid: "sofia",
      answers: { how: 3, engaged: [{ uid: "chloe", note: "" }] },
      aboutUids: ["chloe"],
    });
  });

  test("deleting an account takes the person out of every report that picks them, and nothing else of the report", async () => {
    assert.equal(await accountDeletion.clearSessionReports(world.courseDb, "kofi"), 1);
    const rahuls = world.db.read(reportPath("rahul"));
    assert.deepEqual(rahuls.answers.engaged, [{ uid: "chloe", note: "Brought the compute reading into the race debate." }]);
    assert.deepEqual(rahuls.answers.needsHand, []);
    assert.deepEqual(rahuls.answers.notRead, ["farah"]);
    assert.deepEqual(rahuls.aboutUids, ["chloe", "farah"]);
    assert.equal(rahuls.writerUid, "rahul");
    assert.equal(rahuls.answers.wentWell, "The race discussion got everyone talking; Chloe and Kofi disagreed well.\nMore of that.", "typed words stay as they are");
    assert.ok(!JSON.stringify(reportPaths().map((path) => [path, world.db.read(path)])).includes('"kofi"'), "a report still holds Kofi's account");

    // Chloe is in three reports, one of them another run's.
    assert.equal(await accountDeletion.clearSessionReports(world.courseDb, "chloe"), 3);
    assert.deepEqual(world.db.read("courseSessionReports/elsewhere").aboutUids, []);
    assert.equal(await accountDeletion.clearSessionReports(world.courseDb, "nobody"), 0);
  });

  test("deleting a writer's account keeps their reports for the lead and admins, with no writer at all, id included", async () => {
    const before = world.db.read(reportPath("sofia"));
    assert.equal(await accountDeletion.clearSessionReports(world.courseDb, "sofia"), 3);
    const left = reportPaths();
    assert.equal(left.length, 4, "a report was lost");
    assert.ok(left.includes(reportPath("rahul")));
    assert.ok(!left.some((path) => path.includes("sofia")), `a report's id still names its writer: ${left}`);
    const kept = left.filter((path) => world.db.read(path).writerUid === null);
    assert.equal(kept.length, 3);
    const moved = kept.map((path) => world.db.read(path)).find((report) => report.groupId === B && report.sessionKey === "w02");
    assert.deepEqual(moved.answers, before.answers);
    assert.equal(moved.sentAt.toISOString(), before.sentAt.toISOString());
    assert.ok(!JSON.stringify(left.map((path) => world.db.read(path))).includes('"sofia"'), "a report still holds Sofia's account");

    // The lead reads them still, written by a former facilitator.
    const weeks = await readers.readRunSessionReports(world.courseDb, RUN.agi);
    assert.deepEqual(
      weeks.map((week) => [week.weekNumber, week.reports.map((report) => `${report.groupName} · ${report.writerName}`)]),
      [
        [3, ["Group A · A former facilitator"]],
        [2, ["Group B · A former facilitator", "Group B · Rahul"]],
      ],
    );
  });

  test("the account's cascade runs the sweep in a step of its own, counts it, and a failure is reported rather than fatal", () => {
    const source = readFileSync(join(SRC, "lib", "firestore", "accountDeletion.ts"), "utf8");
    assert.match(source, /^\s*courseSessionReportsCleared: number;/m);
    assert.match(source, /^\s*courseSessionReportsCleared: 0,/m);
    assert.match(
      source,
      /try \{\s*summary\.courseSessionReportsCleared = await clearSessionReports\(db, uid\);\s*\} catch \(err\) \{[^}]*partialFailure = true;/,
    );
    assert.match(source, /\.where\("aboutUids", "array-contains", uid\)/);
    assert.match(source, /\.where\("writerUid", "==", uid\)/);
  });

  test("destroying the run counts its reports, deletes every one, and no other run's", async () => {
    world.db.poke(`courseRuns/${RUN.agi}`, { status: "completed" });
    const db = counting(world.courseDb);
    const counts = await courseDeletion.countRunDestroyTargets(db, normalizeCourseRun(RUN.agi, world.db.read(`courseRuns/${RUN.agi}`)));
    assert.equal(counts.sessionReports, 3);
    const result = await courseDeletion.destroyRunCascade(db, null, RUN.agi, { actorUid: "zach", actorName: "Zach Levin" });
    assert.equal(result.deleted.sessionReports, 3);
    assert.deepEqual(reportPaths(), ["courseSessionReports/elsewhere"]);
  });

  test("reports drain with the run's leaves, before the groups they are about, and the dialog names them", () => {
    const engine = readFileSync(join(SRC, "lib", "firestore", "courseDeletion.ts"), "utf8");
    const table = engine.slice(engine.indexOf("const stages: Array<"), engine.indexOf("\n  ];", engine.indexOf("const stages: Array<")));
    const order = [...table.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
    assert.ok(order.indexOf("sessionReports") > -1 && order.indexOf("sessionReports") < order.indexOf("groups"));
    assert.match(table, /drainQuery\(db, COURSE_SESSION_REPORTS_COLLECTION, byRunId\(COURSE_SESSION_REPORTS_COLLECTION\), budget\)/);
    const dialog = readFileSync(join(SRC, "features", "courses", "useDestroy.ts"), "utf8");
    assert.match(dialog, /sessionReports: \{\s*label: "Session reports",\s*fate: "destroyed",/);
  });
});

// ---------------------------------------------------------------------------
// 6. Every file that addresses reports, every caller of their readers, and never the notes
// ---------------------------------------------------------------------------

/**
 * THE TREE. A report is written only by its route and read only on the
 * server, by a page that has already decided its reader may see it. It is
 * never filed in the notes admins keep about a person. So every file under
 * `src` that addresses `courseSessionReports` is listed here with what it
 * does, every caller of the readers is listed with its gate, and nothing of
 * the notes' code reaches either. A new file fails this section until
 * somebody decides what it is.
 */
const ADDRESSERS = {
  "lib/firestore/courseSessionReports.ts": "the record: its shape, its limits and its normaliser",
  "lib/courses/sessionReports/context.ts": "the writer's gate and the session's people, and the writer's own report, server-only",
  "lib/courses/sessionReports/readers.ts": "the lead's and admins' reader and the tab's count, server-only, called after a page's gate",
  "app/api/courses/groups/[groupId]/session-report/route.ts": "the one writer, a live facilitator of the group, their own report",
  "lib/firestore/courseDeletion.ts": "destroying the run counts the reports and drains them",
  "lib/firestore/accountDeletion.ts": "deleting an account takes it out of every report, and unsigns the reports it wrote",
};
const READER_CALLERS = {
  "lib/courses/sessionReports/page.ts": "the facilitator's page's loader, after the writer's own gate: only the caller's own report",
  "app/(app)/learn/[runId]/group/[groupId]/report/page.tsx": "the facilitator's page: a live facilitator of the group, their own report",
  "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/reports/page.tsx":
    "the programme's reports: its lead and admins",
  "app/(app)/admin/admissions/forms/[roundId]/programmes/[programmeId]/(tabs)/surveys/page.tsx":
    "the Surveys tab: a count for its lead and admins, never what a report says",
};
/** What reads a report: the readers and the own-report loaders. */
const READERS = /\b(?:readRunSessionReports|countRunSessionReports|ownReportView|readOwnReport|loadReportPage)\s*\(/;

function sourceFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(path);
  }
  return out;
}
const inSrc = (path) => relative(SRC, path).split(sep).join("/");

describe("6. every file that addresses reports, every caller of their readers, and never the notes kept about a person", () => {
  const files = sourceFiles().map((path) => [inSrc(path), readFileSync(path, "utf8")]);
  assert.ok(files.length > 500, `the walk found only ${files.length} files: it is not reading the tree`);
  const DEFINES = new Set(["lib/courses/sessionReports/readers.ts", "lib/courses/sessionReports/context.ts"]);

  test("the files that address courseSessionReports are the record, the gate, the reader, the route and the two deletions", () => {
    const addressing = files
      .filter(([, code]) => /COURSE_SESSION_REPORTS_COLLECTION|["'`]courseSessionReports["'`]/.test(code))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(addressing, Object.keys(ADDRESSERS).sort());
  });

  test("the readers are called by the gated pages and nothing else, and no client file reaches them", () => {
    const callers = files
      .filter(([file, code]) => !DEFINES.has(file) && READERS.test(code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
      .map(([file]) => file)
      .sort();
    assert.deepEqual(callers, Object.keys(READER_CALLERS).sort());
    for (const [file, code] of files) {
      if (!/^\s*["']use client["'];?/.test(code)) continue;
      assert.doesNotMatch(code, /from "@\/lib\/courses\/sessionReports\/(?:readers|context|page)"/, `${file} is a client file and imports a report reader`);
    }
    for (const file of ["context.ts", "readers.ts", "page.ts"]) {
      assert.match(readFileSync(join(SRC, "lib", "courses", "sessionReports", file), "utf8"), /^import "server-only";/, `${file} is not server-only`);
    }
  });

  test("the one writer writes, and nothing else writes a report but the two deletions", () => {
    for (const [file, code] of files) {
      if (!(file in ADDRESSERS)) continue;
      const writes = /\b(?:tx|batch)\.(?:set|update|create)\(|\.collection\(COURSE_SESSION_REPORTS_COLLECTION\)[^;]*\.(?:set|update|add|create)\(/.test(code) &&
        /COURSE_SESSION_REPORTS_COLLECTION/.test(code);
      const may = ["app/api/courses/groups/[groupId]/session-report/route.ts", "lib/firestore/accountDeletion.ts", "lib/firestore/courseDeletion.ts"];
      if (!may.includes(file)) assert.equal(writes, false, `${file} writes a report`);
    }
    const route = readFileSync(join(SRC, "app", "api", "courses", "groups", "[groupId]", "session-report", "route.ts"), "utf8");
    assert.match(route, /tx\.set\(ref, \{/, "the one writer no longer writes a report");
    assert.doesNotMatch(route, /export (?:async )?function (?:GET|POST|PATCH|DELETE)\b/, "the route answers more than PUT");
  });

  test("the notes kept about a person never read a report, and no report reader reads a note", () => {
    const NOTES = (file) =>
      file.startsWith("lib/memberNotes/") ||
      file.startsWith("app/api/admin/members/[uid]/notes/") ||
      file.startsWith("features/admin/memberNotes/") ||
      /memberNotes|MemberNotes/.test(file);
    const notesFiles = files.filter(([file]) => NOTES(file));
    assert.ok(notesFiles.length >= 3, `the walk found only ${notesFiles.length} files of the notes kept about a person`);
    for (const [file, code] of notesFiles) {
      assert.doesNotMatch(code, /sessionReports|SessionReport|courseSessionReports/, `${file} reaches session reports`);
    }
    // The two cascades are left out: each deletes from every collection that
    // holds somebody's records, the notes among them, and reads none of it.
    const CASCADES = ["lib/firestore/accountDeletion.ts", "lib/firestore/courseDeletion.ts"];
    for (const [file, code] of files) {
      if (CASCADES.includes(file)) continue;
      if (!file.startsWith("lib/courses/sessionReports/") && !(file in ADDRESSERS) && !(file in READER_CALLERS)) continue;
      assert.doesNotMatch(code, /from "@\/lib\/memberNotes|MEMBER_NOTES_COLLECTION|["'`]memberNotes["'`]/, `${file} reaches the notes kept about a person`);
    }
  });

  test("every read of a report is one equality or one array-contains on one field, so none needs a declared index", () => {
    const queries = [];
    for (const file of Object.keys(ADDRESSERS)) {
      const code = readFileSync(join(SRC, file), "utf8");
      const at = code.indexOf("COURSE_SESSION_REPORTS_COLLECTION");
      if (at === -1) continue;
      for (const [, clause] of code.matchAll(/\.collection\((?:COURSE_SESSION_REPORTS_COLLECTION)\)((?:\s*\.where\([^)]*\))+)/g)) {
        queries.push([file, [...clause.matchAll(/\.where\(([^)]*)\)/g)].map((m) => m[1])]);
      }
    }
    for (const [file, wheres] of queries) assert.equal(wheres.length, 1, `${file} asks ${wheres.join(" and ")}`);
    for (const code of Object.keys(ADDRESSERS).map((file) => readFileSync(join(SRC, file), "utf8"))) {
      assert.doesNotMatch(code.slice(code.indexOf("COURSE_SESSION_REPORTS_COLLECTION")), /COURSE_SESSION_REPORTS_COLLECTION\)[^;]*\.orderBy\(/);
    }
  });
});
