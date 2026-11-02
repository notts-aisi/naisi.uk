/**
 * The admins' side of surveys, end to end in a real browser: Reports, Make a
 * chart of a survey and of a programme's check-ins, the first downloads of a
 * chart, and a question set changed, used and put back.
 *
 * The world (scripts/e2e-fixtures/worlds/course-hub-term.mjs) at "week-three":
 * the fellowship three weeks into its run, Ada and Ben in Group A and Cleo in
 * Group B, with the survey records the weeks since would have left
 * (scripts/e2e-fixtures/course-hub-survey-admin.mjs): the programme's before
 * survey answered by all three, and the check-ins of weeks 1 and 2 answered
 * in both groups.
 *
 * -> the admin opens Reports from the menu, opens This term in numbers,
 * Public numbers and Kairos through it, each lighting Reports and leading
 * back -> makes a chart of the before survey's second question, split by
 * group, and downloads the picture and the numbers, neither naming anybody
 * -> opens a check-in's own chart, goes from it to every check-in of the
 * programme, average by week, split by group, and downloads both -> names
 * the running run on the programme's Settings tab -> changes the first
 * question of the end of a programme's question set and saves it -> makes the
 * programme's survey at the end, which starts with the new words -> puts the
 * words back, and the survey already made keeps the new ones.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-survey-admin
 *
 * Nothing on the journey emails anybody, so it runs against a deployed
 * target as well.
 *
 * ## Where each expected word comes from
 *
 * The pages' words are restated from src/lib/surveys/chartWords.ts,
 * src/lib/surveys/questionSets.ts, src/lib/reports/words.ts and the words
 * files beside them, each beside its check. The numbers are worked out here
 * from the fixture's plan (`BEFORE_SURVEY`, `CHECK_INS`), never copied from a
 * page, and the groups' order from the world's own restatement of the one
 * order a run's groups are listed in.
 *
 * ## One identity
 *
 * The admin, the account the harness is given. Nobody else signs in: the
 * people answered before the run began, as the fixture wrote it. CHROMIUM
 * ONLY: a green run is a regression net, never a substitute for the manual
 * Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import {
  ARTIFACTS_DIR,
  RECAPTCHA_SKIP_REASON,
  fixtureDoc,
  fixtureQuery,
  markerPath,
  readState,
  stateDir,
  statePath,
  surveyQuestionSetDoc,
} from "../../scripts/e2e-fixtures/core.mjs";
import {
  BEFORE_SURVEY,
  CHECK_INS,
  CHECK_IN_IDS,
  RECAPTCHA_DEPENDENT_STEPS,
  SPEC,
  beforeSurveyName,
  checkInSurveyId,
} from "../../scripts/e2e-fixtures/course-hub-survey-admin.mjs";
import { compareGroupsByMeeting, londonDateKey, shiftDateKey, weekDocId, WEEK_COUNT } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

/** How often a poll asks again. */
const POLL_MS = 500;

// ---------------------------------------------------------------------------
// The pages' words, restated
// ---------------------------------------------------------------------------

/** Run NAISI › Reports and the three reports it holds (`REPORTS_WORDS`, `TERM_WORDS`, `PUBLIC_NUMBERS_WORDS`, `KAIROS_FILE_WORDS`). */
const REPORTS = Object.freeze({
  menu: "Reports",
  title: "Reports",
  lede: "The term’s numbers, what goes on a programme’s public page, and what goes to Kairos. For admins.",
  each: Object.freeze([
    Object.freeze({ title: "This term in numbers", href: "/admin/surveys/term" }),
    Object.freeze({ title: "Public numbers", href: "/admin/surveys/public-numbers" }),
    Object.freeze({ title: "Kairos", href: "/admin/surveys/kairos" }),
  ]),
});

