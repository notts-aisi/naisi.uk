/**
 * The report beside the work (privacy policy v15, "Session reports": "The
 * programme's lead and admins read these. You don't see them on the site"):
 * on a written answer's review page, what that week's session reports say
 * about the person whose answer it is, their own lines and nothing else of a
 * report.
 *
 * Run with `npm test` (Node's built-in runner, no emulator). Real handlers and
 * pages from the written answers world (`tests/lib/writtenAnswersWorld.mjs`:
 * AGI Strategy's run on Tue 17 Nov 2026 at noon; Group B meets on Tuesdays at
 * 6pm with Rahul and Sofia, its fellows Chloe, Farah and Kofi; Group C meets
 * with Tom; Claudia leads the programme, Tess another; Lloyd reviews it;
 * Yusuf is the run's track lead; Zach is an admin), the reports written
 * through the session report route itself, against an in-memory database.
 *
 *  1. The rule, pure: whose reports' lines each reader sees, and that only
 *     the person's own lines leave a report.
 *  2. The page as every caller: the programme's lead and admins see every
 *     report's lines about the person, on both review pages; a facilitator
 *     sees only the lines of the report they wrote, never the other
 *     facilitator's; everybody else is sent away and handed none.
 *  3. Only the person's own lines, never the rest of a report: the page's
 *     payload, another person's answer, another week, another run, a writer
 *     whose account was deleted, a week that met twice.
 *  4. Gate before data: what the page asks of the reports, as every caller.
 *  5. Never the person: their own pages, and their own answer.
 *  6. The words, and a card that draws nothing when there is nothing.
 *
 * Every word in the reports is made up; every address is on example.com.
 */
import { beforeEach, describe, mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { B, NOW, RUN, makeWrittenAnswersWorld, textOf } from "./lib/writtenAnswersWorld.mjs";

mock.timers.enable({ apis: ["Date"], now: NOW });

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(REPO_ROOT, path), "utf8");

const w = await makeWrittenAnswersWorld("__reportBesideWork");
const reportRoute = await w.courseRoute("groups", "[groupId]", "session-report");
const beside = await w.loadTs("lib/courses/sessionReports/beside.ts");
const words = await w.loadTs("lib/courses/sessionReports/words.ts");
const record = await w.loadTs("lib/firestore/courseSessionReports.ts");
const accountDeletion = await w.loadTs("lib/firestore/accountDeletion.ts");
const { default: SessionReportLines } = await w.loadTs("features/courses/written/SessionReportLines.tsx");

beforeEach(() => {
  w.reset();
});

/** A sentence of `n` words. */
const sentence = (n, word = "lamp") => Array.from({ length: n }, () => word).join(" ");

/** Before Group B's week 2 due moment (noon, Mon 9 Nov): Sun 8 Nov at 10am. */
const BEFORE_DUE_2 = "2026-11-08T10:00:00Z";

/** Chloe and Farah submit week 2 before Group B meets for it; Kofi saves a draft and never submits it. */
async function weekTwoWritten() {
  w.at(BEFORE_DUE_2);
  assert.equal((await w.write("chloe", 2, { text: sentence(25) }, { send: true })).status, 200);
  assert.equal((await w.write("farah", 2, { text: sentence(30, "keeper") }, { send: true })).status, 200);
  assert.equal((await w.write("kofi", 2, { text: sentence(5, "beacon") })).status, 200);
  w.at(NOW);
}

/** What Rahul's report says about Chloe, and what Sofia's does. */
const RAHUL_ON_CHLOE = "Brought the compute reading into the race debate.";
const SOFIA_ON_CHLOE = "Quiet tonight; worth a word before week 3.";
const RAHUL_ON_FARAH = "Comes straight from a lab; missed the first half hour.";

/**
 * Rahul's report on Group B's week 2: Chloe and Kofi engaged well, Farah
 * seemed not to have done the readings and might need a hand. Every free-text
 * answer, and every line about somebody other than Chloe, carries a word in
 * capitals that no page about Chloe may hold.
 */
