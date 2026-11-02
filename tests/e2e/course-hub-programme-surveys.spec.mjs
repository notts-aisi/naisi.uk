/**
 * A programme's Surveys tab, as its lead reads it, end to end in a real
 * browser: the Overview, Before, Check-ins, End and Follow-ups, and a survey's
 * results from each.
 *
 * The world (scripts/e2e-fixtures/worlds/course-hub-term.mjs) at
 * "six-months-on": the fellowship six months past its run's last session,
 * Ada, Ben and Dan in Group A and Cleo and Eve in Group B, with what its
 * surveys would hold by then (scripts/e2e-fixtures/course-hub-programme-surveys.mjs):
 * the before survey and the survey at the end, each answered by four of the
 * five, the follow-up at 6 months answered by two of the three who ticked
 * its box, and three weeks of check-ins, each week fixed as the scheduler
 * fixes it.
 *
 * -> the admin names the run on the Settings tab -> opens the Surveys tab from
 * the programme's head: the Overview's five cards count each view, the
 * weeks' charts show the weeks with enough answers, what was unclear moves
 * between the weeks that show, and who came is the registers' count -> the
 * Before card opens Before, whose row leads to the before survey's results
 * -> Check-ins draws every week as its floors allow, newest first, and each
 * group's check-in for an admin -> End says what changed between the two
 * surveys, how it went, the facilitator line and what people wrote, and its
 * links lead to the survey at the end's results, Ratings and the anonymous
 * form's answers -> Follow-ups lists the follow-up, whose link opens its
 * results -> Facilitators' reports says none has been sent.
 *
 * ## How to run it
 *
 *   npm run e2e:browser -- --local --spec course-hub-programme-surveys
 *
 * Nothing on the journey emails anybody, so it runs against a deployed
 * target as well.
 *
 * ## The lead is the admin
 *
 * A programme's lead must be SU-recognised committee, which the harness never
 * makes, so the admin the harness is given reads the tab as its lead, as at
 * every course hub spec. What an admin sees beyond the lead (each group's
 * check-in) is checked as the admin's. Nobody else signs in: the people
 * answered before the run began, as the fixture wrote it.
 *
 * ## Where each expected word comes from
 *
 * The pages' words are restated from src/lib/surveys/words.ts,
 * src/lib/surveys/checkIns/words.ts and src/lib/courses/sessionReports/words.ts,
 * each beside its check. The numbers are worked out here from the fixture's
 * plan (`BEFORE`, `AFTER`, `FOLLOW_UP`, `CHECK_INS`), never copied from a
 * page. CHROMIUM ONLY: a green run is a regression net, never a substitute
 * for the manual Safari pass.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { assertTarget, hasAdminCredentials, loadSecrets } from "../../scripts/e2e/lib/env.mjs";
import { createStepRecorder, openBrowser, signInWithPassword, stubRecaptchaOnLoopback } from "../../scripts/e2e/lib/browser.mjs";
import { ARTIFACTS_DIR, RECAPTCHA_SKIP_REASON, fixtureDoc, markerPath, readState, stateDir, statePath } from "../../scripts/e2e-fixtures/core.mjs";
import {
  AFTER,
  BEFORE,
  CHECK_INS,
  CHECK_IN_WEEKS,
  FACILITATOR_LINE,
  FOLLOW_UP,
  QUESTIONS,
  RECAPTCHA_DEPENDENT_STEPS,
  SPEC,
  surveyDatesOf,
  surveyNameOf,
} from "../../scripts/e2e-fixtures/course-hub-programme-surveys.mjs";
import { checkInSurveyId } from "../../scripts/e2e-fixtures/course-hub-survey-admin.mjs";
import { WEEK_COUNT, londonDayLabel, sessionOf, weekDocId } from "../../scripts/e2e-fixtures/worlds/course-hub-term.mjs";

const RUN_STATE_DIR = stateDir();
const STATE_PATH = statePath(SPEC.name, RUN_STATE_DIR);
const MARKER = markerPath(SPEC.name, RUN_STATE_DIR);

/** Every locator waits at most this long. Generous: a server compiles a route on its first request. */
const WAIT_MS = 30_000;

// ---------------------------------------------------------------------------
// The pages' words, restated
// ---------------------------------------------------------------------------

/** The check-ins' floors (`TOTALS_FROM`, `COMMENTS_FROM` in src/lib/surveys/checkIns/model.ts). */
const TOTALS_FROM = 3;
const COMMENTS_FROM = 5;