/** Make a chart (`MAKE_CHART_WORDS`, `chartHeadingWords`, `showWords`, `chartAnswersWords`, `checkInsTitleWords`, `checkInsLineWords`). */
const CHART = Object.freeze({
  tab: "Make a chart",
  title: "Make a chart",
  question: "Question",
  show: "Show",
  splitBy: "Split by",
  who: "Who",
  splitNone: "Nothing, one chart",
  splitGroup: "Group, one chart each",
  downloadChart: "Download the chart",
  downloadNumbers: "Download the numbers",
  note: "The chart and its numbers name nobody, so downloading them isn’t recorded.",
  everyCheckIn: "Chart every check-in of this programme",
  everySession: "Every session",
  everyone: "Everyone who answered",
  answers: (n) => `${n} ${n === 1 ? "answer" : "answers"}`,
  checkInsTitle: (programme) => `${programme} check-ins`,
  weeksLine: (first, last, n) => `${first === last ? `Week ${first}` : `Weeks ${first} to ${last}`} · ${n} ${n === 1 ? "answer" : "answers"}`,
  /** `chartFileWords`: the picture's and the numbers' name, with no ending. */
  file: (name, day) => `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "survey"}-chart-${day}`,
  /** `barSaidWords`: what a screen reader says of one week's column. */
  said: (label, figure, n) => (figure ? `${label}: ${figure}, from ${n} ${n === 1 ? "answer" : "answers"}` : `${label}: no answers`),
});

/** The numbers' columns (`CHART_FILE_WORDS`). */
const FILE = Object.freeze({
  head: ["Survey", "Question", "Showing", "Who", "Answers counted"],
  group: "Group",
  week: "Week",
  average: "Average",
  from: "From answers",
  answer: "Answer",
  count: "Count",
  of: "Of",
  share: "Share",
});

/** Run NAISI › Surveys › Question sets, and one set's page (`QUESTION_SET_WORDS`, `QUESTION_SETS`). */
const SETS = Object.freeze({
  tab: "Question sets",
  editLabel: (name) => `Edit the questions for ${name}`,
  after: "End of a programme",
  wordsOnly: "Only the words change here. Each question keeps its kind, its answers and its place, so answers still compare.",
  reaches: "A change reaches surveys made after it, never one already made.",
  questionBox: "The question",
  original: "The original:",
  save: "Save",
  saved: "Saved. Surveys made from now on start with these.",
});

/** New survey's card for the survey at the end (`STAGE_WORDS.after`), and the record it makes. */
const AFTER = Object.freeze({
  card: "At the end of the programme",
  name: (programme) => `${programme}: after`,
  title: "At the end",
  /** The first question of the template, `C1`, whose words the spec changes. */
  firstId: "q_c1",
});

/** The new words the admin gives the end of a programme's first question: the run's id keeps them its own. */
const newWordsFor = (runId) => `Looking back, where would you say you are now? (harness run ${runId})`;

// ---------------------------------------------------------------------------
// Harness plumbing, as every course hub spec has it
// ---------------------------------------------------------------------------

let skipReasonFor = () => null;
const DEPLOYED_TARGET_SKIP = RECAPTCHA_SKIP_REASON;

function loadState() {
  return readState(SPEC.name, RUN_STATE_DIR);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch {
    return null;
  }
}

function baseUrl() {
  return assertTarget(process.env.E2E_TARGET ?? "https://dev.naisi.uk");
}

const state = loadState();
const playwright = await loadPlaywright();