const RAHUL = {
  sessionKey: "w02",
  answers: {
    how: 4,
    wentWell: "WENTWELL the race debate got everyone talking.",
    didnt: "DIDNOTGO ran ten minutes over.",
    unclear: ["something-else"],
    engaged: [
      { uid: "chloe", note: RAHUL_ON_CHLOE },
      { uid: "kofi", note: "ABOUTKOFI asked the sharpest question." },
    ],
    notRead: ["farah"],
    needsHand: [{ uid: "farah", note: RAHUL_ON_FARAH }],
    forLead: "FORTHELEAD the room is too small.",
  },
};

/** Sofia's: Kofi engaged well; Chloe seemed not to have done the readings, and might need a hand. */
const SOFIA = {
  sessionKey: "w02",
  answers: {
    how: 3,
    wentWell: "WENTWELL pairs worked.",
    didnt: "DIDNOTGO the video would not play.",
    unclear: [],
    engaged: [{ uid: "kofi", note: "ABOUTKOFI kept the pairs going." }],
    notRead: ["chloe"],
    needsHand: [{ uid: "chloe", note: SOFIA_ON_CHLOE }],
    forLead: "FORTHELEAD one more chair.",
  },
};

/** Everything a report says that is not a line about Chloe, and the shape of a stored report. */
const NOT_ABOUT_CHLOE = /WENTWELL|DIDNOTGO|FORTHELEAD|ABOUTKOFI|Comes straight from a lab|something-else|aboutUids|writerUid|courseSessionReports|__w02__/;

/** `who` sends their own report on Group B's week 2, through the route. */
const send = (who, body) => w.call(who, reportRoute.PUT, { groupId: B }, { body, course: true });

/** Both of Group B's facilitators report on week 2: Rahul at noon, Sofia five minutes later. */
async function bothReport() {
  assert.equal((await send("rahul", RAHUL)).status, 200);
  w.at("2026-11-17T12:05:00Z");
  assert.equal((await send("sofia", SOFIA)).status, 200);
  w.at(NOW);
}

/** What the page was handed beside the open answer, or undefined when it drew no review page. */
const linesOf = (page) => page.element?.props?.model?.selected?.reportLines;

/** The whole payload a page hands the browser: the review page's props. */
const payloadOf = (page) => JSON.stringify(page.element?.props ?? null);

const reportPath = (writer, sessionKey = "w02") => `courseSessionReports/${record.sessionReportId(RUN.agi, B, sessionKey, writer)}`;

/** Every lead's and admin's view of Chloe's week 2 answer, on both review pages. */
async function staffPages(who) {
  return [
    await w.writtenPage(who, { week: "2", person: "chloe" }),
    await w.leadPage(who, { group: B, week: "2", person: "chloe" }),
  ];
}

/** Both reports, as the lead and admins see them beside Chloe's answer. */
const EVERY_ON_CHLOE = {
  whose: "every",
  reports: [
    { by: "Rahul", mine: false, occurrence: 1, lines: [{ kind: "engaged", note: RAHUL_ON_CHLOE }] },
    {
      by: "Sofia",
      mine: false,
      occurrence: 1,
      lines: [
        { kind: "notRead", note: "" },
        { kind: "needsHand", note: SOFIA_ON_CHLOE },
      ],
    },
  ],
};

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Each line as the card names it: the lead's page's names for the answers. */
const LABEL = { engaged: "Engaged well", notRead: "Seemed not to have done the readings", needsHand: "Might need a hand" };

// ---------------------------------------------------------------------------
// 1. The rule, pure
// ---------------------------------------------------------------------------

