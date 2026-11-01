/**
 * RUN NAISI › SURVEYS, BY WHAT EACH SURVEY IS FOR, AND RUN NAISI › REPORTS
 * (docs/surveys.md, "The admins' pages"), through the real pages over the
 * term's world (`tests/lib/termWorld.mjs`, Thu 10 Dec 2026: AGI Strategy's
 * before and end surveys sent and closed, Technical AI Safety's survey at the
 * end a draft, the Research incubator with no run, and two surveys after
 * events), with a survey about leaving, two check-ins and a survey of an
 * earlier programme whose form has gone added here.
 *
 *  1. WHO: only an admin is shown either tab or Reports; everybody else, a
 *     view-as session and somebody signed out are sent to the dashboard
 *     before anything is read.
 *  2. BY PROGRAMME: the term's programmes in the form's order, a row for every
 *     stage each will have, the survey at the end not sent yet due at the
 *     last session and never scheduled; then the earlier programme.
 *  3. EVERY SURVEY ONCE: walked from the records, every survey in the world is
 *     the way in of exactly one row on exactly one tab.
 *  4. EVENTS: each survey after an event, the newest first.
 *  5. REPORTS holds This term in numbers, Public numbers and Kairos, which each
 *     lead back to it. Then the layout itself, on records made here: the
 *     follow-ups' rows, an earlier programme on a form still there, and a
 *     survey of a kind no stage draws.
 *  6. NOTHING ABOUT A PERSON on either page, nothing written, every way in a
 *     target of at least 44px, and the words with no dash.
 *
 * Run with `npm test`.
 */
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AFTER, AGI, ROUND, RUN, makeTermWorld } from "./lib/termWorld.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const w = await makeTermWorld("__surveysHub");
const reportsPage = (await w.loadTs(join("app", "(app)", "admin", "(admin-only)", "reports", "page.tsx"))).default;
const hubWords = await w.loadTs(join("lib", "surveys", "hub", "words.ts"));
const { hubTabOf, hubTabHref } = await w.loadTs(join("lib", "surveys", "hub", "tabs.ts"));
const model = await w.loadTs(join("lib", "surveys", "hub", "model.ts"));

/** The clock, set to `at` for one test: Date only. */
function clock(t, at = AFTER) {
  t.mock.timers.enable({ apis: ["Date"], now: at });
}

const at = (iso) => new Date(iso);

/** Everybody but an admin, and how a failure names them. */
const NOT_ADMINS = [
  ["sue", "SU-recognised committee"],
  ["iris", "an event's organiser, committee the SU does not recognise"],
  ["claudia", "AGI Strategy's lead"],
  ["rahul", "a facilitator of one of its groups"],
  ["amara", "a member holding a place"],
];

/** A secret of a link's shape, made from what the row is. */
const tokenOf = (...parts) => parts.join("_").replace(/[^A-Za-z0-9_-]/g, "").padEnd(43, "x").slice(0, 43);

/** One person's row on a survey, as the send route leaves one: `who` is a uid, or `g_<signupId>` for a guest. */
function row(surveyId, who, answered, sentAt) {
  const respondent = who.startsWith("g_") ? { kind: "guest", signupId: who.slice(2) } : { kind: "account", uid: who };
  return {
    [`surveyPeople/${surveyId}__${who}`]: {
      surveyId,
      roundId: ROUND,
      respondent,
      token: tokenOf(surveyId, who),
      pressId: "p1",
      sentAt: at(sentAt),
      delivery: "sent",
      remindedAt: null,
      reminders: 0,
      answered,
      consents: {},
      consentsAt: null,
      blanks: null,
      blanksPresses: [],
    },
  };
}

/** A survey document of this world's kind, the rest as the routes leave one. */
function survey(over) {
  return {
    privacy: "confidential",
    intro: "",
    items: [],
    minutes: 2,
    pairOf: null,
    strand: null,
    closedAt: null,
    namesOffOn: "2028-12-09",
    namesOffAt: null,
    tests: {},
    testToken: null,
    reached: 0,
    createdByUid: "zach",
    updatedAt: at("2026-10-28T09:00:00Z"),
    ...over,
  };
}