const skipReason = !playwright
  ? "Playwright is not installed. Run: npm install --no-save playwright && npx playwright install chromium"
  : !state?.people?.length || !state?.surveyAdmin
    ? `No survey admin term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every page on this journey is an admin's, " +
        "and this harness cannot create an admin."
      : null;

async function waitFor(what, predicate, { timeout = WAIT_MS } = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const answer = await predicate();
    if (answer) return answer;
    if (Date.now() > deadline) throw new Error(`Timed out after ${timeout}ms waiting for ${what}.`);
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flat = (text) => text.replace(/\s+/g, " ").trim();
const textOf = async (locator) => flat((await locator.textContent()) ?? "");
const textsOf = async (locator) => (await locator.allTextContents()).map(flat);
const instantOf = (value) => (value && typeof value.toDate === "function" ? value.toDate() : null);

/** One CSV cell as `escapeCsvCell` in src/lib/csv.ts writes it. */
function cell(v) {
  const s = v == null ? "" : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `\t${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
const csvOf = (header, rows) => [header, ...rows].map((row) => row.map(cell).join(",")).join("\n");

/** `chartNumbersCsv`: the head, a blank line, the table. */
const numbersFile = (head, header, rows) => `${csvOf(FILE.head, [head])}\n\n${csvOf(header, rows)}\n`;

test(
  "course hub: the admins' side of surveys, Reports, Make a chart and its downloads, and a question set changed and put back",
  { skip: skipReason ?? false },
  async (t) => {
    const origin = baseUrl();
    const secrets = loadSecrets();
    const enc = encodeURIComponent;

    const personOf = (key) => {
      const found = state.people.find((person) => person.key === key);
      assert.ok(found, `the term has nobody called ${key}`);
      return found;
    };
    const people = ["ada", "ben", "cleo"].map(personOf);
    const everybody = [...people, ...(state.facilitator ? [state.facilitator] : [])];
    const groupOf = (key) => state.groups.find((group) => group.key === key);
    // The one order a run's groups are listed in, which every chart and its numbers keep.
    const groupsInOrder = [...state.groups].sort(compareGroupsByMeeting);

    const beforeId = state.surveyAdmin.beforeSurveyId;
    const beforeName = beforeSurveyName(state.programmeName);
    const firstCheckIn = CHECK_INS[0];
    const firstCheckInId = checkInSurveyId(state.runId, groupOf(firstCheckIn.group).id, weekDocId(firstCheckIn.weekNumber));
    const formBase = `${origin}/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
    const checkInsChartPath = `/admin/surveys/check-ins/${enc(state.formId)}/${enc(state.programmeId)}/chart`;
    const newWords = newWordsFor(state.termRunId);

    const { browser, context, page: adminPage } = await openBrowser();
    const recorder = createStepRecorder({
      t,
      page: adminPage,
      markerPath: MARKER,
      artifactsDir: ARTIFACTS_DIR,
      skipReasonFor: (name) => skipReasonFor(name),
    });
    const step = (name, fn) => recorder.step(name, fn);

    const recaptchaStubbed = await stubRecaptchaOnLoopback(adminPage, origin);
    if (!recaptchaStubbed) {
      skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? DEPLOYED_TARGET_SKIP : null);
    }

    const responseTo = (pg, suffix, method) =>
      pg.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, {
        timeout: WAIT_MS,
      });

    async function okBody(response, what) {
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `${what} answered ${response.status()}: ${JSON.stringify(body)}`);
      return body;
    }

    async function whenEnabled(locator, what) {
      await locator.waitFor({ timeout: WAIT_MS });
      await waitFor(`${what} to be live`, async () => locator.isEnabled());
      return locator;
    }

    const main = () => adminPage.locator("main");
    const mainText = async () => textOf(main());
    /** The sidebar's Reports entry, by its words, in the menu the desktop draws. */
    const reportsEntry = () => adminPage.getByRole("navigation", { name: "Main" }).getByRole("link", { name: REPORTS.menu, exact: true });

    /** A text names none of the term's people, by first name, full name, address or account id. */
    function assertNamesNobody(text, what) {
      for (const account of everybody) {
        for (const said of [account.first, account.displayName, account.email, account.uid]) {
          assert.ok(!new RegExp(`\\b${escapeRegExp(said)}\\b`).test(text), `${what} names ${account.first}`);
        }
      }
    }

    /** The answers people wrote in words, none of which a chart or its numbers may carry. */
    const comments = [
      ...Object.values(BEFORE_SURVEY.answers).map((said) => said.hope),
      ...CHECK_INS.flatMap((plan) => Object.values(plan.answers).map((said) => said.most)),
    ];
    function assertNoComment(text, what) {
      for (const said of comments) assert.ok(!text.includes(said), `${what} carries somebody's words: ${JSON.stringify(said)}`);
    }

    /** No survey route recorded an opening or a download for these surveys: a chart reads no name. */
    async function assertNothingRecorded(surveyIds, what) {
      for (const id of surveyIds) {
        assert.equal((await fixtureQuery("recordOpenings").where("surveyId", "==", id).get()).size, 0, `${what} recorded an opening`);
        assert.equal((await fixtureQuery("dataExports").where("scope.surveyId", "==", id).get()).size, 0, `${what} recorded a download`);
      }
    }

    /**
     * Both downloads under a chart: the picture, drawn in the browser, and the
     * numbers, from the route. Each by Playwright's download event, held to
     * its name, and read back to prove it names nobody.
     */
    async function downloadBoth(fileStem, fileRoute, what) {
      const today = londonDateKey(new Date());
      const days = [today, shiftDateKey(today, -1)];
      const named = (name, ending) => days.some((day) => name === `${CHART.file(fileStem, day)}.${ending}`);

      const pictureButton = await whenEnabled(main().getByRole("button", { name: CHART.downloadChart, exact: true }), CHART.downloadChart);
      const [picture] = await Promise.all([adminPage.waitForEvent("download", { timeout: WAIT_MS }), pictureButton.click()]);
      const pictureName = picture.suggestedFilename();
      assert.ok(named(pictureName, "png"), `${what}'s picture is called ${JSON.stringify(pictureName)}`);
      const png = readFileSync(await picture.path());
      assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], `${what}'s picture is not a PNG`);
      assert.ok(png.length > 1000, `${what}'s picture is ${png.length} bytes, too small to hold a chart`);
      assertNamesNobody(png.toString("latin1"), `${what}'s picture`);

      const numbersLink = main().getByRole("link", { name: CHART.downloadNumbers, exact: true });
      const href = await numbersLink.getAttribute("href");
      assert.ok(href?.startsWith(`${fileRoute}?`), `${what}'s numbers lead to ${JSON.stringify(href)}`);
      const [numbers] = await Promise.all([adminPage.waitForEvent("download", { timeout: WAIT_MS }), numbersLink.click()]);
      const numbersName = numbers.suggestedFilename();
      assert.ok(named(numbersName, "csv"), `${what}'s numbers are called ${JSON.stringify(numbersName)}`);
      const csv = readFileSync(await numbers.path(), "utf8");
      assertNamesNobody(csv, `${what}'s numbers`);
      assertNoComment(csv, `${what}'s numbers`);
      assert.ok(!csv.includes("@"), `${what}'s numbers carry an address`);
      return { href, csv };
    }

    /** One chart's panel, by its group's name: the section its heading names. */
    const panelOf = (name) => main().getByRole("region", { name, exact: true });

    try {
      await step("the admin opens Reports from the menu, and each of its three reports leads back to it", async () => {
        await signInWithPassword(adminPage, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
        const entry = reportsEntry();
        await entry.waitFor({ timeout: WAIT_MS });
        assert.equal(await entry.getAttribute("href"), "/admin/reports", "the menu's Reports leads elsewhere");
        await entry.click();
        await adminPage.waitForURL(`${origin}/admin/reports`, { timeout: WAIT_MS });
        await main().getByRole("heading", { level: 1, name: REPORTS.title, exact: true }).waitFor({ timeout: WAIT_MS });
        assert.ok((await mainText()).includes(REPORTS.lede), "Reports does not say what it holds");
        await waitFor("Reports to be lit in the menu", async () => (await reportsEntry().getAttribute("aria-current")) === "page");
        // Its three cards, by their names, in order, each a link to its report.
        const cards = main().getByRole("heading", { level: 2 });
        assert.deepEqual(await textsOf(cards), REPORTS.each.map((report) => report.title), "Reports' cards");
        for (const report of REPORTS.each) {
          const link = main().getByRole("link", { name: report.title, exact: true });
          assert.equal(await link.getAttribute("href"), report.href, `${report.title} leads elsewhere`);
          await link.click();
          await adminPage.waitForURL(`${origin}${report.href}`, { timeout: WAIT_MS });
          await main().getByRole("heading", { level: 1, name: report.title, exact: true }).waitFor({ timeout: WAIT_MS });
          // The menu lights Reports on each report, and the report's head leads back to it.
          await waitFor(`Reports to be lit on ${report.title}`, async () => (await reportsEntry().getAttribute("aria-current")) === "page");
          const back = main().getByRole("link", { name: REPORTS.title, exact: true });
          assert.equal(await back.getAttribute("href"), "/admin/reports", `${report.title}'s head does not lead back to Reports`);
          await back.click();
          await adminPage.waitForURL(`${origin}/admin/reports`, { timeout: WAIT_MS });
          await main().getByRole("heading", { level: 1, name: REPORTS.title, exact: true }).waitFor({ timeout: WAIT_MS });
        }
      });

      await step("the admin makes a chart of a survey's answers, split by group, and downloads the picture and the numbers, which name nobody", async () => {
        const { ready, heard } = BEFORE_SURVEY;
        // From the survey's Results to its Make a chart tab.
        await adminPage.goto(`${origin}/admin/surveys/${enc(beforeId)}/results`, { waitUntil: "domcontentloaded" });
        await main().getByRole("heading", { level: 1, name: beforeName, exact: true }).waitFor({ timeout: WAIT_MS });
        await main().getByRole("navigation", { name: "Survey sections" }).getByRole("link", { name: CHART.tab, exact: true }).click();
        await adminPage.waitForURL(`${origin}/admin/surveys/${enc(beforeId)}/chart`, { timeout: WAIT_MS });
        await main().getByRole("heading", { level: 2, name: CHART.title, exact: true }).waitFor({ timeout: WAIT_MS });

        // The questions that draw as bars, by their numbers: the short answer is a comment, never charted.
        const questionBox = main().getByLabel(CHART.question, { exact: true });
        assert.deepEqual(
          await textsOf(questionBox.locator("option")),
          [`1. ${ready.title}`, `2. ${heard.title}`],
          "the questions a chart can be made of",
        );
        assert.equal(await questionBox.inputValue(), ready.id, "the chart does not open on the first question");
        // Who offers everybody and each group someone answered in, with how many.
        const answeredIn = (key) => Object.keys(BEFORE_SURVEY.answers).filter((person) => personOf(person).groupKey === key).length;
        const total = Object.keys(BEFORE_SURVEY.answers).length;
        assert.deepEqual(
          await textsOf(main().getByLabel(CHART.who, { exact: true }).locator("option")),
          [`${CHART.everyone} (${total})`, ...groupsInOrder.map((group) => `${group.name} (${answeredIn(group.key)})`)],
          "Who's choices",
        );

        // The second question, then a chart a group: each choice asks for the page again.
        await Promise.all([
          adminPage.waitForURL((url) => url.searchParams.get("question") === heard.id, { timeout: WAIT_MS }),
          questionBox.selectOption(heard.id),
        ]);
        const splitBox = main().getByLabel(CHART.splitBy, { exact: true });
        assert.deepEqual(await textsOf(splitBox.locator("option")), [CHART.splitNone, CHART.splitGroup], "Split by's choices");
        await Promise.all([
          adminPage.waitForURL((url) => url.searchParams.get("split") === "group" && url.searchParams.get("question") === heard.id, { timeout: WAIT_MS }),
          splitBox.selectOption("group"),
        ]);
        await main().getByRole("heading", { level: 2, name: "Counts, by group", exact: true }).waitFor({ timeout: WAIT_MS });
        assert.ok((await mainText()).includes(heard.title), "the chart does not say its question");

        // One chart a group, in the run's order, each counting its own people's answers.
        const counted = (key, optionId) =>
          Object.entries(BEFORE_SURVEY.answers).filter(([person, said]) => personOf(person).groupKey === key && said.heard === optionId).length;
        const rows = [];
        for (const group of groupsInOrder) {
          const panel = panelOf(group.name);
          await panel.waitFor({ timeout: WAIT_MS });
          const n = answeredIn(group.key);
          assert.ok((await textOf(panel)).includes(CHART.answers(n)), `${group.name}'s chart does not say it counts ${n}`);
          const bars = panel.getByRole("listitem");
          assert.deepEqual(
            await textsOf(bars),
            heard.options.map((option) => `${option.label}${counted(group.key, option.id)}`),
            `${group.name}'s bars`,
          );
          for (const option of heard.options) {
            const count = counted(group.key, option.id);
            rows.push([group.name, option.label, count, n, `${Math.round((count / n) * 100)}%`]);
          }
        }
        const pageText = await mainText();
        assertNamesNobody(pageText, "the survey's chart");
        assertNoComment(pageText, "the survey's chart");
        assert.ok(pageText.includes(CHART.note), "the chart does not say its downloads are not recorded");

        // Both downloads: the picture, and the numbers the route builds for the same choices.
        const { href, csv } = await downloadBoth(beforeName, `/api/surveys/${enc(beforeId)}/chart`, "the survey's chart");
        const asked = new URL(href, origin).searchParams;
        assert.deepEqual([asked.get("question"), asked.get("show"), asked.get("split")], [heard.id, "counts", "group"], "the numbers' link asks for another chart");
        assert.equal(
          csv,
          numbersFile(
            [beforeName, heard.title, "Counts, by group", CHART.everyone, total],
            [FILE.group, FILE.answer, FILE.count, FILE.of, FILE.share],
            rows,
          ),
          "the survey chart's numbers",
        );
        await assertNothingRecorded([beforeId], "the survey's chart");
      });

      await step("the admin charts a programme's check-ins, by week and by group, from one of them, and downloads the picture and the numbers, which name nobody", async () => {
        // A check-in's own chart leads to every check-in of its programme.
        await adminPage.goto(`${origin}/admin/surveys/${enc(firstCheckInId)}/chart`, { waitUntil: "domcontentloaded" });
        const every = main().getByRole("link", { name: CHART.everyCheckIn, exact: true });
        await every.waitFor({ timeout: WAIT_MS });
        await every.click();
        await adminPage.waitForURL(`${origin}${checkInsChartPath}`, { timeout: WAIT_MS });
        const title = CHART.checkInsTitle(state.programmeName);
        await main().getByRole("heading", { level: 1, name: title, exact: true }).waitFor({ timeout: WAIT_MS });

        // The plan's figures: who answered each group's check-in in each week, and how useful they found it.
        const answered = (key, week) =>
          CHECK_INS.filter((plan) => plan.group === key && plan.weekNumber === week).flatMap((plan) => Object.values(plan.answers));
        const weeksAt = [...new Set(CHECK_INS.map((plan) => plan.weekNumber))].sort((a, b) => a - b);
        const total = CHECK_INS.reduce((sum, plan) => sum + Object.keys(plan.answers).length, 0);
        const head = await textOf(main().locator("header").first());
        assert.ok(head.includes(CHART.everySession), "the head does not say the check-ins come round at every session");
        assert.ok(head.includes(CHART.weeksLine(weeksAt[0], weeksAt.at(-1), total)), `the head does not say the weeks and the answers: ${head}`);

        // It opens on how useful the sessions were, on average by week, a chart a group.
        assert.equal(await main().getByLabel(CHART.question, { exact: true }).inputValue(), CHECK_IN_IDS.useful, "the chart opens on another question");
        assert.equal(await main().getByLabel(CHART.show, { exact: true }).inputValue(), "average", "the chart opens on another figure");
        assert.equal(await main().getByLabel(CHART.splitBy, { exact: true }).inputValue(), "group", "the chart does not open split by group");
        await main().getByRole("heading", { level: 2, name: "Average by week, by group", exact: true }).waitFor({ timeout: WAIT_MS });
        // Who offers everybody and each group, by how many answered in it.
        const inGroup = (key) => CHECK_INS.filter((plan) => plan.group === key).reduce((sum, plan) => sum + Object.keys(plan.answers).length, 0);
        assert.deepEqual(
          await textsOf(main().getByLabel(CHART.who, { exact: true }).locator("option")),
          [`${CHART.everyone} (${total})`, ...groupsInOrder.map((group) => `${group.name} (${inGroup(group.key)})`)],
          "Who's choices",
        );

        // One chart a group, a column a taught week, each average from its own answers.
        const rows = [];
        for (const group of groupsInOrder) {
          const panel = panelOf(group.name);
          await panel.waitFor({ timeout: WAIT_MS });
          assert.ok((await textOf(panel)).includes(CHART.answers(inGroup(group.key))), `${group.name}'s chart does not say how many it counts`);
          const said = [];
          for (let week = 1; week <= WEEK_COUNT; week += 1) {
            const values = answered(group.key, week).map((answer) => answer.useful);
            const figure = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "";
            said.push(CHART.said(`Week ${week}`, figure, values.length));
            rows.push([group.name, `Week ${week}`, figure, values.length]);
          }
          const columns = await textsOf(panel.getByRole("listitem"));
          for (const [at, words] of said.entries()) {
            assert.ok(columns[at]?.startsWith(words), `${group.name}'s week ${at + 1} column says ${JSON.stringify(columns[at])}, not ${JSON.stringify(words)}`);
          }
          assert.equal(columns.length, WEEK_COUNT, `${group.name}'s chart has ${columns.length} columns`);
        }
        const pageText = await mainText();
        assertNamesNobody(pageText, "the check-ins' chart");
        assertNoComment(pageText, "the check-ins' chart");

        const { href, csv } = await downloadBoth(title, `/api/surveys/check-ins/${enc(state.formId)}/${enc(state.programmeId)}/chart`, "the check-ins' chart");
        const asked = new URL(href, origin).searchParams;
        assert.deepEqual([asked.get("question"), asked.get("show"), asked.get("split")], [CHECK_IN_IDS.useful, "average", "group"], "the numbers' link asks for another chart");
        assert.equal(
          csv,
          numbersFile(
            [title, "How useful was today’s session?", "Average by week, by group", CHART.everyone, total],
            [FILE.group, FILE.week, FILE.average, FILE.from],
            rows,
          ),
          "the check-ins chart's numbers",
        );
        await assertNothingRecorded(state.surveyAdmin.checkInIds, "the check-ins' chart");
      });

      await step("the admin names the running course run on the programme's Settings tab", async () => {
        // A survey is made only for a programme that names its run: nothing names one yet.
        const form = (await fixtureDoc("admissionRounds", state.formId).get()).data();
        assert.equal(form?.programmes?.[state.programmeId]?.runId ?? null, null, "the programme already names a run");
        await adminPage.goto(`${formBase}/setup`, { waitUntil: "domcontentloaded" });
        const panel = adminPage.getByRole("region", { name: "Course run" });
        await panel.waitFor({ timeout: WAIT_MS });
        const runBox = panel.getByLabel("Run", { exact: true });
        await runBox.waitFor({ timeout: WAIT_MS });
        const [response] = await Promise.all([
          responseTo(adminPage, `/programmes/${state.programmeId}/run`, "PUT"),
          runBox.selectOption({ label: `${state.runLabel} · Running` }),
        ]);
        const body = await okBody(response, "Naming the run");
        assert.equal(body.changed, true, "naming the run changed nothing");
        assert.equal(body.panel?.runId, state.runId, "the panel names another run");
      });

      let was = null;
      await step("the admin changes the words of the end of a programme's question set and saves them", async () => {
        // From Run NAISI › Surveys, its Question sets tab, to the set's own page.
        await adminPage.goto(`${origin}/admin/surveys`, { waitUntil: "domcontentloaded" });
        await main().getByRole("link", { name: SETS.tab, exact: true }).click();
        await adminPage.waitForURL((url) => url.pathname === "/admin/surveys" && url.searchParams.get("tab") === "question-sets", { timeout: WAIT_MS });
        await main().getByRole("link", { name: SETS.editLabel(SETS.after), exact: true }).click();
        await adminPage.waitForURL(`${origin}/admin/surveys/question-sets/after`, { timeout: WAIT_MS });
        await main().getByRole("heading", { level: 1, name: SETS.after, exact: true }).waitFor({ timeout: WAIT_MS });
        const text = await mainText();
        assert.ok(text.includes(SETS.wordsOnly) && text.includes(SETS.reaches), "the set's page does not say what a change does");

        const first = main().getByRole("group", { name: /^Question 1\b/ });
        const box = first.getByLabel(SETS.questionBox, { exact: true });
        await whenEnabled(box, "the first question's words");
        was = await box.inputValue();
        assert.ok(was.length > 0, "the first question has no words to change");
        await box.fill(newWords);
        // The original shows under a word that differs from it.
        await first.getByText(SETS.original, { exact: false }).waitFor({ timeout: WAIT_MS });
        const save = await whenEnabled(main().getByRole("button", { name: SETS.save, exact: true }), SETS.save);
        const [response] = await Promise.all([responseTo(adminPage, "/api/surveys/question-sets/after", "PUT"), save.click()]);
        await okBody(response, "Saving the question set");
        await main().getByRole("status").filter({ hasText: SETS.saved }).waitFor({ timeout: WAIT_MS });

        // The set holds the new words at the first question's place, saved by the admin.
        const kept = (await surveyQuestionSetDoc().get()).data();
        assert.equal(kept?.kind, "after", "the set saved is another kind's");
        assert.equal(kept?.words?.[`${AFTER.firstId}:title`], newWords, "the set does not hold the new words at the first question");
        assert.equal(kept?.updatedByUid, state.adminUid, "the set does not name the admin who changed it");
        // And the page shows them after a reload.
        await adminPage.reload({ waitUntil: "domcontentloaded" });
        await whenEnabled(main().getByRole("group", { name: /^Question 1\b/ }).getByLabel(SETS.questionBox, { exact: true }), "the first question's words");
        assert.equal(
          await main().getByRole("group", { name: /^Question 1\b/ }).getByLabel(SETS.questionBox, { exact: true }).inputValue(),
          newWords,
          "the set's page after a reload",
        );
      });

      let afterId = null;
      await step("a survey at the end made from it now starts with the new words", async () => {
        assert.ok(was, "the words were never changed");
        await adminPage.goto(`${origin}/admin/surveys/new`, { waitUntil: "domcontentloaded" });
        const card = main().getByRole("region", { name: AFTER.card, exact: true });
        await card.waitFor({ timeout: WAIT_MS });
        await card.getByLabel("Programme", { exact: true }).selectOption({ label: `${state.programmeName} (${state.formLabel})` });
        const closesOn = shiftDateKey(londonDateKey(new Date()), 7);
        await card.getByLabel("It closes on", { exact: true }).fill(closesOn);
        const make = await whenEnabled(card.getByRole("button", { name: "Make the survey", exact: true }), "Make the survey");
        const [request, response] = await Promise.all([
          adminPage.waitForRequest((r) => new URL(r.url()).pathname === "/api/surveys" && r.method() === "POST", { timeout: WAIT_MS }),
          responseTo(adminPage, "/api/surveys", "POST"),
          make.click(),
        ]);
        assert.deepEqual(
          request.postDataJSON(),
          { roundId: state.formId, programmeId: state.programmeId, stage: "after", closesOn, strand: null },
          "Make the survey sent something else",
        );
        const body = await okBody(response, "Making the survey");
        afterId = body.survey?.id;
        assert.ok(afterId, "making the survey answered no survey");
        await adminPage.waitForURL(`${origin}/admin/surveys/${enc(afterId)}/questions`, { timeout: WAIT_MS });
        await main().getByRole("heading", { level: 1, name: AFTER.name(state.programmeName), exact: true }).waitFor({ timeout: WAIT_MS });

        // The record: the end of the programme's survey, paired with the before survey, its first question in the new words.
        const made = (await fixtureDoc("surveys", afterId).get()).data();
        assert.deepEqual(
          { kind: made.kind, title: made.title, runId: made.runId, pairOf: made.pairOf, firstSentAt: made.firstSentAt },
          { kind: "after", title: AFTER.title, runId: state.runId, pairOf: beforeId, firstSentAt: null },
          "the survey as made",
        );
        const questions = made.items.filter((item) => item.kind === "question");
        assert.equal(questions[0]?.id, AFTER.firstId, "the survey's first question is not the template's");
        assert.equal(questions[0]?.title, newWords, "the survey's first question is not in the set's new words");
        // And its Questions tab shows them.
        await whenEnabled(main().getByRole("button", { name: "Save", exact: true }), "Save");
        assert.equal(await main().getByLabel("Question 1", { exact: true }).inputValue(), newWords, "the editor's first question");
        assert.ok(instantOf(made.closesAt), "the survey has no closing day");
      });

      await step("the admin puts the words back, and the survey already made keeps the new ones", async () => {
        assert.ok(was && afterId, "there is nothing to put back");
        await adminPage.goto(`${origin}/admin/surveys/question-sets/after`, { waitUntil: "domcontentloaded" });
        const box = main().getByRole("group", { name: /^Question 1\b/ }).getByLabel(SETS.questionBox, { exact: true });
        await whenEnabled(box, "the first question's words");
        assert.equal(await box.inputValue(), newWords, "the set's page lost the new words");
        await box.fill(was);
        const save = await whenEnabled(main().getByRole("button", { name: SETS.save, exact: true }), SETS.save);
        const [response] = await Promise.all([responseTo(adminPage, "/api/surveys/question-sets/after", "PUT"), save.click()]);
        await okBody(response, "Saving the question set");
        await main().getByRole("status").filter({ hasText: SETS.saved }).waitFor({ timeout: WAIT_MS });

        // The set says what it said before the run: gone again if it was not there, the same words if it was.
        const now = await surveyQuestionSetDoc().get();
        if (!state.questionSet.existed) {
          assert.equal(now.exists, false, "putting the code's words back left a set behind");
        } else {
          assert.deepEqual(now.data()?.words ?? {}, state.questionSetBefore?.words ?? {}, "the set's words are not what they were before the run");
        }
        // The survey already made keeps the words it was made with.
        const made = (await fixtureDoc("surveys", afterId).get()).data();
        assert.equal(made.items.find((item) => item.id === AFTER.firstId)?.title, newWords, "putting the words back reached a survey already made");
        await adminPage.goto(`${origin}/admin/surveys/${enc(afterId)}/questions`, { waitUntil: "domcontentloaded" });
        await whenEnabled(main().getByRole("button", { name: "Save", exact: true }), "Save");
        assert.equal(await main().getByLabel("Question 1", { exact: true }).inputValue(), newWords, "the survey's editor after the words went back");
      });
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      recorder.writeMarker();
    }
  },
);