describe("1. the rule: whose reports' lines a reader sees, and only the person's own lines of each", () => {
  const reader = (uid, over = {}) => ({ uid, isAdmin: false, isLead: false, ...over });

  test("an admin and the programme's lead see every report's; anybody else who may review the answer, a facilitator, only their own; the person and anybody else nothing", () => {
    assert.deepEqual(beside.besideScopeOf(reader("zach", { isAdmin: true }), "chloe", true), { whose: "every", readerUid: "zach" });
    assert.deepEqual(beside.besideScopeOf(reader("claudia", { isLead: true }), "chloe", true), { whose: "every", readerUid: "claudia" });
    // A lead or admin who also facilitates reads as the lead or the admin.
    assert.deepEqual(beside.besideScopeOf(reader("claudia", { isLead: true, isAdmin: false }), "farah", true).whose, "every");
    assert.deepEqual(beside.besideScopeOf(reader("rahul"), "chloe", true), { whose: "own", readerUid: "rahul" });
    // Nobody reads what the reports say about themselves, an admin included.
    assert.equal(beside.besideScopeOf(reader("rahul"), "rahul", true), null);
    assert.equal(beside.besideScopeOf(reader("zach", { isAdmin: true }), "zach", true), null);
    // Nobody the review page does not let review the answer, the lead of another programme included.
    assert.equal(beside.besideScopeOf(reader("tess", { isLead: false }), "chloe", false), null);
    assert.equal(beside.besideScopeOf(reader("zach", { isAdmin: true }), "chloe", false), null);
    assert.equal(beside.besideScopeOf(reader(""), "chloe", true), null);
  });

  /** A stored report as the route keeps one, read back through the record's normaliser. */
  const stored = (id, over = {}) =>
    record.normalizeSessionReport(id, {
      runId: RUN.agi,
      groupId: B,
      sessionKey: "w02",
      weekNumber: 2,
      occurrence: 1,
      writerUid: "rahul",
      answers: RAHUL.answers,
      sentAt: new Date("2026-11-17T12:00:00Z"),
      updatedAt: new Date("2026-11-17T12:00:00Z"),
      ...over,
    });

  test("a report's lines about one person: what picked them and the words about them, in the form's order, and nothing else", () => {
    const report = stored("r");
    assert.deepEqual(beside.linesAbout(report, "chloe"), [{ kind: "engaged", note: RAHUL_ON_CHLOE }]);
    assert.deepEqual(beside.linesAbout(report, "farah"), [
      { kind: "notRead", note: "" },
      { kind: "needsHand", note: RAHUL_ON_FARAH },
    ]);
    assert.deepEqual(beside.linesAbout(report, "omar"), []);
    // Picked by all three answers: the form's order.
    const all = stored("all", {
      answers: { how: 2, engaged: [{ uid: "kofi", note: "a" }], notRead: ["kofi"], needsHand: [{ uid: "kofi", note: "b" }] },
    });
    assert.deepEqual(beside.linesAbout(all, "kofi").map((line) => line.kind), ["engaged", "notRead", "needsHand"]);
  });

  test("the reports a reader sees: this run and this week, a facilitator's own alone whatever was asked, oldest first by session, and none that says nothing", () => {
    const reports = [
      stored("late", { writerUid: "sofia", answers: SOFIA.answers, sentAt: new Date("2026-11-17T12:05:00Z") }),
      stored("early"),
      stored("second", { sessionKey: "w02-2", occurrence: 2, sentAt: new Date("2026-11-11T09:00:00Z") }),
      stored("week1", { sessionKey: "w01", weekNumber: 1 }),
      stored("elsewhere", { runId: "another-run" }),
      stored("silent", { writerUid: "sofia", answers: { how: 5, engaged: [{ uid: "kofi", note: "" }] } }),
    ];
    const input = { runId: RUN.agi, uid: "chloe", weekNumber: 2 };
    const every = beside.reportsAbout(reports, { ...input, scope: { whose: "every", readerUid: "claudia" } });
    assert.deepEqual(every.map(({ report }) => report.id), ["early", "late", "second"]);
    const own = beside.reportsAbout(reports, { ...input, scope: { whose: "own", readerUid: "sofia" } });
    assert.deepEqual(own.map(({ report }) => report.id), ["late"]);
    // A report whose writer's account was deleted is nobody's own.
    const unsigned = stored("gone", { writerUid: null });
    assert.equal(unsigned.writerUid, null);
    assert.deepEqual(beside.reportsAbout([unsigned], { ...input, scope: { whose: "own", readerUid: "rahul" } }), []);
    assert.equal(beside.reportsAbout([unsigned], { ...input, scope: { whose: "every", readerUid: "zach" } }).length, 1);
  });

  test("the projection: who wrote each, whether the reader did, its session and its lines about the person, and not one thing more", () => {
    const reports = [stored("early"), stored("gone", { writerUid: null, sentAt: new Date("2026-11-17T12:10:00Z") })];
    const scope = { whose: "every", readerUid: "zach" };
    const view = beside.reportLinesView(beside.reportsAbout(reports, { runId: RUN.agi, uid: "chloe", weekNumber: 2, scope }), scope, (uid) =>
      uid === "rahul" ? "Rahul" : "",
    );
    assert.deepEqual(view, {
      whose: "every",
      reports: [
        { by: "Rahul", mine: false, occurrence: 1, lines: [{ kind: "engaged", note: RAHUL_ON_CHLOE }] },
        { by: "A former facilitator", mine: false, occurrence: 1, lines: [{ kind: "engaged", note: RAHUL_ON_CHLOE }] },
      ],
    });
    assert.doesNotMatch(JSON.stringify(view), NOT_ABOUT_CHLOE);
    assert.doesNotMatch(JSON.stringify(view), /rahul|kofi|farah|early|gone|"how"|parts|sentAt|groupId|runId/);
    // The reader's own report is named by nobody: the page says it is theirs.
    const own = { whose: "own", readerUid: "rahul" };
    assert.deepEqual(
      beside.reportLinesView(beside.reportsAbout(reports, { runId: RUN.agi, uid: "chloe", weekNumber: 2, scope: own }), own, () => "Rahul"),
      { whose: "own", reports: [{ by: "", mine: true, occurrence: 1, lines: [{ kind: "engaged", note: RAHUL_ON_CHLOE }] }] },
    );
  });
});