/** The earlier programme's form, which has gone. */
const SPRING = "spring-2026__k1tterm0";

/** The term's world, with who each survey went to and the surveys the term's world leaves out. */
function seed() {
  return w.seed({
    ...Object.assign(
      {},
      ...["amara", "bea", "dev", "rahul"].map((uid) => row("s-before", uid, true, "2026-10-29T09:00:00Z")),
      ...["sofia", "tariq"].map((uid) => row("s-before", uid, false, "2026-10-29T09:00:00Z")),
      ...["amara", "bea", "dev", "sofia"].map((uid) => row("s-after", uid, true, "2026-12-03T09:00:00Z")),
      ...["rahul", "tariq"].map((uid) => row("s-after", uid, false, "2026-12-03T09:00:00Z")),
      ...["amara", "bea", "g_vr-gwen"].map((who) => row("s-vr", who, true, "2026-11-02T10:00:00Z")),
      ...["g_vr-dev", "g_vr-mo"].map((who) => row("s-vr", who, false, "2026-11-02T10:00:00Z")),
      row("s-leaving", "tariq", false, "2026-11-20T10:00:00Z"),
      ...["amara", "bea", "dev"].map((uid) => row("ci-agi-w2", uid, uid !== "dev", "2026-11-10T19:50:00Z")),
      ...["amara", "bea"].map((uid) => row("ci-agi-w3", uid, true, "2026-11-17T19:50:00Z")),
    ),
    // AGI Strategy's survey about leaving, open since Fri 20 Nov: it reached Tariq as Tariq left.
    "surveys/s-leaving": survey({
      kind: "leaving",
      name: "AGI Strategy: leaving",
      title: "Why you left",
      audience: { kind: "leaving", roundId: ROUND, programmeId: AGI },
      roundId: ROUND,
      programmeName: "AGI Strategy",
      programmeKind: "fellowship",
      runId: RUN.agi,
      closesAt: null,
      firstSentAt: at("2026-11-20T09:00:00Z"),
      presses: [],
      reached: 1,
      createdAt: at("2026-11-19T09:00:00Z"),
    }),
    // Two of AGI Strategy's check-ins, weeks 2 and 3 of Group B.
    "surveys/ci-agi-w2": checkInSurvey("ci-agi-w2", 2, "2026-11-10T18:00:00Z"),
    "surveys/ci-agi-w3": checkInSurvey("ci-agi-w3", 3, "2026-11-17T18:00:00Z"),
    // A before survey of an earlier term's programme, whose form has since gone.
    "surveys/s-spring": survey({
      kind: "before",
      name: "AGI Strategy: before",
      title: "Before you start",
      audience: { kind: "programme", roundId: SPRING, programmeId: AGI },
      roundId: SPRING,
      programmeName: "AGI Strategy",
      programmeKind: "fellowship",
      runId: "agi-spring-2026",
      closesAt: at("2026-03-09T23:59:00Z"),
      firstSentAt: at("2026-03-02T09:00:00Z"),
      presses: [{ id: "p9", kind: "first", at: at("2026-03-02T09:00:00Z"), count: 0 }],
      createdAt: at("2026-03-01T09:00:00Z"),
    }),
  });
}

function checkInSurvey(id, weekNumber, startsAt) {
  const ends = new Date(at(startsAt).getTime() + 2 * 60 * 60 * 1000);
  return survey({
    kind: "checkIn",
    name: `AGI Strategy: check-in, Group B, week ${weekNumber}`,
    title: `How was week ${weekNumber}?`,
    audience: { kind: "checkIn", roundId: ROUND, programmeId: AGI, groupId: "grp-b", sessionKey: `w0${weekNumber}`, weekNumber },
    programmeName: "AGI Strategy",
    programmeKind: "fellowship",
    runId: RUN.agi,
    checkIn: { groupName: "Group B", startsAt: at(startsAt), endsAt: ends },
    closesAt: new Date(ends.getTime() + 3 * 60 * 60 * 1000),
    firstSentAt: at(startsAt),
    presses: [{ id: "p1", kind: "first", at: at(startsAt), count: weekNumber === 2 ? 3 : 2 }],
    createdAt: at(startsAt),
  });
}