const oneDecimal = (value) => (Math.round(value * 10) / 10).toFixed(1);
const share = (part, whole) => (whole > 0 ? Math.round((part * 100) / whole) : 0);
const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** `clockWords` in src/lib/surveys/words.ts: "6pm", "1:30pm", read in London. */
function clockWords(at) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${parts.minute === "00" ? "" : `:${parts.minute}`}${hour < 12 ? "am" : "pm"}`;
}

/** The programme's tabs, the Surveys tab's views and the words on them (`ProgrammeTabs`, `SurveysViews`, `LEAD_*_WORDS`). */
const WORDS = Object.freeze({
  sections: "Sections",
  surveysTab: "Surveys",
  views: "Surveys views",
  view: Object.freeze({
    overview: "Overview",
    before: "Before",
    checkIns: "Check-ins",
    reports: "Facilitators’ reports",
    end: "End",
    followUps: "Follow-ups",
  }),
  everySession: "Every session",
  answeredOf: (answers, of) => `${answers} of ${of} answered`,
  /** `answersOverWeeksWords`. */
  answersOverWeeks: (answers, weeks) => `${plural(answers, "answer", "answers")} over ${plural(weeks, "week", "weeks")}`,
  /** `sessionsReportedWords`. */
  sessionsReported: (reported, of) => `${reported} of ${plural(of, "session", "sessions")}`,
  /** `leadSurveyWhenWords`, and `cardWhenWords` its capitalised card form. */
  when: (closesAt, closed) => `${closed ? "closed" : "closes"} ${londonDayLabel(closesAt)}`,
  cardWhen: (closesAt, closed) => `${closed ? "Closed" : "Closes"} ${londonDayLabel(closesAt)}`,
  useful: "How useful was the session?",
  notShown: "not shown yet",
  /** `weeksAnswersWords`. */
  weeksAnswers: (answers) => `${answers.slice(0, -1).join(", ")}${answers.length > 1 ? " and " : ""}${answers.at(-1)} answers.`,
  dot: "A dot is a week not shown yet: a week shows shortly after every group’s check-in has closed, and from 3 answers.",
  unclearTitle: (week) => `What was unclear, week ${week}`,
  chooseWeek: "Choose a week",
  namedShare: (count, of) => `${count} · ${share(count, of)}%`,
  somethingElse: "Something else",
  unclearLine: "From the check-ins and facilitators’ reports, without names.",
  came: "Came to the session",
  cameCount: (came, of) => `${came} of ${of} came`,
  reportsWeek: (week) => `Facilitators’ reports, week ${week}`,
  noReportsOn: (week) => `No facilitator has sent a report on week ${week}.`,
  footer: "Check-ins show without names. Admins can open who said what, and every opening is recorded.",
  surveys: "This programme’s surveys",
  surveysLine: "Results show as answers come in, never with a name.",
  seeResults: "See results",
  resultsLine:
    "Totals and comments, never a name, from the first answer. Only the programme’s lead and NAISI’s admins see them; facilitators never do.",
  beforeAndNow: "Before and now",
  /** `movedWords` in src/lib/surveys/words.ts, for a question compared person by person. */
  movedAgainst: (both, against, up, same, down) =>
    `Of the ${both} who answered it both times (${against}): ${up} moved up, ${same} stayed, ${down} moved down.`,
  // The Check-ins view (`CHECK_INS_TAB_WORDS` and the words beside it).
  checkInsLine: `Every group’s check-ins together, week by week, without names. A week shows shortly after every group’s check-in that week has closed: totals from ${TOTALS_FROM} answers, comments from ${COMMENTS_FROM}.`,
  noneThisWeek: "No group opened a check-in this week.",
  tooFew: (answered, of) => `${answered} of ${of} answered. Totals show from ${TOTALS_FROM}, so nobody can be worked out.`,
  outOfFive: (value) => `${oneDecimal(value)} of 5`,
  checkInUseful: "Useful",
  checkInConfident: "Confident",
  checkInUnclear: "What was unclear",
  commentsFrom: `Comments show from ${COMMENTS_FROM} answers, so nobody can be worked out.`,
  shownOf: (shown, total) => `${shown} of ${total}`,
  groups: "Each group’s check-in",
  groupRow: (groupName, startsAt, answered, of) =>
    `${groupName} · ${londonDayLabel(startsAt)}, ${clockWords(startsAt)} · ${answered} of ${of} answered · Closed`,
  linkLabel: (action, groupName, week) => `${action}: ${groupName}, week ${week}`,
  mostUseful: "What was the most useful thing?",
  better: "What could have gone better?",
  // The End view.
  changed: "What changed",
  answeredBoth: (n) => `${n} answered both the before and the after. Only they are compared.`,
  seeBeforeAndAfter: "See before and after",
  considering: "Considering, planning or already doing it",
  stagesMoved: (up, same, down) => `${up} moved up a stage, ${same} stayed, ${down} moved down.`,
  explaining: "Explaining the case that advanced AI could be catastrophic, and the main objections",
  movedUp: (up, of) => `${up} of ${of} moved up.`,
  beliefsLine: "Beliefs are reported, never targets: the fellowship doesn’t aim to move them one way.",
  seeBeliefs: "See them at the start and the end",
  ratings: "Ratings",
  seeRatings: "See ratings",
  anonymous: "What to keep, change and drop",
  seeAnswers: "See answers",
  howItWent: "How it went",
  answers: (n) => plural(n, "answer", "answers"),
  averageOutOf: (max, n) => `Average, out of ${max} · ${plural(n, "answer", "answers")}`,
  promoter: (score, n) => `Net promoter score ${score > 0 ? `+${score}` : score}, from ${n} answers: the share at 9 or 10 less the share at 0 to 6.`,
  averagesFrom: (min, minLabel, max, maxLabel) => `Averages, from ${min} ${minLabel} to ${max} ${maxLabel}.`,
  facilitators: "Your facilitators",
  onlyYou: "Only you and admins",
  facilitatorsNote: "Your facilitators don’t see this. Pass on the gist in your own words, never fellows’ words or the numbers.",
  facilitatorCaption: (question, max, minLabel, maxLabel) =>
    `Average out of ${max}, from 1 ${minLabel} to ${max} ${maxLabel}, of “${question}” in the survey at the end. Every group’s answers together, not each facilitator’s.`,
  inTheirWords: "In their words",
  // The Facilitators' reports view (`RUN_REPORTS_WORDS`).
  reportsTitle: "Session reports",
  noReports: "No facilitator has sent a report yet.",
});

// ---------------------------------------------------------------------------
// Harness plumbing, as every course hub spec has it
// ---------------------------------------------------------------------------

let skipReasonFor = () => null;

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
  : !state?.people?.length || !state?.programmeSurveys
    ? `No programme surveys term at ${STATE_PATH}. Run: npm run e2e:browser -- --local --spec ${SPEC.name}.`
    : !hasAdminCredentials()
      ? "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are not set. Every page on this journey is an admin's, " +
        "and this harness cannot create an admin."
      : null;

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const flat = (text) => text.replace(/\s+/g, " ").trim();
const textOf = async (locator) => flat((await locator.textContent()) ?? "");
const textsOf = async (locator) => (await locator.allTextContents()).map(flat);

test("course hub: a programme's Surveys tab, as its lead reads it, six months past its end", { skip: skipReason ?? false }, async (t) => {
  const origin = baseUrl();
  const secrets = loadSecrets();
  const enc = encodeURIComponent;

  const personOf = (key) => {
    const found = state.people.find((person) => person.key === key);
    assert.ok(found, `the term has nobody called ${key}`);
    return found;
  };
  const people = ["ada", "ben", "cleo", "dan", "eve"].map(personOf);
  const groupOf = (key) => state.groups.find((group) => group.key === key);
  const ids = state.programmeSurveys;
  const dates = surveyDatesOf(state);
  const now = new Date();
  assert.ok(dates.after.closesAt < now, "the survey at the end has not closed");
  assert.ok(dates.followUp.closesAt > now, "the follow-up has closed");

  const base = `/admin/admissions/forms/${enc(state.formId)}/programmes/${enc(state.programmeId)}`;
  const surveysPath = `${base}/surveys`;
  const resultsPath = (id) => `${surveysPath}/${enc(id)}`;

  // ----- The numbers, worked out from the plan -----

  const answered = (plan) => Object.keys(plan.answers).length;
  const before = { answers: answered(BEFORE), of: BEFORE.reached.length };
  const after = { answers: answered(AFTER), of: AFTER.reached.length };
  const followUp = { answers: answered(FOLLOW_UP), of: FOLLOW_UP.reached.length };

  /** Each week of the check-ins, every group's together. */
  const weeks = new Map();
  for (let weekNumber = 1; weekNumber <= WEEK_COUNT; weekNumber += 1) {
    const plans = CHECK_INS.filter((plan) => plan.weekNumber === weekNumber);
    const said = plans.flatMap((plan) => Object.values(plan.answers));
    weeks.set(weekNumber, {
      plans,
      answered: said.length,
      of: plans.reduce((sum, plan) => sum + plan.reached.length, 0),
      useful: said.length > 0 ? mean(said.map((each) => each.useful)) : null,
      confident: said.length > 0 ? mean(said.map((each) => each.confident)) : null,
      somethingElse: said.filter((each) => each.unclear === "o_ci_else").length,
      most: said.map((each) => each.most).sort((a, b) => a.localeCompare(b, "en-GB")),
      better: said.flatMap((each) => (each.better ? [each.better] : [])).sort((a, b) => a.localeCompare(b, "en-GB")),
    });
  }
  const stateOf = (week) =>
    week.plans.length === 0 ? "none" : week.answered < TOTALS_FROM ? "too-few" : "shown";
  const shownWeeks = [...weeks].filter(([, week]) => stateOf(week) === "shown").map(([n]) => n);
  const countedWeeks = [...weeks].filter(([, week]) => stateOf(week) !== "none").map(([n]) => n);
  assert.deepEqual(shownWeeks, [1, 2], "the plan no longer shows weeks 1 and 2");
  assert.deepEqual(countedWeeks, CHECK_IN_WEEKS, "the plan's weeks of check-ins are not the ones it says");
  assert.equal(weeks.get(1).answered, COMMENTS_FROM, "week 1 does not have exactly enough answers for its comments");

  // What changed: the people who answered both, by C1's stage and C4.
  const stageOf = (optionId) => Number(optionId.replace("o_stage", ""));
  const both = Object.keys(AFTER.answers).filter((key) => key in BEFORE.answers);
  const stages = both.map((key) => [stageOf(BEFORE.answers[key].c1), stageOf(AFTER.answers[key].c1)]);
  const considering = { start: stages.filter(([was]) => was >= 2).length, end: stages.filter(([, now]) => now >= 2).length };
  const moved = {
    up: stages.filter(([was, now]) => now > was).length,
    same: stages.filter(([was, now]) => now === was).length,
    down: stages.filter(([was, now]) => now < was).length,
  };
  const c4 = both.map((key) => [BEFORE.answers[key].c4, AFTER.answers[key].c4]);
  const explaining = { before: mean(c4.map(([was]) => was)), after: mean(c4.map(([, now]) => now)), up: c4.filter(([was, now]) => now > was).length };

  // How it went.
  const afterSaid = Object.values(AFTER.answers);
  const q1 = afterSaid.map((each) => each.q1);
  const promoter = Math.round(((q1.filter((v) => v >= 9).length - q1.filter((v) => v <= 6).length) / q1.length) * 100);
  const facilitatorMean = mean(afterSaid.map((each) => each.q2[FACILITATOR_LINE]));
  const negative = afterSaid.flatMap((each) => (each.a5 ? [each.a5] : [])).sort((a, b) => a.localeCompare(b, "en-GB"));

  // ----- The browser -----

  const { browser, context, page } = await openBrowser();
  const recorder = createStepRecorder({ t, page, markerPath: MARKER, artifactsDir: ARTIFACTS_DIR, skipReasonFor: (name) => skipReasonFor(name) });
  const step = (name, fn) => recorder.step(name, fn);

  const recaptchaStubbed = await stubRecaptchaOnLoopback(page, origin);
  if (!recaptchaStubbed) skipReasonFor = (name) => (RECAPTCHA_DEPENDENT_STEPS.includes(name) ? RECAPTCHA_SKIP_REASON : null);

  const responseTo = (suffix, method) =>
    page.waitForResponse((r) => new URL(r.url()).pathname.endsWith(suffix) && r.request().method() === method, { timeout: WAIT_MS });

  const main = () => page.locator("main");
  const views = () => main().getByRole("navigation", { name: WORDS.views });
  /** One of the Overview's cards, by the view it opens: a link in a list, where the row of views is not. */
  const cardTo = (href) => main().locator(`li > a[href="${href}"]`);

  /** A text names none of the term's people, by first name, full name, address or account id. */
  function assertNamesNobody(text, what) {
    for (const person of people) {
      for (const said of [person.first, person.displayName, person.email, person.uid]) {
        assert.ok(!new RegExp(`\\b${escapeRegExp(said)}\\b`).test(text), `${what} names ${person.first}`);
      }
    }
  }

  /** The row of views, with this one marked as the page on screen and every other a link to its own address. */
  async function assertViewCurrent(label) {
    await views().waitFor({ timeout: WAIT_MS });
    const current = views().locator('a[aria-current="page"]');
    assert.equal(await current.count(), 1, "the row of views marks no view, or more than one, as current");
    assert.equal(await textOf(current), label, `the row of views does not mark ${label} as current`);
    assert.deepEqual(await textsOf(views().getByRole("link")), Object.values(WORDS.view), "the row of views is not the six views in order");
  }

  /** Goes to a view by its link in the row of views, and waits for the page it names. */
  async function openView(label, segment) {
    await views().getByRole("link", { name: label, exact: true }).click();
    await page.waitForURL((url) => url.pathname === `${surveysPath}${segment}`, { timeout: WAIT_MS });
    await assertViewCurrent(label);
  }

  /** A survey's row on Before, End or Follow-ups: its name, its line and its way to its results. */
  async function assertSurveyRow(id, name, line) {
    const card = main().getByRole("region", { name: WORDS.surveys, exact: true });
    await card.waitFor({ timeout: WAIT_MS });
    assert.equal(await textOf(card.getByText(WORDS.surveysLine, { exact: true })), WORDS.surveysLine);
    const row = card.getByRole("listitem").filter({ hasText: name });
    assert.equal(await row.count(), 1, `the view does not list ${name} once`);
    assert.ok((await textOf(row)).includes(line), `${name}'s row does not say ${JSON.stringify(line)}: ${await textOf(row)}`);
    const link = row.getByRole("link", { name: WORDS.seeResults, exact: true });
    assert.equal(await link.getAttribute("href"), resultsPath(id), `${name}'s link leads somewhere else`);
    return link;
  }

  /** A survey's results under the tab: its name, the lead's line, its view current, and a question's heading. */
  async function assertResults(id, name, view, questionTitle) {
    await page.waitForURL((url) => url.pathname === resultsPath(id), { timeout: WAIT_MS });
    await main().getByRole("heading", { level: 2, name, exact: true }).waitFor({ timeout: WAIT_MS });
    await main().getByText(WORDS.resultsLine, { exact: true }).waitFor({ timeout: WAIT_MS });
    await assertViewCurrent(view);
    await main().getByRole("heading", { level: 3, name: questionTitle }).first().waitFor({ timeout: WAIT_MS });
    assertNamesNobody(await textOf(main()), `${name}'s results`);
  }

  try {
    await step("the admin names the run on the programme's Settings tab", async () => {
      await signInWithPassword(page, origin, { email: secrets.adminEmail, password: secrets.adminPassword }, { timeout: WAIT_MS });
      const form = (await fixtureDoc("admissionRounds", state.formId).get()).data();
      assert.equal(form?.programmes?.[state.programmeId]?.runId ?? null, null, "the programme already names a run");
      await page.goto(`${origin}${base}/setup`, { waitUntil: "domcontentloaded" });
      const panel = page.getByRole("region", { name: "Course run" });
      await panel.waitFor({ timeout: WAIT_MS });
      const runBox = panel.getByLabel("Run", { exact: true });
      await runBox.waitFor({ timeout: WAIT_MS });
      const [response] = await Promise.all([
        responseTo(`/programmes/${state.programmeId}/run`, "PUT"),
        runBox.selectOption({ label: `${state.runLabel} · Running` }),
      ]);
      const body = await response.json().catch(() => null);
      assert.ok(response.ok(), `naming the run answered ${response.status()}: ${JSON.stringify(body)}`);
      assert.equal(body?.panel?.runId, state.runId, "the panel names another run");
    });

    await step("the lead opens the Surveys tab from the programme's head, and its Overview counts each view without a name", async () => {
      await page.goto(`${origin}${base}/overview`, { waitUntil: "domcontentloaded" });
      const tab = page.getByRole("navigation", { name: WORDS.sections }).getByRole("link", { name: WORDS.surveysTab, exact: true });
      await tab.click();
      await page.waitForURL((url) => url.pathname === surveysPath && url.search === "", { timeout: WAIT_MS });
      await assertViewCurrent(WORDS.view.overview);

      // A card for each view: what it says, and the way to it.
      const cards = [
        [`${surveysPath}/before`, WORDS.view.before, WORDS.answeredOf(before.answers, before.of), WORDS.cardWhen(dates.before.closesAt, true)],
        [
          `${surveysPath}/check-ins`,
          WORDS.view.checkIns,
          WORDS.answersOverWeeks(countedWeeks.reduce((sum, n) => sum + weeks.get(n).answered, 0), countedWeeks.length),
          WORDS.everySession,
        ],
        // Every session of both groups was held, and nobody sent a report.
        [`${surveysPath}/reports`, WORDS.view.reports, WORDS.sessionsReported(0, state.groups.length * WEEK_COUNT), WORDS.everySession],
        [`${surveysPath}/end`, WORDS.view.end, WORDS.answeredOf(after.answers, after.of), WORDS.cardWhen(dates.after.closesAt, true)],
        [`${surveysPath}/follow-ups`, WORDS.view.followUps, WORDS.answeredOf(followUp.answers, followUp.of), WORDS.cardWhen(dates.followUp.closesAt, false)],
      ];
      for (const [href, eyebrow, figure, line] of cards) {
        const card = cardTo(href);
        await card.waitFor({ timeout: WAIT_MS });
        assert.equal(await textOf(card), flat(`${eyebrow}${figure}${line}`), `the ${eyebrow} card says something else`);
      }

      // How useful the sessions were: a column a week, a figure for a week that shows and a dot for the rest.
      const useful = main().getByRole("region", { name: new RegExp(`^${escapeRegExp(WORDS.useful)}`) });
      for (let weekNumber = 1; weekNumber <= WEEK_COUNT; weekNumber += 1) {
        const week = weeks.get(weekNumber);
        const said = shownWeeks.includes(weekNumber) ? oneDecimal(week.useful) : WORDS.notShown;
        await useful.getByText(`Week ${weekNumber}: ${said}`, { exact: true }).waitFor({ timeout: WAIT_MS });
      }
      await useful.getByText(WORDS.weeksAnswers(shownWeeks.map((n) => weeks.get(n).answered)), { exact: true }).waitFor({ timeout: WAIT_MS });
      await useful.getByText(WORDS.dot, { exact: true }).waitFor({ timeout: WAIT_MS });

      // What was unclear: the latest week that shows, then the other by its link.
      const latest = shownWeeks.at(-1);
      const unclear = main().getByRole("region", { name: WORDS.unclearTitle(latest), exact: true });
      await unclear.waitFor({ timeout: WAIT_MS });
      const unclearRow = async (weekNumber) => {
        const region = main().getByRole("region", { name: WORDS.unclearTitle(weekNumber), exact: true });
        await region.waitFor({ timeout: WAIT_MS });
        const week = weeks.get(weekNumber);
        const row = region.getByRole("listitem").filter({ hasText: WORDS.somethingElse });
        assert.equal(await textOf(row), `${WORDS.somethingElse}${WORDS.namedShare(week.somethingElse, week.answered)}`, `week ${weekNumber}'s unclear row`);
        await region.getByText(WORDS.unclearLine, { exact: true }).waitFor({ timeout: WAIT_MS });
        return region;
      };
      await unclearRow(latest);
      const chooser = unclear.getByRole("navigation", { name: WORDS.chooseWeek });
      assert.deepEqual(await textsOf(chooser.getByRole("link")), shownWeeks.map((n) => `Week ${n}`), "the weeks to choose are not the weeks that show");
      await chooser.getByRole("link", { name: `Week ${shownWeeks[0]}`, exact: true }).click();
      await page.waitForURL((url) => url.pathname === surveysPath && url.searchParams.get("week") === String(shownWeeks[0]), { timeout: WAIT_MS });
      await unclearRow(shownWeeks[0]);

      // Who came, the registers' own count: everybody in the first four weeks.
      const came = main().getByRole("region", { name: WORDS.came, exact: true });
      await came.waitFor({ timeout: WAIT_MS });
      const cameRows = await textsOf(came.getByRole("listitem"));
      for (let weekNumber = 1; weekNumber <= 4; weekNumber += 1) {
        const row = `Week ${weekNumber}${WORDS.cameCount(people.length, people.length)}`;
        assert.ok(cameRows.includes(row), `who came does not say ${JSON.stringify(row)}: ${JSON.stringify(cameRows)}`);
      }

      // The chosen week's reports: none.
      const reports = main().getByRole("region", { name: WORDS.reportsWeek(shownWeeks[0]), exact: true });
      await reports.getByText(WORDS.noReportsOn(shownWeeks[0]), { exact: true }).waitFor({ timeout: WAIT_MS });
      await main().getByText(WORDS.footer, { exact: true }).waitFor({ timeout: WAIT_MS });
      assertNamesNobody(await textOf(main()), "the Overview");
      for (const said of [...weeks.values()].flatMap((week) => week.most)) {
        assert.ok(!(await textOf(main())).includes(said), `the Overview carries somebody's words: ${JSON.stringify(said)}`);
      }
    });

    await step("the Before view lists the before survey, and its link opens its results", async () => {
      // From the Overview's Before card.
      await cardTo(`${surveysPath}/before`).click();
      await page.waitForURL((url) => url.pathname === `${surveysPath}/before`, { timeout: WAIT_MS });
      await assertViewCurrent(WORDS.view.before);
      const name = surveyNameOf(state.programmeName, "before");
      const link = await assertSurveyRow(ids.before, name, `${WORDS.answeredOf(before.answers, before.of)} · ${WORDS.when(dates.before.closesAt, true)}`);
      assertNamesNobody(await textOf(main()), "the Before view");
      await link.click();
      await assertResults(ids.before, name, WORDS.view.before, QUESTIONS.c4.title);
      // What they wrote is there, by its words and never with a name.
      for (const said of Object.values(BEFORE.answers).map((each) => each.p6)) {
        await main().getByText(said, { exact: true }).first().waitFor({ timeout: WAIT_MS });
      }
    });

    await step("the Check-ins view shows each week as its floors allow, every group together, and each group's check-in for an admin", async () => {
      await openView(WORDS.view.checkIns, "/check-ins");
      await main().getByText(WORDS.checkInsLine, { exact: true }).waitFor({ timeout: WAIT_MS });
      // Every week that has begun, newest first.
      const headings = await textsOf(main().getByRole("heading", { level: 2, name: /^Week \d+$/ }));
      assert.deepEqual(
        headings,
        Array.from({ length: WEEK_COUNT }, (_, i) => `Week ${WEEK_COUNT - i}`),
        "the weeks are not every week of the run, newest first",
      );
      for (let weekNumber = 1; weekNumber <= WEEK_COUNT; weekNumber += 1) {
        const week = weeks.get(weekNumber);
        const region = main().getByRole("region", { name: `Week ${weekNumber}`, exact: true });
        await region.waitFor({ timeout: WAIT_MS });
        const said = await textOf(region);
        const kind = stateOf(week);
        if (kind === "none") {
          assert.equal(said, `Week ${weekNumber}${WORDS.noneThisWeek}`, `week ${weekNumber} says something else`);
          continue;
        }
        if (kind === "too-few") {
          assert.ok(said.startsWith(`Week ${weekNumber}${WORDS.tooFew(week.answered, week.of)}`), `week ${weekNumber} is not too few: ${said}`);
          assert.ok(!said.includes(WORDS.checkInUseful), `week ${weekNumber} shows totals below the floor`);
        } else {
          assert.ok(said.startsWith(`Week ${weekNumber}${WORDS.answeredOf(week.answered, week.of)}`), `week ${weekNumber}'s count: ${said}`);
          const figure = async (name) => textOf(region.locator("dt", { hasText: name }).locator("xpath=following-sibling::dd[1]"));
          assert.equal(await figure(WORDS.checkInUseful), WORDS.outOfFive(week.useful), `week ${weekNumber}'s usefulness`);
          assert.equal(await figure(WORDS.checkInConfident), WORDS.outOfFive(week.confident), `week ${weekNumber}'s confidence`);
          const unclear = region.getByRole("listitem").filter({ hasText: WORDS.somethingElse });
          assert.equal(await textOf(unclear), `${WORDS.somethingElse}${WORDS.namedShare(week.somethingElse, week.answered)}`, `week ${weekNumber}'s unclear`);
          if (week.answered >= COMMENTS_FROM) {
            // Every group's comments together, in the order of their words.
            const most = region.getByRole("heading", { level: 4, name: WORDS.mostUseful });
            assert.equal(await textOf(most), `${WORDS.mostUseful} ${WORDS.shownOf(week.most.length, week.most.length)}`);
            const column = most.locator("xpath=..");
            assert.deepEqual(await textsOf(column.getByRole("listitem")), week.most, `week ${weekNumber}'s comments are not in the order of their words`);
            const better = region.getByRole("heading", { level: 4, name: WORDS.better }).locator("xpath=..");
            assert.deepEqual(await textsOf(better.getByRole("listitem")), week.better, `week ${weekNumber}'s other comments`);
          } else {
            assert.ok(said.includes(WORDS.commentsFrom), `week ${weekNumber} does not say comments wait for ${COMMENTS_FROM}`);
            for (const comment of week.most) assert.ok(!said.includes(comment), `week ${weekNumber} shows a comment below the floor`);
          }
        }
        // For an admin: each group's check-in, in the order their sessions met, each with its own pages.
        const rows = region.getByRole("listitem").filter({ has: page.getByRole("link", { name: /^Results: / }) });
        const expected = week.plans
          .map((plan) => ({ plan, group: groupOf(plan.group) }))
          .sort((a, b) => a.group.firstDateKey.localeCompare(b.group.firstDateKey));
        assert.equal(await rows.count(), expected.length, `week ${weekNumber} does not have a row for each group's check-in`);
        for (const [index, { plan, group }] of expected.entries()) {
          const row = rows.nth(index);
          const session = sessionOf(group, weekNumber);
          const own = Object.keys(plan.answers).length;
          assert.ok(
            (await textOf(row)).startsWith(WORDS.groupRow(group.name, session.startsAt, own, plan.reached.length)),
            `week ${weekNumber}'s row for ${group.name}: ${await textOf(row)}`,
          );
          const id = checkInSurveyId(state.runId, group.id, weekDocId(weekNumber));
          const results = row.getByRole("link", { name: WORDS.linkLabel("Results", group.name, weekNumber), exact: true });
          assert.equal(await results.getAttribute("href"), `/admin/surveys/${enc(id)}/results`);
          const answersLink = row.getByRole("link", { name: WORDS.linkLabel("Answers", group.name, weekNumber), exact: true });
          assert.equal(await answersLink.getAttribute("href"), `/admin/surveys/${enc(id)}/answered`);
        }
      }
      assertNamesNobody(await textOf(main()), "the Check-ins view");
    });

    await step("the End view says what changed, how it went, the facilitator line and what people wrote, and its links lead on", async () => {
      await openView(WORDS.view.end, "/end");
      const afterName = surveyNameOf(state.programmeName, "after");

      // What changed, for the people who answered both.
      const changed = main().getByRole("region", { name: WORDS.changed, exact: true });
      await changed.waitFor({ timeout: WAIT_MS });
      const changedText = await textOf(changed);
      for (const words of [
        WORDS.answeredBoth(both.length),
        `${WORDS.considering}${considering.start} → ${considering.end}of ${both.length}`,
        WORDS.stagesMoved(moved.up, moved.same, moved.down),
        `${WORDS.explaining}${oneDecimal(explaining.before)} → ${oneDecimal(explaining.after)}out of 7`,
        WORDS.movedUp(explaining.up, both.length),
      ]) {
        assert.ok(changedText.includes(words), `What changed does not say ${JSON.stringify(words)}: ${changedText}`);
      }
      const seeBoth = changed.getByRole("link", { name: WORDS.seeBeforeAndAfter, exact: true });
      assert.equal(await seeBoth.getAttribute("href"), resultsPath(ids.after));
      const beliefs = main().getByRole("region", { name: "What people think about AI", exact: true });
      await beliefs.getByText(WORDS.beliefsLine, { exact: true }).waitFor({ timeout: WAIT_MS });
      assert.equal(await beliefs.getByRole("link", { name: WORDS.seeBeliefs, exact: true }).getAttribute("href"), resultsPath(ids.after));

      // The survey at the end, then Ratings and the anonymous form's answers.
      await assertSurveyRow(ids.after, afterName, `${WORDS.answeredOf(after.answers, after.of)} · ${WORDS.when(dates.after.closesAt, true)}`);
      const card = main().getByRole("region", { name: WORDS.surveys, exact: true });
      const ratings = card.getByRole("listitem").filter({ hasText: WORDS.ratings }).getByRole("link", { name: WORDS.seeRatings, exact: true });
      assert.equal(await ratings.getAttribute("href"), `${base}/ratings`, "Ratings leads somewhere else");
      const anonymous = card.getByRole("listitem").filter({ hasText: WORDS.anonymous }).getByRole("link", { name: WORDS.seeAnswers, exact: true });
      assert.equal(await anonymous.getAttribute("href"), `${base}/anonymous-feedback`, "the anonymous form's answers lead somewhere else");

      // How it went: Q1 with its net promoter score, Q2's lines without the facilitator's, Q3.
      const how = main().getByRole("region", { name: WORDS.howItWent, exact: true });
      await how.waitFor({ timeout: WAIT_MS });
      const howText = await textOf(how);
      for (const words of [
        WORDS.answers(after.answers),
        `${QUESTIONS.q1.title}${oneDecimal(mean(q1))}${WORDS.averageOutOf(10, q1.length)}`,
        WORDS.promoter(promoter, q1.length),
        WORDS.averagesFrom(1, QUESTIONS.q2.minLabel, 5, QUESTIONS.q2.maxLabel),
        `Sessions${oneDecimal(mean(afterSaid.map((each) => each.q2.l_sessions)))}`,
        `${QUESTIONS.q3.title}${oneDecimal(mean(afterSaid.map((each) => each.q3)))}`,
      ]) {
        assert.ok(howText.includes(words), `How it went does not say ${JSON.stringify(words)}: ${howText}`);
      }
      assert.ok(!howText.includes("Facilitator"), "How it went draws the facilitator line beside the others");

      // The facilitator line, for the lead and admins alone.
      const line = main().getByRole("region", { name: WORDS.facilitators, exact: true });
      const lineText = await textOf(line);
      for (const words of [
        WORDS.onlyYou,
        WORDS.facilitatorsNote,
        `Facilitator${oneDecimal(facilitatorMean)}${WORDS.answers(after.answers)}`,
        WORDS.facilitatorCaption(QUESTIONS.q2.title, 5, QUESTIONS.q2.minLabel, QUESTIONS.q2.maxLabel),
      ]) {
        assert.ok(lineText.includes(words), `Your facilitators does not say ${JSON.stringify(words)}: ${lineText}`);
      }

      // What people wrote, in the order of their words.
      const words = main().getByRole("region", { name: WORDS.inTheirWords, exact: true });
      const column = words.getByRole("heading", { level: 3, name: QUESTIONS.a5.title, exact: true }).locator("xpath=../..");
      assert.deepEqual(await textsOf(column.getByRole("listitem")), negative, "the comments are not in the order of their words");
      assertNamesNobody(await textOf(main()), "the End view");

      // Its link to the survey at the end's results, with before and now.
      await seeBoth.click();
      await assertResults(ids.after, afterName, WORDS.view.end, QUESTIONS.c1.title);
      // C1 compared person by person with the before survey, as What changed counted it.
      const stage = main().getByRole("region", { name: `1. ${QUESTIONS.c1.title}`, exact: true });
      await stage.getByText(WORDS.beforeAndNow, { exact: true }).waitFor({ timeout: WAIT_MS });
      await stage
        .getByText(WORDS.movedAgainst(both.length, surveyNameOf(state.programmeName, "before"), moved.up, moved.same, moved.down), { exact: true })
        .waitFor({ timeout: WAIT_MS });
    });

    await step("the Follow-ups view lists the follow-up at 6 months, and its link opens its results", async () => {
      await openView(WORDS.view.followUps, "/follow-ups");
      const name = surveyNameOf(state.programmeName, "followUp6");
      const link = await assertSurveyRow(ids.followUp, name, `${WORDS.answeredOf(followUp.answers, followUp.of)} · ${WORDS.when(dates.followUp.closesAt, false)}`);
      assertNamesNobody(await textOf(main()), "the Follow-ups view");
      await link.click();
      await assertResults(ids.followUp, name, WORDS.view.followUps, QUESTIONS.f1.title);
      for (const said of Object.values(FOLLOW_UP.answers).flatMap((each) => (each.f7 ? [each.f7] : []))) {
        await main().getByText(said, { exact: true }).first().waitFor({ timeout: WAIT_MS });
      }
    });

    await step("the Facilitators' reports view says no facilitator has sent one", async () => {
      await openView(WORDS.view.reports, "/reports");
      await main().getByRole("heading", { level: 2, name: WORDS.reportsTitle, exact: true }).waitFor({ timeout: WAIT_MS });
      await main().getByText(WORDS.noReports, { exact: true }).waitFor({ timeout: WAIT_MS });
    });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
    recorder.writeMarker();
  }
});