// ---------------------------------------------------------------------------
// 2. The page as every caller
// ---------------------------------------------------------------------------

describe("2. the review page as every caller", () => {
  test("an admin and the programme's lead see every report's lines about the person, on both review pages, each under its writer", async () => {
    await weekTwoWritten();
    await bothReport();
    for (const who of ["zach", "claudia"]) {
      for (const page of await staffPages(who)) {
        assert.equal(page.element.props.model.selected.person.uid, "chloe", who);
        assert.deepEqual(linesOf(page), EVERY_ON_CHLOE, who);
        assert.match(
          page.text,
          new RegExp(
            `${escape(words.BESIDE_WORDS.every)} Not shown to Chloe Rahul Engaged well “${escape(RAHUL_ON_CHLOE)}” ` +
              `Sofia Seemed not to have done the readings Might need a hand “${escape(SOFIA_ON_CHLOE)}”`,
          ),
          who,
        );
      }
    }
  });

  test("a lead who also facilitates the group sees every report's lines, as the lead", async () => {
    await weekTwoWritten();
    await bothReport();
    const group = w.world.db.read(`courseGroups/${B}`);
    w.world.db.poke(`courseGroups/${B}`, { facilitatorUids: [...group.facilitatorUids, "claudia"] });
    assert.deepEqual(linesOf(await w.writtenPage("claudia", { week: "2", person: "chloe" })), EVERY_ON_CHLOE);
  });

  test("a facilitator sees only the lines of the report they wrote, never the other facilitator's", async () => {
    await weekTwoWritten();
    // Before either has sent a report, neither is handed a line, and no card is drawn.
    for (const who of ["rahul", "sofia"]) {
      const page = await w.writtenPage(who, { week: "2", person: "chloe" });
      assert.deepEqual(linesOf(page), { whose: "own", reports: [] }, who);
      assert.doesNotMatch(page.text, /From your session report|From the session reports|Not shown to Chloe/, who);
    }
    await bothReport();
    for (const [who, lines, never] of [
      ["rahul", [{ kind: "engaged", note: RAHUL_ON_CHLOE }], SOFIA_ON_CHLOE],
      [
        "sofia",
        [
          { kind: "notRead", note: "" },
          { kind: "needsHand", note: SOFIA_ON_CHLOE },
        ],
        RAHUL_ON_CHLOE,
      ],
    ]) {
      const page = await w.writtenPage(who, { week: "2", person: "chloe" });
      assert.equal(page.element.props.model.selected.person.uid, "chloe", who);
      assert.deepEqual(linesOf(page), { whose: "own", reports: [{ by: "", mine: true, occurrence: 1, lines }] }, who);
      assert.ok(!payloadOf(page).includes(never), `${who} is handed the other facilitator's line`);
      assert.ok(!page.html.includes(never), `${who} is shown the other facilitator's line`);
      assert.match(page.text, new RegExp(`${escape(words.BESIDE_WORDS.own)} Not shown to Chloe ${lines.map((line) => LABEL[line.kind]).join(" ")}`), who);
      assert.doesNotMatch(page.text, /From the session reports|\bRahul Engaged well|\bSofia Seemed/, `${who}'s card names a writer`);
    }
  });

  test("everybody else is sent away from both review pages, and handed no line", async () => {
    await weekTwoWritten();
    await bothReport();
    for (const who of ["tess", "lloyd", "yusuf", "tom", "chloe", "farah", "kofi", "amara", null]) {
      for (const page of [await w.writtenPage(who, { week: "2", person: "chloe" }), await w.leadPage(who, { group: B, week: "2", person: "chloe" })]) {
        assert.equal(linesOf(page), undefined, `${who} is drawn a review page`);
        assert.ok(!payloadOf(page).includes(RAHUL_ON_CHLOE) && !payloadOf(page).includes(SOFIA_ON_CHLOE), `${who} is handed a line`);
        assert.ok(!page.html.includes(RAHUL_ON_CHLOE) && !page.html.includes(SOFIA_ON_CHLOE), `${who} is shown a line`);
      }
      // The group's own page is where the review page sends them: the run's home, or signing in.
      const own = await w.writtenPage(who, { week: "2", person: "chloe" });
      assert.ok(own.to === `/learn/${RUN.agi}` || own.to === "/learn" || own.to === "/login", `${who} was sent to ${own.to}`);
    }
  });

  test("reading the lines writes nothing and emails nobody", async () => {
    await weekTwoWritten();
    await bothReport();
    const before = w.everything();
    const mail = w.world.mail.length;
    for (const who of ["zach", "claudia", "rahul", "sofia"]) {
      const page = await w.writtenPage(who, { week: "2", person: "chloe" });
      assert.equal(page.wrote, false, who);
    }
    assert.equal(w.everything(), before);
    assert.equal(w.world.mail.length, mail);
  });
});