const programmesAs = (who) => w.page(w.pages.list, { searchParams: Promise.resolve({}) }, who);
const eventsAs = (who) => w.page(w.pages.list, { searchParams: Promise.resolve({ tab: "events" }) }, who);
const reportsAs = (who) => w.page(reportsPage, {}, who);

/** The words of one programme's card, from its heading to the next card. */
function cardText(text, title, term) {
  const start = text.indexOf(`${title} ${term}`.trim());
  assert.ok(start !== -1, `no card for ${title} ${term}:\n${text}`);
  return text.slice(start);
}

// ---------------------------------------------------------------------------
// 1. Who
// ---------------------------------------------------------------------------

describe("1. only an admin is shown either tab, or Reports", () => {
  test("everybody else, a view-as session and somebody signed out are sent to the dashboard before anything is read", async (t) => {
    clock(t);
    w.reset(seed());
    for (const [who, what] of NOT_ADMINS) {
      for (const [where, page] of [
        ["By programme", programmesAs],
        ["Events", eventsAs],
        ["Reports", reportsAs],
      ]) {
        const reads = w.world.db.stats.reads;
        const drawn = await page(who);
        assert.equal(drawn.to, "/dashboard", `${where}: ${what}`);
        assert.equal(w.world.db.stats.reads, reads, `${where}: ${what}: the page read something before sending them away`);
      }
    }
    for (const page of [programmesAs, eventsAs, reportsAs]) assert.equal((await page(null)).to, "/dashboard", "somebody signed out");
    w.world.viewAs = true;
    try {
      for (const page of [programmesAs, eventsAs, reportsAs]) assert.equal((await page("amara")).to, "/dashboard", "a view-as session is the member's");
    } finally {
      w.world.viewAs = false;
    }
  });

  test("both pages sit in the admin-only tree, whose layout is the first gate", () => {
    const layout = readFileSync(join(REPO_ROOT, "src", "app", "(app)", "admin", "(admin-only)", "layout.tsx"), "utf8");
    assert.match(layout, /await requireAdminPage\(\);/);
    for (const page of ["surveys", "reports"]) {
      const source = readFileSync(join(REPO_ROOT, "src", "app", "(app)", "admin", "(admin-only)", page, "page.tsx"), "utf8");
      const asks = source.indexOf('if (!viewer || !canRunSurveys(viewer)) redirect("/dashboard");');
      assert.ok(asks !== -1, `${page}: the page no longer asks who is reading`);
      assert.ok(source.indexOf("getAdminDb()") === -1 || asks < source.indexOf("getAdminDb()"), `${page}: the page reaches the database before it asks`);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. By programme
// ---------------------------------------------------------------------------

describe("2. By programme: the term's programmes, a row for every stage, then the earlier ones", () => {
  test("each of the term's programmes in the form's order, then the earlier programme named by what its survey kept", async (t) => {
    clock(t);
    w.reset(seed());
    const before = w.everything();
    const page = await programmesAs("zach");
    assert.equal(page.to, null);
    assert.equal(w.everything(), before, "the page wrote something");
    const { text, html } = page;
    assert.ok(
      text.startsWith(
        "Surveys Only admins make and send surveys. Leads see results for their own programme, in its Surveys tab. New survey " +
          "By programme Events Confidential We know who answered. Only admins see who said what. ",
      ),
      text.slice(0, 300),
    );
    const order = [
      "Fellowship: Technical AI Safety Autumn 2026",
      "Fellowship: AGI Strategy Autumn 2026",
      "Incubator: Research incubator Autumn 2026",
      "Fellowship: AGI Strategy Before the programme",
    ].map((heading) => text.indexOf(heading));
    assert.ok(order.every((found) => found !== -1), `a card is missing:\n${text}`);
    assert.deepEqual([...order].sort((a, b) => a - b), order, "the cards are out of order");
    // The tabs: links to the page's own address, By programme the current one.
    assert.match(html, /<a href="\/admin\/surveys" class="tab current" aria-current="page">By programme<\/a><a href="\/admin\/surveys\?tab=events" class="tab">Events<\/a>/);
  });

  test("AGI Strategy: each survey's row says when it went, how many of the people it went to answered, and when it closed", async (t) => {
    clock(t);
    w.reset(seed());
    const { text, html } = await programmesAs("zach");
    const agi = cardText(text, "Fellowship: AGI Strategy", "Autumn 2026");
    assert.ok(
      agi.startsWith(
        "Fellowship: AGI Strategy Autumn 2026 " +
          "Before the programme Sent Thu 29 Oct · 4 of 6 answered · Closed Wed 4 Nov Closed Results " +
          "Weekly check-ins Weeks 2 to 3 · 2 check-ins Every session See them " +
          "One for each session a group’s facilitator opened it at. Each opens on its results, who answered and its questions. " +
          "Week 3 · Group B · Tue 17 Nov Closed Tue 17 Nov · 2 people " +
          "Week 2 · Group B · Tue 10 Nov Closed Tue 10 Nov · 3 people " +
          "Facilitators’ reports 8 questions, from each group’s facilitators Every session Read them " +
          "At the end of the programme Sent Thu 3 Dec · 4 of 6 answered · Closed Wed 9 Dec Closed Results " +
          "Leaving a programme When someone leaves · 0 of 1 answered · No closing date Open ",
      ),
      agi.slice(0, 900),
    );
    // Each way in leads to its own page and says, to a screen reader, which survey it is.
    for (const [id, name] of [
      ["s-before", "AGI Strategy: before"],
      ["s-after", "AGI Strategy: after"],
      ["s-leaving", "AGI Strategy: leaving"],
    ]) {
      assert.ok(html.includes(`<a href="/admin/surveys/${id}/results" class="action" aria-label="Results for ${name}">Results</a>`), id);
    }
    for (const id of ["ci-agi-w2", "ci-agi-w3"]) assert.ok(html.includes(`<a href="/admin/surveys/${id}/results" class="checkInLink">`), id);
    assert.ok(
      html.includes(
        `<a href="/admin/admissions/forms/${ROUND}/programmes/${AGI}/surveys/reports" class="action" aria-label="Read them: the facilitators’ reports on Fellowship: AGI Strategy">Read them</a>`,
      ),
      "the facilitators' reports row does not lead to the programme's own page of them",
    );
    // The check-ins open in place: the summary is the whole row and holds no link.
    const summary = /<summary class="row summary">([\s\S]*?)<\/summary>/.exec(html)?.[1] ?? "";
    assert.ok(summary.includes("Weekly check-ins"), "the check-ins' row is not a disclosure");
    assert.ok(!/<a\b/.test(summary), "the check-ins' summary holds a link, so a press on it could go two places");
    // Nobody is reminded about a survey that has closed, nor about the survey about leaving.
    assert.ok(!text.includes("Remind"), "a closed survey, or the survey about leaving, offers Remind");
  });

  test("the survey at the end not sent yet is due at the last session, never scheduled; a stage nobody has made has no way in", async (t) => {
    clock(t);
    w.reset(seed());
    const { text, html } = await programmesAs("zach");
    // Technical AI Safety's run: ten taught weeks from Thu 3 Dec, two off at Christmas.
    const tais = cardText(text, "Fellowship: Technical AI Safety", "Autumn 2026");
    assert.ok(
      tais.startsWith(
        "Fellowship: Technical AI Safety Autumn 2026 " +
          "Before the programme Not sent yet " +
          "Weekly check-ins None yet Every session " +
          "Facilitators’ reports 8 questions, from each group’s facilitators Every session Read them " +
          "At the end of the programme Not sent yet · due at the last session, Thu 18 Feb Draft Edit " +
          "Leaving a programme Not open yet ",
      ),
      tais.slice(0, 600),
    );
    assert.ok(html.includes('<a href="/admin/surveys/s-tais-after/questions" class="action" aria-label="Edit Technical AI Safety: after">Edit</a>'));
    // The incubator names no run: no reports to read, and nothing can say when its end is due.
    const incubator = cardText(text, "Incubator: Research incubator", "Autumn 2026");
    assert.ok(
      incubator.startsWith(
        "Incubator: Research incubator Autumn 2026 Before the programme Not sent yet Weekly check-ins None yet Every session " +
          "At the end of the programme Not sent yet Leaving a programme Not open yet",
      ),
      incubator.slice(0, 400),
    );
    assert.ok(!/scheduled/i.test(text), "a programme survey is said to be scheduled: they are sent by hand");
  });

  test("once the survey at the end has gone out, the run's last session is not read for it", async (t) => {
    clock(t);
    w.reset(seed());
    const queried = [];
    const collection = w.world.db.collection;
    w.world.db.collection = (path) => {
      queried.push(path);
      return collection(path);
    };
    try {
      await programmesAs("zach");
    } finally {
      w.world.db.collection = collection;
    }
    // AGI Strategy's end went out; Technical AI Safety's did not, and the incubator names no run.
    assert.equal(queried.filter((path) => path === "courseGroups").length, 1, "the groups of a run whose end went out were read for its last session");
  });

  test("an earlier programme keeps its card after the term's, with the rows it has, named by what its survey kept", async (t) => {
    clock(t);
    w.reset(seed());
    const { text } = await programmesAs("zach");
    const last = text.lastIndexOf("Fellowship: AGI Strategy Before the programme");
    assert.ok(last !== -1, text);
    assert.equal(text.slice(last), "Fellowship: AGI Strategy Before the programme Sent Mon 2 Mar · 0 of 0 answered · Closed Mon 9 Mar Closed Results");
  });
});

// ---------------------------------------------------------------------------
// 3. Every survey once
// ---------------------------------------------------------------------------

describe("3. every survey is the way in of exactly one row, on exactly one tab", () => {
  test("walked from the records: a survey after an event on Events, every other one on By programme", async (t) => {
    clock(t);
    w.reset(seed());
    const [programmes, events] = await Promise.all([programmesAs("zach"), eventsAs("zach")]);
    const ids = w.surveyIds();
    assert.ok(ids.length >= 9, `the world holds only ${ids.length} surveys`);
    const waysIn = (html, id) => (html.match(new RegExp(`href="/admin/surveys/${id}/(?:results|questions)"`, "g")) ?? []).length;
    for (const id of ids) {
      const record = w.survey(id);
      const event = record.audience?.kind === "event-came" || record.audience?.kind === "event-signups";
      assert.deepEqual(
        [waysIn(programmes.html, id), waysIn(events.html, id)],
        event ? [0, 1] : [1, 0],
        `${id} (${record.kind}) is not on its one tab once`,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Events
// ---------------------------------------------------------------------------

describe("4. Events: each survey after an event, the newest event first", () => {
  test("its answers a count, never of anybody; a draft leads to its questions; nobody is reminded from here", async (t) => {
    clock(t);
    w.reset(seed());
    const { text, html } = await eventsAs("zach");
    assert.ok(
      text.endsWith(
        "By programme Events Confidential We know who answered. Only admins see who said what. Surveys after events " +
          "After the AI policy careers panel Thu 5 Nov · Not sent yet Draft Edit " +
          "After VR games night Sun 1 Nov · 3 answers · Closed Sun 8 Nov Closed Results",
      ),
      text,
    );
    assert.match(html, /<a href="\/admin\/surveys" class="tab">By programme<\/a><a href="\/admin\/surveys\?tab=events" class="tab current" aria-current="page">Events<\/a>/);
    assert.ok(html.includes('<a href="/admin/surveys/s-panel/questions" class="action" aria-label="Edit After the AI policy careers panel">Edit</a>'));
    assert.ok(html.includes('<a href="/admin/surveys/s-vr/results" class="action" aria-label="Results for After VR games night">Results</a>'));
    assert.ok(!text.includes("Remind"));
  });

  test("with none, it says how to make one", async (t) => {
    clock(t);
    const docs = seed();
    delete docs["surveys/s-vr"];
    delete docs["surveys/s-panel"];
    w.reset(docs);
    const { text } = await eventsAs("zach");
    assert.ok(text.endsWith("Surveys after events No survey after an event yet. Make one from New survey."), text);
  });

  test("a survey after an event leads back to the Events tab; every other survey to By programme", async (t) => {
    clock(t);
    w.reset(seed());
    const results = (id) => w.page(w.pages.results, { params: Promise.resolve({ surveyId: id }), searchParams: Promise.resolve({}) }, "zach");
    assert.ok((await results("s-vr")).html.includes('<a href="/admin/surveys?tab=events">Surveys</a>'));
    assert.ok((await results("s-before")).html.includes('<a href="/admin/surveys">Surveys</a>'));
  });
});

// ---------------------------------------------------------------------------
// 5. Reports
// ---------------------------------------------------------------------------

describe("5. Reports holds This term in numbers, Public numbers and Kairos", () => {
  test("a card each, by the report's own name and a line about it, each the way to its page; it reads nothing", async (t) => {
    clock(t);
    w.reset(seed());
    const reads = w.world.db.stats.reads;
    const page = await reportsAs("zach");
    assert.equal(page.to, null);
    // The session is the one read: the page reads no record of its own.
    assert.ok(w.world.db.stats.reads - reads <= 1, "Reports read a record of its own");
    assert.equal(
      page.text,
      "Reports The term’s numbers, what goes on a programme’s public page, and what goes to Kairos. For admins. " +
        "This term in numbers Each event’s check-ins and survey, how many different people came, and each programme’s before and after. Counts only, never a name. " +
        "Public numbers Pick what goes on a programme’s public page: numbers from its own surveys, each with how many answers it rests on, and only comments their writers ticked “You can quote this, without my name”. " +
        "Kairos What goes to Kairos, our funder, programme by programme: the file with names, and the report of totals.",
    );
    for (const [href, name] of [
      ["/admin/surveys/term", "This term in numbers"],
      ["/admin/surveys/public-numbers", "Public numbers"],
      ["/admin/surveys/kairos", "Kairos"],
    ]) {
      assert.ok(page.html.includes(`<a href="${href}" class="link">${name}</a>`), `${name} is not a link to ${href}`);
    }
  });

  test("Surveys no longer carries them on its head", async (t) => {
    clock(t);
    w.reset(seed());
    const { html } = await programmesAs("zach");
    for (const address of ["/admin/surveys/term", "/admin/surveys/public-numbers", "/admin/surveys/kairos"]) {
      assert.ok(!html.includes(`href="${address}"`), `the Surveys page still leads to ${address}`);
    }
  });

  test("each report's way back is to Reports", async (t) => {
    clock(t);
    w.reset(seed());
    const term = await w.view("zach");
    assert.ok(term.html.includes('<a href="/admin/reports">Reports</a>'), "This term in numbers' way back");
    for (const page of [join("surveys", "public-numbers", "page.tsx"), join("surveys", "kairos", "page.tsx")]) {
      const source = readFileSync(join(REPO_ROOT, "src", "app", "(app)", "admin", "(admin-only)", page), "utf8");
      assert.match(source, /<Link href="\/admin\/reports">/, `${page}: its way back is not to Reports`);
      assert.ok(!source.includes('<Link href="/admin/surveys">'), `${page}: its way back is still to Surveys`);
    }
  });
});

// ---------------------------------------------------------------------------
// 5b. The layout itself, on records made here
// ---------------------------------------------------------------------------

describe("5b. the layout: the follow-ups, an earlier programme on a form still there, and a survey no stage draws", () => {
  const records = w.lib.records;
  const OLDER = "summer-2026__k1tterm9";
  /** A survey record, counted. */
  const counted = (id, raw, sent = 0, answered = 0) => ({ survey: records.normalizeSurvey(id, survey(raw)), sent, answered, remind: 0 });
  const programmeSurvey = (kind, roundId, extra = {}) => ({
    kind,
    name: `AGI Strategy: ${kind}`,
    audience: kind === "followUp6" || kind === "followUp12"
      ? { kind: "followUps", roundId, programmeId: AGI, consentFrom: "s-before" }
      : { kind: "programme", roundId, programmeId: AGI },
    roundId,
    programmeName: "AGI Strategy",
    programmeKind: "fellowship",
    closesAt: at("2027-06-09T22:59:00Z"),
    firstSentAt: at("2027-06-02T09:00:00Z"),
    presses: [{ id: "p1", kind: "first", at: at("2027-06-02T09:00:00Z"), count: 4 }],
    createdAt: at("2027-06-01T09:00:00Z"),
    ...extra,
  });
  const NOW = at("2027-06-03T12:00:00Z");

  test("the follow-ups come after leaving, in their own order, on their programme's card", () => {
    const cards = model.programmeCards({
      forms: [{ roundId: ROUND, label: "Autumn 2026", programmes: [{ programmeId: AGI, title: "Fellowship: AGI Strategy", hasRun: true }] }],
      termRoundId: ROUND,
      lastDays: new Map(),
      surveys: [counted("s-12", programmeSurvey("followUp12", ROUND)), counted("s-6", programmeSurvey("followUp6", ROUND), 4, 3)],
      checkIns: [],
      now: NOW,
    });
    assert.equal(cards.length, 1);
    assert.deepEqual(
      cards[0].rows.map((row) => row.name),
      ["Before the programme", "Weekly check-ins", "Facilitators’ reports", "At the end of the programme", "Leaving a programme", "Six months on", "A year on"],
    );
    assert.equal(cards[0].rows[5].line, "Sent Wed 2 Jun · 3 of 4 answered · Closes Wed 9 Jun");
  });

  test("an earlier programme on a form still there is named as the form names it, and the most recent comes first", () => {
    const cards = model.programmeCards({
      forms: [
        { roundId: ROUND, label: "Autumn 2026", programmes: [] },
        { roundId: OLDER, label: "Summer 2026", programmes: [{ programmeId: AGI, title: "Fellowship: AGI Strategy (summer)", hasRun: false }] },
      ],
      termRoundId: ROUND,
      lastDays: new Map(),
      surveys: [
        // Listed oldest first: the order on the page is the newest first, whatever the order read.
        counted("s-gone", programmeSurvey("before", SPRING, { createdAt: at("2026-03-01T09:00:00Z"), firstSentAt: at("2026-03-02T09:00:00Z") })),
        counted("s-old", programmeSurvey("before", OLDER, { createdAt: at("2026-06-01T09:00:00Z"), firstSentAt: at("2026-06-02T09:00:00Z") })),
      ],
      checkIns: [],
      now: NOW,
    });
    assert.deepEqual(
      cards.map((card) => [card.title, card.term, card.rows.map((row) => row.key)]),
      [
        ["Fellowship: AGI Strategy (summer)", "Summer 2026", ["s-old"]],
        ["Fellowship: AGI Strategy", "", ["s-gone"]],
      ],
    );
  });

  test("a survey about leaving that has reached nobody says so, in place of 0 of 0", () => {
    const leaving = counted("s-left", {
      ...programmeSurvey("leaving", ROUND),
      audience: { kind: "leaving", roundId: ROUND, programmeId: AGI },
      closesAt: null,
      presses: [],
    });
    const cards = model.programmeCards({ forms: [], termRoundId: null, lastDays: new Map(), surveys: [leaving], checkIns: [], now: NOW });
    assert.equal(cards[0].rows[0].line, "When someone leaves · Nobody has left yet · No closing date");
  });

  test("a survey of a kind no stage draws is still a row, by its own name", () => {
    const cards = model.programmeCards({
      forms: [],
      termRoundId: null,
      lastDays: new Map(),
      // An event's kind with a programme's audience: a record no route writes, listed rather than lost.
      surveys: [counted("s-odd", programmeSurvey("event", SPRING, { name: "A stray survey" }))],
      checkIns: [],
      now: NOW,
    });
    assert.deepEqual(cards.map((card) => card.rows.map((row) => [row.name, row.link?.href])), [[["A stray survey", "/admin/surveys/s-odd/results"]]]);
  });
});

// ---------------------------------------------------------------------------
// 6. Nothing about a person, the targets and the words
// ---------------------------------------------------------------------------

describe("6. nothing about a person, every way in at least 44px, and the words", () => {
  test("neither tab nor Reports names anybody, carries an address or an account's id", async (t) => {
    clock(t);
    w.reset(seed());
    const pages = [await programmesAs("zach"), await eventsAs("zach"), await reportsAs("zach")];
    for (const { html } of pages) {
      for (const bit of ["Amara", "Okafor", "Bea", "Lindqvist", "Gwen", "Tariq", "Rahul", "Sofia", "Dev Patel", "example.com", "Example.com"]) {
        assert.ok(!html.includes(bit), `a page holds "${bit}"`);
      }
      for (const uid of ["amara", "bea", "gwen", "dev", "tariq", "rahul", "sofia"]) {
        assert.ok(!new RegExp(`\\b${uid}\\b`).test(html.replace(/ci-agi-w\d|vr-\w+/g, "")), `a page holds the account id "${uid}"`);
      }
    }
  });

  test("every way in is a target of at least 44px: the links, Remind, the check-ins' row and each check-in, and each report's card", () => {
    const hub = readFileSync(join(REPO_ROOT, "src", "features", "surveys", "admin", "surveyHub.module.css"), "utf8");
    const block = (css, selector) => new RegExp(`(?:^|\\n)${selector.replace(".", "\\.")} \\{([^}]*)\\}`).exec(css)?.[1] ?? "";
    for (const target of [".action", ".remindButton", ".seeThem", ".checkInLink"]) {
      assert.match(block(hub, target), /min-height: 2\.75rem;/, `${target} is drawn under 44px`);
    }
    // The check-ins' row is the summary of a disclosure, and a row is never under 44px.
    assert.match(block(hub, ".row"), /min-height: 3\.25rem;/);
    const reports = readFileSync(join(REPO_ROOT, "src", "features", "reports", "reports.module.css"), "utf8");
    assert.match(block(reports, ".card"), /position: relative;[\s\S]*min-height: 2\.75rem;/);
    assert.match(block(reports, ".link"), /min-height: 2\.75rem;/, "a report's name is drawn under 44px");
    assert.match(reports, /\.link::after \{\s*content: "";\s*position: absolute;\s*inset: 0;/, "a report's link no longer covers its card");
  });

  test("the words: the tabs by their addresses, the weeks, the day the end is due, and no dash or guessed pronoun", () => {
    assert.equal(hubTabOf(undefined), "programmes");
    assert.equal(hubTabOf("events"), "events");
    assert.equal(hubTabOf(["events"]), "programmes", "a repeated parameter is no tab");
    assert.equal(hubTabOf("term"), "programmes", "The term is not a tab");
    assert.equal(hubTabHref("programmes"), "/admin/surveys");
    assert.equal(hubTabHref("events"), "/admin/surveys?tab=events");
    assert.equal(hubWords.weeksWords([]), "");
    assert.equal(hubWords.weeksWords([4]), "Week 4");
    assert.equal(hubWords.weeksWords([3, 1, 2]), "Weeks 1 to 3");
    assert.equal(hubWords.dueAtLastSessionWords("Wed 9 Dec"), "due at the last session, Wed 9 Dec");
    assert.equal(hubWords.reportQuestionsWords(8), "8 questions, from each group’s facilitators");
    assert.equal(hubWords.rowLineWords(["Not sent yet", ""]), "Not sent yet");
    // A link's name for a screen reader starts with the words it shows, so a
    // person who says what they see can press it.
    for (const [label, shown] of [
      [hubWords.HUB_LABELS.results("AGI Strategy: before"), "Results"],
      [hubWords.HUB_LABELS.edit("AGI Strategy: before"), "Edit"],
      [hubWords.HUB_LABELS.remind("AGI Strategy: before"), "Remind"],
      [hubWords.HUB_LABELS.reports("Fellowship: AGI Strategy"), hubWords.HUB_WORDS.readThem],
    ]) {
      assert.ok(label.startsWith(shown), `"${label}" does not start with "${shown}"`);
    }
    for (const file of [
      join("lib", "surveys", "hub", "words.ts"),
      join("lib", "surveys", "hub", "model.ts"),
      join("lib", "reports", "words.ts"),
      join("features", "surveys", "admin", "SurveyList.tsx"),
      join("app", "(app)", "admin", "(admin-only)", "reports", "page.tsx"),
    ]) {
      const source = readFileSync(join(REPO_ROOT, "src", file), "utf8");
      assert.doesNotMatch(source, /[\u2013\u2014]/, `${file} carries a dash`);
      assert.doesNotMatch(source.replace(/^\s*(?:\/\/|\*).*$/gm, ""), /\b(?:he|she|his|her|him|hers)\b/i, `${file} guesses a pronoun`);
    }
  });
});