// ---------------------------------------------------------------------------
// 3. Only the person's own lines
// ---------------------------------------------------------------------------

describe("3. only the person's own lines, never the rest of a report", () => {
  test("the page's whole payload holds nothing else a report says, for every reader handed lines", async () => {
    await weekTwoWritten();
    await bothReport();
    const pages = [...(await staffPages("zach")), ...(await staffPages("claudia")), await w.writtenPage("rahul", { week: "2", person: "chloe" }), await w.writtenPage("sofia", { week: "2", person: "chloe" })];
    for (const page of pages) {
      assert.doesNotMatch(payloadOf(page), NOT_ABOUT_CHLOE);
      assert.doesNotMatch(page.html, NOT_ABOUT_CHLOE);
      const view = linesOf(page);
      assert.deepEqual(Object.keys(view).sort(), ["reports", "whose"]);
      for (const report of view.reports) {
        assert.deepEqual(Object.keys(report).sort(), ["by", "lines", "mine", "occurrence"]);
        for (const line of report.lines) assert.deepEqual(Object.keys(line).sort(), ["kind", "note"]);
      }
    }
  });

  test("another person's answer carries that person's lines alone", async () => {
    await weekTwoWritten();
    await bothReport();
    for (const who of ["zach", "rahul"]) {
      const page = await w.writtenPage(who, { week: "2", person: "farah" });
      assert.equal(page.element.props.model.selected.person.uid, "farah");
      assert.deepEqual(linesOf(page).reports, [
        {
          by: who === "zach" ? "Rahul" : "",
          mine: who === "rahul",
          occurrence: 1,
          lines: [
            { kind: "notRead", note: "" },
            { kind: "needsHand", note: RAHUL_ON_FARAH },
          ],
        },
      ]);
      assert.ok(!payloadOf(page).includes(RAHUL_ON_CHLOE) && !payloadOf(page).includes(SOFIA_ON_CHLOE), `${who} is handed Chloe's lines beside Farah's answer`);
    }
    // Sofia's report says nothing about Farah: Sofia is handed nothing beside Farah's answer.
    assert.deepEqual(linesOf(await w.writtenPage("sofia", { week: "2", person: "farah" })), { whose: "own", reports: [] });
  });

  test("another week's report and another run's are not this week's", async () => {
    await weekTwoWritten();
    await bothReport();
    // Rahul's report on week 1, sent while it was open, and one on week 3 and one on another run, put there whole.
    w.at("2026-11-04T09:00:00Z");
    assert.equal((await send("rahul", { sessionKey: "w01", answers: { how: 4, engaged: [{ uid: "chloe", note: "WEEKONE carried the room." }] } })).status, 200);
    w.at(NOW);
    w.world.db.seed(reportPath("rahul", "w03"), {
      runId: RUN.agi,
      groupId: B,
      sessionKey: "w03",
      weekNumber: 3,
      occurrence: 1,
      writerUid: "rahul",
      answers: { how: 3, engaged: [{ uid: "chloe", note: "WEEKTHREE early." }] },
      aboutUids: ["chloe"],
    });
    w.world.db.seed("courseSessionReports/another-run__g__w02__rahul", {
      runId: "another-run",
      groupId: "g",
      sessionKey: "w02",
      weekNumber: 2,
      occurrence: 1,
      writerUid: "rahul",
      answers: { how: 3, engaged: [{ uid: "chloe", note: "ANOTHERRUN elsewhere." }] },
      aboutUids: ["chloe"],
    });
    for (const who of ["zach", "claudia", "rahul"]) {
      const page = await w.writtenPage(who, { week: "2", person: "chloe" });
      assert.doesNotMatch(payloadOf(page), /WEEKONE|WEEKTHREE|ANOTHERRUN/, who);
    }
    assert.deepEqual(linesOf(await w.writtenPage("zach", { week: "2", person: "chloe" })), EVERY_ON_CHLOE);
  });

  test("a report whose writer's account was deleted is still the lead's and admins', by a former facilitator, and nobody's own", async () => {
    await weekTwoWritten();
    await bothReport();
    // Sofia's account is deleted: her reports stay, with no writer at all.
    assert.equal(await accountDeletion.clearSessionReports(w.world.courseDb, "sofia"), 1);
    for (const who of ["zach", "claudia"]) {
      assert.deepEqual(linesOf(await w.writtenPage(who, { week: "2", person: "chloe" })).reports.map((report) => [report.by, report.mine, report.lines.length]), [
        ["Rahul", false, 1],
        ["A former facilitator", false, 2],
      ]);
    }
    // Rahul still reads only his own.
    assert.deepEqual(linesOf(await w.writtenPage("rahul", { week: "2", person: "chloe" })).reports.map((report) => report.lines), [[{ kind: "engaged", note: RAHUL_ON_CHLOE }]]);
    const text = (await w.writtenPage("zach", { week: "2", person: "chloe" })).text;
    assert.match(text, /A former facilitator Seemed not to have done the readings Might need a hand/);
  });

  test("a week that met twice: each report says which session it is on, and a facilitator's two read as theirs", async () => {
    await weekTwoWritten();
    await bothReport();
    // Rahul's report on the week's second session, put there whole.
    w.world.db.seed(reportPath("rahul", "w02-2"), {
      runId: RUN.agi,
      groupId: B,
      sessionKey: "w02-2",
      weekNumber: 2,
      occurrence: 2,
      writerUid: "rahul",
      answers: { how: 5, engaged: [], notRead: [], needsHand: [{ uid: "chloe", note: "Better on Thursday." }] },
      aboutUids: ["chloe"],
      sentAt: new Date("2026-11-13T20:00:00Z"),
      updatedAt: new Date("2026-11-13T20:00:00Z"),
    });
    const zach = await w.writtenPage("zach", { week: "2", person: "chloe" });
    assert.deepEqual(linesOf(zach).reports.map((report) => [report.by, report.occurrence]), [["Rahul", 1], ["Sofia", 1], ["Rahul", 2]]);
    assert.match(zach.text, /Rahul · Session 1 Engaged well .* Sofia · Session 1 Seemed not .* Rahul · Session 2 Might need a hand “Better on Thursday\.”/);
    const rahul = await w.writtenPage("rahul", { week: "2", person: "chloe" });
    assert.deepEqual(linesOf(rahul).reports.map((report) => [report.mine, report.occurrence]), [[true, 1], [true, 2]]);
    assert.match(rahul.text, new RegExp(`${escape(words.BESIDE_WORDS.ownMany)} Not shown to Chloe Session 1 Engaged well .* Session 2 Might need a hand`));
  });
});

// ---------------------------------------------------------------------------
// 4. Gate before data
// ---------------------------------------------------------------------------

/**
 * A page drawn with every ask of the reports recorded: each time the
 * collection is opened, and each clause asked of it. Nothing else changes.
 */
async function reportAsks(drawPage) {
  const asks = [];
  const collection = w.world.db.collection;
  w.world.db.collection = (path) => {
    const inner = collection(path);
    if (path !== record.COURSE_SESSION_REPORTS_COLLECTION) return inner;
    asks.push(["open"]);
    return {
      ...inner,
      where: (...clause) => {
        asks.push(clause);
        return inner.where(...clause);
      },
      doc: (id) => {
        asks.push(["doc", id]);
        return inner.doc(id);
      },
    };
  };
  try {
    const page = await drawPage();
    return { page, asks };
  } finally {
    w.world.db.collection = collection;
  }
}

describe("4. gate before data: what the page asks of the reports, as every caller", () => {
  test("an admin and the lead ask for the reports that pick the person; a facilitator only for the reports they wrote", async () => {
    await weekTwoWritten();
    await bothReport();
    for (const who of ["zach", "claudia"]) {
      const { asks } = await reportAsks(() => w.writtenPage(who, { week: "2", person: "chloe" }));
      assert.deepEqual(asks, [["open"], ["aboutUids", "array-contains", "chloe"]], who);
    }
    for (const who of ["rahul", "sofia"]) {
      const { asks } = await reportAsks(() => w.writtenPage(who, { week: "2", person: "chloe" }));
      assert.deepEqual(asks, [["open"], ["writerUid", "==", who]], `${who} asks for somebody else's reports`);
    }
  });

  test("nobody the page sends away, and nobody with no answer open, asks anything of the reports", async () => {
    await weekTwoWritten();
    await bothReport();
    for (const who of ["tess", "lloyd", "yusuf", "tom", "chloe", "farah", "amara", null]) {
      for (const drawPage of [() => w.writtenPage(who, { week: "2", person: "chloe" }), () => w.leadPage(who, { group: B, week: "2", person: "chloe" })]) {
        const { asks } = await reportAsks(drawPage);
        assert.deepEqual(asks, [], `${who} reached the reports`);
      }
    }
    // Week 3: nobody has sent an answer, so nobody's is open, and no report is asked for.
    for (const who of ["zach", "claudia", "rahul"]) {
      const { page, asks } = await reportAsks(() => w.writtenPage(who, { week: "3" }));
      assert.equal(page.element.props.model.selected, null, who);
      assert.deepEqual(asks, [], who);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. Never the person
// ---------------------------------------------------------------------------

describe("5. never the person", () => {
  test("the person's week page and programme home, and another fellow's, carry nothing of a report", async () => {
    await weekTwoWritten();
    await bothReport();
    for (const who of ["chloe", "farah"]) {
      const page = await w.weekPage(who, 2);
      assert.doesNotMatch(`${page.html} ${JSON.stringify(page.overview)} ${JSON.stringify(page.own)}`, new RegExp(`${escape(RAHUL_ON_CHLOE)}|${escape(SOFIA_ON_CHLOE)}|From the session reports|From your session report`), who);
    }
    const home = await w.programmeHome("chloe");
    assert.doesNotMatch(`${home.html} ${JSON.stringify(home.overview)}`, new RegExp(`${escape(RAHUL_ON_CHLOE)}|${escape(SOFIA_ON_CHLOE)}`));
  });

  test("nobody reads what a report says about themselves: a facilitator's own answer is the lead's and admins' alone", async () => {
    // Rahul's own week 2 answer, and a report on another group that picks him, put there whole.
    w.at(BEFORE_DUE_2);
    assert.equal((await w.write("rahul", 2, { text: sentence(25) }, { send: true })).status, 200);
    w.at(NOW);
    w.world.db.seed("courseSessionReports/about-rahul", {
      runId: RUN.agi,
      groupId: "another-group",
      sessionKey: "w02",
      weekNumber: 2,
      occurrence: 1,
      writerUid: "sofia",
      answers: { how: 4, needsHand: [{ uid: "rahul", note: "ABOUTRAHUL a word." }] },
      aboutUids: ["rahul"],
      sentAt: new Date("2026-11-11T09:00:00Z"),
    });
    for (const page of [await w.writtenPage("claudia", { week: "2", person: "rahul" }), await w.leadPage("zach", { group: B, week: "2", person: "rahul" })]) {
      assert.equal(page.element.props.model.selected.person.uid, "rahul");
      assert.deepEqual(linesOf(page).reports, [{ by: "Sofia", mine: false, occurrence: 1, lines: [{ kind: "needsHand", note: "ABOUTRAHUL a word." }] }]);
    }
    // Rahul's own answer is never open on his page, and Sofia, his co-facilitator, never reviews it: neither is handed the line.
    for (const who of ["rahul", "sofia"]) {
      const page = await w.writtenPage(who, { week: "2", person: "rahul" });
      assert.notEqual(page.element.props.model.selected?.person.uid, "rahul", who);
      assert.doesNotMatch(payloadOf(page), /ABOUTRAHUL/, who);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. The words, and the card
// ---------------------------------------------------------------------------

describe("6. the words, and a card that draws nothing when there is nothing", () => {
  test("the words: the lead's page's names for each line, no dash, no pronoun, never a mark, a grade or a score", () => {
    assert.equal(words.besideTitleWords("every", 1), "From the session reports");
    assert.equal(words.besideTitleWords("every", 3), "From the session reports");
    assert.equal(words.besideTitleWords("own", 1), "From your session report");
    assert.equal(words.besideTitleWords("own", 2), "From your session reports");
    assert.equal(words.besideNotShownWords("Chloe"), "Not shown to Chloe");
    assert.equal(words.besideNotShownWords(" "), "Not shown to the person whose answer it is");
    assert.equal(words.besideSessionWords(2), "Session 2");
    for (const [kind, label] of Object.entries(LABEL)) assert.equal(words.RUN_REPORTS_WORDS[kind], label, kind);
    const all = [
      ...Object.values(words.BESIDE_WORDS),
      words.besideTitleWords("own", 2),
      words.besideNotShownWords("Chloe"),
      words.besideSessionWords(2),
      read("src/features/courses/written/SessionReportLines.tsx").replace(/^\s*(?:\/\/|\*|\/\*\*).*$/gm, ""),
    ].join(" ");
    assert.doesNotMatch(all, /[–—]/, "a dash");
    assert.doesNotMatch(all, /\b(?:he|she|him|her|his|hers)\b/i, "a pronoun for a person");
    assert.doesNotMatch(all, /\b(?:mark|marks|marked|grade|grades|graded|score|scores|scored)\b/i);
  });

  test("the card draws nothing with no report saying anything, and holds nothing to press", () => {
    const draw = (view) => renderToStaticMarkup(createElement(SessionReportLines, { view, firstName: "Chloe" }));
    assert.equal(draw({ whose: "every", reports: [] }), "");
    assert.equal(draw({ whose: "own", reports: [] }), "");
    const html = draw(EVERY_ON_CHLOE);
    assert.match(textOf(html), /^From the session reports Not shown to Chloe Rahul Engaged well “/);
    assert.match(html, /<section[^>]*aria-labelledby="([^"]+)"[\s\S]*<h2 id="\1"/);
    assert.doesNotMatch(html, /<button|<a |<input|<textarea|<form/);
    // The reader's own report, on the lead's and admins' card, is theirs.
    const mine = draw({ whose: "every", reports: [{ ...EVERY_ON_CHLOE.reports[0], by: "", mine: true }] });
    assert.match(textOf(mine), /From the session reports Not shown to Chloe You Engaged well/);
  });
});
